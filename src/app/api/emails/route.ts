import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Folder } from "@/lib/types";
import { seedEmails, seedLabels } from "@/lib/seed-data";
import { makeSnippet, makeThreadId, textToHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

const FOLDERS: Folder[] = ["INBOX", "SENT", "DRAFTS", "TRASH", "SPAM", "ARCHIVE"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder") as Folder | null;
  const label = searchParams.get("label");
  const starred = searchParams.get("starred");
  const important = searchParams.get("important");
  const search = searchParams.get("q")?.trim() ?? "";
  const unreadOnly = searchParams.get("unread") === "true";

  const where: {
    folder?: { in: Folder[] };
    labels?: { contains: string };
    isStarred?: boolean;
    isImportant?: boolean;
    OR?: Array<Record<string, unknown>>;
  } = {};

  // Special views
  if (starred === "true") {
    where.isStarred = true;
    where.folder = { in: ["INBOX", "SENT", "DRAFTS", "ARCHIVE"] };
  } else if (important === "true") {
    where.isImportant = true;
    where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
  } else if (label) {
    // label "Personal" should also match "Personal,Social"
    where.labels = { contains: label };
    where.folder = { in: ["INBOX", "SENT", "ARCHIVE"] };
  } else if (folder && FOLDERS.includes(folder)) {
    where.folder = folder;
  } else {
    where.folder = "INBOX";
  }

  if (search) {
    where.OR = [
      { subject: { contains: search } },
      { fromName: { contains: search } },
      { fromEmail: { contains: search } },
      { toEmails: { contains: search } },
      { body: { contains: search } },
      { snippet: { contains: search } },
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

  // Compose / send
  const to: string = (body?.to ?? "").trim();
  const cc: string = (body?.cc ?? "").trim();
  const bcc: string = (body?.bcc ?? "").trim();
  const subject: string = (body?.subject ?? "").trim();
  const bodyText: string = body?.body ?? "";
  const attachmentName: string = (body?.attachmentName ?? "").trim();

  if (!to) {
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
  const me = "you@zmail.com";

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
      date: new Date(),
      isRead: true,
      isStarred: false,
      isImportant: false,
      folder: "SENT",
      labels: "",
      hasAttachment: !!attachmentName,
      attachmentName,
    },
  });

  return NextResponse.json({ email: created });
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
      },
    });
  }
}
