import { access, constants } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { DocumentError } from "../errors/index.js";

const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"];

/**
 * Validate that a file path points to a readable file with a supported extension.
 *
 * Throws a descriptive `DocumentError` if:
 * - The file does not exist
 * - The file is not readable
 * - The file extension is not in the allowlist
 *
 * Returns the resolved absolute path on success.
 */
export async function validateFilePath(
  filePath: string,
  allowedExtensions: string[] = SUPPORTED_EXTENSIONS,
): Promise<string> {
  const absolutePath = resolve(filePath);
  const ext = extname(absolutePath).toLowerCase();

  if (!ext || !allowedExtensions.includes(ext)) {
    throw DocumentError.unsupportedType(absolutePath, ext || "(none)", allowedExtensions);
  }

  try {
    await access(absolutePath, constants.R_OK);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === "ENOENT") {
      throw DocumentError.notFound(absolutePath);
    }

    throw DocumentError.readFailed(absolutePath, error);
  }

  return absolutePath;
}
