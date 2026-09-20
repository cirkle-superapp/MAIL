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
  const f = state.folder;
  // COMMITMENTS and PEOPLE are not flat email lists — they have dedicated
  // views. Return a harmless query so useEmailList doesn't error; the
  // EmailList component renders the dedicated view instead.
  if (f === "COMMITMENTS" || f === "PEOPLE") {
    return `/api/emails?folder=ARCHIVE&__special=1`;
  }
  if (f === "STARRED") params.set("starred", "true");
  else if (f === "IMPORTANT") params.set("important", "true");
  else if (f === "SNOOZED") params.set("snoozed", "true");
  else if (f === "NOW") params.set("view", "now");
  else if (f === "REPLY") params.set("view", "reply");
  else if (f === "WAITING") params.set("view", "waiting");
  else if (f === "RECEIPTS") params.set("view", "receipts");
  else if (f === "SUBSCRIPTIONS") params.set("view", "subscriptions");
  else params.set("folder", f);
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

export interface CommitmentItem {
  id: string;
  emailId: string;
  threadId: string;
  subject: string;
  who: string;
  action: string;
  due: string | null;
  direction: "outgoing" | "incoming";
  source: string;
  date: string;
  fromName: string;
}

export function useCommitments() {
  return useQuery({
    queryKey: ["commitments"],
    queryFn: () =>
      fetchJson<{ commitments: CommitmentItem[] }>("/api/commitments"),
    staleTime: 10000,
  });
}

// HANDLE EMAIL: source-grounded AI analysis of a single email
export interface HandleResult {
  intent: string;
  summary: string;
  keyInfo: Array<{ label: string; value: string; source: string }>;
  commitments: Array<{ who: string; action: string; due: string | null; source: string }>;
  openQuestions: string[];
  suggestedReply: string;
  followUp: string | null;
  risk: "low" | "medium" | "high";
  confidence: number;
  provenance: { emailId: string; subject: string; from: string; date: string };
  signals?: unknown;
}

export async function fetchHandleEmail(id: string): Promise<HandleResult> {
  const res = await fetch("/api/ai/handle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error("handle failed");
  return res.json();
}

export async function fetchInterpretCommand(command: string): Promise<{
  action: string;
  query?: string;
  view?: string;
  answer?: string;
  confidence: number;
  source: string;
}> {
  const res = await fetch("/api/ai/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  });
  if (!res.ok) throw new Error("command failed");
  return res.json();
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
