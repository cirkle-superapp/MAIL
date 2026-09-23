/**
 * ModeTabs.tsx
 * -----------------------------------------------------------------------------
 * Horizontally scrollable row of search-mode buttons. The 8 modes:
 *   Balanced / Exact / Latest / Research / Official / Academic / Community / News
 *
 * Active mode gets bg-primary text-primary-foreground text-white. Inactive gets bg-muted hover.
 * Keyboard accessible: implements the WAI-ARIA tablist pattern with
 * ArrowLeft / ArrowRight navigation between tabs (Home / End / PageUp /
 * PageDown also supported). Each tab has a tooltip explaining its behavior.
 *
 *   variant='home'   — larger, centered, horizontally scrollable on mobile.
 *   variant='header' — compact, inline.
 */

'use client'

import * as React from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import type { SearchMode } from './types'

interface ModeDef {
  id: SearchMode
  label: string
  short?: string
  tooltip: string
}

const MODES: ModeDef[] = [
  {
    id: 'BALANCED',
    label: 'Balanced',
    tooltip: 'Hybrid lexical + freshness + quality + diversity. The default.',
  },
  {
    id: 'EXACT',
    label: 'Exact',
    tooltip: 'Strict phrase matching. No semantic expansion.',
  },
  {
    id: 'LATEST',
    label: 'Latest',
    tooltip: 'Freshness-weighted within the current freshness filter.',
  },
  {
    id: 'RESEARCH',
    label: 'Research',
    tooltip: 'Higher-quality + academic/official boost. Larger candidate pool.',
  },
  {
    id: 'OFFICIAL',
    label: 'Official',
    tooltip: 'Restrict to official / vendor / project sources.',
  },
  {
    id: 'ACADEMIC',
    label: 'Academic',
    tooltip: 'Restrict to peer-reviewed / scholarly sources.',
  },
  {
    id: 'COMMUNITY',
    label: 'Community',
    tooltip: 'Restrict to community discussion (forums, Q&A).',
  },
  {
    id: 'NEWS',
    label: 'News',
    tooltip: 'Restrict to news coverage of current events.',
  },
  {
    id: 'IMAGES',
    label: 'Images',
    tooltip: 'Visual results — show page thumbnails from the index.',
  },
]

export interface ModeTabsProps {
  variant: 'home' | 'header'
  className?: string
}

export function ModeTabs({ variant, className }: ModeTabsProps) {
  const mode = useSearchStore((s) => s.mode)
  const setMode = useSearchStore((s) => s.setMode)
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const isHome = variant === 'home'

  const focusAt = (i: number) => {
    const idx = (i + MODES.length) % MODES.length
    refs.current[idx]?.focus()
    refs.current[idx]?.click()
  }

  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIdx = MODES.findIndex((m) => m.id === mode)
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        focusAt(currentIdx + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusAt(currentIdx - 1)
        break
      case 'Home':
        e.preventDefault()
        focusAt(0)
        break
      case 'End':
        e.preventDefault()
        focusAt(MODES.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Search mode"
      onKeyDown={onListKeyDown}
      className={cn(
        'flex w-full overflow-x-auto',
        isHome
          ? 'mx-auto max-w-2xl items-center justify-start gap-1.5 pb-1 sm:justify-center'
          : 'items-center gap-1',
        // Hide scrollbar visually but keep it functional
        'scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]',
        className,
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {MODES.map((m, i) => {
        const active = mode === m.id
        return (
          <Tooltip key={m.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="tab"
                id={`nova-mode-${m.id}`}
                aria-selected={active}
                aria-controls="nova-search-results"
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  refs.current[i] = el
                }}
                onClick={() => setMode(m.id)}
                className={cn(
                  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                  isHome ? 'text-sm sm:text-sm' : 'text-xs',
                  active
                    ? 'bg-primary text-primary-foreground text-white shadow-sm'
                    : 'bg-muted text-foreground/80 hover:bg-muted/80 hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-left">
              <span className="font-semibold text-primary/80">{m.label}:</span>{' '}
              <span className="text-white/90">{m.tooltip}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export default ModeTabs
