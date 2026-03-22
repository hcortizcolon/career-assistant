import { OpenAIEmbeddings } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

let embeddingsInstance: OpenAIEmbeddings | null = null;

/**
 * Return a singleton OpenAI embeddings client.
 *
 * Reusing a single instance avoids redundant warm-up requests and keeps
 * connection pooling efficient when embedding large batches.
 */
export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      openAIApiKey: env.OPENAI_API_KEY,
      modelName: env.OPENAI_EMBEDDING_MODEL,
      stripNewLines: true,
    });
    logger.info(
      `Initialized embeddings model: ${env.OPENAI_EMBEDDING_MODEL}`,
      "Embeddings",
    );
  }
  return embeddingsInstance;
}

/**
 * Embed a single text string and return its vector.
 */
export async function embedText(text: string): Promise<number[]> {
  const embeddings = getEmbeddings();
  logger.debug(`Embedding single text (${text.length} chars)`, "Embeddings");
  return withRetry(() => embeddings.embedQuery(text), {
    label: "EmbedQuery",
  });
}

/**
 * Embed the page content of multiple Documents in a single batch call.
 *
 * Returns vectors in the same order as the input documents.
 */
export async function embedDocuments(docs: Document[]): Promise<number[][]> {
  const embeddings = getEmbeddings();
  const texts = docs.map((d) => d.pageContent);

  logger.info(
    `Embedding batch of ${texts.length} document(s)`,
    "Embeddings",
  );

  return withRetry(() => embeddings.embedDocuments(texts), {
    label: "EmbedDocuments",
  });
}

/**
 * Reset the singleton (useful in tests).
 */
export function resetEmbeddings(): void {
  embeddingsInstance = null;
}
