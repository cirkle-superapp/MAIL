/**
 * tests/api-auth.test.ts
 * -----------------------------------------------------------------------------
 * Live tests for the BrightData operator endpoints (P0-1 security fix).
 *
 * Verifies that all three BrightData operator endpoints refuse calls
 * without a valid `Authorization: Bearer <token>` header. The refusal is
 * either 403 (when BRIGHTDATA_OPERATOR_TOKEN is unset — the secure default)
 * or 401 (when the token IS set but the bearer header was wrong/missing).
 *
 * Either way, the call MUST NOT succeed (200) — that's the zero-cost
 * guarantee. The exact status code depends on the env config.
 *
 * Pre-P0-1, these endpoints were unauthenticated — any visitor could POST
 * a URL and consume the BrightData budget (an SSRF amplifier + budget burn
 * vulnerability). After P0-1, `requireOperator()` middleware blocks
 * unauthenticated calls.
 *
 * This is a LIVE test — requires the dev server running on
 * http://localhost:3000. Auto-skipped in CI via `ctx.skip()` inside each
 * test.
 * -----------------------------------------------------------------------------
 */
import { describe, it, expect, beforeAll } from 'vitest'

const DEV_URL = 'http://localhost:3000'

let serverUp = false
beforeAll(async () => {
  try {
    const r = await fetch(`${DEV_URL}/api/metrics`, {
      signal: AbortSignal.timeout(2000),
    })
    serverUp = r.ok
  } catch {
    serverUp = false
  }
})

describe('BrightData operator endpoints (P0-1 — auth required)', () => {
  it(
    'POST /api/brightdata/scrape returns 403 without auth',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(`${DEV_URL}/api/brightdata/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
        signal: AbortSignal.timeout(5000),
      })
      // Refusal code: 403 (token unset — secure default) OR 401 (token set
      // but no/wrong bearer header). Either way, NOT 200.
      expect([401, 403]).toContain(r.status)
      const data = await r.json().catch(() => ({}))
      // Either 'brightdata_operator_disabled' (403) OR 'unauthorized' (401).
      expect(['brightdata_operator_disabled', 'unauthorized']).toContain(data.error)
    },
  )

  it(
    'GET /api/brightdata/snapshot/sd_test123 returns 401/403 without auth',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(
        `${DEV_URL}/api/brightdata/snapshot/sd_test123`,
        { signal: AbortSignal.timeout(5000) },
      )
      expect([401, 403]).toContain(r.status)
      const data = await r.json().catch(() => ({}))
      expect(['brightdata_operator_disabled', 'unauthorized']).toContain(data.error)
    },
  )

  it(
    'POST /api/brightdata/datasets returns 401/403 without auth',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(`${DEV_URL}/api/brightdata/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'gd_test_dataset' }),
        signal: AbortSignal.timeout(5000),
      })
      expect([401, 403]).toContain(r.status)
      const data = await r.json().catch(() => ({}))
      expect(['brightdata_operator_disabled', 'unauthorized']).toContain(data.error)
    },
  )

  it(
    'POST /api/brightdata/scrape does NOT consume budget when refused (zero-cost guarantee preserved)',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      // Side-effect check: after multiple refused calls, the budget
      // counters must be unchanged. The P0-1 fix returns BEFORE any
      // brightData* function is invoked, so no budget is spent.
      const statusResp = await fetch(
        `${DEV_URL}/api/brightdata/status`,
        { signal: AbortSignal.timeout(5000) },
      )
      // /api/brightdata/status is intentionally unauthenticated — it only
      // reports the budget state, doesn't spend anything.
      if (!statusResp.ok) return ctx.skip()
      const statusBefore = await statusResp.json().catch(() => null)
      if (!statusBefore) return ctx.skip()

      // Fire 5 unauthenticated scrape attempts.
      for (let i = 0; i < 5; i++) {
        await fetch(`${DEV_URL}/api/brightdata/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://example.com' }),
          signal: AbortSignal.timeout(5000),
        })
      }

      const statusAfterResp = await fetch(
        `${DEV_URL}/api/brightdata/status`,
        { signal: AbortSignal.timeout(5000) },
      )
      const statusAfter = await statusAfterResp.json().catch(() => null)
      if (!statusAfter) return ctx.skip()

      // Budget counters must be identical — the auth wall prevented any
      // BrightData invocation.
      expect(statusAfter.dailyCount).toBe(statusBefore.dailyCount)
      expect(statusAfter.monthlyCount).toBe(statusBefore.monthlyCount)
      expect(statusAfter.totalSuccess).toBe(statusBefore.totalSuccess)
    },
  )
})
