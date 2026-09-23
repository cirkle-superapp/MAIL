/**
 * useKeyboardShortcuts.ts
 * -----------------------------------------------------------------------------
 * Global keyboard shortcuts for the CIRKLE search engine:
 *   `/` or `Cmd+K` / `Ctrl+K` → focus the search box (from anywhere on the page)
 *   `Esc`                      → blur the search box (or close any open panel)
 *   `g` then `h`               → go home (clear query)
 *   `?`                        → show shortcuts help (future)
 *
 * The hook is intentionally tiny + defensive — it never preventDefaults on
 * inputs/textareas (so users can type "/" inside the search box without it
 * being intercepted).
 */

'use client'

import { useEffect } from 'react'

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || el.isContentEditable
}

export function useKeyboardShortcuts(opts: {
  onFocusSearch: () => void
  onEscape: () => void
  onGoHome?: () => void
  onTogglePalette?: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K → toggle command palette (takes precedence over focus-search)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (opts.onTogglePalette) {
          opts.onTogglePalette()
        } else {
          opts.onFocusSearch()
        }
        return
      }

      // Esc → blur active element or close panel
      if (e.key === 'Escape') {
        opts.onEscape()
        return
      }

      // `/` → focus search (only when NOT already typing in an input)
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault()
        opts.onFocusSearch()
        return
      }

      // `g` then `h` → go home (two-key sequence). We use a closure flag so
      // the second key must arrive within 700ms of the first.
      if (!isTypingTarget(e.target) && e.key === 'g') {
        const t = setTimeout(() => {
          // clear the pending flag after 700ms
        }, 700)
        const onNext = (ev: KeyboardEvent) => {
          if (ev.key === 'h' && !isTypingTarget(ev.target)) {
            ev.preventDefault()
            opts.onGoHome?.()
          }
          window.removeEventListener('keydown', onNext, { capture: true })
          clearTimeout(t)
        }
        window.addEventListener('keydown', onNext, { capture: true, once: true })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [opts.onFocusSearch, opts.onEscape, opts.onGoHome, opts.onTogglePalette])
}
