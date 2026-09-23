/**
 * SearchHeader.tsx
 * -----------------------------------------------------------------------------
 * Sticky top header used inside SearchResults. Contains:
 *   - CirkleLogo (small)
 *   - SearchBox variant="header"
 *   - ModeTabs variant="header"
 *   - "Filters" button → opens FilterPanel
 *   - "Deep Research" button → opens ResearchPanel
 *   - AI quick toggle (AUTO / ON / OFF)
 *   - Personalization quick toggle
 *
 * Layout is responsive — on mobile the second row of controls collapses into
 * a horizontally-scrollable strip.
 */

'use client'

import * as React from 'react'
import {
  SlidersHorizontal,
  Brain,
  Bot,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { CirkleLogo } from './CirkleLogo'
import { SearchBox } from './SearchBox'
import { ModeTabs } from './ModeTabs'
import { FilterPanel } from './FilterPanel'
import { ResearchPanel } from './ResearchPanel'
import { SourceProfileDialog } from './SourceProfileDialog'
import { ThemeToggle } from './ThemeToggle'
import { SavedSearchesPanel } from './SavedSearchesPanel'
import { Bookmark, Plus, Command } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function SearchHeader() {
  const toggleFilter = useSearchStore((s) => s.toggleFilter)
  const showFilters = useSearchStore((s) => s.showFilters)
  const toggleResearch = useSearchStore((s) => s.toggleResearch)
  const showResearch = useSearchStore((s) => s.showResearch)
  const researchLoading = useSearchStore((s) => s.researchLoading)

  const filters = useSearchStore((s) => s.filters)
  const setFilters = useSearchStore((s) => s.setFilters)
  const executeSearch = useSearchStore((s) => s.executeSearch)
  const query = useSearchStore((s) => s.query)
  const saveCurrentSearch = useSearchStore((s) => s.saveCurrentSearch)
  const toggleSavedSearches = useSearchStore((s) => s.toggleSavedSearches)
  const showSavedSearches = useSearchStore((s) => s.showSavedSearches)
  const savedCount = useSearchStore((s) => s.savedSearches.length)
  const { toast } = useToast()
  const showSourceProfile = useSearchStore((s) => s.showSourceProfile)
  const openSourceProfile = useSearchStore((s) => s.openSourceProfile)

  return (
    <header
      className={cn(
        'sticky top-0 z-30 w-full border-b border-border/80 bg-background/80 backdrop-blur-xl',
        'supports-[backdrop-filter]:bg-background/65 shadow-soft',
      )}
      role="banner"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-2.5 sm:px-6 lg:px-8">
        {/* Row 1: logo + search box */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="hidden shrink-0 items-center sm:flex"
            aria-label="Go to CIRKLE home"
          >
            <CirkleLogo size={26} withText={false} />
          </a>
          <SearchBox variant="header" className="flex-1" />
          <Button
            variant={showResearch ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleResearch()}
            disabled={!query.trim()}
            className={cn(
              'hidden shrink-0 gap-1.5 sm:inline-flex',
              showResearch && 'bg-primary text-primary-foreground text-white hover:bg-primary/90',
            )}
            aria-label="Open deep research panel"
            aria-expanded={showResearch}
          >
            {researchLoading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Brain className="size-3.5" aria-hidden />
            )}
            Deep Research
          </Button>
        </div>

        {/* Row 2: mode tabs + controls */}
        <div className="mt-2 flex items-center gap-2 overflow-x-auto">
          <ModeTabs
            variant="header"
            className="flex-1 min-w-0"
          />

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleFilter()}
              className={cn(
                'gap-1.5',
                showFilters && 'bg-primary text-primary-foreground text-white hover:bg-primary/90',
              )}
              aria-label="Open filters panel"
              aria-expanded={showFilters}
            >
              <SlidersHorizontal className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Filters</span>
            </Button>

            {/* AI mode quick switch */}
            <div className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 md:flex">
              <Bot className="size-3 text-primary" aria-hidden />
              <Label
                htmlFor="header-ai-mode"
                className="text-[10px] font-normal text-muted-foreground"
              >
                AI
              </Label>
              <Select
                value={filters.aiMode}
                onValueChange={(v) => {
                  setFilters({ aiMode: v as 'AUTO' | 'ON' | 'OFF' })
                  // Instant toggle — re-run search immediately so the user
                  // sees the AI answer (or its absence) without having to
                  // click "Apply" elsewhere.
                  if (query.trim()) void executeSearch()
                }}
              >
                <SelectTrigger
                  id="header-ai-mode"
                  className="h-6 w-14 gap-1 border-0 px-1 text-[11px] shadow-none focus:ring-0"
                  aria-label="AI mode"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Auto</SelectItem>
                  <SelectItem value="ON">On</SelectItem>
                  <SelectItem value="OFF">Off</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Personalization quick toggle */}
            <div className="hidden items-center gap-1 rounded-md border border-border px-2 py-1 md:flex">
              <ShieldCheck
                className={cn(
                  'size-3',
                  filters.personalization === 'ON'
                    ? 'text-primary'
                    : 'text-muted-foreground',
                )}
                aria-hidden
              />
              <Label
                htmlFor="header-pers"
                className="text-[10px] font-normal text-muted-foreground"
              >
                Personalize
              </Label>
              <Switch
                id="header-pers"
                checked={filters.personalization === 'ON'}
                onCheckedChange={(c) => {
                  setFilters({ personalization: c ? 'ON' : 'OFF' })
                  // Instant toggle — re-run search so personalization
                  // factors / history persistence reflect immediately.
                  if (query.trim()) void executeSearch()
                }}
                aria-label="Toggle personalization"
              />
            </div>

            <Button
              variant={showResearch ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleResearch()}
              disabled={!query.trim()}
              className={cn(
                'gap-1.5 sm:hidden',
                showResearch && 'bg-primary text-primary-foreground text-white hover:bg-primary/90',
              )}
              aria-label="Open deep research panel"
              aria-expanded={showResearch}
            >
              {researchLoading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Brain className="size-3.5" aria-hidden />
              )}
              Research
            </Button>

            {/* Save current search (bookmark). localStorage-only. */}
            <Button
              variant="outline"
              size="icon"
              disabled={!query.trim()}
              onClick={() => {
                saveCurrentSearch()
                toast({
                  title: 'Search saved',
                  description: `Saved "${query}" with current mode + filters.`,
                })
              }}
              className="hidden size-9 shrink-0 sm:inline-flex"
              aria-label="Save this search"
              title="Save this search"
            >
              <Plus className="size-4" aria-hidden />
            </Button>

            {/* Open saved searches */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => toggleSavedSearches()}
              className="relative hidden size-9 shrink-0 sm:inline-flex"
              aria-label={`Saved searches (${savedCount})`}
              aria-expanded={showSavedSearches}
              title="Saved searches"
            >
              <Bookmark className="size-4" aria-hidden />
              {savedCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {savedCount > 99 ? '99+' : savedCount}
                </span>
              )}
            </Button>

            {/* Theme toggle — light / dark. The CIRKLE dark variant uses
                gold-on-charcoal + glass morphism. */}
            <ThemeToggle className="hidden sm:inline-flex" />

            {/* Command palette trigger (Cmd+K) — premium quick-action overlay */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => useSearchStore.getState().toggleCommandPalette()}
              className="hidden items-center gap-1.5 rounded-md border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground md:inline-flex"
              aria-label="Open command palette (Cmd+K)"
              title="Command palette — Cmd+K"
            >
              <Command className="size-3" aria-hidden />
              <kbd className="font-mono text-[10px]">⌘K</kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop inline FilterPanel — only shown when toggled open. */}
      {showFilters && (
        <div className="hidden border-t border-border bg-background/95 backdrop-blur lg:block">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-8">
            <FilterPanel as="card" />
          </div>
        </div>
      )}
      {/* Mobile Sheet-based FilterPanel — Sheet is invisible until open. */}
      <div className="lg:hidden">
        <FilterPanel as="sheet" />
      </div>

      <ResearchPanel />

      <SavedSearchesPanel />

      <SourceProfileDialog
        docId={showSourceProfile}
        onClose={() => openSourceProfile(null)}
      />
    </header>
  )
}

export default SearchHeader
