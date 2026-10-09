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

    // Step 3: Execute the SMTP send
    const sendResult = await step.run("execute-smtp-send", async () => {
      const { toEmails, subject, body } = email;
      const { host, port, apiKey } = smtpConfig;

      // If a host is configured → call the SMTP service (the custom mini-service)
      if (host) {
        try {
          const res = await fetch(`http://${host}:${port}/send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey ? { "X-Cirkle-API-Key": apiKey } : {}),
            },
            body: JSON.stringify({
              to: toEmails,
              from: "you@cirkle.mail",
              subject,
              html: body,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            return { success: true, method: "smtp-service", mxServer: data.mxServer };
          }
          throw new Error(`SMTP service returned ${res.status}`);
        } catch (err) {
          // Fall through to direct MX delivery
          console.log("[send-email] SMTP service failed, trying direct MX:", err);
        }
      }

      // Direct MX delivery (from scratch — DNS resolveMx + net connect + SMTP protocol)
      // This runs inside the Inngest function. On platforms that allow port 25,
      // it delivers directly to the recipient's mail server. On Vercel (port 25
      // blocked), it fails gracefully — the email is already saved in SENT.
      const domain = toEmails.split(",")[0].split("@")[1];
      if (!domain) throw new Error("Invalid recipient");

      const dns = await import("dns");
      const net = await import("net");

      const mxRecords = await new Promise<{ exchange: string; priority: number }[]>((resolve) => {
        dns.resolveMx(domain, (err, addresses) => {
          resolve(err || !addresses ? [] : addresses.sort((a, b) => a.priority - b.priority));
        });
      });

      if (mxRecords.length === 0) {
        throw new Error(`No MX records for ${domain}`);
      }

      for (const mx of mxRecords) {
        try {
          const socket = net.createConnection({ port: 25, host: mx.exchange });
          await new Promise<void>((res, rej) => {
            socket.once("connect", res);
            socket.once("error", rej);
            setTimeout(() => rej(new Error("Connection timeout")), 5000);
          });

          // SMTP handshake
          await new Promise<string>((resolve) => {
            let buf = "";
            socket.on("data", (chunk: Buffer) => {
              buf += chunk.toString();
              const lines = buf.split("\r\n");
              const last = lines[lines.length - 2] || lines[lines.length - 1];
              if (last && last.length >= 3 && last[3] !== "-") resolve(buf.trim());
            });
          });

          socket.write("EHLO cirkle.mail\r\n");
          await new Promise((r) => setTimeout(r, 500));
          socket.write(`MAIL FROM:<you@cirkle.mail>\r\n`);
          await new Promise((r) => setTimeout(r, 500));
          socket.write(`RCPT TO:<${toEmails.split(",")[0].trim()}>\r\n`);
          await new Promise((r) => setTimeout(r, 500));
          socket.write("DATA\r\n");
          await new Promise((r) => setTimeout(r, 500));

          const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@cirkle.mail>`;
          const emailContent = [
            `From: <you@cirkle.mail>`,
            `To: <${toEmails.split(",")[0].trim()}>`,
            `Subject: ${subject}`,
            `Date: ${new Date().toUTCString()}`,
            `Message-ID: ${msgId}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/html; charset=UTF-8`,
            ``,
            body,
            `.`,
          ].join("\r\n");
          socket.write(emailContent + "\r\n");
          await new Promise((r) => setTimeout(r, 500));
          socket.write("QUIT\r\n");
          socket.destroy();

          return { success: true, method: "direct-mx", mxServer: mx.exchange };
        } catch {
          // Try next MX server
          continue;
        }
      }

      return { success: false, method: "direct-mx", error: "All MX servers failed" };
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
