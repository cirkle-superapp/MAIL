import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * Prisma Client — works for both local SQLite (file:) and Turso (libsql://).
 *
 * - Local dev:  DATABASE_URL="file:/abs/path/to.db"
 *   → uses Prisma's default SQLite engine (no adapter)
 * - Production: DATABASE_URL="libsql://<turso-host>"  + TURSO_TOKEN
 *   → uses the @prisma/adapter-libsql driver adapter for Turso
 *
 * The schema.prisma has `previewFeatures = ["driverAdapters"]` which lets the
 * adapter bypass the default datasource URL validation (so libsql:// URLs are
 * accepted with the sqlite provider).
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

  const isRemote =
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://");

  // Remote (Turso libSQL) → driver adapter.
  // PrismaLibSQL is a FACTORY that takes a config object { url, authToken },
  // not a client instance. It creates the @libsql/client internally on connect().
  if (isRemote) {
    const adapter = new PrismaLibSQL({
      url,
      authToken: process.env.TURSO_TOKEN || undefined,
    });
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
