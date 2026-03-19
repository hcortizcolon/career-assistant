import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { jobFitScoringPrompt } from "../prompts/templates.js";
import { querySimilarWithScores } from "../vectorstore/pinecone-client.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Output schema — validates the LLM's JSON response
// ---------------------------------------------------------------------------

const dimensionSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
});

export const jobFitResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensions: z.object({
    technicalSkills: dimensionSchema,
    experienceLevel: dimensionSchema,
    domainRelevance: dimensionSchema,
    keywordCoverage: dimensionSchema,
    accomplishmentStrength: dimensionSchema,
  }),
  summary: z.string(),
  topStrengths: z.array(z.string()),
  topConcerns: z.array(z.string()),
});

export type JobFitResult = z.infer<typeof jobFitResultSchema>;

// ---------------------------------------------------------------------------
// Chain
// ---------------------------------------------------------------------------

export interface JobFitOptions {
  /** Pinecone namespace where resume chunks live. */
  namespace?: string;
  /** Number of resume chunks to retrieve for context enrichment. */
  k?: number;
  modelName?: string;
  temperature?: number;
}

/**
 * Build a job-fit scoring chain.
 *
 * Pipeline:
 *   1. Optionally enrich resume text with similar chunks from the vector store
 *      (useful when only a partial resume is provided).
 *   2. Pass resume + JD to the scoring prompt.
 *   3. Parse the LLM's JSON output and validate with Zod.
 *
 * This chain returns a strongly-typed `JobFitResult` object.
 */
export function createJobFitChain(options: JobFitOptions = {}) {
  const {
    modelName = env.OPENAI_CHAT_MODEL,
    temperature = 0.1,
  } = options;

  const llm = new ChatOpenAI({
    openAIApiKey: env.OPENAI_API_KEY,
    modelName,
    temperature,
  });

  const chain = RunnableSequence.from([
    jobFitScoringPrompt,
    llm,
    new StringOutputParser(),
  ]);

  return chain;
}

/**
 * Score how well a resume fits a job description.
 *
 * Accepts raw text for both inputs. Optionally enriches the resume with
 * additional context retrieved from Pinecone (e.g. when the resume was
 * previously ingested and only a summary is passed here).
 */
export async function scoreJobFit(
  resumeText: string,
  jobDescriptionText: string,
  options: JobFitOptions = {},
): Promise<JobFitResult> {
  const { k = 3, namespace } = options;

  logger.info("Running job-fit scoring", "JobFitChain");

  // Optionally enrich resume with related chunks from the vector store.
  let enrichedResume = resumeText;

  if (namespace) {
    try {
      const related = await querySimilarWithScores(
        jobDescriptionText,
        k,
        namespace,
      );

      if (related.length > 0) {
        const supplement = related
          .map(([doc, score]) => `[relevance: ${score.toFixed(3)}] ${doc.pageContent}`)
          .join("\n\n");

        enrichedResume = `${resumeText}\n\n--- Additional Context ---\n${supplement}`;
        logger.debug(
          `Enriched resume with ${related.length} related chunks`,
          "JobFitChain",
        );
      }
    } catch (error) {
      logger.warn(
        `Could not enrich from vector store: ${error instanceof Error ? error.message : String(error)}`,
        "JobFitChain",
      );
      // Fall through — scoring still works with the raw resume text.
    }
  }

  const chain = createJobFitChain(options);

  const raw = await chain.invoke({
    resume: enrichedResume,
    jobDescription: jobDescriptionText,
  });

  logger.debug(`Raw LLM output: ${raw.slice(0, 200)}...`, "JobFitChain");

  const parsed = JSON.parse(raw) as unknown;
  const result = jobFitResultSchema.parse(parsed);

  logger.info(
    `Job-fit overall score: ${result.overallScore}/100`,
    "JobFitChain",
  );

  return result;
}
