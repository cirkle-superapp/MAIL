"use client";

import { useState, useEffect } from "react";
import { Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useMailStore } from "@/store/mail-store";

interface QuickReply {
  text: string;
  tone: string;
}

const TONE_STYLES: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-300",
  neutral: "text-foreground/80",
  declining: "text-rose-700 dark:text-rose-300",
  question: "text-amber-700 dark:text-amber-300",
};

const STAGGER_CLASSES = ["stagger-1", "stagger-2", "stagger-3"] as const;

interface QuickReplyChipsProps {
  emailId: string;
  emailSubject: string;
}

export function QuickReplyChips({ emailId, emailSubject }: QuickReplyChipsProps) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const openReply = useMailStore((s) => s.openReply);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emailId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.replies?.length > 0) {
          setReplies(data.replies.slice(0, 3));
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [emailId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating quick replies…
      </div>
    );
  }

  if (replies.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3 w-3 text-accent" /> Quick reply
      </span>
      {replies.map((r, i) => (
        <button
          key={i}
          onClick={() => {
            navigator.clipboard?.writeText(r.text).catch(() => {});
            openReply(emailId);
            toast({
              title: "Reply drafted",
              description: `"${r.text}" copied — paste into your reply.`,
              duration: 2500,
            });
          }}
          className={cn(
            "btn-premium glass animate-spring-in rounded-full px-4 py-2 text-sm font-medium shadow-soft transition-all duration-200 hover:-translate-y-px hover:shadow-premium hover:ring-1 hover:ring-gold/30",
            STAGGER_CLASSES[i % STAGGER_CLASSES.length],
            TONE_STYLES[r.tone] ?? TONE_STYLES.neutral
          )}
        >
          {r.text}
        </button>
      ))}
    </div>
  );
}
