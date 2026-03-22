import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { rewritePrompt } from "../prompts/templates.js";
import { executeChain } from "../utils/chain-executor.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const suggestionSchema = z.object({
  originalText: z.string(),
  rewrittenText: z.string(),
  rationale: z.string(),
});

export const rewriteResultSchema = z.object({
  suggestions: z.array(suggestionSchema),
  generalAdvice: z.array(z.string()),
});

export type RewriteSuggestion = z.infer<typeof suggestionSchema>;
export type RewriteResult = z.infer<typeof rewriteResultSchema>;

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export interface RewriteOptions {
  modelName?: string;
  temperature?: number;
}

/**
 * Build the resume-rewrite suggestion chain.
 *
 * Uses a higher temperature than scoring chains because creative rewording
 * benefits from a bit of variation, while still being constrained by the
 * prompt's instruction to stay grounded in the candidate's real experience.
 */
export function createRewriteChain(options: RewriteOptions = {}) {
  const {
    modelName = env.OPENAI_CHAT_MODEL,
    temperature = 0.4,
  } = options;

  const llm = new ChatOpenAI({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName,
    temperature,
  });

  return RunnableSequence.from([
    rewritePrompt,
    llm,
    new StringOutputParser(),
  ]);
}

/**
 * Generate rewrite suggestions for a resume section, targeted at a specific
 * job description.
 *
 * Pass a single section (e.g. "Work Experience" or a specific role's bullet
 * points) rather than the full resume — this produces more focused, actionable
 * suggestions.
 */
export async function suggestRewrites(
  resumeSection: string,
  jobDescriptionText: string,
  options: RewriteOptions = {},
): Promise<RewriteResult> {
  logger.info("Generating rewrite suggestions", "RewriteChain");

  const chain = createRewriteChain(options);

  const result = await executeChain(
    "RewriteChain",
    () => chain.invoke({
      resumeSection,
      jobDescription: jobDescriptionText,
    }),
    rewriteResultSchema,
    "RewriteResult",
  );

  logger.info(
    `Generated ${result.suggestions.length} rewrite suggestion(s)`,
    "RewriteChain",
  );

  return result;
}
