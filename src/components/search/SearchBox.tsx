/**
 * SearchBox.tsx
 * -----------------------------------------------------------------------------
 * The search input + autocomplete popover + submit button.
 *
 *   variant='home'   — large (h-14 text-lg), max-w-2xl, shadow-lg.
 *   variant='header' — compact (h-11), max-w-xl.
 *
 * Behaviour:
 *   - Controlled input bound to store.query.
 *   - On focus: open the autocomplete popover (if items are available OR the
 *     user starts typing).
 *   - On input: call store.loadAutocomplete(value) (debounced 200ms inside
 *     the store). Update store.query.
 *   - On Enter or button click: store.executeSearch().
 *   - Keyboard inside the autocomplete list:
 *       ArrowDown / ArrowUp — navigate items.
 *       Enter               — select highlighted item.
 *       Escape              — close popover.
 */

'use client'

import * as React from 'react'
import { Search, ArrowRight, Loader2, Clock, Mic, Square } from 'lucide-react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'

// --- Web Speech API minimal typing (the browser API is not in TS lib by default)
interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative
  length: number
  isFinal: boolean
}
interface SpeechRecognitionResultList {
  length: number
  0: SpeechRecognitionResult
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}
interface SpeechRecognitionErrorEvent {
  error: string
  message?: string
}
interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance
}
interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export interface SearchBoxProps {
  variant: 'home' | 'header'
  className?: string
}

export function SearchBox({ variant, className }: SearchBoxProps) {
  const query = useSearchStore((s) => s.query)
  const setQuery = useSearchStore((s) => s.setQuery)
  const executeSearch = useSearchStore((s) => s.executeSearch)
  const loading = useSearchStore((s) => s.loading)
  const autocompleteOpen = useSearchStore((s) => s.autocompleteOpen)
  const autocompleteItems = useSearchStore((s) => s.autocompleteItems)
  const autocompleteLoading = useSearchStore((s) => s.autocompleteLoading)
  const loadAutocomplete = useSearchStore((s) => s.loadAutocomplete)
  const selectAutocomplete = useSearchStore((s) => s.selectAutocomplete)
  const setAutocompleteOpen = useSearchStore((s) => s.setAutocompleteOpen)
  const recentSearches = useSearchStore((s) => s.recentSearches)
  const personalization = useSearchStore((s) => s.filters.personalization)
  const clearRecent = useSearchStore((s) => s.clearRecentSearches)
  const { toast } = useToast()

  // --- Voice search (Web Speech API) ---------------------------------------
  const [listening, setListening] = React.useState(false)
  const recognitionRef = React.useRef<SpeechRecognitionInstance | null>(null)

  // Lazily resolve the SpeechRecognition constructor (browser-only).
  const getRecognitionCtor = React.useCallback(():
    | SpeechRecognitionCtor
    | null => {
    if (typeof window === 'undefined') return null
    const w = window as WindowWithSpeech
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  }, [])

  const stopListening = React.useCallback(() => {
    const rec = recognitionRef.current
    if (rec) {
      try {
        rec.stop()
      } catch {
        // ignore — already stopped
      }
    }
    recognitionRef.current = null
    setListening(false)
  }, [])

  const startListening = React.useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      toast({
        title: 'Voice search not supported',
        description: 'Try Chrome, Edge, or Safari with microphone access.',
      })
      return
    }
    // Abort any previous instance before starting a new one.
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }

    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onstart = () => setListening(true)
    rec.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    rec.onerror = (e) => {
      recognitionRef.current = null
      setListening(false)
      toast({
        title: 'Voice search failed',
        description: `${e.error}${e.message ? ` — ${e.message}` : ''}`,
        variant: 'destructive',
      } as any)
    }
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim() ?? ''
      if (!transcript) return
      // Fill the input + auto-submit.
      setQuery(transcript)
      setAutocompleteOpen(false)
      void executeSearch()
    }

    recognitionRef.current = rec
    try {
      rec.start()
    } catch (err: any) {
      recognitionRef.current = null
      setListening(false)
      toast({
        title: 'Voice search failed',
        description: err?.message ?? String(err),
        variant: 'destructive',
      } as any)
    }
  }, [executeSearch, getRecognitionCtor, setAutocompleteOpen, setQuery, toast])

  // Cleanup on unmount.
  React.useEffect(() => {
    return () => {
      const rec = recognitionRef.current
      if (rec) {
        try {
          rec.abort()
        } catch {
          // ignore
        }
      }
    }
  }, [])
  // Compose a stable callback for "click a recent search → set query + search".
  // We can't inline this in the selector (it would create a new function
  // reference every render → Zustand sees a change → infinite re-render loop).
  const setQueryAndExecute = React.useCallback((q: string) => {
    const store = useSearchStore.getState()
    store.setQuery(q)
    void store.executeSearch()
  }, [])

  const [highlighted, setHighlighted] = React.useState(-1)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const isHome = variant === 'home'

  // When the input is empty + focused, show recent searches (only when
  // personalization is ON — in private mode, recent searches are never
  // recorded/shown). When the input has text, show the regular autocomplete.
  const showRecent = autocompleteOpen && query.trim() === '' && personalization === 'ON' && recentSearches.length > 0
  const open = autocompleteOpen && (autocompleteItems.length > 0 || showRecent)

  // Reset highlight when the list closes or shrinks.
  React.useEffect(() => {
    if (!open) setHighlighted(-1)
    else if (highlighted >= autocompleteItems.length) setHighlighted(0)
  }, [open, autocompleteItems.length, highlighted])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    loadAutocomplete(v)
  }

  const handleFocus = () => {
    if (query.trim()) {
      loadAutocomplete(query)
    } else {
      // Empty input — open the popover so recent searches (if any) show.
      // The actual list content is gated by `showRecent` (personalization ON
      // + recentSearches.length > 0), so in private mode this is a no-op
      // that closes immediately.
      setAutocompleteOpen(true)
    }
  }

  const submit = async () => {
    setAutocompleteOpen(false)
    await executeSearch()
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % autocompleteItems.length)
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setHighlighted((h) =>
        h <= 0 ? autocompleteItems.length - 1 : h - 1,
      )
    } else if (e.key === 'Enter') {
      if (open && highlighted >= 0 && highlighted < autocompleteItems.length) {
        e.preventDefault()
        void selectAutocomplete(autocompleteItems[highlighted])
      } else {
        e.preventDefault()
        void submit()
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        setAutocompleteOpen(false)
      }
    }
  }

  const onItemEnter = (i: number) => () => {
    setHighlighted(i)
  }

  const onItemClick = (s: string) => () => {
    void selectAutocomplete(s)
  }

  // Keep highlighted item in view.
  React.useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-idx="${highlighted}"]`,
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  return (
    <div
      className={cn(
        'relative w-full',
        isHome ? 'mx-auto max-w-2xl' : 'max-w-xl',
        className,
      )}
    >
      <form
        role="search"
        aria-label="CIRKLE"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {/* sr-only label for screen readers */}
        <label htmlFor={isHome ? 'nova-search-home' : 'nova-search-header'} className="sr-only">
          Search the web with CIRKLE
        </label>

        <Popover
          open={open}
          onOpenChange={(o) => {
            if (!o) setAutocompleteOpen(false)
          }}
        >
          <PopoverAnchor asChild>
            <div
              className={cn(
                'relative flex items-center rounded-full border bg-background',
                'border-border shadow-sm transition-shadow',
                'focus-within:border-primary focus-within:shadow-md',
                'dark:border-input',
                isHome
                  ? 'h-14 px-4 shadow-lg sm:px-5'
                  : 'h-11 px-3 sm:px-4',
              )}
            >
              <Search
                className={cn(
                  'shrink-0 text-muted-foreground',
                  isHome ? 'size-5 mr-3' : 'size-4 mr-2',
                )}
                aria-hidden
              />
              <input
                ref={inputRef}
                id={isHome ? 'cirkle-search-home' : 'cirkle-search-header'}
                type="text"
                inputMode="search"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Search query"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls="nova-autocomplete-list"
                role="combobox"
                placeholder={isHome ? 'Search the open web…' : 'Search…'}
                value={query}
                onChange={handleChange}
                onFocus={handleFocus}
                onKeyDown={onInputKeyDown}
                className={cn(
                  'min-w-0 flex-1 bg-transparent outline-none',
                  'placeholder:text-muted-foreground',
                  isHome ? 'text-base sm:text-lg' : 'text-sm',
                )}
              />
              <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={listening ? 'Stop voice search' : 'Search by voice'}
                aria-pressed={listening}
                onClick={listening ? stopListening : startListening}
                className={cn(
                  'inline-flex items-center justify-center rounded-full',
                  'border border-border bg-background text-foreground',
                  'shadow-sm transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  isHome ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-8 w-8',
                  listening &&
                    'border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400',
                )}
              >
                {listening ? (
                  <>
                    {/* Pulsing red dot — the "stop" affordance while recording */}
                    <span
                      className="relative inline-flex"
                      aria-hidden
                    >
                      <span className="absolute inset-0 -m-1 animate-ping rounded-full bg-rose-400/70" />
                      <Square className="size-3 fill-current text-rose-600 dark:text-rose-400" />
                    </span>
                    <span className="sr-only">
                      Voice search is listening — click to stop
                    </span>
                  </>
                ) : (
                  <Mic className={isHome ? 'size-5' : 'size-4'} aria-hidden />
                )}
              </button>
              <button
                type="submit"
                aria-label="Submit search"
                disabled={loading || !query.trim()}
                className={cn(
                  'inline-flex items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground text-white shadow-sm transition-colors',
                  'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                  isHome ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-8 w-8',
                )}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className={isHome ? 'size-5' : 'size-4'} aria-hidden />
                )}
                <span className="sr-only">Search</span>
              </button>
              </div>
            </div>
          </PopoverAnchor>

          <PopoverContent
            id="cirkle-autocomplete-list"
            role="listbox"
            aria-label="Search suggestions"
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              'p-0 max-h-80 overflow-y-auto w-[var(--radix-popover-trigger-width)]',
              'border-border shadow-lg',
            )}
          >
            <div ref={listRef}>
              {/* Recent searches (shown when input is empty + personalization ON) */}
              {showRecent && !autocompleteLoading && (
                <div className="border-b border-border/60 pb-1">
                  <div className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent
                    </span>
                    <button
                      type="button"
                      onClick={() => clearRecent()}
                      className="text-[10px] text-muted-foreground hover:text-rose"
                    >
                      Clear
                    </button>
                  </div>
                  {recentSearches.map((s, i) => (
                    <button
                      key={`recent-${s}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onMouseEnter={onItemEnter(i)}
                      onClick={() => {
                        setAutocompleteOpen(false)
                        setQueryAndExecute(s)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        'hover:bg-primary/10 focus:bg-primary/10 focus:outline-none',
                      )}
                    >
                      <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="flex-1 truncate text-foreground">{s}</span>
                    </button>
                  ))}
                </div>
              )}
              {autocompleteLoading && (
                <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Loading suggestions…
                </div>
              )}
              {!autocompleteLoading && !showRecent && autocompleteItems.length === 0 && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  No suggestions.
                </div>
              )}
              {!autocompleteLoading &&
                autocompleteItems.map((s, i) => (
                  <button
                    key={`${s}-${i}`}
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={i === highlighted}
                    onMouseEnter={onItemEnter(i)}
                    onClick={onItemClick(s)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                      'hover:bg-primary/10 focus:bg-primary/10 focus:outline-none',
                      i === highlighted && 'bg-primary/10',
                    )}
                  >
                    <Search className="size-3.5 text-muted-foreground" aria-hidden />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      </form>
    </div>
  )
}

export default SearchBox
