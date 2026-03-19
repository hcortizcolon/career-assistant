# RAG Career Assistant

A retrieval-augmented generation (RAG) pipeline built in TypeScript that performs semantic analysis over resume and job description documents. Uses LangChain, OpenAI embeddings, and Pinecone to ground LLM responses in real document content — eliminating hallucination and producing actionable career intelligence.

## Architecture

```
                  ┌─────────────┐
                  │  PDF / Text  │
                  │  Documents   │
                  └──────┬──────┘
                         │
                   ┌─────▼─────┐
                   │  Loaders   │  pdf-loader / text-loader
                   └─────┬─────┘
                         │
                  ┌──────▼──────┐
                  │   Chunker   │  RecursiveCharacterTextSplitter
                  └──────┬──────┘
                         │
               ┌─────────▼─────────┐
               │  OpenAI Embeddings │  text-embedding-ada-002
               └─────────┬─────────┘
                         │
                  ┌──────▼──────┐
                  │   Pinecone  │  Vector storage + similarity search
                  └──────┬──────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │  Job-Fit   │ │ Skill Gap │ │  Rewrite  │
    │  Scoring   │ │ Analysis  │ │ Suggest.  │
    └───────────┘ └───────────┘ └───────────┘
```

## Core Features

### Job-Fit Scoring
Evaluates resume-to-job alignment across five weighted dimensions:
- **Technical Skills Alignment** — technology/language/tool overlap
- **Experience Level Match** — seniority and years-of-experience fit
- **Domain Relevance** — industry and domain adjacency
- **Keyword Coverage** — ATS-critical keyword presence
- **Accomplishment Strength** — measurable impact and outcomes

Returns a structured `0–100` composite score with per-dimension rationale, top strengths, and top concerns.

### Skill Gap Analysis
Identifies missing skills between a resume and target role, classified by severity:
- **Critical** — hard requirements likely to cause rejection
- **Important** — strongly preferred qualifications
- **Nice-to-have** — listed but unlikely to be dealbreakers

Each gap includes context (where it appears in the JD) and a concrete recommendation (specific course, certification, or project).

### Resume Rewrite Suggestions
Generates targeted rewrite suggestions for resume sections using the **XYZ formula**:

> *"Accomplished [X] as measured by [Y], by doing [Z]."*

Produces before/after comparisons with rationale for each change, grounded in the candidate's real experience — never fabricates accomplishments.

### Semantic Q&A
Ask natural-language questions against ingested documents. The retrieval chain pulls the top-k most relevant chunks from Pinecone and grounds the LLM response strictly in that context.

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| LLM Orchestration | LangChain (LCEL) |
| Embeddings | OpenAI `text-embedding-ada-002` |
| Chat Model | OpenAI `gpt-4o` |
| Vector Database | Pinecone |
| Validation | Zod |
| Testing | Vitest |
| Runtime | Node.js 20+ / tsx |

## Project Structure

```
src/
├── index.ts                     # CLI entry point
├── config/
│   └── env.ts                   # Zod-validated environment config
├── loaders/
│   ├── pdf-loader.ts            # PDF ingestion via pdf-parse
│   └── text-loader.ts           # Plain text document loading
├── splitters/
│   └── chunk-splitter.ts        # Recursive text splitter (tuned for resumes)
├── embeddings/
│   └── embed.ts                 # OpenAI embedding singleton
├── vectorstore/
│   └── pinecone-client.ts       # Pinecone init, upsert, query, query-with-scores
├── chains/
│   ├── retrieval-chain.ts       # RAG retrieval chain (LCEL)
│   ├── job-fit-chain.ts         # Job-fit scoring with Zod-validated output
│   ├── skill-gap-chain.ts       # Skill gap analysis with severity classification
│   └── rewrite-chain.ts         # Resume rewrite suggestions
├── prompts/
│   └── templates.ts             # Engineered prompt templates for each chain
└── utils/
    └── logger.ts                # Leveled logger with context tags
tests/
└── chains/
    ├── retrieval-chain.test.ts
    └── job-fit-chain.test.ts
```

## Getting Started

### Prerequisites
- Node.js 20+
- A [Pinecone](https://www.pinecone.io/) account (free tier works)
- An [OpenAI](https://platform.openai.com/) API key

### Installation

```bash
git clone https://github.com/yourusername/career-assistant.git
cd career-assistant
npm install
```

### Configuration

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

```env
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX=career-assistant
PINECONE_ENVIRONMENT=us-east-1-aws
```

### Create the Pinecone Index

Create an index in the [Pinecone console](https://app.pinecone.io/) with:
- **Dimensions:** `1536` (matches `text-embedding-ada-002`)
- **Metric:** `cosine`

## Usage

### Ingest Documents

```bash
# Ingest a resume PDF into the "resumes" namespace
npm run dev -- ingest ./resume.pdf resumes

# Ingest a job description
npm run dev -- ingest ./job-description.txt job-descriptions
```

### Job-Fit Scoring

```bash
npm run dev -- job-fit ./resume.pdf ./job-description.txt
```

```
--- Job-Fit Assessment ---

Overall Score: 74/100

  technical Skills: 82/100 — Strong overlap in TypeScript, React, and Node.js
  experience Level: 68/100 — Role asks for 5+ years; candidate shows ~3 years
  domain Relevance: 71/100 — Adjacent fintech experience maps well to payments
  keyword Coverage: 78/100 — Missing "Kubernetes" and "GraphQL" mentions
  accomplishment Strength: 62/100 — Metrics present but could be more specific

Strengths: Full-stack TypeScript, CI/CD experience, startup background
Concerns:  Seniority gap, missing container orchestration, no GraphQL
```

### Skill Gap Analysis

```bash
npm run dev -- skill-gap ./resume.pdf ./job-description.txt
```

```
--- Skill Gap Analysis ---

Candidate shows strong frontend fundamentals but gaps in infrastructure tooling.

[CRITICAL]
  - Kubernetes: Complete the CKA certification or deploy a side project on k8s

[IMPORTANT]
  - GraphQL: Build a GraphQL API layer for an existing REST service
  - System Design: Practice distributed systems design on educative.io

[NICE-TO-HAVE]
  - Terraform: Follow the HashiCorp Learn tutorials for AWS provisioning
```

### Resume Rewrite

```bash
npm run dev -- rewrite ./experience-section.txt ./job-description.txt
```

```
--- Rewrite Suggestions ---

Original:
  Worked on the frontend team building React components
Suggested:
  Led development of 12 reusable React components adopted across 3 product teams,
  reducing UI development time by 40%
  Why: Quantifies scope and impact; uses active voice; mirrors JD emphasis on
  component architecture

Original:
  Helped improve page load times
Suggested:
  Optimized critical rendering path and implemented code splitting, reducing
  LCP from 4.2s to 1.8s (57% improvement) across 2M monthly active users
  Why: Adds specific metrics (LCP, user count); demonstrates performance
  engineering depth the JD explicitly requires
```

### Semantic Q&A

```bash
npm run dev -- ask "What are my strongest technical skills based on my resume?"
```

## Design Decisions

**Why RAG over fine-tuning?** Fine-tuning bakes knowledge into model weights, making it expensive to update when a resume changes. RAG retrieves from a vector store at query time — swap a document, re-embed, and the system instantly reflects the new content.

**Why structured JSON output?** Every chain returns Zod-validated JSON rather than free-text. This makes outputs programmatically consumable (dashboards, APIs, CI pipelines) and catches malformed LLM responses at parse time.

**Why severity classification for skill gaps?** Not all gaps are equal. A missing "nice-to-have" shouldn't trigger the same urgency as a missing hard requirement. The three-tier severity model (`critical` / `important` / `nice-to-have`) lets users prioritize their upskilling.

**Why separate namespaces in Pinecone?** Namespaces isolate document types (resumes vs. job descriptions) and enable multi-user support without index proliferation. Queries are scoped to a namespace, keeping retrieval precise.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Roadmap

- [ ] Batch comparison across multiple job descriptions
- [ ] Web UI with Next.js dashboard
- [ ] PDF export of analysis reports
- [ ] Support for additional embedding models (Cohere, local models)
- [ ] Interview preparation question generation based on gap analysis
- [ ] LinkedIn profile ingestion

## License

MIT
