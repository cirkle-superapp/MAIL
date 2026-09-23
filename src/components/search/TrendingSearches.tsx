/**
 * TrendingSearches.tsx
 * -----------------------------------------------------------------------------
 * A horizontal strip of the most-frequent queries from the QueryLog, shown
 * on the home page below the search box. Makes the home page feel alive +
 * helps users discover what's searchable.
 *
 * Each pill is clickable — sets the query + executes search.
 * Privacy-safe: only aggregate query frequency, no user identity.
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'

interface TrendingSearchesProps {
  className?: string
}

export function TrendingSearches({ className }: TrendingSearchesProps) {
  const [trending, setTrending] = React.useState<{ query: string; frequency: number }[]>([])
  const setQuery = useSearchStore((s) => s.setQuery)
  const executeSearch = useSearchStore((s) => s.executeSearch)

  React.useEffect(() => {
    fetch('/api/trending')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.trending)) setTrending(d.trending) })
      .catch(() => {})
  }, [])

  if (trending.length === 0) return null

  const onClick = (q: string) => {
    setQuery(q)
    void executeSearch()
  }

  return (
    <motion.div
      className={cn('w-full max-w-2xl', className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.85 }}
    >
      <div className="flex items-center gap-1.5 px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <TrendingUp className="size-3 text-gold" aria-hidden />
        Trending searches
      </div>
      <div className="flex flex-wrap gap-2">
        {trending.map((t, i) => (
          <button
            key={`${t.query}-${i}`}
            onClick={() => onClick(t.query)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/40 px-3 py-1.5 text-xs text-foreground/80 backdrop-blur-sm',
              'hover:border-primary/30 hover:bg-primary/5 hover:text-foreground transition-all duration-200',
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <span className="text-[10px] font-mono text-gold">{i + 1}</span>
            {t.query}
          </button>
        ))}
      </div>
    </motion.div>
  )
}

export default TrendingSearches
