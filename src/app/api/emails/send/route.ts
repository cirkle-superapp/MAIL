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

    // Deliver via Cirkle's OWN SMTP service (built from scratch — direct MX
    // delivery, no external services like Postmark/SendGrid/Mailgun).
    const smtpServiceUrl = process.env.SMTP_SERVICE_URL;
    if (smtpServiceUrl && !isScheduled) {
      try {
        await fetch(`${smtpServiceUrl}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: emailData.toEmails,
            from: emailData.fromEmail,
            subject: emailData.subject,
            html: emailData.body,
          }),
        });
      } catch (smtpErr) {
        console.error("[api/emails/send] SMTP delivery failed:", smtpErr);
        // Don't fail the request — the email is already saved in the DB
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
