"use client";

import { useState } from "react";
import {
  MessagesSquare,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Clock,
  Users,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchConversation, type ConversationResult } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";

interface ConversationPanelProps {
  threadId: string;
}

export function ConversationPanel({ threadId }: ConversationPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConversationResult | null>(null);

  async function run() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const r = await fetchConversation(threadId);
      setResult(r);
    } catch {
      toast({ title: "Could not reconstruct conversation", variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
        onClick={run}
        title="Conversation Reconstruction — structured thread summary"
      >
        <MessagesSquare className="h-3.5 w-3.5" /> Conversation
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessagesSquare className="h-4 w-4 text-primary" />
          Conversation Reconstruction
        </div>
        <button
          onClick={() => setOpen(false)}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reconstructing thread…
        </div>
      ) : result ? (
        <ConversationResultView result={result} />
      ) : null}
    </div>
  );
}

function ConversationResultView({ result }: { result: ConversationResult }) {
  return (
    <div className="space-y-4 text-sm">
      {/* Status */}
      <div>
        <SectionTitle icon={MessagesSquare} label="Current status" />
        <p className="text-foreground/90">{result.status}</p>
      </div>

      {/* Participants */}
      {result.participants && result.participants.length > 0 ? (
        <div>
          <SectionTitle icon={Users} label="Participants" />
          <div className="flex flex-wrap gap-1.5">
            {result.participants.map((p, i) => (
              <span
                key={i}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Decisions */}
      {result.decisions && result.decisions.length > 0 ? (
        <div>
          <SectionTitle icon={CheckCircle2} label="Decisions" />
          <ul className="space-y-2">
            {result.decisions.map((d, i) => (
              <li key={i} className="rounded-lg bg-background/60 p-2">
                <p className="text-foreground/90">{d.text}</p>
                {d.source && (
                  <p className="mt-1 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                    “{d.source}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Open questions */}
      {result.openQuestions && result.openQuestions.length > 0 ? (
        <div>
          <SectionTitle icon={HelpCircle} label="Open questions" />
          <ul className="list-disc space-y-0.5 pl-5 text-foreground/90">
            {result.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Commitments */}
      {result.commitments && result.commitments.length > 0 ? (
        <div>
          <SectionTitle icon={Clock} label="Commitments" />
          <ul className="space-y-2">
            {result.commitments.map((c, i) => (
              <li key={i} className="rounded-lg bg-background/60 p-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{c.who}</span>
                  {c.due && (
                    <span className="rounded-full bg-accent/10 px-1.5 text-[10px] font-medium text-accent">
                      due {c.due}
                    </span>
                  )}
                </div>
                <p className="text-foreground/90">{c.action}</p>
                {c.source && (
                  <p className="mt-1 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                    “{c.source}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Next action */}
      {result.nextAction ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <SectionTitle icon={ArrowRight} label="Suggested next action" />
          <p className="text-foreground/90">{result.nextAction}</p>
        </div>
      ) : null}

      {/* Provenance */}
      <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="font-medium">Source:</span>{" "}
        {result.provenance.messageCount} message
        {result.provenance.messageCount === 1 ? "" : "s"} in thread ·{" "}
        {result.provenance.messages
          .map((m) => m.from)
          .slice(0, 3)
          .join(", ")}
        {result.provenance.messageCount > 3 ? " …" : ""}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}
