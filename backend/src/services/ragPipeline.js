import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";
import { env } from "../config/env.js";
import { getGeminiChatModel, getGeminiEmbeddings } from "./gemini.js";
import { getDocSetHash, listDocuments } from "./db.js";
import { lookupSemanticCache, writeSemanticCache } from "./semanticCache.js";
import { runHybridSearch } from "./hybridSearch.js";
import { rerankCandidates } from "./reranker.js";

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe("Clear, concise answer grounded ONLY in the provided PDF excerpts. Include inline references like [filename.pdf, p. 4]."),
  grounded: z
    .boolean()
    .describe("True if the provided excerpts contain enough information to answer. False if refusing due to missing info."),
  citations: z
    .array(
      z.object({
        fileName: z.string(),
        pageNumber: z.number(),
        quote: z.string().describe("Short verbatim excerpt supporting the claim."),
      })
    )
    .describe("Exact citations from the provided excerpts."),
});

const SYSTEM_PROMPT = `You are docuLens, a precise contract and policy analysis assistant.
Rules:
1. Answer ONLY using the provided PDF excerpts below. Never use outside knowledge.
2. If the excerpts do not contain enough information to answer, set grounded=false and reply: "I could not find enough information in the uploaded PDFs to answer that question."
3. Cite every key claim with exact fileName, pageNumber, and a short verbatim quote.`;

const promptTemplate = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM_PROMPT],
  ["human", "PDF EXCERPTS:\n{context}\n\nUSER QUESTION:\n{question}"],
]);

function formatContext(chunks) {
  return chunks
    .map(
      (c, i) =>
        `--- EXCERPT ${i + 1} | fileName: "${c.fileName}" | pageNumber: ${c.pageNumber} ---\n${c.text}`
    )
    .join("\n\n");
}

export async function executeRagQuery({
  query,
  workspaceId = "default",
  docIds = null,
  bypassCache = false,
  searchMode = "hybrid",
  useReranker = env.ENABLE_RERANKER,
}) {
  const totalStart = Date.now();
  const telemetry = {
    workspaceId,
    provider: "gemini + pgvector",
    cache: { hit: false },
    retrieval: {},
    reranker: {},
    generation: {},
    totalLatencyMs: 0,
  };

  const workspaceDocs = await listDocuments(workspaceId);
  if (workspaceDocs.length === 0) {
    return {
      grounded: false,
      answer: "No PDFs have been uploaded to this workspace yet. Please upload at least one PDF first.",
      citations: [],
      telemetry: { ...telemetry, totalLatencyMs: Date.now() - totalStart },
    };
  }

  const trimmedQuery = query.trim();
  const docSetHash = await getDocSetHash(workspaceId, docIds);

  // 1. Embed query with Gemini Embeddings
  const embedStart = Date.now();
  const queryVector = await getGeminiEmbeddings().embedQuery(trimmedQuery);
  telemetry.embeddingLatencyMs = Date.now() - embedStart;

  // 2. Semantic Cache Lookup (pgvector)
  if (!bypassCache) {
    const cacheRes = await lookupSemanticCache({ queryVector, workspaceId, docSetHash });
    telemetry.cache = {
      hit: cacheRes.hit,
      similarity: cacheRes.similarity ?? cacheRes.closestSimilarity ?? null,
      latencyMs: cacheRes.latencyMs,
    };

    if (cacheRes.hit && cacheRes.cachedPayload) {
      telemetry.totalLatencyMs = Date.now() - totalStart;
      return {
        ...cacheRes.cachedPayload,
        telemetry,
      };
    }
  }

  // 3. Hybrid Search (pgvector Dense + Postgres Full-Text Search + RRF)
  const hybrid = await runHybridSearch({
    query: trimmedQuery,
    queryVector,
    workspaceId,
    docIds,
    topK: env.HYBRID_TOP_K,
    mode: searchMode,
  });
  telemetry.retrieval = hybrid.stats;

  // 4. Reranking
  const reranked = useReranker
    ? await rerankCandidates({
        query: trimmedQuery,
        candidates: hybrid.results,
        topN: env.RERANK_TOP_N,
      })
    : {
        results: hybrid.results.slice(0, env.RERANK_TOP_N),
        usedReranker: false,
        model: "disabled",
        latencyMs: 0,
      };

  const topChunks = reranked.results;
  telemetry.reranker = {
    usedReranker: reranked.usedReranker,
    model: reranked.model,
    topN: topChunks.length,
    latencyMs: reranked.latencyMs,
    chunks: topChunks.map((c) => ({
      id: c.id,
      fileName: c.fileName,
      pageNumber: c.pageNumber,
      denseRank: c.denseRank ?? null,
      ftsRank: c.ftsRank ?? null,
      rrfScore: c.rrfScore ?? null,
      rerankScore: c.rerankScore ?? null,
    })),
  };

  if (topChunks.length === 0) {
    telemetry.totalLatencyMs = Date.now() - totalStart;
    return {
      grounded: false,
      answer: "I could not find any relevant passages in the selected PDFs.",
      citations: [],
      telemetry,
    };
  }

  // 5. LangChain.js LCEL Grounded Generation with Gemini
  const genStart = Date.now();
  const chain = RunnableSequence.from([
    promptTemplate,
    getGeminiChatModel().withStructuredOutput(AnswerSchema),
  ]);

  const generated = await chain.invoke({
    context: formatContext(topChunks),
    question: trimmedQuery,
  });
  telemetry.generation = {
    model: env.GEMINI_CHAT_MODEL,
    latencyMs: Date.now() - genStart,
  };

  const finalPayload = {
    grounded: generated.grounded,
    answer: generated.answer,
    citations: generated.citations || [],
  };

  // 6. Write answer to Semantic Cache
  if (!bypassCache && finalPayload.grounded) {
    await writeSemanticCache({
      query: trimmedQuery,
      queryVector,
      workspaceId,
      docSetHash,
      payload: finalPayload,
    });
  }

  telemetry.totalLatencyMs = Date.now() - totalStart;

  return {
    ...finalPayload,
    telemetry,
  };
}
