import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Folder } from "@/lib/types";
import { seedEmails, seedLabels } from "@/lib/seed-data";
import {
  makeSnippet,
  makeThreadId,
  textToHtml,
  classifyIntent,
} from "@/lib/email-utils";

export const dynamic = "force-dynamic";

const FOLDERS: Folder[] = ["INBOX", "SENT", "DRAFTS", "SCHEDULED", "TRASH", "SPAM", "ARCHIVE"];

// ComOS views (Communication OS): intent/state-based smart filters (§2)
const COMOS_VIEWS = ["now", "reply", "waiting", "receipts", "subscriptions"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder") as Folder | null;
  const view = searchParams.get("view"); // ComOS view
  const label = searchParams.get("label");
  const starred = searchParams.get("starred");
  const important = searchParams.get("important");
  const snoozed = searchParams.get("snoozed");
  const search = searchParams.get("q")?.trim() ?? "";
  const unreadOnly = searchParams.get("unread") === "true";
  const now = new Date();

  const where: {
    folder?: { in: Folder[] } | Folder;
    labels?: { contains: string };
    isStarred?: boolean;
    isImportant?: boolean;
    isRead?: boolean;
    hasAttachment?: boolean;
    snoozedUntil?: Date | { gt: Date } | null;
    OR?: Array<Record<string, unknown>>;
    AND?: Array<Record<string, unknown>>;
  } = {};

  // Helper: hide actively-snoozed emails from a view (snoozed = future date)
  const notSnoozed: { OR: Array<Record<string, unknown>> } = {
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
  };

  // Communication OS views (§2): intent/state-based smart filters. These run
  // before the folder branches and take precedence when ?view= is set.
  if (view && COMOS_VIEWS.includes(view)) {
    if (view === "now") {
      where.folder = "INBOX";
      where.AND = [
        notSnoozed,
        {
          OR: [
            { isRead: false },
            { isImportant: true },
            { intent: "REQUIRES_REPLY" },
            { intent: "SECURITY_ALERT" },
            { intent: "COMMITMENT" },
            { intent: "MEETING" },
          ],
        },
      ];
    } else if (view === "reply") {
      where.folder = { in: ["INBOX", "ARCHIVE"] };
      where.intent = "REQUIRES_REPLY";
      where.AND = [notSnoozed];
    } else if (view === "waiting") {
      // Emails the user sent that contain a question/commitment — the user is
      // waiting on a response. Filter by sender = the user + a commitment/question.
      where.folder = "SENT";
      where.AND = [
        {
          OR: [
            { intent: "COMMITMENT" },
            { body: { contains: "?" } },
          ],
        },
      ];
    } else if (view === "receipts") {
      where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
      where.AND = [
        notSnoozed,
        {
          OR: [
            { intent: "INVOICE" },
            { intent: "RECEIPT" },
            { intent: "ORDER" },
            { intent: "SHIPMENT" },
            { labels: { contains: "Finance" } },
          ],
        },
      ];
    } else if (view === "subscriptions") {
      where.folder = { in: ["INBOX", "ARCHIVE"] };
      where.AND = [
        notSnoozed,
        {
          OR: [
            { intent: "NEWSLETTER" },
            { intent: "PROMOTION" },
            { labels: { contains: "Newsletter" } },
          ],
        },
      ];
    }
  } else if (snoozed === "true") {
    where.snoozedUntil = { gt: now };
    where.folder = { in: ["INBOX", "ARCHIVE"] };
  } else if (starred === "true") {
    where.isStarred = true;
    where.folder = { in: ["INBOX", "SENT", "DRAFTS", "ARCHIVE"] };
    where.AND = [notSnoozed];
  } else if (important === "true") {
    where.isImportant = true;
    where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
    where.AND = [notSnoozed];
  } else if (label) {
    // label "Personal" should also match "Personal,Social"
    where.labels = { contains: label };
    where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
    where.AND = [notSnoozed];
  } else if (folder && FOLDERS.includes(folder)) {
    where.folder = folder;
    // Hide snoozed emails from Inbox (they "come back" when snooze expires)
    if (folder === "INBOX") {
      where.AND = [notSnoozed];
    }
  } else {
    where.folder = "INBOX";
    where.AND = [notSnoozed];
  }

  // Parse search query for Gmail-style operators + free text.
  // Operators: is:unread, is:read, is:starred, is:important, has:attachment,
  // from:X, to:X, subject:X, label:X, in:inbox|sent|drafts|trash|spam|archive
  const searchFilters: Array<Record<string, unknown>> = [];
  if (search) {
    const tokens = search.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const freeText: string[] = [];
    const andClauses: Array<Record<string, unknown>> = [];
    for (let token of tokens) {
      token = token.replace(/^"(.*)"$/, "$1");
      const colon = token.indexOf(":");
      if (colon > 0) {
        const key = token.slice(0, colon).toLowerCase();
        const val = token.slice(colon + 1).toLowerCase();
        if (key === "is") {
          if (val === "unread") andClauses.push({ isRead: false });
          else if (val === "read") andClauses.push({ isRead: true });
          else if (val === "starred") andClauses.push({ isStarred: true });
          else if (val === "important") andClauses.push({ isImportant: true });
        } else if (key === "has" || key === "hasattachment") {
          if (val === "attachment" || key === "hasattachment")
            andClauses.push({ hasAttachment: true });
        } else if (key === "from") {
          andClauses.push({
            OR: [
              { fromEmail: { contains: val } },
              { fromName: { contains: val } },
            ],
          });
        } else if (key === "to") {
          andClauses.push({ toEmails: { contains: val } });
        } else if (key === "subject") {
          andClauses.push({ subject: { contains: val } });
        } else if (key === "label") {
          andClauses.push({ labels: { contains: val } });
        } else if (key === "in") {
          const folderVal = val.toUpperCase();
          if (FOLDERS.includes(folderVal as Folder)) {
            where.folder = folderVal as Folder;
          }
        } else {
          freeText.push(token);
        }
      } else {
        freeText.push(token);
      }
    }
    if (freeText.length > 0) {
      const text = freeText.join(" ");
      andClauses.push({
        OR: [
          { subject: { contains: text } },
          { fromName: { contains: text } },
          { fromEmail: { contains: text } },
          { toEmails: { contains: text } },
          { body: { contains: text } },
          { snippet: { contains: text } },
        ],
      });
    }
    if (andClauses.length > 0) {
      searchFilters.push(...andClauses);
    }
  }
  if (searchFilters.length > 0) {
    where.AND = [
      ...(where.AND ?? []),
      ...searchFilters,
    ];
  }

  const emails = await db.email.findMany({
    where,
    orderBy: { date: "desc" },
    take: 200,
  });

  const result = unreadOnly ? emails.filter((e) => !e.isRead) : emails;

  return NextResponse.json({ emails: result });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  // Seed endpoint
  if (action === "seed") {
    await seedDatabase();
    return NextResponse.json({ ok: true, message: "Seeded database" });
  }

  // Compose / send (or save draft, or schedule)
  const to: string = (body?.to ?? "").trim();
  const cc: string = (body?.cc ?? "").trim();
  const bcc: string = (body?.bcc ?? "").trim();
  const subject: string = (body?.subject ?? "").trim();
  const bodyText: string = body?.body ?? "";
  const attachmentName: string = (body?.attachmentName ?? "").trim();
  const isDraft: boolean = body?.isDraft === true;
  const scheduledFor: string | null =
    typeof body?.scheduledFor === "string" ? body.scheduledFor : null;

  // Drafts may legitimately have no recipient; only enforce recipient when actually sending
  if (!isDraft && !to) {
    return NextResponse.json(
      { error: "Recipient (to) is required" },
      { status: 400 }
    );
  }

  const htmlBody =
    bodyText.includes("<") && bodyText.includes(">")
      ? bodyText
      : textToHtml(bodyText);

  const threadId = makeThreadId();
  const me = "you@cirkle.mail";

  const folder: Folder = isDraft
    ? "DRAFTS"
    : scheduledFor
    ? "SCHEDULED"
    : "SENT";

  const created = await db.email.create({
    data: {
      threadId,
      fromName: "You",
      fromEmail: me,
      toEmails: to,
      ccEmails: cc,
      bccEmails: bcc,
      subject: subject || "(no subject)",
      body: htmlBody,
      snippet: makeSnippet(htmlBody),
      date: scheduledFor ? new Date(scheduledFor) : new Date(),
      isRead: true,
      isStarred: false,
      isImportant: false,
      folder,
      labels: "",
      hasAttachment: !!attachmentName,
      attachmentName,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    },
  });

  return NextResponse.json({ email: created });
}

// Deliver due scheduled emails: any SCHEDULED email whose scheduledFor <= now
// moves to SENT. Called on app mount (and periodically) to simulate delivery.
export async function PUT() {
  const now = new Date();
  const result = await db.email.updateMany({
    where: {
      folder: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    data: { folder: "SENT", scheduledFor: null },
  });
  return NextResponse.json({ delivered: result.count });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "ids array is required" },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (typeof body?.isRead === "boolean") updates.isRead = body.isRead;
  if (typeof body?.isStarred === "boolean") updates.isStarred = body.isStarred;
  if (typeof body?.isImportant === "boolean")
    updates.isImportant = body.isImportant;
  if (
    typeof body?.folder === "string" &&
    FOLDERS.includes(body.folder as Folder)
  )
    updates.folder = body.folder;
  // Snooze / unsnooze: passing null clears, an ISO date sets
  if (body?.snoozedUntil !== undefined) {
    updates.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const result = await db.email.updateMany({
    where: { id: { in: ids } },
    data: updates,
  });

  return NextResponse.json({ updated: result.count });
}

async function seedDatabase() {
  // Wipe and re-seed
  await db.email.deleteMany({});
  await db.label.deleteMany({});

  // Create labels
  for (const label of seedLabels) {
    await db.label.create({
      data: {
        id: label.id,
        name: label.name,
        color: label.color,
      },
    });
  }

  // Create emails
  for (const email of seedEmails) {
    const intentResult = classifyIntent(email);
    await db.email.create({
      data: {
        threadId: email.threadId,
        fromName: email.fromName,
        fromEmail: email.fromEmail,
        toEmails: email.toEmails,
        ccEmails: email.ccEmails,
        bccEmails: email.bccEmails,
        subject: email.subject,
        body: email.body,
        snippet: email.snippet,
        date: new Date(email.date),
        isRead: email.isRead,
        isStarred: email.isStarred,
        isImportant: email.isImportant,
        folder: email.folder,
        labels: email.labels,
        hasAttachment: email.hasAttachment,
        attachmentName: email.attachmentName,
        intent: intentResult.intent,
      },
    });
  }
}
