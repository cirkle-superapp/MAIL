/**
 * InstantAnswer.tsx
 * -----------------------------------------------------------------------------
 * A premium card shown at the TOP of the SERP (above the AI Answer + organic
 * results) when the query triggers a real-time tool:
 *
 *   - weather  → "Weather in Dubai" (Open-Meteo)
 *   - time     → "Current time in London" (Intl API)
 *   - math     → "Calculation: 2+2 = 4"
 *
 * These answer INSTANTLY (1-2s) because they don't go through the index or
 * the AI — they're direct API calls. This is the CIRKLE "advanced browser"
 * capability: real-time answers that no static index can serve.
 *
 * Design: glass card with a gold left-accent border, a kind-specific icon,
 * the answer summary, a facts grid, and the data source attribution.
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { Cloud, Clock, Calculator, ExternalLink, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { InstantAnswer } from './types'

const KIND_META = {
  weather: { icon: Cloud, accent: 'border-l-teal', label: 'Live weather' },
  time: { icon: Clock, accent: 'border-l-gold', label: 'Live time' },
  math: { icon: Calculator, accent: 'border-l-rose', label: 'Calculation' },
  convert: { icon: Calculator, accent: 'border-l-steel', label: 'Unit conversion' },
  currency: { icon: Calculator, accent: 'border-l-gold', label: 'Currency conversion' },
} as const

interface InstantAnswerCardProps {
  answer: InstantAnswer
}

export function InstantAnswerCard({ answer }: InstantAnswerCardProps) {
  const meta = KIND_META[answer.kind] ?? KIND_META.math
  const Icon = meta.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card
        className={cn(
          'overflow-hidden border-l-4 border-t-0 border-r-0 border-b-0 shadow-soft',
          meta.accent,
        )}
        role="region"
        aria-label={meta.label}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10">
                <Icon className="size-4 text-primary" aria-hidden />
              </span>
              <CardTitle className="font-display text-lg leading-tight">
                {answer.title}
              </CardTitle>
            </div>
            <Badge variant="outline" className="gap-1 text-[10px] font-semibold text-gold border-gold/40">
              <Zap className="size-2.5" aria-hidden />
              Instant
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Summary */}
          <p className="text-sm leading-relaxed text-foreground/90">
            {answer.summary}
          </p>

          {/* Facts grid */}
          {answer.facts.length > 0 && (
            <>
              <Separator />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {answer.facts.map((f, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {f.label}
                    </dt>
                    <dd className="text-sm font-medium text-foreground">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {/* Source attribution */}
          {answer.source && (
            <div className="flex items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
              <span>Source:</span>
              {answer.sourceUrl ? (
                <a
                  href={answer.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-teal hover:underline"
                >
                  {answer.source}
                  <ExternalLink className="size-2.5" aria-hidden />
                </a>
              ) : (
                <span className="text-teal">{answer.source}</span>
              )}
              <span aria-hidden>·</span>
              <span>fetched {new Date(answer.fetchedAt).toLocaleTimeString()}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default InstantAnswerCard
