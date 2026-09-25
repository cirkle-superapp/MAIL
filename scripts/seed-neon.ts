/**
 * Seed the Neon Postgres analytics database with the same Cirkle Mail demo data.
 * Run: NEON_DATABASE_URL=... bun run scripts/seed-neon.ts
 */
import { neon } from "@neondatabase/serverless";
import { seedEmails } from "@/lib/seed-data";
import { classifyIntent } from "@/lib/email-utils";

const NEON_URL = process.env.NEON_DATABASE_URL!;

async function main() {
  const sql = neon(NEON_URL);

  await sql`DELETE FROM "Commitment"`;
  await sql`DELETE FROM "Email"`;
  console.log("Wiped existing data ✅");

  let count = 0;
  for (const email of seedEmails) {
    const intentResult = classifyIntent(email);
    const emailId = (email as { id?: string }).id ?? crypto.randomUUID();
    await sql`
      INSERT INTO "Email" (id, "threadId", "fromName", "fromEmail", "toEmails", "ccEmails", "bccEmails", subject, body, snippet, date, "isRead", "isStarred", "isImportant", folder, labels, "hasAttachment", "attachmentName", "snoozedUntil", "scheduledFor", intent, "createdAt", "updatedAt")
      VALUES (${emailId}, ${email.threadId}, ${email.fromName}, ${email.fromEmail}, ${email.toEmails}, ${email.ccEmails || ""}, ${email.bccEmails || ""}, ${email.subject}, ${email.body}, ${email.snippet}, ${new Date(email.date).toISOString()}, ${email.isRead}, ${email.isStarred}, ${email.isImportant}, ${email.folder}, ${email.labels || ""}, ${email.hasAttachment}, ${email.attachmentName || ""}, ${email.snoozedUntil ? new Date(email.snoozedUntil).toISOString() : null}, ${email.scheduledFor ? new Date(email.scheduledFor).toISOString() : null}, ${intentResult.intent}, NOW(), NOW())
    `;
    count++;
  }
  console.log(`Inserted ${count} emails ✅`);

  const rows = await sql`SELECT COUNT(*) as count FROM "Email"`;
  console.log("Total emails in Neon:", rows[0].count);
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
