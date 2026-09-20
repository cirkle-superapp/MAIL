"use client";

import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const UNDO_DELAY_MS = 8000;

/**
 * Show a toast with an "Undo" action that calls `revert` when clicked.
 * Used for archive / delete / snooze / label changes — Gmail-style.
 */
export function showUndoToast(
  title: string,
  revert: () => void | Promise<void>,
  description?: string
) {
  toast({
    title,
    description,
    duration: UNDO_DELAY_MS,
    action: (
      <ToastAction altText="Undo" onClick={() => void revert()}>
        Undo
      </ToastAction>
    ),
  });
}
