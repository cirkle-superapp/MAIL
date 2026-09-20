"use client";

import { useEffect, useRef } from "react";
import { useMailStore } from "@/store/mail-store";
import { useEmailList, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";

/**
 * Gmail-style keyboard shortcuts.
 * - j / k  : move selection down / up in the list
 * - e      : archive the selected conversation
 * - #      : move the selected conversation to Trash
 * - s      : toggle star on the selected conversation
 * - c      : compose a new message
 * - /      : focus the search bar
 * - Esc    : close compose / go back to list
 * Shortcuts are ignored while typing in inputs, textareas, or contentEditable.
 */
export function useKeyboardShortcuts(onFocusSearch: () => void) {
  const folder = useMailStore((s) => s.folder);
  const selectedLabel = useMailStore((s) => s.selectedLabel);
  const searchQuery = useMailStore((s) => s.searchQuery);
  const selectedEmailId = useMailStore((s) => s.selectedEmailId);
  const setSelectedEmailId = useMailStore((s) => s.setSelectedEmailId);
  const composeOpen = useMailStore((s) => s.composeOpen);
  const openCompose = useMailStore((s) => s.openCompose);
  const closeCompose = useMailStore((s) => s.closeCompose);
  const invalidate = useInvalidateMail();

  // Keep latest list of emails in a ref so the keydown handler always sees
  // the current data without re-binding the listener.
  const listRef = useRef<string[]>([]);
  const selectionRef = useRef<string | null>(selectedEmailId);
  const composeRef = useRef(composeOpen);
  const folderRef = useRef(folder);

  // Build the query the same way useEmailList does, to share cache
  const params = new URLSearchParams();
  if (searchQuery) params.set("q", searchQuery);
  else if (folder === "STARRED") params.set("starred", "true");
  else if (folder === "IMPORTANT") params.set("important", "true");
  else if (folder === "SNOOZED") params.set("snoozed", "true");
  else params.set("folder", folder);
  if (selectedLabel) params.set("label", selectedLabel);

  const { data } = useEmailList();
  // we still want the hook to subscribe to the list for the ref
  void data;

  useEffect(() => {
    listRef.current = (data?.emails ?? []).map((e) => e.id);
  }, [data]);

  useEffect(() => {
    selectionRef.current = selectedEmailId;
  }, [selectedEmailId]);

  useEffect(() => {
    composeRef.current = composeOpen;
  }, [composeOpen]);

  useEffect(() => {
    folderRef.current = folder;
  }, [folder]);

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      );
    }

    async function patchEmail(id: string, payload: Record<string, unknown>) {
      try {
        const res = await fetch(`/api/emails/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed");
        invalidate();
      } catch {
        toast({ title: "Action failed", variant: "destructive" });
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        // Allow Escape to blur even while typing
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const key = e.key;

      // Compose
      if (key === "c") {
        e.preventDefault();
        openCompose();
        return;
      }

      // Focus search
      if (key === "/") {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      // Escape: close compose, else go back to list
      if (key === "Escape") {
        if (composeRef.current) {
          closeCompose();
        } else if (selectionRef.current) {
          setSelectedEmailId(null);
        }
        return;
      }

      const list = listRef.current;
      const sel = selectionRef.current;

      // j/k navigation
      if (key === "j" || key === "ArrowDown") {
        if (list.length === 0) return;
        e.preventDefault();
        const idx = sel ? list.indexOf(sel) : -1;
        const next = list[Math.min(idx + 1, list.length - 1)] ?? list[0];
        if (next) setSelectedEmailId(next);
        return;
      }
      if (key === "k" || key === "ArrowUp") {
        if (list.length === 0) return;
        e.preventDefault();
        const idx = sel ? list.indexOf(sel) : 0;
        const prev = list[Math.max(idx - 1, 0)] ?? list[0];
        if (prev) setSelectedEmailId(prev);
        return;
      }

      if (!sel) return;

      if (key === "e") {
        e.preventDefault();
        patchEmail(sel, { folder: "ARCHIVE" });
        toast({ title: "Archived", duration: 1200 });
        setSelectedEmailId(null);
        return;
      }
      if (key === "#") {
        e.preventDefault();
        patchEmail(sel, { folder: "TRASH" });
        toast({ title: "Moved to Trash", duration: 1200 });
        setSelectedEmailId(null);
        return;
      }
      if (key === "s") {
        e.preventDefault();
        // optimistic: we don't have the starred state here, but the API
        // toggling needs the current value; fetch then flip
        fetch(`/api/emails/${sel}`)
          .then((r) => r.json())
          .then((d) =>
            patchEmail(sel, { isStarred: !d.email?.isStarred })
          );
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
