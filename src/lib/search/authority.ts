/**
 * authority.ts
 * -----------------------------------------------------------------------------
 * Link-graph authority scoring (§7.4). Queries the Link table to compute
 * per-domain in-link counts (how many other domains link to this domain).
 * This is a simplified PageRank — more inbound links = higher authority.
 *
 * Cached for 5 minutes (stale-while-revalidate pattern).
 * The authority score is normalized to 0..1 for use in the ranking formula.
 * -----------------------------------------------------------------------------
 */

import { db } from '@/lib/db'
import { extractDomain } from './canonical'

interface AuthorityCache {
  data: Map<string, number>  // domain → normalized authority score (0..1)
  expiresAt: number
  refreshing: boolean
}

let _authCache: AuthorityCache | null = null
const AUTH_TTL_MS = 5 * 60_000  // 5 minutes fresh
const AUTH_STALE_MS = 15 * 60_000  // serve stale for up to 15 min

async function refreshAuthority(): Promise<Map<string, number>> {
  // Query all Link rows, group by target domain, count unique source domains.
  const links = await db.link.findMany({
    select: { sourceUrl: true, targetUrl: true },
    take: 10000, // cap to avoid massive queries
  })

  // Build domain → set of linking domains
  const domainInlinks = new Map<string, Set<string>>()
  for (const link of links) {
    const targetDomain = extractDomain(link.targetUrl)
    const sourceDomain = extractDomain(link.sourceUrl)
    if (!targetDomain || !sourceDomain || targetDomain === sourceDomain) continue
    if (!domainInlinks.has(targetDomain)) domainInlinks.set(targetDomain, new Set())
    domainInlinks.get(targetDomain)!.add(sourceDomain)
  }

  // Normalize: max in-link count → 1.0, others scaled proportionally.
  let maxCount = 1
  for (const [, sources] of domainInlinks) {
    if (sources.size > maxCount) maxCount = sources.size
  }

  const result = new Map<string, number>()
  for (const [domain, sources] of domainInlinks) {
    result.set(domain, sources.size / maxCount)
  }
  return result
}

/**
 * Get the authority score for a domain (0..1). Returns 0 for unknown domains.
 * Uses stale-while-revalidate: returns cached data immediately, refreshes in
 * the background if stale.
 */
export async function getDomainAuthority(domain: string): Promise<number> {
  const now = Date.now()

  // Fresh cache
  if (_authCache && _authCache.expiresAt > now) {
    return _authCache.data.get(domain.toLowerCase()) ?? 0
  }

  // Stale cache (serve while refreshing)
  if (_authCache && _authCache.expiresAt + AUTH_STALE_MS > now) {
    if (!_authCache.refreshing) {
      _authCache.refreshing = true
      refreshAuthority()
        .then(data => {
          _authCache = { data, expiresAt: now + AUTH_TTL_MS, refreshing: false }
        })
        .catch(() => { if (_authCache) _authCache.refreshing = false })
    }
    return _authCache.data.get(domain.toLowerCase()) ?? 0
  }

  // Cold cache — block + fetch
  try {
    const data = await refreshAuthority()
    _authCache = { data, expiresAt: now + AUTH_TTL_MS, refreshing: false }
    return data.get(domain.toLowerCase()) ?? 0
  } catch {
    return 0
  }
}

/**
 * Get the authority map for all domains (for batch use in ranking).
 */
export async function getAuthorityMap(): Promise<Map<string, number>> {
  const now = Date.now()
  if (_authCache && _authCache.expiresAt > now) {
    return _authCache.data
  }
  try {
    const data = await refreshAuthority()
    _authCache = { data, expiresAt: now + AUTH_TTL_MS, refreshing: false }
    return data
  } catch {
    return new Map()
  }
}

export function invalidateAuthorityCache(): void {
  _authCache = null
}
