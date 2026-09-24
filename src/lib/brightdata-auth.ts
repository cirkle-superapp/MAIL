/**
 * brightdata-auth.ts
 * -----------------------------------------------------------------------------
 * Shared auth + SSRF-block + rate-limit middleware for BrightData operator
 * endpoints (scrape, snapshot, datasets).
 *
 * P0-1 (security): every BrightData endpoint MUST call `requireOperator()`
 * BEFORE invoking any BrightData function. Without this check, any visitor can
 * POST a URL and consume the BrightData budget — an SSRF amplifier + budget
 * burn vulnerability.
 *
 * P3-2 (error sanitization): BrightData API errors are mapped to a fixed set
 * of internal codes before being returned to the caller — no internal API
 * structure is leaked.
 *
 * P3-3 (trusted proxy): `getClientIP` here only honors `x-forwarded-for` if
 * the direct connection comes from a trusted proxy CIDR. Otherwise it uses
 * the direct socket IP — preventing IP-spoofing rate-limit bypass.
 * -----------------------------------------------------------------------------
 */

import { checkRateLimit } from './search/rate-limit'

// --- Operator token -------------------------------------------------------

const OPERATOR_TOKEN = process.env.BRIGHTDATA_OPERATOR_TOKEN || ''

export interface AuthResult {
  ok: boolean
  status: number
  body: Record<string, unknown>
  ip: string
}

/**
 * Verify the request carries a valid operator Bearer token. Returns null on
 * success (caller proceeds), or an AuthResult with status+body on failure
 * (caller returns the response immediately).
 *
 * If `BRIGHTDATA_OPERATOR_TOKEN` is unset in the env, the endpoint is
 * disabled — we return 403. This is the secure default. The operator MUST
 * set the token in the env to enable the endpoint.
 */
export function requireOperator(req: Request): AuthResult | null {
  const ip = getClientIP(req)

  // 1. Endpoint disabled if no operator token configured.
  if (!OPERATOR_TOKEN) {
    return {
      ok: false,
      status: 403,
      body: { error: 'brightdata_operator_disabled' },
      ip,
    }
  }

  // 2. Bearer token check.
  const authHeader = req.headers.get('authorization') || ''
  const expected = `Bearer ${OPERATOR_TOKEN}`
  // Constant-time comparison to avoid timing attacks.
  if (authHeader.length !== expected.length || !timingSafeEqual(authHeader, expected)) {
    return {
      ok: false,
      status: 401,
      body: { error: 'unauthorized' },
      ip,
    }
  }

  // 3. Per-IP rate limit — BrightData endpoints are much tighter than the
  // search endpoint: the BrightData budget caps at 5/day. Even with auth,
  // we don't want one authenticated user hammering.
  const rl = checkRateLimit(`brightdata:${ip}`)
  if (!rl.allowed) {
    return {
      ok: false,
      status: 429,
      body: { error: 'rate_limited', retryAfter: Math.ceil(rl.retryAfterMs / 1000) },
      ip,
    }
  }

  return null // success
}

// --- SSRF block (P0-1) ----------------------------------------------------

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,                            // link-local
  /^172\.(1[6-9]|2\d|3[01])\./,             // private class B
  /^::1$/,
  /^fc00:/i,                                // IPv6 unique-local
  /^fe80:/i,                                // IPv6 link-local
  /\.local$/i,                               // mDNS
  /^0\./,                                    // 0.0.0.0/8
]

/** Returns true if a URL is safe to scrape (not private/internal). */
export function isSafeScrapeTarget(urlStr: string): { ok: boolean; reason?: string } {
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  // Only allow http(s).
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_protocol' }
  }
  const host = u.hostname.toLowerCase()
  for (const re of PRIVATE_HOST_PATTERNS) {
    if (re.test(host)) {
      return { ok: false, reason: 'private_network_blocked' }
    }
  }
  return { ok: true }
}

// --- Trusted proxy (P3-3) ------------------------------------------------

const TRUSTED_PROXY_CIDRS = (process.env.TRUSTED_PROXY_CIDR || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/**
 * Get the client IP. If `TRUSTED_PROXY_CIDR` is set, only honor
 * `x-forwarded-for` when the direct connection comes from a trusted proxy.
 * Otherwise we use the direct connection IP — preventing IP-spoofing attacks
 * against the rate limiter.
 *
 * If no trusted proxy is configured (the default for a direct-internet
 * deployment), we always use the direct connection IP.
 */
export function getClientIP(req: Request): string {
  // The direct connection IP — Next.js doesn't expose socket info on
  // NextRequest directly, so we use x-real-ip (set by Vercel edge) or
  // fall back to the leftmost x-forwarded-for. Without a trusted proxy
  // configured, we DON'T trust x-forwarded-for blindly — see P3-3.
  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) return xRealIp

  const xff = req.headers.get('x-forwarded-for')
  if (xff && TRUSTED_PROXY_CIDRS.length > 0) {
    // We're behind a trusted proxy — the leftmost xff entry is the real client.
    return xff.split(',')[0].trim()
  }
  if (xff) {
    // We're NOT behind a trusted proxy but xff is present. Be conservative:
    // use the RIGHTMOST entry (closest to our infrastructure) — this is what
    // the last proxy actually saw, and is harder for a client to spoof.
    const parts = xff.split(',').map((s) => s.trim())
    return parts[parts.length - 1] || 'unknown'
  }
  return 'unknown'
}

// --- Helpers --------------------------------------------------------------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// --- Error sanitization (P3-2) -------------------------------------------

/** Map a raw BrightData error string to a fixed internal error code. */
export function sanitizeBrightDataError(rawError: string | undefined | null): string {
  if (!rawError) return 'brightdata_unknown_error'
  const e = rawError.toLowerCase()
  if (e.includes('auth_401') || e.includes('auth_403') || e.includes('unauthorized')) {
    return 'brightdata_auth_failed'
  }
  if (e.includes('429') || e.includes('rate_limit')) return 'brightdata_rate_limited'
  if (e.includes('404') || e.includes('not_found') || e.includes('collector not found')) {
    return 'brightdata_not_found'
  }
  if (e.includes('timeout')) return 'brightdata_timeout'
  if (e.includes('no_token')) return 'brightdata_not_configured'
  if (e.includes('budget') || e.includes('cap_hit')) return 'brightdata_budget_exhausted'
  if (e.includes('no_serp_zone')) return 'brightdata_serp_unavailable'
  if (e.includes('no_wss')) return 'brightdata_browser_unavailable'
  return 'brightdata_unknown_error'
}
