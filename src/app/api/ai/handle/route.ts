import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiHandleEmail, type HandleResult } from "@/lib/ai";
import { classifyIntent, detectCommitments, type CommitmentSignal } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

// POST /api/ai/handle  { id }
// HANDLE EMAIL (§16): analyze an email and propose a complete workflow.
// Uses the LLM with source-grounded constraints; falls back to deterministic
// analysis (commitment signals + intent) if the LLM fails (§44).
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

    // Deterministic commitments (always computed as a fallback / supplement)
    const signals: CommitmentSignal[] = detectCommitments(email.body, email.fromEmail);
    const baseline = classifyIntent(email);

    const ai: HandleResult = await aiHandleEmail({
      id: email.id,
      subject: email.subject,
      fromName: email.fromName,
      fromEmail: email.fromEmail,
      body: email.body,
      date: email.date.toISOString(),
    });

    // Merge: prefer AI commitments when present; otherwise use deterministic signals.
    const commitments =
      ai.commitments && ai.commitments.length > 0
        ? ai.commitments
        : signals.map((s) => ({
            who: s.direction === "outgoing" ? "You" : email.fromName,
            action: s.action,
            due: s.dueDate,
            source: s.evidence,
          }));

    // If AI intent is the fallback "FYI" but deterministic found something better, use it.
    const intent =
      ai.intent === "FYI" && ai.confidence < 0.5 ? baseline.intent : ai.intent;

    return NextResponse.json({
      ...ai,
      intent,
      commitments,
      // Always include the deterministic signals as supplementary evidence
      signals: signals.map((s) => ({ ...s, sourceEmailId: email.id })),
    });
  } catch (err) {
    console.error("[ai/handle] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
