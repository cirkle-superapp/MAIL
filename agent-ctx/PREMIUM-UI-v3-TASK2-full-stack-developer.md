# Task PREMIUM-UI-v3-TASK2 — Email Detail Premium UI Upgrade

## Task
Bring the Cirkle Mail email-detail surface (right pane) up to the world-class premium standard set by the v2 design system overhaul + the v3 TASK1 email-list upgrade.

## Agent
full-stack-developer

## Work Log
- Read `worklog.md` (PREMIUM-UI-v2 + PREMIUM-UI-v3-TASK1) + `globals.css` to confirm every token referenced by the spec exists (glass, glass-strong, card-premium, btn-premium, bg-gradient-gold, shadow-soft/glow/glass/premium, animate-spring-in, animate-fade-up, animate-float, stagger-1..6, font-display, text-cream, text-charcoal, text-gold, ring-gold/40).
- Read `email-detail.tsx` (620 lines), `handle-email-panel.tsx`, `quick-reply-chips.tsx`, `conversation-panel.tsx` end-to-end before editing.
- Verified `useMailStore` exposes `openCompose` (was missing in email-detail.tsx destructure — added to preserve Smart follow-up button functionality per spec "all must still work identically").
- `src/components/mail/email-detail.tsx`:
  - Top toolbar: `glass flex h-14 ... border-b border-border/40 backdrop-blur-md sm:px-4 animate-spring-in` (was h-12, no spring). Back button: `btn-premium h-9 w-9 rounded-full ... hover:scale-110`.
  - Added `premium?: boolean` prop to `ActionBtn`; when set, the button uses `border-transparent bg-gradient-gold text-charcoal font-medium hover:opacity-90 hover:shadow-premium`. Applied to the SENT-folder "Smart follow-up" button. All ActionBtn instances now also `rounded-full hover:shadow-soft`.
  - MoreVertical trigger: `btn-premium h-9 w-9 rounded-full`.
  - Subject block: wrapped in `card-premium rounded-2xl p-5 m-2 sm:m-6 animate-spring-in stagger-1` (premium letterhead). Subject: `font-display text-2xl sm:text-3xl font-medium tracking-tight text-foreground animate-fade-up`. Intent badge + label chips: added `shadow-soft`. Reading-time chip kept as `rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground`.
  - MessageView collapsed state: `card-premium flex ... rounded-lg ... hover:-translate-y-px hover:shadow-soft` (was border + bg-muted/40 hover).
  - MessageView article header avatar: `ring-2 ring-border/40 shadow-soft transition-all duration-300 hover:ring-gold/40`. Sender name: `font-display text-base font-semibold text-foreground`. Sender email: `text-xs text-muted-foreground`.
  - MessageView body div: `card-premium m-4 mt-2 rounded-2xl p-5 ... animate-fade-up stagger-2 prose prose-sm dark:prose-invert max-w-none sm:m-6 sm:p-8 ... leading-relaxed text-foreground/90 ...` (the inner-content `[&_a]:text-accent` and table/list styling preserved). `sanitizeEmailHtml()` call untouched.
  - Attachment chip: `card-premium inline-flex items-center gap-2 rounded-lg p-3 ... transition-all duration-200 hover:-translate-y-px shadow-soft hover:shadow-premium`. Paperclip icon kept (`text-accent`).
  - MessageView footer reply/forward: Reply is `btn-premium ... bg-gradient-gold border-transparent px-4 text-charcoal font-medium`; Forward is `btn-premium ... text-muted-foreground hover:text-foreground`.
  - Bottom action bar: `glass flex items-center gap-2 border-t border-border/40 bg-background/60 p-3 backdrop-blur-md sm:px-8 animate-spring-in`. Reply: `btn-premium ... border-transparent bg-gradient-gold px-5 text-charcoal font-medium hover:opacity-90`. Reply All + Forward: `btn-premium glass h-10 rounded-full px-5 shadow-soft`.
  - Loading skeleton: two `card-premium rounded-2xl p-5 shadow-soft animate-spring-in` cards — letterhead (avatar circle 12×12 + subject line + meta) and body (3 line skeletons). Second card uses `stagger-2`.
  - EmptyDetail: `card-premium w-full max-w-md space-y-3 p-10 animate-spring-in`. Icon container: `rounded-2xl bg-gradient-gold shadow-glow animate-float`. Title: `font-display text-lg font-medium text-foreground`. Description: `text-sm text-muted-foreground`. (Inline mail SVG kept; only its className color shifted from `text-accent` to `text-cream` to contrast the gold gradient background.)
- `src/components/mail/handle-email-panel.tsx` (className-only changes):
  - Closed trigger button: `btn-premium h-8 gap-1.5 rounded-full border-transparent bg-gradient-gold px-3 text-charcoal font-medium hover:opacity-90` (was accent border/hover).
  - Open wrapper: `card-premium rounded-xl border border-accent/30 bg-gradient-to-br from-primary/5 to-gold/5 p-4 shadow-glass animate-spring-in stagger-3` (was flat accent/5).
  - Header: `font-display flex items-center gap-2 ...` with `<Sparkles className="h-4 w-4 text-gold" />` (was `text-accent`).
  - Close button: `rounded-full` (was `rounded`).
  - Summary paragraph: `text-sm leading-relaxed text-foreground/80` (was `text-foreground/90`).
  - Key info items: wrapped each in `rounded-lg bg-background/60 p-2` chip (was a plain `flex flex-col`).
  - Suggested reply block: `rounded-lg border border-border/40 bg-muted/40 p-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap` (was `border-border bg-background/60 ... text-foreground/90`).
  - "Use as reply" button: `btn-premium mt-2 h-7 gap-1 rounded-full border-transparent bg-gradient-gold px-3 text-xs text-charcoal font-medium hover:opacity-90` (was plain outline).
- `src/components/mail/quick-reply-chips.tsx` (className-only changes):
  - Container: added `border-t border-border/40 pt-4` separator.
  - TONE_STYLES reduced to text colors only (positive/neutral/declining/question) — backgrounds now come from `glass`.
  - Added `STAGGER_CLASSES = ["stagger-1","stagger-2","stagger-3"] as const` constant for cycling stagger without template literals.
  - Each chip: `btn-premium glass animate-spring-in rounded-full px-4 py-2 text-sm font-medium shadow-soft transition-all duration-200 hover:-translate-y-px hover:shadow-premium hover:ring-1 hover:ring-gold/30` + `STAGGER_CLASSES[i % 3]` + tone text color.
- `src/components/mail/conversation-panel.tsx` (className-only changes):
  - Closed trigger button: `btn-premium h-8 gap-1.5 rounded-full border-primary/30 px-3 text-primary hover:bg-primary/5 hover:shadow-soft`.
  - Open wrapper: `card-premium glass rounded-xl border border-primary/30 p-4 shadow-soft` (was `bg-primary/5` flat).
  - Header: `font-display flex items-center gap-2 ...` (was sans).
  - Close button: `rounded-full` (was `rounded`).
- No logic, handlers, fetches, imports, or component structure changes — only className strings, the new `premium` boolean prop on ActionBtn, one missing state destructure (`openCompose`), and one wrapping div (the letterhead card). All existing functionality preserved (auto mark-as-read, archive/delete/snooze/label with undo, reply/reply-all/forward, smart follow-up, mark unread, print, star, intent badge, reading time, attachments, thread collapsed/expanded, Handle panel, Quick Reply chips, Conversation panel).

## Lint Status
`bun run lint` → EXIT 0 (0 errors, 0 warnings). Dev server still serving on port 3000.

## Files Changed
- `src/components/mail/email-detail.tsx`
- `src/components/mail/handle-email-panel.tsx`
- `src/components/mail/quick-reply-chips.tsx`
- `src/components/mail/conversation-panel.tsx`
