import { logger } from "./logger.js";

export interface RetryOptions {
  /** Maximum number of retries (default 3). Total attempts = maxRetries + 1. */
  maxRetries?: number;
  /** Base delay in milliseconds (default 1000). Actual delay: baseDelayMs * 2^attempt. */
  baseDelayMs?: number;
  /** Predicate that determines if an error is retryable. Defaults to retrying on common transient HTTP errors. */
  isRetryable?: (error: unknown) => boolean;
  /** Label for log messages (e.g. "EmbeddingAPI", "PineconeUpsert"). */
  label?: string;
}

/**
 * Default retryable error check.
 * Retries on: 429 (rate limit), 500, 502, 503, 504, ECONNRESET, ETIMEDOUT.
 * Does NOT retry on: 400, 401, 403, 404 (client errors that won't change on retry).
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // HTTP status codes in error messages
  if (/429|rate.?limit/i.test(message)) return true;
  if (/50[0234]/i.test(message)) return true;

  // Network errors
  if (/econnreset|etimedout|econnrefused|socket.?hang.?up/i.test(message)) return true;
  if (/network|fetch failed/i.test(message)) return true;

  // Check for status code property (common in API client errors)
  const statusError = error as unknown as Record<string, unknown>;
  if (typeof statusError.status === "number") {
    const s = statusError.status;
    return s === 429 || (s >= 500 && s <= 504);
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap an async function with exponential backoff retry.
 *
 * Delay formula: baseDelayMs * 2^attempt (1s, 2s, 4s with defaults).
 * Only retries when isRetryable returns true — client errors (401, 400) throw immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    isRetryable = isTransientError,
    label = "withRetry",
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        `${label} attempt ${attempt + 1} failed, retrying in ${delayMs}ms: ${error instanceof Error ? error.message : String(error)}`,
        label,
      );

      await sleep(delayMs);
    }
  }

  // Unreachable — loop always returns or throws
  throw new Error(`${label}: unexpected end of retry loop`);
}
