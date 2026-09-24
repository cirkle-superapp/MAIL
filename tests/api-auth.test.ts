/**
 * tests/api-auth.test.ts
 * -----------------------------------------------------------------------------
 * Live tests for the BrightData operator endpoints (P0-1 security fix).
 *
 * Verifies that all three BrightData operator endpoints return 403 when no
 * `Authorization: Bearer <token>` header is provided. This is the secure
 * default: when `BRIGHTDATA_OPERATOR_TOKEN` env var is unset (as it is in
 * the dev sandbox), every BrightData endpoint refuses the call.
 *
 * Pre-P0-1, these endpoints were unauthenticated — any visitor could POST
 * a URL and consume the BrightData budget (an SSRF amplifier + budget burn
 * vulnerability). After P0-1, `requireOperator()` middleware blocks
 * unauthenticated calls.
 *
 * This is a LIVE test — requires the dev server running on
 * http://localhost:3000. Auto-skipped in CI via `ctx.skip()` inside each
 * test (we can't use `it.skipIf()` because the server-up probe is async
 * and runs in `beforeAll`).
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
      // 403 is the secure default (operator token unset) — 401 would mean
      // the token is configured but the bearer header was wrong. Either
      // way, the call must NOT succeed (200). The audit fix specifies 403
      // for the no-token-configured case, which is what the dev sandbox
      // has.
      expect(r.status).toBe(403)
      const data = await r.json().catch(() => ({}))
      expect(data.error).toBe('brightdata_operator_disabled')
    },
  )

  it(
    'GET /api/brightdata/snapshot/sd_test123 returns 403 without auth',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(
        `${DEV_URL}/api/brightdata/snapshot/sd_test123`,
        { signal: AbortSignal.timeout(5000) },
      )
      expect(r.status).toBe(403)
      const data = await r.json().catch(() => ({}))
      expect(data.error).toBe('brightdata_operator_disabled')
    },
  )

  it(
    'POST /api/brightdata/datasets returns 403 without auth',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(`${DEV_URL}/api/brightdata/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId: 'gd_test_dataset' }),
        signal: AbortSignal.timeout(5000),
      })
      expect(r.status).toBe(403)
      const data = await r.json().catch(() => ({}))
      expect(data.error).toBe('brightdata_operator_disabled')
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
