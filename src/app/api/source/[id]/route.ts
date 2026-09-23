/**
 * GET /api/source/[id]
 *
 * Source profile (§16). Shows publisher, source type, country, language,
 * first indexed, last crawled, last update, original-source status, content
 * categories, related primary sources, documents-in-index count.
 *
 * Resp: SourceProfile
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSource } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { error: 'Source id required' },
      { status: 400 },
    )
  }
  try {
    const profile = await getSource(id)
    if (!profile) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 },
      )
    }
    return NextResponse.json(profile, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch (err: any) {
    console.error('[/api/source] error:', err)
    return NextResponse.json(
      { error: 'Failed to load source profile' },
      { status: 500 },
    )
  }
}
