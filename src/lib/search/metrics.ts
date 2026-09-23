/**
 * metrics.ts
 * -----------------------------------------------------------------------------
 * Structured observability (§66, §50). Collects search-engine metrics in
 * memory for the /api/metrics endpoint.
 *
 * Tracks:
 *   - total searches + cache hits (→ cache hit rate)
 *   - latency: p50, p95, p99
 *   - result counts + zero-result searches
 *   - tool usage (weather, time, math, convert, currency)
 *   - AI layer latency
 *   - per-query log (last 100, for debugging)
 * -----------------------------------------------------------------------------
 */

interface SearchMetric {
  query: string
  mode: string
  latencyMs: number
  resultCount: number
  cacheHit: boolean
  toolUsed: string | null
  timestamp: number
}

interface MetricsState {
  totalSearches: number
  cacheHits: number
  zeroResultSearches: number
  latencies: number[]  // ring buffer (last 1000)
  recent: SearchMetric[]  // ring buffer (last 100)
  toolUsage: Record<string, number>
  aiLayerCalls: number
  aiLayerLatencies: number[]
  startedAt: number
}

const state: MetricsState = {
  totalSearches: 0,
  cacheHits: 0,
  zeroResultSearches: 0,
  latencies: [],
  recent: [],
  toolUsage: {},
  aiLayerCalls: 0,
  aiLayerLatencies: [],
  startedAt: Date.now(),
}

export function recordSearch(metric: Omit<SearchMetric, 'timestamp'>): void {
  state.totalSearches++
  if (metric.cacheHit) state.cacheHits++
  if (metric.resultCount === 0) state.zeroResultSearches++
  if (metric.toolUsed) {
    state.toolUsage[metric.toolUsed] = (state.toolUsage[metric.toolUsed] ?? 0) + 1
  }
  state.latencies.push(metric.latencyMs)
  if (state.latencies.length > 1000) state.latencies.shift()
  state.recent.push({ ...metric, timestamp: Date.now() })
  if (state.recent.length > 100) state.recent.shift()
}

export function recordAILayer(latencyMs: number): void {
  state.aiLayerCalls++
  state.aiLayerLatencies.push(latencyMs)
  if (state.aiLayerLatencies.length > 500) state.aiLayerLatencies.shift()
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p / 100) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

export function getMetrics(): any {
  const sorted = [...state.latencies].sort((a, b) => a - b)
  const aiSorted = [...state.aiLayerLatencies].sort((a, b) => a - b)
  const uptimeMs = Date.now() - state.startedAt
  return {
    uptime: {
      seconds: Math.round(uptimeMs / 1000),
      startedAt: new Date(state.startedAt).toISOString(),
    },
    searches: {
      total: state.totalSearches,
      cacheHits: state.cacheHits,
      cacheHitRate: state.totalSearches > 0 ? state.cacheHits / state.totalSearches : 0,
      zeroResult: state.zeroResultSearches,
      zeroResultRate: state.totalSearches > 0 ? state.zeroResultSearches / state.totalSearches : 0,
    },
    latency: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      avg: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      samples: sorted.length,
    },
    aiLayer: {
      calls: state.aiLayerCalls,
      p50: percentile(aiSorted, 50),
      p95: percentile(aiSorted, 95),
      avg: aiSorted.length > 0 ? aiSorted.reduce((a, b) => a + b, 0) / aiSorted.length : 0,
    },
    tools: state.toolUsage,
    recent: state.recent.slice(-10).map(m => ({
      query: m.query.slice(0, 50),
      mode: m.mode,
      latencyMs: Math.round(m.latencyMs),
      results: m.resultCount,
      cache: m.cacheHit ? 'hit' : 'miss',
      tool: m.toolUsed,
    })),
  }
}
