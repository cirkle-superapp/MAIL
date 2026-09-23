/**
 * source-classifier.ts
 * -----------------------------------------------------------------------------
 * Classify a document into one of the source-type buckets defined in §17:
 *   OFFICIAL | GOVERNMENT | ACADEMIC | NEWS | COMMUNITY | COMMERCIAL |
 *   PRIMARY | WEB
 *
 * Classification uses:
 *   - domain heuristics (matching suffixes / exact domains)
 *   - URL path patterns (e.g. /press/, /filings/ -> PRIMARY)
 *   - content signals from the parsed document (headings, meta author, ...)
 *
 * Default: WEB.
 * -----------------------------------------------------------------------------
 */

import type { ParsedDoc } from './html-parser'
import { extractDomain } from './canonical'

export type SourceType =
  | 'OFFICIAL'
  | 'GOVERNMENT'
  | 'ACADEMIC'
  | 'NEWS'
  | 'COMMUNITY'
  | 'COMMERCIAL'
  | 'PRIMARY'
  | 'WEB'

export interface SourceClassification {
  sourceType: SourceType
  country?: string
  publisher?: string
  author?: string
}

const GOVERNMENT_DOMAIN_HINTS: string[] = [
  '.gov', '.gov.uk', '.gov.cn', '.gov.us', '.gov.au', '.gov.ca',
  '.gov.in', '.gov.br', '.gov.jp', '.gov.de', '.gov.fr', 'gov.',
]

const ACADEMIC_DOMAIN_HINTS: string[] = [
  '.edu', 'ac.uk', 'ac.jp', 'arxiv.org', 'ieee.org', 'dl.acm.org',
  'sciencedirect.com', 'nature.com', 'springer.com', 'sciencemag.org',
  'plos.org', 'jstor.org', 'tandfonline.com', 'wiley.com', 'oxfordjournals.org',
  'cambridge.org', 'researchgate.net', 'scholar.google.com',
]

const NEWS_DOMAIN_HINTS: string[] = [
  'reuters.com', 'bbc.com', 'bbc.co.uk', 'nytimes.com', 'bloomberg.com',
  'theguardian.com', 'apnews.com', 'economist.com', 'ft.com', 'cnbc.com',
  'wsj.com', 'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
  'aljazeera.com', 'cnn.com', 'abc.net.au', 'nbcnews.com', 'cbsnews.com',
  'economist.com', 'economist.com', 'lemonde.fr', 'spiegel.de',
]

const COMMUNITY_DOMAIN_HINTS: string[] = [
  'stackoverflow.com', 'reddit.com', 'news.ycombinator.com', 'github.com',
  'discourse.org', 'gitlab.com', 'bitbucket.org', 'dev.to', 'lobste.rs',
  'community.', 'forum.', 'boards.', 'talk.',
]

const COMMERCIAL_DOMAIN_HINTS: string[] = [
  'amazon.', 'ebay.', 'shop.', '.shop', 'store.', 'etsy.com',
  'walmart.com', 'aliexpress.com', 'jd.com', 'taobao.com',
  'flipkart.com', 'bestbuy.com',
]

const OFFICIAL_DOMAIN_HINTS: string[] = [
  'developer.mozilla.org', 'mdn.mozilla.org', 'w3.org', 'ecma-international.org',
  'tools.ietf.org', 'rfc-editor.org', 'iana.org', 'kubernetes.io',
  'golang.org', 'rust-lang.org', 'python.org', 'nodejs.org', 'react.dev',
  'nextjs.org', 'typescriptlang.org', 'mozilla.org', 'apple.com',
  'microsoft.com', 'google.com', 'cloud.google.com', 'aws.amazon.com',
  'azure.microsoft.com', 'developer.android.com', 'developers.google.com',
  'docs.github.com', 'docs.rs', 'doc.rust-lang.org', 'docs.python.org',
  'docs.nginx.com', 'hub.docker.com',
]

const PRIMARY_PATH_HINTS: string[] = [
  '/press/', '/news/press', '/press-release', '/press-release/', '/announcement',
  '/announcements/', '/filings', '/regulations', '/rulemaking', '/official/',
  '/statements/', '/bulletin', '/circular',
]

const COUNTRY_CCTLD: Record<string, string> = {
  'uk': 'GB', 'us': 'US', 'ca': 'CA', 'au': 'AU', 'de': 'DE', 'fr': 'FR',
  'jp': 'JP', 'cn': 'CN', 'br': 'BR', 'in': 'IN', 'kr': 'KR', 'tw': 'TW',
  'hk': 'HK', 'sg': 'SG', 'nz': 'NZ', 'ie': 'IE', 'it': 'IT', 'es': 'ES',
  'nl': 'NL', 'se': 'SE', 'no': 'NO', 'fi': 'FI', 'dk': 'DK', 'pl': 'PL',
  'ru': 'RU', 'za': 'ZA', 'mx': 'MX', 'ar': 'AR', 'cl': 'CL', 'ae': 'AE',
  'sa': 'SA', 'eg': 'EG', 'ng': 'NG', 'ke': 'KE', 'ph': 'PH', 'id': 'ID',
  'my': 'MY', 'th': 'TH', 'vn': 'VN', 'ch': 'CH', 'at': 'AT', 'be': 'BE',
}

function endsWithAny(host: string, hints: string[]): boolean {
  for (const h of hints) {
    if (h.startsWith('.')) {
      if (host.endsWith(h)) return true
    } else if (h.endsWith('.')) {
      if (host.startsWith(h) || host.includes(h)) return true
    } else {
      if (host === h || host.endsWith('.' + h)) return true
    }
  }
  return false
}

/**
 * Classify a document's source type from its domain + parsed content.
 */
export function classifySource(domain: string, parsed: ParsedDoc): SourceClassification {
  const host = (domain || '').toLowerCase()
  const result: SourceClassification = {
    sourceType: 'WEB',
    country: undefined,
    publisher: undefined,
    author: undefined,
  }

  // ---- Country from ccTLD or geo.region meta --------------------------------
  // Look at the last segment of the host (the TLD).
  const tld = host.split('.').pop() ?? ''
  if (COUNTRY_CCTLD[tld]) result.country = COUNTRY_CCTLD[tld]
  // We could also pull country from a meta geo.region — but parsed does not
  // expose raw meta tags beyond author/description. Skip for now.

  // ---- Author / publisher (we have these from the parser) -------------------
  result.author = parsed.author ?? undefined
  result.publisher = parsed.publisher ?? undefined

  // ---- Source-type rules (in priority order: most specific first) ----------
  let sourceType: SourceType = 'WEB'

  if (endsWithAny(host, GOVERNMENT_DOMAIN_HINTS)) sourceType = 'GOVERNMENT'
  else if (endsWithAny(host, ACADEMIC_DOMAIN_HINTS)) sourceType = 'ACADEMIC'
  else if (endsWithAny(host, OFFICIAL_DOMAIN_HINTS)) sourceType = 'OFFICIAL'
  else if (endsWithAny(host, NEWS_DOMAIN_HINTS)) sourceType = 'NEWS'
  else if (endsWithAny(host, COMMUNITY_DOMAIN_HINTS)) sourceType = 'COMMUNITY'
  else if (endsWithAny(host, COMMERCIAL_DOMAIN_HINTS)) sourceType = 'COMMERCIAL'

  // Override: Wikipedia is COMMUNITY reference (not academic).
  if (host === 'wikipedia.org' || host.endsWith('.wikipedia.org')) {
    sourceType = 'COMMUNITY'
  }

  // Override: PRIMARY — if URL path looks like primary-source AND
  // domain is already OFFICIAL/GOVERNMENT.
  // NOTE: ParsedDoc does not carry the URL path, so we rely on a hint
  // in the parsed title's first heading if present (rare). We can't do
  // PRIMARY detection from ParsedDoc alone — the orchestrator does that
  // check before calling classifySource. Default: WEB.

  result.sourceType = sourceType
  return result
}

/**
 * Apply a PRIMARY-source override if the URL path matches the press/release
 * hints and the domain is OFFICIAL or GOVERNMENT.
 */
export function maybeUpgradeToPrimary(
  url: string,
  sourceType: SourceType
): SourceType {
  if (sourceType !== 'OFFICIAL' && sourceType !== 'GOVERNMENT') {
    return sourceType
  }
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    for (const hint of PRIMARY_PATH_HINTS) {
      if (path.includes(hint)) return 'PRIMARY'
    }
  } catch {
    // ignore
  }
  return sourceType
}

/**
 * Convenience: classify from URL + parsed doc.
 */
export function classifyUrl(rawUrl: string, parsed: ParsedDoc): SourceClassification {
  const host = extractDomain(rawUrl) ?? ''
  const cls = classifySource(host, parsed)
  cls.sourceType = maybeUpgradeToPrimary(rawUrl, cls.sourceType)
  if (!cls.publisher) {
    // Fall back to the host's registered domain as the publisher name.
    cls.publisher = host || undefined
  }
  return cls
}
