/**
 * SearchPipeline.tsx
 * -----------------------------------------------------------------------------
 * A horizontal strip that visualizes the CIRKLE search engine's real pipeline:
 *
 *   Query Understanding → BM25 Retrieval → Ranking → Diversity → AI Synthesis
 *
 * During a search (loading=true), the stages light up in sequence (a "wave"
 * animation) so the user sees that real work is happening — not a spinner.
 * When results arrive, all stages show a green check.
 *
 * This is the CIRKLE architectural signature: the engine's independent
 * crawler, index, ranking, diversity, and AI layers are made VISIBLE to the
 * user, per the spec §15 (source transparency) and §3 (system architecture).
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Search, Layers, ListTree, Filter, Brain, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STAGES = [
  { icon: Search, label: 'Query', desc: 'Understanding' },
  { icon: Layers, label: 'BM25', desc: 'Retrieval' },
  { icon: ListTree, label: 'Ranking', desc: 'Mode-weighted' },
  { icon: Filter, label: 'Diversity', desc: 'Domain caps' },
  { icon: Brain, label: 'AI', desc: 'Synthesis' },
] as const

interface SearchPipelineProps {
  loading: boolean
  hasResults: boolean
  /** When true, AI was used (so the AI stage is meaningful). */
  aiUsed: boolean
  className?: string
}

export function SearchPipeline({ loading, hasResults, aiUsed, className }: SearchPipelineProps) {
  // During loading, cycle through stages to show "wave" progress.
  const [activeStage, setActiveStage] = React.useState(0)
  React.useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setActiveStage((s) => (s + 1) % STAGES.length)
    }, 800)
    return () => clearInterval(interval)
  }, [loading])

  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto scrollbar-hide rounded-xl border border-border/60 bg-surface/40 px-2.5 py-2 backdrop-blur-sm',
        className,
      )}
      role="status"
      aria-label="Search pipeline progress"
    >
      {STAGES.map((stage, i) => {
        const Icon = stage.icon
        const isLast = i === STAGES.length - 1
        const isAI = isLast
        // A stage is "done" if: results are in, OR (during loading) it's
        // before the currently-animating stage.
        const done = !loading && hasResults && (!isAI || aiUsed)
        const active = loading && i === activeStage
        const dimmed = isAI && !aiUsed && !loading // AI stage when AI not used

        return (
          <React.Fragment key={stage.label}>
            <div
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-all duration-300',
                done && 'bg-teal/10',
                active && 'bg-gold/15',
                dimmed && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full transition-colors',
                  done ? 'bg-teal text-cream' : active ? 'bg-gold text-charcoal' : 'bg-muted text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="size-3" aria-hidden />
                ) : (
                  <Icon className={cn('size-3', active && 'animate-pulse')} aria-hidden />
                )}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-semibold text-foreground sm:text-[11px]">
                  {stage.label}
                </span>
                <span className="hidden text-[9px] text-muted-foreground sm:inline">
                  {stage.desc}
                </span>
              </div>
              {active && (
                <motion.span
                  className="ml-0.5 inline-block size-1.5 rounded-full bg-gold"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  aria-hidden
                />
              )}
            </div>
            {!isLast && (
              <span className="shrink-0 text-muted-foreground/30" aria-hidden>
                →
              </span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export default SearchPipeline
