import { Router } from "express";
import { env } from "../config/env.js";
import { checkDbHealth } from "../services/db.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const dbOk = await checkDbHealth();
    res.json({
      status: dbOk ? "ok" : "degraded",
      service: "docuLens-backend",
      database: dbOk ? "connected" : "disconnected",
      models: {
        chat: env.GEMINI_CHAT_MODEL,
        embedding: env.GEMINI_EMBEDDING_MODEL,
        embeddingDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
      },
      features: {
        hybridSearch: "pgvector (HNSW) + PostgreSQL FTS (GIN) + RRF",
        reranker: env.ENABLE_RERANKER ? env.RERANKER_PROVIDER : false,
        semanticCache: env.ENABLE_SEMANTIC_CACHE,
      },
    });
  } catch (err) {
    res.status(503).json({ status: "error", database: "disconnected", error: err.message });
  }
});

export default router;
