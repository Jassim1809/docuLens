import express from "express";
import { z } from "zod";
import { executeRagQuery } from "../services/ragPipeline.js";

const router = express.Router();

const QueryRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).default("default"),
  query: z.string().trim().min(1, "Query is required"),
  docIds: z.array(z.string().trim().min(1)).optional(),
  searchMode: z.enum(["hybrid", "dense", "fts"]).default("hybrid"),
  bypassCache: z.boolean().default(false),
  enableReranker: z.boolean().optional(),
});

/**
 * Standard JSON endpoint: POST /api/query
 */
router.post("/", async (req, res, next) => {
  try {
    console.log("[Query] Received:", req.body?.query);

    const parsed = QueryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    const result = await executeRagQuery(parsed.data);
    console.log(
      `[Query] Done in ${result.telemetry?.totalLatencyMs ?? "?"}ms | cacheHit: ${result.telemetry?.cache?.hit ?? false}`
    );

    return res.json(result);
  } catch (err) {
    console.error("[Query Error]", err);
    return next(err);
  }
});

/**
 * Server-Sent Events endpoint: POST /api/query/stream
 */
router.post("/stream", async (req, res) => {
  console.log("[Stream] Hit! Body:", JSON.stringify(req.body));

  // Validate BEFORE setting SSE headers so invalid payloads get a clean 400 JSON response
  const parsed = QueryRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  // Open SSE stream
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Prevents proxy buffering on Render/Nginx
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const sendEvent = (event, data) => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent("status", {
      stage: "retrieval",
      message: "Searching workspace documents...",
    });

    const result = await executeRagQuery(parsed.data, {
      onStatus: (statusPayload) => sendEvent("status", statusPayload),
    });

    console.log(
      `[Stream] Done in ${result.telemetry?.totalLatencyMs ?? "?"}ms | cacheHit: ${result.telemetry?.cache?.hit ?? false}`
    );

    if (result.telemetry) {
      sendEvent("telemetry", result.telemetry);
    }

    sendEvent("result", result);
    sendEvent("done", { ok: true });
  } catch (err) {
    console.error("[Stream Error]", err);
    sendEvent("error", {
      error: err?.message || "Failed to process query",
    });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

export default router;