"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Mail,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fetchHandleEmail, type HandleResult } from "@/hooks/use-mail";
import { INTENT_LABELS, INTENT_COLORS, type Intent } from "@/lib/email-utils";
import { toast } from "@/hooks/use-toast";

interface HandlePanelProps {
  emailId: string;
  onUseReply: (text: string) => void;
}

const RISK_STYLES = {
  low: "text-emerald-600 dark:text-emerald-300",
  medium: "text-amber-600 dark:text-amber-300",
  high: "text-rose-600 dark:text-rose-300",
};

export function HandleEmailPanel({ emailId, onUseReply }: HandlePanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HandleResult | null>(null);

  async function run() {
    setOpen(true);
    setLoading(true);
    setResult(null);
    try {
      const r = await fetchHandleEmail(emailId);
      setResult(r);
    } catch {
      toast({ title: "Could not analyze", variant: "destructive" });
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
        className="btn-premium h-8 gap-1.5 rounded-full border-transparent bg-gradient-gold px-3 text-charcoal font-medium hover:opacity-90"
        onClick={run}
        title="HANDLE — AI analyzes this email and proposes a workflow"
      >
        <Sparkles className="h-3.5 w-3.5" /> Handle
      </Button>
    );
  }

  return (
    <div className="card-premium rounded-xl border border-accent/30 bg-gradient-to-br from-primary/5 to-gold/5 p-4 shadow-glass animate-spring-in stagger-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="font-display flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-gold" />
          Handle — proposed workflow
        </div>
        <button
          onClick={() => setOpen(false)}
          className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing email…
        </div>
      ) : result ? (
        <HandleResultView result={result} onUseReply={onUseReply} />
      ) : null}
    </div>
  );
}

function HandleResultView({
  result,
  onUseReply,
}: {
  result: HandleResult;
  onUseReply: (text: string) => void;
}) {
  const intent = (result.intent as Intent) ?? "FYI";
  const intentClass = INTENT_COLORS[intent] ?? INTENT_COLORS.FYI;

  return (
    <div className="space-y-4 text-sm">
      {/* Intent + risk + confidence */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            intentClass
          )}
        >
          <Sparkles className="h-3 w-3" />
          {INTENT_LABELS[intent] ?? intent}
        </span>
        <span className={cn("inline-flex items-center gap-1 text-[11px]", RISK_STYLES[result.risk])}>
          <ShieldCheck className="h-3 w-3" />
          {result.risk} risk
        </span>
        <span className="text-[11px] text-muted-foreground">
          confidence {Math.round(result.confidence * 100)}%
        </span>
      </div>

      {/* Summary */}
      {result.summary ? (
        <div>
          <SectionTitle icon={FileText} label="Summary" />
          <p className="text-sm leading-relaxed text-foreground/80">{result.summary}</p>
        </div>
      ) : null}

      {/* Key info */}
      {result.keyInfo && result.keyInfo.length > 0 ? (
        <div>
          <SectionTitle icon={CheckCircle2} label="Key info" />
          <dl className="space-y-1">
            {result.keyInfo.map((k, i) => (
              <div key={i} className="rounded-lg bg-background/60 p-2">
                <div className="flex gap-2">
                  <dt className="font-medium text-foreground">{k.label}:</dt>
                  <dd className="text-foreground/90">{k.value}</dd>
                </div>
                {k.source && (
                  <p className="mt-1 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground">
                    “{k.source}”
                  </p>
                )}
              </div>
            ))}
          </dl>
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

      {/* Suggested reply */}
      {result.suggestedReply ? (
        <div>
          <SectionTitle icon={Mail} label="Suggested reply (draft — review before sending)" />
          <div className="rounded-lg border border-border/40 bg-muted/40 p-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {result.suggestedReply}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="btn-premium mt-2 h-7 gap-1 rounded-full border-transparent bg-gradient-gold px-3 text-xs text-charcoal font-medium hover:opacity-90"
            onClick={() => onUseReply(result.suggestedReply)}
          >
            Use as reply
          </Button>
        </div>
      ) : null}

      {/* Follow-up */}
      {result.followUp ? (
        <div>
          <SectionTitle icon={AlertTriangle} label="Suggested follow-up" />
          <p className="text-foreground/90">{result.followUp}</p>
        </div>
      ) : null}

      {/* Provenance */}
      <div className="border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <span className="font-medium">Source:</span>{" "}
        {result.provenance.subject} · from {result.provenance.from}
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
