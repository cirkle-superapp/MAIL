import { NextRequest, NextResponse } from "next/server";
import { aiInterpretCommand } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/command  { command: string }
// Interpret a natural-language command for the universal command bar (§39).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const command: string = (body?.command ?? "").trim();
  if (!command) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  // Deterministic fast-path: simple keyword routing (no AI round-trip)
  const lower = command.toLowerCase();
  let fast: { action: "search" | "view" | "compose"; query?: string; view?: string; confidence: number } | null = null;
  if (/^(compose|new email|write|reply|draft)/.test(lower)) {
    fast = { action: "compose", confidence: 0.9 };
  } else if (/\b(waiting|waiting on|waiting for)\b/.test(lower)) {
    fast = { action: "view", view: "waiting", confidence: 0.85 };
  } else if (/\b(needs? reply|needs? a reply|unanswered|reply|respond)\b/.test(lower)) {
    fast = { action: "view", view: "reply", confidence: 0.85 };
  } else if (/\b(now|today|attention|urgent|priority)\b/.test(lower)) {
    fast = { action: "view", view: "now", confidence: 0.8 };
  } else if (/\bcommitments?\b/.test(lower)) {
    fast = { action: "view", view: "commitments", confidence: 0.85 };
  } else if (/\b(receipts?|invoices?|purchases?|orders?)\b/.test(lower)) {
    fast = { action: "view", view: "receipts", confidence: 0.85 };
  } else if (/\b(subscriptions?|newsletters?|mailing)\b/.test(lower)) {
    fast = { action: "view", view: "subscriptions", confidence: 0.85 };
  } else if (/\b(people|contacts?|senders?)\b/.test(lower)) {
    fast = { action: "view", view: "people", confidence: 0.85 };
  } else if (/\b(inbox|all mail)\b/.test(lower)) {
    fast = { action: "view", view: "inbox", confidence: 0.85 };
  } else if (/\b(starred|important)\b/.test(lower)) {
    fast = { action: "view", view: "starred", confidence: 0.85 };
  } else if (/\b(find|search|show|where|which)\b/.test(lower)) {
    // strip leading "find/show" and use the rest as a search query
    const q = command.replace(/^(find|search|show|where is|which|get me)\s+/i, "").trim();
    fast = { action: "search", query: q, confidence: 0.6 };
  }

  if (fast) {
    return NextResponse.json({ ...fast, source: "rules" });
  }

  // Fall back to AI interpretation
  const ai = await aiInterpretCommand(command);
  if (ai) {
    return NextResponse.json({ ...ai, source: "ai" });
  }
  // Ultimate fallback: treat the whole command as a search query
  return NextResponse.json({
    action: "search",
    query: command,
    confidence: 0.3,
    source: "fallback",
  });
}
