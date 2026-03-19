import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  /**
   * Separators used to split text, tried in order.
   *
   * Defaults to a hierarchy that preserves paragraph and sentence boundaries
   * before falling back to word-level splits — important for keeping semantic
   * coherence in resume sections and job description bullet points.
   */
  separators?: string[];
}

const DEFAULT_SEPARATORS = [
  "\n\n",  // paragraph breaks (resume sections, JD sections)
  "\n",    // line breaks (bullet points)
  ". ",    // sentence boundaries
  ", ",    // clause boundaries
  " ",     // word boundaries
  "",      // character-level fallback
];

/**
 * Split documents into overlapping chunks suitable for embedding.
 *
 * Uses LangChain's RecursiveCharacterTextSplitter with defaults tuned for
 * resume / job-description content: moderate chunk sizes with generous overlap
 * to avoid splitting mid-sentence in bullet-heavy documents.
 */
export function createSplitter(options: ChunkOptions = {}): RecursiveCharacterTextSplitter {
  const chunkSize = options.chunkSize ?? env.CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? env.CHUNK_OVERLAP;
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  logger.debug(
    `Splitter config: size=${chunkSize}, overlap=${chunkOverlap}`,
    "ChunkSplitter",
  );

  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators,
  });
}

/**
 * Split a single document into chunks, preserving source metadata on each
 * chunk and annotating with chunk index.
 */
export async function splitDocument(
  doc: Document,
  options: ChunkOptions = {},
): Promise<Document[]> {
  const splitter = createSplitter(options);
  const chunks = await splitter.splitDocuments([doc]);

  const annotated = chunks.map((chunk, index) => {
    return new Document({
      pageContent: chunk.pageContent,
      metadata: {
        ...chunk.metadata,
        chunkIndex: index,
        totalChunks: chunks.length,
      },
    });
  });

  logger.info(
    `Split "${doc.metadata["source"] ?? "unknown"}" into ${annotated.length} chunks`,
    "ChunkSplitter",
  );

  return annotated;
}

/**
 * Split multiple documents, returning a flat array of all chunks.
 */
export async function splitDocuments(
  docs: Document[],
  options: ChunkOptions = {},
): Promise<Document[]> {
  const results = await Promise.all(
    docs.map((doc) => splitDocument(doc, options)),
  );
  return results.flat();
}
