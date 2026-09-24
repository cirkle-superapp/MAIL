/**
 * types.ts
 * -----------------------------------------------------------------------------
 * Shared client-side type definitions for the CIRKLE frontend. These
 * mirror the shapes returned by the search-engine backend API
 * (see `src/lib/search/index.ts` + `src/lib/search/ai-search.ts`) but are
 * redefined here so client bundles never need to import the server-side
 * search library (which transitively touches Prisma + the LLM client).
 */

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

export type SourceType =
  | 'OFFICIAL'
  | 'GOVERNMENT'
  | 'ACADEMIC'
  | 'NEWS'
  | 'COMMUNITY'
  | 'COMMERCIAL'
  | 'PRIMARY'
  | 'WEB'

export type Freshness =
  | 'ANY'
  | 'HOUR'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'YEAR'
  | 'CUSTOM'

export type AiMode = 'AUTO' | 'ON' | 'OFF'

export type Personalization = 'ON' | 'OFF'

export type SafeSearch = 'ON' | 'OFF'

export interface SearchFilters {
  freshness: Freshness
  freshnessCustomStart?: string
  freshnessCustomEnd?: string
  sourceTypes: SourceType[]
  language?: string
  country?: string
  domainDiversity: 0 | 1 | 2 | 3
  aiMode: AiMode
  personalization: Personalization
  safeSearch: SafeSearch
  page: number
  pageSize: number
}

export interface SearchResult {
  id: string
  title: string
  url: string
  domain: string
  snippet: string
  sourceType: string
  publishedAt: string | null
  updatedAt: string | null
  language: string
  country: string | null
  isOriginal: boolean
  clusterId: string | null
  clusterSize: number
  whyThisResult: string[]
  relevanceScore: number
  qualityScore: number
  author: string | null
  docType: string
  ogImage: string | null
}

export interface SearchSponsored {
  id: string
  advertiser: string
  headline: string
  displayUrl: string
  targetUrl: string
  snippet: string
  whyAdReason: string
}

export interface SearchCluster {
  id: string
  primaryId: string
  size: number
  suppressedIds: string[]
}

export interface SearchPagination {
  page: number
  pageSize: number
  totalResults: number
  totalPages: number
}

export interface IndexStats {
  documents: number
  domains: number
  indexSize: number
  lastCrawl: string | null
}

export type AiSupportStatus =
  | 'DIRECTLY_SUPPORTED'
  | 'MULTI_SOURCE'
  | 'INDIRECT'
  | 'CONFLICTING'
  | 'INSUFFICIENT'

export interface AiCitation {
  id: number
  title: string
  url: string
  snippet: string
  sourceType: string
}

export interface AiClaim {
  text: string
  citations: number[]
}

export interface AiConflict {
  a: string
  b: string
  reason: string
}

export interface AiAnswer {
  answer: string
  claims: AiClaim[]
  citations: AiCitation[]
  supportStatus: AiSupportStatus
  conflicts?: AiConflict[]
  generatedAt: string
}

// --- Knowledge Graph entity card (§7.3, §23) -------------------------------

export interface KnowledgeFact {
  label: string
  value: string
  citations: number[]
}

export interface KnowledgeCard {
  entityName: string
  entityType: string
  description: string
  facts: KnowledgeFact[]
  citations: AiCitation[]
  confidenceClass: 'HIGH' | 'MEDIUM' | 'LOW'
  generatedAt: string
}

// --- Instant answer (real-time tools: weather / time / math) -------------

export type InstantAnswerKind = 'weather' | 'time' | 'math' | 'convert' | 'currency'

export interface InstantAnswer {
  kind: InstantAnswerKind
  title: string
  summary: string
  facts: { label: string; value: string }[]
  source: string
  sourceUrl?: string
  fetchedAt: string
}

// --- Live web fallback (supplementary results when index is empty) --------

export interface LiveWebResult {
  title: string
  url: string
  snippet: string
  domain: string
  sourceType: string
}

export interface SearchResponse {
  query: string
  interpretedQuery: string
  instantAnswer: InstantAnswer | null
  liveWebResults: LiveWebResult[]
  aiAnswer: AiAnswer | null
  knowledgeCard: KnowledgeCard | null
  sponsored: SearchSponsored[]
  results: SearchResult[]
  clusters: SearchCluster[]
  relatedQuestions: string[]
  didYouMean: string | null
  pagination: SearchPagination
  personalized: boolean
  personalizationFactors: string[]
  indexStats: IndexStats
}

// --- Lazy AI layer (fetched after results render) -------------------------

export interface AILayer {
  aiAnswer: AiAnswer | null
  knowledgeCard: KnowledgeCard | null
  relatedQuestions: string[]
}

// --- Deep Research report shape -------------------------------------------

export interface ResearchStep {
  step: string
  status: string // 'pending' | 'in_progress' | 'done' | 'failed'
}

export interface ResearchEvidence {
  claim: string
  sources: number[]
  support: string
}

export interface ResearchSource {
  id: number
  title: string
  url: string
  snippet: string
  sourceType: string
}

export interface ResearchReport {
  subQueries: string[]
  steps: ResearchStep[]
  executiveSummary: string
  keyFindings: string[]
  evidence: ResearchEvidence[]
  contradictions: AiConflict[]
  limitations: string
  sources: ResearchSource[]
  generatedAt: string
}

// --- Source profile (GET /api/source/[id]) --------------------------------

export interface SourceProfile {
  id: string
  publisher: string | null
  sourceType: string
  country: string | null
  language: string
  firstIndexed: string
  lastCrawled: string
  lastUpdate: string | null
  isOriginal: boolean
  contentCategories: string[]
  relatedPrimarySources: {
    id: string
    title: string
    url: string
    sourceType: string
    crawledAt: string
  }[]
  documentsInIndex: number
  domain: string
}

// --- Seed crawl response (POST /api/seed) --------------------------------

export interface SeedCrawlResponse {
  queued: number
  crawled: number
  indexed: number
  errors: string[]
}

// --- Suggest response (GET /api/suggest?q=...) ---------------------------

export interface SuggestResponse {
  suggestions: string[]
}

// --- Stats response (GET /api/stats) -------------------------------------

export interface StatsResponse {
  documents: number
  domains: number
  queueDepth: number
  lastCrawl: string | null
  crawlErrors: number
  indexSize: number
}
