import { Inngest, cron } from "inngest";

/** Inngest client — the processing engine for serverless background jobs. */
export const inngest = new Inngest({
  id: "cirkle-mail",
  isDev: process.env.NODE_ENV !== "production",
});

/**
 * Scheduled email delivery — runs every minute via Inngest cron.
 * Finds all SCHEDULED emails whose scheduledFor <= now and moves them to SENT.
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

/**
 * EMAIL SEND PIPELINE — the serverless event-driven email dispatcher.
 *
 * This is the creative data flow:
 *   1. Vercel intercepts the send request → triggers Inngest event
 *   2. Inngest orchestrates the workflow (queue, retries, concurrency):
 *      Step 1: Read email state from Neon (primary DB)
 *      Step 2: Fetch SMTP config from Turso (edge DB — fast, global)
 *      Step 3: Execute the SMTP send (using the edge-cached config)
 *      Step 4: Update email status (sent/failed)
 *
 * Inngest handles:
 * - Automatic retries (exponential backoff) if the SMTP server throttles
 * - Rate-limiting (concurrency control) for high-volume dispatching
 * - Step-functions (each step is independently retried, durable)
 * - Queue management (10,000 emails at once → no crash, horizontal scaling)
 *
 * The SMTP config from Turso determines delivery:
 * - host set → call the SMTP service at that URL (the custom mini-service)
 * - host empty → direct MX delivery (lookup recipient's MX records, port 25)
 *
 * Triggered by: inngest.send({ name: "email/send.requested", data: { emailId } })
 */
export const sendEmailFunction = inngest.createFunction(
  {
    id: "send-email",
    retries: 3,
    triggers: [{ event: "email/send.requested" }],
  },
  async ({ event, step }) => {
    const emailId = (event.data as { emailId?: string })?.emailId;
    if (!emailId) return { error: "emailId is required" };

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

    // Step 1: Read email state from Neon (primary DB)
    const email = await step.run("read-email-from-neon", async () => {
      const res = await fetch(`${baseUrl}/api/emails/${emailId}`);
      if (!res.ok) throw new Error("Failed to read email from Neon");
      const data = await res.json();
      return data.email;
    });

    // Step 2: Fetch SMTP config from Turso (edge DB — milliseconds, global)
    const smtpConfig = await step.run("fetch-smtp-config-from-turso", async () => {
      const res = await fetch(`${baseUrl}/api/emails/smtp-config`);
      if (!res.ok) throw new Error("Failed to fetch SMTP config from Turso");
      return res.json();
    });

    // Step 3: Deliver the email — Cirkle Delivery Link (HTTPS, no port 25)
    // This is the INDEPENDENT delivery method: no SMTP, no external services.
    // The email is hosted on Cirkle, the recipient reads it via a secure link.
    const sendResult = await step.run("deliver-via-cirkle-link", async () => {
      // Generate a Cirkle Delivery Link (HTTPS — works on any browser)
      const res = await fetch(`${baseUrl}/api/emails/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (!res.ok) {
        throw new Error("Failed to generate delivery link");
      }
      const data = await res.json();
      return {
        success: true,
        method: "cirkle-delivery-link",
        link: data.link,
        token: data.token,
        expiresAt: data.expiresAt,
      };
    });

    // Step 4: Update email status (already saved as SENT in Neon — just log the delivery result)
    await step.run("update-delivery-status", async () => {
      console.log(`[send-email] Delivery result for ${emailId}:`, JSON.stringify(sendResult));
      return { emailId, deliveryResult: sendResult };
    });

    return { emailId, delivery: sendResult };
  }
);

export const inngestFunctions = [deliverScheduledEmails, sendEmailFunction];
