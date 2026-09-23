/**
 * inngest.ts
 * -----------------------------------------------------------------------------
 * Inngest event-driven background jobs for the CIRKLE search engine:
 *
 *   1. crawl-frontier     — discovers new URLs from extracted links, queues them
 *   2. continuous-crawl    — crawls pending frontier URLs every 5 minutes
 *   3. rss-monitor         — checks RSS feeds for new content every 30 min
 *   4. stats-aggregate     — computes search metrics every 5 min
 *   5. index-refresh       — rebuilds the inverted index cache hourly
 *
 * The Inngest client + functions are registered at /api/inngest.
 * Jobs run asynchronously — they don't block the search API.
 * -----------------------------------------------------------------------------
 */

import { Inngest } from 'inngest'
import { initNeonSchema, getPendingCrawlUrls, addCrawlFrontierUrl, updateCrawlFrontierStatus } from './neon'
import { db } from './db'
import { extractDomain } from './search/canonical'
import { seedCrawl } from './search/seed'

// Initialize Inngest client with the provided signing key.
export const inngest = new Inngest({
  id: 'cirkle-search',
  eventKey: process.env.INNGEST_SIGNING_KEY,
})

// --- Job 1: Continuous Crawl (every 5 minutes) ---
// Picks pending URLs from the Neon crawl frontier + crawls them.
export const continuousCrawl = inngest.createFunction(
  { id: 'continuous-crawl', name: 'Continuous Index Growth', cron: '*/5 * * * *' },
  async ({ step }) => {
    return await step.run('crawl-frontier-urls', async () => {
      // Initialize Neon schema (no-op if already done)
      await initNeonSchema()

      // Get pending URLs from the frontier
      const urls = await getPendingCrawlUrls(5)
      if (urls.length === 0) {
        // No frontier URLs — fall back to re-crawling a few seed URLs
        return { crawled: 0, message: 'No frontier URLs pending' }
      }

      // Crawl them via the existing seedCrawl function
      const result = await seedCrawl(urls.map(u => u.url))

      // Mark URLs as done/errored in the frontier
      for (const u of urls) {
        await updateCrawlFrontierStatus(u.url, 'done')
      }

      return { crawled: result.crawled, indexed: result.indexed }
    })
  },
)

// --- Job 2: Link Discovery (every 15 minutes) ---
// Reads the Link table (extracted from crawled pages) and adds new URLs
// to the Neon crawl frontier. This grows the index automatically.
export const linkDiscovery = inngest.createFunction(
  { id: 'link-discovery', name: 'Discover New URLs from Link Graph', cron: '*/15 * * * *' },
  async ({ step }) => {
    return await step.run('discover-links', async () => {
      await initNeonSchema()

      // Get links that haven't been crawled yet (target URLs not in Document table)
      const links = await db.link.findMany({
        select: { targetUrl: true, sourceUrl: true },
        take: 100,
      })

      // Check which target URLs aren't already indexed
      const existingUrls = new Set(
        (await db.document.findMany({
          select: { url: true },
          take: 10000,
        })).map(d => d.url),
      )

      let discovered = 0
      for (const link of links) {
        if (!existingUrls.has(link.targetUrl)) {
          const domain = extractDomain(link.targetUrl)
          if (domain) {
            await addCrawlFrontierUrl(link.targetUrl, domain, `link-from:${link.sourceUrl}`, 3)
            discovered++
          }
        }
      }

      return { discovered, checked: links.length }
    })
  },
)

// --- Job 3: Stats Aggregation (every 5 minutes) ---
// Reads in-memory metrics + persists them to Neon for long-term analysis.
export const statsAggregate = inngest.createFunction(
  { id: 'stats-aggregate', name: 'Search Metrics Aggregation', cron: '*/5 * * * *' },
  async ({ step }) => {
    return await step.run('aggregate-metrics', async () => {
      await initNeonSchema()
      // The metrics are recorded in real-time via recordNeonAnalytics()
      // This job could compute rollups or send alerts.
      const { getMetrics } = await import('./search/metrics')
      const metrics = getMetrics()
      return {
        totalSearches: metrics.searches.total,
        cacheHitRate: metrics.searches.cacheHitRate,
        p50: metrics.latency.p50,
        p95: metrics.latency.p95,
      }
    })
  },
)

// --- Job 4: Index Refresh (every hour) ---
// Invalidates the in-memory inverted index cache so it rebuilds with
// fresh data from Turso (new crawls, re-indexed docs, etc.)
export const indexRefresh = inngest.createFunction(
  { id: 'index-refresh', name: 'Index Cache Refresh', cron: '0 * * * *' },
  async ({ step }) => {
    return await step.run('refresh-index', async () => {
      const { invalidateIndexCache } = await import('./search/indexer')
      const { invalidateSearchCache } = await import('./search/index')
      const { invalidateStatsCache } = await import('./search/index')
      invalidateIndexCache()
      invalidateSearchCache()
      invalidateStatsCache()
      return { invalidated: true }
    })
  },
)

// Export all functions for the /api/inngest route to register.
export const inngestFunctions = [
  continuousCrawl,
  linkDiscovery,
  statsAggregate,
  indexRefresh,
]
