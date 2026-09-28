import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIntent, makeSnippet, makeThreadId, textToHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

/**
 * POST /api/emails/receive — ingest an incoming email from an external platform.
 *
 * Auth: X-Cirkle-API-Key header (must match process.env.CIRKLE_API_KEY).
 * If no key is configured, the endpoint is open (useful for local dev).
 *
 * Body:
 *   {
 *     "fromName": "John Doe",
 *     "fromEmail": "john@example.com",
 *     "toEmails": "you@cirkle.mail",
 *     "ccEmails": "",
 *     "bccEmails": "",
 *     "subject": "Meeting tomorrow",
 *     "body": "<p>HTML or plain text body</p>",
 *     "date": "2026-09-26T10:00:00Z",  (optional, defaults to now)
 *     "labels": "Work",                  (optional)
 *     "hasAttachment": false,            (optional)
 *     "attachmentName": "",              (optional)
 *     "isImportant": false              (optional)
 *   }
 *
 * Returns: { id, status: "received", intent }
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
    const fromName = (body?.fromName ?? "").trim();
    const fromEmail = (body?.fromEmail ?? "").trim();
    const toEmails = (body?.toEmails ?? "you@cirkle.mail").trim();
    const subject = (body?.subject ?? "(no subject)").trim();
    const rawBody = (body?.body ?? "").trim();

    if (!fromName || !fromEmail) {
      return NextResponse.json(
        { error: "fromName and fromEmail are required" },
        { status: 400 }
      );
    }

    // Normalize the body to HTML
    const htmlBody = rawBody.includes("<") && rawBody.includes(">")
      ? rawBody
      : textToHtml(rawBody);

    const emailData = {
      threadId: body?.threadId || makeThreadId(),
      fromName,
      fromEmail,
      toEmails,
      ccEmails: (body?.ccEmails ?? "").trim(),
      bccEmails: (body?.bccEmails ?? "").trim(),
      subject,
      body: htmlBody,
      snippet: makeSnippet(rawBody.replace(/<[^>]+>/g, " ")),
      date: body?.date ? new Date(body.date) : new Date(),
      isRead: false,
      isStarred: false,
      isImportant: body?.isImportant ?? false,
      folder: "INBOX",
      labels: (body?.labels ?? "").trim(),
      hasAttachment: body?.hasAttachment ?? false,
      attachmentName: (body?.attachmentName ?? "").trim(),
      intent: "", // filled below
    };

    // Classify the intent using the deterministic classifier
    const intentResult = classifyIntent(emailData);
    emailData.intent = intentResult.intent;

    const email = await db.email.create({ data: emailData });

    return NextResponse.json({
      id: email.id,
      status: "received",
      intent: emailData.intent,
      subject: emailData.subject,
      fromName: emailData.fromName,
      receivedAt: email.createdAt,
    }, { status: 201 });
  } catch (err) {
    console.error("[api/emails/receive] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to receive email" },
      { status: 500 }
    );
  }
}
