# PREMIUM-UI-v3-TASK3 — Compose Dialog upgrade

Task ID: PREMIUM-UI-v3-TASK3
Agent: full-stack-developer
Task: Bring the Cirkle Mail Compose Dialog (compose/reply/forward floating window) up to the world-class premium standard set by the v2 design system + v3 TASK1 (email-list) + v3 TASK2 (email-detail).

## Work Log

### 1. compose-dialog.tsx (full rewrite of the return block — logic preserved)
- Added `Loader2` to lucide imports (used for the Send button spinner per spec §K).
- Container `<div>`: switched from `glass ... bg-background/95 shadow-float backdrop-blur-xl` to `glass-strong ... overflow-hidden rounded-2xl shadow-premium transition-all animate-spring-in`. Window-state conditional:
  - minimized → `card-premium glass-strong bottom-4 right-4 h-14 w-80 flex-row items-center gap-3 p-3 shadow-float sm:w-96` (a small floating strip with p-3 + flex-row).
  - maximized → `glass-strong inset-0 flex-col rounded-none sm:inset-2` (full-screen, no rounding).
  - normal → `glass-strong bottom-0 right-4 h-[34rem] w-[min(34rem,calc(100vw-2rem))] flex-col sm:bottom-6 sm:right-6`.
- Title bar: switched from `flex h-10 ... bg-muted/40 px-3 backdrop-blur-md` to a conditional structure: when minimized, `flex w-full gap-3` (no own glass — the container is already glass-strong); when normal/maximized, `glass h-12 gap-2 border-b border-border/40 px-5 animate-spring-in`. Added a `h-6 w-1 rounded-full bg-gradient-gold` accent chip (only when not minimized) at the left of the bar. Title text now uses `font-display font-medium` with conditional size (`text-sm` minimized, `text-base` otherwise).
- Window control buttons (Minimize/Maximize/Close): all upgraded from `flex h-6 w-6 ... rounded hover:bg-muted` to `btn-premium flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground`. Close button additionally gets `hover:bg-destructive/10 hover:text-destructive`.
- Inner content section: dropped the redundant `border-t border-border` (the title bar's border-b already separates).
- Recipients container: `divide-y divide-border` → `divide-y divide-border/40` (softer dividers). Each `RecipientInput` now receives `className="bg-muted/20 px-5 py-3"` (premium tinted strip with consistent padding per spec §C).
- Subject strip: `flex items-center px-3` → `flex items-center gap-2 px-5 py-3`. Subject `<Input>` className: `font-display h-9 border-0 bg-transparent px-0 text-lg font-medium text-foreground shadow-none focus-visible:ring-0 placeholder:text-muted-foreground` (font-display serif + lg size per spec §D).
- RichTextEditor: now receives `className="min-h-[200px] px-5 py-4"` (was `min-h-0`) — the wrapper gains 200px floor + premium padding per spec §E.
- Attachment chip: from `mx-3 mb-2 inline-flex ... rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs` to `card-premium mx-5 mb-3 inline-flex w-fit items-center gap-2 rounded-lg p-3 shadow-soft transition-all duration-200 hover:-translate-y-px`. Paperclip icon: `text-accent` → `text-gold`. Attachment name: `text-sm text-foreground font-medium`. Remove (X) button: `btn-premium ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-destructive` per spec §G.
- Footer action bar: from `flex h-12 ... border-t border-border/40 bg-background/60 px-3 backdrop-blur-md` to `glass flex h-14 flex-shrink-0 items-center justify-between gap-2 border-t border-border/40 px-5 py-3 backdrop-blur-md animate-spring-in` (taller, glass, spring entrance, justify-between layout).
  - Send button: from `btn-premium h-8 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-premium hover:bg-primary/90 disabled:opacity-60` to `btn-premium rounded-full bg-gradient-gold px-5 text-sm font-semibold text-charcoal shadow-glow transition-all duration-200 hover:scale-105 hover:shadow-glow disabled:opacity-70`. Added a `Loader2 animate-spin` spinner state (when `sending`) per spec §K — preserves the existing "Sending…" text behavior and just adds the spinner icon next to it.
  - Attach (Paperclip) button: `btn-premium glass h-9 w-9 rounded-full shadow-soft` per spec §I.
  - Save draft button: `btn-premium glass h-9 gap-1 rounded-full text-xs text-muted-foreground shadow-soft hover:text-foreground` per spec §I.
  - Schedule button: `btn-premium glass h-9 gap-1 rounded-full text-xs text-muted-foreground shadow-soft hover:text-foreground` per spec §I.
  - Discard (Trash2) button: `btn-premium ml-1 h-9 w-9 rounded-full text-muted-foreground hover:text-destructive` (kept existing discard/discard-draft conditional onClick + aria-label + title logic untouched).
- Schedule `<Dialog>`: `DialogContent` from `sm:max-w-[360px]` (default shadcn styling) to `glass-strong overflow-hidden rounded-2xl border border-border/40 p-0 shadow-premium sm:max-w-[420px]`. `DialogHeader` becomes a `glass flex h-12 items-center gap-2 border-b border-border/40 px-5` strip. `DialogTitle` uses `font-display text-base font-medium` with the `CalendarClock` icon in `text-gold` (was `text-primary`). The datetime `<Input>` becomes `glass rounded-full px-4 py-2 text-sm shadow-soft`. `DialogFooter` is now a `flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3` strip with Cancel = `btn-premium glass rounded-full` and "Schedule send" = `btn-premium rounded-full bg-gradient-gold text-charcoal` per spec §H.

### 2. recipient-input.tsx (className + one new wrapping span — no logic change)
- Outer `<div>`: `relative flex items-center` → `relative flex items-center gap-2`.
- Added a new `<span>` before the Input: `font-display w-10 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground` showing the `placeholder` prop text (acts as the To/Cc/Bcc label per spec §C).
- Input: `h-9 border-0 px-0 shadow-none focus-visible:ring-0` → `h-9 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground` per spec §C.
- Cc/Bcc toggle button: `ml-2 flex flex-shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground` → `btn-premium glass ml-2 flex flex-shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground shadow-soft transition-colors hover:text-foreground` per spec §C.
- Suggestions dropdown: `absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-float` → `glass-strong absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl p-1 shadow-premium`. Suggestion item rounded `rounded-md` → `rounded-lg`; active state from `bg-accent/10` → `bg-primary/10 text-primary` (matches the spec's "active state bg-primary/10 text-primary" wording); avatar gains `shadow-soft`; the highlight `Check` icon color from `text-primary` → `text-gold` to match the design system accent.

### 3. rich-text-editor.tsx (className-only)
- Toolbar container: `flex items-center gap-0.5 border-b border-border/60 px-2 py-1` → `glass self-start inline-flex items-center gap-0.5 rounded-full p-1 shadow-soft` per spec §E (now a floating glass pill that shrinks to content via `inline-flex + self-start`, no full-width border-b).
- Each formatting button (Bold/Italic/Underline/List/OrderedList/Quote/Link): `h-7 w-7 text-muted-foreground hover:text-foreground` → `btn-premium h-8 w-8 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary` per spec §E.
- The Eraser (Clear formatting) button keeps its destructive intent: `btn-premium h-8 w-8 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive`.
- Toolbar divider: `mx-1 h-4 w-px bg-border` → `mx-1 h-4 w-px bg-border/60` (softer).
- Editable surface: dropped `px-3 py-2` (the wrapper now provides `px-5 py-4` from compose-dialog's className) and added `mt-3` so the surface starts below the floating toolbar with breathing room. The existing `min-h-[8rem] flex-1 ... text-sm leading-relaxed text-foreground/90 outline-none [&_a]:text-accent ...` is preserved per spec §E.
- The `.rte-surface[data-empty="true"]::before` placeholder CSS in globals.css was already `color: hsl(var(--muted-foreground))` (= text-muted-foreground) — no change needed.

### 4. copilot-button.tsx (className-only)
- Trigger `<Button>`: `h-7 gap-1 text-xs text-accent hover:text-accent` → `btn-premium h-8 gap-1 rounded-full bg-gradient-gold px-3 text-xs font-medium text-charcoal shadow-glow transition-all duration-200 hover:scale-105 hover:shadow-glow disabled:opacity-70` per spec §F (stands out as the premium AI action).
- `<DropdownMenuContent>`: `min-w-[12rem]` → `glass-strong min-w-[12rem] rounded-2xl border border-border/40 p-1 shadow-premium`.
- `<DropdownMenuLabel>` color: `text-accent` → `text-gold`.

### 5. subject-improver.tsx (className + icon swap — no logic change)
- Icon import: `Lightbulb` → `Sparkles` (spec §D specifies the Sparkles icon).
- Trigger `<Button>`: `h-8 w-8 text-accent hover:text-accent` → `btn-premium glass h-8 w-8 rounded-full text-gold shadow-soft hover:text-gold` per spec §D.
- `<PopoverContent>`: `w-[320px] p-2` → `glass-strong w-[320px] rounded-2xl border border-border/40 p-2 shadow-premium`.
- Suggestion label color: `text-accent` → `text-gold`.
- Each suggestion button: `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground/90 transition hover:bg-muted` → `btn-premium flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/10 hover:text-primary` (matches spec §E "active state bg-primary/10 text-primary").
- Check icon color: `text-emerald-500` → `text-gold` (consistent with design system accent).

### 6. voice-input.tsx (className-only)
- Trigger `<Button>`: `relative h-8 w-8` + `recording && "animate-pulse bg-rose-500/10 text-rose-600"` → `btn-premium glass relative h-8 w-8 rounded-full shadow-soft` + conditional `recording ? "text-rose animate-pulse-glow" : "text-muted-foreground hover:text-foreground"` per spec §F.
- The recording ping indicator (absolute-positioned dot pair) is preserved untouched.

## Verification
- Read compose-dialog.tsx after every edit to verify the JSX structure is intact (open div, title bar, content section, schedule Dialog, close div).
- Mentally traced through every interaction:
  - Open dialog → recipients typed (with label "To" + glass dropdown suggestions) ✓
  - Cc/Bcc toggle (btn-premium glass pill) reveals Cc/Bcc rows ✓
  - Subject typed in font-display text-lg Input ✓
  - SubjectImprover button (glass + text-gold Sparkles) opens glass-strong popover ✓
  - RTE toolbar (glass pill) → bold/italic/list/link/eraser all call `exec()` unchanged ✓
  - Copilot button (bg-gradient-gold) opens glass-strong menu → improve() fetches /api/ai/improve ✓
  - Voice input (glass + Mic) → text-rose + animate-pulse-glow when recording ✓
  - Attach button toggles attachment chip (card-premium p-3 hover-lift) ✓
  - Save draft / Schedule / Discard buttons all preserved with their original onClick handlers ✓
  - Send button: btn-premium bg-gradient-gold, when sending shows `Loader2 animate-spin` + "Sending…" text, calls handleSend → 5s undo window → actuallySend → POST /api/emails ✓
  - Undo (ToastAction) clears the pending send via `pendingSendRef` ✓
  - Schedule dialog (glass-strong rounded-2xl p-0) → datetime input (glass rounded-full) → handleSchedule POSTs with `scheduledFor` ✓
  - Minimize (h-14 w-80 card-premium glass-strong strip at bottom-right) → click title text to restore ✓
  - Maximize (inset-0 rounded-none glass-strong full-screen) ✓
  - Close (X with hover:text-destructive) calls handleDiscard or handleDeleteDraft ✓
- `bun run lint` → EXIT 0, 0 errors, 0 warnings.
- Dev server still serving on port 3000 (dev.log shows continuing `PUT /api/emails 200` from the scheduled-send cron).

## Stage Summary
- The Compose Dialog now matches the premium v3 standard set by the Command Center / Top Bar / email-list / email-detail: a `glass-strong` floating window with `shadow-premium` + `rounded-2xl` + spring-in entrance; a `glass` title strip with a `bg-gradient-gold` accent chip, `font-display` title, and `btn-premium rounded-full` window controls (close button hover → destructive); premium tinted recipient strips each with a `font-display` uppercase label and a `glass-strong` suggestions dropdown; a `font-display text-lg` subject strip with a glass + `text-gold` SubjectImprover (Sparkles icon); a `glass self-start inline-flex rounded-full` RTE toolbar with `btn-premium rounded-full size-8` formatting buttons (active = `bg-primary/10 text-primary`, Eraser stays destructive); a `card-premium` attachment chip with hover-lift; a `glass h-14` footer with `bg-gradient-gold` Send button (Loader2 spinner while sending + scale-105 hover + shadow-glow), `glass` Attach/Save-draft/Schedule buttons, and a destructive Discard; a `card-premium glass-strong h-14` minimized strip with `btn-premium size-8` restore + destructive close; and a `glass-strong rounded-2xl p-0 shadow-premium` Schedule dialog with glass header strip, `glass rounded-full` datetime input, and `bg-gradient-gold text-charcoal` confirm button.
- Files changed: `src/components/mail/compose-dialog.tsx` (full return-block rewrite), `src/components/mail/recipient-input.tsx` (className + 1 new label span), `src/components/mail/rich-text-editor.tsx` (className only), `src/components/mail/copilot-button.tsx` (className only), `src/components/mail/subject-improver.tsx` (className + icon swap Lightbulb→Sparkles), `src/components/mail/voice-input.tsx` (className only).
- Lint status: `bun run lint` passes clean (EXIT 0, 0 errors, 0 warnings). Dev server running on port 3000.
- No breaking changes — every existing interaction preserved (open/close, minimize/maximize, type recipients, type subject, RTE formatting, attach/remove attachment, save draft, schedule send, send with undo + send-and-archive, voice dictation, AI copilot, AI subject suggestions, discard / discard-draft).
