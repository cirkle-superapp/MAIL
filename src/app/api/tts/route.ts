import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/tts — text-to-speech for email readback.
// Body: { text: string, voice?: string, speed?: number }
// Returns: WAV audio (Content-Type: audio/wav).
// The client creates an object URL from the blob and plays it.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = (body?.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    // TTS API limit: 1024 chars per request. Chunk if longer.
    const chunk = text.slice(0, 1000);
    const voice = (body?.voice as string) || "tongtong";
    const speed = typeof body?.speed === "number" ? body.speed : 1.0;

    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: chunk,
      voice,
      speed,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("[tts] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS failed" },
      { status: 500 }
    );
  }
}
