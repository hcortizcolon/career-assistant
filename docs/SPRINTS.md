# Sprint Plan — RAG Career Assistant

> Broken into small, sequential stories so you learn each concept as you build it. Every story explains **what** you're building, **why** it matters, and **what you'll learn** from doing it.

---

## How to Read This Document

- **Sprints are 1 week each.** Small enough to ship, large enough to be meaningful.
- **Stories are ordered.** Within a sprint, do them top to bottom — later stories often depend on earlier ones.
- **Story points** use t-shirt sizes: **S** (< 2 hours), **M** (2-4 hours), **L** (4-8 hours), **XL** (8+ hours, consider splitting).
- **PRD refs** link back to `docs/PRD.md` requirement IDs so you can check acceptance criteria.
- **Status**: `[ ]` not started, `[~]` in progress, `[x]` done.
- Stories marked **[SCAFFOLD]** already have code from the initial scaffolding — the work is to harden, test, or extend them.

---

## Table of Contents

- [Phase 1: Core Engine](#phase-1-core-engine) (Sprints 1-5)
- [Phase 2: API & Hardening](#phase-2-api--hardening) (Sprints 6-9)
- [Phase 3: Web UI & Features](#phase-3-web-ui--features) (Sprints 10-14)

---

## Phase 1: Core Engine

**Goal:** A battle-tested CLI tool with robust error handling, full test coverage, and all four analysis chains working end-to-end.

---

### Sprint 1 — Error Foundation & Config Hardening

**Theme:** Before building features, make sure the foundation doesn't crack. This sprint is about making the app fail gracefully instead of crashing with stack traces.

**What you'll learn:** Custom error classes in TypeScript, Zod validation patterns, the fail-fast principle.

---

#### Story 1.1 — Create the error class hierarchy

`[ ]` | Size: **M** | PRD: NFR-300, NFR-303

**What:** Create a base `CareerAssistantError` class and domain-specific subclasses: `DocumentError`, `EmbeddingError`, `VectorStoreError`, `ChainError`, `LLMParseError`, `ConfigError`.

**Why:** Right now, errors from different pipeline stages all throw generic `Error`. When a user sees "Cannot read property 'pageContent' of undefined," they have no idea what went wrong. Custom errors carry context (file paths, chain names, raw LLM output) that makes debugging possible.

**What you'll learn:** TypeScript class inheritance, extending `Error` properly (prototype chain), adding typed properties to errors, the `cause` pattern for error wrapping.

**Tasks:**
- [ ] Create `src/errors/index.ts` with the error hierarchy from ARCHITECTURE.md §7
- [ ] Each error class should have a unique `code` string (e.g., `DOCUMENT_LOAD_FAILED`, `LLM_PARSE_FAILED`)
- [ ] Each error stores the original `cause` (the underlying error that triggered it)
- [ ] `LLMParseError` should include `rawOutput` (first 500 chars) and `expected` (schema name)

**Acceptance criteria:**
- [ ] All error classes extend `CareerAssistantError`
- [ ] `instanceof` checks work correctly for all subclasses
- [ ] Each error produces a readable `message` without needing to inspect properties

---

#### Story 1.2 — Add file validation to document loaders

`[ ]` | Size: **S** | PRD: FR-108, NFR-304

**What:** Before reading a file, check that it exists, is readable, and has a supported extension. Throw `DocumentError` (from Story 1.1) with the file path and reason.

**Why:** Currently, passing a non-existent file path produces a raw Node.js `ENOENT` error. Users shouldn't need to know what ENOENT means.

**What you'll learn:** `node:fs/promises` `access()` for permission checks, defensive programming before I/O, wrapping system errors in domain errors.

**Tasks:**
- [ ] Add a `validateFilePath(path, allowedExtensions)` helper in `src/loaders/`
- [ ] Check: file exists (`fs.access`), extension is in allowlist (`.pdf`, `.txt`, `.md`)
- [ ] Call `validateFilePath` at the top of `loadPdf()` and `loadText()`
- [ ] Wrap the `readFile` call in try/catch, re-throw as `DocumentError`

**Acceptance criteria:**
- [ ] Non-existent file → `DocumentError` with message like `File not found: /path/to/missing.pdf`
- [ ] Unsupported extension → `DocumentError` with message like `Unsupported file type: .xlsx. Supported: .pdf, .txt, .md`
- [ ] Permission denied → `DocumentError` with message mentioning permissions

---

#### Story 1.3 — Wrap chain outputs with retry-on-parse-failure

`[ ]` | Size: **M** | PRD: FR-208, NFR-303

**What:** Create a `executeChain<T>()` utility that runs a chain, parses the JSON output, validates with Zod, and retries once on parse/validation failure.

**Why:** LLMs produce malformed JSON ~5% of the time (trailing commas, extra text before/after JSON, scores of 101). A single retry fixes most of these because LLM output is non-deterministic — the same prompt usually succeeds on attempt two.

**What you'll learn:** TypeScript generics, Zod's `safeParse` vs `parse`, retry patterns, the difference between `JSON.parse` failures and schema validation failures.

**Tasks:**
- [ ] Create `src/utils/chain-executor.ts` with an `executeChain<T>()` function
- [ ] Accept: `chainName` (for logging), `invoke` (async fn returning string), `schema` (Zod), `maxRetries` (default 1)
- [ ] On `JSON.parse` failure: log warning, retry
- [ ] On Zod validation failure: log warning with Zod error path, retry
- [ ] After max retries exhausted: throw `LLMParseError` with raw output and schema name
- [ ] Refactor `job-fit-chain.ts`, `skill-gap-chain.ts`, `rewrite-chain.ts` to use `executeChain`

**Acceptance criteria:**
- [ ] Passing a chain that returns valid JSON on first try: works, no retry
- [ ] Passing a chain that returns garbage on try 1, valid JSON on try 2: works, logs a warning
- [ ] Passing a chain that returns garbage on both tries: throws `LLMParseError` with the raw output

---

#### Story 1.4 — Add exponential backoff for API calls

`[ ]` | Size: **M** | PRD: NFR-301

**What:** Create a `withRetry()` utility that wraps async functions with exponential backoff. Integrate it with OpenAI and Pinecone calls.

**Why:** OpenAI returns 429 (rate limit) under load and 500/503 during outages. Without retries, one transient failure kills the entire pipeline. Exponential backoff (1s → 2s → 4s) is the standard pattern — it gives the API time to recover without hammering it.

**What you'll learn:** Exponential backoff algorithm, detecting retryable vs non-retryable errors, `setTimeout` as a promise, HTTP status code semantics (429, 500, 503 = retry; 401, 400 = don't retry).

**Tasks:**
- [ ] Create `src/utils/retry.ts` with `withRetry<T>(fn, options)` utility
- [ ] Options: `maxRetries` (default 3), `baseDelayMs` (default 1000), `retryableErrors` (predicate function)
- [ ] Delay formula: `baseDelayMs * 2^attempt` (1s, 2s, 4s)
- [ ] Log each retry attempt at `warn` level
- [ ] Wrap `embedText`/`embedDocuments` in `withRetry`
- [ ] Wrap `upsertDocuments`, `querySimilar`, `querySimilarWithScores` in `withRetry`

**Acceptance criteria:**
- [ ] A function that succeeds on first try: no delay, returns result
- [ ] A function that fails twice with 429, then succeeds: retries with backoff, returns result
- [ ] A function that fails with 401: does NOT retry (non-retryable), throws immediately
- [ ] A function that fails 4 times (> maxRetries): throws after exhausting retries

---

#### Story 1.5 — Improve CLI error output

`[ ]` | Size: **S** | PRD: NFR-305

**What:** Update the CLI's top-level `catch` block in `src/index.ts` to format errors based on their type. `DocumentError` shows the file path. `LLMParseError` suggests retrying. `ConfigError` points to `.env.example`.

**Why:** Right now the CLI catches errors and logs `error.message`. With custom error classes, we can provide much more helpful output without exposing stack traces.

**What you'll learn:** Pattern matching on error types using `instanceof`, exit codes (0 = success, 1 = user error, 2 = system error), user-friendly error formatting.

**Tasks:**
- [ ] Update the `catch` block in `main()` to check `instanceof` for each error class
- [ ] `ConfigError` → print missing vars, point to `.env.example`, exit code 1
- [ ] `DocumentError` → print file path and suggestion, exit code 1
- [ ] `LLMParseError` → print "AI returned unexpected output, try again", exit code 2
- [ ] `VectorStoreError` → print "Could not reach vector database", exit code 2
- [ ] Unknown errors → print message only (no stack trace unless `LOG_LEVEL=debug`), exit code 2

**Acceptance criteria:**
- [ ] Missing `.env` config → user sees formatted list of what's missing + "See .env.example"
- [ ] Non-existent file → user sees file path + suggestion to check the path
- [ ] No raw stack traces unless `LOG_LEVEL=debug`

---

### Sprint 2 — Test Coverage: Loaders, Splitter, Config

**Theme:** Build confidence in the foundation layer. These modules are pure-ish functions that are easy to test — great for learning testing patterns before tackling the more complex chain tests.

**What you'll learn:** Vitest mocking patterns, testing file I/O without hitting disk, fixture-based testing, testing Zod schemas exhaustively.

---

#### Story 2.1 — Create test fixtures

`[ ]` | Size: **S** | PRD: —

**What:** Create a `tests/fixtures/` directory with sample documents used across all test files.

**Why:** Tests need realistic input data. Centralizing fixtures prevents duplication and ensures all tests use consistent, representative content.

**What you'll learn:** Test fixture management, how resume/JD content structure affects test quality.

**Tasks:**
- [ ] Create `tests/fixtures/sample-resume.txt` — a realistic software engineer resume (~500 words)
- [ ] Create `tests/fixtures/sample-jd.txt` — a realistic backend engineer JD (~300 words)
- [ ] Create `tests/fixtures/empty.txt` — an empty file (for error testing)
- [ ] Create `tests/fixtures/sample-resume.pdf` — a simple PDF (can generate with any tool)
- [ ] Create `tests/helpers/mock-llm.ts` — a shared factory for creating mock LLM responses

**Acceptance criteria:**
- [ ] Fixtures are realistic enough to produce meaningful chunks when split
- [ ] `mock-llm.ts` exports helpers like `mockJobFitResponse()`, `mockSkillGapResponse()` that return valid JSON strings matching the Zod schemas

---

#### Story 2.2 — Test the config module

`[ ]` | Size: **S** | PRD: NFR-300

**What:** Write tests for `src/config/env.ts` covering every environment variable — valid values, missing required vars, invalid types, and defaults.

**Why:** Config validation is the first thing that runs. If it's wrong, nothing else works. These tests document the complete configuration contract.

**What you'll learn:** Testing modules that read `process.env`, mocking environment variables in Vitest, testing Zod schemas with `safeParse`.

**Tasks:**
- [ ] Create `tests/config/env.test.ts`
- [ ] Test: all required vars present → returns valid `Env` object
- [ ] Test: `OPENAI_API_KEY` missing → throws with specific message
- [ ] Test: `PINECONE_API_KEY` missing → throws with specific message
- [ ] Test: both missing → error lists both missing vars
- [ ] Test: `CHUNK_SIZE` defaults to 1000 when not set
- [ ] Test: `CHUNK_SIZE` as string "500" → coerces to number 500
- [ ] Test: `CHUNK_SIZE` as "abc" → throws validation error
- [ ] Test: `LOG_LEVEL` as "verbose" (invalid enum) → throws
- [ ] Test: `LOG_LEVEL` defaults to "info"

**Acceptance criteria:**
- [ ] 100% branch coverage on `env.ts`
- [ ] Every env var's happy path and error path is tested

---

#### Story 2.3 — Test the text loader

`[ ]` | Size: **S** | PRD: FR-101, FR-108

**What:** Write tests for `src/loaders/text-loader.ts` covering file loading, empty file handling, inline string helper, and metadata.

**Why:** The text loader is the simplest loader — good for learning the testing pattern before tackling PDF loading.

**What you'll learn:** Mocking `node:fs/promises` in Vitest, testing Document metadata, testing error paths.

**Tasks:**
- [ ] Create `tests/loaders/text-loader.test.ts`
- [ ] Test: load a real fixture file → returns Document with correct `pageContent` and `metadata.source`
- [ ] Test: `metadata.format` is derived from file extension (`.txt` → "txt", `.md` → "md")
- [ ] Test: empty file → throws `DocumentError` (or current Error) with descriptive message
- [ ] Test: non-existent file → throws error (after Story 1.2, should be `DocumentError`)
- [ ] Test: `documentFromString("hello")` → returns Document with `source: "inline"`
- [ ] Test: `documentFromString("")` → throws
- [ ] Test: custom metadata is merged into Document metadata

**Acceptance criteria:**
- [ ] All tests pass with `npm test`
- [ ] Covers both success and error paths for `loadText` and `documentFromString`

---

#### Story 2.4 — Test the PDF loader

`[ ]` | Size: **M** | PRD: FR-100, FR-108

**What:** Write tests for `src/loaders/pdf-loader.ts`. Since `pdf-parse` is a heavy dependency, mock it to keep tests fast.

**Why:** PDF parsing is the most likely loader to fail in production (complex layouts, scanned images, encrypted PDFs). Tests ensure we handle these gracefully.

**What you'll learn:** Mocking npm packages (`vi.mock("pdf-parse")`), testing with controlled mock return values, testing the `loadPdfs` batch helper.

**Tasks:**
- [ ] Create `tests/loaders/pdf-loader.test.ts`
- [ ] Mock `pdf-parse` at the module level
- [ ] Test: valid PDF → Document with `pageContent`, `metadata.pages`, `metadata.format: "pdf"`
- [ ] Test: PDF with empty text extraction → throws error
- [ ] Test: `loadPdfs` with 3 files → returns 3 Documents (parallel)
- [ ] Test: custom metadata option is passed through
- [ ] Test: file read failure → descriptive error

**Acceptance criteria:**
- [ ] Tests never read a real PDF file (pdf-parse is fully mocked)
- [ ] Covers the empty-text rejection path

---

#### Story 2.5 — Test the chunk splitter

`[ ]` | Size: **M** | PRD: FR-102, FR-103, FR-106

**What:** Write tests for `src/splitters/chunk-splitter.ts` using real text fixtures. These tests should NOT mock the splitter — test the actual chunking behavior.

**Why:** Chunk quality directly determines retrieval quality. These tests verify that chunks respect size limits, overlap correctly, and preserve metadata.

**What you'll learn:** Testing LangChain's `RecursiveCharacterTextSplitter` behavior, how overlap works in practice, metadata propagation through transforms.

**Tasks:**
- [ ] Create `tests/splitters/chunk-splitter.test.ts`
- [ ] Mock only `config/env.ts` (to control `CHUNK_SIZE` and `CHUNK_OVERLAP`)
- [ ] Test: short document (< CHUNK_SIZE) → returns 1 chunk unchanged
- [ ] Test: long document → returns multiple chunks, each ≤ CHUNK_SIZE
- [ ] Test: each chunk has `chunkIndex` and `totalChunks` in metadata
- [ ] Test: each chunk preserves original `source` and `format` metadata
- [ ] Test: `splitDocuments` with 2 documents → flat array of all chunks
- [ ] Test: custom `chunkSize` and `chunkOverlap` options override env defaults
- [ ] Test: verify overlap — content at the end of chunk N appears at the start of chunk N+1

**Acceptance criteria:**
- [ ] No chunk exceeds `CHUNK_SIZE`
- [ ] Overlap verification test passes (this is the most important test — proves chunks don't lose boundary content)

---

### Sprint 3 — Test Coverage: Chains

**Theme:** Test the core intelligence layer. Chain tests are harder because they involve LLM mocking and Zod validation of complex nested outputs. This sprint makes you an expert at testing LLM-powered code.

**What you'll learn:** Mocking LLM responses, testing Zod schemas exhaustively, testing the full chain pipeline from input to validated output, testing error/retry paths.

---

#### Story 3.1 — Create shared LLM mock helpers

`[ ]` | Size: **S** | PRD: —

**What:** Build out `tests/helpers/mock-llm.ts` with factory functions that produce realistic mock responses for each chain.

**Why:** Every chain test needs to mock `ChatOpenAI`. Centralizing this avoids duplicating complex mock JSON across test files and makes it easy to create "broken" responses for error testing.

**What you'll learn:** Factory pattern for test data, creating valid and intentionally-invalid test fixtures.

**Tasks:**
- [ ] `createMockJobFitResponse(overrides?)` → valid JSON string matching `jobFitResultSchema`
- [ ] `createMockSkillGapResponse(overrides?)` → valid JSON matching `skillGapResultSchema`
- [ ] `createMockRewriteResponse(overrides?)` → valid JSON matching `rewriteResultSchema`
- [ ] `createMalformedJsonResponse()` → string that looks like JSON but has syntax errors
- [ ] `createOutOfRangeResponse()` → valid JSON structure but with `score: 150`
- [ ] `createLlmRefusalResponse()` → "I'm sorry, I can't evaluate this resume"

**Acceptance criteria:**
- [ ] All "valid" factory responses pass their respective Zod schemas
- [ ] All "invalid" factory responses fail their respective Zod schemas

---

#### Story 3.2 — Expand job-fit chain tests

`[ ]` | Size: **M** | PRD: FR-200–FR-208 | **[SCAFFOLD]** — extends existing tests

**What:** The existing `job-fit-chain.test.ts` has 12 tests covering schemas and basic chain creation. Expand to cover the full `scoreJobFit()` execution flow including vector store enrichment and error paths.

**Why:** Job-fit scoring is the flagship feature. It must be thoroughly tested because it touches the most moving parts: vector store enrichment + LLM call + JSON parse + Zod validation.

**What you'll learn:** Testing async pipelines with multiple mocked dependencies, testing optional behavior (enrichment is skipped without a namespace), testing graceful degradation (enrichment fails → still produces a result).

**Tasks:**
- [ ] Test: `scoreJobFit` with namespace → calls `querySimilarWithScores`, appends enrichment context
- [ ] Test: `scoreJobFit` without namespace → skips enrichment entirely
- [ ] Test: enrichment query fails → logs warning, proceeds with raw resume text, still returns result
- [ ] Test: LLM returns malformed JSON → throws `LLMParseError` (after Story 1.3)
- [ ] Test: LLM returns score > 100 → fails Zod validation
- [ ] Test: model override option is passed to `ChatOpenAI`
- [ ] Test: temperature is 0.1 (verify low temp for consistency)

**Acceptance criteria:**
- [ ] 90%+ coverage on `job-fit-chain.ts`
- [ ] Both the enrichment and no-enrichment paths tested
- [ ] Error paths produce the right error types

---

#### Story 3.3 — Write skill gap chain tests

`[ ]` | Size: **M** | PRD: FR-300–FR-307

**What:** Write comprehensive tests for `src/chains/skill-gap-chain.ts`.

**Why:** Skill gap analysis has a unique output structure (array of gaps with severity enum). Testing the Zod schema is especially important because the `severity` field is an enum — any deviation must be caught.

**What you'll learn:** Testing Zod enums, testing array-of-objects schemas, verifying the chain logs gap counts correctly.

**Tasks:**
- [ ] Create `tests/chains/skill-gap-chain.test.ts`
- [ ] Test: `skillGapResultSchema` with valid data → passes
- [ ] Test: invalid severity value ("high" instead of "critical") → fails
- [ ] Test: empty `gaps` array → passes (no gaps found is valid)
- [ ] Test: missing `recommendation` field on a gap → fails
- [ ] Test: `analyzeSkillGaps` with mocked LLM → returns typed `SkillGapResult`
- [ ] Test: result contains correct number of critical/important/nice-to-have gaps
- [ ] Test: `createSkillGapChain` uses temperature 0.2

**Acceptance criteria:**
- [ ] 90%+ coverage on `skill-gap-chain.ts`
- [ ] Every severity enum value tested
- [ ] Schema rejects extra/missing fields

---

#### Story 3.4 — Write rewrite chain tests

`[ ]` | Size: **M** | PRD: FR-400–FR-407

**What:** Write comprehensive tests for `src/chains/rewrite-chain.ts`.

**Why:** The rewrite chain has the highest temperature (0.4) of any chain, making its output the most variable. Schema validation tests are critical to ensure structure is maintained despite creative output.

**What you'll learn:** Testing chains that use higher temperature, verifying the suggestion before/after structure, testing the general advice array.

**Tasks:**
- [ ] Create `tests/chains/rewrite-chain.test.ts`
- [ ] Test: `rewriteResultSchema` with valid data → passes
- [ ] Test: suggestion missing `rationale` → fails
- [ ] Test: empty `suggestions` array → passes (nothing to improve is valid)
- [ ] Test: `generalAdvice` as string instead of array → fails
- [ ] Test: `suggestRewrites` with mocked LLM → returns typed `RewriteResult`
- [ ] Test: `createRewriteChain` uses temperature 0.4
- [ ] Test: suggestion count is logged

**Acceptance criteria:**
- [ ] 90%+ coverage on `rewrite-chain.ts`
- [ ] Schema validation is exhaustive

---

#### Story 3.5 — Write retrieval chain integration test

`[ ]` | Size: **M** | PRD: FR-500–FR-504 | **[SCAFFOLD]** — extends existing tests

**What:** Expand retrieval chain tests to cover the full Q&A flow: question → retriever → format → prompt → LLM → answer.

**Why:** The retrieval chain is the only chain that uses LCEL's `RunnablePassthrough` and pipe composition. Testing it verifies that LangChain's chain composition works as expected with our mocks.

**What you'll learn:** Mocking LangChain retrievers, testing LCEL chain composition, verifying that retrieved context is correctly formatted and injected into the prompt.

**Tasks:**
- [ ] Test: `askQuestion` with mocked retriever and LLM → returns string answer
- [ ] Test: retrieved documents are formatted as `[1] content\n\n[2] content`
- [ ] Test: `k` option is passed to retriever
- [ ] Test: `namespace` option is passed to `getVectorStore`
- [ ] Test: model override works

**Acceptance criteria:**
- [ ] 85%+ coverage on `retrieval-chain.ts`
- [ ] The document formatting contract is tested independently

---

### Sprint 4 — Batch Comparison & CLI Polish

**Theme:** Build the first new feature (batch comparison) and polish the CLI for a complete user experience. After this sprint, Phase 1 is feature-complete.

**What you'll learn:** Concurrency control with semaphores, building comparison UIs in the terminal, CLI argument parsing patterns.

---

#### Story 4.1 — Build the batch comparison engine

`[ ]` | Size: **L** | PRD: FR-600, FR-601

**What:** Create `src/chains/batch-chain.ts` that accepts one resume and N job descriptions, scores each pair, and returns a ranked array.

**Why:** Real job seekers apply to many roles. Comparing resume fit across 10 JDs simultaneously is the killer feature that makes this tool genuinely useful rather than just a demo.

**What you'll learn:** Running multiple async operations in parallel, collecting and sorting results, building composable chains that use other chains internally.

**Tasks:**
- [ ] Create `src/chains/batch-chain.ts`
- [ ] Define `BatchResult` type: `{ jobTitle: string, source: string, overallScore: number, topStrength: string, topConcern: string }`
- [ ] Define `BatchComparisonResult` type: `{ results: BatchResult[], summary: string }`
- [ ] Implement `compareBatch(resumeText, jobDescriptions: { title: string, text: string }[])`
- [ ] Process all JDs using `Promise.all` (simple first — concurrency limiting in next story)
- [ ] Sort results descending by `overallScore`
- [ ] Extract `topStrength` and `topConcern` from each `JobFitResult`

**Acceptance criteria:**
- [ ] Given 1 resume and 3 JDs → returns 3 results sorted by score
- [ ] Each result contains the JD title, score, top strength, and top concern
- [ ] Zod schema validates the batch output

---

#### Story 4.2 — Add bounded concurrency to batch processing

`[ ]` | Size: **M** | PRD: FR-602

**What:** Create a `withConcurrencyLimit<T>(tasks, limit)` utility and integrate it with batch comparison to avoid OpenAI rate limits.

**Why:** `Promise.all` with 10 JDs fires 10 simultaneous OpenAI requests. At ~4K tokens each, that's 40K tokens hitting the API at once — likely triggering a 429 rate limit. A semaphore limits concurrent requests to 3-5.

**What you'll learn:** The semaphore pattern for concurrency control, `Promise.all` vs bounded concurrency, why unbounded parallelism is dangerous with rate-limited APIs.

**Tasks:**
- [ ] Create `src/utils/concurrency.ts` with `withConcurrencyLimit<T>(fns: (() => Promise<T>)[], limit: number): Promise<T[]>`
- [ ] Implement using a simple semaphore (counter + queue)
- [ ] Integrate into `compareBatch` — default concurrency limit of 3
- [ ] Make the limit configurable via options

**Acceptance criteria:**
- [ ] With limit=2 and 5 tasks: never more than 2 running simultaneously
- [ ] Results are returned in the same order as input (not execution order)
- [ ] If one task fails, others still complete (errors collected, not short-circuited)

---

#### Story 4.3 — Add batch command to CLI

`[ ]` | Size: **M** | PRD: FR-600

**What:** Add a `batch` command to the CLI that accepts a resume file and a directory of JD files (or multiple JD file paths).

**Why:** Completes the CLI feature set. Users can now run `career-assistant batch ./resume.pdf ./jobs/` against a directory of job descriptions.

**What you'll learn:** Glob patterns for file discovery, reading directories in Node.js, building formatted table output in the terminal.

**Tasks:**
- [ ] Add `batch` command to `src/index.ts`
- [ ] Accept: `career-assistant batch <resume> <jd-path> [jd-path...]`
- [ ] If `<jd-path>` is a directory, glob for `*.txt` and `*.pdf` files inside it
- [ ] Load all JDs, extract titles (first line or filename)
- [ ] Call `compareBatch()`, display results as a formatted table
- [ ] Table columns: Rank, Title, Score, Top Strength, Top Concern
- [ ] Show a summary line: "Best fit: {title} (score/100)"

**Acceptance criteria:**
- [ ] `career-assistant batch resume.pdf ./jobs/` processes all text/PDF files in `./jobs/`
- [ ] Output is a readable table sorted by score
- [ ] Empty directory → helpful error message

---

#### Story 4.4 — Add a `--json` flag to all CLI commands

`[ ]` | Size: **S** | PRD: US-020

**What:** Add a `--json` flag that makes every command output raw JSON instead of formatted text.

**Why:** Power users and scripts need machine-readable output. A `--json` flag is the standard pattern for CLI tools that serve both human and programmatic consumers.

**What you'll learn:** CLI flag parsing, conditional output formatting, the importance of structured output for automation.

**Tasks:**
- [ ] Parse `--json` flag from `process.argv` (simple check — no need for a flag parsing library yet)
- [ ] If `--json`: print `JSON.stringify(result, null, 2)` and exit
- [ ] If no `--json`: print the existing formatted output
- [ ] Apply to: `job-fit`, `skill-gap`, `rewrite`, `batch`, `ask`

**Acceptance criteria:**
- [ ] `career-assistant job-fit resume.pdf jd.txt --json` outputs valid JSON matching `JobFitResult`
- [ ] JSON output can be piped to `jq` for further processing
- [ ] `--json` flag works in any position (before or after file args)

---

#### Story 4.5 — Write batch chain tests

`[ ]` | Size: **M** | PRD: FR-600–FR-602

**What:** Test the batch comparison chain and concurrency utility.

**Tasks:**
- [ ] Create `tests/chains/batch-chain.test.ts`
- [ ] Test: 3 JDs → 3 results sorted by score
- [ ] Test: 1 JD → 1 result (degenerate case)
- [ ] Test: empty JD list → returns empty results
- [ ] Create `tests/utils/concurrency.test.ts`
- [ ] Test: with limit=1, tasks execute sequentially
- [ ] Test: with limit=3 and 3 tasks, all start immediately
- [ ] Test: with limit=2 and 5 tasks, never more than 2 concurrent
- [ ] Test: one failing task doesn't kill other tasks

**Acceptance criteria:**
- [ ] All batch tests pass
- [ ] Concurrency test uses timing assertions to verify actual parallelism

---

### Sprint 5 — CI/CD & Phase 1 Wrap-Up

**Theme:** Set up continuous integration, reach the coverage target, and make the codebase portfolio-ready. After this sprint, Phase 1 is complete.

**What you'll learn:** GitHub Actions, CI pipeline design, code coverage reporting, what "production-ready" means for a CLI tool.

---

#### Story 5.1 — Set up GitHub Actions CI

`[ ]` | Size: **M** | PRD: ADR-008

**What:** Create a GitHub Actions workflow that runs type-check, lint, tests, and `npm audit` on every push and PR.

**Why:** CI catches regressions before they hit `main`. It also signals to hiring managers that this is a professionally maintained project. The green "CI: passing" badge is worth more than you think.

**What you'll learn:** GitHub Actions YAML syntax, job steps, caching `node_modules`, running parallel jobs, branch protection rules.

**Tasks:**
- [ ] Create `.github/workflows/ci.yml` with the workflow from ARCHITECTURE.md §11
- [ ] Jobs: `quality` (typecheck, lint, test with coverage, npm audit)
- [ ] Cache `node_modules` using `actions/setup-node`'s built-in cache
- [ ] Add a CI status badge to `README.md`
- [ ] Set up branch protection on `main`: require CI to pass before merge

**Acceptance criteria:**
- [ ] Push to `main` triggers CI
- [ ] PR to `main` triggers CI
- [ ] All four checks pass on current codebase
- [ ] Badge shows in README

---

#### Story 5.2 — Set up ESLint

`[ ]` | Size: **S** | PRD: —

**What:** Add ESLint with a TypeScript-aware config. Keep it minimal — the goal is catching real bugs, not bikeshedding style.

**Why:** ESLint catches bugs that TypeScript's compiler misses: unused variables in catch blocks, floating promises (missing `await`), accidental `any` types.

**What you'll learn:** ESLint flat config format, TypeScript ESLint parser, choosing rules that add value vs rules that annoy.

**Tasks:**
- [ ] Install `eslint`, `@eslint/js`, `typescript-eslint`
- [ ] Create `eslint.config.js` (flat config format)
- [ ] Enable recommended rules + `@typescript-eslint/recommended`
- [ ] Add rule: `@typescript-eslint/no-floating-promises: error` (catches missing awaits)
- [ ] Add rule: `@typescript-eslint/no-unused-vars: error` (with `argsIgnorePattern: "^_"`)
- [ ] Fix any lint errors in existing code
- [ ] Verify `npm run lint` passes

**Acceptance criteria:**
- [ ] `npm run lint` exits 0 on the current codebase
- [ ] Adding an unhandled promise (missing `await`) fails lint

---

#### Story 5.3 — Coverage gap audit and final tests

`[ ]` | Size: **L** | PRD: —

**What:** Run `npm run test:coverage`, identify gaps below the 85% target, and write targeted tests to close them.

**Why:** Coverage targets are meaningless unless you actually measure and act on them. This story is about finding the uncovered lines and deciding: is this a bug waiting to happen, or is it dead code to remove?

**What you'll learn:** Reading coverage reports (line vs branch vs function coverage), the difference between meaningful coverage and coverage theater, deciding what NOT to test.

**Tasks:**
- [ ] Run `npm run test:coverage` and review the report
- [ ] For each module below 85%: identify uncovered lines
- [ ] Write tests for uncovered critical paths (error handling, edge cases)
- [ ] If uncovered code is dead code: delete it instead of testing it
- [ ] Add `tests/utils/logger.test.ts` — basic tests for log level filtering
- [ ] Add `tests/vectorstore/pinecone-client.test.ts` — mock-based tests for upsert/query
- [ ] Final coverage check: all modules ≥ 85%, chains ≥ 90%

**Acceptance criteria:**
- [ ] `npm run test:coverage` shows overall ≥ 85%
- [ ] `chains/` directory shows ≥ 90%
- [ ] No "coverage theater" (tests that assert nothing just to cover lines)

---

#### Story 5.4 — Initialize git repo and first commit

`[ ]` | Size: **S** | PRD: —

**What:** Initialize the git repository (if not already done), create a proper `.gitignore`, make the initial commit, and push to GitHub.

**Why:** Everything before this was local development. Pushing to GitHub makes it a real portfolio project.

**What you'll learn:** Writing a good initial commit, setting up a remote, branch protection basics.

**Tasks:**
- [ ] Verify `.gitignore` covers: `node_modules/`, `dist/`, `.env`, `coverage/`, `.DS_Store`
- [ ] `git add` all files (excluding secrets)
- [ ] Create initial commit with conventional commit: `feat: core RAG engine with CLI`
- [ ] Create GitHub repo
- [ ] Push to `main`
- [ ] Verify CI runs and passes

**Acceptance criteria:**
- [ ] GitHub repo is public (for portfolio)
- [ ] No `.env` or API keys in the commit history
- [ ] CI badge shows green on first push

---

## Phase 2: API & Hardening

**Goal:** Expose the core engine as a REST API with authentication, rate limiting, and a database for persistence. This is where the project transforms from a CLI tool to a platform.

---

### Sprint 6 — Monorepo Migration

**Theme:** Restructure the project for multi-app development. This is a one-time migration that enables the CLI and web app to share the core engine.

**What you'll learn:** npm workspaces, Turborepo task orchestration, package boundaries, the difference between a "library" and an "application."

---

#### Story 6.1 — Set up npm workspaces

`[ ]` | Size: **M** | PRD: ARCHITECTURE §13

**What:** Convert the project to a monorepo using npm workspaces with Turborepo for build orchestration.

**Why:** The web app and CLI both need the same chains, loaders, and vector store code. Without a monorepo, you'd either duplicate code or publish a package to npm. Workspaces let them share code locally.

**What you'll learn:** npm `workspaces` field, Turborepo `turbo.json` task graph, `dependsOn` for build ordering, the `^` prefix for dependencies ("build my dependencies first").

**Tasks:**
- [ ] Create root `package.json` with `workspaces: ["apps/*", "packages/*"]`
- [ ] Move current `src/` → `packages/core/src/` (except `index.ts`)
- [ ] Move current `tests/` → `packages/core/tests/`
- [ ] Create `packages/core/package.json` with name `@career-assistant/core`
- [ ] Move CLI entry point to `apps/cli/src/index.ts`
- [ ] Create `apps/cli/package.json` with dependency on `@career-assistant/core`
- [ ] Update all import paths in CLI to use `@career-assistant/core`
- [ ] Create `packages/core/src/index.ts` as public API barrel export
- [ ] Create `turbo.json` with build/test/typecheck tasks
- [ ] Create `tsconfig.base.json` shared between packages
- [ ] Verify `turbo build` and `turbo test` work

**Acceptance criteria:**
- [ ] `npm install` from root installs all workspace deps
- [ ] `npx turbo build` builds core first, then cli
- [ ] `npx turbo test` runs all tests across all packages
- [ ] CLI still works: `npm run dev -w apps/cli -- job-fit ...`
- [ ] No import path uses `../../packages/core` — only `@career-assistant/core`

---

#### Story 6.2 — Define the core package public API

`[ ]` | Size: **S** | PRD: —

**What:** Create `packages/core/src/index.ts` that exports only the functions and types that consumers (CLI, API, web) need. Everything else is internal.

**Why:** A clear public API boundary makes the core package easier to use and harder to misuse. Internal modules can change without breaking consumers.

**What you'll learn:** Barrel exports, `export type`, the principle of minimal API surface, encapsulation at the package level.

**Tasks:**
- [ ] Export chain functions: `scoreJobFit`, `analyzeSkillGaps`, `suggestRewrites`, `askQuestion`, `compareBatch`
- [ ] Export chain types: `JobFitResult`, `SkillGapResult`, `RewriteResult`, `BatchComparisonResult`
- [ ] Export ingestion functions: `loadPdf`, `loadText`, `splitDocument`, `upsertDocuments`
- [ ] Export config: `env` (so consumers can check config)
- [ ] Do NOT export: internal utilities (`logger`, `retry`, `concurrency`), singleton instances, Zod schemas (internal implementation detail)
- [ ] Verify CLI works using only the public API

**Acceptance criteria:**
- [ ] `apps/cli/src/index.ts` imports only from `@career-assistant/core`
- [ ] No deep imports like `@career-assistant/core/chains/job-fit-chain`
- [ ] Adding a new internal module doesn't require updating consumers

---

### Sprint 7 — API Layer Foundation

**Theme:** Build the REST API that exposes the core engine over HTTP. Start with the framework, middleware, and one endpoint — then expand.

**What you'll learn:** Hono framework basics, middleware composition, request validation with Zod, structuring API responses consistently.

---

#### Story 7.1 — Scaffold the web app with Hono

`[ ]` | Size: **M** | PRD: FR-1100–FR-1108

**What:** Create `apps/web/` with a Next.js app that uses Hono for API route handlers.

**Why:** Next.js handles the frontend (Phase 3) while Hono handles the API routes. Hono is 14KB, TypeScript-native, and works perfectly inside Next.js API routes.

**What you'll learn:** Next.js App Router setup, Hono basics (routing, middleware, context), integrating Hono inside Next.js route handlers.

**Tasks:**
- [ ] `npx create-next-app@latest apps/web` with App Router, TypeScript, Tailwind
- [ ] Install Hono: `npm install hono -w apps/web`
- [ ] Create `apps/web/src/app/api/[...route]/route.ts` — catch-all route that delegates to Hono
- [ ] Create `apps/web/src/lib/api.ts` — Hono app instance with base middleware
- [ ] Add middleware: request ID generation, request logging, error handling
- [ ] Add a health check endpoint: `GET /api/health` → `{ status: "ok", version: "1.0.0" }`
- [ ] Verify: `npm run dev -w apps/web` → `curl localhost:3000/api/health`

**Acceptance criteria:**
- [ ] Health endpoint returns 200 with JSON body
- [ ] Every response includes a `X-Request-Id` header
- [ ] Unhandled errors return structured `{ error: { code, message } }` JSON, not HTML

---

#### Story 7.2 — Create consistent error response middleware

`[ ]` | Size: **S** | PRD: FR-1108

**What:** Build error-handling middleware that catches `CareerAssistantError` subclasses and maps them to appropriate HTTP status codes and structured responses.

**Why:** Without this, API errors are inconsistent — some return JSON, some return stack traces, some return HTML. Consumers need a predictable error format.

**What you'll learn:** Hono's `onError` handler, mapping domain errors to HTTP semantics, the importance of consistent error contracts.

**Tasks:**
- [ ] Create `apps/web/src/lib/error-handler.ts`
- [ ] Map error types to HTTP status codes:
  - `ConfigError` → 500 (internal configuration issue)
  - `DocumentError` → 422 (bad input)
  - `LLMParseError` → 502 (upstream AI service returned bad data)
  - `VectorStoreError` → 503 (upstream data service unavailable)
  - `EmbeddingError` → 502 (upstream service error)
  - Zod validation error (request body) → 422
  - Unknown error → 500
- [ ] Response format: `{ error: { code: "LLM_PARSE_FAILED", message: "...", details?: {...} } }`
- [ ] In production: never include stack traces. In development: include them.

**Acceptance criteria:**
- [ ] Every error type produces the correct HTTP status
- [ ] Response body always matches the `{ error: { code, message } }` shape
- [ ] Stack traces only appear when `NODE_ENV=development`

---

#### Story 7.3 — Implement request validation middleware

`[ ]` | Size: **S** | PRD: FR-1108

**What:** Create a Zod-based request validation middleware for Hono that validates request bodies before they reach the handler.

**Why:** Without input validation, a missing `resumeText` field causes a cryptic error deep in the chain. Validation at the API boundary catches bad input early with a clear 422 response.

**What you'll learn:** Zod for HTTP request validation, Hono middleware pattern, the "validate at the boundary" principle.

**Tasks:**
- [ ] Create `apps/web/src/lib/validate.ts`
- [ ] Export a `validate(schema)` function that returns Hono middleware
- [ ] Middleware: parse request body with `schema.safeParse()`, return 422 with Zod errors if invalid, call `next()` if valid
- [ ] Attach parsed data to Hono context (e.g., `c.set("body", parsed)`)
- [ ] Create request schemas for each endpoint:
  - `ingestRequestSchema`: `{ file: File, namespace: string }`
  - `jobFitRequestSchema`: `{ resumeText: string, jobDescriptionText: string, options?: {...} }`
  - `skillGapRequestSchema`: `{ resumeText: string, jobDescriptionText: string }`
  - `rewriteRequestSchema`: `{ resumeSection: string, jobDescriptionText: string }`
  - `askRequestSchema`: `{ question: string, namespace: string }`

**Acceptance criteria:**
- [ ] Missing `resumeText` → 422 with `{ error: { code: "VALIDATION_ERROR", details: [...] } }`
- [ ] Extra fields are stripped (no data leakage)
- [ ] Valid request proceeds to handler with typed body

---

#### Story 7.4 — Implement the job-fit API endpoint

`[ ]` | Size: **M** | PRD: FR-1101

**What:** Implement `POST /api/job-fit` — the first real endpoint that connects the API layer to the core engine.

**Why:** This is the template for all other endpoints. Getting one right means the rest follow the same pattern.

**What you'll learn:** Connecting HTTP handlers to the core engine, response envelope patterns (`{ data, meta }`), measuring and reporting execution time.

**Tasks:**
- [ ] Create `apps/web/src/app/api/[...route]/routes/job-fit.ts`
- [ ] Apply `validate(jobFitRequestSchema)` middleware
- [ ] Call `scoreJobFit()` from `@career-assistant/core`
- [ ] Measure execution time (`performance.now()`)
- [ ] Return: `{ data: JobFitResult, meta: { model, durationMs } }`
- [ ] Write integration test: mock core engine, verify HTTP request/response cycle

**Acceptance criteria:**
- [ ] `POST /api/job-fit` with valid body → 200 with `JobFitResult`
- [ ] Missing `resumeText` → 422
- [ ] LLM failure → 502 with structured error
- [ ] Response includes `meta.durationMs`

---

#### Story 7.5 — Implement remaining analysis endpoints

`[ ]` | Size: **M** | PRD: FR-1102, FR-1103, FR-1104

**What:** Implement `POST /api/skill-gap`, `POST /api/rewrite`, and `POST /api/ask` following the same pattern as job-fit.

**Why:** Each endpoint follows the same pattern: validate → call core → wrap response. Repetition here is intentional — it builds muscle memory for the API pattern.

**What you'll learn:** Recognizing patterns and applying them consistently, the value of a template-based approach to API development.

**Tasks:**
- [ ] `POST /api/skill-gap` → `analyzeSkillGaps()` → `SkillGapResult`
- [ ] `POST /api/rewrite` → `suggestRewrites()` → `RewriteResult`
- [ ] `POST /api/ask` → `askQuestion()` → `{ answer: string }`
- [ ] Each endpoint: validation middleware, core engine call, envelope response, duration tracking
- [ ] Write tests for each endpoint

**Acceptance criteria:**
- [ ] All four analysis endpoints work with valid input
- [ ] All four reject invalid input with 422
- [ ] All four handle core engine errors with appropriate status codes

---

#### Story 7.6 — Implement the ingest endpoint

`[ ]` | Size: **M** | PRD: FR-1100

**What:** Implement `POST /api/ingest` that accepts file uploads (multipart/form-data), processes them through the ingestion pipeline, and stores chunks in Pinecone.

**Why:** File upload is different from JSON endpoints — it uses `multipart/form-data` and needs file type validation, size limits, and in-memory processing (no filesystem in serverless).

**What you'll learn:** Handling multipart file uploads in Hono, `FormData` API, processing files in memory (no `fs.writeFile`), integrating the loader → splitter → embedder → vectorstore pipeline over HTTP.

**Tasks:**
- [ ] Handle `multipart/form-data` with `file` and `namespace` fields
- [ ] Validate: file type (`.pdf`, `.txt`, `.md`), file size (≤ 10MB)
- [ ] Read file content into memory (Buffer for PDF, string for text)
- [ ] Call loaders with in-memory content (may need to add buffer support to `loadPdf`)
- [ ] Run through ingestion pipeline: split → embed → upsert
- [ ] Return: `{ data: { chunksCreated: number, namespace: string } }`

**Acceptance criteria:**
- [ ] Upload a PDF → chunks created in Pinecone namespace
- [ ] Upload a .xlsx → 422 "Unsupported file type"
- [ ] Upload a 15MB file → 422 "File too large (max 10MB)"
- [ ] Missing file → 422

---

### Sprint 8 — Authentication & Rate Limiting

**Theme:** Lock down the API so only authenticated users can access it, and prevent abuse with rate limiting. This is where the system goes from "demo" to "multi-user platform."

**What you'll learn:** JWT authentication, middleware-based auth, rate limiting algorithms, per-user resource isolation.

---

#### Story 8.1 — Integrate Clerk authentication

`[ ]` | Size: **L** | PRD: NFR-202, FR-1106

**What:** Add Clerk authentication to the API. All endpoints (except `/api/health`) require a valid JWT.

**Why:** Without auth, anyone can use your OpenAI API key through your endpoints. Auth also enables per-user namespacing, usage tracking, and rate limiting.

**What you'll learn:** Clerk SDK integration, JWT verification, extracting user identity from tokens, middleware-based auth pattern.

**Tasks:**
- [ ] Install `@clerk/nextjs`
- [ ] Configure Clerk in `apps/web/.env.local` (publishable key, secret key)
- [ ] Create auth middleware: extract JWT from `Authorization: Bearer <token>`, verify with Clerk
- [ ] Extract `userId` from verified token, attach to Hono context
- [ ] Apply auth middleware to all `/api/*` routes except `/api/health`
- [ ] Derive Pinecone namespace from userId: `user_${userId}_resumes`
- [ ] Test: request without token → 401
- [ ] Test: request with invalid token → 401
- [ ] Test: request with valid token → proceeds to handler with `userId`

**Acceptance criteria:**
- [ ] Unauthenticated request → `{ error: { code: "UNAUTHORIZED", message: "..." } }` with 401
- [ ] Authenticated request proceeds with `userId` available in handler
- [ ] Each user's data is namespaced by their userId

---

#### Story 8.2 — Implement rate limiting

`[ ]` | Size: **M** | PRD: FR-1107

**What:** Add per-user rate limiting: 60 requests/minute for analysis endpoints, 10 requests/minute for ingestion.

**Why:** Without rate limits, one user (or bot) can exhaust your OpenAI quota and rack up costs. Rate limiting is a cost-control mechanism as much as a fairness one.

**What you'll learn:** Token bucket or sliding window rate limiting, in-memory vs distributed rate limiting, the `429 Too Many Requests` response with `Retry-After` header.

**Tasks:**
- [ ] Create `apps/web/src/lib/rate-limiter.ts`
- [ ] Implement sliding window rate limiter (in-memory for now — works for single-instance Vercel)
- [ ] Configuration: `{ windowMs: 60_000, maxRequests: 60 }` for analysis, `{ windowMs: 60_000, maxRequests: 10 }` for ingest
- [ ] Key by `userId` (from auth middleware)
- [ ] Rate limited response: 429 with `{ error: { code: "RATE_LIMITED", message, retryAfter: <seconds> } }` and `Retry-After` header
- [ ] Apply to all API routes as Hono middleware

**Acceptance criteria:**
- [ ] 61st request in 1 minute → 429 with `Retry-After` header
- [ ] Different users have independent rate limits
- [ ] Rate limit resets after the window expires

---

#### Story 8.3 — Add user data deletion endpoint

`[ ]` | Size: **M** | PRD: NFR-207

**What:** Implement `DELETE /api/user/data` that purges all of a user's vectors from Pinecone.

**Why:** GDPR and CCPA require users to be able to delete their data. Even outside regulatory requirements, users should be able to wipe their data at any time.

**What you'll learn:** Pinecone namespace deletion, the importance of data lifecycle management, building destructive endpoints safely (require auth, return confirmation).

**Tasks:**
- [ ] Create `DELETE /api/user/data` endpoint
- [ ] Require authentication
- [ ] Delete all vectors in the user's Pinecone namespace(s): `user_{userId}_resumes`, `user_{userId}_jds`
- [ ] Return: `{ data: { namespacesDeleted: ["..."], message: "All data deleted" } }`
- [ ] Log the deletion at `warn` level (audit trail)

**Acceptance criteria:**
- [ ] After deletion, queries against the user's namespace return 0 results
- [ ] Unauthenticated deletion attempt → 401
- [ ] Double deletion (already empty) → 200 (idempotent)

---

### Sprint 9 — Database Layer

**Theme:** Add PostgreSQL for persisting user data, analysis history, and usage tracking. This enables features like "show me my scoring trend over time."

**What you'll learn:** Drizzle ORM, database migrations, JSONB columns for flexible structured data, connecting serverless functions to serverless Postgres.

---

#### Story 9.1 — Set up Neon and Drizzle

`[ ]` | Size: **M** | PRD: ARCHITECTURE §14

**What:** Create the `packages/db` workspace package with Drizzle schema, migrations, and a database client.

**Why:** Separating the database layer into its own package keeps it reusable across the API and any future workers/scripts. Drizzle's schema-as-code makes the database self-documenting.

**What you'll learn:** Neon serverless Postgres, Drizzle schema definition, push-based migrations, connection pooling in serverless.

**Tasks:**
- [ ] Create `packages/db/` workspace package
- [ ] Install: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`
- [ ] Create Neon project at neon.tech, get connection string
- [ ] Add `DATABASE_URL` to `.env.example`
- [ ] Create `packages/db/src/schema.ts` with `users`, `documents`, `analyses` tables (from ARCHITECTURE §14)
- [ ] Create `packages/db/src/client.ts` — Drizzle client using Neon serverless driver
- [ ] Create `packages/db/drizzle.config.ts` for drizzle-kit
- [ ] Run `npx drizzle-kit push` to create tables in Neon
- [ ] Export schema and client from `packages/db/src/index.ts`

**Acceptance criteria:**
- [ ] `npx drizzle-kit push` creates all three tables in Neon
- [ ] Drizzle Studio (`npx drizzle-kit studio`) shows the tables
- [ ] `packages/db` builds successfully in the Turborepo pipeline

---

#### Story 9.2 — Persist analysis results

`[ ]` | Size: **M** | PRD: FR-210

**What:** After each analysis endpoint completes, save the result to the `analyses` table with user ID, document references, model used, token count, cost, and duration.

**Why:** Without persistence, every analysis is fire-and-forget. Saving results enables history, trends, and cost tracking.

**What you'll learn:** Drizzle insert operations, JSONB columns for storing structured analysis results, calculating OpenAI cost from token counts.

**Tasks:**
- [ ] Add `packages/db` as dependency of `apps/web`
- [ ] After each analysis endpoint returns, insert a row into `analyses`:
  - `userId` from auth context
  - `type` from endpoint (job_fit, skill_gap, rewrite, qa)
  - `result` as JSONB
  - `modelUsed` from options or default
  - `promptTokens`, `completionTokens` (from OpenAI response metadata — requires updating core to return token counts)
  - `costUsd` calculated from token counts × model pricing
  - `durationMs` from timing
- [ ] Don't block the API response on DB insert — fire and forget (or use `waitUntil` on Vercel)

**Acceptance criteria:**
- [ ] After a job-fit scoring call, a row appears in the `analyses` table
- [ ] `result` column contains valid JSON matching the analysis type
- [ ] A failed DB insert does NOT cause the API to return an error (analysis still succeeds)

---

#### Story 9.3 — Analysis history endpoints

`[ ]` | Size: **M** | PRD: —

**What:** Implement `GET /api/analyses` (list) and `GET /api/analyses/:id` (detail) endpoints.

**Why:** Users want to see their past analyses — "What was my score against that Google JD last week?" History also enables trend tracking in the web UI.

**What you'll learn:** Drizzle select queries, pagination patterns, filtering by user ID, handling "not found" for specific resources.

**Tasks:**
- [ ] `GET /api/analyses` → list all analyses for the authenticated user
  - Default sort: newest first
  - Pagination: `?limit=20&offset=0`
  - Filter: `?type=job_fit`
  - Return: `{ data: Analysis[], meta: { total, limit, offset } }`
- [ ] `GET /api/analyses/:id` → get a specific analysis
  - 404 if not found or not owned by user
  - Return: `{ data: Analysis }`
- [ ] Write tests for both endpoints

**Acceptance criteria:**
- [ ] List returns only the authenticated user's analyses (not other users')
- [ ] Pagination works (offset=0 limit=2 returns first 2, offset=2 limit=2 returns next 2)
- [ ] Requesting another user's analysis → 404 (not 403 — don't leak existence)

---

#### Story 9.4 — Persist document metadata on ingest

`[ ]` | Size: **S** | PRD: —

**What:** When a document is ingested via the API, save a row to the `documents` table with filename, type, namespace, and chunk count.

**Why:** Enables the web UI to show "Your uploaded documents" and link analyses to specific documents.

**What you'll learn:** Drizzle insert with returning, tracking document lifecycle.

**Tasks:**
- [ ] On successful ingest, insert into `documents`:
  - `userId`, `type` (resume or job_description — derive from namespace or request param), `filename`, `pineconeNamespace`, `chunkCount`, `characterCount`
- [ ] Return the document ID in the ingest response: `{ data: { id, chunksCreated, namespace } }`
- [ ] Add `GET /api/documents` — list user's documents
- [ ] Add `DELETE /api/documents/:id` — soft delete (set `deletedAt`) + delete vectors from Pinecone

**Acceptance criteria:**
- [ ] Ingest creates a document record
- [ ] Document list shows all non-deleted documents
- [ ] Delete marks as soft-deleted and removes Pinecone vectors

---

## Phase 3: Web UI & Features

**Goal:** A polished web dashboard, PDF export, interview prep, and LinkedIn ingestion. This is where the product becomes usable by non-technical people.

---

### Sprint 10 — Web Dashboard Foundation

**Theme:** Build the core layout and the first interactive page. Focus on getting the upload → analyze → view results flow working end-to-end in the browser.

**What you'll learn:** Next.js App Router, React Server Components, Tailwind CSS, client-side file upload, async data fetching in React.

---

#### Story 10.1 — Dashboard layout and navigation

`[ ]` | Size: **M** | PRD: FR-1006

**What:** Create the app shell: sidebar navigation, header, and main content area. Pages: Dashboard (home), Analyze, History, Settings.

**Why:** The layout is the skeleton that every page lives inside. Getting it right first means every future page automatically looks consistent.

**What you'll learn:** Next.js layout.tsx, nested layouts, Tailwind CSS for responsive sidebar, `"use client"` vs server components.

**Tasks:**
- [ ] Create `apps/web/src/app/layout.tsx` — root layout with sidebar
- [ ] Sidebar navigation: Dashboard, Analyze, History, Settings
- [ ] Active page highlighting
- [ ] Responsive: sidebar collapses to hamburger menu on mobile
- [ ] Create placeholder pages for each nav item (just titles for now)
- [ ] Add Clerk `<SignInButton>` / `<UserButton>` to header

**Acceptance criteria:**
- [ ] All four pages are navigable via sidebar
- [ ] Sidebar collapses on screens < 768px
- [ ] Auth buttons render (login flow works)

---

#### Story 10.2 — Document upload component

`[ ]` | Size: **M** | PRD: FR-1000

**What:** Build a drag-and-drop file upload component that sends files to `POST /api/ingest`.

**Why:** This is the entry point of the entire product flow. Users need to upload their resume before anything else can happen.

**What you'll learn:** Drag-and-drop API in React, `FormData` for file uploads, upload progress tracking, error state handling in UI.

**Tasks:**
- [ ] Create `apps/web/src/components/file-upload.tsx`
- [ ] Drag-and-drop zone with visual feedback (hover, active, error states)
- [ ] Click to browse fallback
- [ ] File type validation (client-side, before upload)
- [ ] File size validation (client-side)
- [ ] Upload progress indicator
- [ ] Success state: shows filename and chunk count
- [ ] Error state: shows error message from API
- [ ] Integrate into the Analyze page

**Acceptance criteria:**
- [ ] Drag a PDF onto the zone → uploads to API → shows success with chunk count
- [ ] Drag an .xlsx → shows client-side error "Unsupported file type" without hitting API
- [ ] Network error → shows "Upload failed, please try again"

---

#### Story 10.3 — Analyze page: trigger analysis

`[ ]` | Size: **L** | PRD: FR-1001, US-010, US-012, US-014

**What:** Build the Analyze page flow: upload resume → upload/paste JD → select analysis type → run → show results.

**Why:** This is the core user flow. Everything converges here.

**What you'll learn:** Multi-step forms in React, managing async state (loading, success, error), calling multiple API endpoints in sequence.

**Tasks:**
- [ ] Step 1: Upload resume (reuse file-upload component) or select from previously uploaded
- [ ] Step 2: Upload JD or paste JD text into a textarea
- [ ] Step 3: Select analysis type: Job Fit / Skill Gap / Rewrite / All
- [ ] Step 4: Click "Analyze" → loading state with spinner
- [ ] Step 5: Results appear below the form
- [ ] "All" option runs all three analyses in parallel and shows a tabbed result view
- [ ] Store analysis results in React state for immediate display

**Acceptance criteria:**
- [ ] Full flow works: upload resume → paste JD → click Analyze → see results
- [ ] Loading spinner during analysis
- [ ] Errors show in a toast/banner, not an alert()
- [ ] "All" mode shows three tabs (Fit Score, Skill Gaps, Rewrites)

---

#### Story 10.4 — Job-fit score visualization

`[ ]` | Size: **M** | PRD: FR-1001

**What:** Build the score display component: large overall score, dimension bar chart, strengths/concerns chips, summary text.

**Why:** Numbers alone don't communicate effectively. A visual score breakdown makes the analysis instantly understandable.

**What you'll learn:** Chart.js or Recharts integration, responsive chart sizing, color-coding scores (red/yellow/green), component composition in React.

**Tasks:**
- [ ] Install Recharts: `npm install recharts -w apps/web`
- [ ] Create `ScoreOverview` component: large circular score (0-100) with color
- [ ] Create `DimensionChart` component: horizontal bar chart for 5 dimensions
- [ ] Color coding: 0-40 red, 41-70 yellow, 71-100 green
- [ ] Create `StrengthsConcerns` component: green chips for strengths, red for concerns
- [ ] Create `SummaryText` component: the natural-language summary
- [ ] Compose all into a `JobFitResults` parent component

**Acceptance criteria:**
- [ ] Score of 74 shows as green
- [ ] All 5 dimensions visible in the bar chart
- [ ] Responsive: chart doesn't overflow on mobile
- [ ] Strengths show as green chips, concerns as red

---

### Sprint 11 — Skill Gap & Rewrite UI

**Theme:** Build the remaining analysis result views.

**What you'll learn:** Accordion/expandable UI patterns, diff visualization, conditional rendering based on severity, copy-to-clipboard.

---

#### Story 11.1 — Skill gap results view

`[ ]` | Size: **M** | PRD: FR-1002

**What:** Build the skill gap display: gaps grouped by severity, expandable detail for each gap, present strengths section.

**Tasks:**
- [ ] Create `SkillGapResults` component
- [ ] Group gaps by severity: Critical (red), Important (yellow), Nice-to-have (gray)
- [ ] Each gap is an expandable card showing: skill name, context, recommendation
- [ ] Collapsed state shows: skill name + severity badge
- [ ] `presentStrengths` displayed as green chips
- [ ] `readinessSummary` as a text block at the top

**Acceptance criteria:**
- [ ] Gaps are visually grouped by severity
- [ ] Clicking a gap card expands to show context and recommendation
- [ ] Critical gaps are visually prominent (red border/background)

---

#### Story 11.2 — Rewrite suggestions view

`[ ]` | Size: **M** | PRD: FR-1003

**What:** Build the rewrite display: side-by-side original vs. suggested text with rationale and copy buttons.

**Tasks:**
- [ ] Create `RewriteResults` component
- [ ] Each suggestion: original text (left/top) → suggested text (right/bottom)
- [ ] Visual diff highlighting (changed words highlighted)
- [ ] "Copy suggested text" button per suggestion
- [ ] Rationale shown below each suggestion in muted text
- [ ] `generalAdvice` shown as a bulleted list at the bottom

**Acceptance criteria:**
- [ ] Original and suggested text are clearly distinguished
- [ ] Copy button copies suggested text to clipboard
- [ ] Works on mobile (stacked layout, not side-by-side)

---

#### Story 11.3 — Q&A chat panel

`[ ]` | Size: **M** | PRD: FR-1007

**What:** Build a chat-style interface for the semantic Q&A feature. User types a question, gets a grounded answer.

**Tasks:**
- [ ] Create `QAPanel` component with chat-style message list
- [ ] Input field at the bottom with send button
- [ ] User messages right-aligned, AI responses left-aligned
- [ ] Loading indicator while waiting for response
- [ ] Connect to `POST /api/ask`
- [ ] Show in a slide-out panel or a dedicated tab on the Analyze page

**Acceptance criteria:**
- [ ] User can type a question and get an answer
- [ ] Messages are displayed in chat order
- [ ] Loading spinner while awaiting AI response

---

### Sprint 12 — History & Batch Comparison UI

**Theme:** Build the History page and the multi-JD comparison view.

**What you'll learn:** Data tables in React, sorting and filtering, comparing results visually.

---

#### Story 12.1 — Analysis history page

`[ ]` | Size: **M** | PRD: —

**What:** Build the History page showing all past analyses with filtering and detail views.

**Tasks:**
- [ ] Fetch from `GET /api/analyses` with pagination
- [ ] Table columns: Date, Type (badge), Resume, JD, Score, Actions
- [ ] Filter by type: All / Job Fit / Skill Gap / Rewrite
- [ ] Click a row → expand to show full result (reuse the result components from Sprint 10-11)
- [ ] "Re-run" button that pre-fills the Analyze page
- [ ] Pagination controls

**Acceptance criteria:**
- [ ] History page shows all past analyses
- [ ] Filtering works without a page reload
- [ ] Clicking a row shows the full stored result

---

#### Story 12.2 — Batch comparison view

`[ ]` | Size: **L** | PRD: FR-1004, US-016

**What:** Build the multi-JD comparison page: upload resume + multiple JDs → see ranked results in a table.

**Tasks:**
- [ ] Create a "Compare" sub-page under Analyze
- [ ] Upload/select one resume
- [ ] Upload/paste multiple JDs (add more dynamically)
- [ ] "Compare All" button → calls `POST /api/batch/job-fit`
- [ ] Results: sortable table with columns: Rank, JD Title, Score, Top Strength, Top Concern
- [ ] Highlight best fit row
- [ ] Click a row to expand full job-fit result

**Acceptance criteria:**
- [ ] Upload 3 JDs → ranked table with scores
- [ ] Table is sortable by any column
- [ ] Best fit is visually highlighted

---

### Sprint 13 — PDF Export & Interview Prep

**Theme:** Add the remaining P2 features: downloadable reports and interview preparation.

**What you'll learn:** Server-side PDF generation, building multi-section documents programmatically, generating educational content from analysis results.

---

#### Story 13.1 — PDF report generation

`[ ]` | Size: **L** | PRD: FR-900–FR-904

**What:** Generate a downloadable PDF report containing the full analysis: scores, gaps, and rewrite suggestions.

**Tasks:**
- [ ] Install `@react-pdf/renderer` in `apps/web`
- [ ] Create PDF template components: header, score section, gap section, rewrite section
- [ ] Score section: overall score, dimension table, strengths/concerns
- [ ] Gap section: severity-grouped list with recommendations
- [ ] Rewrite section: before/after pairs with rationale
- [ ] Footer: date, model used, "Generated by RAG Career Assistant"
- [ ] Create `GET /api/analyses/:id/pdf` endpoint that generates and streams the PDF
- [ ] Add "Download PDF" button on analysis result views

**Acceptance criteria:**
- [ ] Click "Download PDF" → browser downloads a .pdf file
- [ ] PDF contains all three analysis sections with formatting
- [ ] PDF includes metadata (date, model, resume/JD names)

---

#### Story 13.2 — Interview prep chain

`[ ]` | Size: **L** | PRD: FR-700–FR-703

**What:** Create a new chain that generates interview questions and answer frameworks from skill gap analysis results.

**Tasks:**
- [ ] Create `packages/core/src/chains/interview-chain.ts`
- [ ] Create `interviewPrepPrompt` in templates
- [ ] Input: `SkillGapResult` + JD text
- [ ] Output schema (Zod):
  ```
  { technicalQuestions: [{ question, suggestedApproach, relatedGap }],
    behavioralQuestions: [{ question, starFramework: { situation, task, action, result } }],
    tips: string[] }
  ```
- [ ] Generate 3-5 technical questions per critical/important gap
- [ ] Generate 3-5 behavioral questions from JD responsibilities
- [ ] Add `POST /api/interview-prep` endpoint
- [ ] Add "Generate Interview Prep" button on skill gap results
- [ ] Write tests

**Acceptance criteria:**
- [ ] Given a skill gap result with 2 critical gaps → at least 6 technical questions
- [ ] Each behavioral question includes a STAR framework skeleton
- [ ] Output passes Zod validation

---

#### Story 13.3 — Interview prep UI

`[ ]` | Size: **M** | PRD: FR-700

**What:** Build the interview prep display: tabbed view for technical and behavioral questions, expandable answer frameworks.

**Tasks:**
- [ ] Create `InterviewPrepResults` component
- [ ] Two tabs: Technical Questions, Behavioral Questions
- [ ] Each question is expandable to show the suggested approach/STAR framework
- [ ] Technical questions show which skill gap they relate to (linked badge)
- [ ] Tips shown as a callout box
- [ ] "Copy all questions" button for practice

**Acceptance criteria:**
- [ ] Technical and behavioral tabs work
- [ ] Expanding a question shows the answer framework
- [ ] Related skill gaps are visually linked

---

### Sprint 14 — LinkedIn Ingestion & Polish

**Theme:** Final feature sprint. Add LinkedIn import and polish the entire product for launch.

**What you'll learn:** Web scraping alternatives, graceful feature degradation, end-to-end product polish.

---

#### Story 14.1 — LinkedIn PDF import

`[ ]` | Size: **M** | PRD: FR-803

**What:** Support LinkedIn's "Save to PDF" export as an ingestion source. Add a dedicated "Import from LinkedIn" flow in the UI.

**Why:** Most users have a LinkedIn profile but not a resume PDF handy. LinkedIn's "Save to PDF" button generates a PDF that our existing PDF loader can handle — we just need to parse it slightly differently (LinkedIn PDFs have a specific structure).

**Tasks:**
- [ ] Add "Import from LinkedIn" option in the upload component
- [ ] Instructions: "Go to your LinkedIn profile → More → Save to PDF → Upload here"
- [ ] The existing PDF loader handles the file — add metadata `{ source: "linkedin" }`
- [ ] Test with a real LinkedIn PDF export to verify text extraction quality
- [ ] If extraction quality is poor (common with LinkedIn PDFs), add a text cleanup step

**Acceptance criteria:**
- [ ] LinkedIn PDF export uploads and ingests successfully
- [ ] Chunks are clean (no LinkedIn UI artifacts like "Show all skills →")
- [ ] Metadata identifies the source as LinkedIn

---

#### Story 14.2 — DOCX support

`[ ]` | Size: **M** | PRD: FR-109

**What:** Add DOCX file loading using `mammoth` (lightweight DOCX → text converter).

**Tasks:**
- [ ] Install `mammoth` in `packages/core`
- [ ] Create `src/loaders/docx-loader.ts`
- [ ] Extract text from paragraphs, tables, and headers
- [ ] Update `src/index.ts` and API ingest endpoint to recognize `.docx` extension
- [ ] Write tests with a fixture DOCX file
- [ ] Update file validation allowlist

**Acceptance criteria:**
- [ ] `.docx` file ingests successfully
- [ ] Text from tables and headers is preserved
- [ ] File type validation accepts `.docx`

---

#### Story 14.3 — Document deduplication

`[ ]` | Size: **M** | PRD: FR-110

**What:** When re-ingesting a document that was previously uploaded, delete old vectors before inserting new ones.

**Tasks:**
- [ ] Hash the document content (SHA-256 of `pageContent`)
- [ ] Store the hash in document metadata (both Pinecone metadata and Postgres `documents` table)
- [ ] On ingest: check if a document with the same source filename exists for this user
- [ ] If exists: delete old vectors from Pinecone (filter by source metadata), then upsert new ones
- [ ] Update the `documents` table row with new chunk count and hash

**Acceptance criteria:**
- [ ] Re-ingesting the same file → old vectors deleted, new vectors created, chunk count updated
- [ ] Re-ingesting a different file with the same name → treated as an update
- [ ] Ingesting a brand new file → no deletion attempt

---

#### Story 14.4 — Mobile responsive polish

`[ ]` | Size: **M** | PRD: FR-1005

**What:** Audit and fix all UI components for mobile viewports (≥ 375px).

**Tasks:**
- [ ] Test every page at 375px, 414px, and 768px widths
- [ ] Fix: charts that overflow, tables that scroll, text that truncates badly
- [ ] Sidebar: verify hamburger menu works smoothly
- [ ] Upload zone: verify drag-and-drop works on mobile (fallback to tap-to-browse)
- [ ] Results: verify expandable cards work with touch
- [ ] PDF download: verify it works on mobile browsers

**Acceptance criteria:**
- [ ] No horizontal scroll on any page at 375px
- [ ] All interactive elements are tap-friendly (min 44px touch target)
- [ ] Core flow (upload → analyze → view results) works on mobile

---

#### Story 14.5 — End-to-end smoke test

`[ ]` | Size: **M** | PRD: —

**What:** Write a manual test script that exercises every feature end-to-end. Run it against the deployed Vercel preview.

**Tasks:**
- [ ] Create `docs/E2E_TEST_SCRIPT.md` with step-by-step manual test cases:
  - [ ] Sign up / sign in
  - [ ] Upload resume PDF
  - [ ] Upload JD text
  - [ ] Run job-fit scoring → verify score display
  - [ ] Run skill gap analysis → verify gap list
  - [ ] Run rewrite suggestions → verify before/after
  - [ ] Run batch comparison with 3 JDs → verify ranked table
  - [ ] Generate interview prep → verify questions
  - [ ] Download PDF report → verify content
  - [ ] View analysis history → verify past results
  - [ ] Delete all data → verify namespace emptied
  - [ ] Ask a Q&A question → verify grounded answer
  - [ ] Test on mobile viewport
- [ ] Run the script against Vercel preview deployment
- [ ] File bugs for any failures

**Acceptance criteria:**
- [ ] All test cases pass on Vercel preview
- [ ] All test cases pass on mobile
- [ ] No console errors in browser DevTools

---

## Summary

| Phase | Sprints | Duration | Deliverable |
|---|---|---|---|
| **Phase 1: Core Engine** | Sprints 1-5 | 5 weeks | Battle-tested CLI with all chains, 85%+ test coverage, CI/CD |
| **Phase 2: API & Hardening** | Sprints 6-9 | 4 weeks | REST API, auth, rate limiting, database, monorepo |
| **Phase 3: Web UI & Features** | Sprints 10-14 | 5 weeks | Next.js dashboard, batch comparison, PDF export, interview prep, LinkedIn import |
| **Total** | **14 sprints** | **14 weeks** | Full product |

### Story Count by Phase

| Phase | Stories | S | M | L | XL |
|---|---|---|---|---|---|
| Phase 1 | 20 | 7 | 10 | 3 | 0 |
| Phase 2 | 14 | 3 | 9 | 2 | 0 |
| Phase 3 | 16 | 0 | 11 | 5 | 0 |
| **Total** | **50** | **10** | **30** | **10** | **0** |
