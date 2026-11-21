import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import healthRoutes from "./routes/health.js";
import documentRoutes from "./routes/documents.js";
import queryRoutes from "./routes/query.js";
import cacheRoutes from "./routes/cache.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use("/api/health", healthRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/query", queryRoutes);
app.use("/api/cache", cacheRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(errorHandler);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`docuLens backend listening on port ${env.PORT}`);
  console.log(`Models -> chat: ${env.GEMINI_CHAT_MODEL}, embedding: ${env.GEMINI_EMBEDDING_MODEL} (${env.GEMINI_EMBEDDING_DIMENSIONS}d)`);
});

process.on("unhandledRejection", (err) => console.error("[UnhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[UncaughtException]", err));
