/**
 * Cirkle Mail — Custom SMTP Server + Client (built from scratch)
 *
 * NO external email services (no Postmark, SendGrid, Mailgun, nodemailer).
 * Cirkle IS its own mail server — speaks the SMTP protocol directly via
 * Node's `net` module and `dns` module.
 *
 * Architecture:
 * - SMTP CLIENT: looks up the recipient's MX records (DNS), connects directly
 *   to their mail server (port 25), speaks SMTP (EHLO → MAIL FROM → RCPT TO →
 *   DATA → QUIT). This is how real email delivery works — no relay needed.
 * - SMTP SERVER: listens on port 2525, accepts incoming SMTP connections,
 *   parses the protocol, and forwards received emails to Cirkle's API
 *   (/api/emails/receive).
 *
 * The Cirkle API (/api/emails/send) calls this service to deliver emails.
 * Email servers connect to this service (port 2525) to deliver emails TO Cirkle.
 *
 * Usage:
 *   POST http://localhost:3030/send  { to, from, subject, html }
 *   → delivers the email directly to the recipient's MX server
 *
 *   SMTP server on port 2525:
 *   → receives emails and POSTs them to the Cirkle API
 */

import { createServer, Socket } from "net";
import { resolveMx } from "dns";
import { createConnection } from "net";

const PORT = 3030;
const SMTP_SERVER_PORT = 2525;
const CIRKLE_API = process.env.CIRKLE_API_URL || "http://localhost:3000";
const CIRKLE_API_KEY = process.env.CIRKLE_API_KEY || "";

// ═══════════════════════════════════════════════════════════════
// SMTP CLIENT — sends emails directly to the recipient's MX server
// Built from scratch using net + dns. No nodemailer, no relay.
// ═══════════════════════════════════════════════════════════════

interface SendResult {
  success: boolean;
  mxServer?: string;
  response?: string;
  error?: string;
}

async function lookupMX(domain: string): Promise<string[]> {
  return new Promise((resolve) => {
    resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        // Fallback: try the domain directly (some servers accept direct delivery)
        resolve([domain]);
        return;
      }
      // Sort by priority (lower = higher priority)
      addresses.sort((a, b) => a.priority - b.priority);
      resolve(addresses.map((a) => a.exchange));
    });
  });
}

function smtpCommand(socket: Socket, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let response = "";
    const onData = (chunk: Buffer) => {
      response += chunk.toString();
      // SMTP responses end with \r\n and the 4th char is not '-' (final line)
      const lines = response.split("\r\n");
      const lastLine = lines[lines.length - 2] || lines[lines.length - 1];
      if (lastLine && lastLine.length >= 3 && lastLine[3] !== "-") {
        socket.off("data", onData);
        resolve(response.trim());
      }
    };
    socket.on("data", onData);
    socket.write(command + "\r\n");
    // Timeout after 10s
    setTimeout(() => {
      socket.off("data", onData);
      reject(new Error("SMTP command timeout: " + command));
    }, 10000);
  });
}

async function sendViaSMTP(to: string, from: string, subject: string, html: string): Promise<SendResult> {
  const domain = to.split("@")[1];
  if (!domain) return { success: false, error: "Invalid recipient" };

  const mxServers = await lookupMX(domain);
  if (mxServers.length === 0) return { success: false, error: "No MX records found" };

  for (const mxServer of mxServers) {
    try {
      const socket = createConnection({ port: 25, host: mxServer });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 10000);
      });

      // SMTP handshake
      const greeting = await smtpCommand(socket, ""); // wait for 220
      if (!greeting.startsWith("220")) {
        socket.destroy();
        continue;
      }

      const ehloResp = await smtpCommand(socket, "EHLO cirkle.mail");
      const mailResp = await smtpCommand(socket, `MAIL FROM:<${from}>`);
      if (!mailResp.startsWith("250")) {
        socket.destroy();
        continue;
      }
      const rcptResp = await smtpCommand(socket, `RCPT TO:<${to}>`);
      if (!rcptResp.startsWith("250")) {
        socket.destroy();
        continue;
      }
      await smtpCommand(socket, "DATA");

      // Send the email body (RFC 5322 format)
      const date = new Date().toUTCString();
      const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@cirkle.mail>`;
      const emailContent = [
        `From: <${from}>`,
        `To: <${to}>`,
        `Subject: ${subject}`,
        `Date: ${date}`,
        `Message-ID: ${msgId}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        html,
        `.`,
      ].join("\r\n");

      const dataResp = await smtpCommand(socket, emailContent);
      await smtpCommand(socket, "QUIT");
      socket.destroy();

      if (dataResp.startsWith("250")) {
        return { success: true, mxServer, response: dataResp };
      }
    } catch (err) {
      // Try the next MX server
      continue;
    }
  }

  return { success: false, error: "All MX servers failed" };
}

// ═══════════════════════════════════════════════════════════════
// SMTP SERVER — receives incoming emails (built from scratch)
// Listens on port 2525, parses SMTP, forwards to Cirkle's API
// ═══════════════════════════════════════════════════════════════

interface IncomingEmail {
  from: string;
  to: string;
  data: string;
}

const smtpServer = createServer((socket: Socket) => {
  let state: "greeting" | "mail" | "rcpt" | "data" | "body" = "greeting";
  let currentEmail: IncomingEmail = { from: "", to: "", data: "" };

  const send = (code: string, msg: string) => {
    socket.write(`${code} ${msg}\r\n`);
  };

  send("220", "cirkle.mail SMTP Service ready");

  socket.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\r\n");
    for (const line of lines) {
      const upper = line.toUpperCase().trim();

      if (state === "body") {
        if (line === ".") {
          state = "mail";
          send("250", "OK message accepted");
          // Forward to Cirkle's API
          forwardToCirkle(currentEmail).catch(() => {});
          currentEmail = { from: "", to: "", data: "" };
        } else {
          currentEmail.data += line + "\r\n";
        }
        continue;
      }

      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
        send("250", "cirkle.mail");
      } else if (upper.startsWith("MAIL FROM:")) {
        currentEmail.from = line.match(/<([^>]+)>/)?.[1] || line.split(":")[1]?.trim() || "";
        state = "mail";
        send("250", "OK");
      } else if (upper.startsWith("RCPT TO:")) {
        currentEmail.to = line.match(/<([^>]+)>/)?.[1] || line.split(":")[1]?.trim() || "";
        state = "rcpt";
        send("250", "OK");
      } else if (upper === "DATA") {
        state = "body";
        send("354", "Start mail input; end with <CRLF>.<CRLF>");
      } else if (upper === "QUIT") {
        send("221", "Bye");
        socket.destroy();
      } else if (upper === "RSET") {
        currentEmail = { from: "", to: "", data: "" };
        state = "greeting";
        send("250", "OK");
      } else {
        send("250", "OK");
      }
    }
  });

  socket.on("error", () => {});
});

async function forwardToCirkle(email: IncomingEmail) {
  const headers = email.data.split("\r\n\r\n");
  const headerBlock = headers[0] || "";
  const body = headers.slice(1).join("\r\n\r\n") || "";
  const subject = headerBlock.match(/Subject:\s*(.+)/i)?.[1] || "(no subject)";
  const fromName = headerBlock.match(/From:\s*(.+)/i)?.[1] || email.from;

  await fetch(`${CIRKLE_API}/api/emails/receive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CIRKLE_API_KEY ? { "X-Cirkle-API-Key": CIRKLE_API_KEY } : {}),
    },
    body: JSON.stringify({
      fromName: fromName.replace(/<[^>]+>/, "").trim() || "Unknown",
      fromEmail: email.from,
      toEmails: email.to,
      subject,
      body: body.includes("<") ? body : `<p>${body.replace(/\r\n/g, "<br/>")}</p>`,
    }),
  });
}

// ═══════════════════════════════════════════════════════════════
// HTTP API — for the Cirkle app to trigger sends
// ═══════════════════════════════════════════════════════════════

const httpServer = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({
        status: "ok",
        service: "cirkle-email-service",
        smtpServer: { port: SMTP_SERVER_PORT, running: true },
        smtpClient: "direct MX delivery (no relay)",
      });
    }

    // Send email via direct SMTP
    if (url.pathname === "/send" && req.method === "POST") {
      const body = await req.json();
      const { to, from, subject, html } = body;
      if (!to || !from || !subject) {
        return Response.json({ success: false, error: "to, from, subject required" }, { status: 400 });
      }
      console.log(`[smtp-client] Sending to ${to} via MX lookup...`);
      const result = await sendViaSMTP(to, from, subject, html || "<p>(empty)</p>");
      console.log(`[smtp-client] Result:`, result.success ? "✓ delivered" : `✗ ${result.error}`);
      return Response.json(result, { status: result.success ? 200 : 500 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

smtpServer.listen(SMTP_SERVER_PORT, () => {
  console.log(`[smtp-server] Listening on port ${SMTP_SERVER_PORT} (receive emails)`);
});

console.log(`[cirkle-email-service] HTTP API on port ${PORT} (send emails)`);
console.log(`[cirkle-email-service] SMTP server on port ${SMTP_SERVER_PORT} (receive emails)`);
console.log(`[cirkle-email-service] Cirkle API: ${CIRKLE_API}`);
console.log(`[cirkle-email-service] NO external email services — direct SMTP delivery`);
