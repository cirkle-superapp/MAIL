# Task 2-a — full-stack-developer (search lib)

Task: Build the **core search-engine backend library** at `src/lib/search/` (16 files) — a real, independent, Google-class web search engine backend with its own crawler, parser, inverted index, ranking, spam/quality/diversity engines, dedup, query understanding, evidence-grounded AI summary, deep research pipeline, seed crawler, and orchestrator.

## Work Log

- Read `worklog.md` and the full 2258-line blueprint (`upload/Pasted Content_1790067699146.txt`) before writing any code.
- Inspected `prisma/schema.prisma` (CrawlQueue, Document, Link, Entity, SearchHistory, QueryLog, SponsoredAd, SavedSearch) — confirms `Document.indexTerms` (JSON postings column) and `clusterId` / `simhash` / `contentHash` fields exist.
- Inspected `package.json` — confirmed `z-ai-web-dev-sdk@0.0.18`, `prisma@6`, `next@16`, `react@19`, shadcn/ui New York. No cheerio/jsdom — built a focused regex/state-machine HTML parser instead.
- Verified dev server is already running on port 3000 (pid in `dev.log`) — did NOT restart it.

### Files produced (all under `/home/z/my-project/src/lib/search/`)

1. **text-processor.ts** — `tokenize` (unicode/CJK-aware), `normalize` (NFC), `stem` (minimal English suffix stripper), `stopwords` (~150 EN), `removeStopwords`, `ngrams`, `buildTermFreq`, `buildPositions`, `hash64` (FNV-1a-ish 64-bit), `simhash` (64-bit, 64 shingles, majority vote), `contentHash` (sha1).
2. **html-parser.ts** — defensive regex/state-machine parser. Extracts `title`, `metaDescription`, `metaKeywords`, `og:type`, `og:image`, `canonicalUrl`, `headings`, `bodyText` (strips script/style/noscript/template/svg + nav/footer/aside/header boilerplate), `links` (absolute URLs + anchor + rel), `wordCount`, `language`, `author`, `publisher`, `publishedAt`, `updatedAt`. Decodes entities. Never throws.
3. **canonical.ts** — `canonicalizeUrl` (lowercase scheme+host, strip default ports, drop fragments, strip trailing slash on path root, drop utm_*/fbclid/gclid/ref/ref_src tracking params, sort remaining query alphabetically). `extractDomain`, `registeredDomain` (handles multi-part TLDs like .co.uk).
4. **crawler.ts** — real `fetchUrl` (UA `NovaSearchBot/1.0`, default 15s timeout, 5-redirect cap, 2MB size cap, content-type allowlist, redirect-chain capture, manual redirect handling, AbortController timeouts). `checkRobots` (fetches `<origin>/robots.txt`, parses UA / Disallow / Allow / Crawl-delay, cached 1h TTL). `extractSitemapUrls` (parses `<loc>`, handles sitemap index recursion, 200-URL cap). `throttleDomain` (per-domain min-1s throttle).
5. **source-classifier.ts** — domain-rule tables for GOVERNMENT / ACADEMIC / NEWS / COMMUNITY / COMMERCIAL / OFFICIAL. `classifySource(domain, parsed)`. `maybeUpgradeToPrimary` (path patterns like /press/, /filings/, /regulations/ when domain is OFFICIAL/GOVERNMENT). `classifyUrl` convenience wrapper. Country from ccTLD map. Wikipedia explicitly treated as COMMUNITY.
6. **quality-engine.ts** — `assessQuality` computes `informationDensity` (200-5000 sweet spot), `originality` (1 default), `expertise` (+0.1 author/publisher, +0.1 citations, +0.1 authoritative domain), `freshness` (90d→1.0, 1y→0.6, older→0.3), `spamSignals` (keyword stuffing >8%, hidden-text detection, repeated meta keywords, >100 internal links). Composite `qualityScore = 0.35*density + 0.25*originality + 0.20*expertise + 0.10*freshness + 0.10*(1-spamSignals)`, clamped 0..1.
7. **spam-engine.ts** — `detectSpam` 9 signals (keyword stuffing, doorway, scraped, mass-generated, manipulative internal linking, link schemes, deceptive redirects, hidden text, fake structured data). Each contributes 0.15-0.3 to `spamScore`. `penalize=true` only when `spamScore >= 0.5` (per §14 single-weak-signal rule).
8. **dedup.ts** — `findDuplicate` queries Document by exact contentHash, then near-duplicate by simhash within Hamming ≤ 4 (computes `hammingDistance64` via BigInt popcount of XOR). Falls back to title+domain match as additional near signal. Returns `clusterKey` (contentHash prefix 12 chars) and `originalDocId`.
9. **indexer.ts** — own inverted index backed by `Document.indexTerms` JSON column (compact `[{"t","f","p":[]}]` postings). `indexDocument` (tokenize body + weighted title × 3 + weighted headings × 2, remove stopwords, stem, compute TF + positions, write JSON). `queryIndex` (TF-IDF cosine over query and doc vectors, optional phrase filter requiring consecutive positions, 200-candidate cap). In-memory cache (N + per-term df) refreshed when the underlying doc count changes. `makeSnippet` (30 words around first matched position). `getAllDocsMap`, `invalidateIndexCache`, `getDocCount`.
10. **ranking.ts** — `rankCandidates` applies mode-specific weighted scoring per §10:
    - BALANCED: 0.35 lex + 0.20 sem + 0.15 q + 0.10 fr + 0.10 st + 0.05 or + 0.05 intent
    - EXACT: 0.70 lex + 0.10 fr + 0.10 q + 0.10 st (no semantic)
    - LATEST: 0.50 fr + 0.20 lex + 0.20 q + 0.10 st
    - RESEARCH: 0.40 q + 0.20 academic/official boost + 0.20 lex + 0.10 or + 0.10 fr
    - OFFICIAL/ACADEMIC/COMMUNITY/NEWS: 0.40 lex + 0.30 q + 0.20 st + 0.10 fr (filter applied at retrieval)
    
    `semanticBoost` = idf-weighted lexical proxy (documented as such, not real embeddings — comment explains where to swap in real embeddings later). `whySignals` returns top 5 from §15 list ("Matches your search terms", "Strong topical relevance", "Recent information", "Original source", "High-quality source", "Relevant supporting references", "Not substantially duplicated"). Spam penalty `-spamScore`, duplicate penalty `-0.3 if !isOriginal`.
11. **diversity.ts** — `applyDiversity(rankedDocIds, dbDocs, maxPerDomain)`. Walks ranked list, tracks domain + cluster counts, suppresses extras but remembers them. **Never suppresses when there are < 2 distinct domains remaining in the tail** (per §12 anti-suppression rule). Returns kept + suppressed + clusters (with `primaryId`, `size`, `suppressedIds`).
12. **query-understanding.ts** — `parseQuery` (rule-based, no LLM). Extracts `"quoted phrases"`, `-exclusions`, `site:`, `filetype:`, `lang:`, `region:`, `after:`, `before:`, `official:` / `academic:` / etc operators. Intent classification by keyword matching (commercial/informational/news/academic/comparison/local/document/media/research/navigational/entity). Entity extraction (Person/Org/Place patterns). `expandQuery` calls `z-ai-web-dev-sdk` chat.completions for synonyms + related questions (server-side only, wrapped in try/catch, falls back to rule-based synonyms if LLM fails).
13. **ai-search.ts** — `generateAISummary` uses z-ai-web-dev-sdk with system prompt enforcing "ONLY the provided retrieved sources … cite source IDs in [n] form … do not fabricate". Parses claims (sentences with [n]) and citations, computes support status (DIRECTLY_SUPPORTED / MULTI_SOURCE / INDIRECT / CONFLICTING / INSUFFICIENT) based on unique cited sources + disagreement/insufficiency language. `generateResearchReport` implements the §28 Deep Research pipeline: LLM decomposes question into 3-6 sub-queries → each sub-query runs the orchestrator's `search()` (dynamic import to avoid module-load cycle) → source classification + cross-checking + dedup by URL → single LLM call synthesizes executive summary / key findings / evidence / contradictions / limitations. Returns structured `ResearchReport` with `steps` for UI progress.
14. **seed.ts** — `SEED_URLS` (~45 real high-quality crawlable URLs spanning OFFICIAL/ACADEMIC/NEWS/COMMUNITY/GOVERNMENT/PRIMARY/COMMERCIAL). `seedCrawl(urls?)` canonicalizes + dedups, upserts CrawlQueue rows (status=pending), processes in batches of 5 concurrently with per-domain throttle (min 1s), 15s timeout per crawl. Honors robots.txt. Collects errors (does NOT throw on individual failures). Returns `{ queued, crawled, indexed, errors[] }`.
15. **suggest.ts** — `suggest(prefix, limit=8)` queries QueryLog by case-insensitive prefix LIKE, ordered by frequency desc. Augments with rule-based completions (common phrasings: "how to" / "what is" / "best of" etc.) and pluralization. Never uses user-specific data.
16. **index.ts** (orchestrator) — Re-exports the full public API + types. `indexDocumentFromCrawl(rawUrl, rawHtml, finalUrl, contentType)` runs the full pipeline: canonicalize → parseHtml → classifySource → quality+spam+dedup → upsert Document → indexDocument (postings) → delete + create Link rows → mark CrawlQueue done. `search(query, mode, filters, opts)` is the main entry: parses query → loads all docs map → applies freshness/language/country/source-type/site filters at retrieval → queries indexer TF-IDF engine → ranks candidates with mode-specific weights → applies diversity → assembles full `SearchResponse` (results, clusters, sponsored, aiAnswer, relatedQuestions, didYouMean, pagination, personalized, personalizationFactors, indexStats). Sponsored ads matched by query keywords vs SponsoredAd.keywords JSON. AI summary invoked when aiMode != OFF (and mode is BALANCED/LATEST/RESEARCH/ACADEMIC/NEWS/OFFICIAL). SearchHistory persisted only if personalization ON + sessionId present. QueryLog always persisted (anonymized — only `query`, `normalized`, `frequency`). `getSource(id)` + `getStats()` helpers.

## End-to-end smoke test (performed before declaring done)

Verified with `bun -e`:
- `tokenize('Hello, World! 你好 apple bananas')` → `["hello","world","你好","apple","bananas"]` ✓ (CJK as single char)
- `stem('running') → 'runn'`, `stem('companies') → 'company'`, `stem('cats') → 'cat'` ✓
- `simhash('hello world this is a test').length === 16` ✓
- `contentHash('hello').length === 40` ✓ (sha1)
- `canonicalizeUrl('HTTPS://WWW.Example.COM:443/foo/bar/?utm_source=x&b=2&a=1#frag')` → `'https://www.example.com/foo/bar?a=1&b=2'` ✓
- `parseHtml(...)` correctly extracted title, meta description, og:type, og:image, canonical, lang, headings, links (with absolute URLs + rel), stripped script/nav/footer content from bodyText ✓
- `indexDocumentFromCrawl('https://nextjs.org/docs', '<html>...')` → returned `docId` ✓
- `search('next.js react framework', 'BALANCED', ...)` returned 1 result with `sourceType: 'OFFICIAL'` (nextjs.org is in OFFICIAL_DOMAIN_HINTS), 5 why-signals, pagination, and indexStats ✓
- `seedCrawl(['https://nextjs.org/docs','https://www.python.org/about/'])` returned `{queued: 2, crawled: 2, indexed: 2, errors: []}` ✓ (real fetches via `fetch()` with UA NovaSearchBot/1.0)
- `bun run lint` — clean (0 errors, 0 warnings)
- Dev server still running on port 3000 (verified via `dev.log`)

## Stage Summary

- **Files produced**: 16 TypeScript ESM files under `/home/z/my-project/src/lib/search/`. All cross-file imports use relative paths within the same directory. All DB access uses `import { db } from '@/lib/db'`. All `z-ai-web-dev-sdk` usage is server-side only (in `query-understanding.expandQuery`, `ai-search.generateAISummary`, and `ai-search.generateResearchReport` — all via `await import('z-ai-web-dev-sdk')` so the SDK never leaks to client bundle).
- **Key decisions**:
  - Used BigInt-based popcount for `hammingDistance64` (correctness over micro-perf; off the hot path).
  - Used two-32-bit-halves emulation for `hash64` (avoids BigInt on the hot path of `simhash` shingle hashing).
  - `queryIndex` loads the whole Document table into an in-memory cache (refreshed when count changes or every 60s) — fine for MVP-scale (tens of thousands of docs); would be replaced by a proper postings-list store at scale.
  - `semanticBoost` is explicitly documented as a defensible lexical-semantic proxy (cosine of overlapping term-set weighted by idf) so a future real-embedding engine can drop in without breaking the ranking contract.
  - `applyDiversity` precomputes "remaining distinct domains in tail" so it never artificially suppresses results when no real alternatives exist (per §12).
  - `ai-search.generateResearchReport` uses `await import('./index')` for the recursive search calls to avoid a module-load cycle.
  - `seedCrawl` uses `db.crawlQueue.updateMany` with `OR` conditions on both the input URL and the post-redirect / post-canonicalization final URL so it doesn't throw when the doc URL differs from the queue URL (e.g. trailing-slash stripping).
- **Gaps / known limitations**:
  - HTML parser is regex/state-machine based — handles real-world HTML well (tested against nextjs.org + python.org) but isn't a full DOM; very deeply nested malformed HTML may produce slightly imperfect text. Acceptable for MVP.
  - No real semantic embeddings (BM25 / TF-IDF cosine + lexical-semantic proxy). Documented in code; the spec §7.2 explicitly mentions semantic index as a future phase.
  - `getSource(id)` returns `{ ... contentCategories: [sourceType] }` — a single-element list because we don't yet have a separate Document.categories field. Acceptable: the spec §16 lists categories derivable from sourceType.
  - `makeSnippet` falls back to first 30 tokens when no query token matches — basic but functional.
  - `expandQuery` falls back to rule-based synonyms when LLM is unavailable — graceful.
  - The crawler does not yet do JS rendering (Next.js / React SPA docs are mostly SSR-rendered at the seed URLs chosen, so this is acceptable for MVP). §4 mentions JS rendering "for selected pages" — out of scope for this task.
  - No unit tests were written (per task rules).
- **All Done criteria met**:
  - ✅ All 16 files created and lint-clean
  - ✅ `index.ts` exports a working `search()` that produces real results against the local index
  - ✅ `seedCrawl()` from `seed.ts` can be invoked and actually fetches + indexes real URLs
  - ✅ Work record appended to `/home/z/my-project/worklog.md`
