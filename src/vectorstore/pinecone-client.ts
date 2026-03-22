import { Pinecone, type Index } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
import { env } from "../config/env.js";
import { getEmbeddings } from "../embeddings/embed.js";
import { logger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

let pineconeClient: Pinecone | null = null;

/**
 * Return a singleton Pinecone client.
 */
function getClient(): Pinecone {
  if (!pineconeClient) {
    pineconeClient = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    logger.info("Initialized Pinecone client", "VectorStore");
  }
  return pineconeClient;
}

/**
 * Get a handle to the configured Pinecone index.
 */
function getIndex(): Index {
  return getClient().index(env.PINECONE_INDEX);
}

/**
 * Create a LangChain PineconeStore backed by the configured index.
 *
 * The store uses the shared OpenAI embeddings instance so all vectors are
 * produced with the same model.
 */
export async function getVectorStore(
  namespace?: string,
): Promise<PineconeStore> {
  const index = getIndex();
  const embeddings = getEmbeddings();

  logger.info(
    `Connecting to Pinecone index "${env.PINECONE_INDEX}"${namespace ? ` (namespace: ${namespace})` : ""}`,
    "VectorStore",
  );

  return withRetry(
    () => PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
      namespace,
    }),
    { label: "PineconeConnect" },
  );
}

/**
 * Upsert documents into Pinecone.
 *
 * Each document is embedded and stored with its metadata.  Use a namespace
 * to isolate different users' data or different document types (e.g.
 * "resumes" vs "job-descriptions").
 */
export async function upsertDocuments(
  docs: Document[],
  namespace?: string,
): Promise<void> {
  const index = getIndex();
  const embeddings = getEmbeddings();

  logger.info(
    `Upserting ${docs.length} document(s) to namespace "${namespace ?? "default"}"`,
    "VectorStore",
  );

  await withRetry(
    () => PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex: index,
      namespace,
    }),
    // Fewer retries than queries — upserts are heavier and less likely to
    // succeed on a transient failure (partial writes, larger payloads).
    { label: "PineconeUpsert", maxRetries: 2 },
  );

  logger.info("Upsert complete", "VectorStore");
}

/**
 * Query the vector store for the top-k most similar documents.
 */
export async function querySimilar(
  query: string,
  k = 5,
  namespace?: string,
): Promise<Document[]> {
  const store = await getVectorStore(namespace);

  logger.debug(
    `Querying top-${k} similar documents for: "${query.slice(0, 80)}..."`,
    "VectorStore",
  );

  return withRetry(
    () => store.similaritySearch(query, k),
    { label: "PineconeQuery" },
  );
}

/**
 * Query with scores — useful for job-fit scoring where the cosine similarity
 * value itself is meaningful.
 */
export async function querySimilarWithScores(
  query: string,
  k = 5,
  namespace?: string,
): Promise<Array<[Document, number]>> {
  const store = await getVectorStore(namespace);

  logger.debug(
    `Querying top-${k} with scores for: "${query.slice(0, 80)}..."`,
    "VectorStore",
  );

  return withRetry(
    () => store.similaritySearchWithScore(query, k),
    { label: "PineconeQueryWithScores" },
  );
}

/**
 * Reset the singleton client (useful in tests).
 */
export function resetPineconeClient(): void {
  pineconeClient = null;
}
