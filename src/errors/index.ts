// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

export class CareerAssistantError extends Error {
  code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = "CareerAssistantError";
    this.code = code;
    this.cause = cause;

    // Fix prototype chain — required for instanceof to work with
    // TypeScript-compiled classes that extend built-ins.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Config errors — fail-fast on startup
// ---------------------------------------------------------------------------

export class ConfigError extends CareerAssistantError {
  readonly missingVars: string[];

  constructor(message: string, missingVars: string[] = [], cause?: unknown) {
    super("CONFIG_INVALID", message, cause);
    this.name = "ConfigError";
    this.missingVars = missingVars;
  }
}

// ---------------------------------------------------------------------------
// Document errors — file loading failures
// ---------------------------------------------------------------------------

export class DocumentError extends CareerAssistantError {
  readonly filePath: string;

  constructor(
    message: string,
    filePath: string,
    code: string = "DOCUMENT_LOAD_FAILED",
    cause?: unknown,
  ) {
    super(code, message, cause);
    this.name = "DocumentError";
    this.filePath = filePath;
  }

  static notFound(filePath: string): DocumentError {
    return new DocumentError(
      `File not found: ${filePath}`,
      filePath,
      "DOCUMENT_NOT_FOUND",
    );
  }

  static unsupportedType(filePath: string, ext: string, supported: string[]): DocumentError {
    return new DocumentError(
      `Unsupported file type: ${ext}. Supported: ${supported.join(", ")}`,
      filePath,
      "DOCUMENT_UNSUPPORTED_TYPE",
    );
  }

  static empty(filePath: string): DocumentError {
    return new DocumentError(
      `Document is empty: ${filePath}`,
      filePath,
      "DOCUMENT_EMPTY",
    );
  }

  static readFailed(filePath: string, cause: unknown): DocumentError {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return new DocumentError(
      `Failed to read file: ${filePath} — ${reason}`,
      filePath,
      "DOCUMENT_READ_FAILED",
      cause,
    );
  }
}

// ---------------------------------------------------------------------------
// Embedding errors — OpenAI embedding API failures
// ---------------------------------------------------------------------------

export class EmbeddingError extends CareerAssistantError {
  readonly chunkCount: number;

  constructor(message: string, chunkCount: number, cause?: unknown) {
    super("EMBEDDING_FAILED", message, cause);
    this.name = "EmbeddingError";
    this.chunkCount = chunkCount;
  }
}

// ---------------------------------------------------------------------------
// Vector store errors — Pinecone failures
// ---------------------------------------------------------------------------

export class VectorStoreError extends CareerAssistantError {
  readonly namespace: string;
  readonly operation: string;

  constructor(
    message: string,
    namespace: string,
    operation: string,
    cause?: unknown,
  ) {
    super("VECTORSTORE_FAILED", message, cause);
    this.name = "VectorStoreError";
    this.namespace = namespace;
    this.operation = operation;
  }
}

// ---------------------------------------------------------------------------
// Chain errors — LLM chain invocation failures
// ---------------------------------------------------------------------------

export class ChainError extends CareerAssistantError {
  readonly chainName: string;
  readonly rawOutput?: string;

  constructor(
    message: string,
    chainName: string,
    rawOutput?: string,
    cause?: unknown,
  ) {
    super("CHAIN_FAILED", message, cause);
    this.name = "ChainError";
    this.chainName = chainName;
    this.rawOutput = rawOutput ? rawOutput.slice(0, 500) : undefined;
  }
}

// ---------------------------------------------------------------------------
// LLM parse errors — JSON parse or Zod validation of LLM output
// ---------------------------------------------------------------------------

export class LLMParseError extends ChainError {
  readonly expected: string;
  readonly received: string;

  constructor(
    chainName: string,
    expected: string,
    received: string,
    cause?: unknown,
  ) {
    super(
      `${chainName} returned output that doesn't match the expected format (${expected})`,
      chainName,
      received,
      cause,
    );
    this.name = "LLMParseError";
    this.code = "LLM_PARSE_FAILED";
    this.expected = expected;
    this.received = received.slice(0, 500);
  }

  static jsonParseFailed(chainName: string, rawOutput: string, cause: unknown): LLMParseError {
    return new LLMParseError(
      chainName,
      "valid JSON",
      rawOutput,
      cause,
    );
  }

  static zodValidationFailed(
    chainName: string,
    schemaName: string,
    rawOutput: string,
    cause: unknown,
  ): LLMParseError {
    return new LLMParseError(
      chainName,
      schemaName,
      rawOutput,
      cause,
    );
  }
}
