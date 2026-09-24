import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiQuickReplies } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/quick-replies { id } — 3 context-aware one-click reply options.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id: string = body?.id;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const email = await db.email.findUnique({ where: { id } });
    if (!email) return NextResponse.json({ error: "not found" }, { status: 404 });
    const replies = await aiQuickReplies({
      subject: email.subject, fromName: email.fromName, fromEmail: email.fromEmail, body: email.body,
    });
    if (replies) return NextResponse.json({ replies });
    return NextResponse.json({ error: "quick replies unavailable" }, { status: 503 });
  } catch (err) {
    console.error("[ai/quick-replies] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
