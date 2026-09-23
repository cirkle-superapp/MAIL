import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * CIRKLE Search Engine — Database client.
 *
 * Production: Turso (libsql) — remote, edge-replicated, persistent index.
 *   TURSO_DATABASE_URL=libsql://cirkle-fortleem.aws-us-east-1.turso.io
 *   TURSO_AUTH_TOKEN=<token>
 *
 * Dev fallback: local SQLite at db/custom.db.
 *
 * The Prisma driver adapter translates Prisma queries to the libsql protocol,
 * enabling Turso's edge-replicated SQLite database. This means the same code
 * path serves both environments — only env vars differ.
 */
function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  // Use Turso whenever the URL is configured (works in both dev and prod).
  // Per the @prisma/adapter-libsql README, the adapter takes a config object
  // { url, authToken } — NOT a pre-built libsql client. The adapter builds
  // its own internal libsql client from this config.
  if (tursoUrl && tursoUrl.startsWith("libsql://")) {
    const adapter = new PrismaLibSQL({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter, log: ["error", "warn"] } as any);
  }

  // Local SQLite fallback.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "file:./db/custom.db";
  }
  return new PrismaClient({ log: ["error", "warn"] });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
