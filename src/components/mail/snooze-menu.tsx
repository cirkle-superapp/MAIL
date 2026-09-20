"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SNOOZE_PRESETS, formatSnoozeUntil } from "@/lib/email-utils";
import { cn } from "@/lib/utils";

interface SnoozeMenuProps {
  onSnooze: (untilISO: string) => void;
  onUnsnooze?: () => void;
  isSnoozed?: boolean;
  snoozedUntil?: string | null;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
  label?: string;
  className?: string;
}

export function SnoozeMenu({
  onSnooze,
  onUnsnooze,
  isSnoozed,
  snoozedUntil,
  variant = "ghost",
  size = "icon",
  label,
  className,
}: SnoozeMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            isSnoozed && "text-primary",
            className
          )}
          aria-label="Snooze"
          title="Snooze"
        >
          <Clock
            className={
              size === "icon" ? "h-[1.05rem] w-[1.05rem]" : "h-3.5 w-3.5"
            }
          />
          {label && <span className="ml-1.5">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Snooze until…
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SNOOZE_PRESETS.map((preset) => {
          const target = preset.when(new Date());
          return (
            <DropdownMenuItem
              key={preset.key}
              onClick={() => {
                onSnooze(target.toISOString());
                setOpen(false);
              }}
              className="flex items-center justify-between gap-4"
            >
              <span>{preset.label}</span>
              <span className="text-[11px] text-muted-foreground">
                {formatSnoozeUntil(target.toISOString())}
              </span>
            </DropdownMenuItem>
          );
        })}
        {isSnoozed && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onUnsnooze?.();
                setOpen(false);
              }}
              className="text-primary focus:text-primary"
            >
              Cancel snooze
              {snoozedUntil && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {formatSnoozeUntil(snoozedUntil)}
                </span>
              )}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
