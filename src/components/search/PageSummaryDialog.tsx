/**
 * PageSummaryDialog.tsx
 * -----------------------------------------------------------------------------
 * The "advanced browser" feature: when the user clicks "Summary" on a result,
 * CIRKLE reads the page's stored content from the index + synthesizes a
 * structured summary with the LLM. Shows:
 *   - TL;DR (1-2 sentence takeaway)
 *   - Key points (3-5 bullet points)
 *   - Notable facts (label/value grid)
 *   - Full structured summary (markdown)
 *   - "Read original" link to the source page
 *   - Reading time estimate
 */

'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Clock, ExternalLink, Loader2, Sparkles, FileText,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import ReactMarkdown from 'react-markdown'
import { sourceTypeStyle } from './source-type'
import { cn } from '@/lib/utils'

interface PageSummaryData {
  docId: string
  title: string
  url: string
  domain: string
  tldr: string
  keyPoints: string[]
  notableFacts: { label: string; value: string }[]
  summary: string
  readingTimeMinutes: number
  generatedAt: string
}

interface PageSummaryDialogProps {
  docId: string | null
  resultTitle: string
  resultUrl: string
  resultSourceType: string
  onClose: () => void
}

export function PageSummaryDialog({
  docId, resultTitle, resultUrl, resultSourceType, onClose,
}: PageSummaryDialogProps) {
  const open = docId !== null
  const [loading, setLoading] = React.useState(false)
  const [data, setData] = React.useState<PageSummaryData | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!docId) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setData(null)
    fetch('/api/page-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error)
        } else if (d.tldr !== null) {
          setData(d as PageSummaryData)
        } else {
          setError('Page content not available for summarization.')
        }
      })
      .catch(() => setError('Failed to fetch page summary.'))
      .finally(() => setLoading(false))
  }, [docId])

  const st = sourceTypeStyle(resultSourceType)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {/* Aurora accent line */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-hero opacity-80" aria-hidden />

        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2 font-display text-lg leading-tight">
                <BookOpen className="size-4 text-primary" aria-hidden />
                {data?.title ?? resultTitle}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 text-xs">
                <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]', st.badge)}>
                  {st.label}
                </span>
                <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary hover:underline">
                  {new URL(resultUrl).hostname}
                </a>
                {data && (
                  <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                    <Clock className="size-3" aria-hidden />
                    {data.readingTimeMinutes} min read
                  </span>
                )}
              </DialogDescription>
            </div>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30"
            >
              <ExternalLink className="size-3" aria-hidden />
              Open
            </a>
          </div>
        </DialogHeader>

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="relative">
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
              <Sparkles className="absolute -right-1 -top-1 size-4 text-gold" aria-hidden />
            </div>
            <p className="text-sm text-muted-foreground">Reading the page…</p>
            <p className="text-xs text-muted-foreground/70">Extracting key points with AI</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <FileText className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="text-sm text-muted-foreground">{error}</p>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              Open the original page →
            </a>
          </div>
        )}

        {/* Summary content */}
        {data && !loading && (
          <motion.div
            className="space-y-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* TL;DR */}
            {data.tldr && (
              <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">TL;DR</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{data.tldr}</p>
              </div>
            )}

            {/* Key points */}
            {data.keyPoints.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key points</p>
                <ul className="space-y-1.5">
                  {data.keyPoints.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-foreground/90">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Notable facts */}
            {data.notableFacts.length > 0 && (
              <>
                <Separator />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {data.notableFacts.map((f, i) => (
                    <div key={i}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</dt>
                      <dd className="text-sm text-foreground">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {/* Full summary */}
            {data.summary && (
              <>
                <Separator />
                <div className="prose prose-sm max-w-none text-foreground/90 prose-headings:font-display prose-headings:text-foreground prose-a:text-primary">
                  <ReactMarkdown>{data.summary}</ReactMarkdown>
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 text-[10px] text-muted-foreground">
              <span>Generated by CIRKLE AI · {new Date(data.generatedAt).toLocaleTimeString()}</span>
              <a href={resultUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                Read original <ExternalLink className="size-2.5" aria-hidden />
              </a>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default PageSummaryDialog
