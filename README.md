# docuLens

**docuLens** is a multi-document Retrieval-Augmented Generation (RAG) workbench built for grounded question answering and real-time retrieval observability. Upload PDFs into isolated workspaces, query them over Server-Sent Events (SSE), and inspect every stage of the pipeline—from semantic cache hits and hybrid search fusion to reranking scores and verbatim page-level citations.

## Live Deployment

* **Frontend (Vercel):** https://docu-lens-bay.vercel.app/
* **Backend API (Render):** https://doculens-backend-ejri.onrender.com/
* **Health Check:** https://doculens-backend-ejri.onrender.com/api/health
* **Database:** Neon PostgreSQL (`pgvector`)

*(Note: The Render free-tier backend may take 30–50 seconds to wake up on the first request after inactivity.)*

---

## Features

* **Hybrid Search with RRF:** Combines dense vector search (`pgvector`) and PostgreSQL Full-Text Search (`tsvector`) via Reciprocal Rank Fusion, with per-query toggles for `Hybrid`, `Dense`, and `FTS` modes.
* **Semantic Caching & Auto-Invalidation:** Caches query embeddings and responses in PostgreSQL using cosine similarity. Each workspace tracks a deterministic `docSetHash` so uploading or deleting a PDF automatically invalidates stale cache entries.
* **Pluggable Reranking:** Re-scores fused candidate chunks via Gemini (default) or Cohere to improve top-K retrieval precision.
* **Grounded Citations & Abstention:** Enforces page-level citations with expandable verbatim quotes and abstains (`Not Found in Docs`) when supporting evidence is missing.
* **Resilient Atomic PDF Ingestion:** Preserves per-page metadata, strips invalid UTF-8 null bytes (`0x00`), control characters, and lone surrogates, embeds chunks in safe batches with retry fallback, and commits documents and chunks atomically.
* **Real-Time SSE Streaming & RAG Inspector:** Streams live pipeline progress and visualizes latency waterfalls, cache similarity scores, retrieval funnel counts, and top chunk rankings in a 3-pane React workbench.

---

## Tech Stack

* **Frontend:** React (Vite), Tailwind CSS, `lucide-react`, Fetch `ReadableStream` SSE client
* **Backend:** Node.js, Express.js, Zod, Multer, `pdf-parse`
* **AI & Retrieval:** Google Gemini (`gemini-3.5-flash-lite`, `gemini-embedding-001`), LangChain Text Splitters, Cohere (optional reranker)
* **Database:** Neon PostgreSQL with `pgvector`

---

## API Routes

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Checks API uptime, Neon PostgreSQL connection status, and active chat/embedding models. |
| `GET` | `/api/documents?workspaceId=<id>` | Lists all uploaded PDFs in a workspace along with its current `docSetHash`. |
| `POST` | `/api/documents/upload` | Accepts `multipart/form-data` (`workspaceId` + up to 5 PDF `files`). Extracts, chunks, embeds, and stores them atomically. |
| `DELETE` | `/api/documents/:docId?workspaceId=<id>` | Deletes a document, cascades its chunks, and returns the updated `docSetHash`. |
| `POST` | `/api/query/stream` | Primary SSE endpoint. Streams `status`, `telemetry`, `result`, `error`, and `done` events for a query. |
| `POST` | `/api/query` | Non-streaming JSON fallback using the same query payload and response structure. |
| `DELETE` | `/api/cache/:workspaceId` | Clears all cached semantic query entries for the given workspace. |

---

## Future Roadmap

* **Authentication & Private Workspaces:** Add JWT/OAuth user accounts so workspaces, uploaded PDFs, and chat histories persist securely per user.
* **Multi-Format & OCR Ingestion:** Support `.docx`, `.txt`, Markdown, and web URLs alongside OCR fallback for scanned image-only PDFs.
* **Interactive PDF Previewer:** Click a citation chip to open the source PDF directly on the cited page with the supporting passage highlighted.
* **Token-Level Streaming & Conversation Memory:** Stream generated answer tokens incrementally and support multi-turn follow-up questions with query contextualization.
* **Automated RAG Evaluation Suite:** Add an offline evaluation dashboard tracking Recall@K, MRR, citation faithfulness, and latency regressions across retrieval modes.
