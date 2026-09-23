/**
 * WhyThisResult.tsx
 * -----------------------------------------------------------------------------
 * Renders the §15 "WHY THIS RESULT?" checklist — a list of human-readable
 * ranking signals with green checkmarks. Reused inside ResultCard and inside
 * SourceProfileDialog.
 */

'use client'

import * as React from 'react'
import { Check, HelpCircle } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export interface WhyThisResultProps {
  signals: string[]
  defaultOpen?: boolean
  /** Optional className applied to the root wrapper. */
  className?: string
  /** Hide the trigger button (when used inline as a list only). */
  bare?: boolean
}

export function WhyThisResult({
  signals,
  defaultOpen = false,
  className,
  bare = false,
}: WhyThisResultProps) {
  const list = signals && signals.length > 0 ? signals : ['Relevant to your query']
  if (bare) {
    return (
      <ul className={cn('space-y-1.5', className)} aria-label="Why this result is shown">
        {list.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Check
              className="mt-0.5 size-3.5 shrink-0 text-primary"
              aria-hidden
            />
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger
        className="inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-primary hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        aria-expanded={defaultOpen}
      >
        <HelpCircle className="size-3.5" aria-hidden />
        Why this result?
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <ul className="space-y-1.5" aria-label="Why this result is shown">
          {list.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-primary"
                aria-hidden
              />
              <span className="text-muted-foreground">{s}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default WhyThisResult
