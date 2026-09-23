/**
 * POST /api/page-summary — AI page reader / summarizer.
 *
 * Body: { docId: string }
 * Resp: PageSummary (tldr, keyPoints, notableFacts, summary, readingTimeMinutes)
 *
 * This is the "advanced browser" feature: the user clicks "Summary" on a
 * result, and CIRKLE reads the page's stored contentText from the index +
 * synthesizes a structured summary with the LLM. The user can understand
 * any page without leaving CIRKLE.
 */
import { NextRequest, NextResponse } from 'next/server'
import { summarizePage } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const docId = typeof body?.docId === 'string' ? body.docId : ''
  if (!docId) {
    return NextResponse.json({ error: 'docId is required' }, { status: 400 })
  }

  try {
    const summary = await summarizePage(docId)
    if (!summary) {
      return NextResponse.json({
        error: 'Page content not available for summarization.',
        tldr: null,
      }, { status: 200 })
    }
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[/api/page-summary] error:', err)
    return NextResponse.json({
      error: 'Summarization failed',
      tldr: null,
    }, { status: 200 })
  }
}
