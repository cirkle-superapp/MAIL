/**
 * GET /api/brightdata/snapshot/[id]?ingest=1
 * -----------------------------------------------------------------------------
 * Fetch a BrightData snapshot's content and (optionally) ingest it into the
 * search index.
 *
 * Path param: snapshot ID (e.g., sd_muekxkd22g0pfuwdnd)
 * Query param: ?ingest=1  → also run the content through the indexer pipeline
 *                            (canonicalize → parseHtml → classifySource →
 *                            quality+spam+dedup → Document upsert → postings
 *                            → Link rows). Default = 0 (just return content).
 *
 * Returns: {
 *   ok, snapshotId, url, title, markdown, html2text, pageHtml, timestamp,
 *   ingested?: { ok, error?, docId? }
 *   budget: { ... }
 * }
 *
 * Auth: optional BRIGHTDATA_OPERATOR_TOKEN env. If unset, open in dev.
 */
import { NextResponse } from 'next/server'
import { brightDataSnapshotFetch, getBudgetSnapshot } from '@/lib/brightdata'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: snapshotId } = await params
  if (!snapshotId) {
    return NextResponse.json(
      { error: 'missing_snapshot_id' },
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
        detail: snap.error,
        snapshotId: snap.snapshotId,
        budget: getBudgetSnapshot(),
      },
      { status: 503 },
    )
  }

  // Strip the heavy fields from the response by default — they can be huge
  // (170KB+ for a single page). Only include them if the caller asks via
  // ?full=1.
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
      responseBody.ingested = {
        error: e?.message ?? String(e),
      }
    }
  }

  return NextResponse.json(responseBody)
}
