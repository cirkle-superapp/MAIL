import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Vercel Cron — delivers due scheduled emails every minute.
 *
 * Wired via vercel.json crons: `* * * * *` → /api/cron/deliver
 *
 * This is the production backup for the Inngest `deliverScheduledEmails`
 * function. Either path works — whichever fires first delivers the due emails
 * (the updateMany is idempotent: once a SCHEDULED email moves to SENT, it
 * won't match the WHERE clause again).
 *
 * Auth: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`.
 * We verify it matches process.env.CRON_SECRET when set (so randoms can't hit
 * this endpoint and trigger delivery). In dev (no secret), the endpoint is
 * open but harmless (idempotent updateMany).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify the Vercel Cron secret if one is configured
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const result = await db.email.updateMany({
      where: {
        folder: "SCHEDULED",
        scheduledFor: { lte: now },
      },
      data: { folder: "SENT", scheduledFor: null },
    });
    return NextResponse.json({
      delivered: result.count,
      checkedAt: now.toISOString(),
      source: "vercel-cron",
    });
  } catch (err) {
    console.error("[cron/deliver] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
