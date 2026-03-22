import { z } from "zod";
import { LLMParseError } from "../errors/index.js";
import { logger } from "./logger.js";

/**
 * Execute an LLM chain, parse the JSON output, and validate with Zod.
 * Retries on parse/validation failure since LLM output is non-deterministic.
 * No delay between retries — parse failures are randomness, not load.
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
  schema: z.ZodType<T>,
  schemaName: string,
  maxRetries = 1,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await invoke();

      logger.debug(
        `Raw LLM output (attempt ${attempt + 1}): ${raw.length > 200 ? raw.slice(0, 200) + "..." : raw}`,
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
      // Only retry LLMParseErrors — network errors, rate limits, etc. throw immediately
      if (error instanceof LLMParseError && attempt < maxRetries) {
        logger.warn(
          `${chainName} attempt ${attempt + 1} failed (${error.expected}), retrying...`,
          chainName,
        );
        continue;
      }

      throw error;
    }
  }

  // Unreachable — the loop always returns or throws. TypeScript needs this.
  throw new Error(`${chainName}: unexpected end of retry loop`);
}
