/**
 * GET /api/brightdata/status
 * -----------------------------------------------------------------------------
 * Read-only status of the BrightData integration — surfaces:
 *   - whether a token is configured (enabled)
 *   - daily/monthly budget consumption vs. caps
 *   - which BrightData kinds (serp / unlocker / dataset) are temporarily
 *     disabled due to auth failures or rate limits
 *   - total successful calls + total fallbacks (since boot + persisted budget)
 *   - last error message
 *
 * Used by the UI badge in the footer + by ops/COO dashboards.
 * No sensitive data (no token, no zones, no PII) is ever exposed.
 */
import { NextResponse } from 'next/server'
import { getBudgetSnapshot } from '@/lib/brightdata'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const snap = getBudgetSnapshot()
  return NextResponse.json({
    enabled: snap.enabled,
    budget: {
      daily: {
        used: snap.dailyCount,
        cap: snap.dailyCap,
        remaining: Math.max(0, snap.dailyCap - snap.dailyCount),
      },
      monthly: {
        used: snap.monthlyCount,
        cap: snap.monthlyCap,
        remaining: Math.max(0, snap.monthlyCap - snap.monthlyCount),
      },
    },
    disabledKinds: snap.disabledKinds,
    totals: {
      successful: snap.totalSuccess,
      fallbacks: snap.totalFallbacks,
    },
    lastError: snap.lastError,
    // "zero-cost guarantee" — explicit verification flag for the UI badge.
    zeroCostGuarantee: snap.monthlyCount < snap.monthlyCap,
    updatedAt: new Date().toISOString(),
  })
}
