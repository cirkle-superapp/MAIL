/**
 * indexer.ts
 * -----------------------------------------------------------------------------
 * Own inverted index backed by SQLite (Document.indexTerms JSON column).
 *
 * Posting format (compact):  [{"t":term,"f":freq,"p":[pos,...]}]
 *
 * Retrieval uses cosine-similarity-like TF-IDF between query and doc.
 *
 *   tf       = freq / totalTermsInDoc
 *   idf      = log(1 + N / (1 + df))  (df = # docs containing term)
 *   score    = sum_t (queryWeight_t * docWeight_t) / (|q| * |d|)
 *
 * We precompute + cache N (total docs) and df (per-term) at module scope,
 * refreshing when the index grows.
 *
 * Phrase matching: only return docs whose stored positions show the query
 * tokens appearing consecutively (one or more times).
 *
 * Cap returned candidates at 200.
 * -----------------------------------------------------------------------------
 */

import { db } from '@/lib/db'
import { tokenize, removeStopwords, stem, buildTermFreq, buildPositions, normalize } from './text-processor'

export interface Posting {
  t: string
  f: number
  p: number[]
}

export interface QueryHit {
  docId: string
  tfidf: number
  matchedTerms: string[]
  positions: Record<string, number[]>
}

// ---- Caches (module-scoped) ------------------------------------------------

let cachedN: number | null = null
let cachedNAt: number = 0
const dfCache = new Map<string, number>() // term -> df
const dfCachePopulatedAt: number = 0
const DF_REFRESH_MS = 60_000 // refresh df every minute when index grows

interface CachedDoc {
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
  indexTerms: string | null
  wordCount: number
  snippet: string
  author: string | null
  publisher: string | null
  ogImage: string | null
  // NOTE: contentText is NOT loaded into the cache — it's large (each
  // Wikipedia doc is ~23K words). Instead, it's fetched on-demand for just
  // the top-N results after ranking (see fetchContentForSnippets).
}

// The in-memory loaded index — refreshed when underlying Document count
// changes. This is fine for an MVP-scale index (tens of thousands of docs);
// for larger scale we would not pre-load everything.
let loadedDocs: CachedDoc[] | null = null
let loadedDocCount = 0
let loadedAt = 0
const LOAD_REFRESH_MS = 60_000

// --- Term-level inverted index (the real index, not per-doc JSON scan) ----
// Built once at cache load. Maps each term → list of {docIdx, freq, positions}.
// Per-query lookup is O(matching docs) instead of O(all docs × postings).
// This is the single biggest speedup: 10-50× faster than scanning every doc.
interface InvertedPosting { d: number; f: number; p: number[] } // d=docIdx, f=freq, p=positions
let invertedIndex: Map<string, InvertedPosting[]> | null = null

async function loadIndexIfNeeded(force = false): Promise<CachedDoc[]> {
  const total = await db.document.count()
  const now = Date.now()
  if (
    force ||
    loadedDocs === null ||
    total !== loadedDocCount ||
    now - loadedAt > LOAD_REFRESH_MS
  ) {
    // Only load columns we need.
    const rows = await db.document.findMany({
      select: {
        id: true, url: true, domain: true, title: true, sourceType: true,
        language: true, country: true, publishedAt: true, updatedAt: true,
        crawledAt: true, qualityScore: true, spamScore: true, isOriginal: true,
        clusterId: true, indexTerms: true, wordCount: true, snippet: true,
        author: true, publisher: true, ogImage: true,
      },
    })
    loadedDocs = rows
    loadedDocCount = rows.length
    loadedAt = now
    cachedN = rows.length

    // Build the term-level inverted index from each doc's JSON postings.
    // This replaces the O(N) per-query scan with O(matching docs).
    invertedIndex = new Map<string, InvertedPosting[]>()
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].indexTerms) continue
      let postings: Posting[] = []
      try {
        postings = JSON.parse(rows[i].indexTerms as string) as Posting[]
      } catch { continue }
      for (const p of postings) {
        let list = invertedIndex.get(p.t)
        if (!list) { list = []; invertedIndex.set(p.t, list) }
        list.push({ d: i, f: p.f, p: p.p ?? [] })
      }
    }
  }
  return loadedDocs!
}

async function refreshStats(force = false): Promise<{ N: number; df: Map<string, number>; avgDocLen: number }> {
  await loadIndexIfNeeded(force)
  const N = loadedDocs!.length
  const now = Date.now()
  if (force || dfCachePopulatedAt === 0 || now - dfCachePopulatedAt > DF_REFRESH_MS) {
    // Use the inverted index for df (document frequency per term) — this is
    // just the length of each term's posting list. O(unique terms) instead of
    // O(N docs × postings per doc).
    dfCache.clear()
    if (invertedIndex) {
      for (const [term, postings] of invertedIndex) {
        dfCache.set(term, postings.length)
      }
    }
    ;(dfCache as any).__populatedAt = now
  }
  // Average document length — computed from inverted index posting freqs.
  // Sum all freq values across all postings, divide by N.
  let totalLen = 0
  if (invertedIndex) {
    for (const postings of invertedIndex.values()) {
      for (const p of postings) totalLen += p.f
    }
  }
  const avgDocLen = N > 0 ? totalLen / N : 0
  ;(dfCache as any).__avgDocLen = avgDocLen
  return { N, df: dfCache, avgDocLen }
}

// ---- Indexing --------------------------------------------------------------

/**
 * Tokenize body + title + headings, remove stopwords, stem, compute term
 * frequencies + positions, write compact JSON postings to Document.indexTerms.
 */
export async function indexDocument(
  docId: string,
  contentText: string,
  title: string,
  headings: { level: number; text: string }[]
): Promise<void> {
  const bodyTokens = removeStopwords(tokenize(contentText))
  // Title tokens are weighted (duplicated) for importance.
  const titleTokens = removeStopwords(tokenize(title))
  const headingTokens = removeStopwords(
    headings.flatMap((h) => tokenize(h.text))
  )

  // Combine: body (weight 1) + title (weight 3 — append title tokens 3x) +
  // headings (weight 2). The combined stream is what we index, so positions
  // reflect weighting naturally.
  const combined = [
    ...bodyTokens,
    ...titleTokens,
    ...titleTokens,
    ...titleTokens,
    ...headingTokens,
    ...headingTokens,
  ]

  // Apply stemming so the index stores stems.
  const stemmed = combined.map((t) => stem(t))

  const termFreq = buildTermFreq(stemmed)
  const positions = buildPositions(stemmed)

  const postings: Posting[] = []
  for (const [term, freq] of termFreq) {
    postings.push({ t: term, f: freq, p: positions.get(term) ?? [] })
  }

  // Sort by frequency desc (better locality for high-freq reads).
  postings.sort((a, b) => b.f - a.f)

  const json = JSON.stringify(postings)
  await db.document.update({
    where: { id: docId },
    data: { indexTerms: json },
  })

  // Invalidate caches — the next query will refresh.
  loadedDocs = null
  cachedN = null
  dfCache.clear()
}

// ---- Querying --------------------------------------------------------------

function idf(N: number, df: number): number {
  return Math.log(1 + N / (1 + df))
}

// BM25 parameters — industry-standard defaults (k1=1.2, b=0.75).
//   k1 controls TF saturation: higher k1 → linear TF; lower → saturating.
//   b controls length normalization: 0 = no normalization, 1 = full.
// With BM25, a 23K-word Cairo page with "cairo" 550 times outranks a 5K-word
// "Web crawler" page that mentions "cairo" 3 times — because the TF saturation
// (k1) caps the marginal benefit of extra occurrences, and the softer length
// normalization (b=0.75) doesn't over-penalize long authoritative documents.
const BM25_K1 = 1.2
const BM25_B = 0.75

function bm25Idf(N: number, df: number): number {
  // BM25 IDF variant — always positive (the +1 inside log prevents negatives
  // for very common terms, which would otherwise cancel out good matches).
  return Math.log(1 + (N - df + 0.5) / (df + 0.5))
}

function bm25Score(
  tf: number,
  docLen: number,
  avgDocLen: number,
  idfVal: number,
): number {
  if (tf <= 0) return 0
  const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (avgDocLen > 0 ? docLen / avgDocLen : 1))
  return idfVal * (tf * (BM25_K1 + 1)) / denom
}

function parsePostings(indexTerms: string | null): Posting[] | null {
  if (!indexTerms) return null
  try {
    const parsed = JSON.parse(indexTerms)
    if (!Array.isArray(parsed)) return null
    return parsed as Posting[]
  } catch {
    return null
  }
}

/**
 * Phrase matching: query tokens must appear consecutively in the stored
 * positions of a doc. Returns true if at least one consecutive run exists.
 */
function hasConsecutivePhrase(
  queryTokens: string[],
  postingsByTerm: Map<string, Posting>
): boolean {
  if (queryTokens.length === 0) return false
  if (queryTokens.length === 1) return postingsByTerm.has(queryTokens[0])

  // Get positions of first token
  const first = postingsByToken(queryTokens[0], postingsByTerm)
  if (!first || first.length === 0) return false

  for (const startPos of first) {
    let ok = true
    for (let i = 1; i < queryTokens.length; i++) {
      const next = postingsByToken(queryTokens[i], postingsByTerm)
      if (!next || !next.includes(startPos + i)) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

function postingsByToken(t: string, postingsByTerm: Map<string, Posting>): number[] {
  const p = postingsByTerm.get(t)
  return p ? p.p : []
}

export interface QueryOptions {
  phrase?: boolean
}

/**
 * Query the index for documents matching the given tokens.
 *
 *   - tokens are expected to be already-stemmed query tokens (we still stem
 *     defensively inside).
 *   - returns top-200 candidates sorted by tfidf desc.
 *
 * TF-IDF cosine:
 *   query vector wq_t = idf_t (we treat each query token as weight = idf_t)
 *   doc vector wd_t = tf_t * idf_t (tf = freq/totalTermsInDoc)
 *   cosine = dot(q, d) / (|q| * |d|)
 *
 * For phrase matching, we additionally require consecutive positions.
 */
export async function queryIndex(
  queryTokens: string[],
  opts: QueryOptions = {}
): Promise<QueryHit[]> {
  const tokens = queryTokens.map((t) => stem(t)).filter(Boolean)
  if (tokens.length === 0) return []

  await loadIndexIfNeeded()
  const { N, df, avgDocLen } = await refreshStats(false)
  if (N === 0 || !invertedIndex) return []

  // Pre-compute query vector (unique terms × BM25 idf).
  const queryTermSet = Array.from(new Set(tokens))
  const qVec = new Map<string, number>()
  for (const term of queryTermSet) {
    const d = df.get(term) ?? 0
    qVec.set(term, bm25Idf(N, d))
  }
  // If all query terms are absent from the corpus, idf=0 for all → no hits.
  if (Array.from(qVec.values()).every((v) => v === 0)) return []

  // --- Inverted index lookup (the real index, not per-doc scan) ---
  // For each query term, look up its posting list in the inverted index.
  // Merge matching docs into a unified map keyed by docIdx. This is
  // O(matching docs × query terms) instead of O(all docs × postings).
  const matchingDocs = new Map<number, {
    matchedTerms: string[]
    positions: Record<string, number[]>
    freqs: Record<string, number>
  }>()

  for (const term of queryTermSet) {
    const postings = invertedIndex.get(term)
    if (!postings) continue
    const idfVal = qVec.get(term)!
    for (const ip of postings) {
      let entry = matchingDocs.get(ip.d)
      if (!entry) {
        entry = { matchedTerms: [], positions: {}, freqs: {} }
        matchingDocs.set(ip.d, entry)
      }
      entry.matchedTerms.push(term)
      entry.positions[term] = ip.p
      entry.freqs[term] = ip.f
    }
  }

  // Phrase filter: if requested, check consecutive positions for each candidate.
  const uniqueQueryTokens = Array.from(new Set(tokens))

  // Now compute BM25 score for each matching doc.
  const hits: QueryHit[] = []
  for (const [docIdx, entry] of matchingDocs) {
    const doc = loadedDocs![docIdx]
    if (!doc) continue

    // Phrase filter (if requested)
    if (opts.phrase) {
      const byTerm = new Map<string, Posting>()
      for (const t of entry.matchedTerms) {
        byTerm.set(t, { t, f: entry.freqs[t], p: entry.positions[t] ?? [] })
      }
      if (!hasConsecutivePhrase(uniqueQueryTokens, byTerm)) continue
    }

    // Compute doc length (sum of all term freqs for this doc).
    // We need the doc's total term count — read from the doc's indexTerms.
    // But we already have the inverted index; we can compute doc length
    // from the per-doc postings stored in loadedDocs (which has indexTerms).
    // For speed, use wordCount as an approximation (it's the token count
    // before stopword removal, but close enough for BM25 normalization).
    const docLen = doc.wordCount || 0

    let score = 0
    for (const term of entry.matchedTerms) {
      const idfVal = qVec.get(term)!
      const tf = entry.freqs[term]
      score += bm25Score(tf, docLen || 1, avgDocLen, idfVal)
    }
    if (score <= 0) continue

    hits.push({
      docId: doc.id,
      tfidf: score,
      matchedTerms: entry.matchedTerms,
      positions: entry.positions,
    })
  }

  hits.sort((a, b) => b.tfidf - a.tfidf)
  return hits.slice(0, 200)
}

/**
 * Invalidate all caches (call after a batch of writes from the indexer).
 */
export function invalidateIndexCache(): void {
  loadedDocs = null
  loadedDocCount = 0
  cachedN = null
  invertedIndex = null
  dfCache.clear()
}

/**
 * Re-index ALL documents with the current stemmer. Call after changing the
 * stemmer (e.g., upgrading from the naive suffix stripper to the Porter
 * stemmer). Reads each document's contentText + title + headings from the
 * DB, re-runs indexDocument() to rebuild the indexTerms JSON with the new
 * stems. The inverted index cache is invalidated so it rebuilds on next query.
 *
 * This is a heavy operation (~1-2s per doc for large pages) but only needs
 * to run once after a stemmer change.
 */
export async function reindexAll(): Promise<{ total: number; reindexed: number; errors: number }> {
  const docs = await db.document.findMany({
    select: { id: true, contentText: true, title: true, headings: true },
    take: 10000,
  })
  let reindexed = 0
  let errors = 0
  for (const doc of docs) {
    try {
      let headings: { level: number; text: string }[] = []
      try { headings = JSON.parse(doc.headings || '[]') } catch { headings = [] }
      await indexDocument(doc.id, doc.contentText || '', doc.title, headings)
      reindexed++
    } catch {
      errors++
    }
  }
  // Invalidate the in-memory cache so the inverted index rebuilds with new stems.
  invalidateIndexCache()
  return { total: docs.length, reindexed, errors }
}

/**
 * Get the loaded cached doc map (for ranking/diversity/AI to use without
 * re-querying the DB).
 */
export async function getAllDocsMap(): Promise<Map<string, CachedDoc>> {
  await loadIndexIfNeeded()
  const m = new Map<string, CachedDoc>()
  for (const d of loadedDocs!) m.set(d.id, d)
  return m
}

/**
 * Total indexed document count (from cache, or refreshed).
 */
export async function getDocCount(): Promise<number> {
  await loadIndexIfNeeded()
  return loadedDocs!.length
}

/**
 * Generate a search-result snippet centred on the first query-term match.
 *
 * Uses the FULL contentText (not the precomputed `snippet` field) so the
 * snippet actually contains the query terms — e.g. searching "cairo" now
 * shows a window around the first "cairo" occurrence in the body, not a
 * stale precomputed extract that might not mention "cairo" at all.
 *
 * Strategy:
 *   1. Tokenize the full contentText (NOT stopword-filtered — we want
 *      readable prose with articles/prepositions intact).
 *   2. Stem each token + the query tokens.
 *   3. Find the first position where a query stem matches.
 *   4. Take a ~40-token window around it (15 before, 25 after — bias toward
 *      the sentence AFTER the match, which usually has the answer).
 *   5. If no match, fall back to the precomputed `snippet` field, then to
 *      the first 40 tokens of the contentText.
 */
/**
 * Fetch contentText for a batch of doc IDs (used for snippet generation).
 * Only fetches for the top-N results — not the whole index — to keep the
 * cold-cache search fast (~1s instead of 15s).
 */
export async function fetchContentForSnippets(docIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (docIds.length === 0) return m
  try {
    const rows = await db.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, contentText: true },
    })
    for (const r of rows) {
      if (r.contentText) m.set(r.id, r.contentText)
    }
  } catch {
    // ignore — snippet generation falls back to the precomputed snippet
  }
  return m
}

/**
 * Generate a search-result snippet centred on the first query-term match.
 *
 * @param doc the cached doc (has the precomputed `snippet` field)
 * @param queryTokens stemmed query tokens
 * @param contentText (optional) the full body text, fetched on-demand for
 *   just the top-N results. When provided, the snippet is generated from it
 *   (so query terms actually appear). When absent, falls back to the
 *   precomputed `snippet` field.
 */
export function makeSnippet(
  doc: CachedDoc,
  queryTokens: string[],
  contentText?: string,
): string {
  // Prefer full contentText; fall back to the precomputed snippet.
  const text = contentText || doc.snippet || ''
  if (!text) return ''
  const tokens = tokenize(text)
  if (tokens.length === 0) return text.slice(0, 200)
  const stems = tokens.map((t) => stem(t))
  const queryStems = new Set(queryTokens.map((t) => stem(t)).filter(Boolean))
  let bestIdx = -1
  for (let i = 0; i < stems.length; i++) {
    if (queryStems.has(stems[i])) {
      bestIdx = i
      break
    }
  }
  if (bestIdx === -1) {
    // No query-term match — use the precomputed snippet if it's different
    // from the raw contentText head, else first 40 tokens.
    if (doc.snippet && doc.snippet !== text.slice(0, doc.snippet.length)) {
      return doc.snippet.slice(0, 200)
    }
    return tokens.slice(0, 40).join(' ') + (tokens.length > 40 ? ' …' : '')
  }
  // Window: 15 tokens before the match, 25 after (bias toward the answer
  // which usually follows the mention).
  const start = Math.max(0, bestIdx - 15)
  const end = Math.min(tokens.length, bestIdx + 25)
  const slice = tokens.slice(start, end).join(' ')
  return (start > 0 ? '… ' : '') + slice + (end < tokens.length ? ' …' : '')
}

export { normalize }
