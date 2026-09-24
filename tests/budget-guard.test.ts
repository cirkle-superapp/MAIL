/**
 * tests/budget-guard.test.ts
 * -----------------------------------------------------------------------------
 * Unit test for `budgetGuard` in `src/lib/brightdata.ts` (P0-1 security
 * guarantee + zero-cost circuit-breaker).
 *
 * Verifies the secure default: when `BRIGHTDATA_TOKEN` is unset, every call to
 * `budgetGuard` MUST refuse the call with `reason: 'no_token'`. This is the
 * fail-safe behavior — the engine never accidentally spends BrightData budget
 * just because someone forgot to set the env var.
 *
 * This is a PURE UNIT TEST — no dev server required. Runs in CI.
 * -----------------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// We import budgetGuard dynamically inside each test AFTER setting up the env
// stub, because the brightdata.ts module reads BRIGHTDATA_TOKEN at module-load
// time (top-level `const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_TOKEN || ''`).
// To test the "no_token" branch, we must force a fresh module load with the
// env var unset — vi.resetModules() + dynamic import.

describe('budgetGuard (src/lib/brightdata.ts)', () => {
  const originalToken = process.env.BRIGHTDATA_TOKEN
  const originalSbrWss = process.env.BRIGHTDATA_SBR_WSS
  const originalSelenium = process.env.BRIGHTDATA_SELENIUM

  beforeEach(() => {
    // Force the module to evaluate with NO BrightData credentials configured.
    delete process.env.BRIGHTDATA_TOKEN
    delete process.env.BRIGHTDATA_SBR_WSS
    delete process.env.BRIGHTDATA_SELENIUM
    vi.resetModules()
  })

  afterEach(() => {
    // Restore the real env (so other tests aren't affected).
    if (originalToken !== undefined) process.env.BRIGHTDATA_TOKEN = originalToken
    else delete process.env.BRIGHTDATA_TOKEN
    if (originalSbrWss !== undefined) process.env.BRIGHTDATA_SBR_WSS = originalSbrWss
    else delete process.env.BRIGHTDATA_SBR_WSS
    if (originalSelenium !== undefined) process.env.BRIGHTDATA_SELENIUM = originalSelenium
    else delete process.env.BRIGHTDATA_SELENIUM
    vi.resetModules()
  })

  it('returns { allowed: false, reason: "no_token" } when BRIGHTDATA_TOKEN is unset', async () => {
    const { budgetGuard } = await import('@/lib/brightdata')
    const result = budgetGuard('unlocker')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('no_token')
  })

  it('returns { allowed: false, reason: "no_token" } for every kind (serp/unlocker/dataset)', async () => {
    const { budgetGuard } = await import('@/lib/brightdata')
    for (const kind of ['serp', 'unlocker', 'dataset'] as const) {
      const result = budgetGuard(kind)
      expect(result.allowed, `kind=${kind}`).toBe(false)
      expect(result.reason, `kind=${kind}`).toBe('no_token')
    }
  })

  it('does NOT spend budget or hit the network when no token is configured', async () => {
    // Calling budgetGuard with no token must refuse the call — proving the
    // engine would never invoke a paid BrightData call in this state. We
    // also verify that the refusal does NOT mutate any counter (no phantom
    // increment of totalSuccess / dailyCount — the budget guard is a pure
    // read-only decision function in the no-token path).
    const { budgetGuard, getBudgetSnapshot } = await import('@/lib/brightdata')
    const before = getBudgetSnapshot()
    const result = budgetGuard('unlocker')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('no_token')
    const after = getBudgetSnapshot()
    expect(after.enabled).toBe(false)
    expect(after.totalSuccess).toBe(before.totalSuccess)
    expect(after.dailyCount).toBe(before.dailyCount)
    expect(after.monthlyCount).toBe(before.monthlyCount)
  })
})
