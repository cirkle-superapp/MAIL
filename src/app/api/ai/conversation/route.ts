import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiConversation } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/conversation  { threadId }
// Conversation Reconstruction (§8): structured summary of a thread —
// status/decisions/open questions/commitments/participants/next action.
// Source-grounded (every claim cites the source message).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const threadId: string = body?.threadId;
    if (!threadId) {
      return NextResponse.json({ error: "threadId is required" }, { status: 400 });
    }
    const messages = await db.email.findMany({
      where: { threadId },
      orderBy: { date: "asc" },
      take: 30,
    });
    if (messages.length === 0) {
      return NextResponse.json({ error: "thread not found" }, { status: 404 });
    }
    const result = await aiConversation(
      messages.map((m) => ({
        id: m.id,
        fromName: m.fromName,
        fromEmail: m.fromEmail,
        subject: m.subject,
        body: m.body,
        date: m.date.toISOString(),
      })),
      threadId
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai/conversation] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
