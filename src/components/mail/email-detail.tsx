"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Archive,
  Trash2,
  Reply,
  Forward,
  MoreVertical,
  Paperclip,
  Clock,
  MailOpen,
  ReplyAll,
  AlertCircle,
  Printer,
  Sparkles,
  Pencil,
  Zap,
  Maximize2,
  Volume2,
  Loader2,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { StarButton } from "@/components/mail/star-button";
import { SnoozeMenu } from "@/components/mail/snooze-menu";
import { LabelMenu } from "@/components/mail/label-menu";
import { HandleEmailPanel } from "@/components/mail/handle-email-panel";
import { ConversationPanel } from "@/components/mail/conversation-panel";
import { QuickReplyChips } from "@/components/mail/quick-reply-chips";
import { showUndoToast } from "@/components/mail/undo-toast";
import { useMailStore } from "@/store/mail-store";
import { useEmailDetail, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import {
  getInitials,
  getAvatarColor,
  formatEmailTime,
  formatFullDate,
  sanitizeEmailHtml,
  readingTime,
  INTENT_LABELS,
  INTENT_COLORS,
  type Intent,
} from "@/lib/email-utils";
import type { Email } from "@/lib/types";
import type { PriorityResult } from "@/lib/ai";

export function EmailDetail({
  onBack,
  focusMode,
}: {
  onBack: () => void;
  focusMode?: boolean;
}) {
  const id = useMailStore((s) => s.selectedEmailId);
  const openCompose = useMailStore((s) => s.openCompose);
  const openReply = useMailStore((s) => s.openReply);
  const openReplyAll = useMailStore((s) => s.openReplyAll);
  const openForward = useMailStore((s) => s.openForward);
  const setFocusMode = useMailStore((s) => s.setFocusMode);
  const { data, isLoading } = useEmailDetail(id);
  const invalidate = useInvalidateMail();

  const email = data?.email;
  const thread = data?.thread;

  // Voice readback (TTS) state — powers the "Listen" toolbar button
  const [listening, setListening] = useState(false);

  // AI priority score (0-100, low/medium/high/urgent) — fetched on mount
  const [priority, setPriority] = useState<PriorityResult | null>(null);

  // Auto mark-as-read when an unread email is opened
  useEffect(() => {
    if (!email || email.isRead) return;
    let cancelled = false;
    fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    })
      .then(() => {
        if (!cancelled) invalidate();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email?.id]);

  // Fetch AI priority score on mount + whenever the open email changes
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    setPriority(null);
    fetch("/api/ai/priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: email.id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && d.score !== undefined) setPriority(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [email?.id]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-background p-4 sm:p-8">
        {/* Premium letterhead skeleton */}
        <div className="card-premium rounded-2xl p-5 shadow-soft animate-spring-in">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full shadow-soft" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </div>
        {/* Premium body skeleton */}
        <div className="card-premium mt-2 rounded-2xl p-5 shadow-soft animate-spring-in stagger-2">
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
    );
  }

  if (!email) {
    return <EmptyDetail />;
  }

  async function patch(payload: Record<string, unknown>, msg: string) {
    if (!email) return;
    try {
      const res = await fetch(`/api/emails/${email.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      if (msg) toast({ title: msg, duration: 1500 });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  }

  async function patchSilent(payload: Record<string, unknown>) {
    if (!email) return;
    const res = await fetch(`/api/emails/${email.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed");
    invalidate();
  }

  async function revertPatch(payload: Record<string, unknown>) {
    try {
      await patchSilent(payload);
      toast({ title: "Undo: restored", duration: 1500 });
    } catch {
      toast({ title: "Undo failed", variant: "destructive" });
    }
  }

  // Voice readback via the browser's built-in SpeechSynthesis API (no server
  // roundtrip, no API key, free, instant, works offline). Click again while
  // speaking to stop.
  function handleListen() {
    if (!email) return;
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast({ title: "Voice readback not supported", description: "Your browser doesn't support speech synthesis.", variant: "destructive" });
      return;
    }
    // If already speaking, stop
    if (listening) {
      window.speechSynthesis.cancel();
      setListening(false);
      return;
    }
    try {
      setListening(true);
      // Strip HTML tags from the body for TTS
      const text = email.body
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => setListening(false);
      utterance.onerror = () => setListening(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      toast({ title: "Voice readback failed", variant: "destructive" });
      setListening(false);
    }
  }

  function archive() {
    if (!email) return;
    const prevFolder = email.folder;
    patchSilent({ folder: "ARCHIVE" }).then(() => {
      onBack();
      showUndoToast("Archived", () => revertPatch({ folder: prevFolder }));
    });
  }
  function trash() {
    if (!email) return;
    const prevFolder = email.folder;
    patchSilent({ folder: "TRASH" }).then(() => {
      onBack();
      showUndoToast("Moved to Trash", () =>
        revertPatch({ folder: prevFolder })
      );
    });
  }
  function markUnread() {
    patch({ isRead: false }, "Marked as unread").then(() => onBack());
  }
  function deleteForever() {
    if (!email) return;
    fetch(`/api/emails/${email.id}`, { method: "DELETE" })
      .then(() => {
        invalidate();
        toast({ title: "Deleted forever" });
        onBack();
      })
      .catch(() => toast({ title: "Delete failed", variant: "destructive" }));
  }
  function snooze(untilISO: string) {
    patchSilent({ snoozedUntil: untilISO }).then(() => {
      onBack();
      showUndoToast("Snoozed", () => revertPatch({ snoozedUntil: null }));
    });
  }
  function unsnooze() {
    patch({ snoozedUntil: null }, "Unsnoozed");
  }
  function toggleImportant() {
    if (!email) return;
    patchSilent({ isImportant: !email.isImportant });
  }
  async function handleFollowUp() {
    if (!email) return;
    toast({ title: "Drafting follow-up…", duration: 1500 });
    try {
      const res = await fetch("/api/ai/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: email.id }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      navigator.clipboard?.writeText(data.draft).catch(() => {});
      openCompose();
      toast({
        title: "Follow-up drafted",
        description: "Copied — paste into your new message.",
        duration: 3000,
      });
    } catch {
      toast({ title: "Could not draft follow-up", variant: "destructive" });
    }
  }
  function applyLabel(label: string) {
    if (!email) return;
    const current = splitLabels(email.labels);
    if (current.includes(label)) return;
    const next = [...current, label].join(",");
    patchSilent({ labels: next });
  }
  function removeLabel(label: string) {
    if (!email) return;
    const next = splitLabels(email.labels)
      .filter((l) => l !== label)
      .join(",");
    patchSilent({ labels: next });
  }

  const isTrash = email.folder === "TRASH";
  const isSnoozed = !!email.snoozedUntil;
  const sortedThread = [...(thread ?? [])].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const isThreaded = sortedThread.length > 1;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Focus mode: minimal top bar (distraction-free reading); otherwise the full premium toolbar */}
      {focusMode ? (
        <div className="glass flex h-14 items-center gap-2 border-b border-border/40 px-3 backdrop-blur-md sm:px-6 animate-spring-in">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="btn-premium h-8 w-8 rounded-full transition-all duration-200 hover:scale-110"
                  onClick={onBack}
                  aria-label="Back to list"
                >
                  <ArrowLeft className="h-[1.1rem] w-[1.1rem]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <h2 className="flex-1 truncate px-2 font-display text-sm font-medium tracking-tight text-foreground">
            {email.subject || "(no subject)"}
          </h2>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="btn-premium h-8 rounded-full px-4"
                  onClick={() => setFocusMode(false)}
                  aria-label="Exit focus mode"
                >
                  <Maximize2 className="mr-2 h-3.5 w-3.5" /> Exit Focus
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exit focus mode (press Z)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        <div className="glass flex h-14 items-center gap-1 border-b border-border/40 px-2 backdrop-blur-md sm:px-4 animate-spring-in">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="btn-premium h-8 w-8 rounded-full transition-all duration-200 hover:scale-110"
                  onClick={onBack}
                  aria-label="Back to list"
                >
                  <ArrowLeft className="h-[1.1rem] w-[1.1rem]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Back</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="mx-1 h-5 w-px bg-border/40" />
          <ActionBtn label="Archive" onClick={archive}>
            <Archive className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          {isTrash ? (
            <ActionBtn label="Delete forever" onClick={deleteForever} danger>
              <Trash2 className="h-[1.05rem] w-[1.05rem]" />
            </ActionBtn>
          ) : (
            <ActionBtn label="Delete" onClick={trash}>
              <Trash2 className="h-[1.05rem] w-[1.05rem]" />
            </ActionBtn>
          )}
          <ActionBtn label="Mark unread" onClick={markUnread}>
            <MailOpen className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          <SnoozeMenu
            onSnooze={snooze}
            onUnsnooze={unsnooze}
            isSnoozed={isSnoozed}
            snoozedUntil={email.snoozedUntil}
            className="btn-premium h-8 w-8 rounded-full p-0 gap-0"
          />
          <ActionBtn
            label={email.isImportant ? "Remove importance" : "Mark important"}
            onClick={toggleImportant}
          >
            <AlertCircle
              className={cn(
                "h-[1.05rem] w-[1.05rem]",
                email.isImportant && "text-accent"
              )}
            />
          </ActionBtn>
          <LabelMenu
            activeLabels={new Set(splitLabels(email.labels))}
            onToggle={(label, checked) =>
              checked ? applyLabel(label) : removeLabel(label)
            }
            className="btn-premium h-8 w-8 rounded-full p-0 gap-0"
          />
          <div className="mx-1 h-5 w-px bg-border/40" />
          <ActionBtn label="Reply" onClick={() => openReply(email.id)}>
            <Reply className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          <ActionBtn label="Reply all" onClick={() => openReplyAll(email.id)}>
            <ReplyAll className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          <ActionBtn label="Forward" onClick={() => openForward(email.id)}>
            <Forward className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          {email.folder === "SENT" && (
            <ActionBtn label="Smart follow-up" onClick={handleFollowUp} premium>
              <Sparkles className="h-[1.05rem] w-[1.05rem]" />
            </ActionBtn>
          )}
          <div className="mx-1 h-5 w-px bg-border/40" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="btn-premium h-8 w-8 rounded-full" aria-label="More">
                <MoreVertical className="h-[1.05rem] w-[1.05rem]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={markUnread}>
                <MailOpen className="mr-2 h-4 w-4" /> Mark as unread
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ActionBtn label="Focus mode (press Z)" onClick={() => setFocusMode(true)}>
            <Maximize2 className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
          <ActionBtn label="Listen to this email (TTS)" onClick={handleListen}>
            {listening ? (
              <Loader2 className="h-[1.05rem] w-[1.05rem] animate-spin" />
            ) : (
              <Volume2 className="h-[1.05rem] w-[1.05rem]" />
            )}
          </ActionBtn>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className={cn("mx-auto px-2 py-5 sm:px-8", focusMode ? "max-w-4xl" : "max-w-3xl")}>
          {/* Premium letterhead — subject + AI panels + labels */}
          <div className="card-premium rounded-2xl p-5 m-2 sm:m-6 animate-spring-in stagger-1">
            {/* Subject */}
            <div className="flex items-start gap-3">
              <h1 className="flex-1 font-display text-2xl sm:text-3xl font-medium tracking-tight text-foreground animate-fade-up">
                {email.subject || "(no subject)"}
              </h1>
              <StarButton
                emailId={email.id}
                starred={email.isStarred}
                size="md"
              />
            </div>
            {/* Intent badge + AI priority score + reading time */}
            {email.intent || priority ? (
              <div className="mt-2 flex items-center gap-2">
                {email.intent && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-soft",
                      INTENT_COLORS[email.intent as Intent] ?? INTENT_COLORS.FYI
                    )}
                  >
                    {INTENT_LABELS[email.intent as Intent] ?? email.intent}
                  </span>
                )}
                {priority && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      priority.level === "urgent" && "bg-rose-500/15 text-rose-600 dark:text-rose-300",
                      priority.level === "high" && "bg-orange-500/15 text-orange-600 dark:text-orange-300",
                      priority.level === "medium" && "bg-amber-500/15 text-amber-600 dark:text-amber-300",
                      priority.level === "low" && "bg-muted text-muted-foreground"
                    )}
                    title={priority.reasoning}
                  >
                    <Gauge className="h-3 w-3" />
                    {priority.score}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {readingTime(email.body)} read
                </span>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <HandleEmailPanel
                emailId={email.id}
                onUseReply={(text) => {
                  navigator.clipboard?.writeText(text).catch(() => {});
                  openReply(email.id);
                  toast({
                    title: "Draft copied",
                    description: "Paste into your reply.",
                    duration: 2500,
                  });
                }}
              />
              <ConversationPanel threadId={email.threadId} />
            </div>
            <div className="mt-3">
              <QuickReplyChips emailId={email.id} emailSubject={email.subject} />
            </div>
            {email.labels && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {email.labels
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean)
                  .map((l) => (
                    <span
                      key={l}
                      className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-soft"
                    >
                      {l}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Thread messages */}
          <div className="mt-4 space-y-4">
            {sortedThread.map((msg, idx) => (
              <MessageView
                key={msg.id}
                email={msg}
                isLast={idx === sortedThread.length - 1}
                isThreaded={isThreaded}
                onReply={() => openReply(msg.id)}
                onForward={() => openForward(msg.id)}
                focusMode={focusMode}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Premium reply/forward buttons (sticky footer — hidden in focus mode) */}
      {!focusMode && (
        <div className="glass flex h-12 items-center gap-2 border-t border-border/40 bg-background/60 px-3 backdrop-blur-md sm:px-6 animate-spring-in">
          <Button
            variant="outline"
            className="btn-premium h-9 rounded-full border-transparent bg-gradient-gold px-5 text-charcoal font-medium hover:opacity-90"
            onClick={() => openReply(email.id)}
          >
            <Reply className="mr-2 h-4 w-4" /> Reply
          </Button>
          <Button
            variant="outline"
            className="btn-premium glass h-9 rounded-full px-5 shadow-soft"
            onClick={() => openReplyAll(email.id)}
          >
            <ReplyAll className="mr-2 h-4 w-4" /> Reply all
          </Button>
          <Button
            variant="outline"
            className="btn-premium glass h-9 rounded-full px-5 shadow-soft"
            onClick={() => openForward(email.id)}
          >
            <Forward className="mr-2 h-4 w-4" /> Forward
          </Button>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  danger,
  premium,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  premium?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "btn-premium h-8 w-8 rounded-full transition-all duration-200 hover:scale-110 hover:shadow-soft",
              premium
                ? "border-transparent bg-gradient-gold text-charcoal font-medium hover:opacity-90 hover:shadow-premium"
                : danger
                  ? "text-muted-foreground hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground"
            )}
            onClick={onClick}
            aria-label={label}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MessageView({
  email,
  isLast,
  isThreaded,
  onReply,
  onForward,
  focusMode,
}: {
  email: Email;
  isLast: boolean;
  isThreaded: boolean;
  onReply: () => void;
  onForward: () => void;
  focusMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const showCollapsed = isThreaded && !isLast;

  if (showCollapsed && !expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setExpanded(true);
        }}
        className="card-premium flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:shadow-soft"
      >
        <Avatar className="h-6 w-6">
          <AvatarFallback
            className={cn(
              "text-[10px] font-semibold text-white",
              getAvatarColor(email.fromEmail || email.fromName)
            )}
          >
            {getInitials(email.fromName)}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium text-foreground/80">{email.fromName}</span>
        <span className="truncate">— {email.snippet}</span>
        <span className="ml-auto flex-shrink-0">{formatEmailTime(email.date)}</span>
      </div>
    );
  }

  return (
    <article className="card-premium rounded-2xl border border-border/40 bg-card shadow-premium">
      <div className="flex items-start gap-3 p-4">
        <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-border/40 shadow-soft transition-all duration-300 hover:ring-gold/40">
          <AvatarFallback
            className={cn(
              "text-sm font-semibold text-white",
              getAvatarColor(email.fromEmail || email.fromName)
            )}
          >
            {getInitials(email.fromName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-sm font-semibold text-foreground">
              {email.fromName}
            </span>
            <span className="text-xs text-muted-foreground">
              &lt;{email.fromEmail}&gt;
            </span>
            {showCollapsed && (
              <button
                onClick={() => setExpanded(false)}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
              >
                hide
              </button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            to {email.toEmails}
            {email.ccEmails && <span> · cc {email.ccEmails}</span>}
          </div>
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span title={formatFullDate(email.date)}>
            {formatEmailTime(email.date)}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "card-premium m-4 mt-2 mx-auto rounded-2xl p-5 text-sm leading-relaxed text-foreground/90 animate-fade-up stagger-2 prose prose-sm dark:prose-invert [&_*]:text-foreground/90 sm:m-6 sm:p-6 [&_a]:text-accent [&_a:hover]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:border-collapse [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1",
          focusMode ? "max-w-3xl" : "max-w-2xl"
        )}
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body) }}
      />

      {email.hasAttachment && email.attachmentName && (
        <div className="mx-4 mb-4 sm:mx-5">
          <div className="card-premium inline-flex items-center gap-2 rounded-lg p-3 text-xs transition-all duration-200 hover:-translate-y-px shadow-soft hover:shadow-premium">
            <Paperclip className="h-4 w-4 text-accent" />
            <span className="font-medium text-foreground">
              {email.attachmentName}
            </span>
            <span className="text-muted-foreground">· 1.2 MB</span>
          </div>
        </div>
      )}

      {isLast && (
        <div className="border-t border-border/60 p-4 sm:p-5">
          <Button
            variant="outline"
            size="sm"
            className="btn-premium h-8 rounded-full border-transparent bg-gradient-gold px-4 text-charcoal font-medium hover:opacity-90"
            onClick={onReply}
          >
            <Reply className="mr-2 h-3.5 w-3.5" /> Reply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="btn-premium ml-2 h-8 rounded-full px-4 text-muted-foreground hover:text-foreground"
            onClick={onForward}
          >
            <Forward className="mr-2 h-3.5 w-3.5" /> Forward
          </Button>
        </div>
      )}
    </article>
  );
}

function EmptyDetail() {
  const openCompose = useMailStore((s) => s.openCompose);
  const setTriageOpen = useMailStore((s) => s.setTriageOpen);
  return (
    <div className="hidden h-full items-center justify-center bg-muted/20 p-10 text-center md:flex">
      <div className="card-premium w-full max-w-md space-y-4 p-8 animate-spring-in">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-gold shadow-glow animate-float">
          <svg viewBox="0 0 24 24" className="h-7 w-7 text-cream" fill="currentColor" aria-hidden="true">
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <p className="font-display text-base font-medium text-foreground">
            Your inbox, curated
          </p>
          <p className="text-xs text-muted-foreground">
            Select a conversation from the list — or start something new.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button
            size="sm"
            className="btn-premium gap-1.5 bg-gradient-gold text-charcoal shadow-soft hover:shadow-glow"
            onClick={() => openCompose()}
          >
            <Pencil className="h-3.5 w-3.5" /> Compose
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="btn-premium gap-1.5 border-accent/30 text-accent hover:bg-accent/5"
            onClick={() => setTriageOpen(true)}
          >
            <Zap className="h-3.5 w-3.5" /> Triage
          </Button>
        </div>
      </div>
    </div>
  );
}

function splitLabels(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
