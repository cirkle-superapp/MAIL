import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: ZAI | null = null;

async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Robustly extract a JSON object from an LLM response that may wrap it in
 * markdown code fences (```json … ```) or surround it with prose. Returns the
 * parsed object or null. Handles greedy `{…}` matching + nested braces.
 */
function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // 1. strip markdown code fences
  let s = raw
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  // 2. try a direct parse
  try {
    return JSON.parse(s) as T;
  } catch {
    // continue
  }
  // 3. find the first '{' and the matching last '}' (balanced, handles nesting)
  const start = s.indexOf("{");
  if (start < 0) return null;
  // scan for balanced braces from `start`
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\") {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end > start) {
    const candidate = s.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function stripHtml(html: string, max = 3000): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const FALLBACK_INTENT = {
  intent: "FYI",
  confidence: 0.4,
  reason: "AI unavailable — fell back to default",
};

/**
 * LLM-powered intent refinement. Given an email's text, ask the model to
 * classify it into one of the supported intents with a reason. Falls back to
 * a default if the AI is unavailable (graceful degradation §44).
 */
export async function aiClassify(params: {
  subject: string;
  fromName: string;
  fromEmail: string;
  body: string;
}): Promise<{ intent: string; confidence: number; reason: string } | null> {
  try {
    const zai = await getZai();
    const plain = stripHtml(params.body, 2000);
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You classify emails into exactly one intent. Respond with ONLY a JSON object: " +
            '{"intent": "...", "confidence": 0.0, "reason": "..."}. ' +
            "Valid intents: REQUIRES_REPLY, FYI, INVOICE, RECEIPT, ORDER, SHIPMENT, COMMITMENT, MEETING, NEWSLETTER, PROMOTION, NOTIFICATION, SECURITY_ALERT, SOCIAL, PERSONAL, BUSINESS. " +
            "confidence is 0-1. reason is one short sentence grounded in the email text. No prose outside the JSON.",
        },
        {
          role: "user",
          content: `From: ${params.fromName} <${params.fromEmail}>\nSubject: ${params.subject}\n\n${plain}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<{ intent?: string; confidence?: number; reason?: string }>(raw);
    if (!parsed || !parsed.intent) {
      console.error("[aiClassify] no JSON in response:", raw.slice(0, 200));
      return null;
    }
    return {
      intent: String(parsed.intent),
      confidence: Number(parsed.confidence ?? 0.5),
      reason: String(parsed.reason ?? ""),
    };
  } catch (e) {
    console.error("[aiClassify] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

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
}

/**
 * HANDLE EMAIL (§16): analyze an email and propose a complete workflow.
 * Source-grounded — every extracted fact cites the source message. Falls
 * back to deterministic analysis if the LLM is unavailable.
 */
export async function aiHandleEmail(email: {
  id: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  body: string;
  date: string;
}): Promise<HandleResult> {
  const provenance = {
    emailId: email.id,
    subject: email.subject,
    from: `${email.fromName} <${email.fromEmail}>`,
    date: email.date,
  };
  const fallback: HandleResult = {
    intent: "FYI",
    summary: `Email from ${email.fromName} about "${email.subject}".`,
    keyInfo: [],
    commitments: [],
    openQuestions: [],
    suggestedReply: "",
    followUp: null,
    risk: "low",
    confidence: 0.3,
    provenance,
  };
  try {
    const zai = await getZai();
    const plain = stripHtml(email.body, 3000);
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You analyze emails and propose a workflow. Respond with ONLY a JSON object (no markdown, no prose) with these keys:\n" +
            'intent: one of REQUIRES_REPLY|FYI|INVOICE|RECEIPT|ORDER|SHIPMENT|COMMITMENT|MEETING|NEWSLETTER|PROMOTION|NOTIFICATION|SECURITY_ALERT|SOCIAL|PERSONAL|BUSINESS\n' +
            "summary: 1-2 sentence summary of what the email is about (write a real summary, do NOT copy any example)\n" +
            "keyInfo: array of {label, value, source} — extract concrete facts (amounts, dates, names, deadlines); 'source' must quote the exact sentence from the email\n" +
            "commitments: array of {who, action, due, source} — promises to do something; 'who' is the person who promised\n" +
            "openQuestions: array of strings — unresolved questions in the email\n" +
            "suggestedReply: a short professional reply draft the user can edit\n" +
            "followUp: a suggested next step or null\n" +
            "risk: low|medium|high (low=label/archive, medium=draft/task, high=send/delete)\n" +
            "confidence: 0-1\n" +
            "provenance: {emailId, subject, from, date}\n" +
            "Rules: every 'source' field MUST be a verbatim quote from the email. Never invent dates, amounts, or names. If you have no evidence for a field, use an empty array or null. Do NOT copy the field descriptions above — write a real analysis.",
        },
        {
          role: "user",
          content: `EMAIL TO ANALYZE\nFrom: ${email.fromName} <${email.fromEmail}>\nSubject: ${email.subject}\nDate: ${email.date}\n\n${plain}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<Partial<HandleResult>>(raw);
    if (!parsed) {
      console.error("[aiHandleEmail] no JSON in response:", raw.slice(0, 300));
      return fallback;
    }
    return { ...fallback, ...parsed, provenance };
  } catch (e) {
    console.error("[aiHandleEmail] failed:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

/**
 * Natural-language command interpretation for the universal command bar (§39).
 * Returns a structured action the UI can route to. Falls back to a search
 * action when the LLM is unavailable.
 */
export async function aiInterpretCommand(
  command: string
): Promise<{
  action: "search" | "view" | "compose" | "answer";
  query?: string;
  view?: string;
  answer?: string;
  confidence: number;
} | null> {
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            'You interpret a user command for an email app. Respond with ONLY JSON: ' +
            '{"action":"search|view|compose|answer","query":"...","view":"now|reply|waiting|commitments|people|receipts|subscriptions|inbox|sent|starred","answer":"...","confidence":0.0}. ' +
            "For 'find/show X' use action=search with a keyword query. For 'show everything waiting/overdue/needs reply' use action=view with the matching view. For 'draft/reply/compose' use action=compose. For a factual question about the inbox use action=answer with a short grounded answer. No prose outside JSON, no markdown fences.",
        },
        { role: "user", content: command },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<{
      action?: string;
      query?: string;
      view?: string;
      answer?: string;
      confidence?: number;
    }>(raw);
    if (!parsed) {
      console.error("[aiInterpretCommand] no JSON:", raw.slice(0, 200));
      return null;
    }
    return {
      action: (parsed.action as "search" | "view" | "compose" | "answer") ?? "search",
      query: parsed.query,
      view: parsed.view,
      answer: parsed.answer,
      confidence: Number(parsed.confidence ?? 0.5),
    };
  } catch (e) {
    console.error("[aiInterpretCommand] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const AI_FALLBACK_INTENT = FALLBACK_INTENT;

// ─── Daily Briefing (Communication OS home) ───────────────────────────────

export interface BriefingResult {
  greeting: string;
  headline: string;
  highlights: Array<{ text: string; source: string; severity: "high" | "medium" | "low" }>;
  suggestedFirstAction: string;
  confidence: number;
}

/**
 * Daily Briefing: a short, source-grounded "here's what matters today"
 * summary for the Command Center home. Pass compact summaries of the user's
 * needs-reply / waiting / commitments / receipts items; the model writes a
 * calm, actionable briefing. Every highlight cites its source. Falls back to
 * a deterministic briefing if the LLM is unavailable.
 */
export async function aiBriefing(input: {
  needsReply: Array<{ subject: string; fromName: string; snippet: string }>;
  waiting: Array<{ subject: string; toName: string; snippet: string; ageDays: number }>;
  commitments: Array<{ action: string; who: string; due: string | null }>;
  receipts: Array<{ subject: string; fromName: string; snippet: string }>;
}): Promise<BriefingResult> {
  const count = input.needsReply.length + input.waiting.length + input.commitments.length + input.receipts.length;
  const fallback: BriefingResult = {
    greeting: "",
    headline: count === 0
      ? "You're all caught up — nothing needs your attention right now."
      : `${count} item${count === 1 ? "" : "s"} need a look: ${input.needsReply.length} to reply, ${input.waiting.length} waiting, ${input.commitments.length} commitment${input.commitments.length === 1 ? "" : "s"}, ${input.receipts.length} receipt${input.receipts.length === 1 ? "" : "s"}.`,
    highlights: [],
    suggestedFirstAction: input.needsReply[0]
      ? `Reply to ${input.needsReply[0].fromName} — "${input.needsReply[0].subject}".`
      : null,
    confidence: 0.3,
  };
  if (count === 0) return fallback;
  try {
    const zai = await getZai();
    const compact = [
      `NEEDS REPLY (${input.needsReply.length}):`,
      ...input.needsReply.slice(0, 6).map((e) => `- From ${e.fromName}: "${e.subject}" — ${e.snippet.slice(0, 100)}`),
      `WAITING ON (${input.waiting.length}):`,
      ...input.waiting.slice(0, 4).map((e) => `- To ${e.toName}: "${e.subject}" (sent ${e.ageDays}d ago) — ${e.snippet.slice(0, 80)}`),
      `COMMITMENTS (${input.commitments.length}):`,
      ...input.commitments.slice(0, 5).map((c) => `- ${c.who}: ${c.action}${c.due ? ` (due ${c.due})` : ""}`),
      `RECEIPTS (${input.receipts.length}):`,
      ...input.receipts.slice(0, 4).map((e) => `- From ${e.fromName}: "${e.subject}" — ${e.snippet.slice(0, 80)}`),
    ].join("\n");
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You write a calm, actionable daily email briefing. Respond with ONLY a JSON object (no markdown, no prose) with these keys:\n" +
            "greeting: a short time-aware greeting like 'Good morning.' (write a real one)\n" +
            "headline: ONE sentence summarizing what matters most today (write a real sentence, do NOT copy any example)\n" +
            "highlights: array of {text, source, severity} — the 2-4 most important items; 'text' is a short phrase, 'source' is the exact subject/snippet it came from, 'severity' is high|medium|low\n" +
            "suggestedFirstAction: the single most useful next step, or null\n" +
            "confidence: 0-1\n" +
            "Rules: every 'source' MUST be a verbatim quote from the data. Never invent. Do NOT copy the field descriptions — write a real briefing.",
        },
        { role: "user", content: `TODAY'S DATA\n\n${compact}` },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<Partial<BriefingResult>>(raw);
    if (!parsed) {
      console.error("[aiBriefing] no JSON:", raw.slice(0, 300));
      return fallback;
    }
    return { ...fallback, ...parsed };
  } catch (e) {
    console.error("[aiBriefing] failed:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// ─── Smart Follow-up draft ─────────────────────────────────────────────────

/**
 * Smart Follow-up: draft a polite follow-up for an email the user sent and is
 * waiting on a reply for. Source-grounded (references the original subject/ask).
 */
export async function aiFollowUp(input: {
  subject: string;
  toName: string;
  body: string;
  ageDays: number;
}): Promise<{ draft: string; confidence: number } | null> {
  try {
    const zai = await getZai();
    const plain = stripHtml(input.body, 800);
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You draft a short, polite follow-up email for a message the user sent that hasn't received a reply. Respond with ONLY a JSON object: {\"draft\":\"...\",\"confidence\":0.0}. The draft should be 2-3 sentences, reference the original ask, and be professional. No markdown, no prose outside the JSON.",
        },
        {
          role: "user",
          content: `Original subject: ${input.subject}\nTo: ${input.toName}\nSent ${input.ageDays} days ago.\n\nOriginal message:\n${plain}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<{ draft?: string; confidence?: number }>(raw);
    if (!parsed || !parsed.draft) return null;
    return { draft: parsed.draft, confidence: Number(parsed.confidence ?? 0.6) };
  } catch (e) {
    console.error("[aiFollowUp] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ─── Conversation Reconstruction (§8) ─────────────────────────────────────

export interface ConversationResult {
  status: string;
  decisions: Array<{ text: string; source: string }>;
  openQuestions: string[];
  commitments: Array<{ who: string; action: string; due: string | null; source: string }>;
  participants: string[];
  nextAction: string | null;
  confidence: number;
  provenance: { threadId: string; messageCount: number; messages: Array<{ id: string; from: string; date: string; subject: string }> };
}

/**
 * Reconstruct a conversation thread into a structured summary: current status,
 * decisions, open questions, commitments, participants, next action. Every
 * claim is source-grounded (cites message id + sender). Falls back to a
 * deterministic timeline if the LLM is unavailable.
 */
export async function aiConversation(messages: Array<{
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
  date: string;
}>, threadId: string): Promise<ConversationResult> {
  const provenance = {
    threadId,
    messageCount: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      from: `${m.fromName} <${m.fromEmail}>`,
      date: m.date,
      subject: m.subject,
    })),
  };
  const fallback: ConversationResult = {
    status: messages.length > 1
      ? `Thread of ${messages.length} messages between ${[...new Set(messages.map(m => m.fromName))].slice(0,3).join(", ")}.`
      : `Single message from ${messages[0]?.fromName ?? "unknown"}.`,
    decisions: [],
    openQuestions: [],
    commitments: [],
    participants: [...new Set(messages.map((m) => m.fromName))],
    nextAction: null,
    confidence: 0.3,
    provenance,
  };
  if (messages.length === 0) return fallback;
  try {
    const zai = await getZai();
    // Compact the thread into a transcript (plain text, capped)
    const transcript = messages
      .map(
        (m, i) =>
          `--- Message ${i + 1} ---\nFrom: ${m.fromName} <${m.fromEmail}>\nDate: ${m.date}\nSubject: ${m.subject}\n\n${stripHtml(m.body, 1200)}`
      )
      .join("\n\n")
      .slice(0, 6000);
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You reconstruct an email thread into a structured summary. Respond with ONLY a JSON object (no markdown, no prose) with these keys:\n" +
            "status: 1-2 sentence current state of the conversation (write a real summary)\n" +
            "decisions: array of {text, source} — what has been agreed/decided; 'source' quotes the exact sentence\n" +
            "openQuestions: array of strings — unresolved questions\n" +
            "commitments: array of {who, action, due, source} — who promised what\n" +
            "participants: array of names involved\n" +
            "nextAction: the single most useful next step, or null\n" +
            "confidence: 0-1\n" +
            "Rules: every 'source' MUST be a verbatim quote from the transcript. Never invent. If no evidence for a field, use empty array/null. Do NOT copy the field descriptions — write a real reconstruction.",
        },
        { role: "user", content: `THREAD TRANSCRIPT (${messages.length} messages):\n\n${transcript}` },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<Partial<ConversationResult>>(raw);
    if (!parsed) {
      console.error("[aiConversation] no JSON:", raw.slice(0, 300));
      return fallback;
    }
    return { ...fallback, ...parsed, provenance };
  } catch (e) {
    console.error("[aiConversation] failed:", e instanceof Error ? e.message : e);
    return fallback;
  }
}
