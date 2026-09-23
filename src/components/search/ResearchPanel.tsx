/**
 * ResearchPanel.tsx
 * -----------------------------------------------------------------------------
 * The Deep Research side panel. Triggered by a "Deep Research" button in the
 * header (visible whenever there's a query).
 *
 * Uses a shadcn Sheet (right side, full-height on mobile, max-w-2xl on
 * desktop). Calls `store.runResearch()` on open if no research is loaded.
 *
 * Shows:
 *   - Progress steps from `research.steps` (checkmark for done, spinner for
 *     in_progress, gray for pending).
 *   - When done: executive summary, key findings, evidence list (each claim
 *     with its source citations + support status badge), contradictions,
 *     limitations, sources list (numbered, with links).
 *
 * Streaming not required — we show an animated "Researching…" state with the
 * steps filling in. (The actual report is fetched in one shot.)
 */

'use client'

import * as React from 'react'
import {
  Check,
  CircleDot,
  Loader2,
  AlertTriangle,
  BookOpen,
  Brain,
  ListChecks,
  X,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import { urlParts, formatRelativeTime, truncateLines } from './format'
import type { ResearchReport, ResearchStep } from './types'

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  Decompose: Brain,
  Retrieve: BookOpen,
  Synthesize: ListChecks,
}

export interface ResearchPanelProps {
  /** Rendered as a Sheet always (parent controls open state via store). */
  [key: string]: unknown
}

export function ResearchPanel(_: ResearchPanelProps) {
  const open = useSearchStore((s) => s.showResearch)
  const setOpen = useSearchStore((s) => s.toggleResearch)
  const research = useSearchStore((s) => s.research)
  const loading = useSearchStore((s) => s.researchLoading)
  const error = useSearchStore((s) => s.researchError)
  const runResearch = useSearchStore((s) => s.runResearch)
  const query = useSearchStore((s) => s.query)

  // When the sheet opens and we have a query but no research yet, kick off
  // a research run.
  React.useEffect(() => {
    if (open && query.trim() && !research && !loading && !error) {
      void runResearch()
    }
  }, [open, query, research, loading, error, runResearch])

  return (
    <Sheet open={open} onOpenChange={(o) => setOpen()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="flex flex-row items-start justify-between gap-2 border-b border-border p-4">
          <div>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Brain className="size-5 text-primary" aria-hidden />
              Deep Research
            </SheetTitle>
            <SheetDescription className="mt-1">
              Multi-step evidence-grounded synthesis. Decomposes your question,
              retrieves sources, cross-checks, and writes a report.
            </SheetDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setOpen()}
            aria-label="Close deep research panel"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {query.trim() === '' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Type a question in the search box first.
            </div>
          )}

          {loading && !research && <ResearchLoadingSkeleton query={query} />}
          {!loading && error && (
            <div className="rounded-md border border-rose bg-rose p-3 text-sm text-rose">
              <AlertTriangle className="mb-1 inline-block size-4" aria-hidden />
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void runResearch()}
              >
                Retry
              </Button>
            </div>
          )}
          {research && (
            <ResearchReportView research={research} loading={loading} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ResearchReportView({
  research,
  loading,
}: {
  research: ResearchReport
  loading: boolean
}) {
  return (
    <div className="space-y-5">
      {/* Steps */}
      {research.steps.length > 0 && (
        <section aria-label="Research progress">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {loading ? 'Researching…' : 'Research pipeline'}
          </h2>
          <ol className="space-y-1.5">
            {research.steps.map((s, i) => (
              <StepRow key={i} step={s} />
            ))}
          </ol>
        </section>
      )}

      <Separator />

      {/* Executive summary */}
      <section aria-label="Executive summary">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Executive summary
        </h2>
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">
          {research.executiveSummary}
        </p>
      </section>

      {/* Key findings */}
      {research.keyFindings.length > 0 && (
        <section aria-label="Key findings">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Key findings
          </h2>
          <ul className="space-y-1.5">
            {research.keyFindings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="text-foreground/90">{f}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence */}
      {research.evidence.length > 0 && (
        <section aria-label="Evidence and sources">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Evidence
          </h2>
          <ul className="space-y-2">
            {research.evidence.map((e, i) => (
              <li
                key={i}
                className="rounded-md border border-border bg-card p-2.5 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-foreground/90">{e.claim}</p>
                  <SupportBadge support={e.support} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Sources:{' '}
                  {e.sources.map((s, j) => (
                    <a
                      key={j}
                      href={research.sources.find((x) => x.id === s)?.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
                    >
                      {s}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Contradictions */}
      {research.contradictions.length > 0 && (
        <section
          aria-label="Contradictions"
          className="rounded-md border border-rose bg-rose p-3"
        >
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose">
            <AlertTriangle className="size-4" aria-hidden />
            Source contradictions
          </h2>
          <ul className="space-y-2">
            {research.contradictions.map((c, i) => (
              <li key={i} className="text-xs text-rose/90">
                <span className="font-medium">“{c.a}”</span>{' '}
                <span className="text-rose">vs.</span>{' '}
                <span className="font-medium">“{c.b}”</span> — {c.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Limitations */}
      {research.limitations && (
        <section
          aria-label="Limitations"
          className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
        >
          <span className="font-semibold">Limitations:</span>{' '}
          {research.limitations}
        </section>
      )}

      {/* Sources */}
      {research.sources.length > 0 && (
        <section aria-label="Sources">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Sources ({research.sources.length})
          </h2>
          <ol className="space-y-2">
            {research.sources.map((src) => {
              const st = sourceTypeStyle(src.sourceType)
              const { host, path } = urlParts(src.url)
              return (
                <li
                  key={src.id}
                  className="rounded-md border border-border bg-card p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                      {src.id}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {src.title || host || src.url}
                      </a>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span className={cn('size-1.5 rounded-full', st.dot)} aria-hidden />
                        <span className="font-mono">{host}{path && path !== '/' ? path : ''}</span>
                        <Badge variant="outline" className={cn('text-[10px]', st.badge)}>
                          {st.label}
                        </Badge>
                      </div>
                      {src.snippet && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {truncateLines(src.snippet, 200)}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <p className="text-[10px] text-muted-foreground">
        Generated at {formatRelativeTime(research.generatedAt)}.
      </p>
    </div>
  )
}

function SupportBadge({ support }: { support: string }) {
  const s = (support || '').toUpperCase()
  if (s.includes('MULTI')) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
        Multi-source
      </Badge>
    )
  }
  if (s.includes('DIRECT')) {
    return (
      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
        Directly supported
      </Badge>
    )
  }
  if (s.includes('INDIRECT')) {
    return (
      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 text-[10px]">
        Indirect
      </Badge>
    )
  }
  if (s.includes('CONFLICT')) {
    return (
      <Badge variant="outline" className="border-rose bg-rose text-rose text-[10px]">
        Conflicting
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px]">
      {support || 'Unknown'}
    </Badge>
  )
}

function StepRow({ step }: { step: ResearchStep }) {
  const status = (step.status || '').toLowerCase()
  const Icon = STEP_ICONS[step.step] ?? CircleDot
  return (
    <li className="flex items-center gap-2 text-sm">
      {status === 'done' ? (
        <Check className="size-4 text-primary" aria-hidden />
      ) : status === 'in_progress' || status === 'pending' ? (
        status === 'in_progress' ? (
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
        ) : (
          <CircleDot className="size-4 text-muted-foreground" aria-hidden />
        )
      ) : status === 'failed' ? (
        <AlertTriangle className="size-4 text-rose" aria-hidden />
      ) : (
        <CircleDot className="size-4 text-muted-foreground" aria-hidden />
      )}
      <Icon className="size-4 text-muted-foreground" aria-hidden />
      <span
        className={cn(
          'text-xs',
          status === 'done'
            ? 'text-foreground'
            : status === 'failed'
              ? 'text-rose'
              : 'text-muted-foreground',
        )}
      >
        {step.step}
      </span>
    </li>
  )
}

function ResearchLoadingSkeleton({ query }: { query: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Researching your question…</span>
      <p className="text-sm text-muted-foreground">
        Researching “{query}” — CIRKLE is decomposing the question, running
        multiple sub-searches, and synthesizing an answer.
      </p>
      <ol className="space-y-2">
        {['Decompose question', 'Retrieve sources', 'Synthesize report'].map(
          (s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <Loader2
                className="size-4 animate-spin text-primary"
                aria-hidden
              />
              <span className="text-muted-foreground">{s}…</span>
            </li>
          ),
        )}
      </ol>
      <div className="space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
      </div>
    </div>
  )
}

export default ResearchPanel
