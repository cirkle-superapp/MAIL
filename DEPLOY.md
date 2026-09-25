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
                       └──┬───────────┘
                          │
              ┌───────────┴────────────┐
              ▼                        ▼
       ┌──────────────┐        ┌──────────────┐
       │  Neon        │        │   Inngest    │
       │ (PostgreSQL) │        │  (jobs)      │
       │              │        │              │
       │ PRIMARY DB   │        │ deliver-     │
       │ emails/labels│        │ scheduled-   │
       │ commitments  │        │ emails cron  │
       │ + analytics  │        │ (* * * * *)  │
       │ (COUNT FILTER│        │              │
       │  date_trunc) │        │ + Vercel Cron│
       └──────────────┘        │ backup       │
              │                └──────────────┘
              │
       ┌──────────────┐
       │  Turso       │
       │  (libSQL)    │
       │              │
       │ BACKUP/MIRROR│
       │ (seeded,     │
       │  edge-ready  │
       │  for future  │
       │  read cache) │
       └──────────────┘
```

## Why this split (optimum performance)

| Service | Role | Why |
|---|---|---|
| **GitHub** | Source code | Auto-deploys to Vercel on every push to `main` |
| **Vercel** | Hosting | Next.js 16 App Router, Edge + Serverless functions, global CDN |
| **Neon (PostgreSQL)** | **Primary DB** (transactional + analytics) | Serverless Postgres with auto-scaling, branching, and a superior query planner. The Vercel-Neon integration auto-sets `DATABASE_URL` on every deployment — zero manual config. Prisma `postgresql` provider. The `/api/analytics` route also runs native Postgres aggregations (`COUNT(*) FILTER`, `date_trunc`, `generate_series`, `NOT EXISTS`) via `@neondatabase/serverless` directly for maximum performance. |
| **Turso (libSQL)** | **Backup/mirror** | Edge-replicated libSQL database, seeded with the same data as Neon. Available as a future edge-read cache for high-frequency queries (contacts autocomplete, label lists). Kept in sync via `scripts/seed-turso.ts`. |
| **Inngest** | **Background jobs** | `deliverScheduledEmails` cron function (`* * * * *`) — moves due `SCHEDULED` emails to `SENT`. More reliable than client polling (works even when no user is looking at the app). |
| **Vercel Cron** | **Backup scheduler** | `vercel.json` declares `0 0 * * *` (daily, Hobby-compatible) → `/api/cron/deliver`. Defense-in-depth: if Inngest is delayed, Vercel Cron still delivers. Both paths are idempotent. |

## Local development

1. **Install deps** — `bun install`
2. **Copy env** — `cp .env.example .env` and set `DATABASE_URL` to a Neon connection string (a Neon dev branch is ideal)
3. **Push schema** — `DATABASE_URL="postgresql://..." bun run db:push` (creates Email/Label/Commitment tables on Neon)
4. **Seed data** — start the dev server (`bun run dev`), then `curl -X POST http://localhost:3000/api/emails -H "Content-Type: application/json" -d '{"action":"seed"}'`
5. **Run** — `bun run dev` → http://localhost:3000

## Production setup (Vercel)

### 1. Neon (primary DB) — auto-wired
- The Vercel-Neon integration automatically sets `DATABASE_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_PASSWORD`, etc. on every deployment.
- No manual env var configuration needed — just install the Neon integration on Vercel and link it to your Neon project.
- The Prisma schema uses `provider = "postgresql"` + `url = env("DATABASE_URL")`.
- Run `DATABASE_URL="postgresql://..." bun run db:push` once to sync the schema to Neon.

### 2. Turso (backup/mirror) — optional
- Create a Turso database: `turso db create cirkle-mail`
- Set `TURSO_DATABASE_URL` (the libsql:// URL) and `TURSO_TOKEN` on Vercel.
- Seed it with: `TURSO_DATABASE_URL="libsql://..." TURSO_TOKEN="..." bun run scripts/seed-turso.ts`
- The app currently uses Neon as primary; Turso is kept in sync as a backup and future edge-read cache.

### 3. Inngest (background jobs)
- Create an Inngest Cloud app at https://app.inngest.com (App ID: `cirkle-mail`)
- Add the serve endpoint: `https://cirkle-mail.vercel.app/api/inngest`
- Set `INNGEST_SIGN_KEY` on Vercel (from Inngest Cloud).
- Inngest Cloud triggers `deliverScheduledEmails` every minute.

### 4. Vercel Cron (backup)
- `vercel.json` declares `0 0 * * *` → `/api/cron/deliver` (Hobby-compatible daily).
- Set `CRON_SECRET` = `openssl rand -hex 32` (Vercel Cron sends it as `Authorization: Bearer <secret>`).

### 5. GitHub → Vercel
- Push to `main` → Vercel auto-deploys.

## Architecture decisions

### Why Neon (PostgreSQL) as primary, not Turso (libSQL)?
- **Vercel integration**: Neon auto-sets `DATABASE_URL` on every Vercel deployment — zero manual env var management. Turso requires manual `libsql://` URL + token configuration.
- **Query planner**: Postgres's planner is materially better for the `COUNT(*) FILTER`, `date_trunc`, `generate_series`, `NOT EXISTS` queries that `/api/analytics` runs.
- **Relational integrity**: Postgres has superior foreign keys, constraints, and transactional guarantees for email data.
- **Serverless scale-to-zero**: Neon scales to zero when idle, cost-effective.

### Why keep Turso connected?
- **Edge replication**: Turso replicates to multiple edges globally. Available as a future edge-read cache for high-frequency queries (contacts autocomplete, label lists) without hitting Neon.
- **Backup**: if Neon has an outage, the Turso mirror can serve reads (manual failover).
- **The seed scripts** (`scripts/seed-turso.ts`) keep Turso in sync with the same demo data.

### Why both Inngest AND Vercel Cron?
- **Defense in depth**: if either service has an outage, the other still delivers scheduled emails.
- **Idempotent**: the `updateMany` is safe to run twice — once a SCHEDULED email moves to SENT, it won't match the WHERE clause again.
- **Inngest gives retries + observability**; Vercel Cron is dead-simple and free (Hobby daily).

## Feature → service mapping

| Feature | Service |
|---|---|
| Email list / detail / compose (CRUD) | Neon (via Prisma) |
| Daily Briefing / Smart Follow-up / Handle / Conversation / Quick Reply / Subject Improver / Copilot | z-ai SDK (built-in) + optional OpenRouter/Groq/Gemini/NVIDIA/HF consensus |
| Analytics view | Neon directly via `@neondatabase/serverless` (native Postgres aggregations) |
| Scheduled email delivery | Inngest cron + Vercel Cron backup |
| Command Center home | Neon (counts via Prisma) + z-ai SDK (briefing) |
| Triage mode | Neon (unread queue via Prisma) |
| Commitments / People views | Neon (Prisma) |
| Turso backup/mirror | Seeded via `scripts/seed-turso.ts`, available for future edge reads |

## Verification

- `bun run lint` — ESLint clean
- `bun test` — unit tests (email-utils: classifyIntent, detectCommitments, sanitizeEmailHtml, deriveCategory, dateBucket, etc.)
- `bun run dev` — local server on port 3000
- Production: https://cirkle-mail.vercel.app
