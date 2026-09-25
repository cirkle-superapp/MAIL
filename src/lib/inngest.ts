import { Inngest, cron } from "inngest";

/** Inngest client — used for server-side background jobs (scheduled email delivery). */
export const inngest = new Inngest({
  id: "cirkle-mail",
  isDev: process.env.NODE_ENV !== "production",
});

/**
 * Scheduled email delivery — runs every minute via Inngest cron.
 * Finds all SCHEDULED emails whose scheduledFor <= now and moves them to SENT.
 * This replaces the client-side setInterval(deliver, 30000) — server-side is
 * more reliable (works even when the user isn't looking at the app).
 */
export const deliverScheduledEmails = inngest.createFunction(
  { id: "deliver-scheduled-emails", retries: 2, triggers: [cron("* * * * *")] },
  async () => {
    const { db } = await import("@/lib/db");
    const now = new Date();
    const result = await db.email.updateMany({
      where: {
        folder: "SCHEDULED",
        scheduledFor: { lte: now },
      },
      data: { folder: "SENT", scheduledFor: null },
    });
    return { delivered: result.count, checkedAt: now.toISOString() };
  }
);

export const inngestFunctions = [deliverScheduledEmails];
