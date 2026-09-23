/**
 * KnowledgeCard.tsx
 * -----------------------------------------------------------------------------
 * Knowledge Graph entity card (§7.3, §23). Rendered beside the organic
 * results when the LLM detects that the query refers to a single clear
 * entity (a person, organization, place, technology, etc.).
 *
 * Every fact cites one or more retrieved sources [n]. The card never invents
 * information — if the sources don't support a fact, that fact is omitted.
 *
 * Confidence classes:
 *   HIGH    → teal border + "Multi-source" badge (≥3 sources agree)
 *   MEDIUM  → gold border + "2 sources" badge
 *   LOW     → muted border + "Single source" badge
 */

'use client'

import * as React from 'react'
import { Brain, ExternalLink, ShieldQuestion } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { KnowledgeCard as KnowledgeCardData } from './types'

interface KnowledgeCardProps {
  card: KnowledgeCardData
}

const CONFIDENCE_STYLES: Record<
  KnowledgeCardData['confidenceClass'],
  { border: string; badge: string; label: string }
> = {
  HIGH: {
    border: 'border-l-teal border-l-4 border-t-0 border-r-0 border-b-0',
    badge: 'bg-teal/15 text-teal border-teal/30',
    label: 'Multi-source',
  },
  MEDIUM: {
    border: 'border-l-gold border-l-4 border-t-0 border-r-0 border-b-0',
    badge: 'bg-gold/15 text-gold border-gold/30',
    label: '2 sources',
  },
  LOW: {
    border: 'border-l-muted-foreground/40 border-l-4 border-t-0 border-r-0 border-b-0',
    badge: 'bg-muted text-muted-foreground border-border',
    label: 'Single source',
  },
}

export function KnowledgeCard({ card }: KnowledgeCardProps) {
  const conf = CONFIDENCE_STYLES[card.confidenceClass]
  return (
    <Card className={cn('overflow-hidden shadow-soft', conf.border)} role="region" aria-label="Knowledge card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="size-4 text-primary" aria-hidden />
            <CardTitle className="font-display text-lg leading-tight">
              {card.entityName}
            </CardTitle>
          </div>
          <Badge variant="outline" className={cn('text-[10px] font-semibold', conf.badge)}>
            {conf.label}
          </Badge>
        </div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {card.entityType}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Description with inline citations */}
        <p className="text-sm leading-relaxed text-foreground/90">
          {renderDescriptionWithCitations(card.description, card.citations)}
        </p>

        <Separator />

        {/* Facts grid */}
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {card.facts.map((fact, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="text-sm text-foreground">
                {fact.value}{' '}
                <span className="ml-0.5 inline-flex gap-0.5">
                  {fact.citations.map((n) => {
                    const cite = card.citations.find((c) => c.id === n)
                    if (!cite) return null
                    return (
                      <TooltipProvider key={n}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={cite.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary hover:bg-primary/30"
                              aria-label={`Citation ${n}: ${cite.title}`}
                            >
                              {n}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs font-medium">{cite.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {cite.sourceType} · {new URL(cite.url).hostname}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <Separator />

        {/* Citations list */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sources ({card.citations.length})
          </p>
          <ul className="space-y-1">
            {card.citations.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-xs">
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold text-primary">
                  {c.id}
                </span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-1 flex-1 text-foreground/80 hover:text-primary hover:underline"
                >
                  {c.title}
                </a>
                <ExternalLink className="size-3 shrink-0 opacity-50" aria-hidden />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
          <ShieldQuestion className="size-3" aria-hidden />
          <span>
            Knowledge card generated from retrieved sources. Always verify with the
            originals.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Renders the description string, converting `[n]` citations into clickable
 * superscript badges (same pattern as the AI Answer card).
 */
function renderDescriptionWithCitations(
  description: string,
  citations: KnowledgeCardData['citations'],
): React.ReactNode {
  const parts = description.split(/(\[\d+\])/)
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/)
    if (!m) return <span key={i}>{part}</span>
    const n = Number(m[1])
    const cite = citations.find((c) => c.id === n)
    if (!cite) return <span key={i}>[{n}]</span>
    return (
      <TooltipProvider key={i}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={cite.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 align-middle text-[10px] font-semibold text-primary hover:bg-primary/30"
              aria-label={`Citation ${n}: ${cite.title}`}
            >
              {n}
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs font-medium">{cite.title}</p>
            <p className="text-[10px] text-muted-foreground">
              {cite.sourceType} · {new URL(cite.url).hostname}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  })
}

export default KnowledgeCard
