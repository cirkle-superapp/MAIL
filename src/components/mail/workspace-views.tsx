"use client";

import { useMemo } from "react";
import {
  Handshake,
  Users,
  ArrowRight,
  ExternalLink,
  BarChart3,
  Inbox as InboxIcon,
  Send,
  MailOpen,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import {
  useCommitments,
  useContacts,
  useInvalidateMail,
} from "@/hooks/use-mail";
import { useMailStore } from "@/store/mail-store";
import {
  getInitials,
  getAvatarColor,
  formatEmailTime,
  INTENT_LABELS,
  type Intent,
} from "@/lib/email-utils";
import { toast } from "@/hooks/use-toast";

/** COMMITMENTS view (§6): commitments detected across all emails. */
export function CommitmentsView() {
  const { data, isLoading } = useCommitments();
  const setSelectedEmailId = useMailStore((s) => s.setSelectedEmailId);
  const invalidate = useInvalidateMail();
  const commitments = data?.commitments ?? [];

  const incoming = commitments.filter((c) => c.direction === "incoming");
  const outgoing = commitments.filter((c) => c.direction === "outgoing");

  async function markDone(id: string) {
    // The commitment id is `${emailId}:${snippet}`; mark the source email read
    // + toast as a lightweight "handled" signal. (Full persistence is a later phase.)
    const emailId = id.split(":")[0];
    await fetch(`/api/emails/${emailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRead: true }),
    });
    invalidate();
    toast({ title: "Marked as handled", duration: 1500 });
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <Handshake className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-medium text-foreground">Commitments</h2>
        <span className="text-xs text-muted-foreground">
          {commitments.length} detected · {incoming.length} from others · {outgoing.length} yours
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : commitments.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="No commitments detected"
              hint="Commitments like “I will…” or “Please send…” are extracted automatically from your mail."
            />
          ) : (
            <div className="space-y-3">
              {commitments.map((c) => (
                <article
                  key={c.id}
                  className="rounded-xl border border-border/60 bg-card p-4 shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-xs font-semibold text-cream",
                          getAvatarColor(c.fromName)
                        )}
                      >
                        {getInitials(c.fromName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-foreground">
                          {c.who}
                        </span>
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {c.direction === "outgoing" ? "you promised" : "promised you"}
                        </span>
                        {c.due && (
                          <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                            due {c.due}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-foreground/90">{c.action}</p>
                      <p className="mt-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
                        “{c.source}”
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{c.fromName}</span>
                        <span>·</span>
                        <span>{formatEmailTime(c.date)}</span>
                        <span>·</span>
                        <span className="truncate">{c.subject}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        setSelectedEmailId(c.emailId);
                      }}
                    >
                      <ExternalLink className="h-3 w-3" /> Open email
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => markDone(c.id)}
                    >
                      Mark handled
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/** PEOPLE view (§10): relationship-centric contact cards. */
export function PeopleView() {
  const { data, isLoading } = useContacts();
  const contacts = data?.contacts ?? [];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <Users className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-medium text-foreground">People</h2>
        <span className="text-xs text-muted-foreground">
          {contacts.length} contacts
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              hint="People you correspond with appear here automatically."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contacts.map((c) => (
                <div
                  key={c.email}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-soft transition hover:shadow-glass"
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold text-cream",
                        getAvatarColor(c.email)
                      )}
                    >
                      {getInitials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.email}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/** ANALYTICS view (§41): personal communication analytics — visibility, not gamification. */
interface AnalyticsData {
  totals: { received: number; sent: number; unread: number; needsReply: number; overdueCommitments: number };
  topCorrespondents: Array<{ name: string; count: number; lastInteraction: string }>;
  volumeByDay: Array<{ day: string; received: number; sent: number }>;
  intentDistribution: Record<string, number>;
}

export function AnalyticsView() {
  const { data, isLoading } = useQuery<AnalyticsData, unknown>({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics", { cache: "no-store" });
      if (!res.ok) throw new Error("analytics failed");
      return res.json();
    },
  });
  const maxVolume = useMemo(
    () => Math.max(1, ...(data?.volumeByDay ?? []).map((d) => Math.max(d.received, d.sent))),
    [data]
  );
  const intentEntries = Object.entries(data?.intentDistribution ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <BarChart3 className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-medium text-foreground">Analytics</h2>
        <span className="text-xs text-muted-foreground">your communication at a glance</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <KpiCard icon={InboxIcon} label="Received" value={data?.totals.received ?? 0} color="text-primary" />
                <KpiCard icon={Send} label="Sent" value={data?.totals.sent ?? 0} color="text-accent" />
                <KpiCard icon={MailOpen} label="Unread" value={data?.totals.unread ?? 0} color="text-amber-500" />
                <KpiCard icon={AlertTriangle} label="Needs reply" value={data?.totals.needsReply ?? 0} color="text-rose-500" />
                <KpiCard icon={Clock} label="Overdue" value={data?.totals.overdueCommitments ?? 0} color="text-red-500" />
              </div>

              {/* Volume trend (14 days) */}
              <div className="rounded-xl border border-border/60 bg-card p-4 shadow-soft">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Volume · last 14 days
                </h3>
                <div className="flex h-32 items-end gap-1">
                  {(data?.volumeByDay ?? []).map((d) => {
                    const rH = Math.round((d.received / maxVolume) * 100);
                    const sH = Math.round((d.sent / maxVolume) * 100);
                    return (
                      <div key={d.day} className="flex flex-1 flex-col items-center gap-0.5">
                        <div className="flex h-24 w-full items-end justify-center gap-0.5">
                          <div className="w-1/2 rounded-t bg-primary/70" style={{ height: `${rH}%` }} title={`${d.received} received`} />
                          <div className="w-1/2 rounded-t bg-accent/70" style={{ height: `${sH}%` }} title={`${d.sent} sent`} />
                        </div>
                        <span className="text-[8px] text-muted-foreground">{d.day.slice(8, 10)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/70" /> Received</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-accent/70" /> Sent</span>
                </div>
              </div>

              {/* Top correspondents + intent distribution */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-card p-4 shadow-soft">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Top correspondents
                  </h3>
                  <ul className="space-y-2">
                    {(data?.topCorrespondents ?? []).slice(0, 6).map((c, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className={cn("text-[10px] font-semibold text-cream", getAvatarColor(c.name))}>
                            {getInitials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate text-sm text-foreground/90">{c.name}</span>
                        <span className="text-xs font-medium text-muted-foreground">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-border/60 bg-card p-4 shadow-soft">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Intent distribution
                  </h3>
                  <ul className="space-y-1.5">
                    {intentEntries.slice(0, 8).map(([intent, count]) => (
                      <li key={intent} className="flex items-center justify-between text-xs">
                        <span className="text-foreground/80">{INTENT_LABELS[intent as Intent] ?? intent}</span>
                        <span className="font-medium text-foreground">{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 shadow-soft">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("h-3 w-3", color)} />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
