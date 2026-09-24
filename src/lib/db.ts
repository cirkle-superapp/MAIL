import { PrismaClient } from "@prisma/client";

/**
 * Prisma Client — works for both local SQLite (file:) and Turso (libsql://).
 *
 * - Local dev:  DATABASE_URL="file:/abs/path/to.db"
 *   → uses Prisma's default SQLite engine (no adapter needed)
 * - Production: DATABASE_URL="libsql://<turso-host>"  + TURSO_TOKEN
 *   → uses the @prisma/adapter-libsql driver adapter for Turso
 *
 * The same lib/db.ts handles both — it inspects the URL scheme and wires the
 * adapter only when the URL is a remote libsql:// connection.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env (local) or Vercel env vars (prod)."
    );
  }

  const isRemote = url.startsWith("libsql://") || url.startsWith("https://") || url.startsWith("http://");

  // Remote (Turso/Neon libSQL) → use the driver adapter
  if (isRemote) {
    // Lazy-import the adapter so the dependency is only loaded when needed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require("@prisma/adapter-libsql");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@libsql/client");
    const libsql = createClient({
      url,
      authToken: process.env.TURSO_TOKEN || undefined,
    });
    const adapter = new PrismaLibSql(libsql);
    return new PrismaClient({
      log: process.env.NODE_ENV !== "production" ? ["query"] : ["error"],
      adapter,
    });
  }

  // Local file SQLite → default Prisma SQLite engine
  return new PrismaClient({
    log: process.env.NODE_ENV !== "production" ? ["query"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
