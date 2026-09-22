/**
 * Turso schema setup — pushes the Cirkle Mail schema to Turso (libsql).
 * Run: DATABASE_URL_TURSO=... bun run src/lib/turso-setup.ts
 * This creates the same tables as the Prisma schema, on the Turso database.
 */
import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_DATABASE_URL || "libsql://mail-fortleem.aws-us-east-1.turso.io";
const TURSO_TOKEN = process.env.TURSO_TOKEN || "";

async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const statements = [
    `CREATE TABLE IF NOT EXISTS "Email" (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      fromName TEXT NOT NULL,
      fromEmail TEXT NOT NULL,
      toEmails TEXT NOT NULL,
      ccEmails TEXT NOT NULL DEFAULT '',
      bccEmails TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      snippet TEXT NOT NULL,
      date TEXT NOT NULL,
      isRead INTEGER NOT NULL DEFAULT 0,
      isStarred INTEGER NOT NULL DEFAULT 0,
      isImportant INTEGER NOT NULL DEFAULT 0,
      folder TEXT NOT NULL DEFAULT 'INBOX',
      labels TEXT NOT NULL DEFAULT '',
      hasAttachment INTEGER NOT NULL DEFAULT 0,
      attachmentName TEXT NOT NULL DEFAULT '',
      snoozedUntil TEXT,
      scheduledFor TEXT,
      intent TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "Email_folder_idx" ON "Email"(folder)`,
    `CREATE INDEX IF NOT EXISTS "Email_threadId_idx" ON "Email"(threadId)`,
    `CREATE INDEX IF NOT EXISTS "Email_isStarred_idx" ON "Email"(isStarred)`,
    `CREATE INDEX IF NOT EXISTS "Email_snoozedUntil_idx" ON "Email"(snoozedUntil)`,
    `CREATE INDEX IF NOT EXISTS "Email_scheduledFor_idx" ON "Email"(scheduledFor)`,
    `CREATE INDEX IF NOT EXISTS "Email_intent_idx" ON "Email"(intent)`,
    `CREATE TABLE IF NOT EXISTS "Label" (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'gray',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS "Commitment" (
      id TEXT PRIMARY KEY NOT NULL,
      emailId TEXT NOT NULL,
      threadId TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      dueDate TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN',
      confidence REAL NOT NULL DEFAULT 0.5,
      evidence TEXT NOT NULL DEFAULT '',
      direction TEXT NOT NULL DEFAULT 'outgoing',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS "Commitment_emailId_idx" ON "Commitment"(emailId)`,
    `CREATE INDEX IF NOT EXISTS "Commitment_threadId_idx" ON "Commitment"(threadId)`,
    `CREATE INDEX IF NOT EXISTS "Commitment_status_idx" ON "Commitment"(status)`,
    `CREATE INDEX IF NOT EXISTS "Commitment_owner_idx" ON "Commitment"(owner)`,
  ];

  for (const sql of statements) {
    try {
      await client.execute(sql);
    } catch (e) {
      console.error("SQL error:", e instanceof Error ? e.message : e, "— SQL:", sql.slice(0, 80));
    }
  }
  console.log("Turso schema created ✅");
}

main();
