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
  INTENT_LABELS,
  INTENT_COLORS,
  type Intent,
} from "@/lib/email-utils";
import type { Email } from "@/lib/types";

export function EmailDetail({
  onBack,
}: {
  onBack: () => void;
}) {
  const id = useMailStore((s) => s.selectedEmailId);
  const openReply = useMailStore((s) => s.openReply);
  const openReplyAll = useMailStore((s) => s.openReplyAll);
  const openForward = useMailStore((s) => s.openForward);
  const { data, isLoading } = useEmailDetail(id);
  const invalidate = useInvalidateMail();

  const email = data?.email;
  const thread = data?.thread;

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

  if (isLoading) {
    return (
      <div className="flex h-full flex-col bg-background p-4">
        <Skeleton className="h-8 w-2/3" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24 w-full" />
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

  function archive() {
    const prevFolder = email.folder;
    patchSilent({ folder: "ARCHIVE" }).then(() => {
      onBack();
      showUndoToast("Archived", () => revertPatch({ folder: prevFolder }));
    });
  }
  function trash() {
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
      {/* Action toolbar */}
      <div className="flex h-12 items-center gap-1 border-b border-border px-2 sm:px-4">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={onBack}
                aria-label="Back to list"
              >
                <ArrowLeft className="h-[1.1rem] w-[1.1rem]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="mx-1 h-5 w-px bg-border" />
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
        />
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
          <ActionBtn label="Smart follow-up" onClick={handleFollowUp}>
            <Sparkles className="h-[1.05rem] w-[1.05rem]" />
          </ActionBtn>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="More">
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-8">
          {/* Subject */}
          <div className="flex items-start gap-3">
            <h1 className="flex-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {email.subject || "(no subject)"}
            </h1>
            <StarButton
              emailId={email.id}
              starred={email.isStarred}
              size="md"
            />
          </div>
          {/* Intent badge + HANDLE email (§16) */}
          {email.intent ? (
            <div className="mt-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  INTENT_COLORS[email.intent as Intent] ?? INTENT_COLORS.FYI
                )}
              >
                {INTENT_LABELS[email.intent as Intent] ?? email.intent}
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
          {email.labels && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {email.labels
                .split(",")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => (
                  <span
                    key={l}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {l}
                  </span>
                ))}
            </div>
          )}

          {/* Thread messages */}
          <div className="mt-5 space-y-4">
            {sortedThread.map((msg, idx) => (
              <MessageView
                key={msg.id}
                email={msg}
                isLast={idx === sortedThread.length - 1}
                isThreaded={isThreaded}
                onReply={() => openReply(msg.id)}
                onForward={() => openForward(msg.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Reply/Forward buttons (fixed at bottom of pane) */}
      <div className="flex items-center gap-2 border-t border-border bg-background p-3 sm:px-8">
        <Button
          variant="outline"
          className="h-10 rounded-full border-primary/30 px-5 text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => openReply(email.id)}
        >
          <Reply className="mr-2 h-4 w-4" /> Reply
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-full border-primary/30 px-5 text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => openReplyAll(email.id)}
        >
          <ReplyAll className="mr-2 h-4 w-4" /> Reply all
        </Button>
        <Button
          variant="outline"
          className="h-10 rounded-full border-primary/30 px-5 text-primary hover:bg-primary/5 hover:text-primary"
          onClick={() => openForward(email.id)}
        >
          <Forward className="mr-2 h-4 w-4" /> Forward
        </Button>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
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
              "h-9 w-9",
              danger
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
}: {
  email: Email;
  isLast: boolean;
  isThreaded: boolean;
  onReply: () => void;
  onForward: () => void;
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
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted/40"
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
    <article className="rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <Avatar className="h-10 w-10 flex-shrink-0">
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
            <span className="text-sm font-semibold text-foreground">
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
          <div className="text-xs text-muted-foreground">
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
        className="prose prose-sm max-w-none px-4 pb-4 text-sm leading-relaxed text-foreground/90 sm:px-5 [&_a]:text-accent [&_a:hover]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:border-collapse [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1"
        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body) }}
      />

      {email.hasAttachment && email.attachmentName && (
        <div className="mx-4 mb-4 sm:mx-5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
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
            className="h-8 rounded-full border-primary/30 px-4 text-primary hover:bg-primary/5 hover:text-primary"
            onClick={onReply}
          >
            <Reply className="mr-2 h-3.5 w-3.5" /> Reply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-8 rounded-full px-4 text-muted-foreground hover:text-foreground"
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
  return (
    <div className="hidden h-full items-center justify-center bg-muted/20 p-10 text-center md:flex">
      <div className="max-w-sm space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-accent" fill="currentColor" aria-hidden="true">
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-foreground">
          Select a message to read
        </p>
        <p className="text-xs text-muted-foreground">
          Pick a conversation from the list to view it here.
        </p>
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
