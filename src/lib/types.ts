export type Folder =
  | "INBOX"
  | "SENT"
  | "DRAFTS"
  | "SCHEDULED"
  | "TRASH"
  | "SPAM"
  | "ARCHIVE";

export interface Email {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  toEmails: string;
  ccEmails: string;
  bccEmails: string;
  subject: string;
  body: string;
  snippet: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  folder: Folder;
  labels: string;
  hasAttachment: boolean;
  attachmentName: string;
  snoozedUntil: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  name: string;
  email: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComposeEmailInput {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  attachmentName?: string;
}

export const LABEL_COLORS: Record<string, string> = {
  gray: "bg-gray-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
  purple: "bg-purple-500",
};

export const FOLDER_LABELS: Record<Folder, string> = {
  INBOX: "Inbox",
  SENT: "Sent",
  DRAFTS: "Drafts",
  SCHEDULED: "Scheduled",
  TRASH: "Trash",
  SPAM: "Spam",
  ARCHIVE: "All Mail",
};
