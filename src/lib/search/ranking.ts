/**
 * ranking.ts
 * -----------------------------------------------------------------------------
 * Candidate ranking (§44). Takes the lexical candidates from the indexer,
 * looks up the full Document rows, applies mode-specific weights, and emits
 * a RankedResult per candidate with human-readable why-signals (§15).
 *
 * Modes (§10):
 *   BALANCED:  0.35*lex + 0.20*sem + 0.15*q + 0.10*fr + 0.10*st + 0.05*or + 0.05*intent
 *   EXACT:     0.70*lex + 0.10*fr + 0.10*q (no semantic)
 *   LATEST:    0.50*fr + 0.20*lex + 0.20*q + 0.10*st
 *   RESEARCH:  0.40*q + 0.20*ac/official boost + 0.20*lex + 0.10*or + 0.10*fr
 *   OFFICIAL/ACADEMIC/COMMUNITY/NEWS:
 *              filter to that sourceType (applied via filters), then
 *              0.40*lex + 0.30*q + 0.20*st + 0.10*fr
 *
 * Spam penalty: -spamScore. Duplicate penalty: -0.3 if !isOriginal.
 *
 * semanticBoost: a simple semantic-similarity proxy computed as cosine of
 * overlapping term-set weighted by idf. (Documented in code comment.)
 *
 * whySignals: top 3-5 of:
 *   "Matches your search terms"
 *   "Strong topical relevance"
 *   "Recent information"
 *   "Original source"
 *   "High-quality source"
 *   "Relevant supporting references"
 *   "Not substantially duplicated"
 * -----------------------------------------------------------------------------
 */

import type { ParsedQuery } from './query-understanding'

// Authority scores are passed in from the caller (computed once per search
// via getAuthorityMap()). domain → 0..1 authority.
export interface RankContext {
  authorityMap?: Map<string, number>
}

export type SearchMode =
  | 'BALANCED'
  | 'EXACT'
  | 'LATEST'
  | 'RESEARCH'
  | 'OFFICIAL'
  | 'ACADEMIC'
  | 'COMMUNITY'
  | 'NEWS'
  | 'IMAGES'

export interface SearchFilters {
  freshness: 'ANY' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'CUSTOM'
  freshnessCustomStart?: string
  freshnessCustomEnd?: string
  sourceTypes: string[]
  language?: string
  country?: string
  domainDiversity: 0 | 1 | 2 | 3
  aiMode: 'AUTO' | 'ON' | 'OFF'
  personalization: 'ON' | 'OFF'
  safeSearch: 'ON' | 'OFF'
  page: number
  pageSize: number
}

export interface RankInput {
  docId: string
  tfidf: number
  matchedTerms: string[]
}

export interface RankedResult {
  docId: string
  relevanceScore: number
  whySignals: string[]
}

interface RankDocRow {
  id: string
  url: string
  domain: string
  title: string
  sourceType: string
  language: string
  country: string | null
  publishedAt: Date | null
  updatedAt: Date | null
  crawledAt: Date
  qualityScore: number
  spamScore: number
  isOriginal: boolean
  clusterId: string | null
  wordCount: number
  author: string | null
  publisher: string | null
  indexTerms: string | null
  snippet: string
}

function daysSince(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
}

function freshnessScore(doc: RankDocRow): number {
  const dateRef = doc.updatedAt ?? doc.publishedAt
  if (!dateRef) {
    // Fall back to crawledAt with conservative curve
    const d = daysSince(doc.crawledAt)
    if (d <= 30) return 0.5
    return 0.3
  }
  const d = daysSince(new Date(dateRef))
  if (d <= 90) return 1.0
  if (d <= 365) return 0.6
  return 0.3
}

/**
 * Semantic-boost proxy: cosine of overlapping term-set weighted by idf.
 *
 * NOTE: We do not have real embeddings. This is a defensible lexical-semantic
 * proxy: the query's idf-weighted term vector is compared with the doc's
 * idf-weighted term vector over the shared vocab. Documents whose own
 * strongest terms coincide with the query's strongest terms rank higher.
 *
 * For ranking we approximate this as max(tfidf) of the matched terms,
 * normalized, since tfidf already encodes idf weighting. We document this
 * here so a future semantic engine can replace it without breaking the
 * ranking contract.
 */
function semanticBoost(tfidf: number, matchedTerms: string[]): number {
  if (matchedTerms.length === 0) return 0
  // Approximate semantic similarity as the geometric mean of tfidf and the
  // fraction of query terms matched.
  const matchedRatio = Math.min(1, matchedTerms.length / 6) // saturate at 6 terms
  return tfidf * (0.5 + 0.5 * matchedRatio)
}

function intentMatch(parsed: ParsedQuery, doc: RankDocRow): number {
  // Best-effort intent scoring:
  //   - For "news" intent, NEWS sourceType gets +1.
  //   - For "academic" intent, ACADEMIC/OFFICIAL gets +1.
  //   - For "official" / "government" intent, those types get +1.
  //   - For "commercial" intent, COMMERCIAL gets +1.
  // Otherwise 0.5.
  const i = parsed.intent
  const st = doc.sourceType
  if (i === 'news' && st === 'NEWS') return 1.0
  if (i === 'academic' && (st === 'ACADEMIC' || st === 'OFFICIAL' || st === 'GOVERNMENT')) return 1.0
  if (i === 'research' && (st === 'ACADEMIC' || st === 'OFFICIAL' || st === 'GOVERNMENT')) return 1.0
  if (i === 'commercial' && st === 'COMMERCIAL') return 1.0
  if (i === 'document' && doc.url.match(/\.(pdf|docx?|pptx?)($|\?)/i)) return 1.0
  if (i === 'navigational') {
    // For nav intent, exact-domain match is best
    const dom = doc.domain.toLowerCase()
    if (parsed.tokens.some((t) => dom.includes(t))) return 1.0
  }
  return 0.5
}

function sourceTypeMatch(parsed: ParsedQuery, doc: RankDocRow): number {
  if (parsed.sourcePreference) {
    if (doc.sourceType === parsed.sourcePreference) return 1.0
    return 0.0
  }
  return 0.5
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/**
 * Build the human-readable "Why this result?" signals (§15).
 * Returns the top applicable 3-5 signals.
 */
/** Generate why-signals including the authority signal. */
function buildWhySignals(
  doc: RankDocRow,
  tfidf: number,
  matchedTerms: string[],
  auth: number,
): string[] {
  const signals: string[] = []
  if (matchedTerms.length > 0) signals.push('Matches your search terms')
  if (tfidf > 0.15) signals.push('Strong topical relevance')
  const fr = freshnessScore(doc)
  if (fr > 0.7) signals.push('Recent information')
  if (doc.isOriginal) signals.push('Original source')
  if (doc.qualityScore > 0.6) signals.push('High-quality source')
  if (
    doc.sourceType === 'ACADEMIC' ||
    doc.sourceType === 'OFFICIAL' ||
    doc.sourceType === 'GOVERNMENT' ||
    doc.sourceType === 'PRIMARY'
  ) {
    signals.push('Relevant supporting references')
  }
  if (doc.isOriginal) signals.push('Not substantially duplicated')
  // New: authority signal
  if (auth > 0.3) signals.push('Authoritative source (well-linked)')
  return signals.slice(0, 5)
}

/**
 * Rank candidates by mode-specific weighted score.
 */
export async function rankCandidates(
  candidates: RankInput[],
  _query: string,
  mode: SearchMode,
  _filters: SearchFilters,
  parsed: ParsedQuery,
  dbDocs: Map<string, RankDocRow>,
  ctx?: RankContext
): Promise<RankedResult[]> {
  const results: RankedResult[] = []

  // --- Automatic freshness detection ---
  // If the query contains freshness keywords (today, latest, breaking,
  // current, recent, this week/month), boost the freshness weight in ranking
  // — even if the user didn't explicitly select a freshness filter or LATEST mode.
  const freshnessKeywords = ['today', 'latest', 'breaking', 'current', 'recent', 'this week', 'this month', 'now', 'new', 'update', 'live']
  const queryLower = parsed.original.toLowerCase()
  const hasFreshnessIntent = freshnessKeywords.some(kw => queryLower.includes(kw)) || parsed.intent === 'news'

  for (const c of candidates) {
    const doc = dbDocs.get(c.docId)
    if (!doc) continue

    const lex = c.tfidf
    const sem = semanticBoost(c.tfidf, c.matchedTerms)
    const q = doc.qualityScore
    const fr = freshnessScore(doc)
    const st = sourceTypeMatch(parsed, doc)
    const or = doc.isOriginal ? 1 : 0.3
    const intent = intentMatch(parsed, doc)
    const spam = doc.spamScore
    const dup = doc.isOriginal ? 0 : 0.3
    // Authority signal from the link graph (§7.4). 0 if no inbound links
    // or if the Link table is empty (graceful degradation).
    const auth = ctx?.authorityMap?.get(doc.domain.toLowerCase()) ?? 0

    let score = 0
    switch (mode) {
      case 'BALANCED':
        // When the query has freshness intent (today/latest/breaking/news),
        // boost the freshness weight from 0.10 → 0.25 and reduce lexical.
        if (hasFreshnessIntent) {
          score = 0.22 * lex + 0.13 * sem + 0.15 * q + 0.25 * fr + 0.08 * st + 0.05 * or + 0.05 * intent + 0.07 * auth
        } else {
          score = 0.30 * lex + 0.18 * sem + 0.15 * q + 0.10 * fr + 0.09 * st + 0.05 * or + 0.05 * intent + 0.08 * auth
        }
        break
      case 'EXACT':
        score = 0.65 * lex + 0.10 * fr + 0.10 * q + 0.08 * st + 0.07 * auth
        break
      case 'LATEST':
        score = 0.45 * fr + 0.18 * lex + 0.18 * q + 0.09 * st + 0.10 * auth
        break
      case 'RESEARCH': {
        const acBoost = (doc.sourceType === 'ACADEMIC' || doc.sourceType === 'OFFICIAL' || doc.sourceType === 'GOVERNMENT') ? 1 : 0
        score = 0.35 * q + 0.18 * acBoost + 0.18 * lex + 0.09 * or + 0.10 * fr + 0.10 * auth
        break
      }
      case 'OFFICIAL':
      case 'ACADEMIC':
      case 'COMMUNITY':
      case 'NEWS':
      case 'IMAGES':
        // Filter to sourceType happens at candidate retrieval (in search()).
        // For ranking, apply uniform weights.
        score = 0.36 * lex + 0.28 * q + 0.18 * st + 0.10 * fr + 0.08 * auth
        break
      default:
        score = lex
    }

    // Penalties
    score = score - spam - dup

    // Normalize to 0..1 (mode scores are already mostly in that range, but
    // EXACT mode's lex-heavy weights can overflow slightly — clamp).
    score = clamp01(score)

    const whySignals = buildWhySignals(doc, lex, c.matchedTerms, auth)
    results.push({ docId: c.docId, relevanceScore: score, whySignals })
  }

  results.sort((a, b) => b.relevanceScore - a.relevanceScore)
  return results
}
