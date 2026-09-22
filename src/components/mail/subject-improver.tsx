"use client";

import { useState } from "react";
import { Lightbulb, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";

interface SubjectImproverProps {
  subject: string;
  onPick: (subject: string) => void;
}

export function SubjectImprover({ subject, onPick }: SubjectImproverProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  async function improve() {
    if (!subject.trim()) {
      toast({ title: "Write a subject first", variant: "destructive" });
      return;
    }
    setLoading(true);
    setOpen(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/ai/improve-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      toast({ title: "Could not suggest subjects", variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-accent hover:text-accent"
          onClick={improve}
          aria-label="Improve subject"
          title="AI subject suggestions"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lightbulb className="h-3.5 w-3.5" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-2">
        {suggestions.length > 0 ? (
          <div className="space-y-1">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
              AI Subject Suggestions
            </div>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => {
                  onPick(s);
                  setOpen(false);
                  toast({ title: "Subject updated", duration: 1000 });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground/90 transition hover:bg-muted"
              >
                <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                {s}
              </button>
            ))}
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating suggestions…
          </div>
        ) : (
          <div className="py-2 text-xs text-muted-foreground">
            No suggestions available.
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
