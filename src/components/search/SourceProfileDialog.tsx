/**
 * SourceProfileDialog.tsx
 * -----------------------------------------------------------------------------
 * The §16 SOURCE PROFILE dialog. Opens when the parent passes a non-null
 * `docId`. Fetches the profile via `store.loadSourceProfile(docId)` and shows:
 *
 *   - Publisher, Source type (colored badge), Country, Language.
 *   - First indexed, Last crawled, Last detected update (relative + absolute
 *     tooltip).
 *   - Original source: Yes / No / Unknown.
 *   - Content categories (list of badges).
 *   - Related primary sources (links).
 *   - Documents in index from this domain.
 *
 * Loading state: a skeleton. Error state: a friendly retry.
 */

'use client'

import * as React from 'react'
import {
  Globe,
  BookOpen,
  Calendar,
  Clock,
  FileText,
  Tag,
  Building2,
  Check,
  X,
  HelpCircle,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useSearchStore } from '@/store/search-store'
import { cn } from '@/lib/utils'
import { sourceTypeStyle } from './source-type'
import {
  formatRelativeTime,
  formatAbsolute,
  urlParts,
  formatCount,
} from './format'

export interface SourceProfileDialogProps {
  docId: string | null
  onClose: () => void
}

export function SourceProfileDialog({ docId, onClose }: SourceProfileDialogProps) {
  const open = docId !== null
  const profile = useSearchStore((s) => s.sourceProfile)
  const loading = useSearchStore((s) => s.sourceProfileLoading)
  const error = useSearchStore((s) => s.sourceProfileError)
  const loadSourceProfile = useSearchStore((s) => s.loadSourceProfile)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        aria-describedby="source-profile-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4 text-primary" aria-hidden />
            Source profile
          </DialogTitle>
          <DialogDescription id="source-profile-desc">
            Transparency info about this source — publisher, source type,
            crawl history, originality.
          </DialogDescription>
        </DialogHeader>

        {loading && <ProfileSkeleton />}

        {!loading && error && (
          <div className="rounded-md border border-rose bg-rose p-3 text-sm text-rose">
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => docId && loadSourceProfile(docId)}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && profile && (
          <ProfileBody profile={profile} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProfileBody({ profile }: { profile: NonNullable<ReturnType<typeof useSearchStore.getState>['sourceProfile']> }) {
  const st = sourceTypeStyle(profile.sourceType)
  const lastCrawled = formatRelativeTime(profile.lastCrawled)
  const firstIndexed = formatRelativeTime(profile.firstIndexed)
  const lastUpdate = profile.lastUpdate ? formatRelativeTime(profile.lastUpdate) : '—'

  return (
    <div className="space-y-4">
      {/* Identity */}
      <section aria-label="Publisher identity" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Publisher
        </h3>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-sm font-medium text-foreground">
            {profile.publisher ?? profile.domain ?? 'Unknown publisher'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
            {profile.domain}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px]', st.badge)}>
              <span className={cn('size-1.5 rounded-full', st.dot)} aria-hidden />
              {st.label}
            </Badge>
            {profile.country && (
              <Badge variant="outline" className="text-[10px]">
                <Globe className="size-2.5" aria-hidden />
                {profile.country.toUpperCase()}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {profile.language?.toUpperCase() ?? '—'}
            </Badge>
          </div>
        </div>
      </section>

      {/* Crawl history */}
      <section aria-label="Crawl history" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Crawl history
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-2">
            <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Calendar className="size-3" aria-hidden /> First indexed
            </dt>
            <dd className="mt-1 text-sm" title={formatAbsolute(profile.firstIndexed)}>
              {firstIndexed}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-card p-2">
            <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3" aria-hidden /> Last crawled
            </dt>
            <dd className="mt-1 text-sm" title={formatAbsolute(profile.lastCrawled)}>
              {lastCrawled}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-card p-2">
            <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <FileText className="size-3" aria-hidden /> Last update
            </dt>
            <dd
              className="mt-1 text-sm"
              title={profile.lastUpdate ? formatAbsolute(profile.lastUpdate) : undefined}
            >
              {lastUpdate}
            </dd>
          </div>
        </dl>
      </section>

      {/* Originality */}
      <section aria-label="Originality" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Original source
        </h3>
        <div className="flex items-center gap-2">
          {profile.isOriginal ? (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              <Check className="size-3" aria-hidden />
              Yes — original
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-700">
              <X className="size-3" aria-hidden />
              No — likely duplicate
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            <HelpCircle className="size-2.5" aria-hidden />
            Detected via content + simhash
          </Badge>
        </div>
      </section>

      {/* Content categories */}
      {profile.contentCategories.length > 0 && (
        <section aria-label="Content categories" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Content categories
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.contentCategories.map((c, i) => {
              const cs = sourceTypeStyle(c)
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className={cn('text-[10px]', cs.badge)}
                >
                  <Tag className="size-2.5" aria-hidden />
                  {cs.label}
                </Badge>
              )
            })}
          </div>
        </section>
      )}

      {/* Documents in index */}
      <section aria-label="Index coverage" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Index coverage
        </h3>
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <BookOpen className="mr-1 inline-block size-3.5 text-primary" aria-hidden />
          <span className="font-medium">{formatCount(profile.documentsInIndex)}</span>{' '}
          documents from{' '}
          <span className="font-mono text-xs">{profile.domain}</span> are in
          the CIRKLE index.
        </div>
      </section>

      {/* Related primary sources */}
      {profile.relatedPrimarySources.length > 0 && (
        <section aria-label="Related primary sources" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Related primary sources
          </h3>
          <ul className="space-y-1.5">
            {profile.relatedPrimarySources.slice(0, 5).map((r) => {
              const { host, path } = urlParts(r.url)
              const cs = sourceTypeStyle(r.sourceType)
              return (
                <li key={r.id}>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-foreground hover:text-primary hover:underline"
                  >
                    <span className={cn('size-1.5 rounded-full', cs.dot)} aria-hidden />
                    <span className="truncate font-mono">{host}{path && path !== '/' ? path : ''}</span>
                    <ExternalLink className="size-3 opacity-60" aria-hidden />
                    <span className="sr-only"> — {r.title}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading source profile…</span>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-14 w-full" />
    </div>
  )
}

export default SourceProfileDialog
