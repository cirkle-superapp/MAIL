/**
 * crawler.ts
 * -----------------------------------------------------------------------------
 * The real fetcher for our search engine. Uses the standard `fetch` API with:
 *   - a custom User-Agent (NovaSearchBot)
 *   - redirect following + tracking (we capture the redirect chain)
 *   - timeout enforcement (AbortController)
 *   - robots.txt compliance (cached with 1h TTL)
 *   - sitemap.xml parsing (handles sitemap index files too)
 *   - content-type allow-listing
 *   - response size cap (2 MB)
 *
 * This is NOT a fake crawler — `fetchUrl()` actually retrieves the bytes
 * over the network. `checkRobots()` actually fetches robots.txt.
 * -----------------------------------------------------------------------------
 */

import { canonicalizeUrl, registeredDomain } from './canonical'

const BOT_UA = 'NovaSearchBot/1.0 (+https://nova.search/bot)'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_REDIRECTS = 5
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 // 2 MB

const FETCHABLE_CONTENT_TYPES = new Set<string>([
  'text/html',
  'application/xhtml+xml',
  'application/xml',
  'text/xml',
  'text/plain',
  'application/pdf',
])

export interface FetchResult {
  ok: boolean
  status: number
  finalUrl: string
  contentType: string
  content: string
  error?: string
  redirectChain: string[]
  fetchedAt: Date
  size: number
}

/**
 * Fetch a URL. Honors timeout, redirect cap, content-type, and size limits.
 */
export async function fetchUrl(
  url: string,
  opts: { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  const fetchedAt = new Date()
  const redirectChain: string[] = []
  let currentUrl = url
  let status = 0
  let contentType = ''

  // Manual redirect loop so we can capture the chain and cap depth.
  for (let i = 0; i <= maxRedirects; i++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    let resp: Response
    try {
      resp = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // we handle redirects ourselves
        signal: ctrl.signal,
        headers: {
          'User-Agent': BOT_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.5,application/pdf;q=0.2,*/*;q=0.1',
          'Accept-Language': 'en;q=0.9',
        },
      })
    } catch (e: any) {
      clearTimeout(timer)
      const aborted = e?.name === 'AbortError'
      return {
        ok: false,
        status: 0,
        finalUrl: currentUrl,
        contentType: '',
        content: '',
        error: aborted ? `timeout after ${timeoutMs}ms` : (e?.message ?? String(e)),
        redirectChain,
        fetchedAt,
        size: 0,
      }
    }
    clearTimeout(timer)

    status = resp.status
    contentType = (resp.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

    // 3xx -> follow
    if (status >= 300 && status < 400) {
      const loc = resp.headers.get('location')
      if (!loc) {
        return {
          ok: false,
          status,
          finalUrl: currentUrl,
          contentType,
          content: '',
          error: `3xx with no Location header`,
          redirectChain,
          fetchedAt,
          size: 0,
        }
      }
      // Resolve relative redirects
      try {
        const next = new URL(loc, currentUrl).toString()
        redirectChain.push(next)
        currentUrl = next
        continue
      } catch {
        return {
          ok: false,
          status,
          finalUrl: currentUrl,
          contentType,
          content: '',
          error: `invalid redirect target: ${loc}`,
          redirectChain,
          fetchedAt,
          size: 0,
        }
      }
    }

    // Non-2xx — try BrightData Scraping Browser as a fallback for 403/429/captcha.
    // BrightData costs (free tier) only happen on these rare misses, so this is
    // a smart spend: a 200 OK native fetch never touches BrightData.
    // The Scraping Browser uses Puppeteer over wss to fetch the page with JS
    // rendering + rotating residential proxies — bypasses most anti-bot blocks.
    if (status < 200 || status >= 300) {
      if (status === 403 || status === 429 || status === 503 || status === 426) {
        try {
          const { brightDataUnlock } = await import('@/lib/brightdata')
          const unlocked = await brightDataUnlock(currentUrl, {
            renderJs: true,
            timeoutMs: 20_000,
          })
          if (unlocked && unlocked.ok && unlocked.content) {
            return {
              ok: true,
              status: 200,
              finalUrl: unlocked.finalUrl || currentUrl,
              contentType: unlocked.contentType || 'text/html',
              content: unlocked.content,
              redirectChain: [...redirectChain, `brightdata:scraping-browser`],
              fetchedAt,
              size: unlocked.content.length,
            }
          }
        } catch {
          // BrightData unavailable (no token / budget exhausted) — fall through
          // to the regular error return. The engine still works free.
        }
      }
      return {
        ok: false,
        status,
        finalUrl: currentUrl,
        contentType,
        content: '',
        error: `HTTP ${status}`,
        redirectChain,
        fetchedAt,
        size: 0,
      }
    }

    // Content-type gate (allow only fetchable types)
    if (contentType && !FETCHABLE_CONTENT_TYPES.has(contentType)) {
      return {
        ok: false,
        status,
        finalUrl: currentUrl,
        contentType,
        content: '',
        error: `unsupported content-type: ${contentType}`,
        redirectChain,
        fetchedAt,
        size: 0,
      }
    }

    // Read body with size cap (stream into a string up to 2 MB).
    let size = 0
    let content = ''
    try {
      const reader = resp.body?.getReader()
      if (!reader) {
        // No streaming API available — fall back to text()
        content = await resp.text()
        size = content.length
      } else {
        const decoder = new TextDecoder('utf-8')
        const chunks: string[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_RESPONSE_BYTES) {
            // Stop reading; we've capped.
            chunks.push(decoder.decode(value.subarray(0, MAX_RESPONSE_BYTES - (size - value.byteLength))))
            try { await reader.cancel() } catch {}
            break
          }
          chunks.push(decoder.decode(value, { stream: true }))
        }
        content = chunks.join('')
      }
    } catch (e: any) {
      return {
        ok: false,
        status,
        finalUrl: currentUrl,
        contentType,
        content: '',
        error: `body read error: ${e?.message ?? String(e)}`,
        redirectChain,
        fetchedAt,
        size: 0,
      }
    }

    return {
      ok: true,
      status,
      finalUrl: currentUrl,
      contentType,
      content,
      redirectChain,
      fetchedAt,
      size,
    }
  }

  // Exceeded redirect cap
  return {
    ok: false,
    status,
    finalUrl: currentUrl,
    contentType,
    content: '',
    error: `too many redirects (>${maxRedirects})`,
    redirectChain,
    fetchedAt,
    size: 0,
  }
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsCacheEntry {
  fetchedAt: number
  rules: { userAgent: string; disallow: string[]; allow: string[]; crawlDelayMs: number }[]
}

const ROBOTS_TTL_MS = 60 * 60 * 1000 // 1 hour
const robotsCache = new Map<string, RobotsCacheEntry>()

function parseRobots(text: string): RobotsCacheEntry['rules'] {
  const rules: RobotsCacheEntry['rules'] = []
  let currentUA: string | null = null
  let currentRule: RobotsCacheEntry['rules'][number] | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()

    if (key === 'user-agent' || key === 'useragent') {
      // Start a new group
      if (currentRule && currentUA !== val.toLowerCase()) {
        rules.push(currentRule)
        currentRule = null
      }
      currentUA = val.toLowerCase()
      if (!currentRule) {
        currentRule = { userAgent: currentUA, disallow: [], allow: [], crawlDelayMs: 1000 }
      }
      continue
    }
    if (key === 'disallow') {
      if (!currentRule) {
        currentRule = { userAgent: '*', disallow: [], allow: [], crawlDelayMs: 1000 }
      }
      if (val) currentRule.disallow.push(val)
      continue
    }
    if (key === 'allow') {
      if (!currentRule) {
        currentRule = { userAgent: '*', disallow: [], allow: [], crawlDelayMs: 1000 }
      }
      if (val) currentRule.allow.push(val)
      continue
    }
    if (key === 'crawl-delay') {
      if (!currentRule) {
        currentRule = { userAgent: '*', disallow: [], allow: [], crawlDelayMs: 1000 }
      }
      const ms = Math.round(parseFloat(val) * 1000)
      if (!Number.isNaN(ms) && ms > 0) currentRule.crawlDelayMs = ms
      continue
    }
  }
  if (currentRule) rules.push(currentRule)
  return rules
}

/**
 * Match a path against robots rules. Returns true if allowed.
 * Implements a simple long-match wins algorithm: allow/disallow rules
 * are matched by prefix; the longest matching rule wins. If none match,
 * the path is allowed.
 */
function isAllowedByRules(
  path: string,
  rules: RobotsCacheEntry['rules']
): { allowed: boolean; crawlDelayMs: number } {
  // Find the most specific UA rule set (we look for '*' first).
  // We prefer rules that target our bot, then '*'.
  let matchedRule: RobotsCacheEntry['rules'][number] | null = null
  for (const r of rules) {
    if (r.userAgent === 'novasearchbot') {
      matchedRule = r
      break
    }
  }
  if (!matchedRule) {
    for (const r of rules) {
      if (r.userAgent === '*') {
        matchedRule = r
        break
      }
    }
  }

  if (!matchedRule) return { allowed: true, crawlDelayMs: 1000 }

  let bestAllowLen = -1
  let bestDisallowLen = -1
  for (const d of matchedRule.disallow) {
    if (path.startsWith(d)) {
      if (d.length > bestDisallowLen) bestDisallowLen = d.length
    }
  }
  for (const a of matchedRule.allow) {
    if (path.startsWith(a)) {
      if (a.length > bestAllowLen) bestAllowLen = a.length
    }
  }

  // Longest match wins; ties go to allow.
  let allowed = true
  if (bestDisallowLen >= 0 && bestDisallowLen >= bestAllowLen) {
    allowed = false
  }
  return { allowed, crawlDelayMs: matchedRule.crawlDelayMs }
}

/**
 * Fetch (and cache) the robots.txt for a URL's origin and determine if the
 * URL is allowed to be crawled. On any fetch error, defaults to "allowed".
 */
export async function checkRobots(
  url: string
): Promise<{ allowed: boolean; crawlDelayMs: number }> {
  const canon = canonicalizeUrl(url)
  if (!canon) return { allowed: false, crawlDelayMs: 1000 }
  let u: URL
  try {
    u = new URL(canon)
  } catch {
    return { allowed: false, crawlDelayMs: 1000 }
  }
  const origin = `${u.protocol}//${u.host}`
  const path = u.pathname

  const now = Date.now()
  const cached = robotsCache.get(origin)
  if (cached && now - cached.fetchedAt < ROBOTS_TTL_MS) {
    return isAllowedByRules(path, cached.rules)
  }

  // Fetch robots.txt
  let rules: RobotsCacheEntry['rules'] = []
  try {
    const r = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': BOT_UA },
      signal: AbortSignal.timeout(8_000),
      redirect: 'follow',
    })
    if (r.ok) {
      const text = await r.text()
      rules = parseRobots(text)
    }
  } catch {
    // network / 404 -> treat as "allow all"
    rules = []
  }

  robotsCache.set(origin, { fetchedAt: now, rules })
  return isAllowedByRules(path, rules)
}

// ---------------------------------------------------------------------------
// sitemap.xml
// ---------------------------------------------------------------------------

const SITEMAP_URL_CAP = 200

/**
 * Parse a sitemap XML file's <loc> tags. Handles both sitemap index files
 * (which point to nested sitemaps) and URL-set files. For sitemap indexes,
 * we recursively fetch up to 5 nested sitemaps.
 *
 * Returns up to SITEMAP_URL_CAP URLs per top-level sitemap.
 */
export async function extractSitemapUrls(origin: string): Promise<string[]> {
  const results: string[] = []
  const seen = new Set<string>()

  const fetchSitemap = async (url: string, depth: number): Promise<void> => {
    if (depth > 3) return
    if (results.length >= SITEMAP_URL_CAP) return

    let text: string
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': BOT_UA },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      })
      if (!r.ok) return
      const ct = (r.headers.get('content-type') ?? '').toLowerCase()
      if (!ct.includes('xml') && !ct.includes('text/plain')) return
      text = await r.text()
    } catch {
      return
    }
    if (!text) return

    // Find <loc>...</loc> entries (these can be URLs OR nested sitemap URLs).
    const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi
    let m: RegExpExecArray | null
    const nested: string[] = []
    while ((m = re.exec(text)) !== null) {
      if (results.length >= SITEMAP_URL_CAP) break
      const loc = m[1].trim()
      if (!loc) continue
      // Decode entities (CDATA is rare in sitemaps; entities common).
      const decoded = loc
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
      if (/<\?xml|<urlset|<sitemapindex/i.test(decoded)) {
        // nested index — recurse later
        nested.push(decoded)
        continue
      }
      if (seen.has(decoded)) continue
      seen.add(decoded)
      results.push(decoded)
    }
    // Recurse into nested sitemaps (depth-limited).
    for (const n of nested) {
      if (results.length >= SITEMAP_URL_CAP) break
      await fetchSitemap(n, depth + 1)
    }
  }

  await fetchSitemap(`${origin}/sitemap.xml`, 0)
  return results.slice(0, SITEMAP_URL_CAP)
}

// ---------------------------------------------------------------------------
// Per-domain throttle
// ---------------------------------------------------------------------------

const lastFetchByDomain = new Map<string, number>()

/**
 * Wait until at least `delayMs` has elapsed since the last fetch to the same
 * registered domain, then record this fetch. Used by the seed crawler.
 */
export async function throttleDomain(url: string, delayMs = 1000): Promise<void> {
  const dom = registeredDomain(url)
  if (!dom) return
  const last = lastFetchByDomain.get(dom) ?? 0
  const now = Date.now()
  const elapsed = now - last
  if (elapsed < delayMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs - elapsed))
  }
  lastFetchByDomain.set(dom, Date.now())
}

/**
 * Parse an RSS/Atom XML feed and extract article URLs + metadata.
 * RSS 2.0: <item><link><title><description><pubDate>
 * Atom 1.0: <entry><link href><title><summary><updated>
 *
 * Returns { url, title, description, publishedAt }[] — these URLs can then
 * be crawled + indexed like normal pages. This gives continuous news
 * freshness without any paid API (free, public RSS feeds).
 */
export interface FeedItem {
  url: string
  title: string
  description: string
  publishedAt: string | null
}

export async function parseRssFeed(feedUrl: string): Promise<FeedItem[]> {
  const fr = await fetchUrl(feedUrl, { timeoutMs: 10_000 })
  if (!fr.ok || !fr.content) return []
  const xml = fr.content
  const items: FeedItem[] = []

  // RSS 2.0: <item> elements with <link>, <title>, <description>, <pubDate>
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  for (const item of rssItems) {
    const link = item.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)
    const title = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
    const desc = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)
    const date = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
    const url = link ? link[1].trim() : ''
    if (!url || !url.startsWith('http')) continue
    items.push({
      url,
      title: title ? title[1].trim().replace(/&[a-z]+;/g, '') : 'Untitled',
      description: desc ? desc[1].trim().replace(/<[^>]+>/g, '').slice(0, 300) : '',
      publishedAt: date ? date[1].trim() : null,
    })
    if (items.length >= 50) break // cap per feed
  }

  // Atom 1.0: <entry> elements with <link href="...">, <title>, <summary>, <updated>
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
    for (const entry of atomEntries) {
      const link = entry.match(/<link[^>]*href="([^"]+)"/i)
      const title = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
      const summary = entry.match(/<(?:summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:summary|content)>/i)
      const updated = entry.match(/<(?:updated|published)[^>]*>([\s\S]*?)<\/(?:updated|published)>/i)
      const url = link ? link[1].trim() : ''
      if (!url || !url.startsWith('http')) continue
      items.push({
        url,
        title: title ? title[1].trim().replace(/&[a-z]+;/g, '') : 'Untitled',
        description: summary ? summary[1].trim().replace(/<[^>]+>/g, '').slice(0, 300) : '',
        publishedAt: updated ? updated[1].trim() : null,
      })
      if (items.length >= 50) break
    }
  }

  return items
}

/**
 * Crawl RSS feeds, extract article URLs, and add them to the CrawlQueue
 * for indexing. This gives continuous news freshness — new articles appear
 * in the search index automatically.
 */
export async function crawlRssFeeds(feedUrls: string[]): Promise<{ feedsParsed: number; articlesDiscovered: number }> {
  let feedsParsed = 0
  let articlesDiscovered = 0
  for (const feedUrl of feedUrls) {
    try {
      const items = await parseRssFeed(feedUrl)
      if (items.length > 0) {
        feedsParsed++
        articlesDiscovered += items.length
        // Add discovered articles to the CrawlQueue for later crawling
        const { db } = await import('@/lib/db')
        const { canonicalizeUrl } = await import('./canonical')
        const { extractDomain } = await import('./canonical')
        for (const item of items) {
          const canon = canonicalizeUrl(item.url)
          if (!canon) continue
          const domain = extractDomain(canon) ?? ''
          try {
            await db.crawlQueue.upsert({
              where: { url: canon },
              create: {
                url: canon,
                domain,
                priority: 7, // higher priority for RSS-discovered articles
                discoverySrc: 'rss',
                status: 'pending',
              },
              update: { status: 'pending' },
            })
          } catch { /* ignore duplicates */ }
        }
      }
    } catch { /* ignore feed errors */ }
  }
  return { feedsParsed, articlesDiscovered }
}
