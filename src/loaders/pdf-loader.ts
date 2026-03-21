import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";
import { Document } from "@langchain/core/documents";
import { DocumentError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { validateFilePath } from "./validate.js";

export interface PdfLoadOptions {
  /** Optional metadata to attach to every document produced from this PDF. */
  metadata?: Record<string, unknown>;
}

/**
 * Load a PDF file and return it as a LangChain Document.
 *
 * The full text content is extracted using pdf-parse.  Each PDF becomes a
 * single Document whose `pageContent` is the concatenated text of all pages.
 * Page-level splitting is handled downstream by the chunk splitter.
 */
export async function loadPdf(
  filePath: string,
  options: PdfLoadOptions = {},
): Promise<Document> {
  const absolutePath = await validateFilePath(filePath, [".pdf"]);
  logger.info(`Loading PDF: ${absolutePath}`, "PdfLoader");

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    throw DocumentError.readFailed(absolutePath, error);
  }

  let parsed: Awaited<ReturnType<typeof pdfParse>>;
  try {
    parsed = await pdfParse(buffer);
  } catch (error) {
    throw DocumentError.readFailed(absolutePath, error);
  }

  if (!parsed.text.trim()) {
    throw DocumentError.empty(absolutePath);
  }

  logger.debug(
    `Extracted ${parsed.numpages} page(s), ${parsed.text.length} chars`,
    "PdfLoader",
  );

  return new Document({
    pageContent: parsed.text,
    metadata: {
      source: absolutePath,
      format: "pdf",
      pages: parsed.numpages,
      ...options.metadata,
    },
  });
}

/**
 * Convenience helper to load multiple PDFs in parallel.
 */
export async function loadPdfs(
  filePaths: string[],
  options: PdfLoadOptions = {},
): Promise<Document[]> {
  return Promise.all(filePaths.map((fp) => loadPdf(fp, options)));
}
