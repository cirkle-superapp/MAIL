/**
 * GET /api/metrics — structured observability (§66, §50).
 * Returns search-engine metrics: latency p50/p95/p99, cache hit rate,
 * zero-result rate, tool usage, AI layer latency, recent queries.
 */
import { NextResponse } from 'next/server'
import { getMetrics } from '@/lib/search/metrics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const metrics = await getMetrics()
  return NextResponse.json(metrics, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
