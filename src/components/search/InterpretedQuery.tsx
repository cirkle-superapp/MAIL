/**
 * InterpretedQuery.tsx  —  @deprecated (Task 80)
 * -----------------------------------------------------------------------------
 * Renders the small "Interpreted query" panel under the search box on the
 * results page.
 *
 * @deprecated This component was REPLACED by `QueryDna.tsx` in Task 80 (creative
 * search). QueryDna is the new algorithmic introspection card — it visualizes
 * tokens (colored by POS), intent badge, entity icons, languages, with a
 * spring entrance + glass background. InterpretedQuery is kept as a fallback
 * in case QueryDna has issues — but SearchResults.tsx now renders QueryDna.
 *
 * To restore: replace `<QueryDna />` with `<InterpretedQuery />` in
 * SearchResults.tsx (it's still a working component).
 *
 * The backend's `SearchResponse.interpretedQuery` is currently a string
 * (see `src/lib/search/index.ts` — assembled from tokens + phrases). We
 * render that string as a single "Interpreted" pill and, when possible,
 * surface detected entities / intent derived from the query text on the
 * client side as a convenience (since the backend does not currently emit
 * a structured object — the frontend gracefully degrades).
 */

'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, Sparkles, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface InterpretedQueryProps {
  /** The `interpretedQuery` field from SearchResponse — a string in the
   * current backend implementation, but we accept `unknown` defensively. */
  interpreted: unknown
  /** Optional related questions, used to derive extra chips. */
  personalizationFactors?: string[]
  className?: string
}

interface ParsedShape {
  intent?: string
  tokens?: string[]
  phrases?: string[]
  exclusions?: string[]
  entities?: { text: string; type?: string }[]
  languages?: string[]
  countries?: string[]
  sourcePreference?: string
  modeHint?: string
}

function coerce(input: unknown): { stringForm: string; obj: ParsedShape | null } {
  if (typeof input === 'string') return { stringForm: input, obj: null }
  if (input && typeof input === 'object') {
    const o = input as ParsedShape
    const str =
      (Array.isArray(o.tokens) ? o.tokens.join(' ') : '') +
      (Array.isArray(o.phrases) && o.phrases.length ? ` (phrase: "${o.phrases.join('", "')}")` : '')
    return { stringForm: str || JSON.stringify(input), obj: o }
  }
  return { stringForm: '', obj: null }
}

export function InterpretedQuery({
  interpreted,
  personalizationFactors = [],
  className,
}: InterpretedQueryProps) {
  const [expanded, setExpanded] = React.useState(false)
  const { stringForm, obj } = coerce(interpreted)

  if (!stringForm && !obj) return null

  const chips: { label: string; value: string }[] = []
  if (obj?.intent) chips.push({ label: 'Intent', value: obj.intent })
  if (obj?.sourcePreference) chips.push({ label: 'Source preference', value: obj.sourcePreference })
  if (obj?.modeHint) chips.push({ label: 'Mode hint', value: obj.modeHint })
  if (obj?.languages && obj.languages.length > 0)
    chips.push({ label: 'Languages', value: obj.languages.join(', ') })
  if (obj?.countries && obj.countries.length > 0)
    chips.push({ label: 'Regions', value: obj.countries.join(', ') })
  if (obj?.exclusions && obj.exclusions.length > 0)
    chips.push({ label: 'Excluded', value: obj.exclusions.join(', ') })

  const entityChips = (obj?.entities ?? []).slice(0, 6)

  // On mobile, collapse the chips if there are more than 3 and not expanded.
  const visibleChips = expanded ? chips : chips.slice(0, 3)
  const visibleEntities = expanded ? entityChips : entityChips.slice(0, 2)

  return (
    <section
      aria-label="Interpreted query"
      className={cn(
        'w-full rounded-lg border bg-primary/10 bg-primary/10 px-3 py-2',
        'text-sm text-foreground',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          <span className="font-medium">Interpreted</span>
        </span>
        {stringForm && (
          <span className="font-mono text-xs text-muted-foreground">
            {stringForm}
          </span>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleChips.map((c, i) => (
            <Badge
              key={i}
              variant="outline"
              className="border-primary/30 bg-white text-primary"
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {c.label}
              </span>
              <span className="ml-1 font-normal">{c.value}</span>
            </Badge>
          ))}
          {chips.length > 3 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-xs text-primary hover:bg-primary/20"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Show fewer interpreted query details' : 'Show more interpreted query details'}
            >
              {expanded ? (
                <ChevronUp className="size-3" aria-hidden />
              ) : (
                <ChevronDown className="size-3" aria-hidden />
              )}
              {expanded ? 'Less' : `+${chips.length - 3} more`}
            </Button>
          )}
        </div>
      )}

      {entityChips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {visibleEntities.map((e, i) => (
            <Badge
              key={i}
              variant="outline"
              className="border-teal bg-teal text-teal"
            >
              <Tag className="size-3" aria-hidden />
              <span className="ml-1">{e.text}</span>
              {e.type && (
                <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {e.type}
                </span>
              )}
            </Badge>
          ))}
        </div>
      )}

      {personalizationFactors.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="sr-only">Active personalization factors</span>
          {personalizationFactors.map((f, i) => (
            <span key={i} className="rounded bg-muted px-1.5 py-0.5">
              {f}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

export default InterpretedQuery
