import crypto from "crypto";
import { createRequire } from "module";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import pgvector from "pgvector";
import { env } from "../config/env.js";
import { pool, getDocSetHash } from "./db.js";
import { getGeminiEmbeddings } from "./gemini.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

const EMBED_BATCH_SIZE = 50;

function sanitizeText(text) {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/[\uD800-\uDFFF]/g, "");
}

/**
 * Extracts text page-by-page from a PDF buffer so every chunk retains its page number.
 */
export async function extractPdfPages(buffer) {
  const pages = [];
  let pageIndex = 0;

  const options = {
    pagerender: async (pageData) => {
      pageIndex += 1;
      const textContent = await pageData.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      let lastY = null;
      let pageText = "";

      for (const item of textContent.items) {
        const str = sanitizeText(item.str);
        if (lastY === item.transform[5] || lastY === null) {
          pageText += str;
        } else {
          pageText += `\n${str}`;
        }
        lastY = item.transform[5];
      }

      const cleaned = sanitizeText(pageText)
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      pages.push({
        pageNumber: pageIndex,
        text: cleaned,
      });

      return cleaned;
    },
  };

  const parsed = await pdfParse(buffer, options);

  return {
    numPages: parsed.numpages || pages.length,
    pages: pages.filter((p) => p.text.length > 0),
  };
}

/**
 * Embeds chunks in safe batches and validates that no empty vectors are returned.
 */
async function embedChunksSafely(chunks) {
  const embeddingsModel = getGeminiEmbeddings();
  const validChunks = [];
  const validVectors = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const batchVectors = await embeddingsModel.embedDocuments(
      batch.map((c) => c.content)
    );

    for (let j = 0; j < batch.length; j += 1) {
      let vec = batchVectors[j];

      // Retry individually if the batch call silently returned an empty vector
      if (!Array.isArray(vec) || vec.length === 0) {
        try {
          vec = await embeddingsModel.embedQuery(batch[j].content);
        } catch (retryErr) {
          console.warn(
            `[Ingestion] Skipping unembeddable chunk ${batch[j].id}:`,
            retryErr.message
          );
          vec = [];
        }
      }

      if (Array.isArray(vec) && vec.length > 0) {
        validChunks.push(batch[j]);
        validVectors.push(vec);
      } else {
        console.warn(`[Ingestion] Empty embedding returned for chunk ${batch[j].id}, skipping.`);
      }
    }
  }

  if (validChunks.length === 0) {
    const err = new Error(
      "Gemini returned empty embeddings for all chunks. Check GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL, or API rate limits."
    );
    err.status = 502;
    throw err;
  }

  return { validChunks, validVectors };
}

/**
 * Parses, chunks, embeds, and atomically stores a single PDF in PostgreSQL + pgvector.
 */
export async function ingestPdfBuffer({
  buffer,
  fileName,
  workspaceId = "default",
  sizeBytes,
}) {
  const startTime = Date.now();
  const safeFileName = sanitizeText(fileName || "document.pdf").trim();
  const safeWorkspaceId = sanitizeText(workspaceId || "default").trim();

  const { numPages, pages } = await extractPdfPages(buffer);

  if (!pages.length) {
    const err = new Error(
      `No extractable text found in "${safeFileName}". Scanned image-only PDFs require OCR first.`
    );
    err.status = 400;
    throw err;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: env.CHUNK_SIZE,
    chunkOverlap: env.CHUNK_OVERLAP,
  });

  const docId = `doc_${crypto.randomUUID().slice(0, 12)}`;
  const rawChunks = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const splitTexts = await splitter.splitText(page.text);
    for (const rawChunk of splitTexts) {
      const content = sanitizeText(rawChunk).trim();
      // Skip empty or punctuation/whitespace-only artifact chunks
      if (content.length < 3 || !/[a-zA-Z0-9]/.test(content)) continue;

      rawChunks.push({
        id: `${docId}_c${chunkIndex}`,
        docId,
        workspaceId: safeWorkspaceId,
        fileName: safeFileName,
        pageNumber: page.pageNumber,
        chunkIndex,
        content,
      });
      chunkIndex += 1;
    }
  }

  if (!rawChunks.length) {
    const err = new Error(`Document "${safeFileName}" produced zero valid text chunks.`);
    err.status = 400;
    throw err;
  }

  const { validChunks, validVectors } = await embedChunksSafely(rawChunks);

  const client = await pool.connect();
  let uploadedAt = new Date().toISOString();

  try {
    await client.query("BEGIN");

    const docRes = await client.query(
      `INSERT INTO documents (doc_id, workspace_id, file_name, num_pages, chunk_count, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING uploaded_at`,
      [
        docId,
        safeWorkspaceId,
        safeFileName,
        numPages,
        validChunks.length,
        sizeBytes ?? buffer.length,
      ]
    );

    if (docRes.rows[0]?.uploaded_at) {
      uploadedAt = new Date(docRes.rows[0].uploaded_at).toISOString();
    }

    for (let i = 0; i < validChunks.length; i += 1) {
      const c = validChunks[i];
      await client.query(
        `INSERT INTO document_chunks (id, doc_id, workspace_id, file_name, page_number, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
        [
          c.id,
          c.docId,
          c.workspaceId,
          c.fileName,
          c.pageNumber,
          c.chunkIndex,
          c.content,
          pgvector.toSql(validVectors[i]),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const docSetHash = await getDocSetHash(safeWorkspaceId);

  return {
    document: {
      docId,
      workspaceId: safeWorkspaceId,
      fileName: safeFileName,
      numPages,
      chunkCount: validChunks.length,
      sizeBytes: sizeBytes ?? buffer.length,
      uploadedAt,
    },
    docSetHash,
    ingestionMs: Date.now() - startTime,
  };
}

export const ingestPdf = ingestPdfBuffer;