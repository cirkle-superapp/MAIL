import { create } from "zustand";
import type { Folder } from "@/lib/types";

export type SpecialView = "STARRED" | "IMPORTANT" | "SNOOZED";
export type ComposeMode = "new" | "reply" | "reply-all" | "forward";

export interface MailState {
  folder: Folder | SpecialView;
  selectedLabel: string | null;
  searchQuery: string;
  selectedEmailId: string | null;
  // Compose state (unified so any caller — sidebar, detail, shortcuts —
  // can open the compose dialog in any mode)
  composeOpen: boolean;
  composeMode: ComposeMode;
  composeEmailId: string | null;
  searchInput: string;
  // actions
  setFolder: (f: Folder | SpecialView) => void;
  setSelectedLabel: (label: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchInput: (q: string) => void;
  setSelectedEmailId: (id: string | null) => void;
  openCompose: () => void;
  openReply: (emailId: string) => void;
  openReplyAll: (emailId: string) => void;
  openForward: (emailId: string) => void;
  closeCompose: () => void;
}

export const useMailStore = create<MailState>((set) => ({
  folder: "INBOX",
  selectedLabel: null,
  searchQuery: "",
  selectedEmailId: null,
  composeOpen: false,
  composeMode: "new",
  composeEmailId: null,
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
  openCompose: () =>
    set({ composeOpen: true, composeMode: "new", composeEmailId: null }),
  openReply: (emailId) =>
    set({ composeOpen: true, composeMode: "reply", composeEmailId: emailId }),
  openReplyAll: (emailId) =>
    set({ composeOpen: true, composeMode: "reply-all", composeEmailId: emailId }),
  openForward: (emailId) =>
    set({ composeOpen: true, composeMode: "forward", composeEmailId: emailId }),
  closeCompose: () =>
    set({ composeOpen: false, composeMode: "new", composeEmailId: null }),
}));
