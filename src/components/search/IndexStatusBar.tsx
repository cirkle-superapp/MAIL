/**
 * IndexStatusBar.tsx
 * -----------------------------------------------------------------------------
 * A tiny badge shown in the footer. Displays document count + domain count +
 * last-crawl time. Clicking opens a small Popover with more detailed stats.
 */

'use client'

import * as React from 'react'
import { Database, Globe2, Activity, AlertTriangle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSearchStore } from '@/store/search-store'
import { formatRelativeTime, formatCount } from './format'

export function IndexStatusBar() {
  const stats = useSearchStore((s) => s.stats)
  const loadStats = useSearchStore((s) => s.loadStats)

  // Lazy-load stats on first interaction if missing.
  const onOpen = React.useCallback(() => {
    if (!stats) void loadStats()
  }, [stats, loadStats])

  const docs = stats?.documents ?? 0
  const domains = stats?.domains ?? 0
  const lastCrawl = stats?.lastCrawl ?? null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Index status: ${docs} documents across ${domains} domains. Last crawl ${lastCrawl ? formatRelativeTime(lastCrawl) : 'unknown'}. Click for details.`}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Database className="size-3.5 text-primary" aria-hidden />
          <span>{formatCount(docs)} docs</span>
          <span aria-hidden>·</span>
          <Globe2 className="size-3.5 text-teal" aria-hidden />
          <span>{formatCount(domains)} domains</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 text-sm"
      >
        <div className="space-y-2">
          <p className="font-medium text-foreground">CIRKLE index status</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Documents</dt>
            <dd className="text-right font-mono">{stats?.documents ?? '—'}</dd>
            <dt className="text-muted-foreground">Domains</dt>
            <dd className="text-right font-mono">{stats?.domains ?? '—'}</dd>
            <dt className="text-muted-foreground">Index size (words)</dt>
            <dd className="text-right font-mono">
              {stats?.indexSize != null ? formatCount(stats.indexSize) : '—'}
            </dd>
            <dt className="text-muted-foreground">Queue depth</dt>
            <dd className="text-right font-mono">{stats?.queueDepth ?? '—'}</dd>
            <dt className="text-muted-foreground">Crawl errors</dt>
            <dd className="text-right font-mono inline-flex items-center justify-end gap-1">
              {stats?.crawlErrors ? (
                <>
                  <AlertTriangle className="size-3 text-amber-600" aria-hidden />
                  {stats.crawlErrors}
                </>
              ) : (
                stats?.crawlErrors ?? '—'
              )}
            </dd>
            <dt className="text-muted-foreground">Last crawl</dt>
            <dd className="text-right font-mono inline-flex items-center justify-end gap-1">
              <Activity className="size-3 text-primary" aria-hidden />
              {lastCrawl ? formatRelativeTime(lastCrawl) : '—'}
            </dd>
          </dl>
          <p className="pt-2 text-[10px] text-muted-foreground">
            CIRKLE crawls the open web with its own crawler. Results come from
            this local index — not from a third-party search API.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default IndexStatusBar
