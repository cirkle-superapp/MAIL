import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Density = "comfortable" | "compact";
export type InboxTabs = "default" | "categories";

export interface SettingsState {
  density: Density;
  signature: string;
  sendAndArchive: boolean;
  inboxTabs: InboxTabs;
  setDensity: (d: Density) => void;
  setSignature: (s: string) => void;
  setSendAndArchive: (v: boolean) => void;
  setInboxTabs: (t: InboxTabs) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      density: "comfortable",
      signature: "",
      sendAndArchive: true,
      inboxTabs: "categories",
      setDensity: (density) => set({ density }),
      setSignature: (signature) => set({ signature }),
      setSendAndArchive: (sendAndArchive) => set({ sendAndArchive }),
      setInboxTabs: (inboxTabs) => set({ inboxTabs }),
    }),
    { name: "cirkle-mail-settings" }
  )
);
