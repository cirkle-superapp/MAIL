"use client";

import { useState } from "react";
import {
  Zap,
  Reply,
  Hourglass,
  Handshake,
  Receipt,
  MailOpen,
  Sparkles,
  Loader2,
  ArrowRight,
  Pencil,
  Search,
  LayoutDashboard,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { useMailStore } from "@/store/mail-store";
import { useEmailStats, useInvalidateMail } from "@/hooks/use-mail";
import { fetchBriefing } from "@/hooks/use-mail";
import type { SpecialView } from "@/store/mail-store";
import { CirkleLogo } from "@/components/brand/cirkle-logo";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface SummaryCard {
  key: SpecialView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  countKey: string;
  accent: string;
}

const SUMMARY_CARDS: SummaryCard[] = [
  { key: "NOW", label: "Needs attention", icon: Zap, countKey: "NOW", accent: "from-rose-500/10 to-rose-500/5 border-rose-500/20" },
  { key: "REPLY", label: "Needs reply", icon: Reply, countKey: "REPLY", accent: "from-amber-500/10 to-amber-500/5 border-amber-500/20" },
  { key: "WAITING", label: "Waiting on", icon: Hourglass, countKey: "WAITING", accent: "from-teal-500/10 to-teal-500/5 border-teal-500/20" },
  { key: "COMMITMENTS", label: "Commitments", icon: Handshake, countKey: "COMMITMENTS", accent: "from-purple-500/10 to-purple-500/5 border-purple-500/20" },
  { key: "RECEIPTS", label: "Receipts", icon: Receipt, countKey: "RECEIPTS", accent: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/20" },
  { key: "SUBSCRIPTIONS", label: "Subscriptions", icon: MailOpen, countKey: "SUBSCRIPTIONS", accent: "from-orange-500/10 to-orange-500/5 border-orange-500/20" },
];

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-rose-500/30 bg-rose-500/5",
  medium: "border-amber-500/30 bg-amber-500/5",
  low: "border-border/60 bg-muted/30",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** COMMAND CENTER — the unique Communication OS home view (default landing). */
export function CommandCenterView() {
  const setFolder = useMailStore((s) => s.setFolder);
  const openCompose = useMailStore((s) => s.openCompose);
  const setTriageOpen = useMailStore((s) => s.setTriageOpen);
  const stats = useEmailStats();
  const invalidate = useInvalidateMail();
  const counts = stats.data?.counts ?? {};

  const { data: briefing, isLoading } = useQuery({
    queryKey: ["briefing"],
    queryFn: fetchBriefing,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className="aurora-bg relative h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        {/* Hero header */}
        <div className="mb-8 flex items-center gap-4">
          <CirkleLogo size={56} animated />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {greeting()}
            </h1>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>
          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-accent/30 text-accent hover:bg-accent/5"
              onClick={() => setTriageOpen(true)}
              title="Triage unread messages (Superhuman-style focus flow)"
            >
              <Zap className="h-3.5 w-3.5" /> Triage
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.dispatchEvent(new Event("cirkle:focus-search"))}
            >
              <Search className="h-3.5 w-3.5" /> Search
              <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => openCompose()}
            >
              <Pencil className="h-3.5 w-3.5" /> Compose
            </Button>
          </div>
        </div>

        {/* Daily Briefing (AI) */}
        <div className="mb-6">
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : (
            <BriefingCard briefing={briefing} onFirstAction={() => setFolder("REPLY")} />
          )}
        </div>

        {/* Summary cards grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SUMMARY_CARDS.map((card) => {
            const Icon = card.icon;
            const count = counts[card.countKey] ?? 0;
            return (
              <button
                key={card.key}
                onClick={() => setFolder(card.key)}
                className={cn(
                  "group flex items-center gap-3 rounded-2xl border bg-gradient-to-br p-4 text-left shadow-soft transition hover:shadow-glass",
                  card.accent
                )}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-background/60">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-semibold text-foreground">{count}</div>
                  <div className="truncate text-xs text-muted-foreground">{card.label}</div>
                </div>
                <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>

        {/* Quick links */}
        <div className="mt-6 flex flex-wrap gap-2">
          <QuickLink label="Inbox" onClick={() => setFolder("INBOX")} icon={LayoutDashboard} />
          <QuickLink label="Starred" onClick={() => setFolder("STARRED")} icon={Sparkles} />
          <QuickLink label="People" onClick={() => setFolder("PEOPLE")} icon={Handshake} />
          <QuickLink label="Analytics" onClick={() => setFolder("ANALYTICS")} icon={LayoutDashboard} />
          <QuickLink label="All Mail" onClick={() => setFolder("ARCHIVE")} icon={MailOpen} />
          {counts.SUBSCRIPTIONS > 0 ? (
            <button
              onClick={async () => {
                toast({ title: "Magic archiving newsletters…", duration: 1500 });
                try {
                  const res = await fetch("/api/emails?folder=INBOX&view=subscriptions", { cache: "no-store" });
                  const data = await res.json();
                  const ids = (data.emails ?? []).map((e: { id: string }) => e.id);
                  if (ids.length === 0) {
                    toast({ title: "No newsletters to archive" });
                    return;
                  }
                  await fetch("/api/emails", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids, folder: "ARCHIVE" }),
                  });
                  invalidate();
                  toast({ title: `Archived ${ids.length} newsletter${ids.length === 1 ? "" : "s"} ✨` });
                } catch {
                  toast({ title: "Could not archive", variant: "destructive" });
                }
              }}
              className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/10"
            >
              <Sparkles className="h-3 w-3" />
              Magic Archive {counts.SUBSCRIPTIONS} newsletters
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BriefingCard({
  briefing,
  onFirstAction,
}: {
  briefing: Awaited<ReturnType<typeof fetchBriefing>> | undefined;
  onFirstAction: () => void;
}) {
  if (!briefing) return null;
  const sevIcon = (sev: string) =>
    sev === "high" ? AlertTriangle : sev === "medium" ? Clock : CheckCircle2;
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-primary/20 p-5 shadow-glass">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3.5 w-3.5" /> Daily Briefing
      </div>
      <p className="font-display text-lg font-medium text-foreground">{briefing.headline}</p>
      {briefing.highlights && briefing.highlights.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {briefing.highlights.map((h, i) => {
            const Icon = sevIcon(h.severity);
            return (
              <li key={i} className={cn("rounded-lg border p-2.5", SEVERITY_STYLE[h.severity ?? "low"])}>
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground/90">{h.text}</p>
                    {h.source && (
                      <p className="mt-0.5 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                        “{h.source}”
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {briefing.suggestedFirstAction ? (
        <div className="mt-3">
          <Button
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onFirstAction}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            {briefing.suggestedFirstAction}
          </Button>
        </div>
      ) : null}
      <div className="mt-3 text-[10px] text-muted-foreground">
        AI briefing · source-grounded · {Math.round((briefing.confidence ?? 0.5) * 100)}% confidence
      </div>
    </div>
  );
}

function QuickLink({
  label,
  onClick,
  icon: Icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-foreground/80 transition hover:bg-muted"
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
