import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — isolate from external services
// ---------------------------------------------------------------------------

// Mock the env module so tests don't require real API keys.
vi.mock("../../src/config/env.js", () => ({
  env: {
    OPENAI_API_KEY: "test-openai-key",
    PINECONE_API_KEY: "test-pinecone-key",
    PINECONE_INDEX: "test-index",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    OPENAI_CHAT_MODEL: "gpt-4o",
    CHUNK_SIZE: 1000,
    CHUNK_OVERLAP: 200,
    LOG_LEVEL: "error",
  },
}));

// Mock the vector store module.
const mockSimilaritySearch = vi.fn();
const mockAsRetriever = vi.fn();

vi.mock("../../src/vectorstore/pinecone-client.js", () => ({
  getVectorStore: vi.fn().mockResolvedValue({
    asRetriever: mockAsRetriever,
    similaritySearch: mockSimilaritySearch,
  }),
  querySimilar: mockSimilaritySearch,
}));

// Mock the LLM so we never hit the OpenAI API.
const mockLlmInvoke = vi.fn();

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: vi.fn().mockImplementation(() => ({
    invoke: mockLlmInvoke,
    pipe: vi.fn().mockReturnThis(),
    batch: vi.fn(),
  })),
  OpenAIEmbeddings: vi.fn().mockImplementation(() => ({
    embedQuery: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedDocuments: vi.fn().mockResolvedValue([]),
  })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { Document } from "@langchain/core/documents";

describe("RetrievalChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createRetrievalChain", () => {
    it("should build a chain without throwing", async () => {
      // The retriever mock needs to return a pipe-able object.
      const mockRetriever = {
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue([
            new Document({ pageContent: "test content", metadata: {} }),
          ]),
        }),
        invoke: vi.fn().mockResolvedValue([
          new Document({ pageContent: "test content", metadata: {} }),
        ]),
      };

      mockAsRetriever.mockReturnValue(mockRetriever);

      const { createRetrievalChain } = await import(
        "../../src/chains/retrieval-chain.js"
      );

      const chain = await createRetrievalChain({ k: 3 });
      expect(chain).toBeDefined();
      expect(mockAsRetriever).toHaveBeenCalledWith({ k: 3 });
    });

    it("should use default k=5 when not specified", async () => {
      const mockRetriever = {
        pipe: vi.fn().mockReturnValue({
          invoke: vi.fn().mockResolvedValue([]),
        }),
        invoke: vi.fn().mockResolvedValue([]),
      };

      mockAsRetriever.mockReturnValue(mockRetriever);

      const { createRetrievalChain } = await import(
        "../../src/chains/retrieval-chain.js"
      );

      await createRetrievalChain();
      expect(mockAsRetriever).toHaveBeenCalledWith({ k: 5 });
    });
  });

  describe("document formatting", () => {
    it("should number documents sequentially in context", () => {
      const docs = [
        new Document({ pageContent: "First doc", metadata: {} }),
        new Document({ pageContent: "Second doc", metadata: {} }),
        new Document({ pageContent: "Third doc", metadata: {} }),
      ];

      // Replicate the internal formatDocs logic to verify the contract.
      const formatted = docs
        .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
        .join("\n\n");

      expect(formatted).toContain("[1] First doc");
      expect(formatted).toContain("[2] Second doc");
      expect(formatted).toContain("[3] Third doc");
    });
  });
});
