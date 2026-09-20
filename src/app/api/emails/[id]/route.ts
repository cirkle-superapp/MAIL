import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Folder } from "@/lib/types";
import { makeSnippet, makeThreadId, textToHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const email = await db.email.findUnique({ where: { id } });
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Thread: emails sharing threadId, ordered by date asc
  const thread = await db.email.findMany({
    where: { threadId: email.threadId },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ email, thread });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body?.isRead === "boolean") data.isRead = body.isRead;
  if (typeof body?.isStarred === "boolean") data.isStarred = body.isStarred;
  if (typeof body?.isImportant === "boolean") data.isImportant = body.isImportant;
  if (typeof body?.folder === "string") data.folder = body.folder;
  if (typeof body?.snippet === "string") data.snippet = body.snippet;
  if (typeof body?.body === "string") data.body = body.body;
  if (typeof body?.subject === "string") data.subject = body.subject;
  if (typeof body?.toEmails === "string") data.toEmails = body.toEmails;
  if (typeof body?.ccEmails === "string") data.ccEmails = body.ccEmails;
  if (body?.snoozedUntil !== undefined) {
    data.snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await db.email.update({ where: { id }, data });
  return NextResponse.json({ email: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Permanently delete
  await db.email.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Reply endpoint: creates a reply in the same thread
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const original = await db.email.findUnique({ where: { id } });
  if (!original) {
    return NextResponse.json({ error: "Original not found" }, { status: 404 });
  }

  const replyBody: string = body?.body ?? "";
  const html = replyBody.includes("<") && replyBody.includes(">")
    ? replyBody
    : textToHtml(replyBody);

  const me = "you@cirkle.mail";
  // To = original sender (and cc preserved)
  const toEmails = original.fromEmail;
  const ccEmails = original.ccEmails;
  const subject = original.subject.toLowerCase().startsWith("re:")
    ? original.subject
    : "Re: " + original.subject;

  const created = await db.email.create({
    data: {
      threadId: original.threadId,
      fromName: "You",
      fromEmail: me,
      toEmails,
      ccEmails,
      bccEmails: "",
      subject,
      body: html,
      snippet: makeSnippet(html),
      date: new Date(),
      isRead: true,
      isStarred: original.isStarred,
      isImportant: false,
      folder: "SENT",
      labels: original.labels,
      hasAttachment: !!body?.attachmentName,
      attachmentName: (body?.attachmentName as string) ?? "",
    },
  });

  // mark original as read
  await db.email.update({ where: { id }, data: { isRead: true } });

  return NextResponse.json({ email: created });
}
