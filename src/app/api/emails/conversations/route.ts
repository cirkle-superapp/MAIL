import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/emails/conversations — active two-way email threads.
 *
 * Finds threads where BOTH:
 * - You sent at least 1 email (fromEmail = you@cirkle.mail)
 * - You received at least 1 email (fromEmail != you@cirkle.mail)
 *
 * This means it's an ongoing conversation — you replied, they replied back
 * (or vice versa). Each conversation card shows:
 * - The participant (the person you're talking to)
 * - Message count (back-and-forth)
 * - Last message date + direction (incoming/outgoing)
 * - Whether the latest incoming message is unread (notification)
 * - A snippet of the latest message
 *
 * Sorted by most recent activity first.
 */
export async function GET() {
  try {
    const SELF = "you@cirkle.mail";
    const allEmails = await db.email.findMany({
      where: {
        folder: { in: ["INBOX", "SENT", "ARCHIVE"] },
      },
      select: {
        id: true,
        threadId: true,
        fromName: true,
        fromEmail: true,
        toEmails: true,
        subject: true,
        snippet: true,
        body: true,
        date: true,
        isRead: true,
        folder: true,
        intent: true,
      },
      orderBy: { date: "desc" },
      take: 500,
    });

    // Group by threadId
    const threads = new Map<string, typeof allEmails>();
    for (const e of allEmails) {
      if (!threads.has(e.threadId)) threads.set(e.threadId, []);
      threads.get(e.threadId)!.push(e);
    }

    const conversations: Array<{
      threadId: string;
      subject: string;
      participantName: string;
      participantEmail: string;
      messageCount: number;
      lastMessageDate: string;
      lastDirection: "incoming" | "outgoing";
      hasUnread: boolean;
      unreadCount: number;
      snippet: string;
      lastIntent: string;
    }> = [];

    for (const [threadId, emails] of threads) {
      const hasOutgoing = emails.some((e) => e.fromEmail.toLowerCase() === SELF);
      const hasIncoming = emails.some((e) => e.fromEmail.toLowerCase() !== SELF);

      // Only include two-way conversations
      if (!hasOutgoing || !hasIncoming) continue;

      // Find the participant (the non-you sender)
      const incomingEmails = emails.filter((e) => e.fromEmail.toLowerCase() !== SELF);
      const participantEmail = incomingEmails[0]?.fromEmail ?? "";
      const participantName = incomingEmails[0]?.fromName ?? "";

      // Sort by date to find the last message
      const sorted = [...emails].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const lastEmail = sorted[sorted.length - 1];
      const lastDirection = lastEmail.fromEmail.toLowerCase() === SELF ? "outgoing" : "incoming";

      // Check for unread incoming messages
      const unreadIncoming = incomingEmails.filter((e) => !e.isRead);
      const hasUnread = unreadIncoming.length > 0;

      conversations.push({
        threadId,
        subject: emails[0].subject,
        participantName,
        participantEmail,
        messageCount: emails.length,
        lastMessageDate: lastEmail.date.toISOString(),
        lastDirection,
        hasUnread,
        unreadCount: unreadIncoming.length,
        snippet: lastEmail.snippet,
        lastIntent: lastEmail.intent,
      });
    }

    // Sort by most recent activity
    conversations.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime());

    return NextResponse.json({
      conversations: conversations.slice(0, 20),
      total: conversations.length,
      unreadThreads: conversations.filter((c) => c.hasUnread).length,
    });
  } catch (err) {
    console.error("[api/emails/conversations] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
