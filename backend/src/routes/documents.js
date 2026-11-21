import { Router } from "express";
import { pdfUploadMiddleware, verifyPdfMagicBytes } from "../middleware/upload.js";
import { ingestPdfBuffer } from "../services/pdfIngestion.js";
import { listDocuments, deleteDocument, getDocSetHash } from "../services/db.js";

const router = Router();

router.post("/upload", pdfUploadMiddleware.array("files", 5), async (req, res, next) => {
  try {
    const workspaceId = (req.body.workspaceId || "default").trim();
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded. Use form field name "files".' });
    }

    const results = [];
    for (const file of uploadedFiles) {
      if (!verifyPdfMagicBytes(file.buffer)) {
        return res.status(400).json({
          error: `File "${file.originalname}" is not a valid PDF (failed magic-byte check).`,
        });
      }

      const ingested = await ingestPdfBuffer({
        buffer: file.buffer,
        fileName: file.originalname,
        workspaceId,
      });
      results.push(ingested);
    }

    res.status(201).json({
      workspaceId,
      uploadedCount: results.length,
      docSetHash: await getDocSetHash(workspaceId),
      results,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const workspaceId = (req.query.workspaceId || "default").toString();
    const [documents, docSetHash] = await Promise.all([
      listDocuments(workspaceId),
      getDocSetHash(workspaceId),
    ]);
    res.json({
      workspaceId,
      count: documents.length,
      docSetHash,
      documents,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:docId", async (req, res, next) => {
  try {
    const workspaceId = (req.query.workspaceId || "default").toString();
    const { docId } = req.params;

    const deleted = await deleteDocument(workspaceId, docId);
    if (!deleted) {
      return res.status(404).json({ error: `Document ${docId} not found in workspace ${workspaceId}.` });
    }

    res.json({
      deleted,
      docSetHash: await getDocSetHash(workspaceId),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
