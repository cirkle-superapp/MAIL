/**
 * FilterPanel.tsx
 * -----------------------------------------------------------------------------
 * The filters UI. Mobile: rendered as a Sheet (right-side drawer). Desktop:
 * rendered inline as a Card. Parent component (SearchHeader) chooses which to
 * mount based on the viewport (we use Tailwind breakpoints via CSS only — to
 * avoid an extra `useMediaQuery` hook, both elements are mounted but only one
 * is visible at each breakpoint). That's a bit of a trade-off but keeps the
 * component self-contained.
 *
 * Filter sections (Accordion):
 *   1. Freshness        — radio Any / Hour / Day / Week / Month / Year / Custom
 *      (when Custom: two date inputs)
 *   2. Source type      — 8 checkboxes with colored dot badges
 *   3. Domain diversity — radio 1 / 2 / 3 / Unlimited
 *   4. AI               — radio Auto / Always On / Always Off
 *   5. Personalization  — switch ON / OFF (+ private-mode note when OFF)
 *   6. Safe search      — switch ON / OFF
 *
 * Footer buttons: Apply → store.executeSearch(). Reset → store.resetFilters().
 */

'use client'

import * as React from 'react'
import {
  SlidersHorizontal,
  Check,
  RotateCcw,
  Lock,
  ShieldCheck,
  Bot,
  Clock,
  Globe,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSearchStore } from '@/store/search-store'
import { ALL_SOURCE_TYPES, sourceTypeStyle } from './source-type'
import { cn } from '@/lib/utils'
import type { Freshness, SourceType } from './types'

const FRESHNESS_OPTIONS: { value: Freshness; label: string }[] = [
  { value: 'ANY', label: 'Any time' },
  { value: 'HOUR', label: 'Past hour' },
  { value: 'DAY', label: 'Today' },
  { value: 'WEEK', label: 'Past week' },
  { value: 'MONTH', label: 'Past month' },
  { value: 'YEAR', label: 'Past year' },
  { value: 'CUSTOM', label: 'Custom range…' },
]

const DIVERSITY_OPTIONS: { value: '1' | '2' | '3' | '0'; label: string }[] = [
  { value: '1', label: '1 per domain' },
  { value: '2', label: '2 per domain' },
  { value: '3', label: '3 per domain' },
  { value: '0', label: 'Unlimited' },
]

const AI_OPTIONS: { value: 'AUTO' | 'ON' | 'OFF'; label: string; hint: string }[] = [
  { value: 'AUTO', label: 'Auto', hint: 'AI answer shown when supported.' },
  { value: 'ON', label: 'Always on', hint: 'Always attempt an AI summary.' },
  { value: 'OFF', label: 'Always off', hint: 'No AI summaries — pure results.' },
]

export interface FilterPanelProps {
  /** Render target. 'sheet' on mobile, 'card' inline on desktop. */
  as: 'sheet' | 'card'
}

export function FilterPanel({ as }: FilterPanelProps) {
  const filters = useSearchStore((s) => s.filters)
  const setFilters = useSearchStore((s) => s.setFilters)
  const executeSearch = useSearchStore((s) => s.executeSearch)
  const resetFilters = useSearchStore((s) => s.resetFilters)
  const showFilters = useSearchStore((s) => s.showFilters)
  const toggleFilter = useSearchStore((s) => s.toggleFilter)

  const body = (
    <>
      <Accordion
        type="multiple"
        defaultValue={['freshness', 'source', 'ai']}
        className="w-full"
      >
        {/* Freshness */}
        <AccordionItem value="freshness">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4 text-primary" aria-hidden />
              Freshness
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <RadioGroup
              value={filters.freshness}
              onValueChange={(v) => setFilters({ freshness: v as Freshness })}
              className="gap-2"
            >
              {FRESHNESS_OPTIONS.map((o) => (
                <Label
                  key={o.value}
                  className="flex items-center gap-2.5 text-sm font-normal"
                >
                  <RadioGroupItem value={o.value} />
                  <span>{o.label}</span>
                </Label>
              ))}
            </RadioGroup>
            {filters.freshness === 'CUSTOM' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="filter-from" className="sr-only">
                    From date
                  </Label>
                  <input
                    id="filter-from"
                    type="date"
                    value={filters.freshnessCustomStart ?? ''}
                    onChange={(e) =>
                      setFilters({ freshnessCustomStart: e.target.value })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs"
                    aria-label="Custom freshness start date"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-to" className="sr-only">
                    To date
                  </Label>
                  <input
                    id="filter-to"
                    type="date"
                    value={filters.freshnessCustomEnd ?? ''}
                    onChange={(e) =>
                      setFilters({ freshnessCustomEnd: e.target.value })
                    }
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs"
                    aria-label="Custom freshness end date"
                  />
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Source type */}
        <AccordionItem value="source">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <Globe className="size-4 text-teal" aria-hidden />
              Source type
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-2">
              {ALL_SOURCE_TYPES.map((t: SourceType) => {
                const checked = filters.sourceTypes.includes(t)
                const st = sourceTypeStyle(t)
                return (
                  <Label
                    key={t}
                    className="flex items-center gap-2.5 text-sm font-normal"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const current = new Set(filters.sourceTypes)
                        if (c) current.add(t)
                        else current.delete(t)
                        setFilters({
                          sourceTypes: Array.from(current) as SourceType[],
                        })
                      }}
                    />
                    <span
                      className={cn('size-2.5 rounded-full', st.dot)}
                      aria-hidden
                    />
                    <span className="font-medium">{st.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {st.description}
                    </span>
                  </Label>
                )
              })}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Domain diversity */}
        <AccordionItem value="diversity">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-primary" aria-hidden />
              Domain diversity
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <RadioGroup
              value={String(filters.domainDiversity)}
              onValueChange={(v) =>
                setFilters({
                  domainDiversity: parseInt(v, 10) as 0 | 1 | 2 | 3,
                })
              }
              className="grid grid-cols-2 gap-2"
            >
              {DIVERSITY_OPTIONS.map((o) => (
                <Label
                  key={o.value}
                  className="flex items-center gap-2.5 text-sm font-normal"
                >
                  <RadioGroupItem value={o.value} />
                  <span>{o.label}</span>
                </Label>
              ))}
            </RadioGroup>
            <p className="mt-2 text-xs text-muted-foreground">
              Limit how many results come from a single domain. Per §12 we never
              suppress when there are no real alternatives.
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* AI mode */}
        <AccordionItem value="ai">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <Bot className="size-4 text-primary" aria-hidden />
              AI answers
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <RadioGroup
              value={filters.aiMode}
              onValueChange={(v) =>
                setFilters({ aiMode: v as 'AUTO' | 'ON' | 'OFF' })
              }
              className="grid gap-2"
            >
              {AI_OPTIONS.map((o) => (
                <Label
                  key={o.value}
                  className="flex items-start gap-2.5 text-sm font-normal"
                >
                  <RadioGroupItem value={o.value} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      {o.hint}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </AccordionContent>
        </AccordionItem>

        {/* Personalization */}
        <AccordionItem value="pers">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Personalization
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Label
              htmlFor="filter-pers"
              className="flex items-center justify-between gap-2 text-sm font-normal"
            >
              <span>
                <span className="font-medium">Personalization</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  Use language / region signals. Stored locally only when ON.
                </span>
              </span>
              <Switch
                id="filter-pers"
                checked={filters.personalization === 'ON'}
                onCheckedChange={(c) =>
                  setFilters({ personalization: c ? 'ON' : 'OFF' })
                }
                aria-label="Toggle personalization"
              />
            </Label>
            {filters.personalization === 'OFF' && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-xs text-primary">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">Private mode</span> — no history,
                  no profiling, no persisted preferences. Your query is
                  anonymized before aggregation.
                </span>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Safe search */}
        <AccordionItem value="safe">
          <AccordionTrigger className="text-sm">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Safe search
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Label
              htmlFor="filter-safe"
              className="flex items-center justify-between gap-2 text-sm font-normal"
            >
              <span>
                <span className="font-medium">Safe search</span>
                <br />
                <span className="text-xs text-muted-foreground">
                  Hide explicit / spam-flagged results.
                </span>
              </span>
              <Switch
                id="filter-safe"
                checked={filters.safeSearch === 'ON'}
                onCheckedChange={(c) =>
                  setFilters({ safeSearch: c ? 'ON' : 'OFF' })
                }
                aria-label="Toggle safe search"
              />
            </Label>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Separator className="my-4" />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          Freshness: <span className="ml-1 font-normal">{filters.freshness}</span>
        </Badge>
        <Badge variant="outline" className="text-xs">
          AI: <span className="ml-1 font-normal">{filters.aiMode}</span>
        </Badge>
        <Badge variant="outline" className="text-xs">
          Diversity: <span className="ml-1 font-normal">{filters.domainDiversity === 0 ? '∞' : filters.domainDiversity}</span>
        </Badge>
        {filters.sourceTypes.length > 0 && (
          <Badge variant="outline" className="text-xs">
            Sources: <span className="ml-1 font-normal">{filters.sourceTypes.length}</span>
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            void executeSearch()
            if (as === 'sheet') toggleFilter()
          }}
          className="bg-primary text-primary-foreground text-white hover:bg-primary/90"
        >
          <Check className="size-4" aria-hidden />
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => resetFilters()}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </Button>
      </div>
    </>
  )

  if (as === 'sheet') {
    return (
      <Sheet open={showFilters} onOpenChange={(o) => !o && toggleFilter()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="size-4 text-primary" aria-hidden />
              Filters
            </SheetTitle>
            <SheetDescription className="sr-only">
              Refine your search by freshness, source type, diversity, AI
              answers, personalization, and safe search.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">
            {body}
          </div>
          <SheetFooter className="border-t border-border">
            <SheetClose asChild>
              <Button variant="ghost" size="sm">
                Close
              </Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  // Desktop inline card
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

export default FilterPanel
