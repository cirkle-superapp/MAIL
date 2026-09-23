/**
 * SavedSearchesPanel.tsx
 * -----------------------------------------------------------------------------
 * Sheet showing the user's saved searches (localStorage-only — never sent
 * to the server). Each entry shows the query, mode badge, freshness, result
 * count, and when it was saved. Clicking an entry applies it (restores
 * query + mode + filters + executes search). Delete removes it.
 *
 * Privacy: this data lives only in the user's browser. CIRKLE never sees it
 * unless the user explicitly enables server-side personalization in the
 * future.
 */

'use client'

import * as React from 'react'
import { Bookmark, Trash2, Clock, Search } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSearchStore } from '@/store/search-store'
import { formatRelativeTime } from './format'
import { sourceTypeStyle } from './source-type'

export function SavedSearchesPanel() {
  const open = useSearchStore((s) => s.showSavedSearches)
  const toggle = useSearchStore((s) => s.toggleSavedSearches)
  const savedSearches = useSearchStore((s) => s.savedSearches)
  const apply = useSearchStore((s) => s.applySavedSearch)
  const remove = useSearchStore((s) => s.deleteSavedSearch)

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) toggle() }}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-md"
        aria-label="Saved searches"
      >
        <SheetHeader className="border-b border-border p-4 pb-3">
          <SheetTitle className="flex items-center gap-2 font-display">
            <Bookmark className="size-4 text-primary" aria-hidden />
            Saved searches
          </SheetTitle>
          <SheetDescription>
            Your saved queries live only in this browser. CIRKLE never sees them.
          </SheetDescription>
        </SheetHeader>

        <div className="p-4">
          {savedSearches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Bookmark className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">No saved searches yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Run a search, then click the bookmark icon in the header to save it here.
                Saved searches remember your query, mode, and filters.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" role="list">
              {savedSearches.map((s) => (
                <li key={s.id}>
                  <div className="group rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/5">
                    <button
                      type="button"
                      onClick={() => apply(s.id)}
                      className="block w-full text-left"
                      aria-label={`Apply saved search: ${s.query}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 flex-1 text-sm font-medium text-foreground">
                          {s.query}
                        </p>
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {s.mode}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="size-2.5" aria-hidden />
                          {formatRelativeTime(s.savedAt)}
                        </span>
                        {s.filters.freshness !== 'ANY' && (
                          <span className="rounded bg-muted px-1 py-0.5">
                            {s.filters.freshness}
                          </span>
                        )}
                        {s.filters.sourceTypes.map((st) => (
                          <span
                            key={st}
                            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 ${sourceTypeStyle(st).badge}`}
                          >
                            {sourceTypeStyle(st).label}
                          </span>
                        ))}
                        {typeof s.resultCount === 'number' && (
                          <span className="rounded bg-muted px-1 py-0.5">
                            {s.resultCount} results
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          remove(s.id)
                        }}
                        className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-rose"
                        aria-label={`Delete saved search: ${s.query}`}
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Separator className="my-4" />

          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <Search className="size-3 shrink-0" aria-hidden />
            <p>
              <strong className="text-foreground">Privacy-first.</strong> Saved searches are
              stored only in your browser&apos;s localStorage. Clearing your browser data
              removes them. No server-side profile is built from these.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default SavedSearchesPanel
