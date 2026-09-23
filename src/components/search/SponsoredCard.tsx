/**
 * SponsoredCard.tsx
 * -----------------------------------------------------------------------------
 * A clearly-labelled sponsored result card. Per §33, ads are never mixed
 * with organic ranking and must be visually unmistakable as ads.
 *
 *  - Light amber background + amber border.
 *  - Bold "Sponsored" label at the top.
 *  - Advertiser name, headline (link), display URL, snippet.
 *  - "Why this ad?" link → opens a Dialog with `whyAdReason`.
 *  - Target link opens new tab with `rel="sponsored noopener noreferrer"`.
 */

'use client'

import * as React from 'react'
import { ExternalLink, HelpCircle, Megaphone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { truncateLines, urlParts } from './format'
import type { SearchSponsored } from './types'

export interface SponsoredCardProps {
  ad: SearchSponsored
}

export function SponsoredCard({ ad }: SponsoredCardProps) {
  const { host, path } = urlParts(ad.displayUrl || ad.targetUrl)
  return (
    <article
      className={cn(
        'rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4',
        'shadow-sm',
      )}
      aria-label={`Sponsored result from ${ad.advertiser}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="size-3.5 text-amber-700" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
            Sponsored
          </span>
          <span className="text-xs text-amber-800/80">· {ad.advertiser}</span>
        </div>
        <WhyThisAdDialog reason={ad.whyAdReason} />
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={ad.targetUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="block text-base font-medium leading-snug text-foreground hover:text-primary hover:underline sm:text-lg"
          >
            {ad.headline}
          </a>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-amber-500" aria-hidden />
            <span className="truncate font-mono">
              {host}
              {path && path !== '/' ? path : ''}
            </span>
            <ExternalLink className="size-3" aria-hidden />
          </div>
        </div>
      </div>

      <p className="mt-2 text-sm text-foreground/80">
        {truncateLines(ad.snippet, 240)}
      </p>
    </article>
  )
}

function WhyThisAdDialog({ reason }: { reason: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-amber-700 hover:bg-amber-100 hover:text-amber-800"
          aria-label="Why this ad?"
        >
          <HelpCircle className="size-3" aria-hidden />
          Why this ad?
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-amber-700" aria-hidden />
            Why this ad?
          </DialogTitle>
          <DialogDescription>
            Why CIRKLE is showing you this sponsored result.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-foreground/90">
          {reason}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sponsored results are clearly separated from organic ranking. The
          advertiser cannot pay for a higher organic position — only for this
          clearly-labelled slot.
        </p>
        <div className="mt-2 flex justify-end">
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SponsoredCard
