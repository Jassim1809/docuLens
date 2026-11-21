import { toSql } from "pgvector";
import { env } from "../config/env.js";
import { pool } from "./db.js";

/**
 * Native PostgreSQL Hybrid Search:
 *  1. Dense Semantic Search via pgvector HNSW cosine distance (<=>)
 *  2. Lexical Full-Text Search via Postgres tsvector + GIN index (ts_rank_cd)
 *  3. Reciprocal Rank Fusion (RRF)
 */

const STOP_WORDS = new Set([
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "of", "to", "in", "for", "with", "by", "as", "be", "this", "that", "it", "from", "are", "was", "were", "what", "how", "does", "do",
]);

function buildOrTsQuery(text) {
  const tokens = (text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  if (!tokens) return "";
  const filtered = [...new Set(tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t)))];
  return filtered.join(" | ");
}

export function reciprocalRankFusion(denseHits, ftsHits, k = 60, topK = 25) {
  const merged = new Map();

  denseHits.forEach((hit, idx) => {
    merged.set(hit.id, {
      ...hit,
      denseRank: idx + 1,
      ftsRank: null,
      rrfScore: 1 / (k + idx + 1),
    });
  });

  ftsHits.forEach((hit, idx) => {
    const existing = merged.get(hit.id);
    const addScore = 1 / (k + idx + 1);
    if (existing) {
      existing.ftsRank = idx + 1;
      existing.ftsScore = hit.ftsScore;
      existing.rrfScore += addScore;
    } else {
      merged.set(hit.id, {
        ...hit,
        denseScore: null,
        denseRank: null,
        ftsRank: idx + 1,
        rrfScore: addScore,
      });
    }
  });

  return Array.from(merged.values())
    .map((item) => ({ ...item, rrfScore: Number(item.rrfScore.toFixed(6)) }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, topK);
}

export async function runHybridSearch({
  query,
  queryVector,
  workspaceId = "default",
  docIds = null,
  topK = env.HYBRID_TOP_K,
  mode = "hybrid",
}) {
  const start = Date.now();
  const docFilter = Array.isArray(docIds) && docIds.length > 0 ? docIds : null;

  let denseHits = [];
  let ftsHits = [];
  const tasks = [];

  if (mode === "hybrid" || mode === "dense") {
    tasks.push(
      (async () => {
        const { rows } = await pool.query(
          `SELECT
             id,
             doc_id AS "docId",
             file_name AS "fileName",
             page_number AS "pageNumber",
             chunk_index AS "chunkIndex",
             content AS "text",
             1 - (embedding <=> $1::vector) AS "denseScore"
           FROM document_chunks
           WHERE workspace_id = $2
             AND ($3::text[] IS NULL OR doc_id = ANY($3::text[]))
           ORDER BY embedding <=> $1::vector
           LIMIT $4`,
          [toSql(queryVector), workspaceId, docFilter, topK]
        );

        denseHits = rows.map((r) => ({
          ...r,
          denseScore: Number(Number(r.denseScore || 0).toFixed(4)),
        }));
      })()
    );
  }

  if (mode === "hybrid" || mode === "fts") {
    tasks.push(
      (async () => {
        const orQuery = buildOrTsQuery(query);
        if (!orQuery) return;

        const { rows } = await pool.query(
          `SELECT
             id,
             doc_id AS "docId",
             file_name AS "fileName",
             page_number AS "pageNumber",
             chunk_index AS "chunkIndex",
             content AS "text",
             ts_rank_cd(tsv, to_tsquery('english', $1)) AS "ftsScore"
           FROM document_chunks
           WHERE workspace_id = $2
             AND ($3::text[] IS NULL OR doc_id = ANY($3::text[]))
             AND tsv @@ to_tsquery('english', $1)
           ORDER BY "ftsScore" DESC
           LIMIT $4`,
          [orQuery, workspaceId, docFilter, topK]
        );

        ftsHits = rows.map((r) => ({
          ...r,
          ftsScore: Number(Number(r.ftsScore || 0).toFixed(4)),
        }));
      })()
    );
  }

  await Promise.all(tasks);

  let results;
  if (mode === "dense") {
    results = denseHits.map((h, i) => ({ ...h, denseRank: i + 1, ftsRank: null, rrfScore: h.denseScore }));
  } else if (mode === "fts") {
    results = ftsHits.map((h, i) => ({ ...h, denseRank: null, ftsRank: i + 1, rrfScore: h.ftsScore }));
  } else {
    results = reciprocalRankFusion(denseHits, ftsHits, 60, topK);
  }

  return {
    results,
    stats: {
      mode,
      denseCount: denseHits.length,
      ftsCount: ftsHits.length,
      fusedCount: results.length,
      latencyMs: Date.now() - start,
    },
  };
}
