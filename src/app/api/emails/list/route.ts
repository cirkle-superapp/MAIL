import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Folder } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/emails/list — list emails for external platforms.
 *
 * Auth: X-Cirkle-API-Key header (must match process.env.CIRKLE_API_KEY).
 *
 * Query params:
 *   folder: INBOX | SENT | DRAFTS | ARCHIVE | TRASH | SPAM  (default: INBOX)
 *   view:   now | reply | waiting | receipts | subscriptions  (overrides folder)
 *   limit:  1-200 (default: 50)
 *   offset: 0+ (default: 0)
 *   unread: "true" to filter unread only
 *
 * Returns: { emails: [...], total, folder, limit, offset }
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const folder = (searchParams.get("folder") || "INBOX") as Folder;
    const view = searchParams.get("view");
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));
    const unreadOnly = searchParams.get("unread") === "true";
    const search = searchParams.get("q")?.trim() ?? "";
    const now = new Date();

    const where: Record<string, unknown> = {};
    const notSnoozed = { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] };

    if (view === "now") {
      where.folder = "INBOX";
      where.AND = [notSnoozed, {
        OR: [
          { isRead: false },
          { isImportant: true },
          { intent: { in: ["REQUIRES_REPLY", "SECURITY_ALERT", "COMMITMENT", "MEETING"] } },
        ],
      }];
    } else if (view === "reply") {
      where.folder = { in: ["INBOX", "ARCHIVE"] };
      where.intent = "REQUIRES_REPLY";
      where.AND = [notSnoozed];
    } else if (view === "waiting") {
      where.folder = "SENT";
      where.AND = [{ OR: [{ intent: "COMMITMENT" }, { body: { contains: "?" } }] }];
    } else if (view === "receipts") {
      where.OR = [
        { intent: { in: ["INVOICE", "RECEIPT", "ORDER", "SHIPMENT"] } },
        { labels: { contains: "finance" } },
      ];
      where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
    } else if (view === "subscriptions") {
      where.OR = [
        { intent: { in: ["NEWSLETTER", "PROMOTION"] } },
        { labels: { contains: "newsletter" } },
      ];
      where.folder = { in: ["INBOX", "ARCHIVE"] };
    } else {
      where.folder = folder;
    }

    if (unreadOnly) where.isRead = false;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
        { fromName: { contains: search, mode: "insensitive" } },
      ];
    }

    const [emails, total] = await Promise.all([
      db.email.findMany({
        where,
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          threadId: true,
          fromName: true,
          fromEmail: true,
          toEmails: true,
          subject: true,
          snippet: true,
          date: true,
          isRead: true,
          isStarred: true,
          isImportant: true,
          folder: true,
          labels: true,
          hasAttachment: true,
          attachmentName: true,
          snoozedUntil: true,
          scheduledFor: true,
          intent: true,
        },
      }),
      db.email.count({ where }),
    ]);

    return NextResponse.json({
      emails,
      total,
      folder: view || folder,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[api/emails/list] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list emails" },
      { status: 500 }
    );
  }
}
