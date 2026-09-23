/**
 * AIAnswer.tsx
 * -----------------------------------------------------------------------------
 * Renders the SearchResponse.aiAnswer card.
 *
 *  - Emerald-tinted Card with a top accent bar.
 *  - Title "AI Answer" with a Sparkles icon.
 *  - Subtitle shows the support status as a colored badge:
 *      DIRECTLY_SUPPORTED / MULTI_SOURCE → primary
 *      INDIRECT                          → amber
 *      CONFLICTING                       → red
 *      INSUFFICIENT                       → slate
 *  - Renders `answer` markdown via react-markdown. Inline citations like
 *    [1] [2] in the markdown body are rendered as clickable superscript
 *    badges that scroll to the corresponding citation in the list below.
 *  - Citations section: numbered list, each citation is a link (opens new tab,
 *    rel="noopener noreferrer") with title, domain, source-type badge,
 *    snippet (truncated to 2 lines).
 *  - If `conflicts` are present, render a red-tinted sub-card listing each
 *    conflict and its reason.
 *  - Footer line: "Generated at {time}. Always verify with the original
 *    sources." plus a "How AI answers work?" link that opens a popover with
 *    a 2-sentence explanation.
 *  - Collapsible; collapsed by default when supportStatus === 'INSUFFICIENT'.
 */

'use client'

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import { formatAbsolute, urlParts, truncateLines } from './format'
import type { AiAnswer as AiAnswerType, AiSupportStatus } from './types'

export interface AIAnswerProps {
  aiAnswer: AiAnswerType
}

const STATUS_STYLES: Record<
  AiSupportStatus,
  { badge: string; label: string; defaultOpen: boolean }
> = {
  DIRECTLY_SUPPORTED: {
    badge: 'bg-primary/10 text-primary border-primary/30',
    label: 'Directly supported',
    defaultOpen: true,
  },
  MULTI_SOURCE: {
    badge: 'bg-primary/10 text-primary border-primary/30',
    label: 'Multi-source',
    defaultOpen: true,
  },
  INDIRECT: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    label: 'Indirect',
    defaultOpen: true,
  },
  CONFLICTING: {
    badge: 'bg-rose text-rose border-rose',
    label: 'Conflicting',
    defaultOpen: true,
  },
  INSUFFICIENT: {
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    label: 'Insufficient evidence',
    defaultOpen: false,
  },
}

export function AIAnswer({ aiAnswer }: AIAnswerProps) {
  const [open, setOpen] = React.useState(
    STATUS_STYLES[aiAnswer.supportStatus].defaultOpen,
  )
  const status = STATUS_STYLES[aiAnswer.supportStatus]

  const citationsRef = React.useRef<HTMLDivElement>(null)

  const scrollToCitation = (n: number) => {
    const el = citationsRef.current?.querySelector<HTMLElement>(
      `[data-citation-id="${n}"]`,
    )
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
      setTimeout(
        () => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'),
        1500,
      )
    }
  }

  // react-markdown component override: turn "[1]" citations into clickable
  // superscript badges that scroll to the citation.
  const mdComponents = {
    p: ({ node, ...props }: any) => (
      <p className="text-sm leading-relaxed text-foreground/90" {...props} />
    ),
    text: ({ children }: any) => {
      if (typeof children !== 'string') return children
      // Split on [n] tokens
      const parts = children.split(/(\[\d+(?:\s*,\s*\d+)*\])/g)
      if (parts.length === 1) return children
      return (
        <>
          {parts.map((part, i) => {
            const m = /^\[(\d+(?:\s*,\s*\d+)*)\]$/.exec(part)
            if (!m) return <span key={i}>{part}</span>
            const nums = m[1].split(',').map((s) => parseInt(s.trim(), 10))
            return (
              <sup key={i} className="inline-flex gap-0.5 align-super">
                {nums.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToCitation(n)
                    }}
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`See citation ${n}`}
                  >
                    {n}
                  </button>
                ))}
              </sup>
            )
          })}
        </>
      )
    },
  } as any

  return (
    <Card
      className={cn(
        'border-l-4 border-l-primary border-t-0 border-r-0 border-b-0',
        'border border-border bg-card shadow-sm',
        'py-0',
      )}
    >
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-base font-semibold">AI Answer</CardTitle>
          </div>
          <Badge variant="outline" className={status.badge}>
            {status.label}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Synthesized from the retrieved sources below. Every claim cites a
          source number.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-end">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                {open ? (
                  <>
                    <ChevronUp className="size-3.5" aria-hidden /> Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" aria-hidden /> Expand
                  </>
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            {/* The synthesized answer (markdown) */}
            <div className="prose prosesm max-w-none pt-2 text-foreground/90">
              <ReactMarkdown components={mdComponents}>
                {aiAnswer.answer || '_No summary available._'}
              </ReactMarkdown>
            </div>

            {/* Conflicts */}
            {aiAnswer.conflicts && aiAnswer.conflicts.length > 0 && (
              <div
                className="mt-4 rounded-md border border-rose bg-rose p-3"
                role="alert"
                aria-label="Source conflict detected"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-rose">
                  <AlertTriangle className="size-4" aria-hidden />
                  Source conflict detected
                </div>
                <ul className="mt-2 space-y-2">
                  {aiAnswer.conflicts.map((c, i) => (
                    <li key={i} className="text-xs text-rose/90">
                      <span className="font-medium">“{c.a}”</span>{' '}
                      <span className="text-rose">vs.</span>{' '}
                      <span className="font-medium">“{c.b}”</span> —{' '}
                      <span>{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Citations */}
            <div
              ref={citationsRef}
              className="mt-4"
              aria-label="Source citations"
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Citations ({aiAnswer.citations.length})
              </h3>
              <ol className="space-y-2">
                {aiAnswer.citations.map((c) => {
                  const st = sourceTypeStyle(c.sourceType)
                  const { host, path } = urlParts(c.url)
                  return (
                    <li
                      key={c.id}
                      data-citation-id={c.id}
                      className="rounded-md border border-border bg-background p-2.5 transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                              {c.id}
                            </span>
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                            >
                              {c.title || host || c.url}
                            </a>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="font-mono">{host}{path && path !== '/' ? path : ''}</span>
                            <span aria-hidden>·</span>
                            <Badge
                              variant="outline"
                              className={cn('text-[10px]', st.badge)}
                            >
                              {st.label}
                            </Badge>
                          </div>
                          {c.snippet && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                              {truncateLines(c.snippet, 200)}
                            </p>
                          )}
                        </div>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          aria-label={`Open citation ${c.id} in a new tab`}
                        >
                          <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>

            {/* Footer line */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
              <span>
                Generated at {formatAbsolute(aiAnswer.generatedAt)}. Always verify
                with the original sources.
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    aria-label="How AI answers work?"
                  >
                    <Info className="size-3.5" aria-hidden />
                    How AI answers work?
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={4}
                  className="w-80 text-xs"
                >
                  <p className="text-foreground">
                    CIRKLE AI answers are <strong>evidence-grounded</strong>: the
                    model is given only the retrieved source snippets and is
                    instructed to cite every claim by source number. If the
                    sources disagree or are insufficient, we tell you so instead
                    of guessing.
                  </p>
                </PopoverContent>
              </Popover>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

export default AIAnswer
