/**
 * GET /api/stats
 *
 * Search engine health dashboard mini-endpoint (§50). Used by the
 * IndexStatusBar component in the footer.
 *
 * Resp: { documents, domains, queueDepth, lastCrawl, crawlErrors, indexSize }
 */
import { NextResponse } from 'next/server'
import { getStats, prewarmIndex } from '@/lib/search'
import { initNeonSchema } from '@/lib/neon'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Pre-warm the index + stats cache in the background on the first stats
    // call (which happens on every page load). This makes the first search
    // fast by loading the index into memory before the user searches.
    void prewarmIndex()
    // Initialize Neon schema (persistent cache + analytics tables).
    void initNeonSchema()
    const stats = await getStats()
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[/api/stats] error:', err)
    return NextResponse.json(
      {
        documents: 0,
        domains: 0,
        queueDepth: 0,
        lastCrawl: null,
        crawlErrors: 0,
        indexSize: 0,
      },
      { status: 500 },
    )
  }
}
