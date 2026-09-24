/**
 * metrics.ts
 * -----------------------------------------------------------------------------
 * Structured observability (§66, §50). Persists search-engine metrics to a
 * SQLite-backed KeyValue store (P0-2 fix). This solves the original bug
 * where the in-memory module-scoped `state` was not shared between route
 * module instances in Next.js dev mode + serverless cold starts.
 *
 * Tracks:
 *   - total searches + cache hits (→ cache hit rate)
 *   - latency: p50, p95, p99, avg
 *   - result counts + zero-result searches
 *   - tool usage (weather, time, math, convert, currency)
 *   - AI layer latency
 *   - per-query log (last 100, for debugging)
 *
 * Storage strategy:
 *   - Hot writes: append to in-memory ring buffers (latency, recent, toolUsage)
 *   - Durable writes: every Nth record (default: every 5 searches), flush
 *     aggregated counters to the KeyValue table. This balances observability
 *     vs. SQLite write cost (~1ms per write).
 *   - On read (/api/metrics): merge in-memory buffers with persisted counters.
 *     Even across serverless cold starts, the persisted counters survive.
 * -----------------------------------------------------------------------------
 */

import { db } from '@/lib/db'

interface SearchMetric {
  query: string
  mode: string
  latencyMs: number
  resultCount: number
  cacheHit: boolean
  toolUsed: string | null
  timestamp: number
}

interface PersistedState {
  totalSearches: number
  cacheHits: number
  zeroResultSearches: number
  toolUsage: Record<string, number>
  aiLayerCalls: number
  aiLayerLatencies: number[]  // persisted sample (last 200)
  startedAt: number
  lastPersistedAt: number
}

interface MetricsState {
  // Aggregated persisted counters (loaded from SQLite on first read)
  persisted: PersistedState
  // Hot in-memory ring buffers (lost on cold start, but small)
  latencies: number[]  // last 1000
  recent: SearchMetric[]  // last 100
  aiLayerLatencies: number[]  // last 500
  // Dirty counter: how many recordSearch calls since last persist
  dirtyCount: number
  // Whether the persisted state has been loaded yet
  loaded: boolean
}

const PERSIST_EVERY_N = 5
const METRICS_KEY = 'metrics:state'

const state: MetricsState = {
  persisted: {
    totalSearches: 0,
    cacheHits: 0,
    zeroResultSearches: 0,
    toolUsage: {},
    aiLayerCalls: 0,
    aiLayerLatencies: [],
    startedAt: Date.now(),
    lastPersistedAt: Date.now(),
  },
  latencies: [],
  recent: [],
  aiLayerLatencies: [],
  dirtyCount: 0,
  loaded: false,
}

// --- Persistence (SQLite via Prisma KeyValue) ----------------------------

async function loadPersistedState(): Promise<void> {
  if (state.loaded) return
  try {
    const row = await db.keyValue.findUnique({ where: { key: METRICS_KEY } })
    if (row) {
      const parsed = JSON.parse(row.value) as Partial<PersistedState>
      state.persisted = {
        totalSearches: parsed.totalSearches ?? 0,
        cacheHits: parsed.cacheHits ?? 0,
        zeroResultSearches: parsed.zeroResultSearches ?? 0,
        toolUsage: parsed.toolUsage ?? {},
        aiLayerCalls: parsed.aiLayerCalls ?? 0,
        aiLayerLatencies: (parsed.aiLayerLatencies ?? []).slice(-200),
        startedAt: parsed.startedAt ?? Date.now(),
        lastPersistedAt: parsed.lastPersistedAt ?? Date.now(),
      }
    }
  } catch {
    // DB not ready / not available — fall back to defaults (zero).
    // In-memory buffers will still accumulate during this process lifetime.
  }
  state.loaded = true
}

async function persistState(): Promise<void> {
  try {
    const value = JSON.stringify({
      totalSearches: state.persisted.totalSearches,
      cacheHits: state.persisted.cacheHits,
      zeroResultSearches: state.persisted.zeroResultSearches,
      toolUsage: state.persisted.toolUsage,
      aiLayerCalls: state.persisted.aiLayerCalls,
      // Only persist a sample to keep the JSON small.
      aiLayerLatencies: state.aiLayerLatencies.slice(-200),
      startedAt: state.persisted.startedAt,
      lastPersistedAt: Date.now(),
    })
    await db.keyValue.upsert({
      where: { key: METRICS_KEY },
      create: { key: METRICS_KEY, value },
      update: { value },
    })
  } catch (e: any) {
    // P2-2: structured log when persist fails — operators need visibility.
    console.warn('[metrics] persistState failed', {
      error: e?.message ?? String(e),
    })
  }
}

// --- Public API -----------------------------------------------------------

export async function recordSearch(metric: Omit<SearchMetric, 'timestamp'>): Promise<void> {
  // Make sure persisted state is loaded before we mutate (so we don't
  // double-count on a cold start where the persisted counters are non-zero).
  await loadPersistedState()

  state.persisted.totalSearches++
  if (metric.cacheHit) state.persisted.cacheHits++
  if (metric.resultCount === 0) state.persisted.zeroResultSearches++
  if (metric.toolUsed) {
    state.persisted.toolUsage[metric.toolUsed] =
      (state.persisted.toolUsage[metric.toolUsed] ?? 0) + 1
  }
  state.latencies.push(metric.latencyMs)
  if (state.latencies.length > 1000) state.latencies.shift()
  state.recent.push({ ...metric, timestamp: Date.now() })
  if (state.recent.length > 100) state.recent.shift()

  state.dirtyCount++
  if (state.dirtyCount >= PERSIST_EVERY_N) {
    state.dirtyCount = 0
    // Fire-and-forget — don't block the search response on a SQLite write.
    persistState().catch(() => {})
  }
}

export async function recordAILayer(latencyMs: number): Promise<void> {
  await loadPersistedState()
  state.persisted.aiLayerCalls++
  state.aiLayerLatencies.push(latencyMs)
  if (state.aiLayerLatencies.length > 500) state.aiLayerLatencies.shift()
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p / 100) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

export async function getMetrics(): Promise<any> {
  await loadPersistedState()
  const sorted = [...state.latencies].sort((a, b) => a - b)
  const aiSorted = [...state.aiLayerLatencies].sort((a, b) => a - b)
  const uptimeMs = Date.now() - state.persisted.startedAt
  return {
    uptime: {
      seconds: Math.round(uptimeMs / 1000),
      startedAt: new Date(state.persisted.startedAt).toISOString(),
    },
    searches: {
      total: state.persisted.totalSearches,
      cacheHits: state.persisted.cacheHits,
      cacheHitRate: state.persisted.totalSearches > 0
        ? state.persisted.cacheHits / state.persisted.totalSearches
        : 0,
      zeroResult: state.persisted.zeroResultSearches,
      zeroResultRate: state.persisted.totalSearches > 0
        ? state.persisted.zeroResultSearches / state.persisted.totalSearches
        : 0,
    },
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      avg: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      samples: sorted.length,
    },
    aiLayer: {
      calls: state.persisted.aiLayerCalls,
      p50: percentile(aiSorted, 50),
      p95: percentile(aiSorted, 95),
      avg: aiSorted.length > 0 ? aiSorted.reduce((a, b) => a + b, 0) / aiSorted.length : 0,
    },
    tools: state.persisted.toolUsage,
    recent: state.recent.slice(-10).map(m => ({
      query: m.query.slice(0, 50),
      mode: m.mode,
      latencyMs: Math.round(m.latencyMs),
      results: m.resultCount,
      cache: m.cacheHit ? 'hit' : 'miss',
      tool: m.toolUsed,
    })),
    persistedAt: state.persisted.lastPersistedAt,
  }
}
