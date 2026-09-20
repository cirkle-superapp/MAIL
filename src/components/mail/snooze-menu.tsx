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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState<string>("");

  function applyCustom() {
    if (!customDate) return;
    const iso = new Date(customDate).toISOString();
    onSnooze(iso);
    setCustomOpen(false);
    setCustomDate("");
  }

  // Default the custom date input to tomorrow 9am
  function openCustom() {
    const d = SNOOZE_PRESETS[1].when(new Date()); // Tomorrow 9am
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setCustomDate(local);
    setCustomOpen(true);
  }

  return (
    <>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              openCustom();
              setOpen(false);
            }}
            className="text-primary focus:text-primary"
          >
            Pick date & time…
          </DropdownMenuItem>
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

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Snooze until
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="snooze-datetime">Date & time</Label>
              <Input
                id="snooze-datetime"
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            </div>
            {customDate && (
              <p className="text-xs text-muted-foreground">
                Returns to your inbox on{" "}
                {formatSnoozeUntil(new Date(customDate).toISOString())}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCustomOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={applyCustom}
              disabled={!customDate}
            >
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
