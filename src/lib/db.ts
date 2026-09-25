import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client — connected to Neon (PostgreSQL) in production via the
 * Vercel-Neon integration (DATABASE_URL is auto-set to the Neon pooler URL).
 *
 * Locally, DATABASE_URL can point at a local Postgres or a Neon dev branch.
 * The Vercel-Neon integration automatically sets DATABASE_URL, POSTGRES_PRISMA_URL,
 * and related vars on every Vercel deployment — no manual configuration needed.
 *
 * Turso (libSQL) is wired as a secondary/backup store via @libsql/client
 * directly (see scripts/seed-turso.ts). The Neon integration's auto-set
 * DATABASE_URL takes precedence, so Neon is the primary.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env (local) or via the Vercel-Neon integration (prod)."
    );
  }
  return new PrismaClient({
    log: process.env.NODE_ENV !== "production" ? ["query"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
