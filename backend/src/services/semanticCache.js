import crypto from "node:crypto";
import { toSql } from "pgvector";
import { env } from "../config/env.js";
import { pool } from "./db.js";

export async function lookupSemanticCache({ queryVector, workspaceId, docSetHash }) {
  if (!env.ENABLE_SEMANTIC_CACHE) {
    return { hit: false, reason: "disabled" };
  }

  const start = Date.now();
  try {
    const { rows } = await pool.query(
      `SELECT
         id,
         payload,
         created_at,
         1 - (embedding <=> $1::vector) AS similarity
       FROM semantic_cache
       WHERE workspace_id = $2
         AND doc_set_hash = $3
       ORDER BY embedding <=> $1::vector
       LIMIT 1`,
      [toSql(queryVector), workspaceId, docSetHash]
    );

    const match = rows[0];
    if (!match) {
      return { hit: false, latencyMs: Date.now() - start };
    }

    const ageMs = Date.now() - new Date(match.created_at).getTime();
    const isFresh = ageMs <= env.CACHE_TTL_MS;
    const similarity = Number(Number(match.similarity || 0).toFixed(4));

    if (similarity >= env.CACHE_SIMILARITY_THRESHOLD && isFresh) {
      return {
        hit: true,
        similarity,
        ageMs,
        latencyMs: Date.now() - start,
        cachedPayload: match.payload,
      };
    }

    return {
      hit: false,
      closestSimilarity: similarity,
      expired: !isFresh,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    console.warn("[SemanticCache] Lookup failed:", err.message);
    return { hit: false, error: err.message, latencyMs: Date.now() - start };
  }
}

export async function writeSemanticCache({ query, queryVector, workspaceId, docSetHash, payload }) {
  if (!env.ENABLE_SEMANTIC_CACHE) return;

  try {
    const id = `cache_${crypto
      .createHash("sha256")
      .update(`${workspaceId}:${docSetHash}:${query}`)
      .digest("hex")
      .slice(0, 20)}`;

    await pool.query(
      `INSERT INTO semantic_cache (id, workspace_id, doc_set_hash, query, payload, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector, NOW())
       ON CONFLICT (id) DO UPDATE SET
         payload = EXCLUDED.payload,
         embedding = EXCLUDED.embedding,
         created_at = NOW()`,
      [id, workspaceId, docSetHash, query.slice(0, 500), JSON.stringify(payload), toSql(queryVector)]
    );
  } catch (err) {
    console.warn("[SemanticCache] Write failed:", err.message);
  }
}

export async function clearSemanticCache(workspaceId = "default") {
  await pool.query("DELETE FROM semantic_cache WHERE workspace_id = $1", [workspaceId]);
}
