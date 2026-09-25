import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiPriority, type PriorityResult } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/priority — score an email 0-100.
// Body: { id: string } — fetches the email, scores it via the 5-model
// generation consensus (z-ai SDK fallback), and returns the score.
// If all AI models are unavailable (e.g. from Vercel's serverless IPs),
// falls back to a deterministic score based on the email's intent + flags.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = body?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const email = await db.email.findUnique({
      where: { id },
      select: { id: true, fromName: true, fromEmail: true, subject: true, body: true, snippet: true, intent: true, isImportant: true, hasAttachment: true },
    });
    if (!email) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const result = await aiPriority(email);
    if (result) {
      return NextResponse.json(result);
    }
    // Deterministic fallback: score based on intent + flags (no AI needed).
    // This ensures the priority badge always renders, even when all external
    // AI providers are unavailable from Vercel's serverless IPs.
    const intent = email.intent ?? "";
    let score = 30; // baseline
    if (email.isImportant) score += 25;
    if (email.hasAttachment) score += 10;
    if (intent === "REQUIRES_REPLY") score += 30;
    else if (intent === "COMMITMENT" || intent === "MEETING") score += 20;
    else if (intent === "SECURITY_ALERT") score += 40;
    else if (intent === "INVOICE" || intent === "RECEIPT") score += 5;
    else if (intent === "NEWSLETTER" || intent === "PROMOTION") score -= 15;
    score = Math.max(0, Math.min(100, score));
    const level: PriorityResult["level"] =
      score >= 86 ? "urgent" : score >= 61 ? "high" : score >= 31 ? "medium" : "low";
    return NextResponse.json({
      score,
      level,
      reasoning: "Estimated from email intent and flags (AI consensus unavailable)",
      confidence: 0.4,
    });
  } catch (err) {
    console.error("[ai/priority] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
