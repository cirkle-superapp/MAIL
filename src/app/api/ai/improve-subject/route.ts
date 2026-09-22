import { NextRequest, NextResponse } from "next/server";
import { aiImproveSubject } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/improve-subject { subject } — 3 AI-suggested subject lines.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const draft: string = (body?.subject ?? "").trim();
  if (!draft) return NextResponse.json({ error: "subject is required" }, { status: 400 });
  const suggestions = await aiImproveSubject(draft);
  if (suggestions) return NextResponse.json({ suggestions });
  return NextResponse.json({ error: "could not suggest subjects" }, { status: 503 });
}
