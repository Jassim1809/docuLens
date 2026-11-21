import crypto from "node:crypto";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
});

pool.on("error", (err) => {
  console.error("[Postgres Pool Error]", err.message);
});

export async function checkDbHealth() {
  const res = await pool.query("SELECT 1 AS ok");
  return res.rows[0]?.ok === 1;
}

export async function listDocuments(workspaceId = "default") {
  const { rows } = await pool.query(
    `SELECT
       doc_id AS "docId",
       workspace_id AS "workspaceId",
       file_name AS "fileName",
       num_pages AS "numPages",
       chunk_count AS "chunkCount",
       size_bytes AS "sizeBytes",
       uploaded_at AS "uploadedAt"
     FROM documents
     WHERE workspace_id = $1
     ORDER BY uploaded_at DESC`,
    [workspaceId]
  );
  return rows;
}

export async function getDocSetHash(workspaceId = "default", filterDocIds = null) {
  const hasFilter = Array.isArray(filterDocIds) && filterDocIds.length > 0;
  const { rows } = await pool.query(
    `SELECT doc_id
     FROM documents
     WHERE workspace_id = $1
       AND ($2::text[] IS NULL OR doc_id = ANY($2::text[]))
     ORDER BY doc_id ASC`,
    [workspaceId, hasFilter ? filterDocIds : null]
  );

  const joined = rows.map((r) => r.doc_id).join("|");
  return crypto.createHash("sha256").update(joined).digest("hex").slice(0, 16);
}

export async function deleteDocument(workspaceId, docId) {
  const { rows } = await pool.query(
    `DELETE FROM documents
     WHERE workspace_id = $1 AND doc_id = $2
     RETURNING
       doc_id AS "docId",
       file_name AS "fileName",
       chunk_count AS "chunkCount"`,
    [workspaceId, docId]
  );
  return rows[0] || null;
}
