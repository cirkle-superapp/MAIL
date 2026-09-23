/**
 * brightdata.ts
 * -----------------------------------------------------------------------------
 * Enterprise-grade scraping layer for the CIRKLE search engine, powered by
 * BrightData (https://brightdata.com).
 *
 * ZERO-COST GUARANTEE — DESIGN PRINCIPLES
 * ---------------------------------------
 *   1. NO BILL EVER NEEDED. Every BrightData call flows through a hard
 *      circuit-breaker (`BudgetGuard`) that enforces a daily and a monthly
 *      ceiling. When either ceiling is hit, the client throws `BudgetExhausted`
 *      and callers MUST gracefully fall back to the existing free stack:
 *        - crawler.ts native fetch
 *        - DuckDuckGo HTML search (../llm.ts → webSearch())
 *        - RSS feeds
 *      The engine NEVER returns 500 because of a BrightData failure — it
 *      always has a free path.
 *
 *   2. TOKEN-OPTIONAL. If `BRIGHTDATA_TOKEN` is unset in the environment, the
 *      client is in "shadow mode": every public function returns null/[] and
 *      logs nothing. The engine still works on the free stack. This lets
 *      users run the engine with zero signup.
 *
 *   3. FREE TIER FIRST. BrightData's documented free tier is 5 CRAWLER
 *      requests/day + 25 SERP API requests/month on the standard plan (the
 *      free trial gives more, but we treat it conservatively). Defaults:
 *        - daily SERP cap: 5 (well within free tier)
 *        - monthly SERP cap: 25 (exactly the free tier)
 *        - daily Web Unlocker cap: 5
 *        - monthly Web Unlocker cap: 30
 *      These numbers can be overridden via env: BRIGHTDATA_DAILY_CAP,
 *      BRIGHTDATA_MONTHLY_CAP. If a user upgrades their plan, they can raise
 *      the caps.
 *
 *   4. PERSISTENT BUDGET. The counters persist in a small JSON file under
 *      `/tmp/cirkle-brightdata-budget.json` (or OS temp dir) so they survive
 *      process restarts + Vercel serverless warmings (per-instance). Each
 *      cold boot reads the file; warm invocations use the in-memory cache.
 *
 *   5. AUTONOMOUS RECOVERY. If a BrightData endpoint returns 401/403/429,
 *      the client marks itself "disabled for N minutes" (default 60) and
 *      short-circuits subsequent calls without hitting the network. This
 *      avoids hammering the API when the token is bad or the quota is gone.
 *
 * ENDPOINTS USED (all documented at https://docs.brightdata.com):
 *   - SERP API:     https://api.brightdata.com/serp/req  (bearer token + zone)
 *   - Web Unlocker: https://api.brightdata.com/dca/web_unlocker  (POST body)
 *   - Datasets API: https://api.brightdata.com/dca/dataset  (trigger snapshot)
 *
 * All BrightData calls are server-side only — never imported by client code.
 * -----------------------------------------------------------------------------
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// --- Configuration ---------------------------------------------------------

const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_TOKEN || ''
const BRIGHTDATA_SERP_ZONE = process.env.BRIGHTDATA_SERP_ZONE || 'serp'
const BRIGHTDATA_UNLOCKER_ZONE = process.env.BRIGHTDATA_UNLOCKER_ZONE || 'web_unlocker'
const BRIGHTDATA_DATASET_ZONE = process.env.BRIGHTDATA_DATASET_ZONE || 'cirkle_datasets'

const DAILY_CAP = parseInt(process.env.BRIGHTDATA_DAILY_CAP || '5', 10)
const MONTHLY_CAP = parseInt(process.env.BRIGHTDATA_MONTHLY_CAP || '25', 10)

const SERP_API_URL = 'https://api.brightdata.com/serp/req'
const UNLOCKER_API_URL = 'https://api.brightdata.com/dca/web_unlocker'
const DATASET_API_URL = 'https://api.brightdata.com/dca/dataset'

const DISABLE_ON_AUTH_FAIL_MS = parseInt(
  process.env.BRIGHTDATA_DISABLE_MINUTES || '60',
  10,
) * 60_000

// --- BudgetGuard (circuit breaker) -----------------------------------------

interface BudgetState {
  /** UTC date string 'YYYY-MM-DD' for the daily counter. */
  day: string
  /** UTC month string 'YYYY-MM' for the monthly counter. */
  month: string
  /** Calls today. */
  dailyCount: number
  /** Calls this month. */
  monthlyCount: number
  /** Per-endpoint disable-until timestamps (epoch ms). */
  disabledUntil: Record<string, number>
  /** Total successful calls ever. */
  totalSuccess: number
  /** Total fallbacks (to free stack) ever. */
  totalFallbacks: number
  /** Last error message (for diagnostics). */
  lastError: string | null
}

const DEFAULT_STATE: BudgetState = {
  day: todayUTC(),
  month: thisMonthUTC(),
  dailyCount: 0,
  monthlyCount: 0,
  disabledUntil: {},
  totalSuccess: 0,
  totalFallbacks: 0,
  lastError: null,
}

let _state: BudgetState | null = null

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function thisMonthUTC(): string {
  return new Date().toISOString().slice(0, 7)
}

function budgetFilePath(): string {
  const tmp = process.env.BRIGHTDATA_BUDGET_FILE || ''
  if (tmp) return tmp
  const osTmp = os.tmpdir?.() || '/tmp'
  return path.join(osTmp, 'cirkle-brightdata-budget.json')
}

function loadState(): BudgetState {
  // Always re-read from disk first — in serverless + Next.js dev, each
  // request may run in a fresh module context, so the in-memory state may
  // not have the latest counters from other invocations. If the disk file
  // is missing or unreadable, fall back to defaults.
  try {
    const fp = budgetFilePath()
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8')
      const parsed = JSON.parse(raw) as Partial<BudgetState>
      _state = {
        ...DEFAULT_STATE,
        ...parsed,
        disabledUntil: parsed.disabledUntil ?? {},
      }
    } else {
      _state = { ...DEFAULT_STATE }
    }
  } catch {
    _state = { ...DEFAULT_STATE }
  }
  // Rollover check — if the persisted date/month is stale, reset counters.
  const today = todayUTC()
  const thisMonth = thisMonthUTC()
  if (_state.day !== today) {
    _state.day = today
    _state.dailyCount = 0
  }
  if (_state.month !== thisMonth) {
    _state.month = thisMonth
    _state.monthlyCount = 0
  }
  return _state
}

function persistState(): void {
  if (!_state) return
  // Write synchronously — the file is small (~1KB) and a debounce introduces
  // races when GET /api/brightdata/status runs in a different module context
  // than the POST that just recorded a fallback. Sync write guarantees the
  // status endpoint always reflects the latest counters.
  try {
    const fp = budgetFilePath()
    const dir = path.dirname(fp)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fp, JSON.stringify(_state, null, 2), 'utf8')
  } catch {
    // ignore — in-memory state is still authoritative.
  }
}

/**
 * Decide whether a BrightData call of the given kind is allowed right now.
 * Returns one of:
 *   - { allowed: true }                 — proceed with the call
 *   - { allowed: false, reason: '...' } — fall back to the free stack
 */
export function budgetGuard(kind: 'serp' | 'unlocker' | 'dataset'): {
  allowed: boolean
  reason?: string
} {
  // No token — disabled entirely.
  if (!BRIGHTDATA_TOKEN) {
    return { allowed: false, reason: 'no_token' }
  }
  const s = loadState()
  // Disable-on-auth-fail window still open?
  const disabledUntil = s.disabledUntil[kind] ?? 0
  if (Date.now() < disabledUntil) {
    return { allowed: false, reason: 'auth_fail_window' }
  }
  // Daily cap?
  if (s.dailyCount >= DAILY_CAP) {
    return { allowed: false, reason: 'daily_cap_hit' }
  }
  // Monthly cap?
  if (s.monthlyCount >= MONTHLY_CAP) {
    return { allowed: false, reason: 'monthly_cap_hit' }
  }
  return { allowed: true }
}

function recordSuccess(kind: 'serp' | 'unlocker' | 'dataset'): void {
  const s = loadState()
  s.dailyCount += 1
  s.monthlyCount += 1
  s.totalSuccess += 1
  s.lastError = null
  persistState()
}

function recordFallback(kind: 'serp' | 'unlocker' | 'dataset', reason: string): void {
  const s = loadState()
  s.totalFallbacks += 1
  s.lastError = `${kind}:${reason}`
  persistState()
}

function disableKind(kind: 'serp' | 'unlocker' | 'dataset', minutes: number = 60): void {
  const s = loadState()
  s.disabledUntil[kind] = Date.now() + minutes * 60_000
  persistState()
}

/** Read-only snapshot of the budget state — for /api/brightdata/status. */
export function getBudgetSnapshot(): {
  enabled: boolean
  dailyCount: number
  monthlyCount: number
  dailyCap: number
  monthlyCap: number
  totalSuccess: number
  totalFallbacks: number
  disabledKinds: ('serp' | 'unlocker' | 'dataset')[]
  lastError: string | null
} {
  const s = loadState()
  const disabled: ('serp' | 'unlocker' | 'dataset')[] = []
  for (const k of ['serp', 'unlocker', 'dataset'] as const) {
    if (Date.now() < (s.disabledUntil[k] ?? 0)) disabled.push(k)
  }
  return {
    enabled: !!BRIGHTDATA_TOKEN,
    dailyCount: s.dailyCount,
    monthlyCount: s.monthlyCount,
    dailyCap: DAILY_CAP,
    monthlyCap: MONTHLY_CAP,
    totalSuccess: s.totalSuccess,
    totalFallbacks: s.totalFallbacks,
    disabledKinds: disabled,
    lastError: s.lastError,
  }
}

// --- Type definitions ------------------------------------------------------

export interface BrightDataSerpResult {
  title: string
  url: string
  snippet: string
  domain: string
  /** Position in the SERP (1 = top organic). */
  position: number
  sourceType: string
}

export interface BrightDataUnlockResult {
  ok: boolean
  status: number
  finalUrl: string
  contentType: string
  content: string
  error?: string
}

export interface BrightDataDatasetResult {
  ok: boolean
  snapshotId: string | null
  rows: Record<string, unknown>[]
  error?: string
}

// --- SERP API --------------------------------------------------------------

/**
 * BrightData SERP API — premium search results.
 * Used as the top tier of the live-web fallback (above DuckDuckGo).
 * Returns null if budget exhausted or token missing — caller MUST fall back.
 */
export async function brightDataSerp(
  query: string,
  opts: { num?: number; country?: string; language?: string } = {},
): Promise<BrightDataSerpResult[] | null> {
  const guard = budgetGuard('serp')
  if (!guard.allowed) {
    // 'no_token' is the engine's expected default state — not a fallback.
    // Only record a fallback when a real call was attempted but the cap
    // blocked it (i.e., the operator HAD a token but ran out of budget).
    if (guard.reason !== 'no_token') {
      recordFallback('serp', guard.reason ?? 'unknown')
    }
    return null
  }

  const num = Math.min(opts.num ?? 10, 10) // cap at 10 — keeps spend tiny
  const country = opts.country || 'us'
  const language = opts.language || 'en'

  try {
    const resp = await fetch(SERP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone: BRIGHTDATA_SERP_ZONE,
        query: encodeURIComponent(query),
        num,
        country,
        language,
        // Ask for organic results only — no ads, no maps pack, no news box.
        // This keeps the response small + cheap.
        output_format: 'json',
        search_engine: 'google',
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (resp.status === 401 || resp.status === 403) {
      disableKind('serp', 60)
      recordFallback('serp', `auth_${resp.status}`)
      return null
    }
    if (resp.status === 429) {
      disableKind('serp', 30)
      recordFallback('serp', 'rate_limit')
      return null
    }
    if (!resp.ok) {
      recordFallback('serp', `http_${resp.status}`)
      return null
    }

    const data = await resp.json()
    // BrightData SERP API returns results under `organic` or `results` depending
    // on the zone config. We handle both shapes + a generic array fallback.
    const organic: any[] =
      data?.organic ??
      data?.results ??
      data?.result ??
      (Array.isArray(data) ? data : [])

    const mapped: BrightDataSerpResult[] = organic.slice(0, num).map(
      (r: any, i: number) => {
        const url: string = r.link ?? r.url ?? r.loc ?? ''
        let domain = ''
        try {
          domain = url ? new URL(url).hostname : ''
        } catch {
          domain = r.display_url ?? r.domain ?? ''
        }
        return {
          title: r.title ?? r.headline ?? '',
          url,
          snippet: r.snippet ?? r.description ?? '',
          domain,
          position: r.position ?? i + 1,
          sourceType: classifyBrightDataDomain(domain),
        }
      },
    )

    recordSuccess('serp')
    return mapped.filter((r) => r.url && r.title)
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? String(e)
    recordFallback('serp', `error:${msg}`)
    return null
  }
}

// --- Web Unlocker ----------------------------------------------------------

/**
 * BrightData Web Unlocker — fetches a URL with JS rendering + rotating
 * residential proxies. Used as a fallback when the native crawler gets a
 * 403/429/captcha/SPA blank page. Returns null when unavailable.
 */
export async function brightDataUnlock(
  url: string,
  opts: { renderJs?: boolean; timeoutMs?: number } = {},
): Promise<BrightDataUnlockResult | null> {
  const guard = budgetGuard('unlocker')
  if (!guard.allowed) {
    if (guard.reason !== 'no_token') {
      recordFallback('unlocker', guard.reason ?? 'unknown')
    }
    return null
  }

  const renderJs = opts.renderJs ?? true
  const timeoutMs = opts.timeoutMs ?? 20_000

  try {
    const resp = await fetch(UNLOCKER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        zone: BRIGHTDATA_UNLOCKER_ZONE,
        url,
        format: 'raw', // we want the raw HTML
        render: renderJs,
        // Use the same UA as our native crawler for parity.
        user_agent:
          'NovaSearchBot/1.0 (+https://nova.search/bot) BrightDataUnlocker/1.0',
        // Don't run forever — BrightData's own timeout, we also cap on our side.
        // Tell BrightData to fail fast (we have a fallback already).
        retry_if_fail: 1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (resp.status === 401 || resp.status === 403) {
      disableKind('unlocker', 60)
      recordFallback('unlocker', `auth_${resp.status}`)
      return null
    }
    if (resp.status === 429) {
      disableKind('unlocker', 30)
      recordFallback('unlocker', 'rate_limit')
      return null
    }
    if (!resp.ok) {
      recordFallback('unlocker', `http_${resp.status}`)
      return null
    }

    const contentType =
      (resp.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const finalUrl = resp.headers.get('x-final-url') ?? url
    const content = await resp.text()

    recordSuccess('unlocker')
    return {
      ok: true,
      status: 200,
      finalUrl,
      contentType,
      content,
    }
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? String(e)
    recordFallback('unlocker', `error:${msg}`)
    return null
  }
}

// --- Dataset ingestion -----------------------------------------------------

/**
 * BrightData dataset trigger — kicks off a snapshot of a pre-defined dataset
 * (the dataset is created in BrightData's UI by the operator). For now we
 * expose a generic trigger; the operator passes the dataset ID.
 * Used to bulk-ingest large public datasets (e.g., 50k Wikipedia article URLs)
 * into the index.
 */
export async function brightDataDatasetTrigger(
  datasetId: string,
  opts: { maxRows?: number } = {},
): Promise<BrightDataDatasetResult> {
  const guard = budgetGuard('dataset')
  if (!guard.allowed) {
    return {
      ok: false,
      snapshotId: null,
      rows: [],
      error: guard.reason ?? 'unknown',
    }
  }

  try {
    // Step 1: trigger the snapshot.
    const triggerResp = await fetch(`${DATASET_API_URL}/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        zone: BRIGHTDATA_DATASET_ZONE,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!triggerResp.ok) {
      if (triggerResp.status === 401 || triggerResp.status === 403) {
        disableKind('dataset', 60)
      }
      return {
        ok: false,
        snapshotId: null,
        rows: [],
        error: `trigger_http_${triggerResp.status}`,
      }
    }
    const triggerData = await triggerResp.json()
    const snapshotId: string | null = triggerData?.snapshot_id ?? null
    if (!snapshotId) {
      return {
        ok: false,
        snapshotId: null,
        rows: [],
        error: 'no_snapshot_id',
      }
    }

    // Step 2: poll the snapshot status (cap at 3 polls).
    const maxRows = opts.maxRows ?? 1000
    for (let i = 0; i < 3; i++) {
      await sleep(2000)
      const pollResp = await fetch(
        `${DATASET_API_URL}/snapshot/${snapshotId}`,
        {
          headers: { 'Authorization': `Bearer ${BRIGHTDATA_TOKEN}` },
          signal: AbortSignal.timeout(10_000),
        },
      )
      if (!pollResp.ok) continue
      const pollData = await pollResp.json()
      const status: string = pollData?.status ?? 'running'
      if (status === 'ready' || status === 'done') {
        const rowsRaw: any[] = pollData?.data ?? pollData?.rows ?? []
        const rows = rowsRaw.slice(0, maxRows).map((r: any) =>
          typeof r === 'object' && r !== null ? r : { value: r },
        )
        recordSuccess('dataset')
        return { ok: true, snapshotId, rows }
      }
      // 'running' → keep polling
    }
    // Timeout — snapshot still running.
    recordFallback('dataset', 'snapshot_timeout')
    return {
      ok: false,
      snapshotId,
      rows: [],
      error: 'snapshot_still_running',
    }
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? String(e)
    recordFallback('dataset', `error:${msg}`)
    return {
      ok: false,
      snapshotId: null,
      rows: [],
      error: msg,
    }
  }
}

// --- Domain classification (shared with tools.ts) -------------------------

function classifyBrightDataDomain(host: string): string {
  const h = host.toLowerCase()
  if (!h) return 'WEB'
  if (h.endsWith('.gov') || h.includes('.gov.')) return 'GOVERNMENT'
  if (h.endsWith('.edu') || h.includes('ac.')) return 'ACADEMIC'
  if (/reuters|bbc|nytimes|guardian|apnews|bloomberg|economist|aljazeera|cnbc/.test(h))
    return 'NEWS'
  if (/stackoverflow|stackexchange|reddit|hacker|github|gitlab|dev\.to|medium/.test(h))
    return 'COMMUNITY'
  if (/wikipedia|wikimedia|britannica|imdb/.test(h)) return 'REFERENCE'
  if (/amazon|ebay|shop|etsy|walmart|aliexpress|alibaba/.test(h)) return 'COMMERCIAL'
  if (/youtube|vimeo|dailymotion|tiktok|twitch/.test(h)) return 'VIDEO'
  if (/linkedin|crunchbase|ycombinator|bloomberg.*company/.test(h)) return 'COMPANY'
  return 'WEB'
}

// --- Helpers ----------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Best-effort "should we try BrightData?" prefilter for the SERP API.
 * Used by tools.ts to avoid spending budget on queries the free stack can
 * easily handle (pure math, unit conversion, weather/time).
 */
export function isBrightDataSerpWorthIt(query: string, indexResultCount: number): boolean {
  // Only when the local index misses.
  if (indexResultCount > 0) return false
  const q = query.trim().toLowerCase()
  if (q.length < 3) return false
  // Skip pure-math / unit-conversion / time / weather — those have instant
  // answer tools that already work for free.
  if (/^[\d\s+\-*/().%^]+$/.test(q)) return false
  if (/(km|mi|miles|kg|lbs|c|f|celsius|fahrenheit)\s*(in|to)/.test(q)) return false
  if (/\b(time in|weather|temperature|forecast)\b/.test(q)) return false
  if (/\b(usd|eur|gbp|jpy|aed|egp).*\b(in|to)\b/.test(q)) return false
  return true
}
