/**
 * spam-engine.ts
 * -----------------------------------------------------------------------------
 * Multi-signal SEO-spam detection (§14). Each signal contributes 0.15-0.3 to
 * an overall spamScore. A document is only penalized (penalize=true) when
 * spamScore >= 0.5 — to avoid single-weak-signal bans per §14.
 *
 * Signals implemented:
 *   - keyword stuffing (term freq > 8% for a single non-stopword)
 *   - doorway page (very short content + many affiliate links)
 *   - scraped content (low originality heuristic — title contains common
 *     "free download" / "click here" patterns)
 *   - mass-generated (template-only text — duplicate boilerplate detection)
 *   - manipulative internal linking (>100 internal links)
 *   - link schemes (anchor text == target keyword exactly + many links)
 *   - deceptive redirects (URL path doesn't match body topic)
 *   - hidden text (display:none in raw HTML)
 *   - fake structured data (suspicious schema.org payloads) — heuristic
 * -----------------------------------------------------------------------------
 */

import { tokenize, removeStopwords } from './text-processor'

export interface SpamVerdict {
  spamScore: number
  reasons: string[]
  penalize: boolean
}

export interface SpamInput {
  contentText: string
  title: string
  metaKeywords: string | null
  links: any[] // [{ url, anchor, rel? }]
  rawHtml?: string
  domain?: string
  url?: string
  queryRelevantTerms?: string[] // optional: target keywords for link-scheme detection
}

const SCRAPED_PATTERNS = [
  /\bfree\s+download\b/i,
  /\bclick\s+here\s+to\s+(download|watch|read)\b/i,
  /\bwatch\s+online\s+free\b/i,
  /\bfull\s+episode\s+free\b/i,
  /\bleaked?\s+(photos?|videos?)\b/i,
  /\bhacked\b.*\bcelebrity\b/i,
]

const TEMPLATE_PATTERNS = [
  /\bwelcome\s+to\s+wordpress\b/i,
  /\bthis\s+is\s+an\s+example\s+(post|page)\b/i,
  /\bsample\s+page\b/i,
  /\bjust\s+another\s+(wordpress|blog)\b/i,
  /\bdesign\s+by\b.*\bfree\s+template\b/i,
]

const AFFILIATE_HINTS = [
  /\/go\//i,
  /\/aff(iliate)?\//i,
  /\/ref(erence)?\//i,
  /\/track\//i,
  /click\b.*\bhere\b/i,
  /\bamazon\.\w+\/dp\//i,
  /\bamzn\.to\//i,
  /\bawin1\.com/i,
  /\bshareasale\.com/i,
  /\bgo\.skimresources\.com/i,
  /\bshop-links\.co\//i,
]

function keywordStuffingScore(text: string): { score: number; term?: string } {
  if (!text) return { score: 0 }
  const tokens = tokenize(text)
  const meaningful = removeStopwords(tokens)
  if (meaningful.length === 0) return { score: 0 }
  const freq = new Map<string, number>()
  for (const t of meaningful) freq.set(t, (freq.get(t) ?? 0) + 1)
  let max = 0
  let maxTerm: string | undefined
  for (const [k, v] of freq) {
    const r = v / meaningful.length
    if (r > max) {
      max = r
      maxTerm = k
    }
  }
  // Penalty ramps from 8% -> 0 (no penalty) to 25% -> 0.3
  const THRESH = 0.08
  if (max <= THRESH) return { score: 0 }
  const penalty = Math.min(0.3, 0.3 * ((max - THRESH) / (0.25 - THRESH)))
  return { score: penalty, term: maxTerm }
}

function detectHiddenText(rawHtml: string | undefined): { score: number; hits: number } {
  if (!rawHtml) return { score: 0, hits: 0 }
  let hits = 0
  const re = /style\s*=\s*("[^"]*"|'[^']*')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(rawHtml)) !== null) {
    const s = (m[1] ?? '').toLowerCase()
    if (
      s.includes('display:none') ||
      s.includes('visibility:hidden') ||
      s.includes('font-size:0') ||
      s.includes('color:transparent') ||
      s.includes('left:-9999px') ||
      s.includes('text-indent:-9999px')
    ) {
      hits++
    }
  }
  // Each hit adds 0.04 up to 0.25
  return { score: Math.min(0.25, hits * 0.04), hits }
}

function countAffiliateLinks(links: any[]): number {
  let n = 0
  for (const l of links) {
    const url = String(l?.url ?? '')
    const anchor = String(l?.anchor ?? '')
    if (AFFILIATE_HINTS.some((re) => re.test(url) || re.test(anchor))) n++
  }
  return n
}

function countInternalLinks(links: any[], domain?: string): number {
  if (!domain) return 0
  let n = 0
  const dom = domain.toLowerCase()
  for (const l of links) {
    const url = String(l?.url ?? '')
    try {
      const u = new URL(url)
      if (u.hostname.toLowerCase().endsWith(dom) || u.hostname.toLowerCase().includes(dom)) n++
    } catch {
      // ignore
    }
  }
  return n
}

/**
 * Link-scheme detection: many internal links whose anchor text is a single
 * keyword (likely "buy X", "X review"). Heuristic: more than 30% of anchors
 * are single exact match to title tokens.
 */
function detectLinkSchemes(links: any[], title: string): number {
  if (links.length < 10) return 0
  const titleTokens = new Set(tokenize(title))
  let exactMatchCount = 0
  for (const l of links) {
    const anchor = String(l?.anchor ?? '').trim().toLowerCase()
    if (!anchor) continue
    if (anchor.split(/\s+/).length <= 3) {
      // short anchor
      const toks = tokenize(anchor)
      if (toks.length > 0 && toks.every((t) => titleTokens.has(t))) exactMatchCount++
    }
  }
  const ratio = exactMatchCount / links.length
  if (ratio > 0.5) return 0.2
  if (ratio > 0.3) return 0.1
  return 0
}

/**
 * Detect deceptive redirects — if the URL path looks like topic X but the
 * body text mentions topic X fewer than 3 times. Very conservative.
 */
function detectDeceptiveRedirect(
  url: string | undefined,
  contentText: string
): number {
  if (!url) return 0
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    if (path === '/' || path.length < 5) return 0
    // Take path's last segment as a topic guess
    const seg = decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '')
      .replace(/[-_]/g, ' ')
      .trim()
    if (seg.length < 4) return 0
    if (/^\d+$/.test(seg)) return 0
    const re = new RegExp(seg.replace(/\s+/g, '\\s+'), 'gi')
    const matches = contentText.match(re)
    const n = matches ? matches.length : 0
    if (n < 2) return 0.15
    return 0
  } catch {
    return 0
  }
}

function detectFakeStructuredData(rawHtml?: string): number {
  if (!rawHtml) return 0
  // Look for application/ld+json blocks
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  let hits = 0
  while ((m = re.exec(rawHtml)) !== null) {
    const json = (m[1] ?? '').trim()
    if (!json) continue
    // Heuristic: very long 'description' with mostly stopwords or duplicates
    // of title — flag if 'description' contains the same word > 10x.
    try {
      const obj = JSON.parse(json)
      const desc = String(obj?.description ?? obj?.['@description'] ?? '')
      if (desc.length > 50) {
        const toks = tokenize(desc)
        const freq = new Map<string, number>()
        for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1)
        let max = 0
        for (const v of freq.values()) if (v > max) max = v
        if (toks.length > 0 && max / toks.length > 0.15) hits++
      }
    } catch {
      // malformed JSON-LD often = fake structured data
      hits++
    }
  }
  return Math.min(0.2, hits * 0.1)
}

export function detectSpam(input: SpamInput): SpamVerdict {
  const reasons: string[] = []
  let score = 0

  // 1. Keyword stuffing
  const ks = keywordStuffingScore(input.contentText)
  if (ks.score > 0) {
    score += ks.score
    reasons.push(`keyword stuffing: "${ks.term}" repeats above normal ratio`)
  }

  // 2. Doorway page: very short content + many affiliate links
  const wordCount = input.contentText ? input.contentText.split(/\s+/).length : 0
  const aff = countAffiliateLinks(input.links)
  if (wordCount < 200 && aff >= 3) {
    score += 0.25
    reasons.push(`doorway page: very short content (${wordCount} words) with ${aff} affiliate links`)
  }

  // 3. Scraped content (heuristic via title patterns)
  for (const re of SCRAPED_PATTERNS) {
    if (re.test(input.title) || re.test(input.contentText)) {
      score += 0.2
      reasons.push('scraped-content signals (pirated-content markers detected)')
      break
    }
  }

  // 4. Mass-generated / template-only text
  for (const re of TEMPLATE_PATTERNS) {
    if (re.test(input.contentText) || re.test(input.title)) {
      score += 0.2
      reasons.push('template-only / mass-generated text detected')
      break
    }
  }

  // 5. Manipulative internal linking (>100 internal links on a single page)
  const internal = countInternalLinks(input.links, input.domain)
  if (internal > 100) {
    score += Math.min(0.25, 0.15 + (internal - 100) / 1000)
    reasons.push(`manipulative internal linking: ${internal} internal links`)
  }

  // 6. Link schemes
  const ls = detectLinkSchemes(input.links, input.title)
  if (ls > 0) {
    score += ls
    reasons.push('possible link scheme: many anchors exactly match target keywords')
  }

  // 7. Deceptive redirects
  const dr = detectDeceptiveRedirect(input.url, input.contentText)
  if (dr > 0) {
    score += dr
    reasons.push('deceptive redirect: URL path topic not present in body text')
  }

  // 8. Hidden text
  const ht = detectHiddenText(input.rawHtml)
  if (ht.score > 0) {
    score += ht.score
    reasons.push(`hidden text: ${ht.hits} elements with display:none/visibility:hidden/font-size:0`)
  }

  // 9. Fake structured data
  const fsd = detectFakeStructuredData(input.rawHtml)
  if (fsd > 0) {
    score += fsd
    reasons.push('fake or malformed structured data detected')
  }

  // Clamp spamScore 0..1
  const spamScore = Math.max(0, Math.min(1, score))
  // Only penalize when multi-signal — spamScore >= 0.5
  const penalize = spamScore >= 0.5

  return { spamScore, reasons, penalize }
}
