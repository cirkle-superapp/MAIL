"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Archive,
  Reply,
  Clock,
  MailOpen,
  SkipForward,
  X,
  CheckCircle2,
  Inbox,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SnoozeMenu } from "@/components/mail/snooze-menu";
import { useMailStore } from "@/store/mail-store";
import { useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import {
  getInitials,
  getAvatarColor,
  formatFullDate,
  sanitizeEmailHtml,
} from "@/lib/email-utils";
import type { Email } from "@/lib/types";

/**
 * AI Triage mode (Superhuman-style focus flow): shows one unread email at a
 * time with big quick actions. Keyboard: A=archive, R=reply, S=snooze,
 * K=mark read & next, N/→=skip, Esc=exit. Drives inbox-zero.
 */
export function TriageMode() {
  const open = useMailStore((s) => s.triageOpen);
  const setOpen = useMailStore((s) => s.setTriageOpen);
  const openReply = useMailStore((s) => s.openReply);
  const invalidate = useInvalidateMail();

  const [queue, setQueue] = useState<Email[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const current = queue[idx];
  const remaining = queue.length - idx;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emails?folder=INBOX&unread=true", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setQueue(data.emails ?? []);
      setIdx(0);
    } catch {
      toast({ title: "Could not load triage queue", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadQueue();
  }, [open, loadQueue]);

  async function patch(id: string, payload: Record<string, unknown>) {
    await fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    invalidate();
  }

  function next() {
    if (idx + 1 < queue.length) setIdx(idx + 1);
    else setQueue([]); // done
  }

  async function archive() {
    if (!current) return;
    await patch(current.id, { folder: "ARCHIVE" });
    toast({ title: "Archived", duration: 800 });
    next();
  }
  async function markRead() {
    if (!current) return;
    await patch(current.id, { isRead: true });
    toast({ title: "Marked read", duration: 800 });
    next();
  }
  function reply() {
    if (!current) return;
    setOpen(false);
    openReply(current.id);
  }
  function skip() {
    next();
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "e") { e.preventDefault(); archive(); }
      else if (k === "r") { e.preventDefault(); reply(); }
      else if (k === "k") { e.preventDefault(); markRead(); }
      else if (k === "n" || k === "arrowright") { e.preventDefault(); skip(); }
      else if (k === "escape") { e.preventDefault(); setOpen(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const done = queue.length === 0 && !loading;

  return (
    <div className="aurora-bg fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-border px-4">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Triage</h2>
        {queue.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {remaining} unread remaining
          </span>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 gap-1 text-xs"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" /> Exit <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[10px]">Esc</kbd>
        </Button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading unread…</div>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Inbox zero!</p>
              <p className="text-sm text-muted-foreground">You've triaged all unread messages.</p>
            </div>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : current ? (
          <TriageCard
            email={current}
            onArchive={archive}
            onReply={reply}
            onMarkRead={markRead}
            onSkip={skip}
            onSnooze={(iso) => {
              patch(current.id, { snoozedUntil: iso }).then(() => {
                toast({ title: "Snoozed", duration: 800 });
                next();
              });
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No unread messages</p>
              <p className="text-xs text-muted-foreground">Your inbox is clear.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TriageCard({
  email,
  onArchive,
  onReply,
  onMarkRead,
  onSkip,
  onSnooze,
}: {
  email: Email;
  onArchive: () => void;
  onReply: () => void;
  onMarkRead: () => void;
  onSkip: () => void;
  onSnooze: (iso: string) => void;
}) {
  return (
    <div className="glass-strong mx-auto w-full max-w-2xl rounded-2xl border border-border/60 shadow-float">
      {/* Sender */}
      <div className="flex items-start gap-3 border-b border-border/60 p-5">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarFallback className={cn("text-sm font-semibold text-cream", getAvatarColor(email.fromEmail || email.fromName))}>
            {getInitials(email.fromName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{email.fromName}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">{formatFullDate(email.date)}</span>
          </div>
          <div className="truncate text-xs text-muted-foreground">&lt;{email.fromEmail}&gt;</div>
        </div>
      </div>
      {/* Content */}
      <div className="max-h-[40vh] overflow-y-auto p-5">
        <h1 className="mb-3 font-display text-lg font-semibold tracking-tight text-foreground">
          {email.subject || "(no subject)"}
        </h1>
        <div
          className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground/90 [&_a]:text-accent [&_a:hover]:underline"
          dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body) }}
        />
      </div>
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 p-4">
        <TriageAction icon={Archive} label="Archive" kbd="A" onClick={onArchive} primary />
        <TriageAction icon={Reply} label="Reply" kbd="R" onClick={onReply} />
        <SnoozeMenu onSnooze={onSnooze} size="sm" label="Snooze" />
        <TriageAction icon={MailOpen} label="Read & next" kbd="K" onClick={onMarkRead} />
        <TriageAction icon={SkipForward} label="Skip" kbd="N" onClick={onSkip} className="ml-auto" />
      </div>
    </div>
  );
}

function TriageAction({
  icon: Icon,
  label,
  kbd,
  onClick,
  primary,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  kbd: string;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      size="sm"
      className={cn(
        "h-9 gap-1.5",
        primary && "bg-primary text-primary-foreground hover:bg-primary/90",
        className
      )}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <kbd className="ml-0.5 rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">{kbd}</kbd>
    </Button>
  );
}
