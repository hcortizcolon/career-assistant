import { resolve } from "node:path";
import {
  ConfigError,
  DocumentError,
  ChainError,
  LLMParseError,
  VectorStoreError,
  EmbeddingError,
} from "./errors/index.js";

// ---------------------------------------------------------------------------
// Error formatting — defined before imports that may throw (ConfigError)
// ---------------------------------------------------------------------------

// Logger may not be available if ConfigError was thrown during module init.
// Cache it once run() successfully imports modules.
let _debugLog: (msg: string, ctx: string) => void = () => {};

function handleError(error: unknown): never {

  if (error instanceof ConfigError) {
    console.error("\nConfiguration error:");
    if (error.missingVars.length > 0) {
      console.error(`  Missing variables: ${error.missingVars.join(", ")}`);
    }
    const issues = error.message.replace("Invalid environment configuration:\n", "");
    console.error(issues);
    console.error("\nSee .env.example for required configuration.");
    process.exit(1);
  }

  if (error instanceof DocumentError) {
    console.error(`\nDocument error: ${error.message}`);
    if (error.code === "DOCUMENT_NOT_FOUND") {
      console.error("Check that the file path is correct.");
    } else if (error.code === "DOCUMENT_UNSUPPORTED_TYPE") {
      console.error("Supported formats: .pdf, .txt, .md");
    } else if (error.code === "DOCUMENT_EMPTY") {
      console.error("The file exists but contains no text.");
    }
    process.exit(1);
  }

  if (error instanceof LLMParseError) {
    console.error("\nAI returned an unexpected response format.");
    console.error("This sometimes happens — please try again.");
    _debugLog(`Raw output: ${error.received}`, "CLI");
    process.exit(2);
  }

  if (error instanceof ChainError) {
    console.error(`\nAnalysis chain failed: ${error.message}`);
    console.error("Please try again. If the issue persists, check your OpenAI API key.");
    process.exit(2);
  }

  if (error instanceof VectorStoreError) {
    console.error(`\nVector database error: ${error.message}`);
    console.error("Check that your Pinecone index is configured and accessible.");
    process.exit(2);
  }

  if (error instanceof EmbeddingError) {
    console.error(`\nEmbedding service error: ${error.message}`);
    console.error("Check your OpenAI API key and that the embedding model is available.");
    process.exit(2);
  }

  // Unknown errors — show message, hide stack trace unless debug
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  if (error instanceof Error && error.stack) {
    _debugLog(error.stack, "CLI");
  }
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Lazy imports — these trigger env.ts which may throw ConfigError.
// By deferring them to run() we can catch that error.
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const { loadPdf } = await import("./loaders/pdf-loader.js");
  const { loadText } = await import("./loaders/text-loader.js");
  const { splitDocument } = await import("./splitters/chunk-splitter.js");
  const { upsertDocuments } = await import("./vectorstore/pinecone-client.js");
  const { scoreJobFit } = await import("./chains/job-fit-chain.js");
  const { analyzeSkillGaps } = await import("./chains/skill-gap-chain.js");
  const { suggestRewrites } = await import("./chains/rewrite-chain.js");
  const { askQuestion } = await import("./chains/retrieval-chain.js");
  const { logger } = await import("./utils/logger.js");
  _debugLog = (msg, ctx) => logger.debug(msg, ctx);

  // -------------------------------------------------------------------------
  // CLI command handlers
  // -------------------------------------------------------------------------

  async function handleIngest(filePath: string, namespace: string): Promise<void> {
    const ext = filePath.toLowerCase();
    const doc = ext.endsWith(".pdf")
      ? await loadPdf(filePath)
      : await loadText(filePath);

    const chunks = await splitDocument(doc);
    await upsertDocuments(chunks, namespace);

    console.log(`Ingested ${chunks.length} chunks into namespace "${namespace}".`);
  }

  async function handleJobFit(resumePath: string, jdPath: string): Promise<void> {
    const resumeDoc = await loadForAnalysis(resumePath);
    const jdDoc = await loadForAnalysis(jdPath);

    const result = await scoreJobFit(resumeDoc, jdDoc, { namespace: "resumes" });

    console.log("\n--- Job-Fit Assessment ---\n");
    console.log(`Overall Score: ${result.overallScore}/100\n`);

    for (const [key, dim] of Object.entries(result.dimensions)) {
      const label = key.replace(/([A-Z])/g, " $1").trim();
      console.log(`  ${label}: ${dim.score}/100 — ${dim.rationale}`);
    }

    console.log(`\nStrengths: ${result.topStrengths.join(", ")}`);
    console.log(`Concerns:  ${result.topConcerns.join(", ")}`);
    console.log(`\n${result.summary}`);
  }

  async function handleSkillGap(resumePath: string, jdPath: string): Promise<void> {
    const resumeDoc = await loadForAnalysis(resumePath);
    const jdDoc = await loadForAnalysis(jdPath);

    const result = await analyzeSkillGaps(resumeDoc, jdDoc);

    console.log("\n--- Skill Gap Analysis ---\n");
    console.log(result.readinessSummary);
    console.log();

    const bySeverity = { critical: [] as string[], important: [] as string[], "nice-to-have": [] as string[] };
    for (const gap of result.gaps) {
      bySeverity[gap.severity].push(`  - ${gap.skill}: ${gap.recommendation}`);
    }

    for (const [severity, items] of Object.entries(bySeverity)) {
      if (items.length > 0) {
        console.log(`[${severity.toUpperCase()}]`);
        items.forEach((item) => console.log(item));
        console.log();
      }
    }

    if (result.presentStrengths.length > 0) {
      console.log(`Matching strengths: ${result.presentStrengths.join(", ")}`);
    }
  }

  async function handleRewrite(resumeSectionPath: string, jdPath: string): Promise<void> {
    const section = await loadForAnalysis(resumeSectionPath);
    const jd = await loadForAnalysis(jdPath);

    const result = await suggestRewrites(section, jd);

    console.log("\n--- Rewrite Suggestions ---\n");
    for (const suggestion of result.suggestions) {
      console.log("Original:");
      console.log(`  ${suggestion.originalText}`);
      console.log("Suggested:");
      console.log(`  ${suggestion.rewrittenText}`);
      console.log(`  Why: ${suggestion.rationale}\n`);
    }

    if (result.generalAdvice.length > 0) {
      console.log("General advice:");
      result.generalAdvice.forEach((tip) => console.log(`  - ${tip}`));
    }
  }

  async function handleAsk(question: string): Promise<void> {
    const answer = await askQuestion(question, { namespace: "resumes" });
    console.log(`\n${answer}`);
  }

  async function loadForAnalysis(filePath: string): Promise<string> {
    const ext = filePath.toLowerCase();
    const doc = ext.endsWith(".pdf")
      ? await loadPdf(filePath)
      : await loadText(filePath);
    return doc.pageContent;
  }

  // -------------------------------------------------------------------------
  // Command dispatch
  // -------------------------------------------------------------------------

  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "ingest": {
      const [filePath, namespace] = args;
      if (!filePath || !namespace) {
        console.error("Usage: career-assistant ingest <file> <namespace>");
        process.exit(1);
      }
      await handleIngest(resolve(filePath), namespace);
      break;
    }

    case "job-fit": {
      const [resumePath, jdPath] = args;
      if (!resumePath || !jdPath) {
        console.error("Usage: career-assistant job-fit <resume> <jd>");
        process.exit(1);
      }
      await handleJobFit(resolve(resumePath), resolve(jdPath));
      break;
    }

    case "skill-gap": {
      const [resumePath, jdPath] = args;
      if (!resumePath || !jdPath) {
        console.error("Usage: career-assistant skill-gap <resume> <jd>");
        process.exit(1);
      }
      await handleSkillGap(resolve(resumePath), resolve(jdPath));
      break;
    }

    case "rewrite": {
      const [sectionPath, jdPath] = args;
      if (!sectionPath || !jdPath) {
        console.error("Usage: career-assistant rewrite <section> <jd>");
        process.exit(1);
      }
      await handleRewrite(resolve(sectionPath), resolve(jdPath));
      break;
    }

    case "ask": {
      const question = args.join(" ");
      if (!question) {
        console.error('Usage: career-assistant ask "<question>"');
        process.exit(1);
      }
      await handleAsk(question);
      break;
    }

    default:
      console.log(`
Career Assistant — RAG-powered resume optimization toolkit

Usage:
  career-assistant ingest <file> <namespace>     Ingest a PDF/text file into the vector store
  career-assistant job-fit <resume> <jd>          Score resume vs job description fit
  career-assistant skill-gap <resume> <jd>        Analyse skill gaps
  career-assistant rewrite <section> <jd>         Get rewrite suggestions for a resume section
  career-assistant ask "<question>"               Ask a question against ingested documents

Examples:
  career-assistant ingest ./resume.pdf resumes
  career-assistant job-fit ./resume.pdf ./jd.txt
  career-assistant skill-gap ./resume.pdf ./jd.txt
  career-assistant rewrite ./experience.txt ./jd.txt
  career-assistant ask "What are my strongest technical skills?"

Environment:
  See .env.example for required configuration.
`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Entry point — wraps run() so ConfigError thrown at import time is caught
// ---------------------------------------------------------------------------

run().catch(handleError);
