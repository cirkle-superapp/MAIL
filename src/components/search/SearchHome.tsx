/**
 * SearchHome.tsx
 * -----------------------------------------------------------------------------
 * The CIRKLE search-engine home view — a premium aurora-gradient hero with
 * the three-intersecting-circles logo (large, rotating), a glass search box,
 * a bilingual tagline (English + Arabic "دواير"), mode pills, and a
 * "system architecture" strip that visualizes the engine's real pipeline:
 *
 *   Query Understanding → BM25 Retrieval → Ranking → Diversity → AI Synthesis
 *
 * This is NOT a Google clone. The home page communicates the CIRKLE brand
 * identity (gold / teal / rose, glass morphism, aurora gradients, breathing
 * motion) and makes the engine's independent architecture visible.
 */

'use client'

import * as React from 'react'
import {
  Database, Loader2, ShieldCheck, Search, Sparkles,
  Brain, ListTree, Filter, Layers, Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useSearchStore } from '@/store/search-store'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { CirkleLogo } from './CirkleLogo'
import { SearchBox } from './SearchBox'
import { ModeTabs } from './ModeTabs'
import { ThemeToggle } from './ThemeToggle'
import { CommandPalette } from './CommandPalette'
import { TrendingSearches } from './TrendingSearches'
import { Footer } from './Footer'
import { cn } from '@/lib/utils'

/** The search-engine pipeline stages, shown as a horizontal strip. */
const PIPELINE_STAGES = [
  { icon: Search, label: 'Query Understanding', desc: 'Intent + entity extraction' },
  { icon: Layers, label: 'BM25 Retrieval', desc: 'Own inverted index' },
  { icon: ListTree, label: 'Ranking', desc: 'Mode-weighted scoring' },
  { icon: Filter, label: 'Diversity', desc: 'Domain + cluster caps' },
  { icon: Brain, label: 'AI Synthesis', desc: 'Evidence-grounded' },
] as const

export function SearchHome() {
  const stats = useSearchStore((s) => s.stats)
  const triggerSeedCrawl = useSearchStore((s) => s.triggerSeedCrawl)
  const loadStats = useSearchStore((s) => s.loadStats)
  const hydrateFromUrl = useSearchStore((s) => s.hydrateFromUrl)
  const { toast } = useToast()
  const [seeding, setSeeding] = React.useState(false)

  React.useEffect(() => {
    void hydrateFromUrl()
    void loadStats()
  }, [hydrateFromUrl, loadStats])

  // Focus the search box on mount (after a short delay so SSR layout settles).
  React.useEffect(() => {
    const t = setTimeout(() => {
      const el = document.getElementById('cirkle-search-home') as HTMLInputElement | null
      el?.focus()
    }, 300)
    return () => clearTimeout(t)
  }, [])

  const onCrawlSeed = async () => {
    setSeeding(true)
    try {
      const res = await triggerSeedCrawl()
      if (res) {
        toast({
          title: 'Seed crawl complete',
          description: `Queued ${res.queued} · Crawled ${res.crawled} · Indexed ${res.indexed}${res.errors.length ? ` · ${res.errors.length} errors` : ''}`,
        })
        await loadStats()
      }
    } catch (e: any) {
      toast({
        title: 'Crawl failed',
        description: e?.message ?? 'Unknown error',
        // @ts-ignore — toaster supports variant
        variant: 'destructive',
      })
    } finally {
      setSeeding(false)
    }
  }

  const emptyIndex = stats !== null && stats.documents === 0

  useKeyboardShortcuts({
    onFocusSearch: () => {
      const el = document.getElementById('cirkle-search-home') as HTMLInputElement | null
      el?.focus()
      el?.select()
    },
    onEscape: () => {
      const el = document.getElementById('cirkle-search-home') as HTMLInputElement | null
      el?.blur()
    },
    onTogglePalette: () => {
      useSearchStore.getState().toggleCommandPalette()
    },
  })

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-background">
      {/* Aurora gradient background — the CIRKLE brand signature. Three
          radial orbs (rose / teal / gold) that float gently. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-aurora"
        aria-hidden
      />
      {/* Floating orbs — premium motion. */}
      <motion.div
        className="pointer-events-none absolute -left-20 top-[10%] h-72 w-72 rounded-full bg-rose/20 blur-3xl"
        animate={{ y: [0, -24, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-20 top-[20%] h-80 w-80 rounded-full bg-teal/20 blur-3xl"
        animate={{ y: [0, 20, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute bottom-[5%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/15 blur-3xl"
        animate={{ y: [0, -16, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        aria-hidden
      />

      {/* Top-right controls (absolute, doesn't affect centered layout) */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 sm:right-4 sm:top-4">
        <ThemeToggle />
      </div>

      <main
        className="relative z-10 flex flex-1 flex-col items-center px-4 pt-[10vh] sm:pt-[14vh] lg:pt-[16vh]"
        role="main"
      >
        {/* Large rotating 3-circles logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <CirkleLogo size={72} />
        </motion.div>

        {/* Bilingual wordmark + tagline */}
        <motion.div
          className="mt-4 flex flex-col items-center gap-1 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            <span className="gradient-text-gold">CIRKLE</span>
          </h1>
          <p className="font-arabic text-lg text-muted-foreground sm:text-xl" dir="rtl" lang="ar">
            دواير
          </p>
        </motion.div>

        <motion.p
          className="mt-2 text-center text-sm text-muted-foreground sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          Search the open web.{' '}
          <span className="font-medium text-foreground">Decide for yourself.</span>
        </motion.p>

        {/* Glass search box */}
        <motion.div
          className="mt-6 w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <SearchBox variant="home" />
        </motion.div>

        {/* Mode pills */}
        <motion.div
          className="mt-4 w-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <ModeTabs variant="home" />
        </motion.div>

        {/* Trending searches — most-frequent queries from the index */}
        <TrendingSearches className="mt-4" />

        {/* Architecture pipeline strip — makes the engine's real stages visible */}
        <motion.div
          className="mt-8 w-full max-w-3xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <div className="glass rounded-2xl px-3 py-3 shadow-glass sm:px-4">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Zap className="size-3 text-gold" aria-hidden />
              <span>The CIRKLE search pipeline</span>
            </div>
            <ol className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {PIPELINE_STAGES.map((stage, i) => {
                const Icon = stage.icon
                return (
                  <li key={stage.label} className="flex items-center gap-1">
                    <div className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5">
                      <Icon className="size-3.5 text-teal" aria-hidden />
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] font-medium text-foreground">
                          {stage.label}
                        </span>
                        <span className="hidden text-[9px] text-muted-foreground sm:inline">
                          {stage.desc}
                        </span>
                      </div>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <span className="text-muted-foreground/40" aria-hidden>
                        →
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </motion.div>

        {/* Privacy + index badges */}
        <motion.div
          className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-teal" aria-hidden />
            Privacy-first · No tracking
          </span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-gold" aria-hidden />
            Evidence-grounded AI
          </span>
        </motion.div>

        {/* Empty index CTA */}
        {emptyIndex && (
          <Card className="mt-8 w-full max-w-2xl border-primary/30 bg-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-primary">
                <Database className="size-4" aria-hidden />
                Your index is empty
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-foreground/90">
              <p>
                CIRKLE runs on its own local web index. There are no documents
                indexed yet — crawl the seed list to get started. The seed list
                contains ~65 high-quality URLs spanning all source types.
              </p>
              <Button
                size="sm"
                className="mt-3 bg-primary text-primary-foreground text-white hover:bg-primary/90"
                onClick={onCrawlSeed}
                disabled={seeding}
              >
                {seeding ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Crawling…
                  </>
                ) : (
                  <>
                    <Database className="size-3.5" aria-hidden />
                    Crawl seed list
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Index stats teaser */}
        {!emptyIndex && stats && (
          <motion.p
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <Sparkles className="size-3 text-gold" aria-hidden />
            Searching{' '}
            <span className="font-mono font-semibold text-foreground">
              {stats.documents.toLocaleString()}
            </span>{' '}
            documents across{' '}
            <span className="font-mono font-semibold text-foreground">
              {stats.domains.toLocaleString()}
            </span>{' '}
            domains
          </motion.p>
        )}
      </main>

      <Footer />

      {/* Command palette overlay (toggled via Cmd/Ctrl+K) */}
      <CommandPalette />
    </div>
  )
}

export default SearchHome
