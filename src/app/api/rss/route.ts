/**
 * POST /api/rss — Crawl RSS/Atom feeds for continuous news freshness.
 * Body: { feeds?: string[] } — if empty, uses the built-in RSS_FEED_URLS.
 *
 * Parses RSS 2.0 + Atom 1.0 feeds, extracts article URLs, adds them to
 * the CrawlQueue for indexing. Completely free — uses public RSS feeds.
 */
import { NextRequest, NextResponse } from 'next/server'
import { crawlRssFeeds } from '@/lib/search/crawler'
import { RSS_FEED_URLS } from '@/lib/search/large-seed'
import { invalidateStatsCache } from '@/lib/search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const feeds = Array.isArray(body?.feeds) && body.feeds.length > 0
    ? body.feeds.filter((f: string) => typeof f === 'string' && f.startsWith('http'))
    : RSS_FEED_URLS

  try {
    const result = await crawlRssFeeds(feeds)
    invalidateStatsCache()
    return NextResponse.json({
      feedsParsed: result.feedsParsed,
      articlesDiscovered: result.articlesDiscovered,
      feeds: feeds.length,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({
      feedsParsed: 0,
      articlesDiscovered: 0,
      error: String(err?.message ?? err),
    }, { status: 200 })
  }
}
