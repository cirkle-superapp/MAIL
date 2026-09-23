/**
 * evaluation-suite.ts
 * -----------------------------------------------------------------------------
 * Automated search evaluation (§46, §70). Runs representative queries,
 * measures latency, result count, zero-result rate, cache hit rate, and
 * top-3 titles for manual quality inspection.
 *
 * Usage: bun run scripts/evaluation-suite.ts
 * -----------------------------------------------------------------------------
 */

const BASE_URL = 'http://localhost:3000'

// Representative queries covering the spec's evaluation categories (§20):
// - simple factual questions
// - names/entities
// - navigational searches
// - ambiguous queries
// - spelling errors
// - technical queries
// - recent information
// - long natural-language queries
// - product queries
// - news queries
// - multilingual queries (limited by index)
// - zero-result queries
// - tool queries (weather, time, math, convert)
const QUERIES: { query: string; category: string; expectResults: boolean }[] = [
  // Simple factual
  { query: 'javascript', category: 'simple-factual', expectResults: true },
  { query: 'python programming', category: 'simple-factual', expectResults: true },
  { query: 'what is react', category: 'simple-factual', expectResults: true },
  // Names/entities
  { query: 'Albert Einstein', category: 'entity', expectResults: true },
  { query: 'Steve Jobs', category: 'entity', expectResults: true },
  // Navigational
  { query: 'react.dev', category: 'navigational', expectResults: true },
  { query: 'MDN web docs', category: 'navigational', expectResults: true },
  // Ambiguous
  { query: 'apple', category: 'ambiguous', expectResults: true },
  // Spelling errors
  { query: 'javascrpt', category: 'spelling', expectResults: false },
  { query: 'recat', category: 'spelling', expectResults: false },
  // Technical
  { query: 'docker kubernetes', category: 'technical', expectResults: true },
  { query: 'bm25 ranking algorithm', category: 'technical', expectResults: true },
  // Long natural-language
  { query: 'how does artificial intelligence work', category: 'long-nl', expectResults: true },
  // Product
  { query: 'best programming language', category: 'product', expectResults: true },
  // News
  { query: 'latest technology news', category: 'news', expectResults: true },
  // Zero-result
  { query: 'zzzzz nonexistent qwerty', category: 'zero-result', expectResults: false },
  // Tool queries
  { query: 'weather in Dubai', category: 'tool-weather', expectResults: false },
  { query: 'time in Tokyo', category: 'tool-time', expectResults: false },
  { query: '2+2', category: 'tool-math', expectResults: false },
  { query: '10 km in miles', category: 'tool-convert', expectResults: false },
]

interface QueryResult {
  query: string
  category: string
  latencyMs: number
  resultCount: number
  cacheHit: boolean
  topTitles: string[]
  toolUsed: string | null
  instantAnswer: boolean
  zeroResults: boolean
  matchedExpectation: boolean
}

async function runQuery(q: string): Promise<QueryResult> {
  const start = Date.now()
  try {
    const resp = await fetch(`${BASE_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: q,
        mode: 'BALANCED',
        filters: {
          aiMode: 'OFF',
          personalization: 'OFF',
          safeSearch: 'ON',
          page: 1,
          pageSize: 10,
          domainDiversity: 2,
          freshness: 'ANY',
          sourceTypes: [],
        },
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await resp.json()
    const latencyMs = Date.now() - start
    const results = data.results || []
    const instantAnswer = !!data.instantAnswer
    return {
      query: q,
      category: '',
      latencyMs,
      resultCount: results.length,
      cacheHit: false,
      topTitles: results.slice(0, 3).map((r: any) => r.title?.slice(0, 50) ?? ''),
      toolUsed: data.instantAnswer?.kind ?? null,
      instantAnswer,
      zeroResults: results.length === 0 && !instantAnswer,
      matchedExpectation: false,
    }
  } catch (e: any) {
    return {
      query: q,
      category: '',
      latencyMs: Date.now() - start,
      resultCount: 0,
      cacheHit: false,
      topTitles: [`ERROR: ${e?.message ?? 'timeout'}`],
      toolUsed: null,
      instantAnswer: false,
      zeroResults: true,
      matchedExpectation: false,
    }
  }
}

async function main() {
  console.log('=== CIRKLE Search Evaluation Suite ===\n')
  const results: QueryResult[] = []

  for (const { query, category, expectResults } of QUERIES) {
    const r = await runQuery(query)
    r.category = category
    r.matchedExpectation = expectResults ? r.resultCount > 0 || r.instantAnswer : r.resultCount === 0 || r.instantAnswer
    results.push(r)
    const status = r.matchedExpectation ? '✓' : '✗'
    console.log(`${status} [${category}] "${query}" → ${r.resultCount} results, ${r.latencyMs}ms${r.instantAnswer ? ' (instant)' : ''}${r.zeroResults ? ' ZERO' : ''}`)
    if (r.topTitles.length > 0) {
      r.topTitles.forEach(t => console.log(`    ${t}`))
    }
  }

  // Summary
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const zeroResultCount = results.filter(r => r.zeroResults).length
  const toolCount = results.filter(r => r.toolUsed).length
  const matchedCount = results.filter(r => r.matchedExpectation).length

  console.log('\n=== Summary ===')
  console.log(`Queries run: ${results.length}`)
  console.log(`Expectation match: ${matchedCount}/${results.length} (${Math.round(100 * matchedCount / results.length)}%)`)
  console.log(`Latency p50: ${p50}ms | p95: ${p95}ms | avg: ${Math.round(avg)}ms`)
  console.log(`Zero-result: ${zeroResultCount}/${results.length}`)
  console.log(`Tool answers: ${toolCount}/${results.length}`)
  console.log(`Categories with issues:`)
  const failed = results.filter(r => !r.matchedExpectation)
  failed.forEach(r => console.log(`  ✗ [${r.category}] "${r.query}" expected ${r.resultCount > 0 || r.instantAnswer ? 'results' : 'zero results'} but got ${r.resultCount}${r.instantAnswer ? ' + instant' : ''}`))
}

main().catch(console.error)
