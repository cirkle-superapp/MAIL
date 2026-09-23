/**
 * ImageGrid.tsx
 * -----------------------------------------------------------------------------
 * A responsive image grid shown when the search mode is "IMAGES". Each tile
 * shows the page's og:image thumbnail + title + domain. Clicking opens the
 * source page in a new tab.
 *
 * Design: masonry-like grid (CSS columns), glass tiles with spring hover,
 * source-type colored badge.
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import type { SearchResult } from './types'

interface ImageGridProps {
  results: SearchResult[]
}

/** Resolve a potentially-relative og:image URL to an absolute one. */
function resolveImg(src: string | null | undefined, fallbackDomain: string): string | null {
  if (!src) return null
  if (src.startsWith('http://') || src.startsWith('https://')) return src
  if (src.startsWith('//')) return 'https:' + src
  if (src.startsWith('/')) return `https://${fallbackDomain}${src}`
  return `https://${fallbackDomain}/${src}`
}

export function ImageGrid({ results }: ImageGridProps) {
  const withImages = results.filter((r) => r.ogImage)
  if (withImages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium text-foreground">No images found</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          The indexed pages for this query don&apos;t have preview images. Try a different
          query or switch to Balanced mode for text results.
        </p>
      </div>
    )
  }
  return (
    <div
      className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5"
      role="list"
      aria-label="Image results"
    >
      {withImages.map((r, i) => {
        const st = sourceTypeStyle(r.sourceType)
        const imgSrc = resolveImg(r.ogImage, r.domain)
        if (!imgSrc) return null
        return (
          <motion.a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            role="listitem"
            className="group mb-3 block break-inside-avoid overflow-hidden rounded-xl border border-border/60 bg-card shadow-soft transition-all duration-300 hover:border-primary/40 hover:shadow-glass"
            style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.5) }}
          >
            {/* Image */}
            <div className="relative aspect-video overflow-hidden bg-muted">
              <img
                src={imgSrc}
                alt={r.title}
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => {
                  // Hide broken images
                  ;(e.target as HTMLImageElement).parentElement!.style.display = 'none'
                }}
              />
              {/* Source-type dot badge */}
              <span
                className={cn(
                  'absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium backdrop-blur-sm',
                  st.badge,
                )}
              >
                {st.label}
              </span>
            </div>
            {/* Caption */}
            <div className="p-2.5">
              <p className="line-clamp-2 text-xs font-medium leading-tight text-foreground group-hover:text-primary">
                {r.title}
              </p>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="truncate">{r.domain}</span>
                <ExternalLink className="size-2.5 shrink-0 opacity-50" aria-hidden />
              </div>
            </div>
          </motion.a>
        )
      })}
    </div>
  )
}

export default ImageGrid
