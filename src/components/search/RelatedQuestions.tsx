/**
 * RelatedQuestions.tsx
 * -----------------------------------------------------------------------------
 * "People also ask"-style accordion. Each question is an accordion trigger;
 * when expanded, shows a "Search for this" link that calls `onSelect(q)`.
 */

'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export interface RelatedQuestionsProps {
  questions: string[]
  onSelect: (q: string) => void
}

export function RelatedQuestions({ questions, onSelect }: RelatedQuestionsProps) {
  if (!questions || questions.length === 0) return null

  return (
    <section
      aria-label="Related questions"
      className="mt-8"
    >
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        People also ask
      </h2>
      <Accordion type="single" collapsible className="w-full">
        {questions.slice(0, 8).map((q, i) => (
          <AccordionItem
            key={i}
            value={`q-${i}`}
            className="rounded-lg border border-border bg-card px-4 mb-2 last:border-b-0"
          >
            <AccordionTrigger
              className="text-left text-sm font-medium hover:text-primary hover:no-underline"
              aria-label={`Expand related question: ${q}`}
            >
              {q}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-muted-foreground">
                  Run a fresh search to explore this question.
                </p>
                <button
                  type="button"
                  onClick={() => onSelect(q)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Search for: ${q}`}
                >
                  <Search className="size-3.5" aria-hidden />
                  Search for this
                </button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

export default RelatedQuestions
