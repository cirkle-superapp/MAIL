# CIRKLE Search Engine — Contributing Guide

> **For:** future AI agents + human contributors. Read this BEFORE making any
> changes to the codebase.

## 1. The rules (non-negotiable)

1. **NEVER delete files** without explicit user instruction. Mark as
   `@deprecated` instead — keep the file in case the replacement breaks.
2. **NEVER wipe the `.env` file**. The Write tool will OVERWRITE the entire
   file. Use `Edit` (find-and-replace) for targeted changes, OR use `Bash`
   with `>>` to append. If you must use `Write`, read the current contents
   first + preserve all existing vars.
3. **ALWAYS append to `worklog.md`** at the end of your task. Use a `---`
   separator. Format:
   ```markdown
   ---
   Task ID: <next available number, e.g. 82>
   Agent: <agent name>
   Task: <one-line summary>

   Work Log:
   - <step 1>
   - <step 2>
   - ...

   Stage Summary:
   - <key results / files created / decisions>
   ```
4. **NEVER restart the dev server unless absolutely necessary** — the dev
   server is already running on port 3000 (check `ss -tlnp | grep 3000`).
   Restart ONLY when:
   - You added a new env var (env vars are loaded at startup, not via HMR).
   - You changed the Prisma schema + ran `bun run db:push` (the regenerated
     Prisma client isn't picked up by HMR).
5. **Lint must be clean** before reporting done: `bun run lint` → 0 errors.
6. **Tests must pass**: `bun run test` → 16+ pass (1 skipped is OK — that's
   the desired-state relevance test).
7. **Self-verify with Agent Browser** at the end: open http://localhost:3000,
   search "Steve Jobs", verify the top result is Wikipedia, verify the
   Devil's Advocate lens re-ranks to Hacker News.

## 2. Read BEFORE starting work

1. `worklog.md` (tail) — what previous tasks did
2. `ARCHITECTURE.md` — the 7-layer architecture + key files map
3. `AUDIT_REPORT.md` — the 21 issues identified (most are fixed; check the
   "Status" column at the top of each P0/P1/P2 section)
4. `README.md` — quickstart + feature overview
5. `.env.example` — required env vars
6. `prisma/schema.prisma` — the data model

## 3. Code style

- **TypeScript strict** — `tsconfig.json` has `strict: true` +
  `noImplicitAny: true` (Task P3-1 fix).
- **ESLint** — `eslint.config.mjs` uses Next.js defaults. No `any` types
  (use `unknown` + zod parsing for API bodies).
- **'use client' directive** — every component that uses React state /
  hooks / browser APIs must have `'use client'` at the top.
- **'server-only' import** — server-only modules (Prisma, BrightData,
  embeddings) use `import 'server-only'` to prevent them from ending up in
  client bundles.
- **No indigo/blue colors** — use the brand palette: gold (#C2A060), teal
  (#1A4A5A), rose (#B85672), steel, charcoal, cream.
- **Sticky footer** — every layout uses `min-h-screen flex flex-col` on
  the root + `mt-auto` on the footer.
- **Mobile-first** — design for mobile, then enhance with `sm:`/`md:`/`lg:`
  breakpoints.
- **Accessibility** — ARIA labels on all interactive elements, keyboard
  navigation, `prefers-reduced-motion` support, focus rings (gold via
  `:focus-visible` in `globals.css`).
- **No emojis in code** — except in user-facing strings where they're
  intentional (e.g., flag emojis in QueryDna).

## 4. The BrightData zero-cost guarantee

BrightData calls are gated by `BudgetGuard` in `src/lib/brightdata.ts`:
- Daily cap: 5 calls/day (default; configurable via `BRIGHTDATA_DAILY_CAP`)
- Monthly cap: 25 calls/month (default; configurable via
  `BRIGHTDATA_MONTHLY_CAP`)
- When caps are hit, all BrightData functions return null/[] silently —
  the engine falls back to the free stack (native fetch + DuckDuckGo +
  RSS).

**NEVER call a BrightData function without going through `budgetGuard()`
first.** The guard is the only thing between you and a real-money bill.

To reset the budget for testing: `rm /tmp/cirkle-brightdata-budget.json`.

## 5. The Devil's Advocate lens (creative algorithm)

`src/lib/search/ranking.ts:rankCandidates()` — when `ctx.lens ===
'DEVILS_ADVOCATE'`:
1. `lexForScoring = 1 - lex` — INVERTS the normalized BM25 score so docs
   that DON'T match the user's tokens surface FIRST.
2. `sourceTypeBoost` adds +0.20 for COMMUNITY + +0.10 for NEWS source
   types (where dissent typically lives).
3. The relevance threshold check is SKIPPED for Devil's Advocate —
   near-miss candidates (which would normally be dropped) are KEPT,
   because contrarian views often DON'T share tokens with the user's
   framing.
4. Weights are rebalanced: lexical de-emphasized (already inverted),
   quality + originality boosted (we want well-argued dissent, not spam).

**Don't break this** — it's the standout creative feature.

## 6. Adding a new component

1. Create `src/components/search/MyComponent.tsx` with `'use client'` at
   the top (if it uses hooks / browser APIs).
2. Use existing shadcn/ui primitives (Button, Card, Dialog, Tooltip, etc.)
   from `src/components/ui/` — don't reinvent.
3. Use `framer-motion` for animations (already installed).
4. Use `lucide-react` for icons.
5. Use the brand tokens from `globals.css` (gold, teal, rose, glass,
   shadow-glass, gradient-text-gold, etc.).
6. Export a default + named export.
7. Wire into `SearchHome.tsx` or `SearchResults.tsx` (the only 2 layouts).
8. Lint + test + agent-browser verify.

## 7. Adding a new API route

1. Create `src/app/api/<name>/route.ts` (or `src/app/api/<name>/[id]/route.ts`
   for parameterized routes).
2. Add `export const runtime = 'nodejs'` + `export const dynamic =
   'force-dynamic'` at the top.
3. For operator-only endpoints, call `requireOperator(req)` at the top
   of the handler — it returns an `AuthResult` if failed (caller returns
   the body + status).
4. For SSRF-sensitive endpoints, call `isSafeScrapeTarget(url)` before
   fetching user-supplied URLs.
5. Sanitize errors with `sanitizeBrightDataError(err)` before returning
   to the caller — never leak BrightData's internal API structure.
6. Add to `.github/workflows/ci.yml` maxDuration if the route needs more
   than the default 10s (see `vercel.json` for current per-route limits).
7. Update `ARCHITECTURE.md` Section 2 if it's a new public endpoint.

## 8. Adding a new ranking signal

1. Add the signal to `RankInput` in `src/lib/search/ranking.ts` (e.g.,
   `semanticBoost?: number` was added in Task 80).
2. Compute the signal in the caller (`src/lib/search/index.ts:search()`),
   pass it in the `rankedInputs` array.
3. Add a weight coefficient to the score formula in `rankCandidates()`.
4. Add a `LENS_METADATA` entry for any new lens that should re-weight
   this signal.
5. Add a unit test in `tests/ranking.test.ts` verifying the signal
   changes the score ordering.
6. Update `ARCHITECTURE.md` Section 4.

## 9. Adding a new Prisma model

1. Edit `prisma/schema.prisma` — add the model with proper `@@index`
   declarations for query performance.
2. Run `bun run db:push` — applies the schema to the SQLite DB +
   regenerates the Prisma client.
3. **Restart the dev server** — HMR doesn't reload `node_modules/@prisma/client`.
4. Update `ARCHITECTURE.md` Section 2 (storage layer).
5. If the model stores JSON-encoded arrays, add a TypeScript interface +
   JSON.parse/stringify helpers.

## 10. Testing

### Unit tests (no dev server needed)
`tests/budget-guard.test.ts`, `tests/ranking.test.ts` — pure function
tests. Run with `bun run test`.

### Live tests (require dev server on port 3000)
`tests/api-auth.test.ts`, `tests/api-metrics.test.ts`, `tests/relevance.test.ts`
— make real HTTP requests. Auto-skip if the dev server is unreachable.

### Evaluation suite
`scripts/evaluation-suite.ts` — 20 representative queries. Run with:
`bun run scripts/evaluation-suite.ts`. Reports pass rate + p50/p95 latency
+ zero-result rate.

### Agent Browser self-verification (MANDATORY before reporting done)
```bash
agent-browser open http://localhost:3000/
agent-browser snapshot -i -c
agent-browser fill <search-input-ref> "Steve Jobs"
agent-browser click <submit-button-ref>
sleep 5
agent-browser eval "document.body.innerText.slice(0, 1500)"
```

Verify:
- Home page renders (no console errors via `agent-browser errors`)
- Search "Steve Jobs" → top result is "Steve Jobs - Wikipedia"
- Click "Devil's Advocate" lens → top result changes (Hacker News, etc.)
- Mobile viewport (375×600) → no horizontal scroll
- Sticky footer (`footerBottom === pageHeight`)

## 11. Recovery (if you accidentally break something)

```bash
# Reset to the last known good state (the v1.0.0-creative-search tag):
git fetch origin
git checkout v1.0.0-creative-search -- .
bun install
bun run db:push
# Restart dev server
pkill -f "next dev"; sleep 2; nohup bun run dev > dev.log 2>&1 &
```

If you wiped the `.env`, restore from `.env.example`:
```bash
cp .env.example .env
# Then fill in the real values (BRIGHTDATA_TOKEN, BRIGHTDATA_SBR_WSS, etc.)
```

## 12. Common mistakes to avoid

- **Don't use `Write` to edit `.env`** — it overwrites the whole file.
  Use `Edit` (find-and-replace) or `Bash` with `>>` to append.
- **Don't `bun remove` packages without checking** what depends on them.
  `z-ai-web-dev-sdk` was removed in Task P1-3 — make sure no code imports
  it before removing.
- **Don't change `tsconfig.json` `noImplicitAny` to `false`** — Task P3-1
  set it to `true` for strict typing.
- **Don't add `any` types** in route handlers — use `unknown` + zod
  parsing.
- **Don't push to `main` on the remote** — that branch has commits from
  a different project (MAIL/email). Push to `cirkle-search-v1` instead.
- **Don't restart the dev server for code changes** — HMR handles them.
  Restart ONLY for env var changes or Prisma client regenerations.
- **Don't use `dangerouslySetInnerHTML` with user input** — XSS risk.
  Only use it for trusted static content (CSS injection, FOUC scripts).
- **Don't call BrightData functions without `budgetGuard()`** — that's
  how you get a real-money bill.

— End of CONTRIBUTING.md —
