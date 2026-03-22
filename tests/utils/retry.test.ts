import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, isTransientError } from "../../src/utils/retry.js";

// Mock logger — keep references for assertion
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// ---------------------------------------------------------------------------
// isTransientError
// ---------------------------------------------------------------------------

describe("isTransientError", () => {
  it("returns true for 429 rate limit errors", () => {
    expect(isTransientError(new Error("Request failed with status 429"))).toBe(true);
    expect(isTransientError(new Error("Rate limit exceeded"))).toBe(true);
    expect(isTransientError(new Error("rate_limit_error"))).toBe(true);
  });

  it("returns true for 500, 502, 503, 504 server errors", () => {
    expect(isTransientError(new Error("500 Internal Server Error"))).toBe(true);
    expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("returns false for 501 Not Implemented (not transient)", () => {
    expect(isTransientError(new Error("501 Not Implemented"))).toBe(false);
  });

  it("returns true for network errors", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isTransientError(new Error("socket hang up"))).toBe(true);
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("network error"))).toBe(true);
  });

  it("returns true for errors with a retryable status property", () => {
    const error = Object.assign(new Error("fail"), { status: 429 });
    expect(isTransientError(error)).toBe(true);

    const error503 = Object.assign(new Error("fail"), { status: 503 });
    expect(isTransientError(error503)).toBe(true);
  });

  it("returns false for 401 unauthorized", () => {
    expect(isTransientError(new Error("401 Unauthorized"))).toBe(false);
  });

  it("returns false for 400 bad request", () => {
    expect(isTransientError(new Error("400 Bad Request"))).toBe(false);
  });

  it("returns false for 404 not found", () => {
    const error = Object.assign(new Error("not found"), { status: 404 });
    expect(isTransientError(error)).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTransientError("string error")).toBe(false);
    expect(isTransientError(42)).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it("returns false for generic errors without status info", () => {
    expect(isTransientError(new Error("something broke"))).toBe(false);
    expect(isTransientError(new TypeError("cannot read property"))).toBe(false);
  });

  it("does not false-positive on status codes embedded in larger numbers", () => {
    expect(isTransientError(new Error("Error code 15003"))).toBe(false);
    expect(isTransientError(new Error("request id 5020394"))).toBe(false);
    expect(isTransientError(new Error("port 4290 unavailable"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Pin jitter to 1.0 (no randomness) so delay assertions are deterministic
    vi.spyOn(Math, "random").mockReturnValue(1.0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    const result = await withRetry(fn, { label: "Test" });

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("retries on transient error and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 2,
      baseDelayMs: 100,
    });

    // With jitter pinned to 1.0: delay = 100 * 2^0 * (0.5 + 1.0 * 0.5) = 100ms
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries multiple times with exponential backoff", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 3,
      baseDelayMs: 100,
    });

    // Delay 1: 100 * 2^0 * 1.0 = 100ms
    await vi.advanceTimersByTimeAsync(100);
    // Delay 2: 100 * 2^1 * 1.0 = 200ms
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("401 Unauthorized"));

    await expect(
      withRetry(fn, { label: "Test", maxRetries: 3 }),
    ).rejects.toThrow("401 Unauthorized");

    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it("throws after exhausting all retries", async () => {
    let callCount = 0;
    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.reject(new Error("429 rate limit"));
    });

    let caughtError: Error | undefined;
    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 2,
      baseDelayMs: 100,
    }).catch((e: Error) => { caughtError = e; });

    await vi.runAllTimersAsync();
    await promise;

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain("429 rate limit");
    // 1 initial + 2 retries = 3 total
    expect(callCount).toBe(3);
  });

  it("logs a warning on each retry", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "TestOp",
      maxRetries: 2,
      baseDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("attempt 1 failed"),
      "TestOp",
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("retrying in"),
      "TestOp",
    );
  });

  it("supports custom isRetryable predicate", async () => {
    const customRetryable = (error: unknown) =>
      error instanceof Error && error.message.includes("CUSTOM");

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("CUSTOM: try again"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 1,
      baseDelayMs: 100,
      isRetryable: customRetryable,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries=0 (no retries)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("503 Service Unavailable"));

    await expect(
      withRetry(fn, { label: "Test", maxRetries: 0 }),
    ).rejects.toThrow("503");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses exponential backoff delays", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("500 error"))
      .mockRejectedValueOnce(new Error("500 error"))
      .mockRejectedValueOnce(new Error("500 error"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 3,
      baseDelayMs: 1000,
    });

    // With jitter pinned to 1.0:
    // Delay 1: 1000 * 2^0 * 1.0 = 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Delay 2: 1000 * 2^1 * 1.0 = 2000ms
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    // Delay 3: 1000 * 2^2 * 1.0 = 4000ms
    await vi.advanceTimersByTimeAsync(4000);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("caps delay at maxDelayMs", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("500 error"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 1,
      baseDelayMs: 50_000,
      maxDelayMs: 5_000,
    });

    // Without cap: 50000 * 2^0 * 1.0 = 50000ms
    // With cap: 5000ms
    await vi.advanceTimersByTimeAsync(5_000);

    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("applies jitter to spread retries", async () => {
    // Restore real Math.random for this test
    vi.spyOn(Math, "random").mockReturnValue(0.0);

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("500 error"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      label: "Test",
      maxRetries: 1,
      baseDelayMs: 1000,
    });

    // With jitter=0.0: delay = 1000 * 2^0 * (0.5 + 0.0 * 0.5) = 500ms
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toBe("ok");
  });
});
