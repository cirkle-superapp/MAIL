import { create } from "zustand";
import type { Folder } from "@/lib/types";

export type SpecialView = "STARRED" | "IMPORTANT" | "SNOOZED";

export interface MailState {
  folder: Folder | SpecialView;
  selectedLabel: string | null;
  searchQuery: string;
  selectedEmailId: string | null;
  composeOpen: boolean;
  composeReplyTo: string | null;
  searchInput: string;
  // actions
  setFolder: (f: Folder | SpecialView) => void;
  setSelectedLabel: (label: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchInput: (q: string) => void;
  setSelectedEmailId: (id: string | null) => void;
  openCompose: (replyTo?: string) => void;
  closeCompose: () => void;
}

export const useMailStore = create<MailState>((set) => ({
  folder: "INBOX",
  selectedLabel: null,
  searchQuery: "",
  selectedEmailId: null,
  composeOpen: false,
  composeReplyTo: null,
  searchInput: "",
  setFolder: (f) =>
    set((s) => ({
      folder: f,
      selectedLabel: null,
      selectedEmailId: s.searchQuery ? null : s.selectedEmailId,
    })),
  setSelectedLabel: (label) =>
    set({ selectedLabel: label, folder: "INBOX", selectedEmailId: null }),
  setSearchQuery: (q) => set({ searchQuery: q, selectedEmailId: null }),
  setSearchInput: (q) => set({ searchInput: q }),
  setSelectedEmailId: (id) => set({ selectedEmailId: id }),
  openCompose: (replyTo) =>
    set({ composeOpen: true, composeReplyTo: replyTo ?? null }),
  closeCompose: () => set({ composeOpen: false, composeReplyTo: null }),
}));
