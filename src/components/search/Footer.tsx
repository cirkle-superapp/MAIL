/**
 * Footer.tsx
 * -----------------------------------------------------------------------------
 * Sticky footer for the CIRKLE app. Wraps:
 *   - Small CIRKLE logo
 *   - 3 columns of links (About / Privacy / Business)
 *   - The IndexStatusBar (live index stats popover)
 *   - A "Privacy-first search" line
 *
 * On mobile, the 3 link columns collapse into a stacked layout.
 *
 * Sticky footer behavior: the parent wrapper must be `min-h-screen flex flex-col`
 * (see SearchHome / SearchResults). The footer uses `mt-auto` to stick to the
 * bottom when the page content is shorter than one viewport.
 */

'use client'

import * as React from 'react'
import { ShieldCheck, ExternalLink } from 'lucide-react'
import { CirkleLogo } from './CirkleLogo'
import { IndexStatusBar } from './IndexStatusBar'

const LINK_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'About',
    links: [
      { label: 'What is CIRKLE', href: '#' },
      { label: 'How ranking works', href: '#' },
      { label: 'Source transparency', href: '#' },
      { label: 'Roadmap', href: '#' },
    ],
  },
  {
    title: 'Privacy',
    links: [
      { label: 'Privacy-first', href: '#' },
      { label: 'No tracking', href: '#' },
      { label: 'No filter bubble', href: '#' },
      { label: 'Your data', href: '#' },
    ],
  },
  {
    title: 'Business',
    links: [
      { label: 'Advertise', href: '#' },
      { label: 'Partner with us', href: '#' },
      { label: 'Submit a source', href: '#' },
      { label: 'Press', href: '#' },
    ],
  },
]

export function Footer() {
  return (
    <footer
      className="mt-auto border-t border-border bg-background w-full"
      role="contentinfo"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          {/* Brand */}
          <div className="flex flex-col gap-1.5 sm:max-w-xs sm:gap-2">
            <CirkleLogo size={26} withText />
            <p className="hidden text-xs text-muted-foreground max-w-xs sm:block">
              Search the open web. Decide for yourself.
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs text-primary">
              <ShieldCheck className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Privacy-first search — no tracking, no filter bubble.</span>
              <span className="sm:hidden">Privacy-first · No tracking</span>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-6">
            {LINK_COLUMNS.map((col) => (
              <nav
                key={col.title}
                aria-label={col.title}
                className="flex flex-col gap-1.5 sm:gap-2"
              >
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
                  {col.title}
                </h2>
                <ul className="space-y-1 sm:space-y-1.5">
                  {col.links.map((l) => (
                    <li key={l.label} className="hidden sm:list-item">
                      {/* On mobile, only show the first 2 links per column to keep the footer compact. */}
                      <a
                        href={l.href}
                        className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-primary hover:underline"
                      >
                        {l.label}
                        <ExternalLink className="size-3 opacity-60" aria-hidden />
                        <span className="sr-only"> (opens externally)</span>
                      </a>
                    </li>
                  ))}
                  {col.links.slice(0, 2).map((l) => (
                    <li key={`m-${l.label}`} className="sm:hidden">
                      <a
                        href={l.href}
                        className="inline-flex items-center gap-1 text-[11px] text-foreground/80 hover:text-primary hover:underline"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-2 border-t border-border pt-3 sm:mt-6 sm:flex-row sm:items-center sm:gap-3 sm:pt-4">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} CIRKLE — an independent, open web
            search engine.
          </p>
          <IndexStatusBar />
        </div>
      </div>
    </footer>
  )
}

export default Footer
