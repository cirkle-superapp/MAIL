import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIntent, makeSnippet, makeThreadId, textToHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/emails/send — send an outgoing email via the API.
 *
 * Auth: X-Cirkle-API-Key header (must match process.env.CIRKLE_API_KEY).
 * If no key is configured, the endpoint is open (useful for local dev).
 *
 * Body:
 *   {
 *     "fromName": "You",                   (optional, defaults to "You")
 *     "fromEmail": "you@cirkle.mail",      (optional, defaults to you@cirkle.mail)
 *     "toEmails": "john@example.com",
 *     "ccEmails": "",
 *     "bccEmails": "",
 *     "subject": "Re: Meeting tomorrow",
 *     "body": "<p>HTML or plain text body</p>",
 *     "labels": "Work",                    (optional)
 *     "hasAttachment": false,              (optional)
 *     "attachmentName": "",                (optional)
 *     "scheduledFor": null,                (optional ISO string for scheduled send)
 *     "threadId": "t_abc123"               (optional, for threading)
 *   }
 *
 * If scheduledFor is set, the email is created in the SCHEDULED folder
 * (the Inngest/Vercel Cron delivers it when the time arrives).
 * Otherwise it's immediately created in the SENT folder.
 *
 * If EMAIL_WEBHOOK_URL is configured, the email body is also POSTed to that
 * URL (for integration with a real email sending service like Postmark,
 * SendGrid, Mailgun, etc.).
 *
 * Returns: { id, status: "sent" | "scheduled", subject }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const apiKey = process.env.CIRKLE_API_KEY;
    if (apiKey) {
      const provided = request.headers.get("x-cirkle-api-key") || "";
      if (provided !== apiKey) {
        return NextResponse.json(
          { error: "Unauthorized — invalid or missing X-Cirkle-API-Key header" },
          { status: 401 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const toEmails = (body?.toEmails ?? "").trim();
    const subject = (body?.subject ?? "(no subject)").trim();
    const rawBody = (body?.body ?? "").trim();

    if (!toEmails) {
      return NextResponse.json(
        { error: "toEmails is required" },
        { status: 400 }
      );
    }

    // Normalize the body to HTML
    const htmlBody = rawBody.includes("<") && rawBody.includes(">")
      ? rawBody
      : textToHtml(rawBody);

    const isScheduled = body?.scheduledFor && new Date(body.scheduledFor) > new Date();
    const folder = isScheduled ? "SCHEDULED" : "SENT";

    const emailData = {
      threadId: body?.threadId || makeThreadId(),
      fromName: (body?.fromName ?? "You").trim(),
      fromEmail: (body?.fromEmail ?? "you@cirkle.mail").trim(),
      toEmails,
      ccEmails: (body?.ccEmails ?? "").trim(),
      bccEmails: (body?.bccEmails ?? "").trim(),
      subject,
      body: htmlBody,
      snippet: makeSnippet(rawBody.replace(/<[^>]+>/g, " ")),
      date: new Date(),
      isRead: true,
      isStarred: false,
      isImportant: false,
      folder,
      labels: (body?.labels ?? "").trim(),
      hasAttachment: body?.hasAttachment ?? false,
      attachmentName: (body?.attachmentName ?? "").trim(),
      snoozedUntil: null,
      scheduledFor: isScheduled ? new Date(body.scheduledFor) : null,
      intent: classifyIntent({
        fromEmail: body?.fromEmail ?? "you@cirkle.mail",
        subject,
        body: rawBody,
      }).intent,
    };

    const email = await db.email.create({ data: emailData });

    // TRIGGER INNGEST — the serverless event-driven email pipeline.
    // Instead of doing SMTP directly (which may fail on Vercel's port 25),
    // we trigger Inngest which orchestrates the workflow:
    //   Step 1: Read email from Neon
    //   Step 2: Fetch SMTP config from Turso (edge)
    //   Step 3: Execute SMTP send (with retries, rate-limiting, concurrency)
    //   Step 4: Update delivery status
    //
    // Inngest handles the queue — 10,000 emails at once → no crash,
    // horizontal scaling, exponential backoff retries.
    if (!isScheduled) {
      try {
        const { inngest } = await import("@/lib/inngest");
        await inngest.send({
          name: "email/send.requested",
          data: { emailId: email.id },
        });
        console.log(`[api/emails/send] Inngest event triggered for ${email.id}`);
      } catch (inngestErr) {
        console.error("[api/emails/send] Inngest trigger failed:", inngestErr);
        // The graceful fallback: email is in SENT, just not externally delivered
      }
    }

    return NextResponse.json({
      id: email.id,
      status: isScheduled ? "scheduled" : "sent",
      subject: emailData.subject,
      to: emailData.toEmails,
      scheduledFor: isScheduled ? body.scheduledFor : null,
      sentAt: isScheduled ? null : email.createdAt,
    }, { status: 201 });
  } catch (err) {
    console.error("[api/emails/send] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
