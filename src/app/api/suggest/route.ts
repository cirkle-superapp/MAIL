/**
 * GET /api/suggest?q=<prefix>
 *
 * Autocomplete. Backed by the QueryLog table (aggregated query popularity)
 * plus rule-based completions. Per §40, this MUST NOT become a covert ad
 * surface — sponsored autocomplete is explicitly forbidden.
 *
 * Resp: { suggestions: string[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { suggest } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const trimmed = q.trim()
  if (!trimmed) {
    return NextResponse.json({ suggestions: [] })
  }
  if (trimmed.length > 100) {
    return NextResponse.json(
      { error: 'Prefix too long' },
      { status: 400 },
    )
  }
  try {
    const suggestions = await suggest(trimmed, 8)
    return NextResponse.json(
      { suggestions },
      {
        headers: {
          // Autocomplete can be cached briefly.
          'Cache-Control': 'public, max-age=30',
        },
      },
    )
  } catch (err: any) {
    console.error('[/api/suggest] error:', err)
    return NextResponse.json(
      { suggestions: [], error: 'Autocomplete failed' },
      { status: 500 },
    )
  }
}
