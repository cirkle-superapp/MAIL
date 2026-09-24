# CIRKLE

> An independent, privacy-first search engine. BM25 retrieval over a self-hosted
> inverted index, AI-generated answer synthesis, and an opt-in BrightData scraping
> layer with a hard zero-cost guarantee. No tracking. No personal data collection.
> No paid API key required for the default free stack — BrightData is a *premium
> tier* that you can enable by setting two env vars and disable by unsetting them.

[![CI](https://github.com/OWNER/cirkle/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

---

## Table of contents

1. [Quickstart](#quickstart)
2. [Architecture](#architecture)
3. [BrightData integration](#brightdata-integration)
4. [Testing](#testing)
5. [Deployment](#deployment)
6. [Configuration reference](#configuration-reference)
7. [License](#license)

---

## Quickstart

```bash
# 1. Install dependencies
bun install

# 2. Copy the env template and edit DATABASE_URL if you want a custom path
cp .env.example .env

# 3. Push the Prisma schema to your SQLite DB
bun run db:push

# 4. Start the dev server
bun run dev
```

The dev server starts on **http://localhost:3000**.

> **Tip — Preview Panel**: if you're using the sandboxed dev environment, the
> running dev server is reachable from the Preview Panel — just navigate to
> `http://localhost:3000`. There's no need to start a separate preview server;
> Next.js dev mode serves the React UI directly.

To run the production build locally:

```bash
bun run build      # builds .next/standalone (output mode: standalone)
bun run start      # serves the standalone build on port 3000
```

---

## Architecture

CIRKLE is a layered search engine. Each layer is in its own file under
`src/lib/search/` so the boundaries are explicit:

```
        ┌──────────────────────────────────────────────────────────┐
        │                     UI (Next.js app)                     │
        │   src/app/page.tsx + src/components/search/*.tsx        │
        └──────────────────────────────┬───────────────────────────┘
                                       │ POST /api/search
        ┌──────────────────────────────▼───────────────────────────┐
        │                      AI Layer                             │
        │   src/lib/search/ai-search.ts + src/lib/llm.ts           │
        │   (unified Groq → Gemini → OpenRouter fallback chain)    │
        └──────────────────────────────┬───────────────────────────┘
                                       │
        ┌──────────────────────────────▼───────────────────────────┐
        │                    Ranker (§44)                          │
        │   src/lib/search/ranking.ts                              │
        │   (BM25 score normalization + mode-specific weights +    │
        │    near-miss threshold + authority boost + diversity)    │
        └──────────────────────────────┬───────────────────────────┘
                                       │
        ┌──────────────────────────────▼───────────────────────────┐
        │                   Retriever (BM25)                       │
        │   src/lib/search/indexer.ts                              │
        │   (inverted index, k1=1.2 b=0.75, idf weighting)        │
        └──────────────────────────────┬───────────────────────────┘
                                       │
        ┌──────────────────────────────▼───────────────────────────┐
        │              Indexer + Crawler + Tools                  │
        │   src/lib/search/crawler.ts    (robots.txt, native fetch)│
        │   src/lib/search/index.ts      (orchestrator)            │
        │   src/lib/search/tools.ts      (instant answers,        │
        │                                  DuckDuckGo live-web FB) │
        └──────────────────────────────┬───────────────────────────┘
                                       │
        ┌──────────────────────────────▼───────────────────────────┐
        │            BrightData scraping layer (optional)         │
        │   src/lib/brightdata.ts (Scraping Browser over wss +     │
        │                          Datasets v3 snapshot API)       │
        │   src/lib/brightdata-auth.ts (operator auth + SSRF block)│
        └──────────────────────────────────────────────────────────┘
```

### Key files

| Layer | File | Purpose |
|---|---|---|
| Crawler | `src/lib/search/crawler.ts` | Fetches URLs (native `fetch` + BrightData Scraping Browser fallback). Honors `robots.txt`. |
| Indexer | `src/lib/search/indexer.ts` | BM25 inverted index (tokenize → stem → postings list). Persists to Prisma `Document.indexTerms`. |
| Retriever | `src/lib/search/index.ts:search()` | Orchestrates the whole pipeline: query understanding → BM25 retrieval → ranking → diversity → AI synthesis. |
| Ranker | `src/lib/search/ranking.ts` | Mode-specific weighted score (BALANCED / EXACT / LATEST / RESEARCH / OFFICIAL / ACADEMIC / NEWS / COMMUNITY / IMAGES). BM25 normalization (P0-3 fix). |
| AI Layer | `src/lib/search/ai-search.ts` + `src/lib/llm.ts` | AI answer synthesis via the unified Groq → Gemini → OpenRouter fallback chain. |
| UI | `src/app/page.tsx` + `src/components/search/*.tsx` | Search home, results, filter panel, knowledge cards, related questions. shadcn/ui components. |

### Search modes

- **BALANCED** — 0.30 lex + 0.18 sem + 0.15 quality + 0.10 freshness + 0.09 source + 0.05 original + 0.05 intent + 0.08 authority
- **EXACT** — phrase-anchored, lexical-heavy (0.65 lex)
- **LATEST** — freshness-heavy (0.45)
- **RESEARCH** — quality + academic boost
- **OFFICIAL / ACADEMIC / COMMUNITY / NEWS / IMAGES** — source-type filtered

---

## BrightData integration

CIRKLE ships with an enterprise-grade scraping layer powered by
[BrightData](https://brightdata.com). It's **optional** — the engine works
perfectly without it on the free stack (native `fetch` + DuckDuckGo HTML +
RSS). When enabled, it provides residential-proxy JavaScript-rendered page
fetches via the Scraping Browser (Puppeteer over wss).

### Enabling BrightData

Set two env vars in `.env`:

```bash
# BrightData API token (Datasets v3 API)
BRIGHTDATA_TOKEN=your_api_token_here

# Scraping Browser wss endpoint (Puppeteer over WebSocket)
BRIGHTDATA_SBR_WSS=wss://brd-customer-XXX-zone-cirkle:PASSWORD@brd.superproxy.io:9222
```

That's it. The engine will automatically use BrightData for:
- JavaScript-rendered page fetches (when native `fetch` returns 4xx / 5xx)
- On-demand scrapes via `POST /api/brightdata/scrape`
- Existing-snapshot fetches via `GET /api/brightdata/snapshot/[id]`

### Zero-cost guarantee

The BrightData integration is **circuit-breaked**. A `BudgetGuard`
(`src/lib/brightdata.ts:budgetGuard`) enforces hard daily + monthly caps:

| Cap | Default | Override env var |
|---|---|---|
| Daily Scraping Browser / dataset calls | **5** | `BRIGHTDATA_DAILY_CAP` |
| Monthly Scraping Browser / dataset calls | **25** | `BRIGHTDATA_MONTHLY_CAP` |
| Disable-on-auth-fail window (after 401/403) | **60 min** | `BRIGHTDATA_DISABLE_MINUTES` |

When a cap is hit, the engine silently falls back to the free stack — no
`500`, no broken UX. The budget counters persist to a JSON file
(`BRIGHTDATA_BUDGET_FILE`, default `/tmp/cirkle-brightdata-budget.json`) so
they survive process restarts.

If `BRIGHTDATA_TOKEN` is unset, the entire BrightData client runs in
"shadow mode" — every public function returns `null`/`[]` and the engine
keeps working on the free stack.

### Operator API endpoints (P0-1 security)

Three endpoints expose BrightData to operators. All require
`BRIGHTDATA_OPERATOR_TOKEN` env var + `Authorization: Bearer <token>` header:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/brightdata/scrape` | POST | One-off Scraping Browser fetch of any URL. Optionally ingests into the search index. |
| `/api/brightdata/snapshot/[id]` | GET | Fetch an existing BrightData snapshot's content. Optionally ingests via `?ingest=1`. |
| `/api/brightdata/datasets` | POST | Trigger a multi-row dataset snapshot (returns immediately; poll with the snapshot endpoint). |
| `/api/brightdata/status` | GET | Read-only budget state (unauthenticated — no spending, just reporting). |

All three operator endpoints:
- Return `403` if `BRIGHTDATA_OPERATOR_TOKEN` is unset (secure default).
- Return `401` if the bearer token doesn't match (constant-time comparison).
- Return `429` if the per-IP rate limit is exceeded.
- Block private-network targets (SSRF allow-list: blocks `127.0.0.0/8`,
  `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `169.254.0.0/16`, `::1`,
  `fc00::/7`, `fe80::/10`, `*.local`, `0.0.0.0/8`).
- Map BrightData API errors to a fixed set of internal codes (no internal
  BrightData response structure is leaked to the caller).

Example authenticated call:

```bash
curl -X POST http://localhost:3000/api/brightdata/scrape \
  -H "Authorization: Bearer $BRIGHTDATA_OPERATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","ingest":true}'
```

---

## Testing

CIRKLE uses [Vitest](https://vitest.dev) with a `node` environment (live
tests make real HTTP requests to the dev server).

### Run the tests

```bash
# All tests (one-shot, exits 0 on success)
bun run test

# Watch mode (re-runs on file change)
bun run test:watch
```

### Test layout

```
tests/
  ranking.test.ts         — unit test for rankCandidates (P0-3 normalization)
  budget-guard.test.ts    — unit test for budgetGuard (no-token secure default)
  api-auth.test.ts        — live test for BrightData operator auth (P0-1)
  api-metrics.test.ts     — live test for /api/metrics (P0-2)
  relevance.test.ts       — live test for /api/search (P0-3 + P2-1 verification)
```

### Live vs unit tests

- **Unit tests** (`ranking`, `budget-guard`) run in CI without a dev server.
  They verify pure functions in `src/lib/search/`.
- **Live tests** (`api-auth`, `api-metrics`, `relevance`) require the dev
  server running on `http://localhost:3000`. They auto-skip in CI via
  `ctx.skip()` when the server isn't reachable.

To run a single test file:

```bash
bun run test tests/ranking.test.ts
```

### CI

GitHub Actions runs on every push to `main`/`master` and every pull request:

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run db:generate`
- `bun run test`

See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

---

## Deployment

CIRKLE is configured for [Vercel](https://vercel.com) out of the box. The
[`vercel.json`](./vercel.json) file:

- Sets the framework to Next.js
- Runs `prisma generate && next build` as the build command
- Configures function `maxDuration` for long-running routes (search, AI,
  research, reindex)
- Pins the deployment region to `iad1`

To deploy:

1. Push the repo to GitHub.
2. Import the project in Vercel.
3. Set the production env vars (see [Configuration reference](#configuration-reference)).
4. Vercel runs the build + deploys automatically.

For self-hosted / non-Vercel deployments:

```bash
bun run build        # produces .next/standalone (output: standalone)
bun run start        # runs the standalone server on port 3000
```

---

## Configuration reference

All env vars are documented in [`.env.example`](./.env.example). The required
one is `DATABASE_URL` (SQLite by default; Turso/Neon also supported).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **yes** | `file:/home/z/my-project/db/custom.db` | Prisma connection string. SQLite path OR `libsql:` / `postgresql:` URL. |
| `BRIGHTDATA_TOKEN` | no | (unset) | BrightData API bearer token. Enables the BrightData tier. |
| `BRIGHTDATA_SBR_WSS` | no | (unset) | Scraping Browser wss endpoint (Puppeteer over WebSocket). |
| `BRIGHTDATA_SELENIUM` | no | (unset) | BrightData Selenium endpoint URL. |
| `BRIGHTDATA_DAILY_CAP` | no | `5` | Max BrightData calls per UTC day. |
| `BRIGHTDATA_MONTHLY_CAP` | no | `25` | Max BrightData calls per UTC month. |
| `BRIGHTDATA_DISABLE_MINUTES` | no | `60` | Auto-disable window after 401/403. |
| `BRIGHTDATA_OPERATOR_TOKEN` | no | (unset) | Bearer token for operator endpoints. If unset, all BrightData endpoints return 403. |
| `BRIGHTDATA_BUDGET_FILE` | no | `/tmp/cirkle-brightdata-budget.json` | Path to the budget counter persistence file. |
| `TRUSTED_PROXY_CIDR` | no | (unset) | Comma-separated CIDRs trusted to set `x-forwarded-for`. |
| `NEON_DATABASE_URL` | no | (unset) | Postgres URL (Neon serverless) — alternative to `DATABASE_URL`. |
| `INNGEST_SIGNING_KEY` | no | (unset) | Inngest event signing key (background jobs). |
| `NEXT_PUBLIC_APP_NAME` | no | `CIRKLE Search` | Public-facing app name (exposed to the client). |

---

## License

MIT License. See [LICENSE](./LICENSE) (or: All rights reserved — your call
before publishing).

Copyright (c) 2024 CIRKLE contributors.
