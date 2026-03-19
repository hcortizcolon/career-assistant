import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { Document } from "@langchain/core/documents";
import { env } from "../config/env.js";
import { getVectorStore } from "../vectorstore/pinecone-client.js";
import { retrievalQaPrompt } from "../prompts/templates.js";
import { logger } from "../utils/logger.js";

function formatDocs(docs: Document[]): string {
  return docs
    .map((doc, i) => `[${i + 1}] ${doc.pageContent}`)
    .join("\n\n");
}

export interface RetrievalChainOptions {
  /** Number of documents to retrieve. */
  k?: number;
  /** Pinecone namespace to search within. */
  namespace?: string;
  /** Override the default chat model. */
  modelName?: string;
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
}

/**
 * Build a Retrieval-Augmented Generation chain.
 *
 * Architecture:
 *   question -> vectorStore.retrieve(k) -> format docs -> prompt -> LLM -> string
 *
 * Uses LCEL (LangChain Expression Language) for composability — each step is
 * a Runnable that can be individually tested, streamed, or batched.
 */
export async function createRetrievalChain(options: RetrievalChainOptions = {}) {
  const {
    k = 5,
    namespace,
    modelName = env.OPENAI_CHAT_MODEL,
    temperature = 0.2,
  } = options;

  logger.info(
    `Building retrieval chain (k=${k}, model=${modelName})`,
    "RetrievalChain",
  );

  const vectorStore = await getVectorStore(namespace);
  const retriever = vectorStore.asRetriever({ k });

  const llm = new ChatOpenAI({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName,
    temperature,
  });

  const chain = RunnableSequence.from([
    {
      context: retriever.pipe(formatDocs),
      question: new RunnablePassthrough(),
    },
    retrievalQaPrompt,
    llm,
    new StringOutputParser(),
  ]);

  return chain;
}

/**
 * One-shot convenience: ask a question against the vector store and get a
 * string answer.
 */
export async function askQuestion(
  question: string,
  options: RetrievalChainOptions = {},
): Promise<string> {
  const chain = await createRetrievalChain(options);

  logger.info(`Asking: "${question.slice(0, 80)}..."`, "RetrievalChain");
  const answer = await chain.invoke(question);

  logger.debug(`Answer length: ${answer.length} chars`, "RetrievalChain");
  return answer;
}
