"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Email, Label, Folder, Contact } from "@/lib/types";
import type { MailState } from "@/store/mail-store";
import { useMailStore } from "@/store/mail-store";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function buildListQuery(state: Pick<MailState, "folder" | "selectedLabel" | "searchQuery">): string {
  const params = new URLSearchParams();
  if (state.searchQuery) {
    params.set("q", state.searchQuery);
    return `/api/emails?${params.toString()}`;
  }
  if (state.folder === "STARRED") params.set("starred", "true");
  else if (state.folder === "IMPORTANT") params.set("important", "true");
  else if (state.folder === "SNOOZED") params.set("snoozed", "true");
  else params.set("folder", state.folder);
  if (state.selectedLabel) params.set("label", state.selectedLabel);
  return `/api/emails?${params.toString()}`;
}

export function useEmailList() {
  const folder = useMailStore((s) => s.folder);
  const selectedLabel = useMailStore((s) => s.selectedLabel);
  const searchQuery = useMailStore((s) => s.searchQuery);
  const url = buildListQuery({ folder, selectedLabel, searchQuery });
  return useQuery({
    queryKey: ["emails", url],
    queryFn: () => fetchJson<{ emails: Email[] }>(url),
    staleTime: 5000,
  });
}

export function useEmailDetail(id: string | null) {
  return useQuery({
    queryKey: ["email", id],
    queryFn: () => {
      if (!id) return null;
      return fetchJson<{ email: Email; thread: Email[] }>(
        `/api/emails/${id}`
      );
    },
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useLabels() {
  return useQuery({
    queryKey: ["labels"],
    queryFn: () => fetchJson<{ labels: Label[] }>("/api/labels"),
    staleTime: 30000,
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: () => fetchJson<{ contacts: Contact[] }>("/api/contacts"),
    staleTime: 30000,
  });
}

export interface EmailStats {
  counts: Record<string, number>;
  unreadByFolder: Record<string, number>;
  labelCounts: Record<string, number>;
}

export function useEmailStats() {
  return useQuery({
    queryKey: ["email-stats"],
    queryFn: () => fetchJson<EmailStats>("/api/emails/stats"),
    staleTime: 5000,
  });
}

export function useInvalidateMail() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["emails"] });
    qc.invalidateQueries({ queryKey: ["email"] });
    qc.invalidateQueries({ queryKey: ["email-stats"] });
  };
}

export type { Folder };
