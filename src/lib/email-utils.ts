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

/**
 * Sanitize an HTML email body before rendering with dangerouslySetInnerHTML.
 * Strips <script>/<style>/<iframe>/<object>/<embed>/<form>/<meta>/<link>/<base>,
 * removes on* event-handler attributes, and neutralizes javascript: URLs in
 * href/src. Runs in the browser via DOMParser; falls back to the raw input
 * (already trusted seed data) if DOMParser is unavailable (SSR).
 */
const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "meta",
  "link",
  "base",
  "applet",
];

export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  // Browser path: DOMParser (more precise).
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const tag of DANGEROUS_TAGS) {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    }
    doc.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || "").trim().toLowerCase();
        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
        } else if (
          (name === "href" || name === "src" || name === "xlink:href") &&
          (val.startsWith("javascript:") ||
            val.startsWith("vbscript:") ||
            val.startsWith("data:text/html"))
        ) {
          el.setAttribute(attr.name, "#");
        }
      }
    });
    return doc.body ? doc.body.innerHTML : html;
  }
  // SSR / test path (no DOMParser): regex fallback that blocks the common XSS
  // vectors. Less precise than DOM parsing but prevents script injection when
  // rendering server-side (the DOM path runs again on the client).
  let out = html;
  // remove dangerous tags (and their contents where applicable)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<(iframe|object|embed|form|meta|link|base|applet)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  out = out.replace(/<(iframe|object|embed|form|meta|link|base|applet)\b[^>]*\/?>/gi, "");
  // strip on* event handlers
  out = out.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // neutralize javascript:/vbscript:/data:text/html in href/src
  out = out.replace(
    /(href|src|xlink:href)\s*=\s*"(javascript:|vbscript:|data:text\/html)[^"]*"/gi,
    '$1="#"'
  );
  out = out.replace(
    /(href|src|xlink:href)\s*=\s*'(javascript:|vbscript:|data:text\/html)[^']*'/gi,
    "$1='#'"
  );
  return out;
}

export type Category = "PRIMARY" | "PROMOTIONS" | "SOCIAL" | "UPDATES";

const PROMO_RE =
  /(newsletter|digest|weekly|substack|promo|promotion|deals?|offers?|sale|coupon|unsubscribe|mailing)/i;
const SOCIAL_RE =
  /(github|goodreads|facebook|twitter|x\.com|linkedin|instagram|tiktok|snapchat|discord|slack|notifications?@)/i;
const UPDATES_RE =
  /(invoice|receipt|billing|payment|order|shipping|delivery|tracking|statement|bank|tax|receipt|confirm|verification|security|alert|reminder|no-?reply)/i;

/**
 * Derive a Gmail-style inbox category for an email using labels + sender +
 * subject heuristics. Used by the inbox tabs UI (no schema field needed).
 */
export function deriveCategory(
  email:
    | {
        labels?: string | null;
        fromEmail?: string;
        fromName?: string;
        subject?: string;
        snippet?: string;
      }
    | undefined
): Category {
  if (!email) return "PRIMARY";
  const labels = (email.labels ?? "").toLowerCase();
  const from = `${email.fromEmail ?? ""} ${email.fromName ?? ""}`.toLowerCase();
  const subj = `${email.subject ?? ""} ${email.snippet ?? ""}`.toLowerCase();

  // Label-based first (explicit user assignment wins)
  if (labels.includes("newsletter")) return "PROMOTIONS";
  if (labels.includes("social")) return "SOCIAL";
  if (labels.includes("finance")) return "UPDATES";

  // Sender/subject heuristics
  if (PROMO_RE.test(from) || PROMO_RE.test(subj)) return "PROMOTIONS";
  if (SOCIAL_RE.test(from) || SOCIAL_RE.test(subj)) return "SOCIAL";
  if (UPDATES_RE.test(from) || UPDATES_RE.test(subj)) return "UPDATES";

  return "PRIMARY";
}

// ─── Communication OS: intent classification + entity extraction ─────────────

export type Intent =
  | "REQUIRES_REPLY"
  | "FYI"
  | "INVOICE"
  | "RECEIPT"
  | "ORDER"
  | "SHIPMENT"
  | "COMMITMENT"
  | "MEETING"
  | "NEWSLETTER"
  | "PROMOTION"
  | "NOTIFICATION"
  | "SECURITY_ALERT"
  | "SOCIAL"
  | "PERSONAL"
  | "BUSINESS";

export const INTENT_LABELS: Record<Intent, string> = {
  REQUIRES_REPLY: "Needs reply",
  FYI: "FYI",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  ORDER: "Order",
  SHIPMENT: "Shipment",
  COMMITMENT: "Commitment",
  MEETING: "Meeting",
  NEWSLETTER: "Newsletter",
  PROMOTION: "Promotion",
  NOTIFICATION: "Notification",
  SECURITY_ALERT: "Security",
  SOCIAL: "Social",
  PERSONAL: "Personal",
  BUSINESS: "Business",
};

export const INTENT_COLORS: Record<Intent, string> = {
  REQUIRES_REPLY: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  FYI: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
  INVOICE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  RECEIPT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  ORDER: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  SHIPMENT: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  COMMITMENT: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  MEETING: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  NEWSLETTER: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  PROMOTION: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
  NOTIFICATION: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  SECURITY_ALERT: "bg-red-500/15 text-red-700 dark:text-red-300",
  SOCIAL: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  PERSONAL: "bg-green-500/15 text-green-700 dark:text-green-300",
  BUSINESS: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
};

const QUESTION_RE =
  /\b(can you|could you|would you|will you|please\s+\w+|what|when|where|who|why|how|are you|do you|did you|have you|is there|let me know|please confirm|please advise|please review|please send|please share|looking forward|your thoughts|feedback\?)\b/i;
const COMMITMENT_RE =
  /\b(i['']?ll|i will|we['''']?ll|we will|i['''']?m going to|i plan to|i['''']?m planning to|expect to|aim to|schedule to|promise|commit(?:ted)?|deliver(?:ing)? by|send (?:you|it|the) (?:by|on|before|tomorrow)|follow up)\b/i;
const INCOMING_COMMITMENT_RE =
  /\b(we will|we['''']?ll|expect to|aim to|will deliver|will send|will provide|will share|will follow up|will have .* ready|by (?:monday|tuesday|wednesday|thursday|friday|next week|tomorrow|eod|end of (?:day|week)))\b/i;
const INVOICE_RE =
  /\b(invoice|amount due|payment due|balance due|total:?|subtotal|tax|net total|pay (?:by|before|now)|billing statement|past due)\b/i;
const RECEIPT_RE = /\b(receipt|payment received|thank you for your (?:payment|purchase|order)|order confirmed|charged|transaction id)\b/i;
const ORDER_RE = /\b(order (?:#|number|id|confirmation)|your order|order placed|order status|tracking (?:number|#))\b/i;
const SHIPMENT_RE =
  /\b(shipped|shipment|delivery|tracking|carrier|estimated delivery|out for delivery|package|ups|fedex|dhl|usps)\b/i;
const MEETING_RE =
  /\b((?:can|could|would) (?:we|you) meet|schedule a (?:meeting|call)|available (?:on|tomorrow|next)|free (?:on|tomorrow|next)|let['''']?s meet|book (?:a|the) (?:room|call)|calendar invite|zoom|google meet|teams meeting|appointment)\b/i;
const SECURITY_RE =
  /\b(password reset|verify your (?:identity|account|email)|security alert|suspicious (?:activity|login)|2fa|two-factor|account (?:compromised|locked|suspended)|verify it['''']?s you|unusual sign-in|recovery code)\b/i;
const NEWSLETTER_RE = /\b(newsletter|this week in|weekly digest|unsubscribe|view in browser|forward to a friend)\b/i;
const PROMO_RE2 = /\b(\d+% off|sale ends|limited time|free shipping|deal of the day|shop now|order today|save (?:up to )?\d+%?)\b/i;

/**
 * Deterministic intent classifier (rules-based, no AI).
 * Returns the primary intent for an email from its subject/body/snippet/sender.
 * Used to populate the `intent` field and drive the ComOS views.
 */
export function classifyIntent(
  email:
    | {
        fromEmail?: string;
        fromName?: string;
        subject?: string;
        body?: string;
        snippet?: string;
        labels?: string | null;
        isStarred?: boolean;
      }
    | undefined
): { intent: Intent; confidence: number; reason: string } {
  if (!email) return { intent: "FYI", confidence: 0.4, reason: "no data" };
  const text = `${email.subject ?? ""} ${email.snippet ?? ""} ${email.body ?? ""}`.toLowerCase();
  const from = `${email.fromEmail ?? ""} ${email.fromName ?? ""}`.toLowerCase();
  const labels = (email.labels ?? "").toLowerCase();
  const isSent = (email.fromEmail ?? "").toLowerCase() === "you@cirkle.mail";

  // Security alert — high priority
  if (SECURITY_RE.test(text)) {
    return { intent: "SECURITY_ALERT", confidence: 0.85, reason: "security keywords detected" };
  }
  // Newsletter / promotion
  if (labels.includes("newsletter") || NEWSLETTER_RE.test(text)) {
    return { intent: "NEWSLETTER", confidence: 0.8, reason: "newsletter markers" };
  }
  if (PROMO_RE2.test(text) || PROMO_RE.test(from)) {
    return { intent: "PROMOTION", confidence: 0.75, reason: "promotion markers" };
  }
  // Social
  if (labels.includes("social") || SOCIAL_RE.test(from)) {
    return { intent: "SOCIAL", confidence: 0.7, reason: "social sender" };
  }
  // Financial / orders / shipments
  if (labels.includes("finance") || INVOICE_RE.test(text)) {
    return { intent: "INVOICE", confidence: 0.8, reason: "invoice keywords" };
  }
  if (RECEIPT_RE.test(text)) {
    return { intent: "RECEIPT", confidence: 0.75, reason: "receipt keywords" };
  }
  if (SHIPMENT_RE.test(text)) {
    return { intent: "SHIPMENT", confidence: 0.75, reason: "shipment keywords" };
  }
  if (ORDER_RE.test(text)) {
    return { intent: "ORDER", confidence: 0.7, reason: "order keywords" };
  }
  // Meeting / scheduling
  if (MEETING_RE.test(text)) {
    return { intent: "MEETING", confidence: 0.7, reason: "scheduling intent" };
  }
  // Commitment (outgoing: user promised; incoming: someone promised user)
  if (COMMITMENT_RE.test(text) || INCOMING_COMMITMENT_RE.test(text)) {
    return { intent: "COMMITMENT", confidence: 0.65, reason: "commitment language detected" };
  }
  // Requires reply: a question directed at the user (not from the user)
  if (!isSent && QUESTION_RE.test(text)) {
    return { intent: "REQUIRES_REPLY", confidence: 0.6, reason: "question directed at user" };
  }
  // Personal vs business by label
  if (labels.includes("personal")) {
    return { intent: "PERSONAL", confidence: 0.55, reason: "personal label" };
  }
  if (labels.includes("work")) {
    return { intent: "BUSINESS", confidence: 0.5, reason: "work label" };
  }
  return { intent: "FYI", confidence: 0.4, reason: "no strong signal" };
}

export interface CommitmentSignal {
  action: string;
  owner: string; // "you" or a name/email
  direction: "outgoing" | "incoming";
  dueDate: string | null; // ISO if a date is mentioned
  evidence: string; // the matched sentence
  confidence: number;
}

const DUE_RE =
  /\b(by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|eod|end of (?:day|week|month)|\d{1,2}(?:st|nd|rd|th)?(?:\s+\w+)?))|(tomorrow|today|next week|this week|by friday|by monday)\b/i;

/**
 * Detect commitment signals ("I will…", "We will deliver by…", "Please send…")
 * in an email body. Returns structured signals for the Commitment engine.
 */
export function detectCommitments(
  body: string,
  fromEmail: string
): CommitmentSignal[] {
  if (!body) return [];
  const plain = body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  const sentences = plain.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
  const isUser = fromEmail.toLowerCase() === "you@cirkle.mail";
  const out: CommitmentSignal[] = [];

  for (const s of sentences) {
    const lower = s.toLowerCase();
    let direction: "outgoing" | "incoming" | null = null;
    if (COMMITMENT_RE.test(lower)) direction = isUser ? "outgoing" : "incoming";
    else if (INCOMING_COMMITMENT_RE.test(lower) && !isUser) direction = "incoming";
    else if (/\bplease (?:send|share|provide|review|confirm|forward|sign|return)\b/.test(lower))
      direction = isUser ? "incoming" : "outgoing"; // a request TO someone
    if (!direction) continue;

    const dueMatch = lower.match(DUE_RE);
    out.push({
      action: s.trim().slice(0, 200),
      owner: isUser ? "you" : fromEmail,
      direction,
      dueDate: dueMatch ? dueMatch[0] : null,
      evidence: s.trim(),
      confidence: 0.6,
    });
  }
  // de-duplicate by evidence
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = c.evidence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Does this email look like a receipt/purchase? (Used by the Receipts view.)
 */
export function isPurchaseLike(
  email: { subject?: string; snippet?: string; body?: string; labels?: string | null } | undefined
): boolean {
  if (!email) return false;
  const text = `${email.subject ?? ""} ${email.snippet ?? ""} ${email.body ?? ""}`.toLowerCase();
  return (
    INVOICE_RE.test(text) ||
    RECEIPT_RE.test(text) ||
    ORDER_RE.test(text) ||
    SHIPMENT_RE.test(text) ||
    (email.labels ?? "").toLowerCase().includes("finance")
  );
}

/**
 * Does this look like a subscription/newsletter/promotion sender?
 */
export function isSubscriptionLike(
  email: { fromEmail?: string; fromName?: string; subject?: string; snippet?: string; labels?: string | null } | undefined
): boolean {
  if (!email) return false;
  const from = `${email.fromEmail ?? ""} ${email.fromName ?? ""}`.toLowerCase();
  const text = `${email.subject ?? ""} ${email.snippet ?? ""}`.toLowerCase();
  return (
    (email.labels ?? "").toLowerCase().includes("newsletter") ||
    NEWSLETTER_RE.test(text) ||
    PROMO_RE.test(from) ||
    PROMO_RE2.test(text)
  );
}

