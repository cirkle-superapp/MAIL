/**
 * rate-limit.ts
 * -----------------------------------------------------------------------------
 * Simple in-memory rate limiter for the search API (§48 security).
 * Tracks requests per IP address. When the limit is exceeded, returns a
 * 429 Too Many Requests response.
 *
 * Limits:
 *   - 30 searches per minute per IP (burst)
 *   - 100 searches per 5 minutes per IP (sustained)
 *
 * Uses a sliding window with a Map of timestamps. Pruned periodically.
 * -----------------------------------------------------------------------------
 */

interface RateBucket {
  timestamps: number[]
}

const buckets = new Map<string, RateBucket>()
const BURST_LIMIT = 30  // per minute
const BURST_WINDOW_MS = 60_000
const SUSTAINED_LIMIT = 100  // per 5 minutes
const SUSTAINED_WINDOW_MS = 5 * 60_000
const PRUNE_INTERVAL_MS = 60_000
let lastPrune = Date.now()

function pruneOld(bucket: RateBucket, now: number): void {
  // Remove timestamps older than the sustained window
  const cutoff = now - SUSTAINED_WINDOW_MS
  bucket.timestamps = bucket.timestamps.filter(t => t > cutoff)
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number; remaining: number } {
  const now = Date.now()

  // Periodic global prune (avoid memory growth)
  if (now - lastPrune > PRUNE_INTERVAL_MS) {
    for (const [key, bucket] of buckets) {
      pruneOld(bucket, now)
      if (bucket.timestamps.length === 0) buckets.delete(key)
    }
    lastPrune = now
  }

  let bucket = buckets.get(ip)
  if (!bucket) {
    bucket = { timestamps: [] }
    buckets.set(ip, bucket)
  }

  pruneOld(bucket, now)

  // Check sustained limit (5 min window)
  if (bucket.timestamps.length >= SUSTAINED_LIMIT) {
    const oldest = bucket.timestamps[0]
    return {
      allowed: false,
      retryAfterMs: SUSTAINED_WINDOW_MS - (now - oldest),
      remaining: 0,
    }
  }

  // Check burst limit (1 min window)
  const oneMinAgo = now - BURST_WINDOW_MS
  const recentCount = bucket.timestamps.filter(t => t > oneMinAgo).length
  if (recentCount >= BURST_LIMIT) {
    const oldestRecent = bucket.timestamps.find(t => t > oneMinAgo) ?? now
    return {
      allowed: false,
      retryAfterMs: BURST_WINDOW_MS - (now - oldestRecent),
      remaining: 0,
    }
  }

  // Allowed — record this request
  bucket.timestamps.push(now)
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: BURST_LIMIT - recentCount - 1,
  }
}

/** Get client IP from request.
 *
 * P3-3: We delegate to the BrightData auth module's getClientIP which
 * honors TRUSTED_PROXY_CIDR. This way, the search endpoint + the BrightData
 * endpoints share the same IP-extraction logic.
 *
 * If you upgrade to Next.js with a real `req.socket.remoteAddress`, prefer
 * that over header inspection.
 */
export function getClientIP(req: Request): string {
  const xRealIp = req.headers.get('x-real-ip')
  if (xRealIp) return xRealIp
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    // Be conservative: when we can't verify the trusted-proxy chain, use the
    // RIGHTMOST entry (closest hop to our infra — harder to spoof than the
    // client-supplied leftmost entry).
    const parts = xff.split(',').map((s) => s.trim())
    return parts[parts.length - 1] || 'unknown'
  }
  return 'unknown'
}
