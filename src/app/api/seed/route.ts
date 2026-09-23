/**
 * POST /api/seed
 *
 * Trigger a real crawl + index run. Body { urls?: string[] } — if no URLs
 * supplied, uses the built-in SEED_URLS list (~45 high-quality URLs spanning
 * all source types). Respects robots.txt and per-domain throttling.
 *
 * Resp: { queued, crawled, indexed, errors: string[] }
 *
 * This endpoint is intentionally slow (it does real HTTP fetches). The frontend
 * fires it as a background task and shows a spinner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { seedCrawl, invalidateStatsCache, invalidateSearchCache, LARGE_SEED_URLS } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // allow up to 5 minutes for a seed run

const MAX_URLS_PER_REQUEST = 500

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — caller wants the built-in seed list
  }

  let urls: string[] | undefined
  if (Array.isArray(body?.urls)) {
    urls = (body.urls as unknown[])
      .filter((u): u is string => typeof u === 'string' && u.length > 0)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'))
      .slice(0, MAX_URLS_PER_REQUEST)
  } else if (body?.large === true) {
    // Use the large seed list (~300 URLs spanning all source types).
    urls = LARGE_SEED_URLS
  }

  try {
    const result = await seedCrawl(urls)
    // The index changed — invalidate the stats cache + search-result cache
    // so fresh results show immediately.
    invalidateStatsCache()
    invalidateSearchCache()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[/api/seed] error:', err)
    return NextResponse.json(
      {
        queued: 0,
        crawled: 0,
        indexed: 0,
        errors: [String(err?.message ?? err)],
      },
      { status: 500 },
    )
  }
}
