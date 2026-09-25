/**
 * CoverageMatrix.tsx
 * -----------------------------------------------------------------------------
 * Algorithmic visualization showing which sub-aspects of a multi-token query
 * are covered by which top results. Surfaces information gaps at a glance —
 * the user can see "result #3 covers 'early life' but not 'death' — read
 * result #1 instead for that".
 *
 * Layout:
 *   - Rows: aspects (decomposed by the LLM via decomposeQuery())
 *   - Columns: top-5 results (URL + favicon)
 *   - Cells: colored by coverage score [0, 1] — 0=empty, 1=full coverage.
 *     Color gradient: muted → teal → gold → rose.
 *
 * Computed client-side from the parsed query + the top-5 results. The
 * decomposeQuery() call happens lazily when the user opens the matrix.
 *
 * The matrix is COLLAPSED by default (a "📊 Coverage Matrix" toggle button).
 * Expanding shows the matrix + a small "Compute aspects" loading state
 * (one LLM call, ~1-2s).
 */
'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid3x3, Loader2, ChevronDown } from 'lucide-react'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface AspectRow {
  aspect: string
  scores: number[]  // per-result coverage [0, 1]
}

/** Color for a coverage score [0, 1]: muted → teal → gold → rose. */
function coverageColor(score: number): string {
  if (score >= 0.8) return 'bg-rose/70'       // strong coverage — rose
  if (score >= 0.5) return 'bg-gold/70'       // medium — gold
  if (score >= 0.2) return 'bg-teal/60'       // weak — teal
  return 'bg-muted/40'                          // empty — muted
}

/** Human-readable coverage label. */
function coverageLabel(score: number): string {
  if (score >= 0.8) return 'Strong coverage'
  if (score >= 0.5) return 'Partial coverage'
  if (score >= 0.2) return 'Mentions'
  return 'Not covered'
}

export function CoverageMatrix() {
  const results = useSearchStore((s) => s.results) || []
  const query = useSearchStore((s) => s.query) || ''
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [aspects, setAspects] = React.useState<string[] | null>(null)
  const [matrix, setMatrix] = React.useState<AspectRow[]>([])
  const [error, setError] = React.useState<string | null>(null)

  // Only render the matrix toggle if we have 3+ tokens + 3+ results.
  const tokens = query.trim().split(/\s+/).filter(Boolean)
  const shouldRender = tokens.length >= 3 && results.length >= 3

  // Compute the matrix when the user opens + we don't have aspects yet.
  React.useEffect(() => {
    if (!open || !shouldRender || aspects !== null) return
    setLoading(true)
    setError(null)
    // Use the dedicated /api/search/coverage endpoint.
    fetch('/api/search/coverage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        results: results.slice(0, 5).map((r) => ({
          id: r.id,
          title: r.title,
          snippet: r.snippet,
          url: r.url,
        })),
      }),
      signal: AbortSignal.timeout(15000),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (data.aspects && data.matrix) {
          setAspects(data.aspects)
          setMatrix(data.matrix)
        } else {
          setError(data.error || 'Failed to compute coverage')
        }
      })
      .catch((e) => setError(e?.message ?? 'Failed'))
      .finally(() => setLoading(false))
  }, [open, shouldRender, aspects, query, results])

  if (!shouldRender) return null

  const top5 = results.slice(0, 5)

  return (
    <motion.div
      className="mt-4 w-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        aria-label="Toggle coverage matrix"
      >
        <Grid3x3 className="size-3.5" aria-hidden />
        <span>Coverage Matrix</span>
        <ChevronDown
          className={cn('size-3 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-2 glass rounded-xl p-3 shadow-glass">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  <span>Decomposing query into aspects…</span>
                </div>
              )}

              {error && !loading && (
                <div className="text-xs text-rose py-2 px-2">
                  Coverage unavailable: {error}
                </div>
              )}

              {!loading && !error && matrix.length > 0 && (
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left font-medium text-muted-foreground p-1.5">
                          Aspect
                        </th>
                        {top5.map((r, i) => (
                          <th
                            key={r.id}
                            className="text-center font-medium text-muted-foreground p-1.5 max-w-[80px] truncate"
                            title={r.title}
                          >
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-primary hover:underline"
                            >
                              #{i + 1}
                            </a>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((row, i) => (
                        <tr key={i} className="border-b border-border/40 last:border-0">
                          <td className="text-left font-medium text-foreground p-1.5">
                            {row.aspect}
                          </td>
                          {row.scores.map((score, j) => (
                            <td key={j} className="p-1.5 text-center">
                              <div
                                className={cn(
                                  'h-6 w-full rounded-md transition-all hover:scale-y-110',
                                  coverageColor(score),
                                )}
                                title={`${coverageLabel(score)} (${Math.round(score * 100)}%)`}
                                aria-label={`Aspect "${row.aspect}" in result ${j + 1}: ${coverageLabel(score)}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[9px] text-muted-foreground">
                    Each cell shows how strongly that result covers that aspect. Empty cells
                    signal an information gap — read a different result for that aspect.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default CoverageMatrix
