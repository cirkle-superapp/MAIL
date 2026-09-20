"use client";

import { Tag as TagIcon, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLabels } from "@/hooks/use-mail";
import { LABEL_COLORS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LabelMenuProps {
  /** Labels currently applied (checked). For a single email: its labels.
   *  For bulk: labels present on ALL selected emails. */
  activeLabels?: Set<string>;
  onToggle: (label: string, checked: boolean) => void;
  size?: "icon" | "sm";
  variant?: "ghost" | "outline";
  className?: string;
}

export function LabelMenu({
  activeLabels,
  onToggle,
  size = "icon",
  variant = "ghost",
  className,
}: LabelMenuProps) {
  const { data } = useLabels();
  const labels = data?.labels ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("text-muted-foreground hover:text-foreground", className)}
          aria-label="Labels"
          title="Labels"
        >
          <TagIcon
            className={size === "icon" ? "h-[1.05rem] w-[1.05rem]" : "h-3.5 w-3.5"}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Labels
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {labels.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No labels yet.
            <br />
            Create one from the sidebar.
          </div>
        ) : (
          labels.map((label) => {
            const checked = activeLabels?.has(label.name) ?? false;
            const colorClass = LABEL_COLORS[label.color] ?? LABEL_COLORS.gray;
            return (
              <DropdownMenuItem
                key={label.id}
                onClick={() => onToggle(label.name, !checked)}
                className="flex items-center gap-2"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40"
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className={cn("h-2 w-2 rounded-full", colorClass)} />
                <span className="flex-1 truncate">{label.name}</span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
