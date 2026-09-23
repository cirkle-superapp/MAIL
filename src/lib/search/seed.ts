/**
 * seed.ts
 * -----------------------------------------------------------------------------
 * Curated seed URLs (~45) spanning all source types — used to bootstrap the
 * search engine's own index. These are real, crawlable, high-quality URLs.
 *
 * `seedCrawl()` performs a real crawl:
 *   - For each URL: canonicalize, upsert CrawlQueue (status=pending), then
 *     immediately crawl+index by calling the orchestrator's
 *     `indexDocumentFromCrawl()`.
 *   - Per-domain throttle: min 1s between requests to the same domain.
 *   - Batches of 5 concurrent fetches.
 *   - 15s timeout per crawl.
 *   - Collects errors (does NOT throw).
 * -----------------------------------------------------------------------------
 */

import { db } from '@/lib/db'
import { fetchUrl, checkRobots, throttleDomain } from './crawler'
import { canonicalizeUrl, registeredDomain } from './canonical'
import { indexDocumentFromCrawl } from './index'

export const SEED_URLS: string[] = [
  // OFFICIAL
  'https://developer.mozilla.org/en-US/docs/Web',
  'https://www.w3.org/standards/',
  'https://www.rfc-editor.org/about',
  'https://kubernetes.io/docs/concepts/',
  'https://react.dev/learn',
  'https://nextjs.org/docs',
  'https://www.typescriptlang.org/docs/',
  'https://docs.python.org/3/',
  'https://go.dev/tour/',
  'https://doc.rust-lang.org/book/',
  'https://www.mozilla.org/en-US/mission/',
  'https://nodejs.org/en/docs',

  // ACADEMIC
  'https://arxiv.org/list/cs.AI/recent',
  'https://www.ieee.org/about/index.html',
  'https://www.acm.org/about-acm',
  'https://www.nature.com/nature/articles',

  // NEWS
  'https://www.reuters.com/world/',
  'https://www.bbc.com/news',
  'https://www.theguardian.com/world',
  'https://apnews.com/hub/world-news',
  'https://www.bloomberg.com/',
  'https://www.economist.com/',

  // COMMUNITY
  'https://stackoverflow.com/questions/tagged/python',
  'https://news.ycombinator.com/',
  'https://www.reddit.com/r/programming/wiki/index/',
  'https://github.com/trending',

  // GOVERNMENT
  'https://www.usa.gov/about',
  'https://www.gov.uk/about',
  'https://europa.eu/about-eu/eu-in-a-nutshell_en',

  // PRIMARY (press release pages)
  'https://press.un.org/en',
  'https://www.worldbank.org/en/news',

  // COMMERCIAL (a couple of clean product pages)
  'https://github.com/pricing',
  'https://linear.app/pricing',

  // Additional OFFICIAL docs
  'https://developers.google.com/style/',
  'https://docs.github.com/en',
  'https://docs.rs/',

  // More ACADEMIC
  'https://www.sciencedirect.com/',
  'https://www.science.org/',

  // More NEWS
  'https://www.theguardian.com/technology',
  'https://techcrunch.com/',
  'https://arstechnica.com/',
  'https://www.theverge.com/',

  // More COMMUNITY
  'https://stackoverflow.com/questions/tagged/javascript',
  'https://lobste.rs/',

  // More GOVERNMENT
  'https://www.gov.uk/government/organisations',
  'https://www.europeana.eu/en/about',

  // WIKIPEDIA — explicitly allows crawler-friendly access via the User-Agent.
  // These are high-quality, neutral, well-cited reference pages spanning
  // people, organizations, places, technologies, and concepts — perfect for
  // exercising the Knowledge Graph card.
  'https://en.wikipedia.org/wiki/JavaScript',
  'https://en.wikipedia.org/wiki/TypeScript',
  'https://en.wikipedia.org/wiki/React_(JavaScript_library)',
  'https://en.wikipedia.org/wiki/Node.js',
  'https://en.wikipedia.org/wiki/Python_(programming_language)',
  'https://en.wikipedia.org/wiki/Rust_(programming_language)',
  'https://en.wikipedia.org/wiki/Go_(programming_language)',
  'https://en.wikipedia.org/wiki/Linux',
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://en.wikipedia.org/wiki/Search_engine_(computing)',
  'https://en.wikipedia.org/wiki/Web_crawler',
  'https://en.wikipedia.org/wiki/Prisma_(software)',
  'https://en.wikipedia.org/wiki/Turso_(database)',
  'https://en.wikipedia.org/wiki/Cairo',
  'https://en.wikipedia.org/wiki/Egypt',
  'https://en.wikipedia.org/wiki/Arabic',

  // More OFFICIAL docs (allow crawling)
  'https://webpack.js.org/concepts/',
  'https://vitejs.dev/guide/',
  'https://vuejs.org/guide/introduction.html',
  'https://svelte.dev/docs/introduction',
  'https://www.dart.dev/language',
  'https://deno.land/manual',
  'https://bun.sh/docs',
  'https://www.prisma.io/docs/',
  'https://tailwindcss.com/docs/installation',
]

interface SeedResult {
  queued: number
  crawled: number
  indexed: number
  errors: { url: string; error: string }[]
}

/**
 * Run a seed crawl. If `urls` is omitted, uses SEED_URLS.
 *
 * Processing model:
 *   - Build a list of canonical URLs (skip duplicates + invalid).
 *   - Upsert each into CrawlQueue with status=pending.
 *   - Process URLs in batches of `batchSize` (default 5) concurrently.
 *   - For each URL: robots.txt check, throttle, fetch, then call
 *     indexDocumentFromCrawl().
 *   - Update CrawlQueue row: status=done|error, httpStatus, lastCrawledAt,
 *     contentHash.
 */
export async function seedCrawl(urls?: string[]): Promise<SeedResult> {
  const list = urls ?? SEED_URLS
  const result: SeedResult = {
    queued: 0,
    crawled: 0,
    indexed: 0,
    errors: [],
  }

  // Canonicalize + dedup
  const canonList: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const canon = canonicalizeUrl(raw)
    if (!canon) {
      result.errors.push({ url: raw, error: 'invalid URL' })
      continue
    }
    if (seen.has(canon)) continue
    seen.add(canon)
    canonList.push(canon)
  }

  // Upsert into CrawlQueue. We avoid the previous null-deref bug (calling
  // `.status` on a `findUnique` result that could be null) by simply setting
  // status='pending' on update — if a row is already 'fetching' from a
  // concurrent process, that's a race we accept for the dev seed tool.
  for (const url of canonList) {
    const domain = registeredDomain(url) ?? ''
    try {
      await db.crawlQueue.upsert({
        where: { url },
        create: {
          url,
          domain,
          priority: 5,
          discoverySrc: 'seed',
          status: 'pending',
        },
        update: {
          status: 'pending',
        },
      })
      result.queued++
    } catch {
      // ignore DB errors — the row may already exist with a unique constraint
    }
  }

  // Process in batches
  const batchSize = 5
  for (let i = 0; i < canonList.length; i += batchSize) {
    const batch = canonList.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (url) => {
        try {
          // Mark fetching
          try {
            await db.crawlQueue.update({
              where: { url },
              data: { status: 'fetching', lastCrawledAt: new Date() },
            })
          } catch {
            // ignore
          }

          // robots.txt compliance
          const robots = await checkRobots(url)
          if (!robots.allowed) {
            await db.crawlQueue.update({
              where: { url },
              data: { status: 'skipped', robotsAllowed: false, crawlDelayMs: robots.crawlDelayMs },
            })
            result.errors.push({ url, error: 'robots.txt disallow' })
            return
          }

          // Per-domain throttle
          await throttleDomain(url, Math.max(1000, robots.crawlDelayMs))

          // Fetch
          const fr = await fetchUrl(url, { timeoutMs: 15_000 })
          if (!fr.ok) {
            await db.crawlQueue.update({
              where: { url },
              data: { status: 'error', httpStatus: fr.status || null, retryCount: { increment: 1 } },
            })
            result.errors.push({ url, error: fr.error ?? `HTTP ${fr.status}` })
            return
          }
          result.crawled++

          // Index
          const indexed = await indexDocumentFromCrawl(
            url,
            fr.content,
            fr.finalUrl,
            fr.contentType
          )
          if (indexed.docId) {
            result.indexed++
            // Update any queue rows that match either the input URL or the
            // final/canonical URL (the crawler may have followed redirects
            // or canonicalization may have stripped a trailing slash).
            await db.crawlQueue.updateMany({
              where: { OR: [
                { url },
                { url: fr.finalUrl },
                ...(fr.finalUrl !== url ? [{ url: canonicalizeUrl(fr.finalUrl) ?? fr.finalUrl }] : []),
              ] },
              data: { status: 'done', httpStatus: fr.status, robotsAllowed: true, crawlDelayMs: robots.crawlDelayMs, contentHash: indexed.docId, lastCrawledAt: new Date() },
            })
          } else {
            await db.crawlQueue.updateMany({
              where: { OR: [{ url }, { url: fr.finalUrl }] },
              data: { status: 'error', httpStatus: fr.status },
            })
            result.errors.push({ url, error: indexed.error ?? 'indexing failed' })
          }
        } catch (e: any) {
          result.errors.push({ url, error: e?.message ?? String(e) })
          try {
            await db.crawlQueue.updateMany({
              where: { url },
              data: { status: 'error' },
            })
          } catch {
            // ignore
          }
        }
      })
    )
  }

  return result
}
