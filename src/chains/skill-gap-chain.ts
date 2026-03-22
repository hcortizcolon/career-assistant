import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { skillGapPrompt } from "../prompts/templates.js";
import { executeChain } from "../utils/chain-executor.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

const gapSchema = z.object({
  skill: z.string(),
  severity: z.enum(["critical", "important", "nice-to-have"]),
  context: z.string(),
  recommendation: z.string(),
});

export const skillGapResultSchema = z.object({
  gaps: z.array(gapSchema),
  presentStrengths: z.array(z.string()),
  readinessSummary: z.string(),
});

export type SkillGap = z.infer<typeof gapSchema>;
export type SkillGapResult = z.infer<typeof skillGapResultSchema>;

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export interface SkillGapOptions {
  modelName?: string;
  temperature?: number;
}

/**
 * Build the skill-gap analysis chain.
 *
 * Straightforward prompt -> LLM -> parse pipeline.  The prompt is carefully
 * engineered to produce severity-classified gaps with actionable remediation
 * steps, making the output immediately useful for career planning.
 */
export function createSkillGapChain(options: SkillGapOptions = {}) {
  const {
    modelName = env.OPENAI_CHAT_MODEL,
    temperature = 0.2,
  } = options;

  const llm = new ChatOpenAI({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName,
    temperature,
  });

  return RunnableSequence.from([
    skillGapPrompt,
    llm,
    new StringOutputParser(),
  ]);
}

/**
 * Analyse the skill gaps between a resume and a target job description.
 *
 * Returns a validated result with each gap categorized by severity and
 * accompanied by a concrete recommendation.
 */
export async function analyzeSkillGaps(
  resumeText: string,
  jobDescriptionText: string,
  options: SkillGapOptions = {},
): Promise<SkillGapResult> {
  logger.info("Running skill-gap analysis", "SkillGapChain");

  const chain = createSkillGapChain(options);

  const result = await executeChain(
    "SkillGapChain",
    () => chain.invoke({
      resume: resumeText,
      jobDescription: jobDescriptionText,
    }),
    skillGapResultSchema,
    "SkillGapResult",
  );

  const criticalCount = result.gaps.filter(
    (g) => g.severity === "critical",
  ).length;

  logger.info(
    `Found ${result.gaps.length} gap(s) (${criticalCount} critical)`,
    "SkillGapChain",
  );

  return result;
}
