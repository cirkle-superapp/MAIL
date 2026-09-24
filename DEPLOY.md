# Cirkle Mail — Deployment Architecture

Cirkle Mail is a **Communication OS** — an AI-curated mail client that opens
to a Command Center, not an inbox. This document describes the production
architecture connecting five services for optimum performance.

```
                       ┌──────────────┐
                       │   GitHub     │  ← source of truth
                       │ cirkle-superapp/MAIL │
                       └──────┬───────┘
                              │ push (auto-deploy)
                              ▼
                       ┌──────────────┐
                       │   Vercel     │  ← Next.js 16 hosting
                       │  (Edge + Serverless) │
                       └──┬────────┬───┬──┘
                          │        │   │
              ┌────────────┘        │   └───────────────┐
              ▼                     ▼                   ▼
       ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
       │  Turso       │    │   Neon       │    │   Inngest    │
       │  (libSQL)    │    │ (PostgreSQL) │    │  (jobs)      │
       │              │    │              │    │              │
       │ PRIMARY DB   │    │ ANALYTICS    │    │ deliver-     │
       │ emails/labels│    │ /api/        │    │ scheduled-   │
       │ commitments  │    │ analytics   │    │ emails cron  │
       │ (edge-       │    │ (heavy       │    │ (* * * * *)  │
       │  replicated) │    │  GROUP BY)   │    │              │
       └──────────────┘    └──────────────┘    └──────────────┘
```

## Why this split (optimum performance)

| Service | Role | Why |
|---|---|---|
| **GitHub** | Source code | Auto-deploys to Vercel on every push to `main` |
| **Vercel** | Hosting | Next.js 16 App Router, Edge + Serverless functions, global CDN |
| **Turso (libSQL)** | **Primary DB** (transactional) | Edge-replicated globally → fast reads/writes for the email app everywhere. Prisma `sqlite` provider. Same code path for local (`file:`) and prod (`libsql://`). |
| **Neon (PostgreSQL)** | **Analytics DB** | Postgres's query planner is better than SQLite for `GROUP BY`, window functions, `generate_series`. `/api/analytics` runs on Neon when `NEON_DATABASE_URL` is set, falls back to Prisma/Turso in-JS computation otherwise. |
| **Inngest** | **Background jobs** | `deliverScheduledEmails` cron function (`* * * * *`) — moves due `SCHEDULED` emails to `SENT`. More reliable than client polling (works even when no user is looking at the app). |

## Local development

1. **Install deps** — `bun install`
2. **Copy env** — `cp .env.example .env` (local SQLite is the default; no external services required)
3. **Push schema** — `bun run db:push` (creates the local SQLite DB)
4. **Seed data** — start the dev server (`bun run dev`), then `curl -X POST http://localhost:3000/api/emails -H "Content-Type: application/json" -d '{"action":"seed"}'`
5. **Run** — `bun run dev` → http://localhost:3000

## Production setup (Vercel)

### 1. Turso (primary DB)
- Create a Turso database: `turso db create cirkle-mail`
- Get the URL: `turso db show cirkle-mail --url` → `libsql://...`
- Create a token: `turso db tokens create cirkle-mail`
- On Vercel: set `DATABASE_URL` = the libsql:// URL, `TURSO_TOKEN` = the token
- Run `bun run db:push` locally with `DATABASE_URL=libsql://... TURSO_TOKEN=... bun run db:push` to sync the schema to Turso (one-time)

### 2. Neon (analytics DB)
- Create a Neon project at https://neon.tech
- Get the connection string (`postgresql://...`)
- Create the `Email` table on Neon (mirror the Prisma schema) — or use a Neon-Prisma mirror setup
- On Vercel: set `NEON_DATABASE_URL` = the postgresql:// connection string
- If unset, `/api/analytics` falls back to Turso (slower but still works)

### 3. Inngest (background jobs)
- Create an Inngest Cloud app at https://app.inngest.com
- App ID: `cirkle-mail` (matches `src/lib/inngest.ts`)
- Add the serve endpoint: `https://<your-vercel-domain>/api/inngest`
- On Vercel: set `INNGEST_API_KEY` and `INNGEST_SIGN_KEY` (from Inngest Cloud)
- Inngest Cloud will now trigger `deliverScheduledEmails` every minute

### 4. Vercel Cron (backup)
- `vercel.json` already declares a cron: `* * * * *` → `/api/cron/deliver`
- On Vercel: set `CRON_SECRET` = `openssl rand -hex 32` (Vercel Cron sends this as `Authorization: Bearer <secret>`)
- This is the backup path — if Inngest Cloud is delayed, Vercel Cron still delivers scheduled emails every minute. Both paths are idempotent.

### 5. GitHub → Vercel
- Push to `main` → Vercel auto-deploys
- Or use the Vercel CLI: `vercel --prod`

## Architecture decisions

### Why Turso (libSQL) as primary, not Neon (PostgreSQL)?
- **Edge replication**: Turso replicates the DB to multiple edges → reads are fast globally (the email app is read-heavy)
- **Same provider local + prod**: Prisma `sqlite` provider works with `file:` (local) and `libsql://` (prod) — no schema switching
- **LibSQL is SQLite-compatible**: the existing Prisma schema (designed for SQLite) works unchanged

### Why Neon for analytics (not Turso)?
- **Query planner**: Postgres's planner is materially better for `COUNT(*) FILTER (WHERE ...)`, `date_trunc`, `generate_series`, `NOT EXISTS` — the exact queries `/api/analytics` runs
- **Optional**: the route gracefully falls back to Turso when Neon isn't configured — you can run the whole app on Turso alone

### Why both Inngest AND Vercel Cron?
- **Defense in depth**: if either service has an outage, the other still delivers scheduled emails
- **Idempotent**: the `updateMany` is safe to run twice — once a SCHEDULED email moves to SENT, it won't match the WHERE clause again
- **Inngest gives retries + observability**; Vercel Cron is dead-simple and free

## Feature → service mapping

| Feature | Service |
|---|---|
| Email list / detail / compose (CRUD) | Turso (via Prisma) |
| Daily Briefing / Smart Follow-up / Handle / Conversation / Quick Reply / Subject Improver / Copilot | z-ai SDK (built-in) + optional OpenRouter/Groq/Gemini/NVIDIA/HF consensus |
| Analytics view | Neon (when configured) → fallback Turso |
| Scheduled email delivery | Inngest cron + Vercel Cron backup |
| Command Center home | Turso (counts) + z-ai SDK (briefing) |
| Triage mode | Turso (unread queue) |
| Commitments / People views | Turso (Prisma) |

## Verification

- `bun run lint` — ESLint clean
- `bun test` — 27+ unit tests (email-utils: classifyIntent, detectCommitments, sanitizeEmailHtml, deriveCategory, dateBucket, etc.)
- `bun run dev` — local server on port 3000
- Production: https://cirkle-mail.vercel.app (or your Vercel domain)
