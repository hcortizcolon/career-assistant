import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { Document } from "@langchain/core/documents";
import { logger } from "../utils/logger.js";

export interface TextLoadOptions {
  /** Encoding to use when reading the file.  Defaults to utf-8. */
  encoding?: BufferEncoding;
  /** Optional metadata to attach to every document produced. */
  metadata?: Record<string, unknown>;
}

/**
 * Load a plain-text document (`.txt`, `.md`, etc.) into a LangChain Document.
 *
 * Use this for any non-PDF text source — pasted job descriptions, markdown
 * resumes, cover letters, etc.
 */
export async function loadText(
  filePath: string,
  options: TextLoadOptions = {},
): Promise<Document> {
  const absolutePath = resolve(filePath);
  const encoding = options.encoding ?? "utf-8";

  logger.info(`Loading text file: ${absolutePath}`, "TextLoader");

  const content = await readFile(absolutePath, { encoding });

  if (!content.trim()) {
    throw new Error(`Text file at ${absolutePath} is empty.`);
  }

  logger.debug(`Read ${content.length} chars`, "TextLoader");

  return new Document({
    pageContent: content,
    metadata: {
      source: absolutePath,
      format: extname(absolutePath).replace(".", "") || "txt",
      ...options.metadata,
    },
  });
}

/**
 * Create a Document directly from a raw string.
 *
 * Useful when the text is already in memory (e.g. pasted from a CLI arg or
 * API request) and doesn't need to be read from disk.
 */
export function documentFromString(
  text: string,
  metadata: Record<string, unknown> = {},
): Document {
  if (!text.trim()) {
    throw new Error("Cannot create a Document from an empty string.");
  }

  return new Document({
    pageContent: text,
    metadata: { source: "inline", format: "text", ...metadata },
  });
}
