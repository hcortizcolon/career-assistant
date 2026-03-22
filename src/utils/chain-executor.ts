import { z } from "zod";
import { LLMParseError } from "../errors/index.js";
import { logger } from "./logger.js";

/**
 * Execute an LLM chain, parse the JSON output, and validate with Zod.
 * Retries once on parse/validation failure since LLM output is non-deterministic.
 *
 * @param chainName  - Used for logging and error context
 * @param invoke     - Async function that calls the chain and returns a raw string
 * @param schema     - Zod schema to validate the parsed output against
 * @param schemaName - Human-readable schema name for error messages
 * @param maxRetries - Number of retries on parse/validation failure (default 1)
 */
export async function executeChain<T>(
  chainName: string,
  invoke: () => Promise<string>,
  schema: z.ZodSchema<T>,
  schemaName: string,
  maxRetries = 1,
): Promise<T> {
  let lastError: Error | undefined;
  let lastRawOutput: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await invoke();
      lastRawOutput = raw;

      logger.debug(
        `Raw LLM output (attempt ${attempt + 1}): ${raw.slice(0, 200)}...`,
        chainName,
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (jsonError) {
        throw LLMParseError.jsonParseFailed(chainName, raw, jsonError);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw LLMParseError.zodValidationFailed(
          chainName,
          schemaName,
          raw,
          result.error,
        );
      }

      return result.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof LLMParseError && attempt < maxRetries) {
        logger.warn(
          `${chainName} attempt ${attempt + 1} failed (${error.expected}), retrying...`,
          chainName,
        );
        continue;
      }

      // Non-parse errors (network, rate limit, etc.) should not be retried here
      if (!(error instanceof LLMParseError)) {
        throw error;
      }
    }
  }

  // All retries exhausted — throw the last parse error
  throw lastError ?? LLMParseError.jsonParseFailed(
    chainName,
    lastRawOutput ?? "(no output)",
    new Error("All retries exhausted"),
  );
}
