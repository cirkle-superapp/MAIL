/**
 * html-parser.ts
 * -----------------------------------------------------------------------------
 * A focused, defensive HTML parser. No cheerio/jsdom (neither is installed).
 *
 * Uses a regex/state-machine hybrid that extracts exactly the fields the
 * search engine needs:
 *   - title, metaDescription, metaKeywords
 *   - og:type, og:image
 *   - canonical URL (link rel=canonical)
 *   - headings (h1..h6)
 *   - bodyText (visible text only — strips script/style/noscript/template/svg
 *     and drops boilerplate containers like nav/footer/aside)
 *   - links (absolute URLs, anchor text, rel)
 *   - wordCount
 *   - language (html lang or meta http-equiv=content-language)
 *
 * Defensive against malformed HTML — never throws. Missing fields yield
 * empty strings or null.
 * -----------------------------------------------------------------------------
 */

export interface ParsedHeading {
  level: number
  text: string
}

export interface ParsedLink {
  url: string
  anchor: string
  rel?: string
}

export interface ParsedDoc {
  title: string
  metaDescription: string | null
  metaKeywords: string | null
  ogType: string | null
  ogImage: string | null
  canonicalUrl: string | null
  headings: ParsedHeading[]
  bodyText: string
  links: ParsedLink[]
  wordCount: number
  language: string
  publisher: string | null
  author: string | null
  publishedAt: string | null
  updatedAt: string | null
  jsonLd: any[]              // schema.org structured data (free, from <script type="application/ld+json">)
  faqEntries: { question: string; answer: string }[]  // FAQ from JSON-LD
}

const BLOCKED_TAGS = ['script', 'style', 'noscript', 'template', 'svg']
const BOILERPLATE_TAGS = ['nav', 'footer', 'aside', 'header']

/**
 * Strip the contents of unwanted tags entirely (script/style/noscript/template/svg).
 */
function stripBlockedTags(html: string): string {
  let out = html
  for (const tag of BLOCKED_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi')
    out = out.replace(re, ' ')
    // Also drop self-closing variants
    const selfRe = new RegExp(`<${tag}\\b[^>]*/?>`, 'gi')
    out = out.replace(selfRe, ' ')
  }
  // HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, ' ')
  return out
}

/**
 * Decode common HTML entities. Not exhaustive — covers the common ones
 * (&amp; &lt; &gt; &quot; &#39; &nbsp; &#NNN; &#xNN;).
 */
export function decodeEntities(s: string): string {
  if (!s) return ''
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => {
      const cp = parseInt(d, 10)
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ''
      return String.fromCodePoint(cp)
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&pound;/g, '£')
    .replace(/&euro;/g, '€')
    .replace(/&yen;/g, '¥')
    .replace(/&cent;/g, '¢')
    .replace(/&sect;/g, '§')
    .replace(/&deg;/g, '°')
}

/**
 * Get an attribute value from a single tag (handles single/double quotes + bare).
 */
function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = tag.match(re)
  if (!m) return null
  return m[2] ?? m[3] ?? m[4] ?? null
}

/**
 * Strip ALL tags and collapse whitespace.
 */
function stripAllTags(html: string): string {
  // Replace every tag with a single space, then collapse whitespace.
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Build an absolute URL against baseUrl. Defensive — returns the raw href
 * if resolution fails.
 */
function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

/**
 * Convert "<tag ...>text</tag>" inside `html` into plain text `text` plus a
 * surrounding space (preserving word boundaries). Used for headings so we
 * capture the full inner content (which may contain <a>, <em>, etc.).
 */
function extractInnerText(html: string, tag: string): { text: string; rest: string } {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  const close = new RegExp(`</${tag}\\s*>`, 'i')
  let rest = ''
  let last = 0
  const parts: { start: number; end: number; text: string }[] = []

  let m: RegExpExecArray | null
  while ((m = open.exec(html)) !== null) {
    const after = m.index + m[0].length
    const closeIdx = html.slice(after).search(close)
    if (closeIdx === -1) continue
    const end = after + closeIdx
    const inner = html.slice(after, end)
    parts.push({ start: m.index, end: end + html.slice(end).match(close)![0].length, text: stripAllTags(inner) })
  }

  // Build "rest" = html with all matched blocks removed.
  // Use a single pass.
  if (parts.length === 0) return { text: '', rest: html }

  // Sort parts by start
  parts.sort((a, b) => a.start - b.start)
  const text = parts.map((p) => p.text).join(' ')

  // Construct "rest" by removing the matched regions.
  let result = ''
  let cursor = 0
  for (const p of parts) {
    result += html.slice(cursor, p.start)
    cursor = p.end
  }
  result += html.slice(cursor)

  return { text, rest }
}

/**
 * Parse raw HTML into a ParsedDoc. Never throws.
 */
export function parseHtml(raw: string, baseUrl: string): ParsedDoc {
  const empty: ParsedDoc = {
    title: '',
    metaDescription: null,
    metaKeywords: null,
    ogType: null,
    ogImage: null,
    canonicalUrl: null,
    headings: [],
    bodyText: '',
    links: [],
    wordCount: 0,
    language: '',
    publisher: null,
    author: null,
    publishedAt: null,
    updatedAt: null,
    jsonLd: [],
    faqEntries: [],
  }
  if (!raw || typeof raw !== 'string') return empty

  let html = raw

  // ---- 1. Language detection (before any tag stripping) ---------------------
  const htmlLang = html.match(/<html\b[^>]*\slang\s*=\s*("([^"]*)"|'([^']*)')/i)
  if (htmlLang) {
    empty.language = (htmlLang[2] ?? htmlLang[3] ?? '').trim()
  }
  if (!empty.language) {
    const contentLang = html.match(/<meta\b[^>]*http-equiv\s*=\s*["']?content-language["']?[^>]*content\s*=\s*("([^"]*)"|'([^']*)')/i)
    if (contentLang) {
      empty.language = (contentLang[2] ?? contentLang[3] ?? '').trim()
    }
  }

  // ---- 2. Title --------------------------------------------------------------
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch) {
    empty.title = stripAllTags(titleMatch[1])
  }

  // ---- 3. Meta tags ----------------------------------------------------------
  // Collect every <meta ...> tag once.
  const metaTags: string[] = []
  const metaRe = /<meta\b[^>]*>/gi
  let mm: RegExpExecArray | null
  while ((mm = metaRe.exec(html)) !== null) {
    metaTags.push(mm[0])
  }
  for (const mt of metaTags) {
    const nameAttr = (getAttr(mt, 'name') ?? '').toLowerCase()
    const propAttr = (getAttr(mt, 'property') ?? '').toLowerCase()
    const httpAttr = (getAttr(mt, 'http-equiv') ?? '').toLowerCase()
    const content = getAttr(mt, 'content')

    if (content == null) continue

    if (nameAttr === 'description' && !empty.metaDescription) {
      empty.metaDescription = decodeEntities(content).trim()
    } else if (nameAttr === 'keywords' && !empty.metaKeywords) {
      empty.metaKeywords = decodeEntities(content).trim()
    } else if (nameAttr === 'author' && !empty.author) {
      empty.author = decodeEntities(content).trim()
    } else if (nameAttr === 'publisher' && !empty.publisher) {
      empty.publisher = decodeEntities(content).trim()
    } else if (propAttr === 'og:type' && !empty.ogType) {
      empty.ogType = decodeEntities(content).trim()
    } else if (propAttr === 'og:image' && !empty.ogImage) {
      empty.ogImage = decodeEntities(content).trim()
    } else if (propAttr === 'og:site_name' && !empty.publisher) {
      empty.publisher = decodeEntities(content).trim()
    } else if (propAttr === 'article:published_time' && !empty.publishedAt) {
      empty.publishedAt = content.trim()
    } else if (propAttr === 'article:modified_time' && !empty.updatedAt) {
      empty.updatedAt = content.trim()
    } else if (httpAttr === 'content-language' && !empty.language) {
      empty.language = content.trim()
    }
  }

  // ---- 4. Canonical link -----------------------------------------------------
  const linkRe = /<link\b[^>]*>/gi
  let lm: RegExpExecArray | null
  while ((lm = linkRe.exec(html)) !== null) {
    const lt = lm[0]
    const rel = (getAttr(lt, 'rel') ?? '').toLowerCase()
    if (rel === 'canonical') {
      const href = getAttr(lt, 'href')
      if (href) empty.canonicalUrl = resolveUrl(decodeEntities(href), baseUrl)
    }
  }

  // ---- 5. Strip blocked tags (script, style, ...) ---------------------------
  html = stripBlockedTags(html)

  // ---- 6. Headings (h1..h6) ---------------------------------------------------
  const headings: ParsedHeading[] = []
  for (let level = 1; level <= 6; level++) {
    const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)</h${level}\\s*>`, 'gi')
    let hm: RegExpExecArray | null
    while ((hm = re.exec(html)) !== null) {
      const text = stripAllTags(hm[1])
      if (text) headings.push({ level, text })
    }
  }
  empty.headings = headings

  // ---- 7. Links (a[href]) ----------------------------------------------------
  const links: ParsedLink[] = []
  const anchorRe = /<a\b([^>]*)(?:\/>|>([\s\S]*?)<\/a\s*>)/gi
  let am: RegExpExecArray | null
  while ((am = anchorRe.exec(html)) !== null) {
    const attrStr = am[1] ?? ''
    const inner = am[2] ?? ''
    const href = getAttr('<a ' + attrStr, 'href')
    if (!href) continue
    if (/^(javascript:|mailto:|tel:|data:|#)/i.test(href)) continue
    const abs = resolveUrl(decodeEntities(href), baseUrl)
    if (!abs) continue
    const rel = getAttr('<a ' + attrStr, 'rel') ?? undefined
    const anchor = stripAllTags(inner) || ''
    links.push({ url: abs, anchor, rel })
  }
  // Dedup (preserve first occurrence order)
  const seen = new Set<string>()
  empty.links = links.filter((l) => {
    if (seen.has(l.url + '|' + l.anchor)) return false
    seen.add(l.url + '|' + l.anchor)
    return true
  })

  // ---- 8. Boilerplate removal ------------------------------------------------
  // Remove <nav>, <footer>, <aside>, <header> blocks from the HTML before
  // extracting bodyText (keep <article> and <main>).
  let bodyHtml = html
  for (const tag of BOILERPLATE_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi')
    bodyHtml = bodyHtml.replace(re, ' ')
    const selfRe = new RegExp(`<${tag}\\b[^>]*/?>`, 'gi')
    bodyHtml = bodyHtml.replace(selfRe, ' ')
  }

  // ---- 9. Body text ----------------------------------------------------------
  // Prefer content inside <body> if present.
  let bodyContent = bodyHtml
  const bodyMatch = bodyHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)
  if (bodyMatch) bodyContent = bodyMatch[1]
  // Also prefer <main> or <article> if present (these are the meaty containers).
  const mainMatch = bodyContent.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i)
  if (mainMatch) bodyContent = mainMatch[2]

  const text = stripAllTags(bodyContent)
  empty.bodyText = text
  empty.wordCount = text ? text.split(/\s+/).length : 0

  // ---- 10. JSON-LD structured data extraction (schema.org) ----------------
  // Extract <script type="application/ld+json"> blocks. This gives rich
  // metadata: article author/date, FAQ Q&A pairs, product info, breadcrumbs,
  // organization info — all free, from the page's own structured data.
  const ldJsonBlocks = raw.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || []
  const jsonLd: any[] = []
  const faqEntries: { question: string; answer: string }[] = []
  for (const block of ldJsonBlocks) {
    const contentMatch = block.match(/>([\s\S]*?)<\/script>/)
    if (!contentMatch) continue
    try {
      const parsed = JSON.parse(contentMatch[1].trim())
      // Handle both single objects and arrays of objects
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        jsonLd.push(item)
        // Extract FAQPage entries
        if (item['@type'] === 'FAQPage' && Array.isArray(item.mainEntity)) {
          for (const entity of item.mainEntity) {
            if (entity['@type'] === 'Question' && entity.name && entity.acceptedAnswer) {
              const answer = typeof entity.acceptedAnswer === 'object'
                ? entity.acceptedAnswer.text || ''
                : String(entity.acceptedAnswer)
              faqEntries.push({
                question: String(entity.name).slice(0, 200),
                answer: stripAllTags(answer).slice(0, 500),
              })
            }
          }
        }
        // Extract article metadata from JSON-LD if meta tags didn't have it
        if (!empty.publishedAt && item.datePublished) {
          empty.publishedAt = String(item.datePublished)
        }
        if (!empty.updatedAt && item.dateModified) {
          empty.updatedAt = String(item.dateModified)
        }
        if (!empty.author && item.author) {
          const authorName = typeof item.author === 'object'
            ? item.author.name || ''
            : String(item.author)
          if (authorName) empty.author = authorName
        }
        if (!empty.publisher && item.publisher) {
          const publisherName = typeof item.publisher === 'object'
            ? item.publisher.name || ''
            : String(item.publisher)
          if (publisherName) empty.publisher = publisherName
        }
      }
    } catch { /* invalid JSON-LD — ignore */ }
  }
  empty.jsonLd = jsonLd
  empty.faqEntries = faqEntries

  return empty
}
