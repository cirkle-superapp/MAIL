/**
 * CommandPalette.tsx
 * -----------------------------------------------------------------------------
 * A premium Cmd/Ctrl+K command palette overlay. Combines:
 *   - Inline search (type a query + Enter to search)
 *   - Recent searches (localStorage, only when personalization ON)
 *   - Saved searches (localStorage)
 *   - Quick actions (toggle theme, toggle personalization, crawl seed, switch mode)
 *
 * Opens via Cmd/Ctrl+K (handled by the global keyboard-shortcuts hook) or by
 * clicking the palette button. Closes via Esc or selecting an item.
 *
 * Design: glass morphism, aurora accent, framer-motion spring open/close.
 */

'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Clock, Bookmark, Moon, Sun, ShieldCheck, Database,
  Zap, CornerDownLeft, ArrowRight, X, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSearchStore } from '@/store/search-store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import type { SearchMode } from './types'

const QUICK_MODES: SearchMode[] = ['BALANCED', 'EXACT', 'LATEST', 'RESEARCH', 'OFFICIAL', 'ACADEMIC', 'NEWS', 'COMMUNITY']

export function CommandPalette() {
  const open = useSearchStore((s) => s.showCommandPalette)
  const setOpen = useSearchStore((s) => s.setShowCommandPalette)
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const setMode = useSearchStore((s) => s.setMode)
  const mode = useSearchStore((s) => s.mode)
  const executeSearch = useSearchStore((s) => s.executeSearch)
  const recentSearches = useSearchStore((s) => s.recentSearches)
  const savedSearches = useSearchStore((s) => s.savedSearches)
  const applySavedSearch = useSearchStore((s) => s.applySavedSearch)
  const personalization = useSearchStore((s) => s.filters.personalization)
  const setFilters = useSearchStore((s) => s.setFilters)
  const triggerSeedCrawl = useSearchStore((s) => s.triggerSeedCrawl)
  const loadStats = useSearchStore((s) => s.loadStats)
  const { toast } = useToast()

  const [input, setInput] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Focus the input when the palette opens.
  React.useEffect(() => {
    if (open) {
      setInput('')
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [open])

  // Esc closes (also handled globally, but local handler ensures close before blur).
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      setQuery(input)
      void executeSearch()
      setOpen(false)
    }
  }

  const runSearch = (q: string) => {
    setQuery(q)
    void executeSearch()
    setOpen(false)
  }

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('dark')
    if (isDark) {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('cirkle-theme', 'light')
    } else {
      document.documentElement.classList.add('dark')
      localStorage.setItem('cirkle-theme', 'dark')
    }
    setOpen(false)
  }

  const togglePers = () => {
    setFilters({ personalization: personalization === 'ON' ? 'OFF' : 'ON' })
    setOpen(false)
  }

  const crawlSeed = async () => {
    setOpen(false)
    toast({ title: 'Starting seed crawl…', description: 'Fetching + indexing the seed URL list.' })
    const res = await triggerSeedCrawl()
    if (res) {
      toast({
        title: 'Seed crawl complete',
        description: `Indexed ${res.indexed} documents.`,
      })
      await loadStats()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh] sm:pt-[20vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Palette */}
          <motion.div
            role="dialog"
            aria-label="Command palette"
            className="glass-strong relative w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 shadow-float"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={onKeyDown}
          >
            {/* Aurora accent line at top */}
            <div className="h-0.5 w-full bg-gradient-hero opacity-80" aria-hidden />

            {/* Search input */}
            <div className="flex items-center gap-2 px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Search the web, or type a command…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                aria-label="Command palette search"
              />
              <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                ↵
              </kbd>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setOpen(false)}
                aria-label="Close command palette"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>

            {/* Body — scrollable */}
            <div className="max-h-[60vh] overflow-y-auto border-t border-border/40">
              {/* If input has text, show "search for" action */}
              {input.trim() && (
                <button
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-primary/10"
                  onClick={() => runSearch(input.trim())}
                >
                  <CornerDownLeft className="size-3.5 text-teal" aria-hidden />
                  <span className="flex-1">
                    Search CIRKLE for{' '}
                    <span className="font-medium text-foreground">“{input.trim()}”</span>
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                </button>
              )}

              {/* Recent searches */}
              {personalization === 'ON' && recentSearches.length > 0 && !input.trim() && (
                <Section title="Recent" icon={Clock}>
                  {recentSearches.slice(0, 5).map((s, i) => (
                    <PaletteItem key={`r-${i}`} icon={Clock} label={s} onClick={() => runSearch(s)} />
                  ))}
                </Section>
              )}

              {/* Saved searches */}
              {savedSearches.length > 0 && !input.trim() && (
                <Section title="Saved searches" icon={Bookmark}>
                  {savedSearches.slice(0, 5).map((s) => (
                    <PaletteItem
                      key={s.id}
                      icon={Bookmark}
                      label={s.query}
                      badge={s.mode}
                      onClick={() => {
                        applySavedSearch(s.id)
                        setOpen(false)
                      }}
                    />
                  ))}
                </Section>
              )}

              {/* Quick actions */}
              {!input.trim() && (
                <Section title="Quick actions" icon={Zap}>
                  <PaletteItem
                    icon={personalization === 'ON' ? ShieldCheck : ShieldCheck}
                    label={personalization === 'ON' ? 'Disable personalization (private mode)' : 'Enable personalization'}
                    onClick={togglePers}
                  />
                  <PaletteItem
                    icon={document.documentElement.classList.contains('dark') ? Sun : Moon}
                    label={document.documentElement.classList.contains('dark') ? 'Switch to light theme' : 'Switch to dark theme'}
                    onClick={toggleTheme}
                  />
                  <PaletteItem
                    icon={Database}
                    label="Crawl seed list (enrich index)"
                    onClick={crawlSeed}
                  />
                </Section>
              )}

              {/* Mode switcher */}
              {!input.trim() && (
                <Section title="Search mode" icon={RotateCcw}>
                  <div className="flex flex-wrap gap-1.5 px-4 py-2">
                    {QUICK_MODES.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setMode(m)
                          setOpen(false)
                        }}
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                          mode === m
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground',
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">↑↓</kbd>
                navigate
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">↵</kbd>
                select
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">esc</kbd>
                close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border/30 py-1">
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" aria-hidden />
        {title}
      </div>
      {children}
    </div>
  )
}

function PaletteItem({
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-primary/10 focus:bg-primary/10 focus:outline-none"
      onClick={onClick}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-1 truncate text-foreground">{label}</span>
      {badge && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {badge}
        </span>
      )}
      <ArrowRight className="size-3 text-muted-foreground/50" aria-hidden />
    </button>
  )
}

export default CommandPalette
