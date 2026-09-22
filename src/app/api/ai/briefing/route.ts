import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiBriefing } from "@/lib/ai";
import { detectCommitments } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

// GET /api/ai/briefing — Daily Briefing for the Command Center home.
// Gathers needs-reply / waiting / commitments / receipts, then asks the LLM
// for a calm, source-grounded "what matters today" summary.
export async function GET() {
  const now = new Date();
  const emails = await db.email.findMany({
    where: { folder: { in: ["INBOX", "SENT", "ARCHIVE"] } },
    select: { id: true, fromName: true, fromEmail: true, toEmails: true, subject: true, snippet: true, body: true, date: true, intent: true, isRead: true, folder: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  const isUser = (e: { fromEmail: string }) => e.fromEmail.toLowerCase() === "you@cirkle.mail";

  const needsReply = emails
    .filter((e) => !isUser(e) && e.intent === "REQUIRES_REPLY" && ["INBOX", "ARCHIVE"].includes(e.folder))
    .slice(0, 6)
    .map((e) => ({ subject: e.subject, fromName: e.fromName, snippet: e.snippet }));

  const waiting = emails
    .filter((e) => isUser(e) && e.folder === "SENT" && (e.intent === "COMMITMENT" || e.body.includes("?")))
    .slice(0, 4)
    .map((e) => {
      const ageDays = Math.max(0, Math.floor((now.getTime() - e.date.getTime()) / (24 * 60 * 60 * 1000)));
      return { subject: e.subject, toName: e.toEmails, snippet: e.snippet, ageDays };
    });

  // commitments derived deterministically
  const commitmentsRaw: Array<{ action: string; who: string; due: string | null }> = [];
  for (const e of emails.slice(0, 60)) {
    for (const s of detectCommitments(e.body, e.fromEmail).slice(0, 2)) {
      commitmentsRaw.push({
        action: s.action.slice(0, 120),
        who: s.direction === "outgoing" ? "You" : e.fromName,
        due: s.dueDate,
      });
    }
  }

  const receipts = emails
    .filter((e) => ["INVOICE", "RECEIPT", "ORDER", "SHIPMENT"].includes(e.intent ?? "") || (e.body.toLowerCase().includes("invoice") && (e.labels ?? "").toLowerCase().includes("finance")))
    .slice(0, 4)
    .map((e) => ({ subject: e.subject, fromName: e.fromName, snippet: e.snippet }));

  const result = await aiBriefing({ needsReply, waiting, commitments: commitmentsRaw.slice(0, 5), receipts });
  return NextResponse.json({ ...result, counts: { needsReply: needsReply.length, waiting: waiting.length, commitments: commitmentsRaw.length, receipts: receipts.length } });
}
