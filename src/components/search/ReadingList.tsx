/**
 * ReadingList.tsx
 * -----------------------------------------------------------------------------
 * AI-curated "5-minute reading list" toggle. When the user enables it:
 *   1. Sort the top results by signal density (info-per-minute, not just
 *      relevance). Signal density = (snippet length × query coverage) /
 *      estimated reading time.
 *   2. Show reading time per result (wordCount / 200 wpm, capped at 10 min).
 *   3. Highlight the top 3 most signal-dense results with a 📖 badge.
 *
 * Algorithmic creativity: this REORDERS results by information value, not
 * by relevance. A 100-word snippet with all 5 query terms might be MORE
 * valuable per minute than a 2000-word article that mentions the query
 * once. Reading List mode surfaces the dense stuff first.
 *
 * The toggle button is shown above the result cards (next to SearchLenses).
 * When on, the cards re-rank with a spring animation (key change).
 */
'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Clock, Sparkles, Zap } from 'lucide-react'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ReadingListItem {
  id: string
  title: string
  url: string
  domain: string
  snippet: string
  wordCount: number
  readingTimeMin: number
  signalDensity: number  // [0, 1] — info-per-minute
  queryCoverage: number  // [0, 1] — fraction of query tokens in the snippet
}

/** Compute reading time in minutes (200 wpm, capped at 10 min). */
function readingTimeMin(wordCount: number): number {
  if (!wordCount || wordCount < 1) return 1
  return Math.min(10, Math.max(1, Math.round(wordCount / 200)))
}

/** Tokenize a query for coverage computation (lightweight — no stemmer). */
function tokenizeLightweight(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 2)
    .slice(0, 10)
}

/** Compute query coverage: fraction of query tokens appearing in the snippet. */
function queryCoverage(snippet: string, title: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0
  const haystack = `${snippet} ${title}`.toLowerCase()
  let hits = 0
  for (const tok of queryTokens) {
    if (haystack.includes(tok)) hits++
  }
  return hits / queryTokens.length
}

/** Compute signal density = (coverage × snippet length) / reading time. */
function signalDensity(
  snippet: string,
  wordCount: number,
  coverage: number,
): number {
  const snippetLen = snippet.length
  if (snippetLen === 0) return 0
  const rt = readingTimeMin(wordCount)
  // Signal density: high coverage + long snippet + low reading time = high.
  return (coverage * Math.min(snippetLen, 500)) / (rt * 500)
}

export function ReadingList() {
  const results = useSearchStore((s) => s.results) || []
  const query = useSearchStore((s) => s.query) || ''
  const [enabled, setEnabled] = React.useState(false)

  // Compute the reading list items + signal density.
  const items: ReadingListItem[] = React.useMemo(() => {
    if (!results || results.length === 0) return []
    const queryTokens = tokenizeLightweight(query)
    return results.slice(0, 10).map((r: any) => {
      const wc = r.wordCount || r.snippet?.split(/\s+/).length || 100
      const rt = readingTimeMin(wc)
      const cov = queryCoverage(r.snippet || '', r.title || '', queryTokens)
      const sd = signalDensity(r.snippet || '', wc, cov)
      return {
        id: r.id,
        title: r.title,
        url: r.url,
        domain: r.domain || r.url,
        snippet: r.snippet || '',
        wordCount: wc,
        readingTimeMin: rt,
        signalDensity: sd,
        queryCoverage: cov,
      }
    })
  }, [results, query])

  // Sort by signal density (descending) when enabled.
  const sortedItems = React.useMemo(() => {
    if (!enabled) return items
    return [...items].sort((a, b) => b.signalDensity - a.signalDensity)
  }, [items, enabled])

  const topThree = sortedItems.slice(0, 3)
  const totalReadingTime = topThree.reduce((s, i) => s + i.readingTimeMin, 0)

  // Only render the toggle if there are 3+ results.
  if (items.length < 3) return null

  return (
    <motion.div
      className="mt-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Button
        variant={enabled ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setEnabled((v) => !v)}
        className={cn(
          'gap-1.5 text-xs',
          enabled && 'bg-gold/20 text-gold border-gold/40 hover:bg-gold/30',
        )}
        aria-pressed={enabled}
        aria-label="Toggle Reading List mode"
      >
        <BookOpen className="size-3.5" aria-hidden />
        <span>Reading List</span>
        {enabled && (
          <span className="ml-1 rounded-full bg-gold/30 px-1.5 py-0.5 text-[9px] font-mono">
            {totalReadingTime}m
          </span>
        )}
      </Button>

      <AnimatePresence>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 glass rounded-xl p-3 shadow-glass">
              <div className="mb-2 flex items-center gap-1.5 text-xs">
                <Sparkles className="size-3.5 text-gold" aria-hidden />
                <span className="font-medium text-foreground">
                  AI-curated 5-minute reading list
                </span>
                <span className="text-muted-foreground">
                  · sorted by signal density (info/min)
                </span>
              </div>

              <ol className="space-y-2">
                {topThree.map((item, i) => (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.05 }}
                    className="flex items-start gap-2 text-xs"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-foreground hover:text-primary hover:underline truncate block"
                      >
                        {item.title}
                      </a>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="size-2.5" aria-hidden />
                          {item.readingTimeMin}m read
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <Zap className="size-2.5 text-gold" aria-hidden />
                          {(item.signalDensity * 100).toFixed(0)}% density
                        </span>
                        <span className="truncate">{item.domain}</span>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </ol>

              <p className="mt-2 text-[9px] text-muted-foreground">
                Total reading time: {totalReadingTime} minutes. Signal density = (query
                coverage × snippet length) / reading time — high coverage + long snippet + low
                reading time = high density.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default ReadingList
