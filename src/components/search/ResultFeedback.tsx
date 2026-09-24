/**
 * ResultFeedback.tsx
 * -----------------------------------------------------------------------------
 * A small 👍/👎/Report row rendered at the bottom of each ResultCard.
 *
 *   - 👍 ThumbsUp button → POSTs {vote:'up'} to /api/feedback
 *   - 👎 ThumbsDown button → POSTs {vote:'down'}
 *   - "Report" link → opens a Popover with `spam` / `irrelevant` buttons
 *
 * After voting:
 *   - The chosen button is highlighted (filled icon)
 *   - All buttons are disabled
 *   - A tiny "Thanks!" toast confirms the vote
 *   - The vote is persisted in localStorage so the user can't vote twice on
 *     the same (query, docId) pair (we trust the client for UX only — the
 *     server is the source of truth for aggregation)
 */

'use client'

import * as React from 'react'
import { ThumbsUp, ThumbsDown, Flag, ShieldAlert, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Vote = 'up' | 'down' | 'spam' | 'irrelevant'

interface ResultFeedbackProps {
  query: string
  docId: string
  docUrl: string
}

// --- localStorage helpers ---------------------------------------------------

function storageKey(query: string, docId: string): string {
  return `cirkle:vote:${query.trim().toLowerCase()}::${docId}`
}

function readVote(query: string, docId: string): Vote | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(storageKey(query, docId))
    if (v === 'up' || v === 'down' || v === 'spam' || v === 'irrelevant') {
      return v
    }
    return null
  } catch {
    return null
  }
}

function writeVote(query: string, docId: string, vote: Vote): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(query, docId), vote)
  } catch {
    // localStorage may be unavailable (private mode, quota) — silent no-op.
  }
}

// --- Component --------------------------------------------------------------

export function ResultFeedback({ query, docId, docUrl }: ResultFeedbackProps) {
  const { toast } = useToast()
  const [vote, setVote] = React.useState<Vote | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [reportOpen, setReportOpen] = React.useState(false)
  const hydratedRef = React.useRef(false)

  // Hydrate from localStorage on mount (after first paint to avoid SSR
  // hydration mismatches).
  React.useEffect(() => {
    const v = readVote(query, docId)
    if (v) setVote(v)
    hydratedRef.current = true
  }, [query, docId])

  const submit = React.useCallback(
    async (v: Vote) => {
      if (submitting || vote) return
      setSubmitting(true)
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            docId,
            docUrl,
            vote: v,
          }),
        })
        if (!res.ok && res.status !== 429) {
          // Server rejected — surface error, allow retry.
          const body = await res.json().catch(() => ({}))
          toast({
            title: 'Could not submit vote',
            description: body?.error ?? `HTTP ${res.status}`,
            variant: 'destructive',
          } as any)
          setSubmitting(false)
          setReportOpen(false)
          return
        }
        // Persist + lock UI.
        writeVote(query, docId, v)
        setVote(v)
        toast({
          title: 'Thanks!',
          description:
            v === 'up'
              ? 'Glad this result helped.'
              : v === 'down'
                ? 'We will use this to improve ranking.'
                : 'Reported — our team will review.',
        })
      } catch (e: any) {
        toast({
          title: 'Could not submit vote',
          description: e?.message ?? 'Network error',
          variant: 'destructive',
        } as any)
      } finally {
        setSubmitting(false)
        setReportOpen(false)
      }
    },
    [docId, docUrl, query, submitting, toast, vote],
  )

  const isUp = vote === 'up'
  const isDown = vote === 'down'
  const isReport = vote === 'spam' || vote === 'irrelevant'
  const disabled = !!vote || submitting

  return (
    <div
      className={cn(
        'mt-2 flex items-center justify-end gap-1',
        'text-xs text-muted-foreground',
      )}
      role="group"
      aria-label="Rate this result"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void submit('up')}
        disabled={disabled}
        aria-pressed={isUp}
        aria-label="This result is helpful"
        className={cn(
          'h-7 gap-1 px-2 text-xs',
          'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400',
          isUp && 'text-emerald-600 dark:text-emerald-400',
          disabled && !isUp && 'opacity-50',
        )}
      >
        <ThumbsUp
          className={cn('size-3.5', isUp && 'fill-current')}
          aria-hidden
        />
        <span className="hidden sm:inline">Helpful</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void submit('down')}
        disabled={disabled}
        aria-pressed={isDown}
        aria-label="This result is not helpful"
        className={cn(
          'h-7 gap-1 px-2 text-xs',
          'text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400',
          isDown && 'text-rose-600 dark:text-rose-400',
          disabled && !isDown && 'opacity-50',
        )}
      >
        <ThumbsDown
          className={cn('size-3.5', isDown && 'fill-current')}
          aria-hidden
        />
        <span className="hidden sm:inline">Not helpful</span>
      </Button>
      <Popover open={reportOpen} onOpenChange={setReportOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-pressed={isReport}
            aria-label="Report this result"
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400',
              isReport && 'text-amber-600 dark:text-amber-400',
              disabled && !isReport && 'opacity-50',
            )}
          >
            <Flag className={cn('size-3.5', isReport && 'fill-current')} aria-hidden />
            <span>Report</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-56 p-2 text-xs"
        >
          <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Report this result
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void submit('spam')}
            disabled={submitting}
            className="flex w-full items-center justify-start gap-2 h-8 px-2 text-xs text-foreground hover:bg-rose/10"
          >
            <ShieldAlert className="size-3.5 text-rose" aria-hidden />
            Spam / malicious
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void submit('irrelevant')}
            disabled={submitting}
            className="flex w-full items-center justify-start gap-2 h-8 px-2 text-xs text-foreground hover:bg-amber/10"
          >
            <Ban className="size-3.5 text-amber-600" aria-hidden />
            Off-topic / irrelevant
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export default ResultFeedback
