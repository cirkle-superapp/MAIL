/**
 * suggest.ts
 * -----------------------------------------------------------------------------
 * Autocomplete (§40). Three sources of suggestions, blended:
 *
 *   1. QueryLog — previously-searched queries (by frequency). Private + safe.
 *   2. Document titles — titles from the actual index that match the prefix.
 *      This makes autocomplete feel smart: typing "react" suggests "React
 *      (JavaScript library) - Wikipedia", "Quick Start – React", etc.
 *   3. Rule-based phrase completions ("how to", "what is", etc.).
 *
 * Does NOT use any user-specific data when personalization is OFF.
 * Per §40: never a covert ad surface.
 * -----------------------------------------------------------------------------
 */

import { db } from '@/lib/db'

const COMMON_PHRASE_COMPLETIONS: { trigger: RegExp; suggestion: string }[] = [
  { trigger: /^how\b/i, suggestion: 'how to' },
  { trigger: /^what\b/i, suggestion: 'what is' },
  { trigger: /^why\b/i, suggestion: 'why is' },
  { trigger: /^when\b/i, suggestion: 'when did' },
  { trigger: /^where\b/i, suggestion: 'where is' },
  { trigger: /^who\b/i, suggestion: 'who is' },
  { trigger: /^best\b/i, suggestion: 'best of' },
  { trigger: /^latest\b/i, suggestion: 'latest news' },
]

/**
 * Return autocomplete suggestions for the given prefix.
 */
export async function suggest(prefix: string, limit = 8): Promise<string[]> {
  const p = (prefix ?? '').trim()
  if (!p) return []
  const results: string[] = []
  const seen = new Set<string>()

  // --- 1. QueryLog (previously-searched queries by frequency) ---
  try {
    const rows = await db.queryLog.findMany({
      where: {
        OR: [
          { query: { startsWith: p } },
          { query: { startsWith: p.toLowerCase() } },
          { normalized: { startsWith: p.toLowerCase() } },
        ],
      },
      orderBy: { frequency: 'desc' },
      take: limit * 2,
      select: { query: true, frequency: true },
    })
    for (const r of rows) {
      const q = r.query.trim()
      if (!q || seen.has(q.toLowerCase())) continue
      seen.add(q.toLowerCase())
      results.push(q)
      if (results.length >= limit) break
    }
  } catch {
    // ignore DB errors
  }

  // --- 2. Document titles from the index (the smartest source) ---
  // Find indexed page titles that start with OR contain the prefix.
  if (results.length < limit) {
    try {
      const lowerP = p.toLowerCase()
      const docs = await db.document.findMany({
        where: {
          OR: [
            { title: { startsWith: p } },
            { title: { startsWith: lowerP } },
            { title: { contains: p } },
            { title: { contains: lowerP } },
          ],
        },
        take: limit * 2,
        select: { title: true, qualityScore: true },
        orderBy: { qualityScore: 'desc' },
      })
      for (const d of docs) {
        const t = d.title.trim()
        if (!t || seen.has(t.toLowerCase())) continue
        // Don't suggest very long titles (they're hard to read in the dropdown).
        if (t.length > 80) continue
        seen.add(t.toLowerCase())
        results.push(t)
        if (results.length >= limit) break
      }
    } catch {
      // ignore DB errors
    }
  }

  // --- 3. Rule-based phrase completions ---
  if (results.length < limit) {
    for (const rule of COMMON_PHRASE_COMPLETIONS) {
      if (rule.trigger.test(p)) {
        const s = rule.suggestion
        if (!seen.has(s.toLowerCase())) {
          seen.add(s.toLowerCase())
          results.push(s)
          if (results.length >= limit) break
        }
      }
    }
  }

  return results.slice(0, limit)
}

/**
 * Return the top N most-frequent queries from the QueryLog (for the
 * "Trending searches" section on the home page). Safe + anonymized — no
 * user identity, just aggregate query frequency.
 */
export async function getTrendingSearches(limit = 8): Promise<{ query: string; frequency: number }[]> {
  try {
    const rows = await db.queryLog.findMany({
      orderBy: { frequency: 'desc' },
      take: limit,
      select: { query: true, frequency: true },
    })
    return rows.map((r) => ({ query: r.query, frequency: r.frequency }))
  } catch {
    return []
  }
}
