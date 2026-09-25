/**
 * Seed the Turso production database with the Cirkle Mail demo data.
 * Run: TURSO_DATABASE_URL=... TURSO_TOKEN=... bun run scripts/seed-turso.ts
 */
import { createClient } from "@libsql/client";
import { seedEmails, seedLabels } from "@/lib/seed-data";
import { classifyIntent } from "@/lib/email-utils";

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_TOKEN!;

async function main() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  await client.execute(`DELETE FROM Email`);
  await client.execute(`DELETE FROM Label`);
  await client.execute(`DELETE FROM Commitment`);
  console.log("Wiped existing data ✅");

  for (const label of seedLabels) {
    await client.execute({
      sql: `INSERT INTO Label (id, name, color, "createdAt", "updatedAt") VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      args: [label.id, label.name, label.color],
    });
  }
  console.log(`Inserted ${seedLabels.length} labels ✅`);

  let count = 0;
  for (const email of seedEmails) {
    const intentResult = classifyIntent(email);
    const emailId = (email as { id?: string }).id ?? crypto.randomUUID();
    await client.execute({
      sql: `INSERT INTO Email (id, "threadId", "fromName", "fromEmail", "toEmails", "ccEmails", "bccEmails", subject, body, snippet, date, "isRead", "isStarred", "isImportant", folder, labels, "hasAttachment", "attachmentName", "snoozedUntil", "scheduledFor", intent, "createdAt", "updatedAt")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        emailId,
        email.threadId,
        email.fromName,
        email.fromEmail,
        email.toEmails,
        email.ccEmails || "",
        email.bccEmails || "",
        email.subject,
        email.body,
        email.snippet,
        new Date(email.date).toISOString(),
        email.isRead ? 1 : 0,
        email.isStarred ? 1 : 0,
        email.isImportant ? 1 : 0,
        email.folder,
        email.labels || "",
        email.hasAttachment ? 1 : 0,
        email.attachmentName || "",
        email.snoozedUntil ? new Date(email.snoozedUntil).toISOString() : null,
        email.scheduledFor ? new Date(email.scheduledFor).toISOString() : null,
        intentResult.intent,
      ],
    });
    count++;
  }
  console.log(`Inserted ${count} emails ✅`);

  const result = await client.execute(`SELECT COUNT(*) as count FROM Email`);
  console.log("Total emails in Turso:", Number((result.rows[0] as { count: number | bigint }).count));
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
