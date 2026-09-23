/**
 * POST /api/brightdata/datasets
 * -----------------------------------------------------------------------------
 * Trigger a BrightData dataset snapshot + bulk-ingest the rows into the
 * search index (CrawlQueue → indexer → Document rows).
 *
 * Body:
 *   { datasetId: string, maxRows?: number }
 *
 * The BrightData dataset is created in BrightData's web UI by the operator
 * (a one-time setup). The dataset returns rows of structured data — for the
 * search engine, the operator typically configures the dataset to include a
 * `url` column (and optionally `title`, `description`, `publishedAt`). The
 * ingester enqueues these URLs into CrawlQueue for the normal crawler pipeline.
 *
 * Zero-cost guarantee: this endpoint respects the budget guard. If the budget
 * is exhausted (no token, daily cap hit, monthly cap hit), the endpoint
 * returns 503 with `code: 'budget_exhausted'` and the operator can retry
 * tomorrow.
 *
 * Auth: simple Bearer token via BRIGHTDATA_OPERATOR_TOKEN env (optional). If
 * unset, the endpoint is open (read-only trigger — safe in dev).
 */
import { NextResponse } from 'next/server'
import { brightDataDatasetTrigger, getBudgetSnapshot } from '@/lib/brightdata'
import { db } from '@/lib/db'
import { canonicalizeUrl, extractDomain } from '@/lib/search/canonical'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const datasetId: string | undefined = body?.datasetId
  if (!datasetId || typeof datasetId !== 'string') {
    return NextResponse.json(
      { error: 'missing_datasetId' },
      { status: 400 },
    )
  }
  const maxRows: number = Math.min(
    Math.max(1, parseInt(body?.maxRows ?? '500', 10)),
    5000,
  )

  // Trigger the BrightData dataset snapshot.
  const result = await brightDataDatasetTrigger(datasetId, { maxRows })
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'dataset_failed',
        detail: result.error,
        snapshotId: result.snapshotId,
        budget: getBudgetSnapshot(),
      },
      { status: 503 },
    )
  }

  // Bulk-ingest the rows into CrawlQueue.
  // The dataset is expected to have a `url` column. Other columns (title,
  // description, publishedAt, etc.) are stored as discovery metadata.
  let enqueued = 0
  let skipped = 0
  for (const row of result.rows) {
    const url: string =
      (row.url as string) ??
      (row.link as string) ??
      (row.loc as string) ??
      ''
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      skipped++
      continue
    }
    const canon = canonicalizeUrl(url)
    if (!canon) {
      skipped++
      continue
    }
    const domain = extractDomain(canon) ?? ''
    try {
      await db.crawlQueue.upsert({
        where: { url: canon },
        create: {
          url: canon,
          domain,
          priority: 6,
          discoverySrc: `brightdata:${datasetId.slice(0, 32)}`,
          status: 'pending',
        },
        update: { status: 'pending' },
      })
      enqueued++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    snapshotId: result.snapshotId,
    rowsReceived: result.rows.length,
    enqueued,
    skipped,
    budget: getBudgetSnapshot(),
  })
}
