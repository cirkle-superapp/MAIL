import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek, isThisMonth, isThisYear } from "date-fns";

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-teal-500",
  "bg-pink-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-lime-600",
  "bg-fuchsia-500",
];

export function getAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatEmailTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (isThisYear(d)) return format(d, "MMM d");
  return format(d, "MMM d, yyyy");
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatFullDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "EEEE, MMMM d, yyyy 'at' h:mm a");
}

export function makeSnippet(body: string, max = 140): string {
  const text = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

export function makeThreadId(): string {
  return "t_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function listToCsv(value?: string | null): string {
  return (value ?? "").trim();
}

export function csvToList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function linkify(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noreferrer" class="text-rose-600 hover:underline">${url}</a>`);
}

export function textToHtml(text: string): string {
  return linkify(escapeHtml(text)).replace(/\n/g, "<br/>");
}

export type SnoozePreset = {
  key: string;
  label: string;
  when: (now: Date) => Date;
};

export const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    key: "later-today",
    label: "Later today",
    when: (now) => new Date(now.getTime() + 4 * 60 * 60 * 1000),
  },
  {
    key: "tomorrow",
    label: "Tomorrow",
    when: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    key: "next-week",
    label: "Next week",
    when: (now) => {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    key: "weekend",
    label: "This weekend",
    when: (now) => {
      const d = new Date(now);
      const day = d.getDay(); // 0 Sun .. 6 Sat
      const daysToSat = (6 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + daysToSat);
      d.setHours(10, 0, 0, 0);
      return d;
    },
  },
];

export function formatSnoozeUntil(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = format(d, "h:mm a");
  if (sameDay) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return format(d, "EEE, MMM d, h:mm a");
}

export type DateBucket = "Today" | "Yesterday" | "This week" | "This month" | "Earlier";

export function dateBucket(dateStr: string | Date): DateBucket {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return "This week";
  if (isThisMonth(d)) return "This month";
  return "Earlier";
}
