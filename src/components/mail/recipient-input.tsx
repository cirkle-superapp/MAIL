"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useContacts } from "@/hooks/use-mail";
import { getInitials, getAvatarColor } from "@/lib/email-utils";
import type { Contact } from "@/lib/types";

interface RecipientInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  showToggle?: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
}

export function RecipientInput({
  value,
  onChange,
  placeholder = "To",
  ariaLabel = "Recipients",
  className,
  showToggle,
  onToggle,
  toggleLabel = "Cc/Bcc",
}: RecipientInputProps) {
  const { data } = useContacts();
  const contacts: Contact[] = data?.contacts ?? [];
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const lastToken = useMemo(() => {
    const parts = value.split(/[,\s]+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }, [value]);

  const suggestions = useMemo(() => {
    const q = lastToken.toLowerCase();
    if (!q) return contacts.slice(0, 6);
    return contacts
      .filter(
        (c) =>
          c.email.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [contacts, lastToken]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function applySuggestion(c: Contact) {
    // Replace the last partial token with the chosen email
    const parts = value.split(/([,\s]+)/).filter((p) => p.trim() !== "");
    if (parts.length) parts[parts.length - 1] = c.email;
    else parts.push(c.email);
    const next = parts.join(", ") + ", ";
    onChange(next);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative flex items-center gap-2", className)}>
      <span className="font-display w-10 flex-shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {placeholder}
      </span>
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-9 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="btn-premium glass ml-2 flex flex-shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground shadow-soft transition-colors hover:text-foreground"
        >
          {toggleLabel} <ChevronDown className="h-3 w-3" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="glass-strong absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl p-1 shadow-premium">
          {suggestions.map((c, i) => (
            <button
              key={c.email}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => applySuggestion(c)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                highlight === i ? "bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[10px] font-semibold text-cream shadow-soft",
                  getAvatarColor(c.email)
                )}
              >
                {getInitials(c.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-foreground">
                  {c.name}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {c.email}
                </div>
              </div>
              {highlight === i && (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-gold" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
