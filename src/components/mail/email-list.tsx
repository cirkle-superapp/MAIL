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
import { EmailRow } from "@/components/mail/email-row";
import { useMailStore } from "@/store/mail-store";
import { useEmailList, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { type Email, type Folder } from "@/lib/types";

const FOLDER_META: Record<
  Folder | "STARRED" | "IMPORTANT",
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  INBOX: { label: "Inbox", icon: InboxIcon },
  STARRED: { label: "Starred", icon: Star },
  IMPORTANT: { label: "Important", icon: AlertCircle },
  SENT: { label: "Sent", icon: Send },
  DRAFTS: { label: "Drafts", icon: FileText },
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
  const { data, isLoading, isError, refetch, isFetching } = useEmailList();
  const invalidate = useInvalidateMail();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const emails: Email[] = useMemo(() => data?.emails ?? [], [data]);
  const meta = FOLDER_META[folder];

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

  async function markReadAll(isRead: boolean) {
    await bulkUpdate({ isRead }, `Marked ${isRead ? "read" : "unread"}`);
  }

  const title = searchQuery
    ? `Results for "${searchQuery}"`
    : selectedLabel
    ? `Label: ${selectedLabel}`
    : meta.label;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* List header / toolbar */}
      <div className="flex h-12 items-center gap-2 border-b border-border px-3 sm:px-4">
        {selected.size > 0 ? (
          <BulkToolbar
            count={selected.size}
            folder={folder}
            onClear={() => setSelected(new Set())}
            onArchive={() =>
              bulkUpdate({ folder: "ARCHIVE" }, "Archived")
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
                bulkUpdate({ folder: "TRASH" }, "Moved to Trash");
              }
            }}
            onMarkRead={() => markReadAll(true)}
            onMarkUnread={() => markReadAll(false)}
          />
        ) : (
          <div className="flex w-full items-center gap-2">
            <Checkbox
              checked={allChecked ? true : someChecked ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
              className="ml-1"
            />
            <meta.icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
            <span className="text-xs text-muted-foreground">
              {emails.length > 0 && `${emails.length} ${emails.length === 1 ? "message" : "messages"}`}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
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
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

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
          <ul className="divide-y divide-border/60">
            {emails.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                selected={selected.has(email.id)}
                active={selectedEmailId === email.id}
                onSelect={() => toggleSelect(email.id)}
                onOpen={() => {
                  setSelectedEmailId(email.id);
                  onOpenEmail(email.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>
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
}: {
  count: number;
  folder: string;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}) {
  return (
    <div className="flex w-full items-center gap-1">
      <span className="text-xs font-medium text-foreground">
        {count} selected
      </span>
      <div className="mx-1 h-5 w-px bg-border" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onArchive}>
              <Archive className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkRead}>
              <MailOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as read</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMarkUnread}>
              <Mail className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as unread</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="mx-1 h-5 w-px bg-border" />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
    <ul className="divide-y divide-border/60">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-8 w-8 rounded-full" />
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
  folder: Folder | "STARRED" | "IMPORTANT";
  search: boolean;
}) {
  const meta = FOLDER_META[folder];
  const Icon = meta.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {search ? "No messages found" : `No messages in ${meta.label}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {search
            ? "Try a different search term."
            : "New messages will appear here."}
        </p>
      </div>
    </div>
  );
}


