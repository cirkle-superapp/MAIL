/**
 * GET /api/trending — top N most-frequent queries from the QueryLog.
 * Used by the "Trending searches" section on the home page.
 *
 * Resp: { trending: [{ query: string, frequency: number }] }
 */
import { NextResponse } from 'next/server'
import { getTrendingSearches } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const trending = await getTrendingSearches(8)
    return NextResponse.json({ trending }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch {
    return NextResponse.json({ trending: [] })
  }
}
