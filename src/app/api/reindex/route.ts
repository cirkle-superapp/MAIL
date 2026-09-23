import { NextRequest, NextResponse } from 'next/server'
import { reindexAll } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST() {
  try {
    const result = await reindexAll()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}
