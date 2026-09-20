"use client";

import { useMemo } from "react";
import { Handshake, Users, ArrowRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommitments, useContacts, useInvalidateMail } from "@/hooks/use-mail";
import { useMailStore } from "@/store/mail-store";
import { getInitials, getAvatarColor, formatEmailTime } from "@/lib/email-utils";
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
