/**
 * POST /api/search/ai — lazy AI layer.
 *
 * Called by the frontend AFTER results render. Returns the AI summary,
 * knowledge card, and related questions. Running these separately means the
 * main /api/search responds in ~1s (results + instant answer), and the AI
 * streams in after — fixing the "13 seconds before anything shows" problem.
 *
 * Body: { query, mode, filters, results: SearchResult[] }
 * Resp: { aiAnswer, knowledgeCard, relatedQuestions }
 */
import { NextRequest, NextResponse } from 'next/server'
import { generateAILayer, type SearchResult } from '@/lib/search'
import type { SearchMode, SearchFilters } from '@/lib/search/ranking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const query = typeof body?.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  const mode: SearchMode = body?.mode ?? 'BALANCED'
  const filters = body?.filters ?? {}
  const results = Array.isArray(body?.results) ? body.results : []

  try {
    const layer = await generateAILayer(query, mode, filters as SearchFilters, results as SearchResult[])
    return NextResponse.json(layer, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[/api/search/ai] error:', err)
    // Graceful failure per §56 — return nulls instead of 500
    return NextResponse.json({
      aiAnswer: null,
      knowledgeCard: null,
      relatedQuestions: [],
      error: 'AI layer failed — try enabling AI in settings',
    }, { status: 200 })
  }
}
