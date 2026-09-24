"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  Trash2,
  MailOpen,
  Mail,
  RefreshCw,
  Inbox as InboxIcon,
  Star,
  AlertCircle,
  Send,
  FileText,
  Archive as ArchiveIcon,
  ShieldAlert,
  MoreVertical,
  Clock,
  CalendarClock,
  Zap,
  Reply,
  Hourglass,
  Receipt,
  Handshake,
  Users,
  BarChart3,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmailRow } from "@/components/mail/email-row";
import { SnoozeMenu } from "@/components/mail/snooze-menu";
import { LabelMenu } from "@/components/mail/label-menu";
import { showUndoToast } from "@/components/mail/undo-toast";
import { CommitmentsView, PeopleView, AnalyticsView } from "@/components/mail/workspace-views";
import { CommandCenterView } from "@/components/mail/command-center";
import { useMailStore } from "@/store/mail-store";
import { useSettings } from "@/store/settings-store";
import { useEmailList, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { type Email, type Folder } from "@/lib/types";
import { dateBucket, deriveCategory, type Category } from "@/lib/email-utils";

const FOLDER_META: Record<
  Folder | "STARRED" | "IMPORTANT" | "SNOOZED" | "NOW" | "REPLY" | "WAITING" | "RECEIPTS" | "SUBSCRIPTIONS" | "COMMITMENTS" | "PEOPLE" | "ANALYTICS" | "COMMAND_CENTER",
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  COMMAND_CENTER: { label: "Command Center", icon: LayoutDashboard },
  INBOX: { label: "Inbox", icon: InboxIcon },
  STARRED: { label: "Starred", icon: Star },
  SNOOZED: { label: "Snoozed", icon: Clock },
  IMPORTANT: { label: "Important", icon: AlertCircle },
  NOW: { label: "Now", icon: Zap },
  REPLY: { label: "Needs reply", icon: Reply },
  WAITING: { label: "Waiting", icon: Hourglass },
  RECEIPTS: { label: "Receipts", icon: Receipt },
  SUBSCRIPTIONS: { label: "Subscriptions", icon: MailOpen },
  COMMITMENTS: { label: "Commitments", icon: Handshake },
  PEOPLE: { label: "People", icon: Users },
  ANALYTICS: { label: "Analytics", icon: BarChart3 },
  SENT: { label: "Sent", icon: Send },
  DRAFTS: { label: "Drafts", icon: FileText },
  SCHEDULED: { label: "Scheduled", icon: CalendarClock },
  ARCHIVE: { label: "All Mail", icon: ArchiveIcon },
  SPAM: { label: "Spam", icon: ShieldAlert },
  TRASH: { label: "Trash", icon: Trash2 },
};

export function EmailList({ onOpenEmail }: { onOpenEmail: (id: string) => void }) {
  const folder = useMailStore((s) => s.folder);
  const selectedLabel = useMailStore((s) => s.selectedLabel);
  const searchQuery = useMailStore((s) => s.searchQuery);
  const selectedEmailId = useMailStore((s) => s.selectedEmailId);
  const setSelectedEmailId = useMailStore((s) => s.setSelectedEmailId);
  const openEditDraft = useMailStore((s) => s.openEditDraft);
  const inboxTab = useMailStore((s) => s.inboxTab);
  const setInboxTab = useMailStore((s) => s.setInboxTab);
  const inboxTabsSetting = useSettings((s) => s.inboxTabs);
  const { data, isLoading, isError, refetch, isFetching } = useEmailList();
  const invalidate = useInvalidateMail();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);

  async function handleEmptyFolder() {
    try {
      await Promise.all(
        emails.map((e) =>
          fetch(`/api/emails/${e.id}`, { method: "DELETE" })
        )
      );
      setSelected(new Set());
      setEmptyConfirmOpen(false);
      invalidate();
      toast({
        title: `${folder === "TRASH" ? "Trash" : "Spam"} emptied`,
        duration: 1500,
      });
    } catch {
      toast({ title: "Could not empty folder", variant: "destructive" });
    }
  }

  const allEmails: Email[] = useMemo(() => data?.emails ?? [], [data]);
  const meta = FOLDER_META[folder];

  // Inbox category tabs: filter the list by the selected tab when enabled
  const showTabs =
    folder === "INBOX" &&
    !searchQuery &&
    !selectedLabel &&
    inboxTabsSetting === "categories";
  const emails: Email[] = useMemo(() => {
    if (!showTabs || inboxTab === "ALL") return allEmails;
    return allEmails.filter((e) => deriveCategory(e) === inboxTab);
  }, [allEmails, showTabs, inboxTab]);

  const tabCounts: Record<Category | "ALL", number> = useMemo(() => {
    const c: Record<Category | "ALL", number> = {
      ALL: allEmails.length,
      PRIMARY: 0,
      PROMOTIONS: 0,
      SOCIAL: 0,
      UPDATES: 0,
    };
    for (const e of allEmails) {
      c[deriveCategory(e)] += 1;
    }
    return c;
  }, [allEmails]);

  const allChecked = emails.length > 0 && selected.size === emails.length;
  const someChecked = selected.size > 0 && selected.size < emails.length;

  function toggleSelectAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(emails.map((e) => e.id)));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkUpdate(payload: Record<string, unknown>, msg: string) {
    if (selected.size === 0) return;
    try {
      const res = await fetch("/api/emails", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), ...payload }),
      });
      if (!res.ok) throw new Error("Update failed");
      setSelected(new Set());
      invalidate();
      toast({ title: msg });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  }

  // Capture prev state per selected email, apply a bulk change, show an undo
  // toast that reverts each email to its prior state.
  function bulkUpdateWithUndo(
    payload: Record<string, unknown>,
    msg: string,
    revertKey: "folder" | "snoozedUntil"
  ) {
    if (selected.size === 0) return;
    const prev = new Map<string, string | null>();
    for (const e of emails) {
      if (selected.has(e.id)) {
        prev.set(e.id, revertKey === "folder" ? e.folder : e.snoozedUntil);
      }
    }
    fetch("/api/emails", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selected), ...payload }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Update failed");
        setSelected(new Set());
        invalidate();
        showUndoToast(msg, () => revertBulk(revertKey, prev));
      })
      .catch(() => toast({ title: "Action failed", variant: "destructive" }));
  }

  async function revertBulk(
    key: "folder" | "snoozedUntil",
    prev: Map<string, string | null>
  ) {
    try {
      await Promise.all(
        Array.from(prev.entries()).map(([id, val]) =>
          fetch(`/api/emails/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              key === "folder"
                ? { folder: val }
                : { snoozedUntil: val }
            ),
          })
        )
      );
      invalidate();
      toast({ title: "Undo: restored", duration: 1500 });
    } catch {
      toast({ title: "Undo failed", variant: "destructive" });
    }
  }

  async function bulkToggleLabel(label: string, checked: boolean) {
    if (selected.size === 0) return;
    const targets = emails.filter((e) => selected.has(e.id));
    try {
      await Promise.all(
        targets.map((e) => {
          const current = e.labels
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const next = checked
            ? Array.from(new Set([...current, label]))
            : current.filter((l) => l !== label);
          return fetch(`/api/emails/${e.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ labels: next.join(",") }),
          });
        })
      );
      invalidate();
      toast({
        title: checked ? `Added label "${label}"` : `Removed label "${label}"`,
        duration: 1500,
      });
    } catch {
      toast({ title: "Label update failed", variant: "destructive" });
    }
  }

  // Labels active on ALL selected emails (for the bulk LabelMenu checkbox state)
  const bulkActiveLabels = (() => {
    const targets = emails.filter((e) => selected.has(e.id));
    if (targets.length === 0) return new Set<string>();
    return targets[0].labels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((label) => targets.every((t) => t.labels.includes(label)))
      .reduce<Set<string>>((set, l) => set.add(l), new Set());
  })();

  async function markReadAll(isRead: boolean) {
    await bulkUpdate({ isRead }, `Marked ${isRead ? "read" : "unread"}`);
  }

  // Single-email row actions (with undo for archive/delete/snooze)
  function singlePatch(id: string, payload: Record<string, unknown>) {
    return fetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((res) => {
      if (!res.ok) throw new Error("Failed");
      invalidate();
    });
  }

  function rowArchive(email: Email) {
    const prev = email.folder;
    singlePatch(email.id, { folder: "ARCHIVE" })
      .then(() => showUndoToast("Archived", () => singlePatch(email.id, { folder: prev })))
      .catch(() => toast({ title: "Action failed", variant: "destructive" }));
  }
  function rowDelete(email: Email) {
    const prev = email.folder;
    singlePatch(email.id, { folder: "TRASH" })
      .then(() => showUndoToast("Moved to Trash", () => singlePatch(email.id, { folder: prev })))
      .catch(() => toast({ title: "Action failed", variant: "destructive" }));
  }
  function rowToggleRead(email: Email) {
    singlePatch(email.id, { isRead: !email.isRead }).catch(() =>
      toast({ title: "Action failed", variant: "destructive" })
    );
  }
  function rowSnooze(email: Email, iso: string) {
    singlePatch(email.id, { snoozedUntil: iso })
      .then(() => showUndoToast("Snoozed", () => singlePatch(email.id, { snoozedUntil: null })))
      .catch(() => toast({ title: "Action failed", variant: "destructive" }));
  }
  function rowUnsnooze(email: Email) {
    singlePatch(email.id, { snoozedUntil: null }).catch(() =>
      toast({ title: "Action failed", variant: "destructive" })
    );
  }

  const title = searchQuery
    ? `Results for "${searchQuery}"`
    : selectedLabel
    ? `Label: ${selectedLabel}`
    : meta.label;

  // Communication OS dedicated views (not flat email lists)
  if (folder === "COMMAND_CENTER") {
    return <CommandCenterView />;
  }
  if (folder === "COMMITMENTS") {
    return <CommitmentsView />;
  }
  if (folder === "PEOPLE") {
    return <PeopleView />;
  }
  if (folder === "ANALYTICS") {
    return <AnalyticsView />;
  }

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* List header / toolbar */}
      <div className="glass animate-spring-in flex h-14 items-center gap-2 border-b border-border/40 px-3 sm:px-4">
        {selected.size > 0 ? (
          <BulkToolbar
            count={selected.size}
            folder={folder}
            onClear={() => setSelected(new Set())}
            onArchive={() =>
              bulkUpdateWithUndo({ folder: "ARCHIVE" }, "Archived", "folder")
            }
            onDelete={() => {
              if (folder === "TRASH") {
                // permanently delete selected
                Promise.all(
                  Array.from(selected).map((id) =>
                    fetch(`/api/emails/${id}`, { method: "DELETE" })
                  )
                )
                  .then(() => {
                    setSelected(new Set());
                    invalidate();
                    toast({ title: "Deleted permanently" });
                  })
                  .catch(() =>
                    toast({
                      title: "Delete failed",
                      variant: "destructive",
                    })
                  );
              } else {
                bulkUpdateWithUndo({ folder: "TRASH" }, "Moved to Trash", "folder");
              }
            }}
            onMarkRead={() => markReadAll(true)}
            onMarkUnread={() => markReadAll(false)}
            onSnooze={(iso) =>
              bulkUpdateWithUndo({ snoozedUntil: iso }, "Snoozed", "snoozedUntil")
            }
            onUnsnooze={() =>
              bulkUpdateWithUndo({ snoozedUntil: null }, "Unsnoozed", "snoozedUntil")
            }
            activeLabels={bulkActiveLabels}
            onToggleLabel={bulkToggleLabel}
          />
        ) : (
          <div className="flex w-full items-center gap-2">
            <Checkbox
              checked={allChecked ? true : someChecked ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
              className="ml-1"
            />
            <div
              className={cn(
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg shadow-soft",
                folder === "INBOX"
                  ? "bg-gradient-gold text-cream"
                  : "bg-primary/10 text-primary"
              )}
            >
              <meta.icon className="h-4 w-4" />
            </div>
            <h2 className="font-display text-base font-medium text-foreground">{title}</h2>
            {emails.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {emails.length} {emails.length === 1 ? "message" : "messages"}
              </span>
            )}
            {(folder === "TRASH" || folder === "SPAM") && emails.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="btn-premium ml-2 h-8 gap-1 rounded-full text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setEmptyConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Empty {folder === "TRASH" ? "trash" : "spam"} now
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="btn-premium h-8 w-8 rounded-full"
                      onClick={() => refetch()}
                      aria-label="Refresh"
                    >
                      <RefreshCw
                        className={cn(
                          "h-4 w-4",
                          isFetching && "animate-spin"
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="icon"
                className="btn-premium h-8 w-8 rounded-full"
                aria-label="More"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Inbox category tabs */}
      {showTabs && (
        <div className="glass flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 px-2 py-2">
          <InboxTabButton
            active={inboxTab === "ALL"}
            label="All"
            count={tabCounts.ALL}
            onClick={() => setInboxTab("ALL")}
          />
          <InboxTabButton
            active={inboxTab === "PRIMARY"}
            label="Primary"
            count={tabCounts.PRIMARY}
            dot="bg-primary"
            onClick={() => setInboxTab("PRIMARY")}
          />
          <InboxTabButton
            active={inboxTab === "PROMOTIONS"}
            label="Promotions"
            count={tabCounts.PROMOTIONS}
            dot="bg-amber-500"
            onClick={() => setInboxTab("PROMOTIONS")}
          />
          <InboxTabButton
            active={inboxTab === "SOCIAL"}
            label="Social"
            count={tabCounts.SOCIAL}
            dot="bg-purple-500"
            onClick={() => setInboxTab("SOCIAL")}
          />
          <InboxTabButton
            active={inboxTab === "UPDATES"}
            label="Updates"
            count={tabCounts.UPDATES}
            dot="bg-emerald-500"
            onClick={() => setInboxTab("UPDATES")}
          />
        </div>
      )}

      {/* Email rows */}
      <div className="flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            Could not load emails.{" "}
            <button
              onClick={() => refetch()}
              className="ml-1 text-primary underline"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <EmailListSkeleton />
        ) : emails.length === 0 ? (
          <EmptyState folder={folder} search={!!searchQuery} />
        ) : (
          <DateGroupedEmailList
            emails={emails}
            selected={selected}
            activeId={selectedEmailId}
            onToggleSelect={toggleSelect}
            onOpen={(id) => {
              const target = emails.find((e) => e.id === id);
              if (target && target.folder === "DRAFTS") {
                openEditDraft(id);
              } else {
                setSelectedEmailId(id);
                onOpenEmail(id);
              }
            }}
            onArchive={rowArchive}
            onDelete={rowDelete}
            onToggleRead={rowToggleRead}
            onSnooze={rowSnooze}
            onUnsnooze={rowUnsnooze}
          />
        )}
      </div>

      <AlertDialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <AlertDialogContent className="sm:max-w-[420px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Empty {folder === "TRASH" ? "trash" : "spam"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {emails.length}{" "}
              {emails.length === 1 ? "message" : "messages"} in{" "}
              {folder === "TRASH" ? "your trash" : "your spam"}. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleEmptyFolder}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const BUCKET_ORDER = ["Today", "Yesterday", "This week", "This month", "Earlier"] as const;

function InboxTabButton({
  active,
  label,
  count,
  dot,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all duration-200",
        active
          ? "bg-primary/10 font-semibold text-primary shadow-soft"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      <span>{label}</span>
      {count > 0 && (
        <span
          className={cn(
            "text-[11px]",
            active ? "text-primary/70" : "text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function DateGroupedEmailList({
  emails,
  selected,
  activeId,
  onToggleSelect,
  onOpen,
  onArchive,
  onDelete,
  onToggleRead,
  onSnooze,
  onUnsnooze,
}: {
  emails: Email[];
  selected: Set<string>;
  activeId: string | null;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onArchive: (email: Email) => void;
  onDelete: (email: Email) => void;
  onToggleRead: (email: Email) => void;
  onSnooze: (email: Email, iso: string) => void;
  onUnsnooze: (email: Email) => void;
}) {
  // Bucket emails preserving the date-desc order from the API
  const groups = new Map<string, Email[]>();
  for (const e of emails) {
    const bucket = dateBucket(e.date);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(e);
  }

  return (
    <div>
      {BUCKET_ORDER.filter((b) => groups.has(b)).map((bucket) => (
        <section key={bucket}>
          <div className="glass-strong sticky top-0 z-10 flex h-9 items-center gap-1.5 border-b border-border/40 px-4">
            <span
              className="h-3 w-1 rounded-full bg-gradient-gold"
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">
              {bucket}
            </span>
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {groups.get(bucket)!.length}
            </span>
          </div>
          <ul className="divide-y divide-border/40">
            {groups.get(bucket)!.map((email, idx) => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selected.has(email.id)}
                active={activeId === email.id}
                index={idx}
                onSelect={() => onToggleSelect(email.id)}
                onOpen={() => onOpen(email.id)}
                onArchive={() => onArchive(email)}
                onDelete={() => onDelete(email)}
                onToggleRead={() => onToggleRead(email)}
                onSnooze={(iso) => onSnooze(email, iso)}
                onUnsnooze={() => onUnsnooze(email)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BulkToolbar({
  count,
  folder,
  onClear,
  onArchive,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onSnooze,
  onUnsnooze,
  activeLabels,
  onToggleLabel,
}: {
  count: number;
  folder: string;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onSnooze: (iso: string) => void;
  onUnsnooze: () => void;
  activeLabels: Set<string>;
  onToggleLabel: (label: string, checked: boolean) => void;
}) {
  return (
    <div className="flex w-full animate-spring-in items-center gap-1">
      <span className="font-display text-sm font-semibold text-foreground">
        {count} selected
      </span>
      <div className="mx-1 h-5 w-px bg-border/60" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="btn-premium h-8 w-8 rounded-full"
              onClick={onArchive}
            >
              <Archive className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SnoozeMenu onSnooze={onSnooze} onUnsnooze={onUnsnooze} />
      <LabelMenu
        activeLabels={activeLabels}
        onToggle={onToggleLabel}
        size="sm"
      />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="btn-premium h-8 w-8 rounded-full"
              onClick={onMarkRead}
            >
              <MailOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as read</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="btn-premium h-8 w-8 rounded-full"
              onClick={onMarkUnread}
            >
              <Mail className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as unread</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="mx-1 h-5 w-px bg-border/60" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="btn-premium h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {folder === "TRASH" ? "Delete forever" : "Move to Trash"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-8 text-xs"
        onClick={onClear}
      >
        Clear
      </Button>
    </div>
  );
}

function EmailListSkeleton() {
  return (
    <ul className="divide-y divide-border/40">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-8 w-8 rounded-full shadow-soft" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-3 w-12" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  folder,
  search,
}: {
  folder:
    | Folder
    | "STARRED"
    | "IMPORTANT"
    | "SNOOZED"
    | "NOW"
    | "REPLY"
    | "WAITING"
    | "RECEIPTS"
    | "SUBSCRIPTIONS";
  search: boolean;
}) {
  const meta = FOLDER_META[folder];
  const Icon = meta.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <div className="card-premium animate-spring-in w-full max-w-sm p-8">
        <div
          className={cn(
            "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-glow animate-float",
            search ? "bg-gradient-hero" : "bg-gradient-gold"
          )}
        >
          <Icon className="h-7 w-7 text-cream" />
        </div>
        <div>
          <p className="font-display text-base font-medium text-foreground">
            {search ? "No messages found" : `No messages in ${meta.label}`}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "Try a different search term."
              : "New messages will appear here."}
          </p>
        </div>
      </div>
    </div>
  );
}


