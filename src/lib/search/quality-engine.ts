/**
 * quality-engine.ts
 * -----------------------------------------------------------------------------
 * Computes per-document quality signals (§13) and a composite qualityScore
 * used by the ranking engine.
 *
 * Signals:
 *   - informationDensity (0..1): rewards 200-5000 words; penalizes thin (<100)
 *     and overlong-low-signal (>10000).
 *   - originality (0..1): starts at 1; reduced by dedup-engine later.
 *   - expertise (0..1): +0.1 author/publisher, +0.1 citation markers in text,
 *     +0.1 if academic/official domain (heuristic).
 *   - freshness (0..1): within 90d -> 1.0; within 1y -> 0.6; older -> 0.3;
 *     unknown -> 0.5.
 *   - spamSignals (0..1): keyword stuffing (term freq > 8% non-stopword),
 *     repeated meta keywords, hidden text markers, excessive internal links.
 *   - duplicateSignals (0..1): placeholder (set by dedup-engine).
 *
 * Composite:
 *   qualityScore = 0.35*density + 0.25*originality + 0.20*expertise
 *                + 0.10*freshness + 0.10*(1-spamSignals), clamped 0..1.
 * -----------------------------------------------------------------------------
 */

import { tokenize, removeStopwords } from './text-processor'

export interface QualitySignals {
  informationDensity: number
  originality: number
  expertise: number
  freshness: number
  spamSignals: number
  duplicateSignals: number
  qualityScore: number
  isOriginal: boolean
}

export interface QualityInput {
  contentText: string
  wordCount: number
  headings: any[]
  metaDescription: string | null
  title: string
  crawledAt: Date
  publishedAt: Date | null
  updatedAt: Date | null
  author?: string | null
  publisher?: string | null
  linkCount?: number
  rawHtml?: string // for hidden-text detection (optional)
  domain?: string
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function daysSince(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Compute information density from word count buckets.
 */
function computeDensity(wordCount: number): number {
  if (wordCount < 100) {
    // <100 words -> thin; ramp down rapidly
    return clamp01(wordCount / 100) * 0.4
  }
  if (wordCount <= 5000) {
    // Sweet spot. Reward most around 400-2000.
    if (wordCount < 400) return 0.7 + 0.3 * (wordCount - 100) / 300
    if (wordCount <= 2000) return 1.0
    // 2000..5000 -> slight decay
    return 1.0 - 0.2 * ((wordCount - 2000) / 3000)
  }
  if (wordCount <= 10000) {
    return 0.8 - 0.3 * ((wordCount - 5000) / 5000)
  }
  // >10000 -> low-signal padding penalty
  return clamp01(0.5 - 0.3 * ((wordCount - 10000) / 100000))
}

/**
 * Compute a keyword-stuffing penalty (0..1).
 * Returns the max fraction any single non-stopword token takes of all tokens.
 * Above 8% triggers penalty proportional to how far above 8%.
 */
function computeKeywordStuffing(contentText: string): { ratio: number; penalty: number } {
  if (!contentText) return { ratio: 0, penalty: 0 }
  const tokens = tokenize(contentText)
  const meaningful = removeStopwords(tokens)
  if (meaningful.length === 0) return { ratio: 0, penalty: 0 }
  const freq = new Map<string, number>()
  for (const t of meaningful) freq.set(t, (freq.get(t) ?? 0) + 1)
  let max = 0
  let maxTerm = ''
  for (const [k, v] of freq) {
    const ratio = v / meaningful.length
    if (ratio > max) {
      max = ratio
      maxTerm = k
    }
  }
  // Penalty only above 8% threshold
  const THRESHOLD = 0.08
  if (max <= THRESHOLD) return { ratio: max, penalty: 0 }
  // Scale penalty: 8%->0, 30%->1.0 (clamped)
  const penalty = clamp01((max - THRESHOLD) / (0.30 - THRESHOLD))
  return { ratio: max, penalty, maxTerm }
}

/**
 * Detect hidden-text markers in raw HTML (display:none / visibility:hidden /
 * font-size:0 / color matches background). Conservative — only catches the
 * obvious inline style cases. Each occurrence adds a small penalty.
 */
function detectHiddenText(rawHtml: string | undefined): number {
  if (!rawHtml) return 0
  let hits = 0
  // inline style markers
  const re = /style\s*=\s*("[^"]*"|'[^']*')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(rawHtml)) !== null) {
    const s = (m[1] ?? '').toLowerCase()
    if (
      s.includes('display:none') ||
      s.includes('display: none') ||
      s.includes('visibility:hidden') ||
      s.includes('visibility: hidden') ||
      s.includes('font-size:0') ||
      s.includes('font-size: 0') ||
      s.includes('font-size:0px') ||
      s.includes('color:transparent') ||
      s.includes('left:-9999px') ||
      s.includes('left: -9999px')
    ) {
      hits++
    }
  }
  // Each hit adds 0.05 up to a cap.
  return clamp01(hits * 0.05)
}

/**
 * Look for citation / reference markers in text.
 */
function hasCitations(text: string): boolean {
  if (!text) return false
  // Common markers: "[1]", "(Smith 2020)", "References", "Bibliography",
  // "et al.", "doi:"
  if (/\[\d{1,3}\]/.test(text)) return true
  if (/\([A-Z][a-zA-Z]+(?:\s+(?:and|&)\s+[A-Z][a-zA-Z]+)?\s+(?:19|20)\d{2}\)/.test(text)) return true
  if (/\b(references|bibliography|cited|citations|further reading)\b/i.test(text)) return true
  if (/\bdoi:\s*10\.\d{4,}/i.test(text)) return true
  if (/\bet al\./.test(text)) return true
  return false
}

/**
 * Heuristic: does the domain look academic / official? (Coarse-grained.)
 */
function looksAuthoritative(domain: string | undefined): boolean {
  if (!domain) return false
  const d = domain.toLowerCase()
  return (
    d.endsWith('.edu') ||
    d.endsWith('.gov') ||
    d.endsWith('.ac.uk') ||
    d.endsWith('.ac.jp') ||
    d.includes('arxiv.org') ||
    d.includes('ieee.org') ||
    d.includes('nature.com') ||
    d.includes('sciencedirect.com') ||
    d.includes('mozilla.org') ||
    d.includes('w3.org') ||
    d.includes('rfc-editor.org') ||
    d.includes('kubernetes.io') ||
    d.includes('python.org') ||
    d.includes('golang.org') ||
    d.includes('rust-lang.org') ||
    d.includes('react.dev') ||
    d.includes('nextjs.org')
  )
}

export function assessQuality(input: QualityInput): QualitySignals {
  const wordCount = input.wordCount
  const informationDensity = computeDensity(wordCount)

  const originality = 1.0 // reduced later by dedup-engine

  let expertise = 0
  if (input.author || input.publisher) expertise += 0.1
  if (hasCitations(input.contentText)) expertise += 0.1
  if (looksAuthoritative(input.domain)) expertise += 0.1
  // Small bonus for having structured headings (3+).
  if (Array.isArray(input.headings) && input.headings.length >= 3) expertise += 0.05
  expertise = clamp01(expertise)

  // Freshness
  let freshness = 0.5
  const dateRef = input.updatedAt ?? input.publishedAt
  if (dateRef) {
    const d = daysSince(new Date(dateRef))
    if (d <= 90) freshness = 1.0
    else if (d <= 365) freshness = 0.6
    else freshness = 0.3
  } else if (input.crawledAt) {
    // Fall back to crawledAt with a more conservative curve.
    const d = daysSince(new Date(input.crawledAt))
    if (d <= 30) freshness = 0.6
    else freshness = 0.4
  }

  // Spam signals (composite for quality engine; the spam-engine.ts gives
  // a richer verdict — here we just compute a numeric surrogate).
  const { ratio: stuffRatio, penalty: stuffPenalty } = computeKeywordStuffing(input.contentText)
  const hiddenPenalty = detectHiddenText(input.rawHtml)
  // Repeated meta keywords: if metaKeywords is non-trivial and equals title — mild penalty.
  let metaPenalty = 0
  if (input.metaDescription && input.metaDescription.length > 0) {
    // Strip whitespace and compare density
    const descTokens = tokenize(input.metaDescription)
    const descUnique = new Set(descTokens).size
    if (descTokens.length > 0 && descUnique / descTokens.length < 0.3) {
      // Very low unique ratio = repetition
      metaPenalty = 0.1
    }
  }
  // Excessive internal links
  let linkPenalty = 0
  if (input.linkCount && input.linkCount > 100) {
    linkPenalty = clamp01((input.linkCount - 100) / 200)
  }
  const spamSignals = clamp01(stuffPenalty + hiddenPenalty + metaPenalty + linkPenalty)

  const qualityScore = clamp01(
    0.35 * informationDensity +
    0.25 * originality +
    0.20 * expertise +
    0.10 * freshness +
    0.10 * (1 - spamSignals)
  )

  return {
    informationDensity,
    originality,
    expertise,
    freshness,
    spamSignals,
    duplicateSignals: 0, // set later by dedup-engine
    qualityScore,
    isOriginal: true,
  }
}
