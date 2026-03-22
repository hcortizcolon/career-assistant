import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { executeChain } from "../../src/utils/chain-executor.js";
import { LLMParseError } from "../../src/errors/index.js";

// Suppress logger output during tests
vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const testSchema = z.object({
  score: z.number().min(0).max(100),
  label: z.string(),
});

type TestResult = z.infer<typeof testSchema>;

const VALID_RESULT: TestResult = { score: 85, label: "good" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validInvoke(): Promise<string> {
  return Promise.resolve(JSON.stringify(VALID_RESULT));
}

function malformedJsonInvoke(): Promise<string> {
  return Promise.resolve('{"score": 85, "label": "good"');  // missing closing brace
}

function invalidSchemaInvoke(): Promise<string> {
  return Promise.resolve(JSON.stringify({ score: 150, label: "bad" }));
}

function networkErrorInvoke(): Promise<string> {
  return Promise.reject(new Error("OpenAI 500: Internal Server Error"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeChain", () => {
  describe("happy path", () => {
    it("returns validated result on first try", async () => {
      const result = await executeChain(
        "TestChain",
        validInvoke,
        testSchema,
        "TestResult",
      );

      expect(result).toEqual(VALID_RESULT);
    });

    it("returns the correctly typed result", async () => {
      const result = await executeChain(
        "TestChain",
        validInvoke,
        testSchema,
        "TestResult",
      );

      expect(result.score).toBe(85);
      expect(result.label).toBe("good");
    });
  });

  describe("JSON parse failure with retry", () => {
    it("retries once and succeeds on second attempt", async () => {
      let attempt = 0;
      const invoke = (): Promise<string> => {
        attempt++;
        if (attempt === 1) return malformedJsonInvoke();
        return validInvoke();
      };

      const result = await executeChain(
        "TestChain",
        invoke,
        testSchema,
        "TestResult",
      );

      expect(result).toEqual(VALID_RESULT);
      expect(attempt).toBe(2);
    });

    it("throws LLMParseError after retries exhausted", async () => {
      try {
        await executeChain(
          "TestChain",
          malformedJsonInvoke,
          testSchema,
          "TestResult",
          1,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LLMParseError);
        const parseError = error as LLMParseError;
        expect(parseError.chainName).toBe("TestChain");
        expect(parseError.expected).toBe("valid JSON");
      }
    });
  });

  describe("Zod validation failure with retry", () => {
    it("retries once and succeeds on second attempt", async () => {
      let attempt = 0;
      const invoke = (): Promise<string> => {
        attempt++;
        if (attempt === 1) return invalidSchemaInvoke();
        return validInvoke();
      };

      const result = await executeChain(
        "TestChain",
        invoke,
        testSchema,
        "TestResult",
      );

      expect(result).toEqual(VALID_RESULT);
      expect(attempt).toBe(2);
    });

    it("throws LLMParseError with schema name after retries exhausted", async () => {
      try {
        await executeChain(
          "TestChain",
          invalidSchemaInvoke,
          testSchema,
          "TestResult",
          1,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LLMParseError);
        const parseError = error as LLMParseError;
        expect(parseError.chainName).toBe("TestChain");
        expect(parseError.expected).toBe("TestResult");
      }
    });
  });

  describe("non-parse errors are not retried", () => {
    it("throws network errors immediately without retrying", async () => {
      let callCount = 0;
      const invoke = (): Promise<string> => {
        callCount++;
        return networkErrorInvoke();
      };

      try {
        await executeChain(
          "TestChain",
          invoke,
          testSchema,
          "TestResult",
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(LLMParseError);
        expect((error as Error).message).toContain("OpenAI 500");
        expect(callCount).toBe(1);
      }
    });
  });

  describe("maxRetries configuration", () => {
    it("respects maxRetries=0 (no retries)", async () => {
      let callCount = 0;
      const invoke = (): Promise<string> => {
        callCount++;
        return malformedJsonInvoke();
      };

      try {
        await executeChain(
          "TestChain",
          invoke,
          testSchema,
          "TestResult",
          0,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LLMParseError);
        expect(callCount).toBe(1);
      }
    });

    it("respects maxRetries=2 (up to 3 total attempts)", async () => {
      let callCount = 0;
      const invoke = (): Promise<string> => {
        callCount++;
        if (callCount < 3) return malformedJsonInvoke();
        return validInvoke();
      };

      const result = await executeChain(
        "TestChain",
        invoke,
        testSchema,
        "TestResult",
        2,
      );

      expect(result).toEqual(VALID_RESULT);
      expect(callCount).toBe(3);
    });

    it("fails after maxRetries=2 with 3 bad attempts", async () => {
      let callCount = 0;
      const invoke = (): Promise<string> => {
        callCount++;
        return malformedJsonInvoke();
      };

      try {
        await executeChain(
          "TestChain",
          invoke,
          testSchema,
          "TestResult",
          2,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(LLMParseError);
        expect(callCount).toBe(3);
      }
    });
  });

  describe("mixed failure types across retries", () => {
    it("handles JSON failure then Zod failure then success", async () => {
      let attempt = 0;
      const invoke = (): Promise<string> => {
        attempt++;
        if (attempt === 1) return malformedJsonInvoke();
        if (attempt === 2) return invalidSchemaInvoke();
        return validInvoke();
      };

      const result = await executeChain(
        "TestChain",
        invoke,
        testSchema,
        "TestResult",
        2,
      );

      expect(result).toEqual(VALID_RESULT);
      expect(attempt).toBe(3);
    });
  });
});
