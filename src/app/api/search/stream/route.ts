/**
 * GET /api/search/stream — SSE streaming search (§11 speed, §22 architecture).
 *
 * Returns results progressively via Server-Sent Events:
 *   1. event: results    — initial organic results (fast, ~0.1s)
 *   2. event: instant     — instant answer (weather/time/math, if applicable)
 *   3. event: ai_answer   — AI summary with citations (lazy, ~5-15s)
 *   4. event: knowledge    — knowledge card (lazy)
 *   5. event: related      — related questions (lazy)
 *   6. event: done         — stream complete
 *
 * The frontend can use EventSource to consume this stream, rendering results
 * immediately and updating with AI content as it arrives.
 *
 * Query params: q, mode, ai, pers, safe, diversity, freshness, src, page, pageSize
 */
import { NextRequest } from 'next/server'
import { search, generateAILayer, type SearchMode, type SearchFilters } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const query = (params.get('q') ?? '').trim()
  const mode = (params.get('mode') ?? 'BALANCED') as SearchMode
  const aiMode = (params.get('ai') ?? 'AUTO') as 'AUTO' | 'ON' | 'OFF'
  const personalization = (params.get('pers') ?? 'OFF') as 'ON' | 'OFF'
  const safeSearch = (params.get('safe') ?? 'ON') as 'ON' | 'OFF'
  const domainDiversity = Number(params.get('diversity') ?? 2) as 0 | 1 | 2 | 3
  const page = Math.max(1, Number(params.get('page') ?? 1))
  const pageSize = Math.max(1, Math.min(50, Number(params.get('pageSize') ?? 10)))

  if (!query) {
    return new Response('data: {"error":"Query is required"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 400,
    })
  }

  const filters: SearchFilters = {
    freshness: 'ANY',
    sourceTypes: [],
    domainDiversity,
    aiMode,
    personalization,
    safeSearch,
    page,
    pageSize,
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // Phase 1: Initial search (fast — ~0.1s)
        const resp = await search(query, mode, filters, { personalization })
        send('results', {
          query: resp.query,
          interpretedQuery: resp.interpretedQuery,
          results: resp.results,
          sponsored: resp.sponsored,
          clusters: resp.clusters,
          pagination: resp.pagination,
          didYouMean: resp.didYouMean,
          instantAnswer: resp.instantAnswer,
          liveWebResults: resp.liveWebResults,
          indexStats: resp.indexStats,
        })

        // Phase 2: AI layer (lazy — ~5-15s)
        if (aiMode !== 'OFF' && resp.results.length > 0) {
          const aiLayer = await generateAILayer(query, mode, filters, resp.results)
          if (aiLayer.aiAnswer) send('ai_answer', aiLayer.aiAnswer)
          if (aiLayer.knowledgeCard) send('knowledge', aiLayer.knowledgeCard)
          if (aiLayer.relatedQuestions?.length > 0) send('related', aiLayer.relatedQuestions)
        }

        send('done', { query })
      } catch (err: any) {
        send('error', { message: String(err?.message ?? err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
