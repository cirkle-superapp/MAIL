/**
 * Pagination.tsx
 * -----------------------------------------------------------------------------
 * Google-style pagination: prev | 1 2 3 4 5 | next. Current page is primary.
 * Numbers are buttons. Disabled state for first/last.
 */

'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SearchPagination as PaginationShape } from './types'

export interface PaginationProps {
  pagination: PaginationShape
  onPageChange: (p: number) => void
}

/** Build a 5-item window around the current page, with first/last. */
function buildWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const out: (number | '…')[] = []
  out.push(1)
  const start = Math.max(2, current - 2)
  const end = Math.min(total - 1, current + 2)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, totalPages } = pagination
  if (totalPages <= 1) return null

  const window = buildWindow(page, totalPages)
  const atFirst = page <= 1
  const atLast = page >= totalPages

  return (
    <nav
      aria-label="Search results pagination"
      className="mt-8 flex items-center justify-center gap-1.5"
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={atFirst}
        onClick={() => !atFirst && onPageChange(page - 1)}
        aria-label="Previous page"
        className="gap-1"
      >
        <ChevronLeft className="size-4" aria-hidden />
        <span className="hidden sm:inline">Prev</span>
      </Button>

      {window.map((item, idx) => {
        if (item === '…') {
          return (
            <span
              key={`ellipsis-${idx}`}
              className="px-2 text-sm text-muted-foreground"
              aria-hidden
            >
              …
            </span>
          )
        }
        const isCurrent = item === page
        return (
          <Button
            key={`page-${item}`}
            variant={isCurrent ? 'default' : 'ghost'}
            size="sm"
            onClick={() => !isCurrent && onPageChange(item)}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={`Page ${item}${isCurrent ? ' (current)' : ''}`}
            className={cn(
              'h-8 min-w-8 px-2',
              isCurrent &&
                'bg-primary text-primary-foreground text-white hover:bg-primary/90',
            )}
          >
            {item}
          </Button>
        )
      })}

      <Button
        variant="ghost"
        size="sm"
        disabled={atLast}
        onClick={() => !atLast && onPageChange(page + 1)}
        aria-label="Next page"
        className="gap-1"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </nav>
  )
}

export default Pagination
