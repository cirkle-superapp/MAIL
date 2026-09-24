import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiFollowUp } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/followup { id } — Smart Follow-up: draft a polite follow-up
// for an email the user sent and is waiting on a reply for.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id: string = body?.id;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const email = await db.email.findUnique({ where: { id } });
    if (!email) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const now = new Date();
    const ageDays = Math.max(0, Math.floor((now.getTime() - email.date.getTime()) / (24 * 60 * 60 * 1000)));
    const result = await aiFollowUp({
      subject: email.subject,
      toName: email.toEmails,
      body: email.body,
      ageDays,
    });
    if (!result) {
      return NextResponse.json({ error: "follow-up draft unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ...result, sourceEmailId: email.id, toEmails: email.toEmails, subject: email.subject });
  } catch (err) {
    console.error("[ai/followup] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
