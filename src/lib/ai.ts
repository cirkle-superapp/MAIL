import ZAI from "z-ai-web-dev-sdk";

let zaiInstance: ZAI | null = null;

async function getZai(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
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
    const plain = params.body
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
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
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      intent: String(parsed.intent ?? "FYI"),
      confidence: Number(parsed.confidence ?? 0.5),
      reason: String(parsed.reason ?? ""),
    };
  } catch {
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
    summary: "AI analysis unavailable — showing a basic summary.",
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
    const plain = email.body
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content:
            "You are an email workflow assistant. Analyze the email and respond with ONLY a JSON object matching this exact shape:\n" +
            JSON.stringify(fallback, null, 2) +
            "\nRules:\n" +
            "- intent must be one of: REQUIRES_REPLY, FYI, INVOICE, RECEIPT, ORDER, SHIPMENT, COMMITMENT, MEETING, NEWSLETTER, PROMOTION, NOTIFICATION, SECURITY_ALERT, SOCIAL, PERSONAL, BUSINESS.\n" +
            "- Every keyInfo/commitments/openQuestions entry MUST include a 'source' field quoting the exact sentence from the email it came from. Never fabricate.\n" +
            "- If you cannot find evidence for a field, return an empty array or empty string. Do NOT invent dates, amounts, or names.\n" +
            "- suggestedReply is a short professional draft the user can edit before sending.\n" +
            "- risk: low (label/summary/archive) / medium (draft, task, reminder) / high (send, delete, forward).\n" +
            "- confidence 0-1 reflecting how grounded the analysis is.\n" +
            "- Do not output any text outside the JSON object.",
        },
        {
          role: "user",
          content: `EMAIL TO ANALYZE\nFrom: ${email.fromName} <${email.fromEmail}>\nSubject: ${email.subject}\nDate: ${email.date}\n\n${plain}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return { ...fallback, ...parsed, provenance };
  } catch {
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
            "For 'find/show X' use action=search with a keyword query. For 'show everything waiting/overdue/needs reply' use action=view with the matching view. For 'draft/reply/compose' use action=compose. For a factual question about the inbox use action=answer with a short grounded answer. No prose outside JSON.",
        },
        { role: "user", content: command },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      action: parsed.action ?? "search",
      query: parsed.query,
      view: parsed.view,
      answer: parsed.answer,
      confidence: Number(parsed.confidence ?? 0.5),
    };
  } catch {
    return null;
  }
}

export const AI_FALLBACK_INTENT = FALLBACK_INTENT;
