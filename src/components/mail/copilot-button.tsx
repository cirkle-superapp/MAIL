"use client";

import { useState } from "react";
import {
  Sparkles,
  Briefcase,
  Scissors,
  Heart,
  Zap,
  Target,
  SpellCheck,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface CopilotButtonProps {
  getText: () => string;
  setText: (html: string) => void;
}

const ACTIONS = [
  { key: "professional", label: "Make professional", icon: Briefcase },
  { key: "concise", label: "Make concise", icon: Scissors },
  { key: "friendly", label: "Make friendly", icon: Heart },
  { key: "urgent", label: "Add urgency", icon: Zap },
  { key: "add-call-to-action", label: "Add call-to-action", icon: Target },
  { key: "fix-grammar", label: "Fix grammar", icon: SpellCheck },
];

export function CopilotButton({ getText, setText }: CopilotButtonProps) {
  const [loading, setLoading] = useState(false);

  async function improve(instruction: string) {
    const currentText = getText();
    if (!currentText.trim()) {
      toast({ title: "Write something first", variant: "destructive" });
      return;
    }
    setLoading(true);
    toast({ title: "Improving…", duration: 1000 });
    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentText, instruction }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      if (data.text) {
        // Convert plain text to HTML (the rich text editor is contentEditable)
        const html = data.text
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean)
          .join("<br/>");
        setText(html);
        toast({
          title: "Draft improved",
          description: `${Math.round((data.confidence ?? 0.7) * 100)}% confidence`,
          duration: 2000,
        });
      }
    } catch {
      toast({ title: "Could not improve", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          className="btn-premium h-8 gap-1 rounded-full bg-gradient-gold px-3 text-xs font-medium text-charcoal shadow-glow transition-all duration-200 hover:scale-105 hover:shadow-glow disabled:opacity-70"
          title="AI Composition Copilot"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Copilot
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-strong min-w-[12rem] rounded-2xl border border-border/40 p-1 shadow-premium">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wide text-gold">
          AI Composition Copilot
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <DropdownMenuItem
              key={a.key}
              onClick={() => improve(a.key)}
              className="flex items-center gap-2"
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {a.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
