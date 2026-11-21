import { pool } from "../src/services/db.js";
import { env } from "../src/config/env.js";

async function main() {
  const dim = env.GEMINI_EMBEDDING_DIMENSIONS;
  console.log(`Initializing PostgreSQL + pgvector schema (vector(${dim}))...`);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      doc_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      num_pages INT NOT NULL,
      chunk_count INT NOT NULL,
      size_bytes INT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
      workspace_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      page_number INT NOT NULL,
      chunk_index INT NOT NULL,
      content TEXT NOT NULL,
      embedding vector(${dim}) NOT NULL,
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chunks_workspace
    ON document_chunks (workspace_id, doc_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chunks_tsv
    ON document_chunks USING GIN (tsv);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON document_chunks USING hnsw (embedding vector_cosine_ops);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS semantic_cache (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      doc_set_hash TEXT NOT NULL,
      query TEXT NOT NULL,
      payload JSONB NOT NULL,
      embedding vector(${dim}) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cache_lookup
    ON semantic_cache (workspace_id, doc_set_hash);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cache_embedding
    ON semantic_cache USING hnsw (embedding vector_cosine_ops);
  `);

  console.log("Database schema & pgvector indexes are ready.");
  await pool.end();
}

main().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
