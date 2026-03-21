# Product Requirements Document — RAG Career Assistant

| Field | Value |
|---|---|
| **Document Version** | 1.0 |
| **Status** | Draft |
| **Author** | Caleb Recao |
| **Created** | 2026-03-20 |
| **Last Updated** | 2026-03-20 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [User Personas](#4-user-personas)
5. [User Stories](#5-user-stories)
6. [System Architecture](#6-system-architecture)
7. [Functional Requirements](#7-functional-requirements)
   - 7.1 [Document Ingestion Pipeline](#71-document-ingestion-pipeline)
   - 7.2 [Job-Fit Scoring](#72-job-fit-scoring)
   - 7.3 [Skill Gap Analysis](#73-skill-gap-analysis)
   - 7.4 [Resume Rewrite Suggestions](#74-resume-rewrite-suggestions)
   - 7.5 [Semantic Q&A](#75-semantic-qa)
   - 7.6 [Batch Job Comparison](#76-batch-job-comparison)
   - 7.7 [Interview Preparation](#77-interview-preparation)
   - 7.8 [LinkedIn Profile Ingestion](#78-linkedin-profile-ingestion)
   - 7.9 [PDF Report Export](#79-pdf-report-export)
   - 7.10 [Web UI](#710-web-ui)
   - 7.11 [REST API](#711-rest-api)
8. [Non-Functional Requirements](#8-non-functional-requirements)
   - 8.1 [Performance](#81-performance)
   - 8.2 [Security](#82-security)
   - 8.3 [Reliability & Error Handling](#83-reliability--error-handling)
   - 8.4 [Scalability](#84-scalability)
   - 8.5 [Observability](#85-observability)
   - 8.6 [Cost Management](#86-cost-management)
9. [Data Model](#9-data-model)
10. [Tech Stack](#10-tech-stack)
11. [Phased Delivery Plan](#11-phased-delivery-plan)
12. [Risks & Mitigations](#12-risks--mitigations)
13. [Open Questions](#13-open-questions)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

RAG Career Assistant is an AI-powered career intelligence tool that uses retrieval-augmented generation to provide job seekers with data-driven, hallucination-resistant feedback on their resumes. By embedding resume and job description documents into a vector store and running multi-step LLM chains against them, the system delivers job-fit scoring, skill gap analysis, and targeted resume rewrite suggestions — all grounded in the user's actual experience rather than LLM confabulation.

The product will launch as a CLI tool, expand into a REST API, and ultimately ship a web-based dashboard for non-technical users.

---

## 2. Problem Statement

### The Job Seeker's Pain

Job seekers face three compounding problems:

1. **Resume-JD mismatch blindness** — Candidates cannot objectively assess how well their resume aligns with a specific role. They apply to hundreds of jobs with the same generic resume, resulting in low callback rates.

2. **ATS black hole** — Applicant Tracking Systems filter resumes based on keyword matching. Candidates don't know which critical keywords they're missing until they've already been rejected.

3. **Resume writing is hard** — Translating real experience into high-impact bullet points that mirror a job description's language requires a specialized skill most people don't have. Existing tools (Grammarly, ChatGPT prompts) produce generic output not grounded in the candidate's actual documents.

### Why Existing Solutions Fall Short

| Solution | Limitation |
|---|---|
| Generic ChatGPT prompts | Hallucinates accomplishments, no document grounding, no structured scoring |
| Resume scanning tools (Jobscan, etc.) | Keyword matching only — no semantic understanding, no rewrite suggestions |
| Career coaches | Expensive ($200+/session), not scalable, turnaround in days |
| Job boards with "match %" | Opaque scoring, no actionable feedback, no rewrite path |

### How RAG Solves This

RAG grounds every LLM response in the user's actual documents retrieved from a vector store. The system never fabricates experience — it can only work with what the user has provided. This produces feedback that is simultaneously personalized, actionable, and trustworthy.

---

## 3. Goals & Success Metrics

### Primary Goals

| ID | Goal | Success Metric | Target |
|---|---|---|---|
| G-001 | Accurate job-fit scoring | Score correlation with human recruiter assessments | > 0.75 Pearson correlation |
| G-002 | Actionable skill gap identification | % of identified gaps rated "useful" by users | > 80% |
| G-003 | Resume quality improvement | Before/after ATS pass-through rate on test JDs | > 30% improvement |
| G-004 | Hallucination elimination | % of outputs containing fabricated information | < 2% |
| G-005 | User adoption (web launch) | Monthly active users within 3 months of web launch | 500 MAU |

### Secondary Goals

| ID | Goal | Success Metric | Target |
|---|---|---|---|
| G-006 | Fast feedback loop | Time from document upload to full analysis | < 30 seconds |
| G-007 | Multi-JD workflow | Users comparing resume against multiple JDs per session | > 3 JDs/session avg |
| G-008 | Cost efficiency | Average cost per full analysis (embed + LLM) | < $0.15/analysis |

---

## 4. User Personas

### Persona 1: Active Job Seeker ("Alex")

- **Demographics:** 2-6 years experience, software engineering or adjacent role
- **Behavior:** Applying to 10-30 jobs/week, tailoring resume manually for top picks
- **Pain:** Spends 20+ minutes per resume tailoring with no confidence it's working
- **Goal:** Quickly assess fit and get targeted rewrites for each application
- **Technical comfort:** Can use a CLI; prefers a web UI

### Persona 2: Career Switcher ("Jordan")

- **Demographics:** 5-15 years in one domain, targeting a new field
- **Behavior:** Unsure which skills transfer, which gaps to close first
- **Pain:** Doesn't know the language of the target industry; resume reads as "wrong background"
- **Goal:** Identify the highest-leverage skills to acquire and reframe existing experience
- **Technical comfort:** Needs a web UI; CLI is a non-starter

### Persona 3: Technical Power User ("Sam")

- **Demographics:** Developer or technical recruiter who wants programmatic access
- **Behavior:** Wants to batch-process resumes or integrate into hiring pipeline tooling
- **Pain:** Needs structured JSON output, not prose; needs an API
- **Goal:** Build workflows on top of the career assistant (CI for resumes, bulk candidate screening)
- **Technical comfort:** CLI-first; will use the REST API

---

## 5. User Stories

### Document Ingestion

| ID | Story | Priority |
|---|---|---|
| US-001 | As a user, I want to upload my resume (PDF or text) so the system can analyze it. | P0 |
| US-002 | As a user, I want to upload a job description so the system can compare it against my resume. | P0 |
| US-003 | As a user, I want to upload multiple documents and have them stored separately so I can reuse them across analyses. | P1 |
| US-004 | As a user, I want to paste a LinkedIn profile URL and have my profile auto-ingested. | P2 |

### Analysis

| ID | Story | Priority |
|---|---|---|
| US-010 | As a user, I want a composite fit score (0-100) so I can quickly gauge if a role is worth pursuing. | P0 |
| US-011 | As a user, I want per-dimension scoring (skills, experience, domain, keywords, accomplishments) so I know specifically where I'm strong or weak. | P0 |
| US-012 | As a user, I want skill gaps classified by severity so I can prioritize my upskilling. | P0 |
| US-013 | As a user, I want concrete recommendations for closing each gap (courses, certs, projects). | P0 |
| US-014 | As a user, I want before/after rewrite suggestions for my resume bullets so I can improve quickly. | P0 |
| US-015 | As a user, I want to ask free-form questions about my resume/JD documents and get grounded answers. | P1 |
| US-016 | As a user, I want to compare my resume against multiple JDs at once and see a ranked table. | P1 |
| US-017 | As a user, I want interview prep questions generated from my skill gaps. | P2 |

### Output & Export

| ID | Story | Priority |
|---|---|---|
| US-020 | As a user, I want all analysis output as structured JSON so I can consume it programmatically. | P0 |
| US-021 | As a user, I want to export a polished PDF report of my full analysis. | P2 |
| US-022 | As a user, I want a web dashboard showing my scores, gaps, and suggestions visually. | P1 |

### Platform

| ID | Story | Priority |
|---|---|---|
| US-030 | As a developer, I want a REST API so I can integrate career assistant into other tools. | P1 |
| US-031 | As a user, I want to use the tool via a web browser without installing anything. | P1 |
| US-032 | As a user, I want my data isolated from other users' data. | P0 |

---

## 6. System Architecture

### Current Architecture (Phase 1 — CLI)

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI (src/index.ts)                       │
│  Commands: ingest | job-fit | skill-gap | rewrite | ask          │
└──────────────┬───────────────────────────────────────────────────┘
               │
       ┌───────▼───────┐
       │  Document      │
       │  Pipeline      │
       │                │
       │  ┌───────────┐ │     ┌─────────────────┐
       │  │  Loaders   │─┼────▶  PDF / Text      │
       │  │  (pdf/txt) │ │     │  Source Files    │
       │  └─────┬─────┘ │     └─────────────────┘
       │        │        │
       │  ┌─────▼─────┐ │
       │  │  Chunker   │ │  RecursiveCharacterTextSplitter
       │  │  (1000/200)│ │  separators: ¶ → \n → . → , → ␣
       │  └─────┬─────┘ │
       │        │        │
       │  ┌─────▼─────┐ │     ┌─────────────────┐
       │  │  Embedder  │─┼────▶  OpenAI API      │
       │  │  (ada-002) │ │     │  1536-dim        │
       │  └─────┬─────┘ │     └─────────────────┘
       │        │        │
       └────────┼────────┘
                │
       ┌────────▼────────┐
       │   Pinecone       │
       │   Vector Store   │
       │                  │
       │   Namespaces:    │
       │   • resumes      │
       │   • job-descs    │
       └────────┬────────┘
                │
   ┌────────────┼────────────┬────────────┐
   │            │            │            │
┌──▼──┐   ┌────▼───┐  ┌─────▼──┐  ┌─────▼────┐
│ RAG  │   │Job-Fit │  │ Skill  │  │ Rewrite  │
│ Q&A  │   │Scoring │  │  Gap   │  │ Suggest. │
│Chain │   │ Chain  │  │ Chain  │  │  Chain   │
└──┬──┘   └────┬───┘  └─────┬──┘  └─────┬────┘
   │           │            │            │
   └───────────┴────────────┴────────────┘
               │
        ┌──────▼──────┐
        │  OpenAI LLM  │
        │  (gpt-4o)    │
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │  Zod Schema  │
        │  Validation  │
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │  Structured  │
        │  JSON Output │
        └─────────────┘
```

### Target Architecture (Phase 3 — Web)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Next.js     │────▶│  REST API    │────▶│  Core Engine          │
│  Dashboard   │◀────│  (Express/   │◀────│  (chains, loaders,    │
│              │     │   Hono)      │     │   vectorstore)        │
└─────────────┘     └──────┬───────┘     └───────────┬──────────┘
                           │                         │
                    ┌──────▼───────┐          ┌──────▼──────┐
                    │  Auth Layer  │          │  Pinecone   │
                    │  (Clerk/     │          │  (per-user  │
                    │   NextAuth)  │          │  namespace) │
                    └──────┬───────┘          └─────────────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    │  (users,     │
                    │   sessions,  │
                    │   history)   │
                    └──────────────┘
```

---

## 7. Functional Requirements

---

### 7.1 Document Ingestion Pipeline

**Purpose:** Accept user documents (resumes, job descriptions), extract text, split into semantically coherent chunks, embed, and store in the vector database for downstream retrieval.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-100 | System shall accept PDF files and extract all text content. | Given a multi-page PDF with mixed formatting, when ingested, then all text is extracted and no pages are silently skipped. Empty PDFs produce a clear error. | P0 | Implemented |
| FR-101 | System shall accept plain text files (.txt, .md). | Given a UTF-8 text file, when ingested, then full content is loaded. Empty files produce a clear error. | P0 | Implemented |
| FR-102 | System shall split documents using recursive character text splitting. | Given a document, when split, then chunks are ≤ `CHUNK_SIZE` characters (default 1000) with `CHUNK_OVERLAP` overlap (default 200). Splits prefer paragraph → line → sentence → word → character boundaries. | P0 | Implemented |
| FR-103 | Each chunk shall retain source metadata. | Given a split document, each chunk document shall contain `source` (file path), `format` (pdf/txt/md), `chunkIndex`, and `totalChunks` in its metadata. | P0 | Implemented |
| FR-104 | System shall embed chunks using OpenAI embeddings. | Given document chunks, when embedded, then each chunk produces a 1536-dimensional vector (text-embedding-3-small) or matches the configured model's output dimensions. Batch embedding is used for > 1 document. | P0 | Implemented |
| FR-105 | System shall upsert embedded chunks to Pinecone under a specified namespace. | Given embedded chunks and a namespace, when upserted, then all chunks are queryable in that namespace. Duplicate upserts do not create duplicate vectors. | P0 | Implemented |
| FR-106 | System shall support configurable chunk size and overlap via environment variables. | Given `CHUNK_SIZE=500` and `CHUNK_OVERLAP=100` in .env, when a document is split, then chunks respect those values. | P0 | Implemented |
| FR-107 | System shall support ingesting multiple files in sequence via CLI. | Given `career-assistant ingest file1.pdf resumes && career-assistant ingest file2.pdf resumes`, both files are ingested into the same namespace. | P1 | Implemented |
| FR-108 | System shall validate file existence and readability before processing. | Given a non-existent file path, when ingest is attempted, then a descriptive error is raised (not an unhandled ENOENT). | P1 | Not Implemented |
| FR-109 | System shall support DOCX file ingestion. | Given a .docx file, when ingested, then text content is extracted from all paragraphs, tables, and headers. | P2 | Not Implemented |
| FR-110 | System shall deduplicate documents on re-ingestion. | Given a previously ingested file that has been modified, when re-ingested, then old vectors for that source are deleted before new vectors are upserted. | P2 | Not Implemented |

---

### 7.2 Job-Fit Scoring

**Purpose:** Quantitatively assess how well a resume matches a job description across multiple dimensions, returning a structured, validated result that enables both human review and programmatic consumption.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-200 | System shall produce a composite fit score from 0 to 100. | Given a resume and JD, the output JSON contains an `overallScore` field that is an integer between 0 and 100 inclusive. | P0 | Implemented |
| FR-201 | System shall score five distinct dimensions. | Output contains `dimensions` object with keys: `technicalSkills`, `experienceLevel`, `domainRelevance`, `keywordCoverage`, `accomplishmentStrength`. Each has `score` (0-100) and `rationale` (string). | P0 | Implemented |
| FR-202 | System shall identify top strengths and concerns. | Output contains `topStrengths` (string array, ≥ 1 item) and `topConcerns` (string array, ≥ 1 item). | P0 | Implemented |
| FR-203 | System shall produce a natural-language summary. | Output contains a `summary` field (2-3 sentences) explaining the overall assessment. | P0 | Implemented |
| FR-204 | All scoring output shall be validated against a Zod schema at runtime. | If the LLM produces malformed JSON or out-of-range values, the system throws a parse error rather than passing invalid data downstream. | P0 | Implemented |
| FR-205 | System shall optionally enrich resume context from the vector store. | Given a `namespace` option, the system queries Pinecone for top-k chunks related to the JD and appends them to the resume context before scoring. This enrichment is logged. | P1 | Implemented |
| FR-206 | Scoring temperature shall be low (≤ 0.2) to maximize consistency. | Given the same resume and JD, running the scoring chain 5 times produces overall scores with a standard deviation ≤ 5 points. | P0 | Implemented (temp=0.1) |
| FR-207 | System shall support configurable model override. | Given `modelName: "gpt-4o-mini"` in options, the chain uses that model instead of the default. | P1 | Implemented |
| FR-208 | System shall handle LLM refusal or non-JSON output gracefully. | If the LLM returns prose instead of JSON (e.g. "I can't evaluate this"), the system catches the JSON parse error and returns a descriptive error to the user. | P1 | Partial (catches JSON.parse error, no user-friendly message) |
| FR-209 | System shall support weighted dimension scoring. | Given user-defined weights per dimension (e.g., `technicalSkills: 0.3`), the `overallScore` is computed as the weighted average rather than a simple average. | P2 | Not Implemented |
| FR-210 | System shall persist scoring history per user. | Given a user identity, all scoring results are stored with timestamp, resume ID, and JD ID for historical comparison. | P2 | Not Implemented |

---

### 7.3 Skill Gap Analysis

**Purpose:** Identify specific skills, technologies, and qualifications present in a job description but absent from the resume, classify them by severity, and provide actionable remediation steps.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-300 | System shall identify individual skill gaps between resume and JD. | Output contains a `gaps` array where each entry has `skill` (string), `severity`, `context`, and `recommendation`. | P0 | Implemented |
| FR-301 | Each gap shall be classified as `critical`, `important`, or `nice-to-have`. | The `severity` field is an enum validated by Zod. Classification reflects the JD's language (e.g., "required" → critical, "preferred" → important, "bonus" → nice-to-have). | P0 | Implemented |
| FR-302 | Each gap shall include context explaining where it appears in the JD. | The `context` field references the specific JD section or requirement that creates this gap. | P0 | Implemented |
| FR-303 | Each gap shall include a concrete, actionable recommendation. | Recommendations shall be specific (e.g., "Complete the AWS Solutions Architect certification on A Cloud Guru") not generic (e.g., "learn more about AWS"). | P0 | Implemented |
| FR-304 | System shall identify present strengths that align with the JD. | Output contains `presentStrengths` string array listing skills the candidate already has that match the role. | P0 | Implemented |
| FR-305 | System shall provide an overall readiness summary. | Output contains `readinessSummary` (2-3 sentences) assessing the candidate's readiness for the role. | P0 | Implemented |
| FR-306 | All gap analysis output shall be Zod-validated. | Malformed LLM output triggers a parse error, not silent data corruption. | P0 | Implemented |
| FR-307 | System shall use a slightly higher temperature (0.2) than scoring for nuanced analysis. | Chain is configured with `temperature: 0.2`. | P0 | Implemented |
| FR-308 | System shall distinguish between semantic matches and exact keyword matches. | If the resume says "React" and the JD says "React.js", these are treated as equivalent (not flagged as a gap). The LLM's semantic understanding handles this via prompt engineering. | P1 | Implemented (via prompt) |
| FR-309 | System shall support gap analysis enriched by vector store context. | Given a namespace, the system retrieves additional resume chunks to reduce false-positive gap identification. | P2 | Not Implemented |
| FR-310 | System shall generate a learning path from gap analysis. | Given a skill gap result, the system produces an ordered sequence of learning activities with estimated time investment. | P2 | Not Implemented |

---

### 7.4 Resume Rewrite Suggestions

**Purpose:** Generate targeted, grounded improvements to resume sections that mirror the target JD's language and follow professional resume writing best practices (XYZ formula), without fabricating accomplishments.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-400 | System shall accept a resume section and JD as input. | The chain accepts `resumeSection` (text of the section to improve) and `jobDescription` (target JD text). | P0 | Implemented |
| FR-401 | System shall produce before/after rewrite pairs. | Output contains a `suggestions` array. Each entry has `originalText`, `rewrittenText`, and `rationale`. | P0 | Implemented |
| FR-402 | Rewrites shall follow the XYZ formula. | The prompt instructs: "Accomplished [X] as measured by [Y], by doing [Z]." Rewritten text should reflect this pattern where applicable. | P0 | Implemented |
| FR-403 | Rewrites shall never fabricate accomplishments. | The prompt explicitly states: "Preserve the candidate's authentic experience — never fabricate accomplishments." Any metrics or claims in rewritten text must be derivable from the original. | P0 | Implemented (via prompt) |
| FR-404 | Rewrites shall mirror JD keywords naturally. | Rewritten text incorporates keywords from the job description without keyword stuffing. The `rationale` explains which keywords were incorporated and why. | P0 | Implemented (via prompt) |
| FR-405 | System shall provide general advice alongside specific suggestions. | Output contains `generalAdvice` string array with additional tips beyond the specific rewrites. | P0 | Implemented |
| FR-406 | All rewrite output shall be Zod-validated. | Malformed LLM output triggers a parse error. | P0 | Implemented |
| FR-407 | Rewrite chain shall use moderate temperature (0.4) for creative variation. | Higher than scoring chains to allow varied phrasing, while still constrained by the grounding prompt. | P0 | Implemented |
| FR-408 | System shall support rewriting the full resume (all sections). | Given a full resume and JD, the system processes each identifiable section (summary, experience, skills, education) and returns suggestions per section. | P1 | Not Implemented |
| FR-409 | System shall support multiple JD targeting. | Given a resume section and 2+ JDs, the system produces a unified rewrite that balances all targets, noting which suggestions are JD-specific. | P2 | Not Implemented |
| FR-410 | System shall generate a complete rewritten resume as a single document. | Given the original resume and all accepted suggestions, produce a final, coherent document ready for submission. | P2 | Not Implemented |

---

### 7.5 Semantic Q&A

**Purpose:** Allow users to ask free-form natural-language questions about their ingested documents and receive answers grounded strictly in the retrieved context.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-500 | System shall accept a natural-language question and return a grounded answer. | Given a question and a populated namespace, the system retrieves relevant chunks and produces an answer that cites only information from those chunks. | P0 | Implemented |
| FR-501 | System shall retrieve top-k document chunks for context. | Default k=5, configurable. Retrieved chunks are formatted as numbered references `[1]`, `[2]`, etc. | P0 | Implemented |
| FR-502 | The retrieval chain shall use LCEL composition. | Chain is built as: `question → retriever.pipe(formatDocs) → prompt → LLM → StringOutputParser`. Each step is individually testable. | P0 | Implemented |
| FR-503 | System shall refuse to answer when context is insufficient. | The system prompt instructs: "If the context does not contain enough information, say so — never fabricate details." | P0 | Implemented (via prompt) |
| FR-504 | System shall support namespace-scoped queries. | Given `namespace: "resumes"`, only chunks from that namespace are retrieved. | P0 | Implemented |
| FR-505 | System shall support follow-up questions with conversation history. | Given a prior Q&A exchange, the system incorporates previous context into the next retrieval and response. | P2 | Not Implemented |
| FR-506 | System shall return source references with the answer. | The answer includes citations indicating which chunk(s) informed each claim. | P2 | Not Implemented |

---

### 7.6 Batch Job Comparison

**Purpose:** Allow users to compare their resume against multiple job descriptions simultaneously and receive a ranked comparison table.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-600 | System shall accept one resume and N job descriptions. | Given 1 resume file and a directory or list of JD files, the system processes all pairs. | P1 | Not Implemented |
| FR-601 | System shall return a ranked table sorted by overall fit score. | Output is an array of `{ jobTitle, source, overallScore, topStrength, topConcern }` sorted descending by `overallScore`. | P1 | Not Implemented |
| FR-602 | Batch processing shall run JD comparisons concurrently. | Given 10 JDs, the system processes them in parallel (bounded concurrency to respect rate limits) rather than sequentially. | P1 | Not Implemented |
| FR-603 | System shall produce a summary recommending the top N roles. | After ranking, a natural-language summary recommends the top 3 best-fit roles with justification. | P2 | Not Implemented |
| FR-604 | System shall support incremental batch runs. | If a user adds a new JD to an existing batch, only the new JD is scored — previous results are cached. | P2 | Not Implemented |

---

### 7.7 Interview Preparation

**Purpose:** Generate targeted interview questions and preparation guidance based on the identified skill gaps and job requirements.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-700 | System shall generate interview questions from skill gaps. | Given a skill gap result, the system produces 3-5 interview questions per critical/important gap, focusing on areas where the candidate is weakest. | P2 | Not Implemented |
| FR-701 | Questions shall include suggested answer frameworks. | Each question includes a STAR-format answer skeleton the candidate can personalize with their own experience. | P2 | Not Implemented |
| FR-702 | System shall generate behavioral questions from the JD. | Given a JD, the system identifies likely behavioral questions based on the role's responsibilities and team context. | P2 | Not Implemented |
| FR-703 | System shall generate technical questions aligned to the JD's tech stack. | Given a JD with "Kubernetes, Kafka, TypeScript", the system produces technical deep-dive questions for each technology at the appropriate seniority level. | P2 | Not Implemented |

---

### 7.8 LinkedIn Profile Ingestion

**Purpose:** Allow users to provide their LinkedIn profile URL and automatically extract structured career data for analysis.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-800 | System shall accept a LinkedIn profile URL and extract career data. | Given a public LinkedIn URL, the system extracts: headline, summary, experience entries, education, skills, certifications. | P2 | Not Implemented |
| FR-801 | Extracted LinkedIn data shall be converted to LangChain Documents. | The extracted text is structured into a Document with metadata `{ source: "linkedin", profileUrl }` and processed through the standard ingestion pipeline. | P2 | Not Implemented |
| FR-802 | System shall handle private profiles gracefully. | If a profile is private or inaccessible, the system returns a clear error suggesting the user export their profile as PDF instead. | P2 | Not Implemented |
| FR-803 | System shall support LinkedIn PDF export as an alternative. | LinkedIn's "Save to PDF" export is parsed as a standard PDF ingestion. | P2 | Not Implemented |

---

### 7.9 PDF Report Export

**Purpose:** Generate a polished, downloadable PDF report containing the full analysis (scores, gaps, rewrites) for sharing with mentors, career coaches, or personal records.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-900 | System shall generate a PDF report from a complete analysis. | Given job-fit scoring, skill gap analysis, and rewrite suggestion results, the system produces a formatted PDF. | P2 | Not Implemented |
| FR-901 | Report shall include visual score representations. | Dimension scores are shown as bar charts or radar charts. Overall score is prominently displayed. | P2 | Not Implemented |
| FR-902 | Report shall include all skill gaps with severity color-coding. | Critical = red, Important = yellow, Nice-to-have = gray. Each gap includes its recommendation. | P2 | Not Implemented |
| FR-903 | Report shall include before/after rewrite comparisons. | Side-by-side or stacked layout showing original text vs. suggested rewrite with rationale. | P2 | Not Implemented |
| FR-904 | Report shall include metadata. | Report header includes: date generated, resume source, JD source, model used, analysis version. | P2 | Not Implemented |

---

### 7.10 Web UI

**Purpose:** Provide a browser-based dashboard for non-technical users to upload documents, view analyses, and manage their career intelligence.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-1000 | Web UI shall provide document upload via drag-and-drop. | User can drag a PDF/text file onto the upload zone. Upload shows progress and success/error states. | P1 | Not Implemented |
| FR-1001 | Web UI shall display job-fit scores as a dashboard. | Dashboard shows: overall score (large number), dimension scores (bar/radar chart), strengths (green chips), concerns (red chips), summary text. | P1 | Not Implemented |
| FR-1002 | Web UI shall display skill gaps as a prioritized list. | Gaps are grouped by severity with visual indicators. Each gap is expandable to show context and recommendation. | P1 | Not Implemented |
| FR-1003 | Web UI shall display rewrite suggestions as inline diffs. | Original and suggested text shown side-by-side with a "copy" button for each suggestion. | P1 | Not Implemented |
| FR-1004 | Web UI shall support multi-JD comparison view. | A table/card layout showing resume vs. multiple JDs with sortable columns and a "best fit" highlight. | P2 | Not Implemented |
| FR-1005 | Web UI shall be responsive (mobile-friendly). | Layout adapts to mobile viewports (≥ 375px width). Core analysis flow is usable on mobile. | P2 | Not Implemented |
| FR-1006 | Web UI shall use Next.js with App Router. | Framework choice aligns with the TypeScript stack and enables SSR for performance. | P1 | Not Implemented |
| FR-1007 | Web UI shall include a conversational Q&A panel. | A chat-style interface where users can ask follow-up questions about their analysis. | P2 | Not Implemented |

---

### 7.11 REST API

**Purpose:** Expose the core engine as a programmatic API for integration with third-party tools, CI/CD pipelines, and the web frontend.

| Req ID | Requirement | Acceptance Criteria | Priority | Status |
|---|---|---|---|---|
| FR-1100 | API shall expose `POST /api/ingest` for document ingestion. | Accepts multipart file upload + namespace. Returns `{ chunksCreated, namespace }`. | P1 | Not Implemented |
| FR-1101 | API shall expose `POST /api/job-fit` for scoring. | Accepts `{ resumeText, jobDescriptionText, options? }`. Returns `JobFitResult` JSON. | P1 | Not Implemented |
| FR-1102 | API shall expose `POST /api/skill-gap` for gap analysis. | Accepts `{ resumeText, jobDescriptionText }`. Returns `SkillGapResult` JSON. | P1 | Not Implemented |
| FR-1103 | API shall expose `POST /api/rewrite` for rewrite suggestions. | Accepts `{ resumeSection, jobDescriptionText }`. Returns `RewriteResult` JSON. | P1 | Not Implemented |
| FR-1104 | API shall expose `POST /api/ask` for semantic Q&A. | Accepts `{ question, namespace }`. Returns `{ answer, sources? }`. | P1 | Not Implemented |
| FR-1105 | API shall expose `POST /api/batch/job-fit` for batch comparison. | Accepts `{ resumeText, jobDescriptions: string[] }`. Returns array of `JobFitResult` sorted by score. | P2 | Not Implemented |
| FR-1106 | All API endpoints shall require authentication. | Unauthenticated requests receive 401. API keys or JWT tokens are supported. | P1 | Not Implemented |
| FR-1107 | API shall enforce per-user rate limits. | Default: 60 requests/minute per user. Rate-limited requests receive 429 with `Retry-After` header. | P1 | Not Implemented |
| FR-1108 | API shall return consistent error response format. | All errors return `{ error: { code, message, details? } }` with appropriate HTTP status codes. | P1 | Not Implemented |

---

## 8. Non-Functional Requirements

---

### 8.1 Performance

| Req ID | Requirement | Target | Notes |
|---|---|---|---|
| NFR-100 | Single document ingestion (PDF ≤ 10 pages) | < 10 seconds | Includes: load, split, embed, upsert |
| NFR-101 | Job-fit scoring (single pair) | < 15 seconds | Dominated by LLM inference time |
| NFR-102 | Skill gap analysis (single pair) | < 15 seconds | Similar to job-fit scoring |
| NFR-103 | Rewrite suggestions (single section) | < 20 seconds | Higher temperature may increase token generation |
| NFR-104 | Semantic Q&A (single question) | < 10 seconds | Retrieval (< 2s) + LLM (< 8s) |
| NFR-105 | Batch comparison (10 JDs) | < 60 seconds | Concurrent with bounded parallelism (3-5) |
| NFR-106 | Pinecone similarity search (top-5) | < 500ms | Pinecone's SLA; independent of dataset size |
| NFR-107 | Web UI time-to-interactive | < 3 seconds | Next.js SSR + code splitting |
| NFR-108 | API p95 response time | < 20 seconds | Dominated by LLM; streaming mitigates perceived latency |

---

### 8.2 Security

| Req ID | Requirement | Details |
|---|---|---|
| NFR-200 | API keys shall never be committed to source control. | `.env` is in `.gitignore`. `.env.example` contains only placeholder values. Zod validation fails fast on missing keys. |
| NFR-201 | User documents shall be isolated by namespace. | Each user's data is stored in a Pinecone namespace derived from their user ID. No cross-namespace queries are possible. |
| NFR-202 | API authentication shall be required for all endpoints. | JWT or API key authentication. No anonymous access to analysis endpoints. |
| NFR-203 | File uploads shall be validated and size-limited. | Max file size: 10MB. Allowed types: `.pdf`, `.txt`, `.md`, `.docx`. MIME type validation, not just extension. |
| NFR-204 | LLM prompt injection shall be mitigated. | User-provided text is inserted into template variables, never concatenated into system prompts. Structured output validation rejects unexpected formats. |
| NFR-205 | Data at rest shall be encrypted. | Pinecone encrypts data at rest by default. PostgreSQL (when added) shall use encrypted volumes. |
| NFR-206 | Data in transit shall use TLS. | All API communication (OpenAI, Pinecone, client-server) over HTTPS/TLS 1.2+. |
| NFR-207 | Users shall be able to delete their data. | A `DELETE /api/user/data` endpoint purges all vectors in the user's namespace and any stored analysis history. GDPR/CCPA compliance. |
| NFR-208 | Dependency vulnerabilities shall be monitored. | `npm audit` runs in CI. Critical/high vulnerabilities block merges. |

---

### 8.3 Reliability & Error Handling

| Req ID | Requirement | Details |
|---|---|---|
| NFR-300 | Environment misconfiguration shall fail fast. | On startup, Zod validates all env vars. Missing or invalid keys produce a formatted error listing every issue. The application does not partially boot. |
| NFR-301 | LLM API failures shall be retried with exponential backoff. | OpenAI 429/500/503 errors are retried up to 3 times with 1s/2s/4s delays. After 3 failures, the error is surfaced to the user. |
| NFR-302 | Pinecone connection failures shall not crash the application. | Vector store errors during enrichment (FR-205) fall through gracefully — the analysis proceeds with the raw input text. Connection errors during ingestion surface a clear error. |
| NFR-303 | Invalid LLM output shall produce actionable errors. | If JSON parsing or Zod validation fails on LLM output, the error message includes: what was expected, what was received (truncated), and a suggestion to retry. |
| NFR-304 | Empty/corrupt documents shall be rejected at load time. | PDF extraction yielding empty text or empty text files produce descriptive errors before any embedding or LLM calls are made. |
| NFR-305 | CLI shall exit with appropriate codes. | Success = 0, user error (bad args) = 1, system error (API failure) = 2. Errors are logged via the logger, not raw stack traces. |

---

### 8.4 Scalability

| Req ID | Requirement | Details |
|---|---|---|
| NFR-400 | System shall support 1,000+ concurrent users (web phase). | Stateless API design. Vector store isolation via namespaces. Horizontal scaling via container replicas. |
| NFR-401 | Pinecone index shall support 1M+ vectors. | One index with per-user namespaces. Pinecone's serverless tier auto-scales. Monitor pod utilization if using pod-based. |
| NFR-402 | LLM calls shall be parallelizable. | Batch comparison (FR-602) uses bounded concurrency (semaphore pattern) to respect OpenAI rate limits while maximizing throughput. |
| NFR-403 | Embedding batches shall be optimized. | The singleton `OpenAIEmbeddings` instance uses `embedDocuments` for batch calls rather than sequential `embedQuery` calls. |

---

### 8.5 Observability

| Req ID | Requirement | Details |
|---|---|---|
| NFR-500 | Application shall log at configurable levels. | `LOG_LEVEL` env var controls output: `debug`, `info`, `warn`, `error`. Default: `info`. |
| NFR-501 | All logs shall include timestamp, level, and context tag. | Format: `2026-03-20T10:30:00.000Z INFO  [ChainName] message`. Color-coded in terminal. |
| NFR-502 | Each chain execution shall log entry and exit. | Entry: input description. Exit: key output metrics (score, gap count, suggestion count). Duration logged at debug level. |
| NFR-503 | LLM token usage shall be trackable. | API phase: log `prompt_tokens`, `completion_tokens`, and `total_tokens` per chain invocation for cost monitoring. |
| NFR-504 | Errors shall be logged with full context. | Error logs include the operation that failed, input summary (truncated), and the error message/stack. |
| NFR-505 | Web phase shall integrate structured logging. | Replace console-based logger with a structured JSON logger (e.g., pino) suitable for log aggregation (Datadog, CloudWatch). |

---

### 8.6 Cost Management

| Req ID | Requirement | Details |
|---|---|---|
| NFR-600 | Average cost per full analysis shall be < $0.15. | Full analysis = embed resume + embed JD + job-fit + skill-gap + rewrite. Estimated breakdown below. |
| NFR-601 | System shall support model downgrade for cost reduction. | Users can set `OPENAI_CHAT_MODEL=gpt-4o-mini` to reduce LLM costs by ~10x at the expense of output quality. |
| NFR-602 | Pinecone free tier shall be sufficient for MVP. | Free tier: 1 index, 100K vectors. At ~10 chunks/document and 100 documents, that's 1,000 vectors — well within limits. |

**Cost Estimation Per Full Analysis (gpt-4o):**

| Operation | Input Tokens | Output Tokens | Cost |
|---|---|---|---|
| Embed resume (~5 chunks) | ~2,500 | — | ~$0.0003 |
| Embed JD (~3 chunks) | ~1,500 | — | ~$0.0002 |
| Job-fit scoring | ~2,000 | ~500 | ~$0.0138 |
| Skill gap analysis | ~2,000 | ~600 | ~$0.0150 |
| Rewrite suggestions | ~1,500 | ~800 | ~$0.0145 |
| **Total** | | | **~$0.044** |

*Estimate based on gpt-4o pricing ($2.50/1M input, $10.00/1M output) and text-embedding-3-small ($0.02/1M tokens). Actual costs vary with document length. Using gpt-4o-mini reduces LLM costs to ~$0.005/analysis.*

---

## 9. Data Model

### Vector Store (Pinecone)

```
Index: career-assistant
├── Namespace: user_{userId}_resumes
│   └── Vector
│       ├── id: string (auto-generated)
│       ├── values: number[1536]
│       └── metadata:
│           ├── source: string (file path or "linkedin")
│           ├── format: "pdf" | "txt" | "md" | "docx"
│           ├── chunkIndex: number
│           ├── totalChunks: number
│           ├── pages?: number (PDF only)
│           └── [custom metadata]
│
├── Namespace: user_{userId}_job-descriptions
│   └── (same vector schema)
```

### Analysis Output Schemas

```typescript
// Job-Fit Result
{
  overallScore: number           // 0-100
  dimensions: {
    technicalSkills:        { score: number, rationale: string }
    experienceLevel:        { score: number, rationale: string }
    domainRelevance:        { score: number, rationale: string }
    keywordCoverage:        { score: number, rationale: string }
    accomplishmentStrength: { score: number, rationale: string }
  }
  summary: string
  topStrengths: string[]
  topConcerns: string[]
}

// Skill Gap Result
{
  gaps: Array<{
    skill: string
    severity: "critical" | "important" | "nice-to-have"
    context: string
    recommendation: string
  }>
  presentStrengths: string[]
  readinessSummary: string
}

// Rewrite Result
{
  suggestions: Array<{
    originalText: string
    rewrittenText: string
    rationale: string
  }>
  generalAdvice: string[]
}
```

### Relational Database (Phase 3 — PostgreSQL)

```
users
├── id: UUID (PK)
├── email: string (unique)
├── created_at: timestamp
└── updated_at: timestamp

documents
├── id: UUID (PK)
├── user_id: UUID (FK → users)
├── type: "resume" | "job_description"
├── filename: string
├── namespace: string
├── chunk_count: integer
├── created_at: timestamp
└── deleted_at: timestamp (soft delete)

analyses
├── id: UUID (PK)
├── user_id: UUID (FK → users)
├── resume_id: UUID (FK → documents)
├── jd_id: UUID (FK → documents)
├── type: "job_fit" | "skill_gap" | "rewrite"
├── result: JSONB
├── model_used: string
├── tokens_used: integer
├── cost_usd: decimal
├── created_at: timestamp
└── duration_ms: integer
```

---

## 10. Tech Stack

### Current (Phase 1)

| Component | Technology | Justification |
|---|---|---|
| Language | TypeScript 5.6+ (strict) | Type safety, ecosystem, portfolio appeal |
| Runtime | Node.js 20+ / tsx | ESM support, top-level await |
| LLM Orchestration | LangChain 0.3 (LCEL) | Composable chain primitives, streaming, batching |
| Embeddings | OpenAI text-embedding-3-small | Best cost/quality ratio for document search |
| Chat Model | OpenAI gpt-4o | Strongest structured output and instruction following |
| Vector DB | Pinecone (serverless) | Managed, free tier, LangChain integration |
| Validation | Zod 3.23 | Runtime schema validation, TypeScript inference |
| Testing | Vitest 2.1 | Fast, ESM-native, watch mode, vi.mock |
| PDF Parsing | pdf-parse 1.1 | Lightweight, no native dependencies |

### Planned (Phase 2-3)

| Component | Technology | Justification |
|---|---|---|
| Web Framework | Next.js 15 (App Router) | SSR, API routes, React Server Components |
| API Layer | Next.js API routes or Hono | Lightweight, TypeScript-native |
| Auth | Clerk or NextAuth.js | Managed auth with OAuth providers |
| Database | PostgreSQL (Neon/Supabase) | Serverless Postgres for user/analysis storage |
| ORM | Drizzle | Type-safe, lightweight, SQL-first |
| PDF Generation | @react-pdf/renderer | React-based PDF templating |
| Charts | Recharts or Chart.js | Dashboard visualizations |
| Deployment | Vercel | Zero-config Next.js deployment |
| Logging | Pino | Structured JSON logging for production |
| Monitoring | Vercel Analytics + Sentry | Performance monitoring + error tracking |

---

## 11. Phased Delivery Plan

### Phase 1 — Core CLI Engine (Current)

**Goal:** Working RAG pipeline with all four analysis chains, CLI interface, and test coverage.

| Deliverable | Status | Notes |
|---|---|---|
| Document ingestion (PDF + text) | Done | FR-100 through FR-107 |
| Chunk splitter with configurable params | Done | FR-102, FR-106 |
| OpenAI embedding integration | Done | FR-104 |
| Pinecone vector store (upsert + query) | Done | FR-105 |
| Job-fit scoring chain | Done | FR-200 through FR-207 |
| Skill gap analysis chain | Done | FR-300 through FR-307 |
| Resume rewrite chain | Done | FR-400 through FR-407 |
| Semantic Q&A chain | Done | FR-500 through FR-504 |
| CLI with 5 commands | Done | |
| Zod validation on all outputs | Done | |
| Vitest suite (12 tests) | Done | |
| Zod-validated env config | Done | NFR-300 |
| Leveled logger | Done | NFR-500, NFR-501 |

**Remaining Phase 1 work:**
- File existence validation before processing (FR-108)
- Graceful LLM refusal handling (FR-208)
- Retry logic with exponential backoff (NFR-301)
- Additional test coverage (skill-gap, rewrite, loaders, splitter)

### Phase 2 — API + Hardening

**Goal:** REST API layer, authentication, batch processing, error resilience.

| Deliverable | Target |
|---|---|
| REST API (Express or Hono) | FR-1100 through FR-1108 |
| Authentication (API keys + JWT) | NFR-202 |
| Rate limiting | FR-1107 |
| Batch job comparison | FR-600 through FR-602 |
| Document deduplication on re-ingest | FR-110 |
| DOCX support | FR-109 |
| Retry logic with exponential backoff | NFR-301 |
| Structured error responses | FR-1108 |
| Token usage tracking | NFR-503 |
| Comprehensive test suite (>80% coverage) | |

### Phase 3 — Web UI + Polish

**Goal:** Browser-based dashboard, PDF export, interview prep, LinkedIn ingestion.

| Deliverable | Target |
|---|---|
| Next.js dashboard | FR-1000 through FR-1007 |
| Score visualization (charts) | FR-1001 |
| Inline diff rewrite view | FR-1003 |
| Multi-JD comparison table | FR-1004 |
| PDF report export | FR-900 through FR-904 |
| Interview prep generation | FR-700 through FR-703 |
| LinkedIn profile ingestion | FR-800 through FR-803 |
| User data deletion (GDPR) | NFR-207 |
| PostgreSQL for history/users | Data model section |
| Structured JSON logging (Pino) | NFR-505 |
| Deployment on Vercel | |

---

## 12. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-001 | LLM produces invalid JSON despite prompt engineering | Medium | High | Zod validation catches all malformed output. Retry once on parse failure with a stricter re-prompt. Fallback: structured output mode (function calling). |
| R-002 | OpenAI rate limits throttle batch processing | Medium | Medium | Bounded concurrency (3-5 parallel requests). Exponential backoff on 429s. Support `gpt-4o-mini` as lower-rate-limit fallback. |
| R-003 | Pinecone free tier limits hit during growth | Low | Medium | Monitor vector count. Free tier supports 100K vectors (~10K documents). Upgrade path to serverless paid tier is seamless. |
| R-004 | Resume PDF parsing fails on complex layouts | Medium | Medium | `pdf-parse` handles most layouts. For image-heavy or ATS-hostile PDFs, surface a clear error suggesting text/DOCX upload. Future: OCR fallback with Tesseract. |
| R-005 | LLM hallucination despite RAG grounding | Low | High | System prompts explicitly forbid fabrication. Retrieval chain only provides source context. Rewrite chain preserves original claims. Monitor via user feedback. |
| R-006 | OpenAI API cost escalates with user growth | Medium | Medium | Default to `gpt-4o-mini` for non-premium users. Cache repeated analyses (same resume+JD pair). Token tracking enables per-user cost monitoring. |
| R-007 | Prompt injection via malicious JD/resume text | Low | High | User text is injected via LangChain template variables, not string concatenation. Zod output validation rejects unexpected output shapes. Never execute code from user text. |
| R-008 | Pinecone namespace collision between users | Low | High | Namespace format: `user_{uuid}_resumes`. UUID guarantees uniqueness. API layer validates namespace ownership before queries. |
| R-009 | Stale embeddings after model change | Low | Medium | Document the embedding model in vector metadata. If `OPENAI_EMBEDDING_MODEL` changes, prompt user to re-ingest all documents. Build a migration tool. |
| R-010 | LangChain breaking changes in minor versions | Medium | Low | Pin LangChain to `^0.3.0`. Run tests on upgrade. LangChain LCEL is stable API surface. |

---

## 13. Open Questions

| ID | Question | Impact | Owner |
|---|---|---|---|
| OQ-001 | Should we support self-hosted embedding models (e.g., via Ollama) for privacy-sensitive users? | Affects architecture (local vs. cloud inference), performance targets, and deployment complexity. | TBD |
| OQ-002 | What is the pricing model for the web product — free tier, freemium, or usage-based? | Determines rate limits, feature gating, and infrastructure cost tolerance. | TBD |
| OQ-003 | Should batch comparison support weighting (e.g., "I care about company X more than company Y")? | Affects FR-601 output format and ranking algorithm. | TBD |
| OQ-004 | Should we integrate with job boards (Indeed, LinkedIn Jobs) to auto-fetch JDs by URL? | Significant scope expansion but high user convenience. Legal/ToS considerations. | TBD |
| OQ-005 | Should analysis history be stored per-user or ephemeral? | Affects Phase 3 database schema, GDPR scope, and storage costs. | TBD |
| OQ-006 | Is there a need for real-time collaboration (multiple users reviewing the same analysis)? | Affects web UI architecture (WebSockets, presence indicators). | TBD |
| OQ-007 | Should the rewrite chain support multiple tone/style options (e.g., formal, startup-casual, academic)? | Affects prompt templates and options schema. Low effort, high value. | TBD |

---

## 14. Appendix

### A. Glossary

| Term | Definition |
|---|---|
| **RAG** | Retrieval-Augmented Generation — a technique where relevant documents are retrieved from a vector store and provided as context to an LLM, grounding its responses in real data. |
| **LCEL** | LangChain Expression Language — a composable interface for building LLM chains where each step (retriever, prompt, model, parser) is a Runnable that can be piped, streamed, and tested independently. |
| **Vector Store** | A database optimized for storing and querying high-dimensional vectors (embeddings). Enables semantic similarity search. |
| **Embedding** | A dense numerical representation of text in high-dimensional space (e.g., 1536 dimensions). Semantically similar texts have similar embeddings. |
| **Namespace** | A Pinecone isolation mechanism that partitions vectors within a single index. Used for per-user and per-document-type isolation. |
| **Chunk** | A segment of a larger document, produced by the text splitter. Sized to fit within embedding model token limits while preserving semantic coherence. |
| **XYZ Formula** | Resume writing best practice: "Accomplished [X] as measured by [Y], by doing [Z]." Produces quantified, action-oriented bullet points. |
| **ATS** | Applicant Tracking System — software used by employers to filter resumes by keywords, formatting, and other criteria before human review. |

### B. Requirement Priority Definitions

| Priority | Definition |
|---|---|
| **P0** | Must have — core functionality that the product cannot launch without. |
| **P1** | Should have — important for the target user experience, planned for near-term delivery. |
| **P2** | Nice to have — valuable but can be deferred without impacting core value proposition. |

### C. Requirement Status Definitions

| Status | Definition |
|---|---|
| **Implemented** | Code exists, compiles, and is covered by at least one test. |
| **Partial** | Code exists but is incomplete or missing edge case handling. |
| **Not Implemented** | No code exists; requirement is planned for a future phase. |
