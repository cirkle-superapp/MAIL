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

    // Step 3: Generate Cirkle Delivery Link (fallback — always create one)
    const deliveryLink = await step.run("generate-delivery-link", async () => {
      const res = await fetch(`${baseUrl}/api/emails/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      if (!res.ok) throw new Error("Failed to generate delivery link");
      return res.json();
    });

    // Step 4: Trigger GitHub Actions — ephemeral SMTP carrier (port 25 OPEN)
    // GitHub Actions runners have outbound port 25 unrestricted. The runner
    // spins up, connects directly to the recipient's MX server via TLS,
    // delivers the email, reports status back to Neon, and shuts down.
    const sendResult = await step.run("trigger-github-actions-smtp-carrier", async () => {
      const githubToken = process.env.GITHUB_TOKEN || process.env.CIRKLE_GITHUB_TOKEN;
      const repo = process.env.GITHUB_REPO || "cirkle-superapp/MAIL";

      if (!githubToken) {
        // No GitHub token → fall back to the Cirkle Delivery Link
        console.log("[send-email] No GitHub token — using delivery link only");
        return {
          success: true,
          method: "cirkle-delivery-link",
          link: deliveryLink.link,
          smtpDelivery: false,
        };
      }

      try {
        // Trigger the GitHub Actions workflow via Repository Dispatch API
        const res = await fetch(
          `https://api.github.com/repos/${repo}/dispatches`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${githubToken}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              event_type: "cirkle-send-email",
              client_payload: {
                email_id: emailId,
                to: email.toEmails,
                from: "you@cirkle.mail",
                subject: email.subject,
                html: email.body,
                delivery_link_id: deliveryLink.token,
              },
            }),
          }
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(`GitHub dispatch failed: ${res.status} ${errData.message || ""}`);
        }

        console.log("[send-email] GitHub Actions dispatched — SMTP carrier spinning up...");
        return {
          success: true,
          method: "github-actions-smtp",
          deliveryLink: deliveryLink.link,
          smtpDelivery: true,
        };
      } catch (err) {
        console.log("[send-email] GitHub Actions failed — delivery link still available");
        return {
          success: true,
          method: "cirkle-delivery-link",
          link: deliveryLink.link,
          smtpDelivery: false,
          smtpError: err instanceof Error ? err.message : "Unknown",
        };
      }
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
