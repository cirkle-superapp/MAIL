/**
 * GET /api/brightdata/snapshot/[id]?ingest=1
 * -----------------------------------------------------------------------------
 * Fetch a BrightData snapshot's content and (optionally) ingest it into the
 * search index.
 *
 * Path param: snapshot ID (e.g., sd_muekxkd22g0pfuwdnd)
 * Query param: ?ingest=1  → run content through the indexer pipeline.
 *              ?full=1    → include full markdown + html2text + pageHtml in
 *                           the response (otherwise just previews).
 *
 * SECURITY (P0-1): requires BRIGHTDATA_OPERATOR_TOKEN + Bearer auth.
 *
 * Returns: { ok, snapshotId, url, title, ..., budget }
 */
import { NextResponse } from 'next/server'
import { brightDataSnapshotFetch, getBudgetSnapshot } from '@/lib/brightdata'
import {
  requireOperator,
  sanitizeBrightDataError,
} from '@/lib/brightdata-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // --- Auth + rate limit (P0-1) ---
  const authFail = requireOperator(req)
  if (authFail) {
    return NextResponse.json(authFail.body, { status: authFail.status })
  }

  const { id: snapshotId } = await params
  if (!snapshotId || !/^[a-zA-Z0-9_]+$/.test(snapshotId)) {
    // Path-param validation — don't accept arbitrary characters.
    return NextResponse.json(
      { error: 'invalid_snapshot_id' },
      { status: 400 },
    )
  }

  const url = new URL(req.url)
  const shouldIngest = url.searchParams.get('ingest') === '1'

  const snap = await brightDataSnapshotFetch(snapshotId)
  if (!snap.ok) {
    return NextResponse.json(
      {
        error: 'snapshot_failed',
        code: sanitizeBrightDataError(snap.error),
        snapshotId: snap.snapshotId,
        budget: getBudgetSnapshot(),
      },
      { status: 503 },
    )
  }

  const full = url.searchParams.get('full') === '1'
  const responseBody: any = {
    ok: true,
    snapshotId: snap.snapshotId,
    url: snap.url,
    title: snap.title,
    timestamp: snap.timestamp,
    markdownPreview: snap.markdown ? snap.markdown.slice(0, 500) : null,
    html2textPreview: snap.html2text ? snap.html2text.slice(0, 500) : null,
    pageHtmlBytes: snap.pageHtml ? snap.pageHtml.length : 0,
    budget: getBudgetSnapshot(),
  }
  if (full) {
    responseBody.markdown = snap.markdown
    responseBody.html2text = snap.html2text
    responseBody.pageHtml = snap.pageHtml
  }

  if (shouldIngest && snap.pageHtml && snap.url) {
    try {
      const { indexDocumentFromCrawl } = await import('@/lib/search/index')
      const result = await indexDocumentFromCrawl(
        snap.url,
        snap.pageHtml,
        snap.url,
        'text/html',
      )
      responseBody.ingested = result
    } catch (e: any) {
      responseBody.ingested = { error: 'ingest_failed' }
    }
  }

  return NextResponse.json(responseBody)
}
