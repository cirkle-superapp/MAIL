/**
 * GET /api/insights
 * -----------------------------------------------------------------------------
 * Operator-facing insights endpoint — surfaces what's happening in the
 * search engine in real time. Useful for:
 *   - Operators: what are users searching for?
 *   - SEO/Marketing: what content should we add to the index?
 *   - Product: which tools are popular? Which queries fail?
 *
 * Query params:
 *   ?range=hour|day|week|month (default: day)
 *
 * Returns:
 *   {
 *     topQueries: [{ query, frequency, lastUsedAt }],
 *     topDomains: [{ domain, docCount, avgQuality }],
 *     zeroResultQueries: [{ query, frequency }],  // queries that returned 0
 *     toolUsage: { weather: N, time: N, math: N, convert: N },
 *     trending: [{ query, frequencyDelta }],  // growing in popularity
 *     indexGrowth: [{ date, docCount }]  // last N days
 *   }
 *
 * Auth: optional BRIGHTDATA_OPERATOR_TOKEN — required because this surfaces
 * what real users are searching for.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireOperator } from '@/lib/brightdata-auth'
import { getMetrics } from '@/lib/search/metrics'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  // --- Auth — same operator token as BrightData endpoints ---
  const authFail = requireOperator(req)
  if (authFail) {
    return NextResponse.json(authFail.body, { status: authFail.status })
  }

  const url = new URL(req.url)
  const range = url.searchParams.get('range') || 'day'
  // Convert range → SQL date filter
  const days = range === 'hour' ? 0.04 : range === 'day' ? 1 : range === 'week' ? 7 : 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // --- Top queries (from QueryLog) ---
  const topQueries = await db.queryLog.findMany({
    where: { lastUsedAt: { gte: since } },
    orderBy: { frequency: 'desc' },
    take: 20,
  }).catch(() => [])

  // --- Top domains by doc count ---
  const topDomainsRaw = await db.document.groupBy({
    by: ['domain'],
    _count: { id: true },
    _avg: { qualityScore: true },
    orderBy: { _count: { id: 'desc' } },
    take: 15,
  }).catch(() => [])

  const topDomains = topDomainsRaw.map((d: any) => ({
    domain: d.domain,
    docCount: d._count?.id ?? 0,
    avgQuality: Math.round((d._avg?.qualityScore ?? 0) * 100) / 100,
  }))

  // --- Zero-result queries (from SearchHistory where resultCount = 0) ---
  const zeroResultRaw = await db.searchHistory.findMany({
    where: { resultCount: 0, searchedAt: { gte: since } },
    select: { query: true },
    take: 200,
  }).catch(() => [])
  // Aggregate by query frequency
  const zeroMap = new Map<string, number>()
  for (const r of zeroResultRaw) {
    zeroMap.set(r.query, (zeroMap.get(r.query) ?? 0) + 1)
  }
  const zeroResultQueries = Array.from(zeroMap.entries())
    .map(([query, frequency]) => ({ query, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)

  // --- Tool usage + recent queries (from metrics) ---
  const metrics = await getMetrics().catch(() => null)

  // --- Trending: queries whose frequency grew most in the last 24h
  // (compared to the previous 24h window).
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  const recentQueries = await db.queryLog.findMany({
    where: { lastUsedAt: { gte: yesterday } },
    select: { query: true, frequency: true, lastUsedAt: true },
    take: 100,
  }).catch(() => [])
  // Compute "trending" as queries with high frequency that have been used
  // recently. (A real trending algo would need a time-series — this is a
  // simple proxy.)
  const trending = recentQueries
    .filter((q: any) => q.lastUsedAt && new Date(q.lastUsedAt) > since)
    .sort((a: any, b: any) => b.frequency - a.frequency)
    .slice(0, 10)
    .map((q: any) => ({ query: q.query, frequency: q.frequency }))

  // --- Index growth (last N days, by crawledAt) ---
  const indexGrowthRaw = await db.document.findMany({
    where: { crawledAt: { gte: since } },
    select: { crawledAt: true },
    orderBy: { crawledAt: 'asc' },
  }).catch(() => [])
  // Bucket by day
  const dayMap = new Map<string, number>()
  for (const d of indexGrowthRaw) {
    const day = new Date(d.crawledAt).toISOString().slice(0, 10)
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1)
  }
  const indexGrowth = Array.from(dayMap.entries())
    .map(([date, docCount]) => ({ date, docCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return NextResponse.json({
    range,
    topQueries: topQueries.map((q: any) => ({
      query: q.query,
      frequency: q.frequency,
      lastUsedAt: q.lastUsedAt?.toISOString(),
    })),
    topDomains,
    zeroResultQueries,
    toolUsage: metrics?.tools ?? {},
    trending,
    indexGrowth,
    recent: metrics?.recent ?? [],
    summary: {
      totalUniqueQueries: topQueries.length,
      totalSearches: metrics?.searches?.total ?? 0,
      avgLatencyMs: metrics?.latency?.avg ?? 0,
      p95LatencyMs: metrics?.latency?.p95 ?? 0,
      zeroResultRate: metrics?.searches?.zeroResultRate ?? 0,
      indexDocCount: topDomains.reduce((s: number, d: any) => s + d.docCount, 0),
    },
  })
}
