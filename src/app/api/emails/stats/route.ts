import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Get counts per folder, plus starred/important counts, plus label counts
export async function GET() {
  const now = new Date();
  const all = await db.email.findMany({
    select: {
      id: true,
      folder: true,
      isRead: true,
      isStarred: true,
      isImportant: true,
      labels: true,
      snoozedUntil: true,
      toEmails: true,
      fromEmail: true,
      intent: true,
      body: true,
    },
  });

  const counts: Record<string, number> = {
    INBOX: 0,
    SENT: 0,
    DRAFTS: 0,
    SCHEDULED: 0,
    TRASH: 0,
    SPAM: 0,
    ARCHIVE: 0,
    STARRED: 0,
    IMPORTANT: 0,
    SNOOZED: 0,
    // Communication OS views
    NOW: 0,
    REPLY: 0,
    WAITING: 0,
    RECEIPTS: 0,
    SUBSCRIPTIONS: 0,
  };
  const unreadByFolder: Record<string, number> = {
    INBOX: 0,
    SENT: 0,
    DRAFTS: 0,
    SCHEDULED: 0,
    TRASH: 0,
    SPAM: 0,
    ARCHIVE: 0,
  };
  const labelCounts: Record<string, number> = {};

  for (const e of all) {
    const isSnoozed = !!e.snoozedUntil && e.snoozedUntil > now;
    const isUser = (e.fromEmail ?? "").toLowerCase() === "you@cirkle.mail";
    const labels = (e.labels ?? "").toLowerCase();

    if (counts[e.folder] !== undefined) counts[e.folder] += 1;
    if (!e.isRead && unreadByFolder[e.folder] !== undefined)
      unreadByFolder[e.folder] += 1;
    if (isSnoozed && ["INBOX", "ARCHIVE"].includes(e.folder)) {
      counts.SNOOZED += 1;
      // snoozed emails are hidden from inbox unread count
    } else {
      if (e.isStarred && ["INBOX", "SENT", "DRAFTS", "ARCHIVE"].includes(e.folder))
        counts.STARRED += 1;
      if (e.isImportant && ["INBOX", "SENT", "ARCHIVE"].includes(e.folder))
        counts.IMPORTANT += 1;
    }

    // Communication OS view counts (mirror the GET /api/emails?view= filters)
    if (!isSnoozed) {
      // NOW: inbox + (unread OR important OR actionable intent)
      if (
        e.folder === "INBOX" &&
        (!e.isRead ||
          e.isImportant ||
          ["REQUIRES_REPLY", "SECURITY_ALERT", "COMMITMENT", "MEETING"].includes(
            e.intent ?? ""
          ))
      ) {
        counts.NOW += 1;
      }
      // REPLY: requires-reply intent (not sent by user)
      if (
        !isUser &&
        e.intent === "REQUIRES_REPLY" &&
        ["INBOX", "ARCHIVE"].includes(e.folder)
      ) {
        counts.REPLY += 1;
      }
      // WAITING: user sent + contains a question/commitment
      if (
        isUser &&
        e.folder === "SENT" &&
        (e.intent === "COMMITMENT" || (e.body ?? "").includes("?"))
      ) {
        counts.WAITING += 1;
      }
      // RECEIPTS: invoice/receipt/order/shipment intent OR Finance label
      if (
        ["INVOICE", "RECEIPT", "ORDER", "SHIPMENT"].includes(e.intent ?? "") ||
        labels.includes("finance")
      ) {
        if (["INBOX", "SENT", "ARCHIVE"].includes(e.folder)) counts.RECEIPTS += 1;
      }
      // SUBSCRIPTIONS: newsletter/promotion intent OR Newsletter label
      if (
        (["NEWSLETTER", "PROMOTION"].includes(e.intent ?? "") ||
          labels.includes("newsletter")) &&
        ["INBOX", "ARCHIVE"].includes(e.folder)
      ) {
        counts.SUBSCRIPTIONS += 1;
      }
    }

    if (e.labels) {
      for (const label of e.labels.split(",").map((s) => s.trim()).filter(Boolean)) {
        labelCounts[label] = (labelCounts[label] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json({ counts, unreadByFolder, labelCounts });
}
