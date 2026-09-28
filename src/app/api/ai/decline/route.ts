import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/decline — AI generates a polite, professional decline response.
 * One-of-a-kind: no competitor offers a dedicated "decline" button.
 * Body: { id: string } — the email to decline.
 * Returns: { draft: string, confidence: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = body?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const email = await db.email.findUnique({
      where: { id },
      select: { fromName: true, fromEmail: true, subject: true, body: true, intent: true },
    });
    if (!email) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const plainBody = (email.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
    const messages = [
      { role: "system", content: "You write a polite, professional decline response to an email. The decline should be: (1) warm but clear, (2) context-appropriate (sales, meeting, proposal, invitation), (3) 2-3 sentences max, (4) leave the door open if appropriate. Respond with ONLY JSON: {\"draft\":\"the decline message\",\"confidence\":0.0}. No markdown, no prose outside JSON." },
      { role: "user", content: `Email to decline:\nFrom: ${email.fromName} <${email.fromEmail}>\nSubject: ${email.subject}\nIntent: ${email.intent}\n\nBody:\n${plainBody}` },
    ];

    // Try OpenRouter first, then Groq
    let raw: string | null = null;
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "llama-3.1-8b-instant", messages, temperature: 0.4, max_tokens: 500 }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const d = await res.json();
        raw = d.choices?.[0]?.message?.content ?? null;
      }
    } catch {}

    if (!raw) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "deepseek/deepseek-chat", messages, temperature: 0.4, max_tokens: 500 }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.ok) {
          const d = await res.json();
          raw = d.choices?.[0]?.message?.content ?? null;
        }
      } catch {}
    }

    if (raw) {
      const s = raw.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "").trim();
      try {
        const parsed = JSON.parse(s);
        if (parsed.draft) {
          return NextResponse.json({ draft: parsed.draft, confidence: parsed.confidence ?? 0.7 });
        }
      } catch {
        const start = s.indexOf("{");
        const end = s.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(s.slice(start, end + 1));
            if (parsed.draft) {
              return NextResponse.json({ draft: parsed.draft, confidence: parsed.confidence ?? 0.7 });
            }
          } catch {}
        }
      }
    }

    // Fallback: generic decline
    return NextResponse.json({
      draft: `Hi ${email.fromName},\n\nThank you for reaching out. Unfortunately, I'm not able to take this on at the moment. I appreciate you thinking of me and will reach out if anything changes.\n\nBest regards`,
      confidence: 0.3,
    });
  } catch (err) {
    console.error("[api/ai/decline] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
