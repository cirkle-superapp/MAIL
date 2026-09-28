import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — system health check.
 * Returns the status of all connected services.
 */
export async function GET() {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: process.env.DATABASE_URL ? "configured" : "not-configured",
      neon: process.env.NEON_DATABASE_URL ? "configured" : "not-configured",
      turso: process.env.TURSO_TOKEN ? "configured" : "not-configured",
      inngest: process.env.INNGEST_SIGN_KEY ? "configured" : "not-configured",
      ai: {
        groq: process.env.GROQ_API_KEY ? "configured" : "not-configured",
        openrouter: process.env.OPENROUTER_API_KEY ? "configured" : "not-configured",
        nvidia: process.env.NVIDIA_API_KEY ? "configured" : "not-configured",
        gemini: process.env.GEMINI_API_KEY ? "configured" : "not-configured",
        huggingface: process.env.HF_API_KEY ? "configured" : "not-configured",
      },
      cron: process.env.CRON_SECRET ? "configured" : "not-configured",
      emailApi: process.env.CIRKLE_API_KEY ? "configured" : "open (no auth)",
      emailWebhook: process.env.EMAIL_WEBHOOK_URL ? "configured" : "not-configured",
    },
    version: "1.0.0",
  };

  return NextResponse.json(health);
}
