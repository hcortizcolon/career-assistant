import { logger } from "./logger.js";

export interface RetryOptions {
  /** Maximum number of retries (default 3). Total attempts = maxRetries + 1. */
  maxRetries?: number;
  /** Base delay in milliseconds (default 1000). Actual delay: baseDelayMs * 2^attempt * jitter. */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds (default 30000). Caps exponential growth. */
  maxDelayMs?: number;
  /** Predicate that determines if an error is retryable. Defaults to retrying on common transient HTTP errors. */
  isRetryable?: (error: unknown) => boolean;
  /** Label for log messages (e.g. "EmbeddingAPI", "PineconeUpsert"). */
  label?: string;
}

/**
 * Default retryable error check.
 * Retries on: 429 (rate limit), 500, 502, 503, 504, ECONNRESET, ETIMEDOUT.
 * Does NOT retry on: 400, 401, 403, 404, 501 (client errors / not implemented).
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message;

  // HTTP status codes — word boundaries prevent matching inside larger numbers
  if (/\b429\b|rate.?limit/i.test(message)) return true;
  if (/\b50[0234]\b/i.test(message)) return true;

  // Network errors
  if (/econnreset|etimedout|econnrefused|socket.?hang.?up/i.test(message)) return true;
  if (/\bnetwork\b|fetch failed/i.test(message)) return true;

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
 * Delay formula: min(baseDelayMs * 2^attempt * jitter, maxDelayMs).
 * Jitter spreads retries across 50-100% of the computed delay to prevent
 * thundering herd when multiple clients retry simultaneously.
 * Only retries when isRetryable returns true — client errors (401, 400) throw immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
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

      const jitter = 0.5 + Math.random() * 0.5;
      const delayMs = Math.min(
        Math.round(baseDelayMs * Math.pow(2, attempt) * jitter),
        maxDelayMs,
      );
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
