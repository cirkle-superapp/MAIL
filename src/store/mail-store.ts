import { create } from "zustand";
import type { Folder } from "@/lib/types";
import type { Category } from "@/lib/email-utils";

export type SpecialView =
  | "COMMAND_CENTER"
  | "STARRED"
  | "IMPORTANT"
  | "SNOOZED"
  | "NOW"
  | "REPLY"
  | "WAITING"
  | "COMMITMENTS"
  | "PEOPLE"
  | "RECEIPTS"
  | "SUBSCRIPTIONS"
  | "ANALYTICS";
export type ComposeMode = "new" | "reply" | "reply-all" | "forward" | "edit-draft";

export interface MailState {
  folder: Folder | SpecialView;
  selectedLabel: string | null;
  searchQuery: string;
  selectedEmailId: string | null;
  inboxTab: Category | "ALL";
  // Compose state (unified so any caller — sidebar, detail, shortcuts —
  // can open the compose dialog in any mode)
  composeOpen: boolean;
  composeMode: ComposeMode;
  composeEmailId: string | null;
  searchInput: string;
  triageOpen: boolean;
  // actions
  setFolder: (f: Folder | SpecialView) => void;
  setSelectedLabel: (label: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSearchInput: (q: string) => void;
  setSelectedEmailId: (id: string | null) => void;
  setInboxTab: (t: Category | "ALL") => void;
  openCompose: () => void;
  openReply: (emailId: string) => void;
  openReplyAll: (emailId: string) => void;
  openForward: (emailId: string) => void;
  openEditDraft: (emailId: string) => void;
  closeCompose: () => void;
  setTriageOpen: (v: boolean) => void;
}

export const useMailStore = create<MailState>((set) => ({
  folder: "COMMAND_CENTER",
  selectedLabel: null,
  searchQuery: "",
  selectedEmailId: null,
  inboxTab: "PRIMARY",
  composeOpen: false,
  composeMode: "new",
  composeEmailId: null,
  searchInput: "",
  triageOpen: false,
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
  setInboxTab: (t) => set({ inboxTab: t }),
  openCompose: () =>
    set({ composeOpen: true, composeMode: "new", composeEmailId: null }),
  openReply: (emailId) =>
    set({ composeOpen: true, composeMode: "reply", composeEmailId: emailId }),
  openReplyAll: (emailId) =>
    set({ composeOpen: true, composeMode: "reply-all", composeEmailId: emailId }),
  openForward: (emailId) =>
    set({ composeOpen: true, composeMode: "forward", composeEmailId: emailId }),
  openEditDraft: (emailId) =>
    set({ composeOpen: true, composeMode: "edit-draft", composeEmailId: emailId }),
  closeCompose: () =>
    set({ composeOpen: false, composeMode: "new", composeEmailId: null }),
  setTriageOpen: (v) => set({ triageOpen: v }),
}));
