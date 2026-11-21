import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { env } from "../config/env.js";

let chatInstance = null;
let embeddingsInstance = null;

export function getGeminiChatModel() {
  if (!chatInstance) {
    chatInstance = new ChatGoogleGenerativeAI({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_CHAT_MODEL,
      temperature: 0,
      maxRetries:1,
    });
  }
  return chatInstance;
}

export function getGeminiEmbeddings() {
  if (!embeddingsInstance) {
    embeddingsInstance = new GoogleGenerativeAIEmbeddings({
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_EMBEDDING_MODEL,
      outputDimensionality: env.GEMINI_EMBEDDING_DIMENSIONS,
    });
  }
  return embeddingsInstance;
}
