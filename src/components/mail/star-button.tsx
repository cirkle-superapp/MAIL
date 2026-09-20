"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";

interface StarButtonProps {
  emailId: string;
  starred: boolean;
  size?: "sm" | "md";
  className?: string;
  stopPropagation?: boolean;
}

export function StarButton({
  emailId,
  starred,
  size = "sm",
  className,
  stopPropagation = true,
}: StarButtonProps) {
  const [optimistic, setOptimistic] = useState(starred);
  const invalidate = useInvalidateMail();
  const active = optimistic;

  async function toggle(e: React.MouseEvent) {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    const next = !active;
    setOptimistic(next);
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: next }),
      });
      if (!res.ok) throw new Error("Failed to update");
      invalidate();
    } catch {
      setOptimistic(!next);
      toast({ title: "Could not update star", variant: "destructive" });
    }
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "flex items-center justify-center rounded-full transition hover:bg-muted",
        size === "sm" ? "h-7 w-7" : "h-8 w-8",
        className
      )}
      aria-label={active ? "Unstar" : "Star"}
      aria-pressed={active}
    >
      <Star
        className={cn(
          "transition-colors",
          size === "sm" ? "h-4 w-4" : "h-[1.1rem] w-[1.1rem]",
          active
            ? "fill-amber-400 text-amber-400"
            : "fill-transparent text-muted-foreground hover:text-foreground"
        )}
      />
    </button>
  );
}
