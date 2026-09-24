/**
 * GET /api/health
 * -----------------------------------------------------------------------------
 * Health-check endpoint for uptime monitoring + load balancer probes.
 *
 * Returns:
 *   {
 *     status: 'ok' | 'degraded' | 'down',
 *     checks: { db, brightdata, index },
 *     uptime, version, responseMs, timestamp
 *   }
 *
 * The endpoint is intentionally fast (<50ms) — uses cached stats from
 * the indexer, not a fresh DB query, except for a minimal ping check.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getBudgetSnapshot } from '@/lib/brightdata'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const start = Date.now()
  const checks: Record<string, any> = {}
  let overallStatus: 'ok' | 'degraded' | 'down' = 'ok'

  // --- DB check (fast ping) ---
  try {
    const t0 = Date.now()
    const docCount = await db.document.count()
    checks.db = { ok: true, latencyMs: Date.now() - t0, docCount }
  } catch (e: any) {
    checks.db = { ok: false, error: e?.message ?? String(e) }
    overallStatus = 'down'
  }

  // --- BrightData check ---
  try {
    const snap = getBudgetSnapshot()
    checks.brightdata = {
      ok: true,
      enabled: snap.enabled,
      scrapingBrowserConfigured: snap.scrapingBrowserConfigured,
      budgetRemaining: snap.dailyCap - snap.dailyCount,
      disabledKinds: snap.disabledKinds,
    }
    if (snap.enabled && snap.disabledKinds.length > 0) overallStatus = 'degraded'
  } catch (e: any) {
    checks.brightdata = { ok: false, error: e?.message ?? String(e) }
    overallStatus = 'degraded'
  }

  // --- Index check (uses cached doc count — no extra DB query) ---
  try {
    const { getDocCount } = await import('@/lib/search/indexer')
    const docCount = await getDocCount()
    checks.index = { ok: true, docCount, empty: docCount === 0 }
    if (docCount === 0) overallStatus = 'degraded'
  } catch (e: any) {
    checks.index = { ok: false, error: e?.message ?? String(e) }
    overallStatus = 'degraded'
  }

  return NextResponse.json({
    status: overallStatus,
    checks,
    uptime: process.uptime(),
    version: '1.0.0',
    responseMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  }, {
    status: overallStatus === 'down' ? 503 : 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}
