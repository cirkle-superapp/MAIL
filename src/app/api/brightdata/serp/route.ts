/**
 * POST /api/brightdata/serp
 * -----------------------------------------------------------------------------
 * Manual BrightData SERP API test endpoint — used by ops/COO to verify
 * the BrightData integration is wired correctly.
 *
 * Body: { query: string, num?: number }
 * Returns: BrightDataSerpResult[] or { error: 'budget_exhausted', ... }
 *
 * Auth: optional BRIGHTDATA_OPERATOR_TOKEN env. If unset, open in dev.
 */
import { NextResponse } from 'next/server'
import { brightDataSerp, getBudgetSnapshot, isBrightDataSerpWorthIt } from '@/lib/brightdata'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const query: string | undefined = body?.query
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'missing_query' }, { status: 400 })
  }
  const num: number = Math.min(Math.max(1, parseInt(body?.num ?? '8', 10)), 10)

  const results = await brightDataSerp(query, { num })
  if (!results) {
    return NextResponse.json(
      {
        error: 'brightdata_unavailable',
        budget: getBudgetSnapshot(),
        worthIt: isBrightDataSerpWorthIt(query, 0),
      },
      { status: 503 },
    )
  }

  return NextResponse.json({
    ok: true,
    query,
    count: results.length,
    results,
    budget: getBudgetSnapshot(),
  })
}
