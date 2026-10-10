import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { sanitizeEmailHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/emails/deliver?token=[token] — fetch an email by delivery link.
 * This is the PUBLIC endpoint that the /d/[token] page calls to display
 * the email content to the recipient. No auth needed — the token IS the auth.
 * Marks the link as viewed on first access.
 */
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const link = await db.deliveryLink.findUnique({
      where: { token },
      include: { email: true },
    });

    if (!link) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
    }

    // Check expiry
    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json({ error: "This delivery link has expired" }, { status: 410 });
    }

    // Mark as viewed (first access)
    if (!link.viewed) {
      await db.deliveryLink.update({
        where: { id: link.id },
        data: { viewed: true, viewedAt: new Date() },
      });
    }

    return NextResponse.json({
      subject: link.email.subject,
      fromName: link.email.fromName,
      fromEmail: link.email.fromEmail,
      toEmails: link.email.toEmails,
      body: sanitizeEmailHtml(
        link.email.body && link.email.body !== "null" && link.email.body.trim()
          ? link.email.body
          : "<p>This email has no content.</p>"
      ),
      date: link.email.date.toISOString(),
      viewed: true,
      expiresAt: link.expiresAt?.toISOString() || null,
    });
  } catch (err) {
    console.error("[api/emails/deliver GET] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/emails/deliver — generates a Cirkle Delivery Link for an email.
 *
 * This is the INDEPENDENT email delivery method — no SMTP, no port 25, no
 * external email services. The email is hosted on Cirkle and the recipient
 * reads it via a secure HTTPS link.
 *
 * Body: { emailId: string }
 * Returns: { link: string, token: string, expiresAt: string }
 *
 * The link is: https://cirkle-mail.vercel.app/d/[token]
 * The recipient opens it in any browser — no account needed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const emailId = body?.emailId as string | undefined;
    if (!emailId) {
      return NextResponse.json({ error: "emailId is required" }, { status: 400 });
    }

    const email = await db.email.findUnique({
      where: { id: emailId },
      select: { id: true, toEmails: true, subject: true, fromName: true, fromEmail: true },
    });
    if (!email) {
      return NextResponse.json({ error: "email not found" }, { status: 404 });
    }

    // Generate a secure token (UUID + random bytes)
    const token = randomUUID() + "-" + randomUUID();

    // Link expires in 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Create the delivery link in Neon
    const link = await db.deliveryLink.create({
      data: {
        emailId: email.id,
        recipientEmail: email.toEmails,
        token,
        expiresAt,
      },
    });

    // The delivery URL (HTTPS — works on any browser, any device)
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
    const deliveryUrl = `${baseUrl}/d/${token}`;

    return NextResponse.json({
      link: deliveryUrl,
      token: link.token,
      expiresAt: expiresAt.toISOString(),
      recipient: email.toEmails,
      subject: email.subject,
      method: "cirkle-delivery-link",
      message: "Share this link with the recipient. They can read the email in any browser — no account needed, no SMTP, fully HTTPS.",
    }, { status: 201 });
  } catch (err) {
    console.error("[api/emails/deliver] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/emails/deliver — update delivery status (called by GitHub Actions)
 *
 * Body: { deliveryLinkId, status, mxServer, error }
 * The GitHub Actions runner calls this after attempting SMTP delivery.
 * Updates the DeliveryLink record in Neon with the result.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const deliveryLinkId = body?.deliveryLinkId as string | undefined;
    const status = body?.status as string | undefined;

    if (!deliveryLinkId) {
      return NextResponse.json({ error: "deliveryLinkId is required" }, { status: 400 });
    }

    const link = await db.deliveryLink.findUnique({
      where: { id: deliveryLinkId },
    });

    if (!link) {
      return NextResponse.json({ error: "delivery link not found" }, { status: 404 });
    }

    await db.deliveryLink.update({
      where: { id: deliveryLinkId },
      data: {
        viewed: status === "delivered" ? true : link.viewed,
        viewedAt: status === "delivered" ? new Date() : link.viewedAt,
      },
    });

    console.log(`[deliver PATCH] Email ${link.emailId} delivery: ${status}`, {
      mxServer: body?.mxServer,
      error: body?.error,
    });

    return NextResponse.json({
      ok: true,
      deliveryLinkId,
      status,
      mxServer: body?.mxServer,
      error: body?.error,
    });
  } catch (err) {
    console.error("[deliver PATCH] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
