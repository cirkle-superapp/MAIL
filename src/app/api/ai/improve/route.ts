import { NextRequest, NextResponse } from "next/server";
import { aiImprove } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/improve { text, instruction }
// AI Composition Copilot: rewrites/polishes the user's draft text using
// multi-model consensus (best-confidence pick). Instructions: professional,
// concise, friendly, urgent, add-call-to-action, fix-grammar.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text: string = (body?.text ?? "").trim();
  const instruction: string = (body?.instruction ?? "professional").trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const result = await aiImprove({ text, instruction });
  if (result) {
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "Could not improve text" }, { status: 503 });
}
