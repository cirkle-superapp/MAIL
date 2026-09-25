"use client";

import { Paperclip, Clock, Archive, Trash2, MailOpen, Mail, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StarButton } from "@/components/mail/star-button";
import { SnoozeMenu } from "@/components/mail/snooze-menu";
import { useSettings } from "@/store/settings-store";
import type { Email } from "@/lib/types";
import {
  getInitials,
  getAvatarColor,
  formatEmailTime,
  formatSnoozeUntil,
  INTENT_LABELS,
  INTENT_COLORS,
  type Intent,
} from "@/lib/email-utils";
import { LABEL_COLORS } from "@/lib/types";

interface EmailRowProps {
  email: Email;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onToggleRead?: () => void;
  onSnooze?: (untilISO: string) => void;
  onUnsnooze?: () => void;
  index?: number;
}

const STAGGER_CLASSES = [
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
] as const;

export function EmailRow({
  email,
  selected,
  active,
  onSelect,
  onOpen,
  onArchive,
  onDelete,
  onToggleRead,
  onSnooze,
  onUnsnooze,
  index,
}: EmailRowProps) {
  const unread = !email.isRead;
  const staggerClass =
    index != null ? STAGGER_CLASSES[index % STAGGER_CLASSES.length] : "";
  const labels = email.labels
    ? email.labels.split(",").map((l) => l.trim()).filter(Boolean)
    : [];
  const isSnoozed = !!email.snoozedUntil && new Date(email.snoozedUntil) > new Date();
  const isScheduled =
    !!email.scheduledFor && new Date(email.scheduledFor) > new Date();
  const hasHoverActions = !!(onArchive || onDelete || onToggleRead || onSnooze);
  const density = useSettings((s) => s.density);

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer items-start gap-2.5 px-3 transition-all duration-200 sm:px-4",
        density === "compact" ? "py-1.5" : "py-2.5",
        active
          ? "bg-primary/10 shadow-soft shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
          : selected
          ? "bg-muted/60"
          : unread
          ? "bg-gold/5 hover:bg-gold/10 hover:shadow-[inset_3px_0_0_0_hsl(var(--gold))]"
          : "bg-muted/30 hover:bg-muted/50 hover:shadow-[inset_3px_0_0_0_hsl(var(--gold))]",
        "animate-spring-in",
        staggerClass
      )}
    >
      <div className="flex items-center gap-1 pt-1">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select email from ${email.fromName}`}
          className="border-muted-foreground/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
        />
        <StarButton
          emailId={email.id}
          starred={email.isStarred}
          stopPropagation
        />
      </div>

      <Avatar className="mt-0.5 h-10 w-10 flex-shrink-0 ring-1 ring-border/40 transition-all duration-300 group-hover:scale-105 hover:ring-gold/40">
        <AvatarFallback
          className={cn(
            "text-xs font-semibold text-cream shadow-soft",
            getAvatarColor(email.fromEmail || email.fromName)
          )}
        >
          {getInitials(email.fromName)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold text-foreground" : "font-normal text-foreground/70"
            )}
          >
            {email.fromName}
          </span>
          <span className="relative ml-auto flex flex-shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            {/* time — hidden on hover when actions are available */}
            {isScheduled ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary",
                  hasHoverActions && "group-hover:opacity-0"
                )}
                title={`Scheduled to send ${formatSnoozeUntil(email.scheduledFor!)}`}
              >
                <CalendarClock className="h-2.5 w-2.5" />
                {formatSnoozeUntil(email.scheduledFor!).split(",")[0]}
              </span>
            ) : isSnoozed ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary",
                  hasHoverActions && "group-hover:opacity-0"
                )}
                title={`Snoozed until ${formatSnoozeUntil(email.snoozedUntil!)}`}
              >
                <Clock className="h-2.5 w-2.5" />
                {formatSnoozeUntil(email.snoozedUntil!).split(",")[0]}
              </span>
            ) : (
              <span className={cn("inline-flex items-center gap-1", hasHoverActions && "group-hover:opacity-0")}>
                {email.hasAttachment && (
                  <Paperclip className="h-3 w-3" aria-label="Attachment" />
                )}
                {formatEmailTime(email.date)}
              </span>
            )}
          </span>

          {/* Hover action buttons — glass overlay on hover */}
          {hasHoverActions && (
            <div className="glass-strong absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-full px-1 py-0.5 opacity-0 shadow-premium transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
              {onArchive && (
                <RowActionBtn label="Archive" onClick={onArchive}>
                  <Archive className="h-3.5 w-3.5" />
                </RowActionBtn>
              )}
              {onDelete && (
                <RowActionBtn label="Delete" onClick={onDelete} danger>
                  <Trash2 className="h-3.5 w-3.5" />
                </RowActionBtn>
              )}
              {onToggleRead && (
                <RowActionBtn
                  label={unread ? "Mark as read" : "Mark as unread"}
                  onClick={onToggleRead}
                >
                  {unread ? (
                    <MailOpen className="h-3.5 w-3.5" />
                  ) : (
                    <Mail className="h-3.5 w-3.5" />
                  )}
                </RowActionBtn>
              )}
              {onSnooze && (
                <SnoozeMenu
                  onSnooze={onSnooze}
                  onUnsnooze={onUnsnooze}
                  isSnoozed={isSnoozed}
                  snoozedUntil={email.snoozedUntil}
                  size="sm"
                />
              )}
            </div>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {email.isImportant && (
            <span
              className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent animate-pulse-glow"
              aria-label="Important"
            />
          )}
          {email.intent && INTENT_LABELS[email.intent as Intent] ? (
            <span
              className={cn(
                "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-soft",
                INTENT_COLORS[email.intent as Intent] ?? INTENT_COLORS.FYI
              )}
            >
              {INTENT_LABELS[email.intent as Intent]}
            </span>
          ) : null}
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-medium text-foreground" : "text-foreground/70"
            )}
          >
            {email.subject || "(no subject)"}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            — {email.snippet}
          </span>
        </div>
        {labels.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {labels.slice(0, 2).map((label) => (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-soft",
                  labelChipClass(label)
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    labelDotClass(label)
                  )}
                />
                {label}
              </span>
            ))}
            {labels.length > 2 && (
              <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                +{labels.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function RowActionBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "btn-premium flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:scale-110 hover:bg-muted hover:text-foreground",
        danger && "hover:text-destructive"
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

// Map label name -> color classes; uses a hash for stable colors
function labelColorKey(labelName: string): string {
  const palette = Object.keys(LABEL_COLORS);
  let hash = 0;
  for (let i = 0; i < labelName.length; i++) {
    hash = labelName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function labelChipClass(labelName: string): string {
  const key = labelColorKey(labelName);
  const map: Record<string, string> = {
    gray: "bg-gray-500/10 text-gray-600 dark:text-gray-300",
    red: "bg-red-500/10 text-red-600 dark:text-red-300",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    green: "bg-green-500/10 text-green-600 dark:text-green-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    teal: "bg-teal-500/10 text-teal-600 dark:text-teal-300",
    pink: "bg-pink-500/10 text-pink-600 dark:text-pink-300",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  };
  return map[key] ?? map.gray;
}

function labelDotClass(labelName: string): string {
  return LABEL_COLORS[labelColorKey(labelName)] ?? LABEL_COLORS.gray;
}
