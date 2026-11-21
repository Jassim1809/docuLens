# docuLens — Standalone Multi-PDF RAG Backend (Gemini + pgvector)

A stateless Node.js + Express + LangChain.js + PostgreSQL (`pgvector`) + Google Gemini API backend designed to plug into any frontend.

## Features
- **Multi-PDF Upload & Page-Level Extraction:** Tracks exact `fileName` and `pageNumber` per chunk inside PostgreSQL.
- **Native SQL Hybrid Search:** Combines `pgvector` HNSW cosine similarity (`<=>`) with PostgreSQL `tsvector` Full-Text Search (GIN index) + Reciprocal Rank Fusion (RRF).
- **Reranking:** Gemini structured reranker by default (zero extra API keys), with optional Cohere Rerank support (`RERANKER_PROVIDER=cohere`).
- **Document-Scoped Semantic Caching:** Stores verified answers in PostgreSQL `semantic_cache` keyed by `workspaceId` and `docSetHash` (auto-invalidates when PDFs are added or deleted).
- **Live RAG Inspector Telemetry:** Every `/api/query` response returns step-by-step latency, cache hit status, retrieval ranks, and rerank scores.
- **Automated Evaluation Suite:** Run `npm run eval` against `evals/dataset.json`.

## Quick Start

```bash
# 1. Start local Postgres with pgvector (or use Neon / Supabase)
docker compose up -d

# 2. Install & configure environment
npm install
cp .env.example .env
# Add GEMINI_API_KEY and DATABASE_URL in .env

# 3. Initialize pgvector extension, tables, and HNSW/GIN indexes
npm run init:db

# 4. Start the API server
npm run dev
```

## API Endpoints

| Method & Endpoint | Description |
| :--- | :--- |
| `GET /api/health` | Health check + DB status + active models/features |
| `POST /api/documents/upload` | Upload 1–5 PDFs (`multipart/form-data`, field name `files`, optional `workspaceId`) |
| `GET /api/documents?workspaceId=default` | List uploaded PDFs + current `docSetHash` |
| `DELETE /api/documents/:docId?workspaceId=default` | Delete PDF & cascade-delete chunks/vectors |
| `POST /api/query` | Ask a question; returns `{ answer, citations, grounded, telemetry }` |
| `POST /api/query/stream` | SSE streaming endpoint (`status`, `telemetry`, `result`, `done`) |
| `DELETE /api/cache/:workspaceId` | Manually clear the workspace semantic cache |
