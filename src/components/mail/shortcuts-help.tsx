"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

const SHORTCUTS: Array<{ keys: string[]; action: string; group: string }> = [
  { keys: ["j"], action: "Move down (next message)", group: "Navigation" },
  { keys: ["k"], action: "Move up (previous message)", group: "Navigation" },
  { keys: ["←"], action: "Back to list", group: "Navigation" },
  { keys: ["c"], action: "Compose a new message", group: "Compose" },
  { keys: ["r"], action: "Reply to the open conversation", group: "Compose" },
  { keys: ["a"], action: "Reply all", group: "Compose" },
  { keys: ["f"], action: "Forward the open conversation", group: "Compose" },
  { keys: ["⇧", "/", "↵"], action: "Send (in compose: ⌘/Ctrl+Enter)", group: "Compose" },
  { keys: ["e"], action: "Archive the open conversation", group: "Actions" },
  { keys: ["#"], action: "Move to Trash", group: "Actions" },
  { keys: ["s"], action: "Toggle star", group: "Actions" },
  { keys: ["i"], action: "Mark important / unimportant", group: "Actions" },
  { keys: ["/"], action: "Focus the search bar", group: "Search" },
  { keys: ["Esc"], action: "Close compose / clear search / back", group: "Search" },
  { keys: ["?"], action: "Show this help", group: "Help" },
];

const GROUP_ORDER = ["Navigation", "Compose", "Actions", "Search", "Help"];

export function ShortcutsHelpDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onShow() {
      setOpen(true);
    }
    window.addEventListener("cirkle:show-shortcuts", onShow);
    return () => window.removeEventListener("cirkle:show-shortcuts", onShow);
  }, []);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: SHORTCUTS.filter((s) => s.group === g),
  })).filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" /> Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-2">
          {grouped.map((g) => (
            <section key={g.group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.group}
              </h3>
              <ul className="space-y-1">
                {g.items.map((item) => (
                  <li
                    key={item.action}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <span className="text-sm text-foreground/90">
                      {item.action}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1">
                      {item.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[11px] font-medium text-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
