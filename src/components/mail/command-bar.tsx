"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMailStore } from "@/store/mail-store";
import {
  fetchInterpretCommand,
  useInvalidateMail,
} from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import type { Folder } from "@/lib/types";
import type { SpecialView } from "@/store/mail-store";

const VIEW_MAP: Record<string, Folder | SpecialView> = {
  now: "NOW",
  reply: "REPLY",
  waiting: "WAITING",
  commitments: "COMMITMENTS",
  people: "PEOPLE",
  receipts: "RECEIPTS",
  subscriptions: "SUBSCRIPTIONS",
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFTS",
  starred: "STARRED",
  important: "IMPORTANT",
  archive: "ARCHIVE",
  spam: "SPAM",
  trash: "TRASH",
  scheduled: "SCHEDULED",
  snoozed: "SNOOZED",
};

const SUGGESTIONS = [
  "Show everything waiting on me",
  "Find emails that need a reply",
  "Show overdue commitments",
  "Find invoices",
  "Show newsletters",
  "Compose a new email",
  "Show starred",
];

interface InterpretResult {
  action: string;
  query?: string;
  view?: string;
  answer?: string;
  confidence: number;
  source: string;
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InterpretResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const setFolder = useMailStore((s) => s.setFolder);
  const setSearchQuery = useMailStore((s) => s.setSearchQuery);
  const setSearchInput = useMailStore((s) => s.setSearchInput);
  const openCompose = useMailStore((s) => s.openCompose);
  const invalidate = useInvalidateMail();

  // Cmd/Ctrl+K opens the bar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setInput("");
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function run(command: string) {
    if (!command.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await fetchInterpretCommand(command);
      setResult(r);
      route(r);
    } catch {
      toast({ title: "Command failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function route(r: InterpretResult) {
    if (r.action === "compose") {
      setOpen(false);
      openCompose();
      return;
    }
    if (r.action === "view" && r.view) {
      const v = VIEW_MAP[r.view.toLowerCase()];
      if (v) {
        setOpen(false);
        setFolder(v);
        return;
      }
    }
    if (r.action === "answer" && r.answer) {
      // answer shown inline; do not close
      return;
    }
    // default: search
    if (r.query) {
      setOpen(false);
      setSearchInput(r.query);
      setSearchQuery(r.query);
      invalidate();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(input);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-b border-border px-4 py-3">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground" />
          )}
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything — “show what needs a reply”, “find invoices from Acme”…"
            className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
            aria-label="Command"
          />
          <kbd className="flex-shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ↵
          </kbd>
        </form>

        <div className="max-h-[50vh] overflow-y-auto p-3">
          {/* Answer panel */}
          {result?.action === "answer" && result.answer ? (
            <div className="mb-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                <Sparkles className="h-3 w-3" /> Answer
              </div>
              <p className="text-foreground/90">{result.answer}</p>
              <div className="mt-2 text-[10px] text-muted-foreground">
                source: {result.source} · {Math.round(result.confidence * 100)}% confidence
              </div>
            </div>
          ) : null}

          {/* Interpretation preview */}
          {result && result.action !== "answer" ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
              <span>
                interpreted as <span className="font-medium text-foreground">{result.action}</span>
                {result.view ? ` → ${result.view}` : ""}
                {result.query ? ` “${result.query}”` : ""}
              </span>
              <span className="ml-auto">{Math.round(result.confidence * 100)}%</span>
            </div>
          ) : null}

          {/* Suggestions */}
          {!result ? (
            <div>
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Try
              </div>
              <ul className="space-y-1">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        setInput(s);
                        run(s);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground/80 transition-colors hover:bg-muted"
                    >
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
