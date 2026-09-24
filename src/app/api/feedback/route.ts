/**
 * POST /api/feedback
 * -----------------------------------------------------------------------------
 * Collect 👍/👎 / spam / irrelevant votes on individual search results.
 *
 * Body:
 *   {
 *     query: string,
 *     docId: string,
 *     docUrl: string,
 *     vote: 'up' | 'down' | 'spam' | 'irrelevant',
 *     reason?: string,
 *     sessionId?: string,
 *   }
 *
 * The feedback is used to:
 *   - Identify the "right" result for a query (relevance tuning)
 *   - Detect spam/low-quality results that slipped past the spam engine
 *   - Train a future Learning-to-Rank model
 *
 * Auth: NO operator token required — this is a public endpoint (users submit
 * votes). But per-IP rate limiting applies (30/min — same as search).
 */
import { NextResponse, NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, getClientIP } from '@/lib/search/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALLOWED_VOTES = new Set(['up', 'down', 'spam', 'irrelevant'])

export async function POST(req: NextRequest) {
  // --- Rate limit (same per-IP budget as search) ---
  const ip = getClientIP(req)
  const rl = checkRateLimit(`feedback:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: Math.ceil(rl.retryAfterMs / 1000) },
      { status: 429 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const query: string | undefined = body?.query
  const docId: string | undefined = body?.docId
  const docUrl: string | undefined = body?.docUrl
  const vote: string | undefined = body?.vote

  if (!query || typeof query !== 'string' || query.length > 500) {
    return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
  }
  if (!docId || typeof docId !== 'string') {
    return NextResponse.json({ error: 'invalid_docId' }, { status: 400 })
  }
  if (!docUrl || typeof docUrl !== 'string' || !docUrl.startsWith('http')) {
    return NextResponse.json({ error: 'invalid_docUrl' }, { status: 400 })
  }
  if (!vote || !ALLOWED_VOTES.has(vote)) {
    return NextResponse.json({ error: 'invalid_vote' }, { status: 400 })
  }

  const reason: string | null =
    typeof body?.reason === 'string' && body.reason.length <= 1000
      ? body.reason.slice(0, 1000)
      : null
  const sessionId: string | null =
    typeof body?.sessionId === 'string' && body.sessionId.length <= 64
      ? body.sessionId.slice(0, 64)
      : null

  try {
    const row = await db.searchFeedback.create({
      data: {
        query: query.slice(0, 500),
        docId: docId.slice(0, 64),
        docUrl: docUrl.slice(0, 2048),
        vote,
        reason,
        sessionId,
      },
    })
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json(
      { error: 'persist_failed', detail: e?.message ?? String(e) },
      { status: 500 },
    )
  }
}

/**
 * GET /api/feedback?query=...&docId=...
 * Returns aggregated feedback for a query or doc (for the UI to show
 * "12 people found this result helpful" — but only if there's enough data).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const query = url.searchParams.get('query')
  const docId = url.searchParams.get('docId')
  if (!query && !docId) {
    return NextResponse.json(
      { error: 'missing_query_or_docId' },
      { status: 400 },
    )
  }
  const where: any = {}
  if (query) where.query = query
  if (docId) where.docId = docId
  const rows = await db.searchFeedback.findMany({
    where,
    select: { vote: true, createdAt: true },
    take: 1000,
  })
  const tally = { up: 0, down: 0, spam: 0, irrelevant: 0 }
  for (const r of rows) {
    tally[r.vote as keyof typeof tally] = (tally[r.vote as keyof typeof tally] ?? 0) + 1
  }
  return NextResponse.json({
    total: rows.length,
    tally,
    net: tally.up - tally.down - tally.spam - tally.irrelevant,
  })
}
