import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Get counts per folder, plus starred/important counts, plus label counts
export async function GET() {
  const all = await db.email.findMany({
    select: {
      id: true,
      folder: true,
      isRead: true,
      isStarred: true,
      isImportant: true,
      labels: true,
    },
  });

  const counts: Record<string, number> = {
    INBOX: 0,
    SENT: 0,
    DRAFTS: 0,
    TRASH: 0,
    SPAM: 0,
    ARCHIVE: 0,
    STARRED: 0,
    IMPORTANT: 0,
  };
  const unreadByFolder: Record<string, number> = {
    INBOX: 0,
    SENT: 0,
    DRAFTS: 0,
    TRASH: 0,
    SPAM: 0,
    ARCHIVE: 0,
  };
  const labelCounts: Record<string, number> = {};

  for (const e of all) {
    if (counts[e.folder] !== undefined) counts[e.folder] += 1;
    if (!e.isRead && unreadByFolder[e.folder] !== undefined)
      unreadByFolder[e.folder] += 1;
    if (e.isStarred && ["INBOX", "SENT", "DRAFTS", "ARCHIVE"].includes(e.folder))
      counts.STARRED += 1;
    if (e.isImportant && ["INBOX", "SENT", "ARCHIVE"].includes(e.folder))
      counts.IMPORTANT += 1;
    if (e.labels) {
      for (const label of e.labels.split(",").map((s) => s.trim()).filter(Boolean)) {
        labelCounts[label] = (labelCounts[label] ?? 0) + 1;
      }
    }
  }

  return NextResponse.json({ counts, unreadByFolder, labelCounts });
}
