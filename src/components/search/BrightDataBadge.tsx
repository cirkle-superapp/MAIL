/**
 * BrightDataBadge.tsx
 * -----------------------------------------------------------------------------
 * Tiny status chip in the footer that surfaces the BrightData integration
 * state to the user. Shows one of:
 *
 *   - "BrightData-ready" (enabled, budget remaining) — green badge
 *   - "BrightData limited" (enabled but a kind is disabled, e.g., rate-limited)
 *     — amber badge with tooltip
 *   - "Free-tier mode" (no token — running on DuckDuckGo + RSS + native fetch)
 *     — slate badge
 *
 * Hovering reveals the daily/monthly budget breakdown.
 *
 * Pulls from /api/brightdata/status every 60s (and on mount). The fetch is
 * non-blocking — if it fails, the badge silently shows the last known state.
 */

'use client'

import * as React from 'react'
import { ShieldCheck, Zap, Lock, RefreshCw } from 'lucide-react'

interface StatusResponse {
  enabled: boolean
  budget: {
    daily: { used: number; cap: number; remaining: number }
    monthly: { used: number; cap: number; remaining: number }
  }
  disabledKinds: string[]
  totals: { successful: number; fallbacks: number }
  lastError: string | null
  zeroCostGuarantee: boolean
  updatedAt: string
}

type BadgeState = 'ready' | 'limited' | 'free' | 'loading'

export function BrightDataBadge() {
  const [status, setStatus] = React.useState<StatusResponse | null>(null)
  const [state, setState] = React.useState<BadgeState>('loading')
  const [open, setOpen] = React.useState(false)

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch('/api/brightdata/status', {
        headers: { 'XTransformPort': '3000' },
      })
      if (!r.ok) return
      const data: StatusResponse = await r.json()
      setStatus(data)
      if (!data.enabled) setState('free')
      else if (data.disabledKinds.length > 0 || !data.zeroCostGuarantee)
        setState('limited')
      else setState('ready')
    } catch {
      setState('free')
    }
  }, [])

  React.useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [refresh])

  // Color + icon + label per state.
  const config: Record<
    BadgeState,
    { label: string; icon: React.ReactNode; color: string; bg: string }
  > = {
    ready: {
      label: 'BrightData-ready',
      icon: <Zap className="size-3" aria-hidden />,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900',
    },
    limited: {
      label: 'BrightData limited',
      icon: <Lock className="size-3" aria-hidden />,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    },
    free: {
      label: 'Free-tier mode',
      icon: <ShieldCheck className="size-3" aria-hidden />,
      color: 'text-slate-600 dark:text-slate-300',
      bg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800',
    },
    loading: {
      label: 'BrightData…',
      icon: <RefreshCw className="size-3 animate-spin" aria-hidden />,
      color: 'text-slate-500',
      bg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800',
    },
  }

  const c = config[state]

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={refresh}
        aria-label={`BrightData status: ${c.label}. Click to refresh.`}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border ${c.bg} ${c.color} px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-90`}
      >
        {c.icon}
        <span>{c.label}</span>
      </button>

      {open && status && (
        <div
          role="tooltip"
          className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-md border border-border bg-popover p-3 text-xs shadow-lg"
        >
          <div className="font-semibold text-foreground">
            BrightData integration
          </div>
          <div className="mt-1.5 space-y-1 text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>State</span>
              <span className={c.color}>{c.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Daily budget</span>
              <span>
                {status.budget.daily.used} / {status.budget.daily.cap}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Monthly budget</span>
              <span>
                {status.budget.monthly.used} / {status.budget.monthly.cap}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Successful calls</span>
              <span>{status.totals.successful}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Fallbacks to free tier</span>
              <span>{status.totals.fallbacks}</span>
            </div>
            {status.disabledKinds.length > 0 && (
              <div className="mt-1 text-amber-600 dark:text-amber-400">
                Disabled: {status.disabledKinds.join(', ')}
              </div>
            )}
            {status.lastError && (
              <div className="mt-1 text-rose-600 dark:text-rose-400 break-words">
                Last error: {status.lastError}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3" aria-hidden />
              <span>Zero-cost guarantee enforced.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BrightDataBadge
