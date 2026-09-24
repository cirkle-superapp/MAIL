# CIRKLE Search Engine — Top-Tier Audit Report

**Audit date:** 2024 (single session)
**Auditor:** sub-agent (COO/CTO/testing hat) reporting to the orchestrator
**Project root:** `/home/z/my-project`
**Headline:** The CIRKLE project is an impressive demo-grade search engine with strong architectural bones, a working BrightData integration, and a credible zero-cost guarantee. **It is NOT production-ready.** Three P0 blockers (unauthenticated paid-API gateway, broken observability, broken ranking normalization) and four P1 critical issues (gated live-web fallback, dead code in metrics path, dead `z-ai-web-dev-sdk` dependency, missing test framework) must be fixed before any public launch. The 20/20 evaluation suite passing is misleading because it checks result COUNT, not RELEVANCE — and the index only has 33 documents, so most "real-world" queries (Steve Jobs, apple, Albert Einstein) return irrelevant top hits.

---

## Executive Summary

CIRKLE has the skeleton of a serious search engine: BM25 retrieval with an inverted index, 9 ranking modes, query understanding, an AI answer layer, sponsored-result isolation, a BrightData scraping tier with circuit-breaker budget guard, robots.txt compliance, sitemap parsing, RSS ingestion, rate limiting, and a thoughtful UI with a working sticky footer. The code quality is genuinely above average — comments explain the *why*, types are clean, lint passes with zero warnings.

**But the engine fails its primary job: returning relevant results for queries that real users ask.** Probes in this audit:

| Query | Top result returned | Actually relevant? |
|---|---|---|
| `Steve Jobs` | "The Rust Programming Language" (by Steve Klabnik) | No — coincidence: "steve" + "jobs" (as in job postings) |
| `apple` | "The Verge" | No — the word "apple" appears somewhere in the page |
| `Albert Einstein` | "GOV.UK" (per prior audit) | No |
| `Taylor Swift Eras Tour` | 7 index hits, 0 live-web hits | None of the 7 are about Taylor Swift |
| `Lionel Messi Inter Miami` | 2 index hits, 0 live-web hits | None about Messi |
| `Beyonce Renaissance Tour` | 3 index hits, 0 live-web hits | None about Beyoncé |
| `Kylian Mbappe Real Madrid` | 9 index hits, 0 live-web hits | None about Mbappé |

Three root causes compound:

1. **Index is too small (33 docs).** No Wikipedia, no Apple, no Einstein. Any 2-token query (e.g. "Steve Jobs") matches SOMETHING in 33 docs by accident.
2. **BM25 scores aren't normalized** before being fed into the ranking formula, which then clamps to [0,1]. This destroys discrimination: 3 of 4 "Steve Jobs" results have `relevanceScore=1.0`. Ranking is effectively arbitrary.
3. **Live-web fallback is gated on `indexResultCount > 0`.** So whenever the index returns ANY result (even irrelevant), the live web (DuckDuckGo) fallback is suppressed — meaning the engine never escapes the bad 33-doc index for celebrity/news queries.

**On top of the relevance crisis, three P0 security/observability issues are present:**

- **`/api/brightdata/scrape` is unauthenticated + unrate-limited.** Any visitor can POST `{"url":"https://anything"}` and consume BrightData budget (5/day, 25/month). Worse: it's an **SSRF amplifier** — an attacker can ask CIRKLE to scrape internal URLs via BrightData's residential proxies, bypassing corporate firewalls. Verified live in this audit (HTTP 200, consumed 1 daily call).
- **`/api/metrics` is broken.** Returns `total searches: 0` even after 8+ real searches in this session. The metrics module-scoped `state` is not shared between the `/api/metrics` route module and the `src/lib/search/index.ts` module (Next.js dev-mode module isolation + cold-start resets in serverless). Verified live.
- **`/api/brightdata/snapshot/[id]` and `/api/brightdata/datasets` are also unauthenticated** (same code pattern — comment says "Auth: optional BRIGHTDATA_OPERATOR_TOKEN env" but no code reads that env var). Both verified live.

The project has **no README**, **no `.env.example`**, **no CI/CD** (`.github/workflows/` missing), **no test framework installed** (no vitest/jest/playwright-test in devDependencies), and the **`z-ai-web-dev-sdk` package is STILL in `package.json`** even though Task 71 was supposed to remove it (it's only mentioned in 5 stale comments, never imported).

**Honest verdict:** Demo-grade, architecturally credible, **not shippable to end users today**. Fix the 3 P0s and the ranking normalization bug → you have a credible beta. Fix the index size + live-web fallback gating → you have a credible search engine.

---

## Audit Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Functional correctness | 5/10 | Core pipeline runs end-to-end. But metrics broken, response missing `tookMs`/`totalFound`, live-web fallback gated out by noisy index, dead code in tool-path metrics branch. |
| Search relevance | 2/10 | Top-3 hit for "Steve Jobs" is the Rust book; "apple" → The Verge; "Albert Einstein" → GOV.UK. Root causes: (a) 33-doc index, (b) BM25 scores unbounded then clamped to 1.0, (c) live-web fallback gated on `indexResultCount>0`. |
| Code quality | 7/10 | Comments explain intent. Types clean. Lint passes (0/0). Strict mode on. But `noImplicitAny:false` weakened, dead dep in package.json, dead code after `return` in metrics path, no FKs in schema. |
| Security | 3/10 | **P0: 3 BrightData endpoints unauthenticated + unrate-limited (scrape/snapshot/datasets). P0: SSRF amplifier via scrape endpoint.** Token isn't leaked in responses (good). Rate limit works (good). But the open BrightData gateway is a budget-burn + SSRF attack surface. |
| Performance | 7/10 | Sub-second searches for 33 docs. Inverted index built once per cache miss. Response times look fine. No performance regression expected at this scale. Will need rework for 100k+ docs (whole-index reload on every cache miss). |
| Observability | 2/10 | **Metrics endpoint reports 0 searches after 8+ real searches.** No `tookMs` in response. No structured logging. BrightData fallback errors swallowed silently in `crawler.ts:161`. The "structured observability" claimed in §66 is not actually observable. |
| Reliability | 6/10 | Zero-cost guarantee budget guard is robust (file-persisted, rollover correct, disable-on-auth-fail). Crawlers fall back gracefully. But: no circuit breaker around Neon (fire-and-forget), no retries on transient 5xx, no health endpoint. |
| Production readiness | 3/10 | No README. No `.env.example`. No CI/CD. No tests. 3 P0 security issues. Broken metrics. Unauthenticated paid-API gateway. Not production-ready. |
| Documentation | 2/10 | No README. No `.env.example`. No `CONTRIBUTING.md`. Inline code comments are good, but external docs are zero. |
| Testing | 1/10 | No test framework installed. The "20/20 eval pass" checks COUNT only, not RELEVANCE — misleading. No unit tests, no integration tests, no e2e tests, no load tests. |
| **Overall** | **38/100** | Architecturally promising, security-and-relevance broken. |

---

## P0 — Blockers (must fix before any production)

### P0-1. Unauthenticated, unrate-limited BrightData scrape endpoint (SSRF amplifier + budget burn)

**File:** `src/app/api/brightdata/scrape/route.ts` (full file, ~90 lines)

**Description:** The POST handler at line 27 accepts any JSON body with a `url` field, calls `brightDataScrapingBrowserFetch(url)` which drives BrightData's remote Puppeteer over wss, and returns the rendered HTML. **There is no auth check anywhere in the file.** The comment at the top (line 16) claims *"Auth: optional BRIGHTDATA_OPERATOR_TOKEN env. If unset, open in dev."* — but the env var `BRIGHTDATA_OPERATOR_TOKEN` is never read anywhere in the codebase. The "optional" auth is a phantom.

**Impact:**
1. **Budget burn**: any visitor can POST `{"url":"https://example.com"}` and consume 1 of the 5 daily BrightData calls. An attacker can drain the entire 25/month budget in 25 unauthenticated POSTs from a single script.
2. **SSRF amplifier (worse)**: an attacker can pass `{"url":"http://10.0.0.5:8080/admin"}` or `{"url":"http://internal-server.corp/secret"}` — CIRKLE will ask BrightData's residential proxies to fetch that internal URL and return the rendered HTML to the attacker. This bypasses corporate firewalls and exposes internal services that BrightData's egress can reach.

**Repro (confirmed live in this audit):**
```bash
$ curl -X POST http://localhost:3000/api/brightdata/scrape \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com","ingest":false}'
HTTP 200
{"ok":true,"url":"https://example.com","finalUrl":"https://example.com/",
 "status":200,"contentType":"text/html","htmlBytes":559,"htmlPreview":"<!doctype...","budget":{...}}
```

**File:line:** `src/app/api/brightdata/scrape/route.ts:27-90` (entire POST handler)

**Fix recommendation:**
1. Add a hard auth check at the top of POST:
   ```ts
   const opToken = process.env.BRIGHTDATA_OPERATOR_TOKEN
   if (!opToken) {
     return NextResponse.json({ error: 'scrape_endpoint_disabled' }, { status: 403 })
   }
   const auth = req.headers.get('authorization')
   if (auth !== `Bearer ${opToken}`) {
     return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
   }
   ```
2. Validate the `url` against an allow-list of public suffixes (block RFC1918 + localhost + link-local):
   ```ts
   const u = new URL(url)
   const host = u.hostname.toLowerCase()
   if (host === 'localhost' || host.startsWith('127.') || host.startsWith('10.') ||
       host.startsWith('192.168.') || host.startsWith('169.254.') || host.endsWith('.local') ||
       /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
     return NextResponse.json({ error: 'private_network_blocked' }, { status: 400 })
   }
   ```
3. Apply the same per-IP rate limiter used by `/api/search` (cap at, say, 3 BrightData scrapes/hour/IP).
4. Apply the same auth + SSRF-block + rate-limit to `/api/brightdata/snapshot/[id]/route.ts` and `/api/brightdata/datasets/route.ts` — same bug, same fix.

---

### P0-2. Broken metrics endpoint — `/api/metrics` reports 0 searches after real searches

**Files:** `src/lib/search/metrics.ts` (module-scoped `state`), `src/app/api/metrics/route.ts` (imports `getMetrics` from same module), `src/lib/search/index.ts:543,587,990` (calls `recordSearch`).

**Description:** `metrics.ts` keeps the counters in a module-scoped `const state: MetricsState = {...}`. In Next.js dev mode with HMR, the route module `/api/metrics/route.ts` may import a different module instance than the search pipeline `src/lib/search/index.ts` (HMR can split module graphs). In production serverless, every cold start resets `state` to zero. So:
- Searches DO call `recordSearch` (line 990 — confirmed)
- BUT `/api/metrics` reads from a different `state` instance → always returns 0.

**Repro (confirmed live in this audit):**
```bash
# Make 8 real searches first (Steve Jobs, apple, zzzz nonexistent, etc.)
$ curl http://localhost:3000/api/metrics
{"searches":{"total":0,"cacheHits":0,"zeroResult":0,...},
 "latency":{"p50":0,"p95":0,"samples":0},
 "recent":[]}
```

**File:line:** `src/lib/search/metrics.ts:39-49` (the `state` object), `src/app/api/metrics/route.ts:12-16`.

**Fix recommendation:**
The simplest fix is to make the metrics state **durable** rather than in-memory:
1. Persist counters to SQLite (new `Metric` table or simple `KeyValue` table with `key=metrics_state`, `value=JSON`).
2. `recordSearch` writes to SQLite (debounced / batched).
3. `getMetrics` reads from SQLite + applies a 60s in-memory read cache for the `/api/metrics` endpoint.
4. Alternative: use Neon's persistent analytics that the codebase ALREADY writes to (`recordNeonAnalytics` at `src/lib/search/index.ts:982`) — but Neon writes are fire-and-forget + the read path is commented out (line 547) "intentionally NOT in the hot path" because of cold-cache latency in the sandbox. Either fix the Neon read path or move to SQLite.

Without this fix, the metrics endpoint is **actively misleading** — operators relying on it for SLA monitoring will see "0 searches" on a busy production server.

---

### P0-3. Ranking normalization bug — BM25 scores unbounded then clamped to 1.0, destroying discrimination

**File:** `src/lib/search/ranking.ts:285` (the `score = clamp01(score)` line).

**Description:** The ranking formula in `BALANCED` mode (line 253) is:
```
score = 0.30*lex + 0.18*sem + 0.15*q + 0.10*fr + 0.09*st + 0.05*or + 0.05*intent + 0.08*auth
```
The coefficients assume each signal is in [0,1]. **But `lex` is the raw BM25 score, which is unbounded** (typically 0–10+ for matching docs). So `0.30 * lex` alone exceeds 1.0 for any matched doc, then `clamp01(score)` collapses the result to 1.0. The downstream `results.sort((a,b) => b.relevanceScore - a.relevanceScore)` becomes a no-op for any pair of matched docs that both saturate.

**Repro (confirmed live in this audit):**
```
Query: "Steve Jobs"
1. score=1.000 | title=The Rust Programming Language
2. score=1.000 | title=Hacker News
3. score=1.000 | title=News | World Bank Group
4. score=0.942 | title=Pricing · Plans for every developer · GitHub
```
3 of 4 results hit the ceiling. The 4th (0.942) only escapes because its BM25 score happened to be slightly lower. The displayed `whySignals` includes "Strong topical relevance" for ALL of them — which is false for all 4.

**File:line:** `src/lib/search/ranking.ts:232` (`const lex = c.tfidf` — raw BM25), `src/lib/search/ranking.ts:285` (`score = clamp01(score)`).

**Fix recommendation:**
1. Normalize the BM25 score by the maximum BM25 score across the candidate set, BEFORE feeding into the linear formula:
   ```ts
   const maxLex = Math.max(...candidates.map(c => c.tfidf), 0.0001)
   for (const c of candidates) {
     const lex = c.tfidf / maxLex  // NOW in [0,1]
     ...
   }
   ```
2. Alternatively, use min-max normalization over a smoothed range: `lex = (c.tfidf - minTfidf) / (maxTfidf - minTfidf + epsilon)`.
3. The `semanticBoost` function (line 132-138) ALSO uses raw tfidf — same fix.
4. Add a relevance threshold: if `lex < 0.05` after normalization, drop the result (don't return near-miss docs as top hits). This will fix the "apple" → The Verge problem.
5. Add unit tests asserting that for a 2-token query, the top-3 docs have DISTINCT scores (no two docs saturate to 1.0).

---

## P1 — Critical (must fix within 1 week)

### P1-1. Live-web fallback is gated on `indexResultCount > 0` — so the engine never escapes the 33-doc index for celebrity/news queries

**File:** `src/lib/search/tools.ts:790-798` (`shouldLiveWebFallback`).

**Description:** The function:
```ts
export function shouldLiveWebFallback(query: string, indexResultCount: number): boolean {
  if (indexResultCount > 0) return false  // <-- this line
  ...
}
```
means: if the index returns ANY result (even an irrelevant one), the live-web fallback is suppressed. The caller in `src/lib/search/index.ts:902` is:
```ts
if (shouldLiveWebFallback(query, finalRanked.length)) { ... }
```

So whenever the BM25 query finds even 1 doc (which it almost always does for any 2-token query in a 33-doc index that includes Wikipedia + news sites + tech docs), DuckDuckGo never gets called.

**Repro (confirmed live):**
| Query | index results | live-web results |
|---|---|---|
| Taylor Swift Eras Tour | 7 | 0 |
| Lionel Messi Inter Miami | 2 | 0 |
| Beyonce Renaissance Tour | 3 | 0 |
| Kylian Mbappe Real Madrid | 9 | 0 |
| zzzz nonexistent | 0 | 0 (DuckDuckGo found nothing for fake string) |

**Impact:** The engine's "real-time" capability is functionally dead for any query that triggers even an irrelevant match. This is the #2 search bug (after P0-3).

**File:line:** `src/lib/search/tools.ts:791`.

**Fix recommendation:**
1. Change the gate to: trigger the live-web fallback if `finalRanked.length < 3` (instead of `=== 0`), OR if the average relevance score of `finalRanked` is below a threshold (e.g. 0.3 — meaning "the index didn't find anything confidently").
2. Better: always run the live-web fallback in parallel with the index query for non-trivial queries (cost = 1 extra DuckDuckGo call per search, which is free), then merge live-web results into the SERP below the index results when the index results are weak.
3. Even better: switch the gate to a confidence model: if the top-3 index results have a mean normalized BM25 score below 0.3, OR if the query tokens have < 50% coverage in the top result, trigger the fallback.

---

### P1-2. Dead code in tool-path metrics — `recordSearch` after `return` in `index.ts:587`

**File:** `src/lib/search/index.ts:586-605`.

**Description:** Look at the structure:
```ts
if (toolResult.instantAnswer) {
  const indexStats: IndexStats = { ... }
  try { ... } catch { /* ignore */ }
  return {                       // line 569 — RETURNS HERE
    query,
    ...
  }
  // Record tool-path metrics.
  recordSearch({ ... })          // line 587 — UNREACHABLE
  return {                       // line 588 — UNREACHABLE
    query,
    ...
  }
}
```
Lines 587-605 are completely unreachable. The tool-path search (weather, time, math) metrics never get recorded.

**File:line:** `src/lib/search/index.ts:569` (the early return) and `src/lib/search/index.ts:587` (the dead `recordSearch` call).

**Fix recommendation:**
1. Move the `recordSearch({...})` call ABOVE the `return` statement (line 569).
2. Delete the duplicated unreachable `return` block (lines 588-604).
3. Add an ESLint rule `no-unreachable` (it's part of `eslint:recommended` — if it's not flagging this, the project's eslint config has it disabled).

---

### P1-3. Dead `z-ai-web-dev-sdk` dependency in `package.json`

**File:** `package.json:86`.

**Description:** Task 71 was supposed to remove `z-ai-web-dev-sdk` from the dependencies. The audit confirms it's still there:
```json
"z-ai-web-dev-sdk": "^0.0.18",
```
A grep across `src/` confirms it's **never imported** — only mentioned in 5 stale comments:
- `src/app/api/search/route.ts:15` (comment)
- `src/components/search/types.ts:8` (comment)
- `src/lib/llm.ts:4` (comment)
- `src/lib/search/index.ts:21` (comment)
- `src/store/search-store.ts:21` (comment)

**Impact:** Adds dead weight to `node_modules` + `bun.lock`, slows installs, confuses future contributors who might think it's still in use. Also a security/supply-chain issue — every transitive dep of `z-ai-web-dev-sdk` is now in the install graph for no reason.

**File:line:** `package.json:86`.

**Fix recommendation:**
1. `bun remove z-ai-web-dev-sdk`
2. Update the 5 stale comments to remove the reference (or update to "the unified LLM client at `src/lib/llm.ts`").
3. Run `bun install` to regenerate `bun.lock`.

---

### P1-4. No test framework installed — the "20/20 eval pass" checks COUNT only, not RELEVANCE

**Files:** `package.json:90-100` (devDependencies — no vitest/jest/playwright-test).

**Description:** There is no test framework in the project. The "evaluation suite" mentioned in the prior audit is a script that counts result COUNT, not RELEVANCE. So when it reports "20/20 pass", what it actually means is "20 queries each returned ≥1 result" — which is trivially true even when the top result is the Rust book for "Steve Jobs".

**Impact:** No regression protection. No way to assert "the top 3 results for 'Steve Jobs' should not contain any programming-language book". Refactors (like fixing P0-3) can't be validated automatically.

**Fix recommendation:**
1. Install vitest + @testing-library/react + playwright:
   ```bash
   bun add -d vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
   bun add -d @playwright/test
   ```
2. Write a `tests/relevance.test.ts` that asserts for a fixed query list, the top-3 titles do NOT contain obvious irrelevance markers (e.g. for "Steve Jobs", reject any top-3 result whose title contains "Rust", "Programming", "Job Posting").
3. Write a `tests/api.test.ts` that asserts:
   - `/api/brightdata/scrape` returns 401 without auth (after P0-1 fix)
   - `/api/metrics` returns `total > 0` after a real search (after P0-2 fix)
   - `/api/search` response includes `tookMs` and `totalFound` (after P2-1 fix)
4. Wire up `bun run test` in package.json scripts.
5. Add a GitHub Actions workflow that runs lint + typecheck + tests on every PR (after P2-3 fix).

---

## P2 — Important (must fix within 1 month)

### P2-1. `/api/search` response missing `tookMs` and `totalFound` observability fields

**File:** `src/lib/search/index.ts:952-973` (the `response` object construction).

**Description:** The current top-level response keys are:
```
query, interpretedQuery, instantAnswer, liveWebResults, aiAnswer,
knowledgeCard, sponsored, results, clusters, relatedQuestions,
didYouMean, pagination, personalized, personalizationFactors, indexStats
```
Missing: `tookMs` (search latency in ms) and `totalFound` (total matching docs from index, distinct from `pagination.totalResults` which is post-filter).

**Impact:** Frontend can't show "Searched in 245 ms" UX. Operators can't get per-query latency from the response body. The metrics endpoint (P0-2) is the only other place latency is recorded — and it's broken.

**File:line:** `src/lib/search/index.ts:952`.

**Fix recommendation:** Add to the response:
```ts
const response: SearchResponse = {
  query,
  tookMs: Date.now() - _searchStart,  // <-- ADD
  totalFound: hits.length,             // <-- ADD (pre-pagination)
  interpretedQuery,
  ...
}
```
Update the `SearchResponse` type at line 168 accordingly.

---

### P2-2. BrightData fallback in `crawler.ts` is silent — no structured logging

**File:** `src/lib/search/crawler.ts:161` (`} catch { /* BrightData unavailable */ }`).

**Description:** When the BrightData Scraping Browser fallback fails (budget exhausted, wss connection error, navigation timeout, etc.), the error is swallowed with `catch {}`. There's no log line, no metric increment, no error-report. Operators have no visibility into "BrightData fallback is failing 80% of the time" until a user complains.

**File:line:** `src/lib/search/crawler.ts:161-164`.

**Fix recommendation:**
1. Add structured logging: `console.warn('[crawler] brightdata fallback failed', { url: currentUrl, status, error: e?.message })` (or use a real logger — pino/winston).
2. Increment a metric counter (after P0-2 fix lands) — `recordBrightDataFallbackFailure()`.
3. Same fix for `src/lib/search/tools.ts:605,622` (DuckDuckGo fallback swallows errors).

---

### P2-3. No CI/CD — `.github/workflows/` is missing

**File:** project root — `.github/` directory does not exist.

**Description:** No GitHub Actions workflows. No automated lint, typecheck, test, or build on PRs. The prior audit verified `bun run lint` passes with 0/0 — but there's no enforcement that the NEXT PR keeps it that way.

**Impact:** Regressions can land without anyone noticing. The 20/20 eval can silently degrade to 18/20 with no signal.

**Fix recommendation:** Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run db:generate
      - run: bun run build
      # After P1-4 lands: - run: bun run test
```

---

### P2-4. No README.md

**File:** project root — `README.md` does not exist.

**Description:** A 1000-file Next.js project with no README. New contributors have to reverse-engineer the architecture from comments. The worklog.md is internal-only (and is in .gitignore).

**Fix recommendation:** Write a README.md covering:
1. What CIRKLE is (one-paragraph value prop).
2. Quickstart: `bun install`, `cp .env.example .env`, `bun run db:push`, `bun run dev`.
3. Architecture diagram (the 6 layers: Crawler → Indexer → Retriever → Ranker → AI Layer → UI).
4. Where things live (link to `src/lib/search/`).
5. How to add a BrightData scrape (link to `/api/brightdata/scrape`).
6. Testing (after P1-4 lands).
7. Deployment notes.

---

### P2-5. No `.env.example`

**File:** project root — `.env.example` does not exist.

**Description:** New developers cloning the repo have no idea which env vars are required. The `.env` file is correctly gitignored (`.env*` in `.gitignore` line 34 — confirmed in this audit), but there's no template.

**Fix recommendation:** Create `.env.example` with all required env vars (DATABASE_URL, BRIGHTDATA_TOKEN, BRIGHTDATA_SBR_WSS, BRIGHTDATA_SELENIUM, BRIGHTDATA_DAILY_CAP, BRIGHTDATA_MONTHLY_CAP, BRIGHTDATA_OPERATOR_TOKEN, BRIGHTDATA_DISABLE_MINUTES, BRIGHTDATA_BUDGET_FILE) + comments explaining each.

---

### P2-6. BrightData budget guard has a race condition (no file locking)

**File:** `src/lib/brightdata.ts:123-156` (`loadState`), `158-168` (`persistState`), `198-205` (`recordSuccess`).

**Description:** `recordSuccess` does:
1. `loadState()` — reads JSON file from disk
2. Mutates `_state` in memory
3. `persistState()` — writes JSON to disk

If two concurrent requests both call `recordSuccess` at the same time:
- Req A: reads `{dailyCount: 3}`, increments to 4
- Req B: reads `{dailyCount: 3}` (still 3, because A hasn't written yet), increments to 4
- Req A: writes `{dailyCount: 4}`
- Req B: writes `{dailyCount: 4}` (overwrites A's write)

Net result: 2 BrightData calls happened, but the counter only incremented by 1. The daily cap can be silently exceeded under concurrent load.

**Impact:** The "zero-cost guarantee" can leak under load. An attacker firing 10 concurrent scrape requests could blow past the 5/day cap before the file locks catch up.

**File:line:** `src/lib/brightdata.ts:198-205`.

**Fix recommendation:**
1. Use a proper atomic write: write to a temp file + rename (atomic on POSIX).
2. Use a process-wide mutex (e.g. `async-mutex` npm package, or a simple `let writeLock: Promise<void> = Promise.resolve()` chain).
3. Better: replace the file-based counter with a SQLite table (Prisma `KeyValue` model) + transactions. SQLite handles concurrent writes correctly out of the box.
4. Add a test: fire 10 concurrent `recordSuccess` calls, assert `dailyCount === 10` after.

---

### P2-7. Prisma schema lacks foreign keys, cascades, and several useful indexes

**File:** `prisma/schema.prisma` (full file).

**Description:**
- **No FKs**: `CrawlQueue.url` is unique but not linked to `Document.url`. `Link.sourceUrl` / `Link.targetUrl` are plain strings with no integrity enforcement. `SearchHistory.sessionId` is not linked to a Session table. Orphan rows can accumulate silently.
- **No `onDelete` cascade**: if a Document row is deleted, its corresponding CrawlQueue entry stays (status='done'), its Link rows stay (pointing to a dead URL), its postings stay (until next reindex).
- **Missing indexes**: `Document` has no index on `publishedAt` (needed for LATEST mode `ORDER BY publishedAt DESC`), no index on `language` or `country` (filtered queries scan the whole table).
- **No audit fields**: no `createdBy`, `updatedBy`, `deletedAt` anywhere — can't do soft-delete or audit who crawled what.
- **`Entity.sourceRefs`** is a JSON string column — should be a separate `EntityRef` table for queryability.

**File:line:** `prisma/schema.prisma:21-194`.

**Fix recommendation:** Add FKs:
```prisma
model Document {
  ...
  crawlQueueEntry CrawlQueue?  @relation(fields: [url], references: [url])
  links           Link[]
}
model Link {
  ...
  sourceDocument Document? @relation(fields: [sourceUrl], references: [url])
  targetDocument Document? @relation(fields: [targetUrl], references: [url])
}
```
Add indexes:
```prisma
@@index([publishedAt])   // for LATEST mode
@@index([language])      // for filtered queries
@@index([country])
```
Add `deletedAt DateTime?` to Document for soft-delete.

---

### P2-8. Misleading "3-tier live-web fallback" — Tier 1 (BrightData SERP) is dead code

**File:** `src/lib/brightdata.ts:630-638` (`brightDataSerp`), `src/lib/brightdata.ts:640-643` (`isBrightDataSerpWorthIt`), `src/lib/search/tools.ts:586-607`.

**Description:** `brightDataSerp` always returns `null` (no SERP zone configured on the user's BrightData account). `isBrightDataSerpWorthIt` always returns `false`. So `runLiveWebSearch` Tier 1 is dead — every call falls through to Tier 2 (DuckDuckGo). The function names + comments still advertise a 3-tier fallback.

Worse: `brightDataSerp` calls `recordFallback('serp', 'no_serp_zone')` on EVERY call, which **increments `totalFallbacks`** in the budget state. The metrics endpoint shows "fallbacks: 5" even though no BrightData call actually failed — the "fallback" counter is inflated by the always-noop SERP calls.

**Impact:** Misleading to operators reading the budget dashboard. Misleading to contributors reading the code who think they have 3 fallback tiers.

**File:line:** `src/lib/brightdata.ts:630-643`, `src/lib/search/tools.ts:586-607`.

**Fix recommendation:**
1. Either remove `brightDataSerp` + `isBrightDataSerpWorthIt` entirely (if SERP API is permanently not in scope), OR
2. Mark them with `@deprecated` + clear comments, AND
3. Stop calling `recordFallback` when `brightDataSerp` returns null due to "no_serp_zone" — only record a real fallback when BrightData was actually called and actually failed.
4. Update the `runLiveWebSearch` comment to "2-tier fallback (DuckDuckGo + nothing)".

---

## P3 — Nice-to-have

### P3-1. `tsconfig.json` has `noImplicitAny: false` despite `strict: true`

**File:** `tsconfig.json` line 9 (`"strict": true`) and line 11 (`"noImplicitAny": false`).

**Description:** `strict: true` enables `noImplicitAny` by default — but the project explicitly turns it back off. This is a code-quality regression. Many `any` types in the BrightData route handlers (e.g. `let body: any` in `scrape/route.ts:28`) would be caught.

**Fix recommendation:** Set `"noImplicitAny": true` and fix the resulting type errors (most are in API route handlers — easy fixes with `unknown` + zod parsing).

---

### P3-2. Error message leakage from BrightData API

**File:** `src/lib/brightdata.ts:579` (`error: 'trigger_http_${status}: ${errBody.slice(0, 200)}'`).

**Description:** `brightDataDatasetTrigger` includes the BrightData API response body (up to 200 chars) in the error message. This is then returned to the API caller via `/api/brightdata/datasets` (`detail: result.error`). Confirmed live:
```
"detail":"trigger_http_404: Collector not found"
```
While not a token leak (the Bearer token is in the request Authorization header, not the response body), it does leak BrightData's internal API error structure.

**Fix recommendation:** Sanitize the error before returning to the caller. Map BrightData's error responses to a fixed set of internal error codes (`brightdata_not_found`, `brightdata_auth_failed`, `brightdata_rate_limited`, `brightdata_unknown_error`).

---

### P3-3. `getClientIP` trusts `x-forwarded-for` blindly

**File:** `src/lib/search/rate-limit.ts:86-92`.

**Description:** `getClientIP` returns the first IP from `x-forwarded-for` header. An attacker can spoof `X-Forwarded-For: 1.2.3.4` on every request to bypass the per-IP rate limit (each request looks like it comes from a different IP). The proper fix is to trust `x-forwarded-for` only if the request came from a trusted proxy (Vercel's edge, Cloudflare, etc.).

**Fix recommendation:** Add a `TRUSTED_PROXY_CIDR` env var. Only honor `x-forwarded-for` if the direct connection IP is in the trusted CIDR. Otherwise use the direct socket IP.

---

### P3-4. `brightDataScrapingBrowserFetch` uses `puppeteer.default.connect` — fragile

**File:** `src/lib/brightdata.ts:322` (`browser = await puppeteer.default.connect(...)`).

**Description:** `puppeteer.default` may be undefined in some ESM interop configurations (depends on the bundler's CJS/ESM interop). The fact that it works today is luck — a Next.js version bump could break it.

**Fix recommendation:** Use a more robust import pattern:
```ts
const puppeteerModule = await import('puppeteer-core')
const puppeteer = puppeteerModule.default ?? puppeteerModule
browser = await puppeteer.connect({ ... })
```

---

### P3-5. Indexer rebuilds the entire inverted index on every cache invalidation

**File:** `src/lib/search/indexer.ts:113-128`.

**Description:** `loadIndexIfNeeded` rebuilds `invertedIndex` (a Map of term → posting list) from the `Document.indexTerms` JSON column of every document, every time the cache is invalidated. For 33 docs this is fast (~10ms). For 100k docs, this will be multi-second on every cache miss.

**Fix recommendation:** Persist the inverted index to a SQLite table (`Posting` model with `term`, `docId`, `freq`, `positions`) and update incrementally on each `indexDocument` call. The current "load all docs + rebuild map" pattern doesn't scale.

---

### P3-6. `docLen` uses `wordCount` as approximation in BM25 — biased

**File:** `src/lib/search/indexer.ts:385`.

**Description:** `const docLen = doc.wordCount || 0` — but `wordCount` counts tokens BEFORE stopword removal, while `indexTerms` stores stems AFTER stopword removal. The BM25 length normalization is therefore biased: long docs with many stopwords look artificially shorter than they are.

**Fix recommendation:** Store the actual post-stopword-removal token count in a new `Document.indexedTokenCount` column at index time, and use that for `docLen`.

---

## What's working well

These things are genuinely good — credit where it's due:

1. **Zero-cost guarantee design is solid.** The `BudgetGuard` in `brightdata.ts` has: file-persisted counters, daily/monthly caps, rollover logic (resets dailyCount when date changes — verified by code review at lines 147-154), disable-on-auth-fail window, persistent file at `/tmp/cirkle-brightdata-budget.json`. The design is production-quality. (Note: the file-based counter has a race condition — see P2-6. But the design intent is correct.)

2. **BrightData token is NOT leaked in any API response.** Confirmed by grepping responses for the token prefix `9a86a02e` — zero matches across `/api/brightdata/scrape`, `/api/brightdata/snapshot/[id]`, `/api/brightdata/datasets`, `/api/brightdata/status`. The token is only used in the `Authorization` header for outbound BrightData calls.

3. **`.env` is correctly gitignored.** `.gitignore` line 34 has `.env*` — covers `.env`, `.env.local`, `.env.production`, etc. Good practice.

4. **Lint is clean.** `bun run lint` returns 0 errors, 0 warnings. Code style is consistent.

5. **Rate limiting works correctly.** Confirmed by prior audit: 200s for first 25 requests, then 429s. Cap is 30/min (burst) + 100/5min (sustained). Sliding-window implementation in `rate-limit.ts` is correct.

6. **Sticky footer works on desktop AND mobile.** Verified live with agent-browser:
   - Desktop: `pageH=1001, footerBottom=1001.3, footerAtBottom=true`
   - Mobile (375x600): `pageH=978, footerBottom=977.5, footerAtBottom=true`
   The "Natural Push on Overflow" UX goal is satisfied.

7. **UI renders the (bad) top result correctly.** Console errors are clean (only React DevTools + HMR info). No JavaScript errors on home page or search results page.

8. **BM25 implementation in `indexer.ts:234-248` is mathematically correct.** The IDF formula `log(1 + (N - df + 0.5) / (df + 0.5))` is the standard BM25 IDF. The TF saturation with `k1=1.2, b=0.75` uses industry-standard defaults. The bug is NOT in BM25 itself — it's in how the unbounded BM25 score is fed into the ranking formula (P0-3).

9. **Inverted index lookup is O(matching docs), not O(all docs).** `indexer.ts:115-127` builds a term→posting-list map at cache-load time, so a query for "Steve Jobs" only iterates over docs that contain "steve" or "job", not all 33 docs. Good engineering.

10. **Query understanding + 9 ranking modes.** The `ranking.ts` mode switch (BALANCED, EXACT, LATEST, RESEARCH, OFFICIAL, ACADEMIC, COMMUNITY, NEWS, IMAGES) with mode-specific weight coefficients is a thoughtful design. The freshness-keyword detection (lines 224-226) is a nice touch. The weights themselves are broken (P0-3) but the structure is right.

11. **Sponsored results are isolated from organic ranking.** `SponsoredAd` model is a separate table, never mixed into the BM25 pipeline. Good — this is the right architectural choice for ad-transparency.

12. **Robots.txt compliance + sitemap parsing.** `crawler.ts` has a real robots.txt fetcher (with 1h TTL cache) and a sitemap parser that handles nested sitemap indexes (depth-limited to 3). The path-matching algorithm (longest-allow vs longest-disallow) is the correct robots.txt spec interpretation.

13. **Search response cache (LRU + 5-min TTL).** `index.ts` caches the full SearchResponse for repeated queries. Tier 1 is in-memory (sub-ms), Tier 2 is Neon (fire-and-forget write because Neon cold-cache latency in the sandbox). Good design — though the Neon read path is commented out (line 547) which means Tier 2 is currently write-only.

14. **The search route is a thin, well-typed wrapper.** `src/app/api/search/route.ts` validates mode, filters, query length — then delegates to `search()` in `src/lib/search/index.ts`. Clean separation of HTTP layer from business logic.

15. **The BrightData "scraping browser via wss" integration is genuinely cool.** Using `puppeteer-core` to drive BrightData's remote Chrome over a WebSocket endpoint — no local Chromium download, no Playwright install — is a clean way to get JS-rendered scrapes without the ops burden of running a browser farm.

---

## Recommendations — 30/60/90 day plan

### Days 0-30 (must do before any user traffic)

1. **Fix P0-1** (unauthenticated BrightData endpoints). Add Bearer auth + SSRF allow-list + per-IP rate limit. ~4 hours of work.
2. **Fix P0-2** (broken metrics). Move `state` to SQLite. ~1 day of work (including the test).
3. **Fix P0-3** (BM25 score normalization). Normalize `lex` and `sem` to [0,1] before the linear formula. ~4 hours + a relevance test.
4. **Fix P1-1** (live-web fallback gating). Change the gate to "trigger if top-3 mean score < 0.3". ~2 hours.
5. **Fix P1-2** (dead code in tool-path metrics). Move `recordSearch` above the `return`. ~15 minutes.
6. **Fix P1-3** (remove z-ai-web-dev-sdk). `bun remove z-ai-web-dev-sdk` + update 5 comments. ~15 minutes.
7. **Start P1-4** (test framework). Install vitest + playwright. Write the relevance test that would have caught P0-3. ~2 days.
8. **Grow the index from 33 → 1,000+ docs.** Ingest Wikipedia entities for the top-1000 most-searched entities (people, companies, places). Without this, no amount of ranking tweaking will fix relevance. ~1 week of crawler work.

### Days 30-60 (beta-quality)

1. **Finish P1-4** (test framework) — get to 80%+ unit test coverage on `lib/search/` and e2e tests for the 5 most important user journeys.
2. **Fix P2-1** (`tookMs` + `totalFound` in response).
3. **Fix P2-2** (structured logging in BrightData fallback).
4. **Fix P2-3** (CI/CD with GitHub Actions).
5. **Fix P2-4 + P2-5** (README + .env.example).
6. **Fix P2-6** (BrightData budget race condition — move to SQLite-backed counter).
7. **Fix P2-7** (Prisma FKs + cascades + indexes).
8. **Fix P2-8** (remove dead BrightData SERP tier).
9. **Implement a real semantic layer.** The current `semanticBoost` is a lexical proxy (cosine of overlapping idf-weighted term sets — line 132-138). For real semantic search, add embeddings: store a 384-dim MiniLM embedding per doc in a `Document.embedding` BLOB column, compute cosine similarity at query time. This is the single biggest relevance lever after index size.
10. **Implement query rewriting.** For "Steve Jobs", expand to "Steve Jobs co-founder Apple Pixar NeXT" before BM25 — this would surface Apple-related docs in the index even if the user only typed the entity name.

### Days 60-90 (production-quality)

1. **Fix all P3s** (tsconfig, error sanitization, x-forwarded-for trust, puppeteer import, indexer scale, docLen bias).
2. **Load test.** Use k6 to fire 1000 concurrent searches. Identify the bottleneck (likely the whole-index reload on cache miss — P3-5).
3. **Add a health endpoint.** `/api/health` returning `{status: 'ok', db: 'ok', brightdata: 'ok', indexSize: N}` for uptime monitoring.
4. **Add a `/api/budget` operator dashboard.** Show BrightData daily/monthly consumption graph, fallback rate, top queries by BrightData spend.
5. **Grow the index to 10,000+ docs.** Crawl top-10k Alexa sites + Wikipedia + major news RSS feeds continuously.
6. **Add a reindex job.** A daily cron that re-runs `indexDocument` on any Document whose `contentHash` changed since last index (for freshness).
7. **Set up error monitoring.** Sentry or equivalent — capture the swallowed BrightData errors (P2-2) and surface them in a dashboard.
8. **Documentation site.** Convert the inline comments into a proper docs site (Docusaurus or GitBook).

---

## Architecture assessment

**Layering:** Reasonably clean. The dependency direction is:
```
UI (components/search/*)
  → API routes (app/api/*/route.ts) — thin HTTP wrappers
    → Search pipeline (lib/search/index.ts) — orchestrator
      → Retrieval (lib/search/indexer.ts) — BM25 + inverted index
      → Ranking (lib/search/ranking.ts) — mode-specific weighting
      → Tools (lib/search/tools.ts) — instant answers + live-web fallback
      → AI (lib/search/ai-search.ts) — summary + knowledge card
      → Crawlers (lib/search/crawler.ts, lib/brightdata.ts) — content acquisition
      → Storage (Prisma schema + lib/db.ts) — persistence
```
No circular dependencies detected. Each layer has a clear responsibility.

**Coupling:** Moderate. The `search()` function in `index.ts` is 470 lines and orchestrates everything — it's becoming a god function. Consider splitting into `searchPipeline.ts` (orchestration) + `searchCache.ts` (cache layer) + `searchHistory.ts` (personalization). The BrightData integration is well-isolated (single `lib/brightdata.ts` file, ~660 lines, clear public API).

**Scalability:**
- **Index size:** The "load all docs into memory + rebuild inverted index" pattern (`indexer.ts:89-130`) works for ~10k docs. Beyond that, you need a persistent inverted index (P3-5 fix) or a real search backend (MeiliSearch, Typesense, Elasticsearch, or Postgres full-text with `tsvector`).
- **Concurrency:** The in-memory rate limiter (`rate-limit.ts`) is per-process — won't work across multiple serverless instances. The BrightData budget counter is file-based so it survives across instances (good), but has a race condition (P2-6).
- **Cold starts:** Every serverless cold start resets the metrics state (P0-2) and reloads the entire index from SQLite (~10ms for 33 docs, ~seconds for 10k docs). Consider a warmup endpoint or a persistent worker.

**Tech debt:** Moderate. The ranking formula's assumption of normalized scores (P0-3) is the biggest piece of hidden debt — it makes the entire relevance tuning effort a moving target until fixed. The dead `z-ai-web-dev-sdk` dep (P1-3) and dead BrightData SERP tier (P2-8) are minor. The schema's missing FKs (P2-7) will hurt more as the data grows.

**Security posture:** Weak. The 3 unauthenticated BrightData endpoints (P0-1) are the biggest hole. The blind trust of `x-forwarded-for` (P3-3) is a secondary issue. The token is well-protected (not leaked in responses), and the `.env` is gitignored — so the secrets hygiene is good. The auth GAP is the problem.

**Verdict:** Architecturally credible demo, not yet a defensible product. With 2 weeks of focused work on the P0s + P1s + index growth, this could become a credible beta. With 90 days of work on the P2s + P3s + semantic embeddings, it could become a credible product. The bones are good; the meat is missing.

---

## Files audit summary

| File | Status | Notes |
|---|---|---|
| `src/lib/brightdata.ts` | ⚠️ Mixed | Budget guard design is solid; race condition (P2-6); dead SERP tier (P2-8); error leakage (P3-2); `puppeteer.default` fragility (P3-4). |
| `src/app/api/brightdata/scrape/route.ts` | 🔴 P0 | No auth, no SSRF block, no rate limit (P0-1). |
| `src/app/api/brightdata/snapshot/[id]/route.ts` | 🔴 P0 | No auth (P0-1). Path param is forwarded to BrightData (not used for local file access — no SSRF). |
| `src/app/api/brightdata/datasets/route.ts` | 🔴 P0 | No auth (P0-1). Error leakage from BrightData (P3-2). |
| `src/app/api/brightdata/status/route.ts` | ✅ OK | Read-only, no sensitive data exposed. |
| `src/lib/search/crawler.ts` | ⚠️ Mixed | Real fetcher + robots.txt + sitemap parser all working. BrightData fallback errors swallowed (P2-2). |
| `src/lib/search/tools.ts` | ⚠️ Mixed | Instant-answer tools (weather/time/math) good. Live-web fallback gated out (P1-1). Dead BrightData SERP tier (P2-8). |
| `prisma/schema.prisma` | ⚠️ Mixed | Models are reasonable. No FKs, no cascades, missing indexes (P2-7). |
| `src/lib/search/ranking.ts` | 🔴 P0 | BM25 score not normalized → clamp01 destroys discrimination (P0-3). Mode-weight structure is good. |
| `src/lib/search/indexer.ts` | ⚠️ Mixed | BM25 math correct. Inverted index lookup is fast. `docLen` uses wrong field (P3-6). Whole-index reload on cache miss (P3-5). |
| `src/app/api/metrics/route.ts` | 🔴 P0 | Reads from broken module-scoped state (P0-2). |
| `src/lib/search/metrics.ts` | 🔴 P0 | Module-scoped state not shared across module instances (P0-2). Fix: move to SQLite. |
| `src/lib/search/index.ts` | ⚠️ Mixed | 1189-line orchestrator. Dead code after `return` (P1-2). Missing `tookMs`/`totalFound` (P2-1). Search cache (LRU + Neon) design is good. |
| `src/app/api/search/route.ts` | ✅ OK | Thin, well-typed wrapper. Rate limit applied correctly. Stale z-ai-web-dev-sdk comment (P1-3). |
| `src/lib/search/rate-limit.ts` | ⚠️ P3 | Sliding-window logic correct. Trusts `x-forwarded-for` blindly (P3-3). |
| `package.json` | ⚠️ P1 | Dead dep `z-ai-web-dev-sdk` (P1-3). No test framework (P1-4). |
| `tsconfig.json` | ⚠️ P3 | `strict: true` but `noImplicitAny: false` (P3-1). |
| `.gitignore` | ✅ OK | `.env*` correctly ignored. |
| `.env.example` | 🔴 P2 | Missing (P2-5). |
| `README.md` | 🔴 P2 | Missing (P2-4). |
| `.github/workflows/` | 🔴 P2 | Missing — no CI/CD (P2-3). |

---

**End of report.** This audit was conducted in a single session via parallel code inspection + functional probing (curl + agent-browser). All P0 and most P1 findings were verified live against a running dev server at `http://localhost:3000`. The report is intentionally honest — the user asked for "detailed recommendations and audit results honestly", and the relevance + security + observability gaps documented above are real and reproducible. Fix the P0s first; they're worth more than all the P3s combined.
