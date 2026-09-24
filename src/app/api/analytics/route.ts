import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { neon, neonConfig } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

// Use fetch for pool-style queries over HTTP (Neon serverless driver).
neonConfig.poolQueryViaFetch = true;

// GET /api/analytics — personal communication analytics (§41).
// Visibility, not gamification: response load, unanswered, overdue commitments,
// volume trend, top correspondents.
//
// Architecture: when NEON_DATABASE_URL is set, the heavy aggregations are pushed
// down to Neon (PostgreSQL) — Postgres's query planner handles the GROUP BY /
// FILTER / date-truncation natively, which is faster than pulling 500 rows into
// the Node process. When the env var is unset (local dev, CI), the route falls
// back to the original Prisma/Turso implementation that computes the same
// metrics in JS. The response shape is identical either way (only the `source`
// field differs), so the AnalyticsView frontend works in both modes.

async function neonAnalytics() {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  const SELF = "you@cirkle.mail";
  const FOLDERS = ["INBOX", "SENT", "ARCHIVE"];

  // Totals: received / sent / unread / needs-reply in one pass over Email.
  // We use COUNT(*) FILTER to branch on direction without a subquery.
  const totalsRows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE "fromEmail" <> ${SELF}) AS received,
      COUNT(*) FILTER (WHERE "fromEmail" = ${SELF}) AS sent,
      COUNT(*) FILTER (WHERE "isRead" = false AND "folder" = 'INBOX') AS unread,
      COUNT(*) FILTER (WHERE "intent" = 'REQUIRES_REPLY') AS needsreply
    FROM "Email"
    WHERE "folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
  `;
  const t = totalsRows[0] ?? {};

  // Top correspondents (excluding self), by count, capped at 8.
  const topRows = await sql`
    SELECT "fromEmail", "fromName", COUNT(*) AS count, MAX("date") AS last
    FROM "Email"
    WHERE "folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
      AND "fromEmail" <> ${SELF}
    GROUP BY "fromEmail", "fromName"
    ORDER BY count DESC
    LIMIT 8
  `;
  const topCorrespondents = topRows.map((r) => ({
    name: r.fromName,
    count: Number(r.count),
    lastInteraction: new Date(r.last).toISOString(),
  }));

  // Volume trend — last 14 days, zero-filled via generate_series.
  // We LEFT JOIN the day series against Email so days with no mail still
  // appear with received=0/sent=0 (matches the Prisma path's output).
  const volumeRows = await sql`
    WITH days AS (
      SELECT to_char(
        generate_series(
          date_trunc('day', NOW() - INTERVAL '13 days'),
          date_trunc('day', NOW()),
          INTERVAL '1 day'
        ),
        'YYYY-MM-DD'
      ) AS day
    )
    SELECT
      d.day,
      COUNT(e."id") FILTER (WHERE e."fromEmail" <> ${SELF}) AS received,
      COUNT(e."id") FILTER (WHERE e."fromEmail" = ${SELF}) AS sent
    FROM days d
    LEFT JOIN "Email" e
      ON to_char(date_trunc('day', e."date"), 'YYYY-MM-DD') = d.day
      AND e."folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
    GROUP BY d.day
    ORDER BY d.day ASC
  `;
  const volumeByDay = volumeRows.map((r) => ({
    day: r.day,
    received: Number(r.received),
    sent: Number(r.sent),
  }));

  // Overdue commitments: incoming COMMITMENT older than 3 days with no sent
  // reply in the same thread. Mirrors the Prisma path's heuristic.
  const overdueRows = await sql`
    SELECT COUNT(DISTINCT e."id") AS count
    FROM "Email" e
    WHERE e."folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
      AND e."intent" = 'COMMITMENT'
      AND e."fromEmail" <> ${SELF}
      AND e."date" < NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM "Email" s
        WHERE s."threadId" = e."threadId"
          AND s."fromEmail" = ${SELF}
          AND s."folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
      )
  `;
  const overdueCommitments = Number(overdueRows[0]?.count ?? 0);

  // Intent distribution across the same folder set.
  const intentRows = await sql`
    SELECT "intent", COUNT(*) AS count
    FROM "Email"
    WHERE "folder" IN (${FOLDERS[0]}, ${FOLDERS[1]}, ${FOLDERS[2]})
      AND "intent" IS NOT NULL
      AND "intent" <> ''
    GROUP BY "intent"
  `;
  const intentDistribution: Record<string, number> = {};
  for (const r of intentRows) {
    intentDistribution[r.intent] = Number(r.count);
  }

  return {
    source: "neon" as const,
    totals: {
      received: Number(t.received ?? 0),
      sent: Number(t.sent ?? 0),
      unread: Number(t.unread ?? 0),
      needsReply: Number(t.needsreply ?? 0),
      overdueCommitments,
    },
    topCorrespondents,
    volumeByDay,
    intentDistribution,
  };
}

export async function GET() {
  try {
    // ── Neon branch: heavy aggregations pushed down to Postgres ──
    if (process.env.NEON_DATABASE_URL) {
      const result = await neonAnalytics();
      return NextResponse.json(result);
    }

    // ── Turso/Prisma fallback: compute the same metrics in JS ──
    const now = new Date();

    const emails = await db.email.findMany({
      where: { folder: { in: ["INBOX", "SENT", "ARCHIVE"] } },
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        date: true,
        isRead: true,
        intent: true,
        folder: true,
        body: true,
        threadId: true,
        labels: true,
      },
      orderBy: { date: "desc" },
      take: 500,
    });

    const isUser = (e: { fromEmail: string }) =>
      e.fromEmail.toLowerCase() === "you@cirkle.mail";

    const received = emails.filter((e) => !isUser(e));
    const sent = emails.filter((e) => isUser(e));
    const unread = emails.filter((e) => !e.isRead && e.folder === "INBOX");
    const needsReply = emails.filter((e) => e.intent === "REQUIRES_REPLY");

    // Top correspondents (by count, excluding self)
    const corrMap = new Map<string, { name: string; count: number; last: Date }>();
    for (const e of received) {
      const key = e.fromEmail;
      const existing = corrMap.get(key);
      if (existing) {
        existing.count += 1;
        if (e.date > existing.last) existing.last = e.date;
      } else {
        corrMap.set(key, { name: e.fromName, count: 1, last: e.date });
      }
    }
    const topCorrespondents = Array.from(corrMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Volume by day (last 14 days)
    const volumeByDay: Array<{ day: string; received: number; sent: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayStr = dayStart.toISOString().slice(0, 10);
      const dayReceived = received.filter(
        (e) => e.date >= dayStart && e.date < dayEnd
      ).length;
      const daySent = sent.filter(
        (e) => e.date >= dayStart && e.date < dayEnd
      ).length;
      volumeByDay.push({ day: dayStr, received: dayReceived, sent: daySent });
    }

    // Overdue commitments (deterministic: commitments with a due keyword that's
    // past, or all incoming commitments older than 3 days with no reply)
    let overdueCommitments = 0;
    for (const e of received) {
      if (e.intent === "COMMITMENT") {
        // if received > 3 days ago and no sent reply in the same thread, count as overdue
        const age = (now.getTime() - e.date.getTime()) / (24 * 60 * 60 * 1000);
        if (age > 3) {
          const hasReply = sent.some((s) => s.threadId === e.threadId);
          if (!hasReply) overdueCommitments += 1;
        }
      }
    }

    // Intent distribution
    const intentDist: Record<string, number> = {};
    for (const e of emails) {
      if (e.intent) intentDist[e.intent] = (intentDist[e.intent] ?? 0) + 1;
    }

    return NextResponse.json({
      source: "turso",
      totals: {
        received: received.length,
        sent: sent.length,
        unread: unread.length,
        needsReply: needsReply.length,
        overdueCommitments,
      },
      topCorrespondents: topCorrespondents.map((c) => ({
        name: c.name,
        count: c.count,
        lastInteraction: c.last.toISOString(),
      })),
      volumeByDay,
      intentDistribution: intentDist,
    });
  } catch (err) {
    console.error("[analytics] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
