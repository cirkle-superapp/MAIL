import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectCommitments } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

// GET /api/commitments
// Derives commitments across all emails (computed on the fly from email bodies
// via the deterministic detector). Returns structured signals with provenance.
// This keeps the database authoritative for messages while deriving
// commitments as a view layer (§28 AI as orchestration, not source of truth).
export async function GET() {
  const emails = await db.email.findMany({
    where: { folder: { in: ["INBOX", "SENT", "ARCHIVE"] } },
    select: {
      id: true,
      threadId: true,
      subject: true,
      body: true,
      snippet: true,
      fromName: true,
      fromEmail: true,
      date: true,
      isRead: true,
    },
    orderBy: { date: "desc" },
    take: 300,
  });

  const commitments: Array<{
    id: string;
    emailId: string;
    threadId: string;
    subject: string;
    who: string;
    action: string;
    due: string | null;
    direction: "outgoing" | "incoming";
    source: string;
    date: string;
    fromName: string;
  }> = [];

  for (const e of emails) {
    const signals = detectCommitments(e.body, e.fromEmail);
    for (const s of signals) {
      commitments.push({
        id: `${e.id}:${s.evidence.slice(0, 40)}`,
        emailId: e.id,
        threadId: e.threadId,
        subject: e.subject,
        who: s.direction === "outgoing" ? "You" : e.fromName,
        action: s.action,
        due: s.dueDate,
        direction: s.direction,
        source: s.evidence,
        date: e.date.toISOString(),
        fromName: e.fromName,
      });
    }
  }

  return NextResponse.json({ commitments });
}
