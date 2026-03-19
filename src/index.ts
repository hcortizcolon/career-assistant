import { resolve } from "node:path";
import { loadPdf } from "./loaders/pdf-loader.js";
import { loadText } from "./loaders/text-loader.js";
import { splitDocument } from "./splitters/chunk-splitter.js";
import { upsertDocuments } from "./vectorstore/pinecone-client.js";
import { scoreJobFit, type JobFitResult } from "./chains/job-fit-chain.js";
import { analyzeSkillGaps, type SkillGapResult } from "./chains/skill-gap-chain.js";
import { suggestRewrites, type RewriteResult } from "./chains/rewrite-chain.js";
import { askQuestion } from "./chains/retrieval-chain.js";
import { logger } from "./utils/logger.js";

// ---------------------------------------------------------------------------
// CLI command handlers
// ---------------------------------------------------------------------------

async function handleIngest(filePath: string, namespace: string): Promise<void> {
  const ext = filePath.toLowerCase();
  const doc = ext.endsWith(".pdf")
    ? await loadPdf(filePath)
    : await loadText(filePath);

  const chunks = await splitDocument(doc);
  await upsertDocuments(chunks, namespace);

  console.log(`Ingested ${chunks.length} chunks into namespace "${namespace}".`);
}

async function handleJobFit(
  resumePath: string,
  jdPath: string,
): Promise<void> {
  const resumeDoc = await loadForAnalysis(resumePath);
  const jdDoc = await loadForAnalysis(jdPath);

  const result: JobFitResult = await scoreJobFit(
    resumeDoc,
    jdDoc,
    { namespace: "resumes" },
  );

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

async function handleSkillGap(
  resumePath: string,
  jdPath: string,
): Promise<void> {
  const resumeDoc = await loadForAnalysis(resumePath);
  const jdDoc = await loadForAnalysis(jdPath);

  const result: SkillGapResult = await analyzeSkillGaps(resumeDoc, jdDoc);

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

async function handleRewrite(
  resumeSectionPath: string,
  jdPath: string,
): Promise<void> {
  const section = await loadForAnalysis(resumeSectionPath);
  const jd = await loadForAnalysis(jdPath);

  const result: RewriteResult = await suggestRewrites(section, jd);

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadForAnalysis(filePath: string): Promise<string> {
  const ext = filePath.toLowerCase();
  const doc = ext.endsWith(".pdf")
    ? await loadPdf(filePath)
    : await loadText(filePath);
  return doc.pageContent;
}

function printUsage(): void {
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
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  try {
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
        printUsage();
        break;
    }
  } catch (error) {
    logger.error(
      error instanceof Error ? error.message : String(error),
      "CLI",
    );
    process.exit(1);
  }
}

main();
