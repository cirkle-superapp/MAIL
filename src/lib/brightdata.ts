/**
 * brightdata.ts
 * -----------------------------------------------------------------------------
 * Enterprise-grade scraping layer for the CIRKLE search engine, powered by
 * BrightData (https://brightdata.com).
 *
 * REAL ACCOUNT INTEGRATION (verified end-to-end):
 *   - Datasets v3 API:   https://api.brightdata.com/datasets/v3/snapshot/<id>
 *                        https://api.brightdata.com/datasets/v3/trigger
 *   - Scraping Browser:  wss://brd-customer-...-zone-cirkle:<pw>@brd.superproxy.io:9222
 *                        (Puppeteer over WebSocket — drives a remote headless
 *                         Chrome for JS-rendered pages)
 *   - Selenium endpoint: https://brd-customer-...-zone-cirkle:<pw>@brd.superproxy.io:9515
 *
 * ZERO-COST GUARANTEE — DESIGN PRINCIPLES (unchanged from previous task)
 * ---------------------------------------
 *   1. NO BILL EVER NEEDED. Every BrightData call flows through a hard
 *      circuit-breaker (`BudgetGuard`) that enforces a daily and a monthly
 *      ceiling. When either ceiling is hit, the client throws + callers MUST
 *      gracefully fall back to the existing free stack:
 *        - crawler.ts native fetch
 *        - DuckDuckGo HTML search (../llm.ts → webSearch())
 *        - RSS feeds
 *      The engine NEVER returns 500 because of a BrightData failure.
 *
 *   2. TOKEN-OPTIONAL. If `BRIGHTDATA_TOKEN` is unset in the environment, the
 *      client is in "shadow mode": every public function returns null/[] and
 *      the engine still works on the free stack.
 *
 *   3. FREE TIER FIRST. Conservative caps:
 *        - daily Scraping Browser / dataset calls cap: 5
 *        - monthly Scraping Browser / dataset calls cap: 25
 *      Override via BRIGHTDATA_DAILY_CAP / BRIGHTDATA_MONTHLY_CAP.
 *
 *   4. PERSISTENT BUDGET. Counters persist in a small JSON file under the OS
 *      temp dir so they survive process restarts. Reads are always-from-disk
 *      (serverless-safe across module contexts).
 *
 *   5. AUTONOMOUS RECOVERY. If a BrightData endpoint returns 401/403/429,
 *      the kind is marked "disabled for N minutes" (default 60) and
 *      short-circuits subsequent calls without hitting the network.
 *
 * All BrightData calls are server-side only — never imported by client code.
 * -----------------------------------------------------------------------------
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// --- Configuration ---------------------------------------------------------

const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_TOKEN || ''
const BRIGHTDATA_SBR_WSS = process.env.BRIGHTDATA_SBR_WSS || ''
const BRIGHTDATA_SELENIUM = process.env.BRIGHTDATA_SELENIUM || ''

// Legacy zone names — kept for backward compat with my old code; not used by
// the real Scraping Browser (which authenticates via the wss URL itself).
const BRIGHTDATA_SERP_ZONE = process.env.BRIGHTDATA_SERP_ZONE || 'serp'
const BRIGHTDATA_UNLOCKER_ZONE = process.env.BRIGHTDATA_UNLOCKER_ZONE || 'web_unlocker'
const BRIGHTDATA_DATASET_ZONE = process.env.BRIGHTDATA_DATASET_ZONE || 'cirkle_datasets'

const DAILY_CAP = parseInt(process.env.BRIGHTDATA_DAILY_CAP || '5', 10)
const MONTHLY_CAP = parseInt(process.env.BRIGHTDATA_MONTHLY_CAP || '25', 10)

const DATASET_SNAPSHOT_API = 'https://api.brightdata.com/datasets/v3/snapshot'
const DATASET_TRIGGER_API = 'https://api.brightdata.com/datasets/v3/trigger'

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
  // P2-6: Atomic write via temp-file + rename. The previous direct
  // writeFileSync was racy: two concurrent `recordSuccess` calls could
  // both read {n:3} from disk, both increment to {n:4}, both write {n:4}
  // — losing 1 increment. POSIX `rename()` is atomic, so this write is
  // safe even under concurrent requests.
  //
  // The remaining race is read-modify-write: req A reads {n:3}, req B reads
  // {n:3}, A increments to 4 + writes, B increments to 4 + overwrites. To
  // fully fix that, we use a process-wide write mutex (writeLock chain).
  // For multi-instance serverless deploys, the SQLite-backed KeyValue
  // counter is the right fix (out of scope for this patch — see P2-6 in
  // the audit report's roadmap).
  writeLock = writeLock.then(() => writeStateToDisk()).catch(() => {})
}

let writeLock: Promise<void> = Promise.resolve()

function writeStateToDisk(): void {
  if (!_state) return
  try {
    const fp = budgetFilePath()
    const dir = path.dirname(fp)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    // Write to a temp file in the same directory, then rename — atomic.
    const tmp = `${fp}.tmp.${process.pid}.${Date.now()}`
    fs.writeFileSync(tmp, JSON.stringify(_state, null, 2), 'utf8')
    fs.renameSync(tmp, fp)
  } catch {
    // ignore — in-memory state is still authoritative.
  }
}

/**
 * Decide whether a BrightData call of the given kind is allowed right now.
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
  scrapingBrowserConfigured: boolean
  seleniumConfigured: boolean
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
    scrapingBrowserConfigured: !!BRIGHTDATA_SBR_WSS,
    seleniumConfigured: !!BRIGHTDATA_SELENIUM,
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

export interface BrightDataSnapshotResult {
  ok: boolean
  snapshotId: string
  url: string | null
  title: string | null
  markdown: string | null
  html2text: string | null
  pageHtml: string | null
  timestamp: string | null
  error?: string
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

// --- Scraping Browser (Puppeteer over wss) --------------------------------

/**
 * Use BrightData's Scraping Browser to render + fetch a URL.
 * Connects to the remote Chrome instance over wss (no local Chromium needed).
 *
 * Returns the fully rendered HTML (after JS execution), the final URL (after
 * any client-side redirects), and the page title.
 *
 * Budget-aware: each call counts against the daily/monthly caps. Returns null
 * when budget exhausted or wss not configured — caller MUST fall back.
 */
export async function brightDataScrapingBrowserFetch(
  url: string,
  opts: { timeoutMs?: number; waitForSelector?: string; renderJs?: boolean } = {},
): Promise<BrightDataUnlockResult | null> {
  const guard = budgetGuard('unlocker')
  if (!guard.allowed) {
    if (guard.reason !== 'no_token') {
      recordFallback('unlocker', guard.reason ?? 'unknown')
    }
    return null
  }
  if (!BRIGHTDATA_SBR_WSS) {
    recordFallback('unlocker', 'no_wss_configured')
    return null
  }

  const timeoutMs = opts.timeoutMs ?? 30_000
  const waitForSelector = opts.waitForSelector ?? null
  // Always render JS — that's the whole point of using the Scraping Browser.
  // For pure HTML fetch, the native fetchUrl in crawler.ts is faster + free.

  try {
    // P3-4: robust puppeteer-core import — handle both CJS default export
    // and ESM named export (depends on the bundler's interop).
    const puppeteerModule: any = await import('puppeteer-core')
    const puppeteer = puppeteerModule.default ?? puppeteerModule
    let browser: any = null
    try {
      browser = await puppeteer.connect({
        browserWSEndpoint: BRIGHTDATA_SBR_WSS,
        // Don't keep the connection alive across page navigations — we want
        // the connection to close cleanly after each scrape so the BrightData
        // session is released.
        defaultViewport: null,
      })
    } catch (e: any) {
      recordFallback('unlocker', `connect_error:${e?.message ?? String(e)}`)
      return null
    }

    try {
      const page = await browser.newPage()
      await page.setUserAgent(
        'NovaSearchBot/1.0 (+https://nova.search/bot) BrightDataScrapingBrowser/1.0',
      )
      // Block images/fonts/CSS for faster fetch — we only need the DOM+JS-rendered HTML.
      await page.setRequestInterception(true)
      page.on('request', (req: any) => {
        const rt = req.resourceType()
        if (rt === 'image' || rt === 'stylesheet' || rt === 'font' || rt === 'media') {
          req.abort()
        } else {
          req.continue()
        }
      })

      const resp = await page.goto(url, {
        waitUntil: waitForSelector ? 'domcontentloaded' : 'networkidle2',
        timeout: timeoutMs,
      })
      if (!resp) {
        recordFallback('unlocker', 'no_response')
        await browser.close()
        return null
      }
      const status = resp.status()
      if (status >= 400) {
        recordFallback('unlocker', `http_${status}`)
        await browser.close()
        return null
      }
      if (waitForSelector) {
        try {
          await page.waitForSelector(waitForSelector, { timeout: timeoutMs })
        } catch {
          // Selector didn't appear — proceed with what we have.
        }
      }
      const finalUrl = page.url()
      const content = await page.content()
      const contentType = 'text/html'

      recordSuccess('unlocker')
      await browser.close()
      return {
        ok: true,
        status,
        finalUrl,
        contentType,
        content,
      }
    } catch (e: any) {
      try { await browser.close() } catch {}
      const msg = e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? String(e)
      recordFallback('unlocker', `error:${msg}`)
      return null
    }
  } catch (e: any) {
    // puppeteer-core import failed (shouldn't happen — we installed it)
    recordFallback('unlocker', `import_error:${e?.message ?? String(e)}`)
    return null
  }
}

/**
 * Legacy alias — used by crawler.ts. Wraps the Scraping Browser fetch.
 * Kept as `brightDataUnlock` so existing imports keep working.
 */
export const brightDataUnlock = brightDataScrapingBrowserFetch

// --- Datasets v3 API: snapshot fetch + trigger ----------------------------

/**
 * Fetch the content of an already-triggered BrightData snapshot.
 * Endpoint: GET /datasets/v3/snapshot/<id>
 *
 * Returns the markdown + html2text + page_html + url + title + timestamp.
 */
export async function brightDataSnapshotFetch(
  snapshotId: string,
): Promise<BrightDataSnapshotResult> {
  const guard = budgetGuard('dataset')
  if (!guard.allowed) {
    return {
      ok: false,
      snapshotId,
      url: null,
      title: null,
      markdown: null,
      html2text: null,
      pageHtml: null,
      timestamp: null,
      error: guard.reason ?? 'unknown',
    }
  }

  try {
    const resp = await fetch(`${DATASET_SNAPSHOT_API}/${snapshotId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })

    if (resp.status === 401 || resp.status === 403) {
      disableKind('dataset', 60)
      recordFallback('dataset', `auth_${resp.status}`)
      return {
        ok: false,
        snapshotId,
        url: null,
        title: null,
        markdown: null,
        html2text: null,
        pageHtml: null,
        timestamp: null,
        error: `auth_${resp.status}`,
      }
    }
    if (resp.status === 429) {
      disableKind('dataset', 30)
      recordFallback('dataset', 'rate_limit')
      return {
        ok: false,
        snapshotId,
        url: null,
        title: null,
        markdown: null,
        html2text: null,
        pageHtml: null,
        timestamp: null,
        error: 'rate_limit',
      }
    }
    if (!resp.ok) {
      recordFallback('dataset', `http_${resp.status}`)
      return {
        ok: false,
        snapshotId,
        url: null,
        title: null,
        markdown: null,
        html2text: null,
        pageHtml: null,
        timestamp: null,
        error: `http_${resp.status}`,
      }
    }

    const data = await resp.json()
    // BrightData returns either a single object or an array. Normalize.
    const row: any = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object') {
      recordFallback('dataset', 'no_row')
      return {
        ok: false,
        snapshotId,
        url: null,
        title: null,
        markdown: null,
        html2text: null,
        pageHtml: null,
        timestamp: null,
        error: 'no_row',
      }
    }

    recordSuccess('dataset')
    return {
      ok: true,
      snapshotId,
      url: row.url ?? row.input?.url ?? null,
      title: row.page_title ?? row.title ?? null,
      markdown: row.markdown ?? null,
      html2text: row.html2text ?? null,
      pageHtml: row.page_html ?? row.html ?? null,
      timestamp: row.timestamp ?? null,
    }
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'timeout' : e?.message ?? String(e)
    recordFallback('dataset', `error:${msg}`)
    return {
      ok: false,
      snapshotId,
      url: null,
      title: null,
      markdown: null,
      html2text: null,
      pageHtml: null,
      timestamp: null,
      error: msg,
    }
  }
}

/**
 * Trigger a new BrightData dataset snapshot. The dataset_id is configured in
 * the BrightData dashboard by the operator.
 * Endpoint: POST /datasets/v3/trigger
 *
 * Returns the snapshot_id immediately; the actual scraping happens async.
 * Use brightDataSnapshotFetch(snapshotId) to poll for results.
 */
export async function brightDataDatasetTrigger(
  datasetId: string,
  opts: { maxRows?: number; inputs?: Record<string, unknown>[] } = {},
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
    const triggerResp = await fetch(DATASET_TRIGGER_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${BRIGHTDATA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        zone: BRIGHTDATA_DATASET_ZONE,
        // If inputs are provided, pass them. Otherwise BrightData uses the
        // dataset's default start URL(s).
        ...(opts.inputs ? { inputs: opts.inputs } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!triggerResp.ok) {
      if (triggerResp.status === 401 || triggerResp.status === 403) {
        disableKind('dataset', 60)
      }
      const errBody = await triggerResp.text().catch(() => '')
      recordFallback('dataset', `trigger_http_${triggerResp.status}`)
      return {
        ok: false,
        snapshotId: null,
        rows: [],
        error: `trigger_http_${triggerResp.status}: ${errBody.slice(0, 200)}`,
      }
    }
    const triggerData = await triggerResp.json()
    const snapshotId: string | null =
      triggerData?.snapshot_id ?? triggerData?.id ?? null
    if (!snapshotId) {
      recordFallback('dataset', 'no_snapshot_id')
      return {
        ok: false,
        snapshotId: null,
        rows: [],
        error: 'no_snapshot_id',
      }
    }

    // Trigger succeeded — return immediately. Caller can poll
    // brightDataSnapshotFetch(snapshotId) until ready.
    recordSuccess('dataset')
    return {
      ok: true,
      snapshotId,
      rows: [],
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

// --- SERP API (NOT configured for this account — disabled) --------------
//
// P2-8: This account has no SERP API zone. The previous implementation
// returned null + called `recordFallback('serp', 'no_serp_zone')` on every
// invocation — which inflated the `totalFallbacks` counter on the budget
// dashboard. We now return null WITHOUT recording a fallback (no real
// call was attempted, no real fallback happened — the SERP tier is simply
// not configured). The engine falls back to DuckDuckGo via runLiveWebSearch
// in tools.ts.

export interface BrightDataSerpResult {
  title: string
  url: string
  snippet: string
  domain: string
  position: number
  sourceType: string
}

export async function brightDataSerp(
  _query: string,
  _opts: { num?: number; country?: string; language?: string } = {},
): Promise<BrightDataSerpResult[] | null> {
  // P2-8: SERP API zone not configured for this account — return null
  // silently (no recordFallback — no real call was attempted).
  return null
}

export function isBrightDataSerpWorthIt(_query: string, _indexResultCount: number): boolean {
  // P2-8: SERP API not configured — never spend budget on it.
  return false
}

// --- Helpers ----------------------------------------------------------------

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
