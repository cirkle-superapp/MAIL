"use client";

import { useState } from "react";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Archive,
  ShieldAlert,
  Star,
  Tag as TagIcon,
  Plus,
  Pencil,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as UILabel } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useMailStore, type SpecialView } from "@/store/mail-store";
import { useEmailStats, useLabels, useInvalidateMail } from "@/hooks/use-mail";
import { LABEL_COLORS } from "@/lib/types";
import type { Folder } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

interface NavItem {
  key: Folder | SpecialView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { key: "INBOX", label: "Inbox", icon: Inbox },
  { key: "STARRED", label: "Starred", icon: Star },
  { key: "IMPORTANT", label: "Important", icon: AlertCircle },
  { key: "SENT", label: "Sent", icon: Send },
  { key: "DRAFTS", label: "Drafts", icon: FileText },
  { key: "ARCHIVE", label: "All Mail", icon: Archive },
  { key: "SPAM", label: "Spam", icon: ShieldAlert },
  { key: "TRASH", label: "Trash", icon: Trash2 },
];

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const folder = useMailStore((s) => s.folder);
  const setFolder = useMailStore((s) => s.setFolder);
  const selectedLabel = useMailStore((s) => s.selectedLabel);
  const setSelectedLabel = useMailStore((s) => s.setSelectedLabel);
  const openCompose = useMailStore((s) => s.openCompose);
  const stats = useEmailStats();
  const { data: labelsData } = useLabels();
  const invalidate = useInvalidateMail();
  const [labelsOpen, setLabelsOpen] = useState(true);
  const [newLabelOpen, setNewLabelOpen] = useState(false);

  const unread = stats.data?.unreadByFolder ?? {};
  const labelCounts = stats.data?.labelCounts ?? {};

  const counts = stats.data?.counts ?? {};

  function isActive(itemKey: Folder | SpecialView): boolean {
    return !selectedLabel && folder === itemKey;
  }

  async function handleCreateLabel(name: string, color: string) {
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create label");
      }
      invalidate();
      toast({ title: `Label "${name}" created` });
    } catch (e) {
      toast({
        title: "Could not create label",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-background transition-[width] duration-200",
        collapsed ? "w-0 overflow-hidden md:w-0" : "w-64"
      )}
      aria-label="Mail folders"
    >
      <div className="p-3">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => openCompose()}
                className="h-12 w-full justify-start gap-3 rounded-xl bg-rose-500 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-600 hover:shadow-md"
              >
                <Pencil className="h-4 w-4" />
                <span>Compose</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Compose a new email</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <ScrollArea className="flex-1 px-2 pb-4">
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.key);
            const count =
              item.key === "STARRED" || item.key === "IMPORTANT"
                ? counts[item.key]
                : item.key === "INBOX"
                ? unread["INBOX"]
                : counts[item.key];
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setFolder(item.key)}
                className={cn(
                  "group flex items-center gap-3 rounded-r-full rounded-l-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-rose-500/10 font-semibold text-rose-700 dark:text-rose-300"
                    : "text-foreground/80 hover:bg-muted"
                )}
              >
                <Icon
                  className={cn(
                    "h-[1.05rem] w-[1.05rem]",
                    active ? "text-rose-500" : "text-muted-foreground"
                  )}
                />
                <span className="flex-1 truncate text-left">{item.label}</span>
                {count ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      "h-5 min-w-[1.25rem] justify-center bg-rose-500/15 px-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300"
                    )}
                  >
                    {count}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Labels section */}
        <div className="mt-4">
          <button
            onClick={() => setLabelsOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                !labelsOpen && "-rotate-90"
              )}
            />
            <span>Labels</span>
          </button>
          {labelsOpen && (
            <div className="mt-1 flex flex-col gap-0.5">
              {(labelsData?.labels ?? []).map((label) => {
                const active = selectedLabel === label.name;
                const count = labelCounts[label.name] ?? 0;
                const colorClass =
                  LABEL_COLORS[label.color] ?? LABEL_COLORS.gray;
                return (
                  <button
                    key={label.id}
                    onClick={() => setSelectedLabel(label.name)}
                    className={cn(
                      "flex items-center gap-3 rounded-l-lg rounded-r-full px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-rose-500/10 font-semibold text-rose-700 dark:text-rose-300"
                        : "text-foreground/80 hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "h-3 w-3 flex-shrink-0 rounded-full",
                        colorClass
                      )}
                    />
                    <span className="flex-1 truncate text-left">
                      {label.name}
                    </span>
                    {count ? (
                      <span className="text-[11px] text-muted-foreground">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <button
                onClick={() => setNewLabelOpen(true)}
                className="mt-1 flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>Add label</span>
              </button>
            </div>
          )}
        </div>
      </ScrollArea>

      <CreateLabelDialog
        open={newLabelOpen}
        onOpenChange={setNewLabelOpen}
        onCreate={handleCreateLabel}
      />
    </aside>
  );
}

function CreateLabelDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (name: string, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("purple");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName("");
    setColor("purple");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-rose-500" /> Create new label
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <UILabel htmlFor="label-name">Label name</UILabel>
            <Input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Projects"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <UILabel>Color</UILabel>
            <div className="flex flex-wrap gap-2">
              {Object.entries(LABEL_COLORS).map(([key, cls]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition",
                    cls,
                    color === key
                      ? "border-foreground ring-2 ring-foreground/20"
                      : "border-transparent"
                  )}
                  aria-label={key}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-rose-500 text-white hover:bg-rose-600">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
