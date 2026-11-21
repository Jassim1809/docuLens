import { z } from "zod";
import { env } from "../config/env.js";
import { getGeminiChatModel } from "./gemini.js";

const GeminiRerankSchema = z.object({
  ranked: z.array(
    z.object({
      index: z.number().int().describe("0-based index of the candidate excerpt."),
      score: z.number().min(0).max(1).describe("Relevance score from 0.0 to 1.0."),
    })
  ),
});

async function rerankWithCohere(query, candidates, topN) {
  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.COHERE_RERANK_MODEL,
      query,
      top_n: Math.min(topN, candidates.length),
      documents: candidates.map((c) => c.text),
    }),
  });

  if (!res.ok) {
    throw new Error(`Cohere rerank HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return (data.results || [])
    .map((item, rankIdx) => {
      const original = candidates[item.index];
      if (!original) return null;
      return {
        ...original,
        rerankRank: rankIdx + 1,
        rerankScore: Number((item.relevance_score || 0).toFixed(4)),
      };
    })
    .filter(Boolean);
}

async function rerankWithGemini(query, candidates, topN) {
  const ranker = getGeminiChatModel().withStructuredOutput(GeminiRerankSchema);
  const formatted = candidates
    .map((c, idx) => `[${idx}] (${c.fileName}, p.${c.pageNumber}): ${c.text.slice(0, 600)}`)
    .join("\n\n");

  const result = await ranker.invoke([
    [
      "system",
      `You are a precision document reranker. Given a user query and numbered excerpts, return the top ${topN} most relevant excerpts ordered from most to least relevant, with a relevance score from 0.0 to 1.0.`,
    ],
    ["human", `QUERY: ${query}\n\nEXCERPTS:\n${formatted}`],
  ]);

  const seen = new Set();
  const reranked = [];

  for (const item of result.ranked || []) {
    if (seen.has(item.index) || item.index < 0 || item.index >= candidates.length) continue;
    seen.add(item.index);
    reranked.push({
      ...candidates[item.index],
      rerankRank: reranked.length + 1,
      rerankScore: Number(item.score.toFixed(4)),
    });
    if (reranked.length >= topN) break;
  }

  return reranked.length > 0 ? reranked : candidates.slice(0, topN);
}

export async function rerankCandidates({ query, candidates, topN = env.RERANK_TOP_N }) {
  const start = Date.now();

  if (!candidates || candidates.length === 0) {
    return { results: [], usedReranker: false, model: "none", latencyMs: 0 };
  }

  if (!env.ENABLE_RERANKER) {
    return {
      results: candidates.slice(0, topN),
      usedReranker: false,
      model: "disabled",
      latencyMs: Date.now() - start,
    };
  }

  try {
    if (env.RERANKER_PROVIDER === "cohere" && env.COHERE_API_KEY) {
      const results = await rerankWithCohere(query, candidates, topN);
      return {
        results,
        usedReranker: true,
        model: env.COHERE_RERANK_MODEL,
        latencyMs: Date.now() - start,
      };
    }

    const results = await rerankWithGemini(query, candidates, topN);
    return {
      results,
      usedReranker: true,
      model: `gemini-rerank (${env.GEMINI_CHAT_MODEL})`,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    console.warn("[Reranker] Failed, falling back to RRF order:", err.message);
    return {
      results: candidates.slice(0, topN),
      usedReranker: false,
      model: "fallback-rrf",
      fallbackReason: err.message,
      latencyMs: Date.now() - start,
    };
  }
}
