import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIntent } from "@/lib/email-utils";
import { aiClassify } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/classify  { id, ai?: boolean, persist?: boolean }
// Returns the intent for an email. Deterministic by default; uses the LLM
// when ai=true (graceful fallback if unavailable). Persists to email.intent
// when persist=true (default).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id: string = body?.id;
  const useAI: boolean = body?.ai === true;
  const persist: boolean = body?.persist !== false;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const email = await db.email.findUnique({ where: { id } });
  if (!email) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Deterministic baseline (always computed; AI only refines)
  const baseline = classifyIntent(email);

  let result = baseline;
  if (useAI) {
    const ai = await aiClassify({
      subject: email.subject,
      fromName: email.fromName,
      fromEmail: email.fromEmail,
      body: email.body,
    });
    if (ai && ai.confidence > baseline.confidence) {
      result = ai;
    }
  }

  if (persist) {
    await db.email.update({
      where: { id },
      data: { intent: result.intent },
    });
  }

  return NextResponse.json({
    intent: result.intent,
    confidence: result.confidence,
    reason: result.reason,
    source: useAI && result === baseline ? "rules" : useAI ? "ai" : "rules",
    persisted: persist,
  });
}
