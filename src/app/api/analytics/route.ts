import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { detectCommitments } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

// GET /api/analytics — personal communication analytics (§41).
// Visibility, not gamification: response load, unanswered, overdue commitments,
// volume trend, top correspondents.
export async function GET() {
  const now = new Date();
  const fourteenAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const emails = await db.email.findMany({
    where: { folder: { in: ["INBOX", "SENT", "ARCHIVE"] } },
    select: {
      id: true,
      fromEmail: true,
      fromName: true,
      date: true,
      isRead: true,
      intent: true,
      folder: true,
      body: true,
      threadId: true,
      labels: true,
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  const isUser = (e: { fromEmail: string }) =>
    e.fromEmail.toLowerCase() === "you@cirkle.mail";

  const received = emails.filter((e) => !isUser(e));
  const sent = emails.filter((e) => isUser(e));
  const unread = emails.filter((e) => !e.isRead && e.folder === "INBOX");
  const needsReply = emails.filter((e) => e.intent === "REQUIRES_REPLY");

  // Top correspondents (by count, excluding self)
  const corrMap = new Map<string, { name: string; count: number; last: Date }>();
  for (const e of received) {
    const key = e.fromEmail;
    const existing = corrMap.get(key);
    if (existing) {
      existing.count += 1;
      if (e.date > existing.last) existing.last = e.date;
    } else {
      corrMap.set(key, { name: e.fromName, count: 1, last: e.date });
    }
  }
  const topCorrespondents = Array.from(corrMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Volume by day (last 14 days)
  const volumeByDay: Array<{ day: string; received: number; sent: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayStr = dayStart.toISOString().slice(0, 10);
    const dayReceived = received.filter(
      (e) => e.date >= dayStart && e.date < dayEnd
    ).length;
    const daySent = sent.filter(
      (e) => e.date >= dayStart && e.date < dayEnd
    ).length;
    volumeByDay.push({ day: dayStr, received: dayReceived, sent: daySent });
  }

  // Overdue commitments (deterministic: commitments with a due keyword that's
  // past, or all incoming commitments older than 3 days with no reply)
  let overdueCommitments = 0;
  for (const e of received) {
    if (e.intent === "COMMITMENT") {
      // if received > 3 days ago and no sent reply in the same thread, count as overdue
      const age = (now.getTime() - e.date.getTime()) / (24 * 60 * 60 * 1000);
      if (age > 3) {
        const hasReply = sent.some((s) => s.threadId === e.threadId);
        if (!hasReply) overdueCommitments += 1;
      }
    }
  }

  // Intent distribution
  const intentDist: Record<string, number> = {};
  for (const e of emails) {
    if (e.intent) intentDist[e.intent] = (intentDist[e.intent] ?? 0) + 1;
  }

  return NextResponse.json({
    totals: {
      received: received.length,
      sent: sent.length,
      unread: unread.length,
      needsReply: needsReply.length,
      overdueCommitments,
    },
    topCorrespondents: topCorrespondents.map((c) => ({
      name: c.name,
      count: c.count,
      lastInteraction: c.last.toISOString(),
    })),
    volumeByDay,
    intentDistribution: intentDist,
  });
}
