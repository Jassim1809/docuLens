import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const boolFromString = (defaultVal) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultVal;
      return v.toLowerCase() === "true" || v === "1";
    });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("*"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: boolFromString(false),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_CHAT_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  GEMINI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(256).max(2000).default(1536),

  CHUNK_SIZE: z.coerce.number().default(800),
  CHUNK_OVERLAP: z.coerce.number().default(150),
  HYBRID_TOP_K: z.coerce.number().default(25),
  RERANK_TOP_N: z.coerce.number().default(5),
  ENABLE_RERANKER: boolFromString(true),
  RERANKER_PROVIDER: z.enum(["gemini", "cohere"]).default("gemini"),
  COHERE_API_KEY: z.string().optional().default(""),
  COHERE_RERANK_MODEL: z.string().default("rerank-v3.5"),

  ENABLE_SEMANTIC_CACHE: boolFromString(true),
  CACHE_SIMILARITY_THRESHOLD: z.coerce.number().min(0.5).max(1).default(0.92),
  CACHE_TTL_MS: z.coerce.number().default(86400000),

  MAX_FILE_SIZE_MB: z.coerce.number().default(15),
  MAX_PDF_PAGES: z.coerce.number().default(150),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
