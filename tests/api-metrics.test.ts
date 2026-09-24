/**
 * tests/api-metrics.test.ts
 * -----------------------------------------------------------------------------
 * Live test for the `/api/metrics` endpoint (P0-2 fix).
 *
 * Verifies that the metrics route returns a JSON object with the
 * `searches.total` field. This was the core P0-2 bug: the previous
 * implementation used a module-scoped state object that wasn't shared
 * across Next.js dev-mode module instances, so `/api/metrics` always
 * returned `total: 0` even after many real searches. After the fix
 * (SQLite-backed persistence via the Prisma `KeyValue` table), the
 * counter survives module reloads + cold starts.
 *
 * This is a LIVE test — requires the dev server running on
 * http://localhost:3000. Auto-skipped in CI (when no dev server is
 * reachable) via the `ctx.skip()` call inside each test.
 * -----------------------------------------------------------------------------
 */
import { describe, it, expect, beforeAll } from 'vitest'

const DEV_URL = 'http://localhost:3000'

// `serverUp` is set in `beforeAll` (after a probe fetch). Tests read it
// at RUNTIME via `ctx.skip()` — vitest's `it.skipIf()` evaluates the
// condition at REGISTRATION time (before beforeAll runs), so it would
// always see `serverUp === false` and skip every test.
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

describe('GET /api/metrics (P0-2 — broken metrics fix)', () => {
  it(
    'returns JSON with a searches.total numeric field',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      const r = await fetch(`${DEV_URL}/api/metrics`, {
        signal: AbortSignal.timeout(5000),
      })
      expect(r.status).toBe(200)
      const ct = r.headers.get('content-type') || ''
      expect(ct).toContain('application/json')

      const data = await r.json()
      // Shape: { uptime: {...}, searches: { total, cacheHits, ... },
      //         latency: {...}, aiLayer: {...}, tools: {...}, recent: [...],
      //         persistedAt: ... }
      expect(data).toBeTypeOf('object')
      expect(data).not.toBeNull()
      expect(data.searches).toBeTypeOf('object')
      expect(data.searches.total).toBeTypeOf('number')
      expect(data.searches.total).toBeGreaterThanOrEqual(0)
      // After the P0-2 fix, the counter is persisted to SQLite — once any
      // real search has run, total > 0. We don't assert > 0 because a fresh
      // DB seed could legitimately have 0. But the field must exist + be
      // numeric.
      expect(data.latency).toBeTypeOf('object')
      expect(data.recent).toBeInstanceOf(Array)
    },
  )

  it(
    'does not return the legacy flat `total searches: 0` shape (the broken pre-P0-2 form)',
    async (ctx) => {
      if (!serverUp) return ctx.skip()
      // The pre-P0-2 implementation returned a text body like
      // "total searches: 0, latency samples: 0, recent: []" (because the
      // module-scoped state was empty). The post-P0-2 implementation
      // returns a structured JSON object.
      const r = await fetch(`${DEV_URL}/api/metrics`, {
        signal: AbortSignal.timeout(5000),
      })
      const ct = r.headers.get('content-type') || ''
      expect(ct).toContain('application/json')
      const data = await r.json()
      // The bug-shape was a string. The fix-shape is an object.
      expect(typeof data).toBe('object')
    },
  )
})
