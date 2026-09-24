/**
 * POST /api/brightdata/scrape
 * -----------------------------------------------------------------------------
 * Trigger a one-off Scraping Browser fetch of any URL via BrightData.
 * Returns the rendered HTML + the final URL. Optionally ingests the result
 * into the search index.
 *
 * Body: { url: string, ingest?: boolean, waitForSelector?: string, timeoutMs?: number }
 *
 * SECURITY (P0-1):
 *   - Requires BRIGHTDATA_OPERATOR_TOKEN env var + Bearer auth header.
 *   - URL is validated against an SSRF allow-list (blocks private networks).
 *   - Per-IP rate limit applied via `requireOperator()` middleware.
 *
 * Returns 503 with `code: 'budget_exhausted'` if the daily/monthly cap is hit.
 */
import { NextResponse } from 'next/server'
import {
  brightDataScrapingBrowserFetch,
  getBudgetSnapshot,
} from '@/lib/brightdata'
import {
  requireOperator,
  isSafeScrapeTarget,
  sanitizeBrightDataError,
} from '@/lib/brightdata-auth'

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
  const url: string | undefined = body?.url
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.json({ error: 'missing_or_invalid_url' }, { status: 400 })
  }

  // --- SSRF block (P0-1) ---
  const safeCheck = isSafeScrapeTarget(url)
  if (!safeCheck.ok) {
    return NextResponse.json(
      { error: safeCheck.reason ?? 'url_blocked' },
      { status: 400 },
    )
  }

  const shouldIngest: boolean = body?.ingest === true
  const waitForSelector: string | null =
    typeof body?.waitForSelector === 'string' ? body.waitForSelector : null
  const timeoutMs: number = Math.min(
    Math.max(5_000, parseInt(body?.timeoutMs ?? '30000', 10)),
    60_000,
  )

  const result = await brightDataScrapingBrowserFetch(url, {
    timeoutMs,
    waitForSelector: waitForSelector ?? undefined,
  })

  if (!result || !result.ok) {
    // P3-2: sanitized error code (no internal BrightData structure leaked)
    return NextResponse.json(
      {
        error: 'scrape_failed',
        code: sanitizeBrightDataError(result?.error),
        url,
        budget: getBudgetSnapshot(),
      },
      { status: 503 },
    )
  }

  const responseBody: any = {
    ok: true,
    url,
    finalUrl: result.finalUrl,
    status: result.status,
    contentType: result.contentType,
    htmlBytes: result.content.length,
    htmlPreview: result.content.slice(0, 500),
    budget: getBudgetSnapshot(),
  }

  if (shouldIngest) {
    try {
      const { indexDocumentFromCrawl } = await import('@/lib/search/index')
      const ingestResult = await indexDocumentFromCrawl(
        url,
        result.content,
        result.finalUrl,
        result.contentType,
      )
      responseBody.ingested = ingestResult
    } catch (e: any) {
      responseBody.ingested = { error: 'ingest_failed' }
    }
  }

  return NextResponse.json(responseBody)
}
