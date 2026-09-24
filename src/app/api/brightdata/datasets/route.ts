/**
 * POST /api/brightdata/datasets
 * -----------------------------------------------------------------------------
 * Trigger a BrightData dataset snapshot + bulk-ingest the rows into the
 * search index (CrawlQueue → indexer → Document rows).
 *
 * Body: { datasetId: string, maxRows?: number }
 *
 * SECURITY (P0-1): requires BRIGHTDATA_OPERATOR_TOKEN + Bearer auth.
 * Zero-cost guarantee: respects the budget guard. Returns 503 with
 * `code: 'budget_exhausted'` if the daily/monthly cap is hit.
 */
import { NextResponse } from 'next/server'
import { brightDataDatasetTrigger, getBudgetSnapshot } from '@/lib/brightdata'
import {
  requireOperator,
  sanitizeBrightDataError,
} from '@/lib/brightdata-auth'
import { db } from '@/lib/db'
import { canonicalizeUrl, extractDomain } from '@/lib/search/canonical'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  // --- Auth + rate limit (P0-1) ---
  const authFail = requireOperator(req)
  if (authFail) {
    return NextResponse.json(authFail.body, { status: authFail.status })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const datasetId: string | undefined = body?.datasetId
  if (!datasetId || typeof datasetId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(datasetId)) {
    return NextResponse.json(
      { error: 'missing_or_invalid_datasetId' },
      { status: 400 },
    )
  }
  const maxRows: number = Math.min(
    Math.max(1, parseInt(body?.maxRows ?? '500', 10)),
    5000,
  )

  const result = await brightDataDatasetTrigger(datasetId, { maxRows })
  if (!result.ok) {
    return NextResponse.json(
      {
        error: 'dataset_failed',
        code: sanitizeBrightDataError(result.error),
        snapshotId: result.snapshotId,
        budget: getBudgetSnapshot(),
      },
      { status: 503 },
    )
  }

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
