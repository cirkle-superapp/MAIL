import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiPriority } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST /api/ai/priority — score an email 0-100.
// Body: { id: string } — fetches the email, scores it, caches the result on
// the Email row (priority field if it exists) and returns the score.
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
    if (!result) {
      return NextResponse.json({ error: "AI scoring failed" }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[ai/priority] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
