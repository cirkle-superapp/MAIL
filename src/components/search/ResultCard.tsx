/**
 * ResultCard.tsx
 * -----------------------------------------------------------------------------
 * A single organic search-result card (Google-like).
 *
 * Layout:
 *  - Top line: small favicon-style dot (color from source-type) + domain +
 *    breadcrumb path. On the right: a "⋯ More" dropdown menu with options:
 *    "Open source", "Source profile", "Why this result?", "Copy link".
 *  - Title (large, link, primary-on-hover, opens new tab, rel="noopener
 *    noreferrer").
 *  - URL breadcrumb below title.
 *  - Snippet (3 lines max, with <mark> highlighting matched query terms in
 *    bg-primary/20).
 *  - Metadata row: source-type badge (colored), date (relative), language,
 *    originality badge ("Original" primary / "Duplicate" slate when !isOriginal).
 *  - If clusterSize > 1: a small "n more from this cluster" link that
 *    expands an inline list of suppressed cluster members (placeholder list
 *    of clusterId/size — actual cluster members fetched from the parent).
 *  - "Why this result?" — collapsible. Trigger button shows "Why this result?"
 *    with a help icon. When open, shows the §15 checklist from whyThisResult[].
 *  - Relevance score shown as a tiny progress bar in the corner (visual only,
 *    labeled Low/Medium/High — per §15 we never expose the actual numeric
 *    weight).
 */

'use client'

import * as React from 'react'
import {
  MoreHorizontal,
  ExternalLink,
  Info,
  Copy,
  Check,
  BookOpen,
  Users,
  Globe,
  Calendar,
  FileText,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import {
  formatRelativeTime,
  formatShortDate,
  highlightSnippet,
  truncateLines,
  urlParts,
  matchStrength,
} from './format'
import { WhyThisResult } from './WhyThisResult'
import type { SearchResult } from './types'

export interface ResultCardProps {
  result: SearchResult
  rank: number
  onSummary?: (docId: string) => void
}

export function ResultCard({ result, rank, onSummary }: ResultCardProps) {
  const query = useSearchStore((s) => s.query)
  const openSourceProfile = useSearchStore((s) => s.openSourceProfile)
  const [whyOpen, setWhyOpen] = React.useState(false)
  const [clusterOpen, setClusterOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const st = sourceTypeStyle(result.sourceType)
  const { host, path } = urlParts(result.url)
  const dateIso = result.updatedAt ?? result.publishedAt
  const relDate = formatRelativeTime(dateIso)
  const strength = matchStrength(result.relevanceScore)
  const strengthPct =
    strength === 'High' ? 90 : strength === 'Medium' ? 60 : 30

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <article
      className={cn(
        'group relative -mx-2 rounded-xl px-2 py-4 transition-all duration-300',
        'hover:bg-surface/60 hover:shadow-soft',
        'border-l-2 border-l-transparent hover:border-l-primary/40',
      )}
      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
      aria-label={`Result ${rank}: ${result.title}`}
      data-result-id={result.id}
    >
      {/* Top line: dot + domain + path + more menu */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-block size-2.5 rounded-full',
              st.favicon,
            )}
            aria-hidden
          />
          <span className="truncate font-mono">{host}</span>
          {path && path !== '/' && (
            <span className="truncate text-muted-foreground/80">› {path}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Match strength mini-indicator */}
          <span
            className="hidden items-center gap-1.5 sm:inline-flex"
            title={`Match strength: ${strength}`}
          >
            <Progress
              value={strengthPct}
              className="h-1 w-12 bg-muted"
              aria-label={`Match strength: ${strength}`}
            />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {strength}
            </span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                aria-label={`More options for result ${rank}`}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Result actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Open source
                </a>
              </DropdownMenuItem>
              {onSummary && (
                <DropdownMenuItem
                  onClick={() => onSummary(result.id)}
                  className="flex items-center gap-2"
                >
                  <BookOpen className="size-3.5 text-gold" aria-hidden />
                  AI summary
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => openSourceProfile(result.id)}
                className="flex items-center gap-2"
              >
                <Info className="size-3.5" aria-hidden />
                Source profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setWhyOpen(true)}
                className="flex items-center gap-2"
              >
                <Check className="size-3.5 text-primary" aria-hidden />
                Why this result?
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onCopyLink}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <Check className="size-3.5 text-primary" aria-hidden />
                ) : (
                  <Copy className="size-3.5" aria-hidden />
                )}
                {copied ? 'Link copied' : 'Copy link'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Title (link) */}
      <h3 className="mt-1 text-base leading-snug sm:text-lg">
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          {result.title}
        </a>
      </h3>

      {/* URL breadcrumb */}
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-primary">
        <span className="font-mono truncate">
          {host}
          {path && path !== '/' ? path : ''}
        </span>
        <ExternalLink className="size-3" aria-hidden />
      </div>

      {/* Snippet with highlight */}
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
        {highlightSnippet(truncateLines(result.snippet, 320), query).map((p, i) =>
          p.mark ? (
            <mark
              key={i}
              className="rounded-sm bg-primary/20 px-0.5 text-foreground"
            >
              {p.text}
            </mark>
          ) : (
            <React.Fragment key={i}>{p.text}</React.Fragment>
          ),
        )}
      </p>

      {/* Metadata row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Badge variant="outline" className={cn('text-[10px]', st.badge)}>
          {st.label}
        </Badge>
        {result.docType && (
          <Badge variant="outline" className="text-[10px]">
            <FileText className="size-2.5" aria-hidden />
            {result.docType}
          </Badge>
        )}
        {dateIso && (
          <span
            className="inline-flex items-center gap-1"
            title={formatShortDate(dateIso)}
          >
            <Calendar className="size-3" aria-hidden />
            {relDate}
          </span>
        )}
        {result.language && (
          <span className="inline-flex items-center gap-1">
            <Globe className="size-3" aria-hidden />
            {result.language.toUpperCase()}
          </span>
        )}
        {result.country && (
          <Badge variant="outline" className="text-[10px]">
            {result.country.toUpperCase()}
          </Badge>
        )}
        {result.isOriginal ? (
          <Badge
            variant="outline"
            className="text-[10px] border-primary/30 bg-primary/10 text-primary"
          >
            <Check className="size-2.5" aria-hidden />
            Original
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] border-slate-300 bg-slate-100 text-slate-700"
          >
            Duplicate
          </Badge>
        )}
        {result.author && (
          <span className="text-muted-foreground/80">· {result.author}</span>
        )}
      </div>

      {/* Cluster expansion */}
      {result.clusterSize > 1 && (
        <Collapsible
          open={clusterOpen}
          onOpenChange={setClusterOpen}
          className="mt-2"
        >
          <CollapsibleTrigger
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            aria-expanded={clusterOpen}
          >
            <Users className="size-3" aria-hidden />
            {clusterOpen ? 'Hide cluster' : `${result.clusterSize} more from this cluster`}
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
            <p>
              {result.clusterSize - 1} near-duplicate
              {result.clusterSize - 1 === 1 ? '' : 's'} from {host} are
              collapsed here per the §12 diversity rule. We surface the
              original; the rest remain searchable via direct site queries.
            </p>
            <p className="mt-1 font-mono text-[10px]">
              Cluster ID: {result.clusterId ?? '—'}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Why this result? */}
      <div className="mt-2">
        <Collapsible open={whyOpen} onOpenChange={setWhyOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-primary hover:bg-primary/10 hover:text-primary"
              aria-expanded={whyOpen}
              aria-label={`Why is this result shown for “${query}”?`}
            >
              <Info className="size-3" aria-hidden />
              Why this result?
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <WhyThisResult signals={result.whyThisResult} bare />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </article>
  )
}

export default ResultCard
