/**
 * POST /api/search/coverage
 * -----------------------------------------------------------------------------
 * Compute the Coverage Matrix for a query + its top-N results.
 *
 * Body: { query: string, results: [{id, title, snippet, url}] }
 *
 * Returns: { aspects: string[], matrix: [{aspect, scores: number[]}] }
 *
 * The aspects are decomposed by the LLM (decomposeQuery) — 3-5 sub-aspects
 * that a comprehensive answer should cover. The matrix scores each result
 * per-aspect (BM25-like against snippet + title, normalized so the top
 * result per aspect gets 1.0).
 *
 * The endpoint is called lazily by the CoverageMatrix UI component when the
 * user expands the matrix. Caches the aspects for 5 min per query.
 */
import { NextResponse } from 'next/server'
import { decomposeQuery, computeCoverageMatrix } from '@/lib/search/ai-search'
import { checkRateLimit, getClientIP } from '@/lib/search/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// In-memory aspects cache (query → aspects) — 5-min TTL.
const ASPECTS_CACHE = new Map<string, { aspects: string[] | null; expiresAt: number }>()
const ASPECTS_TTL_MS = 5 * 60_000

export async function POST(req: Request) {
  // Rate limit (same as /api/search).
  const ip = getClientIP(req)
  const rl = checkRateLimit(`coverage:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfter: Math.ceil(rl.retryAfterMs / 1000) },
      { status: 429 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const query: string | undefined = body?.query
  const results: any[] | undefined = body?.results
  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'missing_query' }, { status: 400 })
  }
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'missing_results' }, { status: 400 })
  }

  // Cache check for aspects (LLM call is expensive).
  const cacheKey = query.trim().toLowerCase()
  const cached = ASPECTS_CACHE.get(cacheKey)
  let aspects: string[] | null = null
  if (cached && cached.expiresAt > Date.now()) {
    aspects = cached.aspects
  } else {
    aspects = await decomposeQuery(query)
    ASPECTS_CACHE.set(cacheKey, { aspects, expiresAt: Date.now() + ASPECTS_TTL_MS })
  }

  if (!aspects || aspects.length === 0) {
    return NextResponse.json({
      aspects: [],
      matrix: [],
      note: 'Query too short or LLM unavailable — no aspects decomposed.',
    })
  }

  // Compute the coverage matrix.
  const matrixRaw = await computeCoverageMatrix(aspects, results.slice(0, 5))
  const matrix = aspects.map((aspect, i) => ({
    aspect,
    scores: matrixRaw[i] ?? [],
  }))

  return NextResponse.json({ aspects, matrix })
}
