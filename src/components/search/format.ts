/**
 * format.ts
 * -----------------------------------------------------------------------------
 * Small client-side formatting helpers (relative dates, snippet highlighting,
 * numeric abbreviations). Kept here so we don't depend on extra packages —
 * `date-fns` is available and used where it's actually nicer.
 */

import { formatDistanceToNow, format, isValid } from 'date-fns'

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  let d: Date
  try {
    d = new Date(iso)
  } catch {
    return ''
  }
  if (!isValid(d)) return ''
  try {
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return ''
  }
}

export function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return ''
  let d: Date
  try {
    d = new Date(iso)
  } catch {
    return ''
  }
  if (!isValid(d)) return ''
  try {
    return format(d, 'PPP p')
  } catch {
    return ''
  }
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return ''
  let d: Date
  try {
    d = new Date(iso)
  } catch {
    return ''
  }
  if (!isValid(d)) return ''
  try {
    return format(d, 'MMM d, yyyy')
  } catch {
    return ''
  }
}

/**
 * Returns a snippet with query terms highlighted via `<mark>`. Caller is
 * responsible for sanitizing the snippet (the backend already does — it's
 * text-only). We split on a regex built from the query tokens.
 *
 * Returns an array of React-renderable strings + mark elements. The caller
 * is expected to render it inline.
 */
export function highlightSnippet(
  snippet: string,
  query: string,
): Array<{ text: string; mark: boolean }> {
  if (!snippet) return []
  if (!query || !query.trim()) return [{ text: snippet, mark: false }]
  // Tokenize the query into individual non-stopword-ish terms.
  const terms = query
    .trim()
    .toLowerCase()
    .split(/[\s".,?!:;()]+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (terms.length === 0) return [{ text: snippet, mark: false }]
  const re = new RegExp(`(${terms.join('|')})`, 'gi')
  const parts = snippet.split(re)
  const out: Array<{ text: string; mark: boolean }> = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    // Even indices are non-matches, odd are matches (because of the capture group).
    out.push({ text: p, mark: i % 2 === 1 })
  }
  return out
}

/**
 * Truncate a snippet to ~n lines (by character count, with word boundary).
 */
export function truncateLines(s: string, maxChars = 320): string {
  if (!s) return ''
  if (s.length <= maxChars) return s
  const cut = s.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > maxChars - 50 ? cut.slice(0, lastSpace) : cut) + '…'
}

/**
 * Format a large number with K / M suffix.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + 'K'
  return (n / 1_000_000).toFixed(1) + 'M'
}

/**
 * Compute a "Match strength" label (Low / Medium / High) from a 0..1 score.
 * Per spec — we never expose the raw weight, just a coarse bucket.
 */
export function matchStrength(score: number): 'Low' | 'Medium' | 'High' {
  if (score >= 0.66) return 'High'
  if (score >= 0.33) return 'Medium'
  return 'Low'
}

/**
 * Pull a hostname for display + a breadcrumb path from a full URL.
 */
export function urlParts(url: string): { host: string; path: string } {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return { host, path }
  } catch {
    return { host: url, path: '' }
  }
}
