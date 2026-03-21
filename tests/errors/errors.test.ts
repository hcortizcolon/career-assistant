import { describe, it, expect } from "vitest";
import {
  CareerAssistantError,
  ConfigError,
  DocumentError,
  EmbeddingError,
  VectorStoreError,
  ChainError,
  LLMParseError,
} from "../../src/errors/index.js";

// ---------------------------------------------------------------------------
// CareerAssistantError (base)
// ---------------------------------------------------------------------------

describe("CareerAssistantError", () => {
  it("stores code, message, and cause", () => {
    const cause = new Error("underlying");
    const err = new CareerAssistantError("TEST_CODE", "something broke", cause);

    expect(err.message).toBe("something broke");
    expect(err.code).toBe("TEST_CODE");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("CareerAssistantError");
  });

  it("works with instanceof", () => {
    const err = new CareerAssistantError("X", "msg");
    expect(err).toBeInstanceOf(CareerAssistantError);
    expect(err).toBeInstanceOf(Error);
  });

  it("works without a cause", () => {
    const err = new CareerAssistantError("X", "msg");
    expect(err.cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ConfigError
// ---------------------------------------------------------------------------

describe("ConfigError", () => {
  it("stores missing variable names", () => {
    const err = new ConfigError("bad config", ["OPENAI_API_KEY", "PINECONE_API_KEY"]);

    expect(err.code).toBe("CONFIG_INVALID");
    expect(err.name).toBe("ConfigError");
    expect(err.missingVars).toEqual(["OPENAI_API_KEY", "PINECONE_API_KEY"]);
  });

  it("is instanceof CareerAssistantError and Error", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(ConfigError);
    expect(err).toBeInstanceOf(CareerAssistantError);
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults to empty missingVars", () => {
    const err = new ConfigError("bad config");
    expect(err.missingVars).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DocumentError
// ---------------------------------------------------------------------------

describe("DocumentError", () => {
  it("stores file path and custom code", () => {
    const err = new DocumentError("fail", "/path/to/file.pdf", "CUSTOM_CODE");

    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.name).toBe("DocumentError");
    expect(err.filePath).toBe("/path/to/file.pdf");
  });

  it("defaults code to DOCUMENT_LOAD_FAILED", () => {
    const err = new DocumentError("fail", "/path");
    expect(err.code).toBe("DOCUMENT_LOAD_FAILED");
  });

  it("is instanceof CareerAssistantError", () => {
    const err = new DocumentError("fail", "/path");
    expect(err).toBeInstanceOf(DocumentError);
    expect(err).toBeInstanceOf(CareerAssistantError);
    expect(err).toBeInstanceOf(Error);
  });

  describe("static factories", () => {
    it("notFound includes file path in message", () => {
      const err = DocumentError.notFound("/resume.pdf");
      expect(err.code).toBe("DOCUMENT_NOT_FOUND");
      expect(err.message).toContain("/resume.pdf");
      expect(err.filePath).toBe("/resume.pdf");
    });

    it("unsupportedType lists supported extensions", () => {
      const err = DocumentError.unsupportedType("/file.xlsx", ".xlsx", [".pdf", ".txt", ".md"]);
      expect(err.code).toBe("DOCUMENT_UNSUPPORTED_TYPE");
      expect(err.message).toContain(".xlsx");
      expect(err.message).toContain(".pdf, .txt, .md");
    });

    it("empty includes file path", () => {
      const err = DocumentError.empty("/empty.txt");
      expect(err.code).toBe("DOCUMENT_EMPTY");
      expect(err.message).toContain("/empty.txt");
    });

    it("readFailed wraps the original cause", () => {
      const cause = new Error("EACCES: permission denied");
      const err = DocumentError.readFailed("/secret.pdf", cause);
      expect(err.code).toBe("DOCUMENT_READ_FAILED");
      expect(err.message).toContain("permission denied");
      expect(err.cause).toBe(cause);
    });

    it("readFailed handles non-Error causes", () => {
      const err = DocumentError.readFailed("/file.pdf", "string error");
      expect(err.message).toContain("string error");
    });
  });
});

// ---------------------------------------------------------------------------
// EmbeddingError
// ---------------------------------------------------------------------------

describe("EmbeddingError", () => {
  it("stores chunk count", () => {
    const err = new EmbeddingError("embed failed", 7);
    expect(err.code).toBe("EMBEDDING_FAILED");
    expect(err.name).toBe("EmbeddingError");
    expect(err.chunkCount).toBe(7);
  });

  it("is instanceof CareerAssistantError", () => {
    const err = new EmbeddingError("fail", 1);
    expect(err).toBeInstanceOf(EmbeddingError);
    expect(err).toBeInstanceOf(CareerAssistantError);
  });
});

// ---------------------------------------------------------------------------
// VectorStoreError
// ---------------------------------------------------------------------------

describe("VectorStoreError", () => {
  it("stores namespace and operation", () => {
    const err = new VectorStoreError(
      "upsert timed out",
      "user_abc_resumes",
      "upsert",
    );

    expect(err.code).toBe("VECTORSTORE_FAILED");
    expect(err.name).toBe("VectorStoreError");
    expect(err.namespace).toBe("user_abc_resumes");
    expect(err.operation).toBe("upsert");
  });

  it("is instanceof CareerAssistantError", () => {
    const err = new VectorStoreError("fail", "ns", "query");
    expect(err).toBeInstanceOf(VectorStoreError);
    expect(err).toBeInstanceOf(CareerAssistantError);
  });
});

// ---------------------------------------------------------------------------
// ChainError
// ---------------------------------------------------------------------------

describe("ChainError", () => {
  it("stores chain name and truncated raw output", () => {
    const longOutput = "x".repeat(1000);
    const err = new ChainError("chain failed", "JobFitChain", longOutput);

    expect(err.code).toBe("CHAIN_FAILED");
    expect(err.name).toBe("ChainError");
    expect(err.chainName).toBe("JobFitChain");
    expect(err.rawOutput).toHaveLength(500);
  });

  it("handles undefined raw output", () => {
    const err = new ChainError("chain failed", "TestChain");
    expect(err.rawOutput).toBeUndefined();
  });

  it("is instanceof CareerAssistantError", () => {
    const err = new ChainError("fail", "TestChain");
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toBeInstanceOf(CareerAssistantError);
  });
});

// ---------------------------------------------------------------------------
// LLMParseError
// ---------------------------------------------------------------------------

describe("LLMParseError", () => {
  it("stores expected schema name and truncated received output", () => {
    const received = "y".repeat(1000);
    const err = new LLMParseError("JobFitChain", "JobFitResult", received);

    expect(err.code).toBe("LLM_PARSE_FAILED");
    expect(err.name).toBe("LLMParseError");
    expect(err.chainName).toBe("JobFitChain");
    expect(err.expected).toBe("JobFitResult");
    expect(err.received).toHaveLength(500);
    expect(err.message).toContain("JobFitChain");
    expect(err.message).toContain("JobFitResult");
  });

  it("is instanceof ChainError and CareerAssistantError", () => {
    const err = new LLMParseError("C", "S", "R");
    expect(err).toBeInstanceOf(LLMParseError);
    expect(err).toBeInstanceOf(ChainError);
    expect(err).toBeInstanceOf(CareerAssistantError);
    expect(err).toBeInstanceOf(Error);
  });

  describe("static factories", () => {
    it("jsonParseFailed sets expected to 'valid JSON'", () => {
      const cause = new SyntaxError("Unexpected token");
      const err = LLMParseError.jsonParseFailed("TestChain", "{bad json", cause);

      expect(err.expected).toBe("valid JSON");
      expect(err.received).toBe("{bad json");
      expect(err.cause).toBe(cause);
    });

    it("zodValidationFailed sets expected to schema name", () => {
      const cause = new Error("Zod validation failed");
      const err = LLMParseError.zodValidationFailed(
        "SkillGapChain",
        "SkillGapResult",
        '{"gaps": "not an array"}',
        cause,
      );

      expect(err.expected).toBe("SkillGapResult");
      expect(err.received).toBe('{"gaps": "not an array"}');
      expect(err.cause).toBe(cause);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: instanceof discrimination
// ---------------------------------------------------------------------------

describe("instanceof discrimination", () => {
  it("can distinguish between error types with instanceof", () => {
    const errors: CareerAssistantError[] = [
      new ConfigError("config"),
      new DocumentError("doc", "/path"),
      new EmbeddingError("embed", 1),
      new VectorStoreError("vs", "ns", "op"),
      new ChainError("chain", "C"),
      new LLMParseError("C", "S", "R"),
    ];

    expect(errors.filter((e) => e instanceof ConfigError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof DocumentError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof EmbeddingError)).toHaveLength(1);
    expect(errors.filter((e) => e instanceof VectorStoreError)).toHaveLength(1);
    // ChainError matches both ChainError and LLMParseError (subclass)
    expect(errors.filter((e) => e instanceof ChainError)).toHaveLength(2);
    expect(errors.filter((e) => e instanceof LLMParseError)).toHaveLength(1);
    // All are CareerAssistantError
    expect(errors.filter((e) => e instanceof CareerAssistantError)).toHaveLength(6);
  });
});
