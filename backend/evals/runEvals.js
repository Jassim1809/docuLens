import fs from "node:fs";
import path from "node:path";
import { executeRagQuery } from "../src/services/ragPipeline.js";
import { listDocuments, pool } from "../src/services/db.js";

const WORKSPACE_ID = process.env.WORKSPACE_ID || "default";
const DATASET_PATH = path.resolve("./evals/dataset.json");
const REPORT_PATH = path.resolve("./evals/report.json");

async function main() {
  const docs = await listDocuments(WORKSPACE_ID);
  if (docs.length === 0) {
    console.error(`No PDFs found in workspace "${WORKSPACE_ID}". Upload a PDF via POST /api/documents/upload first.`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
  const results = [];

  console.log(`Running ${dataset.length} eval cases against workspace "${WORKSPACE_ID}" (${docs.length} PDF(s))...\n`);

  for (const testCase of dataset) {
    const res = await executeRagQuery({
      query: testCase.query,
      workspaceId: WORKSPACE_ID,
      bypassCache: testCase.type !== "cache_test",
    });

    const answerLower = (res.answer || "").toLowerCase();
    const matchedKeywords = testCase.expectedKeywords.filter((kw) => answerLower.includes(kw.toLowerCase()));
    const keywordRecall =
      testCase.expectedKeywords.length > 0 ? matchedKeywords.length / testCase.expectedKeywords.length : 1;

    const groundedCorrect = Boolean(res.grounded) === Boolean(testCase.expectGrounded);

    results.push({
      id: testCase.id,
      type: testCase.type,
      grounded: res.grounded,
      cacheHit: Boolean(res.telemetry?.cache?.hit),
      keywordRecall: Number(keywordRecall.toFixed(2)),
      groundedCorrect,
      latencyMs: res.telemetry?.totalLatencyMs,
    });
  }

  const summary = {
    workspaceId: WORKSPACE_ID,
    totalCases: results.length,
    groundedAccuracy: Number(
      (results.filter((r) => r.groundedCorrect).length / results.length).toFixed(2)
    ),
    avgKeywordRecall: Number(
      (results.reduce((a, b) => a + b.keywordRecall, 0) / results.length).toFixed(2)
    ),
    cacheHits: results.filter((r) => r.cacheHit).length,
    avgLatencyMs: Math.round(results.reduce((a, b) => a + (b.latencyMs || 0), 0) / results.length),
    ranAt: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify({ summary, results }, null, 2));

  console.table(results);
  console.log("\nSummary:", summary);
  console.log(`Saved full report to ${REPORT_PATH}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error("Evaluation failed:", err);
  await pool.end();
  process.exit(1);
});
