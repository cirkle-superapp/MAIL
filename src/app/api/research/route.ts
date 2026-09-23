/**
 * POST /api/research
 *
 * Deep Research pipeline (§28). Body { question, depth?: 'standard'|'deep' }.
 *
 * Steps executed server-side:
 *   query decomposition (LLM)
 *   → multiple searches (own index via search())
 *   → source classification
 *   → cross-checking
 *   → evidence collection
 *   → conflict detection
 *   → synthesis (LLM)
 *   → citation generation
 *
 * Resp: ResearchReport
 */
import { NextRequest, NextResponse } from 'next/server'
import { generateResearchReport } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // Vercel hobby plan limit

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return NextResponse.json(
      { error: 'Question is required' },
      { status: 400 },
    )
  }
  if (question.length > 1000) {
    return NextResponse.json(
      { error: 'Question too long (max 1000 chars)' },
      { status: 400 },
    )
  }

  const depth: 'standard' | 'deep' =
    body?.depth === 'deep' ? 'deep' : 'standard'

  try {
    const report = await generateResearchReport(question, depth)
    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[/api/research] error:', err)
    return NextResponse.json(
      {
        question,
        subQueries: [],
        steps: [
          { step: 'query_decomposition', status: 'failed' },
          { step: 'search', status: 'pending' },
          { step: 'synthesis', status: 'pending' },
        ],
        executiveSummary:
          'I found relevant sources, but the evidence is insufficient to provide a reliable conclusion.',
        keyFindings: [],
        evidence: [],
        contradictions: [],
        limitations: String(err?.message ?? err),
        sources: [],
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }, // graceful failure per §56
    )
  }
}
