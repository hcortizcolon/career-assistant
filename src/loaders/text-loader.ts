import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { Document } from "@langchain/core/documents";
import { DocumentError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { validateFilePath } from "./validate.js";

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
  const absolutePath = await validateFilePath(filePath, [".txt", ".md"]);
  const encoding = options.encoding ?? "utf-8";

  logger.info(`Loading text file: ${absolutePath}`, "TextLoader");

  let content: string;
  try {
    content = await readFile(absolutePath, { encoding });
  } catch (error) {
    throw DocumentError.readFailed(absolutePath, error);
  }

  if (!content.trim()) {
    throw DocumentError.empty(absolutePath);
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
    throw DocumentError.empty("inline");
  }

  return new Document({
    pageContent: text,
    metadata: { source: "inline", format: "text", ...metadata },
  });
}
