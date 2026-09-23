/**
 * canonical.ts
 * -----------------------------------------------------------------------------
 * URL canonicalization. The same resource can be referenced by many URLs —
 * the canonical form collapses these so that the indexer/deduper can treat
 * them as one document.
 *
 * Canonicalization rules (per spec):
 *   - lowercase scheme + host
 *   - strip default ports (80 for http, 443 for https)
 *   - drop URL fragment (#...)
 *   - strip trailing slash on path root (https://x.com/ -> https://x.com)
 *   - strip tracking query params (utm_*, fbclid, gclid, ref, ref_src, mc_cid, ...)
 *   - sort remaining query params alphabetically
 *   - return null on invalid input
 * -----------------------------------------------------------------------------
 */

const TRACKING_PARAM_PREFIXES = ['utm_']
const TRACKING_PARAM_EXACT = new Set<string>([
  'fbclid', 'gclid', 'ref', 'ref_src', 'ref_url', 'mc_cid', 'mc_eid',
  'yclid', 'msclkid', 'dclid', 'wbraid', 'gbraid', '_ga', '_gl', '_gid',
  'igshid', 'spm', 'scm', 'vnft', 'twclid', 'tt', 'si', 'epik', 'pk_',
  'mkt_tok', 'hsCtaTracking', '__hssc', '__hstc', '__hsfp', 'hsctab',
])

function isTrackingParam(name: string): boolean {
  if (TRACKING_PARAM_EXACT.has(name)) return true
  for (const p of TRACKING_PARAM_PREFIXES) {
    if (name.startsWith(p)) return true
  }
  return false
}

/**
 * Canonicalize a URL string.
 *
 * Returns the canonical string, or null if the URL is invalid or uses a
 * non-http(s) scheme.
 */
export function canonicalizeUrl(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return null
  }

  // Only http(s) is supported by the crawler.
  const scheme = u.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') return null

  // Lowercase host (already lowercased by URL) + strip default port.
  const host = u.hostname.toLowerCase()
  let port = u.port
  if ((scheme === 'http:' && port === '80') || (scheme === 'https:' && port === '443')) {
    port = ''
  }
  const portSuffix = port ? ':' + port : ''

  // Path: drop trailing slash on root only (keep it for nested paths so
  // /a/b/ != /a/b in the index when sites treat them differently, but
  // collapse the bare "/").
  let path = u.pathname || ''
  if (path === '/' || path === '') {
    path = ''
  } else if (path.length > 1 && path.endsWith('/')) {
    // strip ONE trailing slash for canonical form
    path = path.replace(/\/+$/, '')
  }

  // Fragment: dropped (URL constructor doesn't include #fragment in search).

  // Query: filter tracking params + sort alphabetically.
  const params: { k: string; v: string }[] = []
  u.searchParams.forEach((v, k) => {
    if (isTrackingParam(k)) return
    params.push({ k, v })
  })
  params.sort((a, b) => {
    if (a.k === b.k) return a.v < b.v ? -1 : a.v > b.v ? 1 : 0
    return a.k < b.k ? -1 : a.k > b.k ? 1 : 0
  })
  const queryStr = params.length
    ? '?' + params.map((p) => `${encodeURIComponent(p.k)}=${encodeURIComponent(p.v)}`).join('&')
    : ''

  return `${scheme}//${host}${portSuffix}${path}${queryStr}`
}

/**
 * Extract the registrable domain (e.g., "example.com" from "https://www.example.com/")
 * and a normalized hostname. We do NOT use a public-suffix-list — instead we
 * use a heuristic that handles common multi-part TLDs (.co.uk, .com.br, ...).
 */
export function extractDomain(url: string): string | null {
  const canon = canonicalizeUrl(url)
  if (!canon) return null
  try {
    const u = new URL(canon)
    return u.hostname
  } catch {
    return null
  }
}

/**
 * The "registered" domain used for diversity + throttle (e.g.,
 * "example.co.uk" -> "example.co.uk"; "www.example.com" -> "example.com").
 *
 * This is best-effort — for unknown TLDs it falls back to last-two-labels.
 */
export function registeredDomain(url: string): string | null {
  const host = extractDomain(url)
  if (!host) return null
  const parts = host.split('.')
  if (parts.length <= 2) return host

  // Handle common multi-part TLDs.
  const lastTwo = parts.slice(-2).join('.')
  const MULTI_PART_TLDS = new Set([
    'co.uk','org.uk','ac.uk','gov.uk','co.jp','ac.jp','or.jp','ne.jp',
    'co.kr','com.br','com.au','com.tw','com.cn','com.hk','com.sg',
    'co.in','org.in','net.au','org.au','co.nz','co.za',
  ])
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join('.')
  }
  // For IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return host
  return parts.slice(-2).join('.')
}
