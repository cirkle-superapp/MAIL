import ZAI from "z-ai-web-dev-sdk";

/* ═══════════════════════════════════════════════════════════════════════════
   Cirkle (دواير) AI — Multi-Model Consensus Layer
   Calls multiple LLMs in parallel (OpenRouter multi-model + z-ai SDK) and
   uses consensus (majority vote for classification, best-confidence for
   generation). Every output is source-grounded. Graceful fallback to the
   z-ai SDK if external providers are unavailable (§44).
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Provider calling layer ─────────────────────────────────────────────────

let zaiInstance: ZAI | null = null;
async function getZai(): Promise<ZAI> {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

type Msg = { role: "assistant" | "user"; content: string };

/** Call OpenRouter (OpenAI-compatible). Returns the raw content or null. */
async function callOpenRouter(
  model: string,
  messages: Msg[],
  timeoutMs = 20000
): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Call the z-ai SDK. Returns the raw content or null. */
async function callZai(messages: Msg[]): Promise<string | null> {
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
    });
    return completion.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Generic OpenAI-compatible chat completions caller.
 * Works for: Groq, NVIDIA NIM, HuggingFace router, OpenRouter (and any other
 * OpenAI-compatible endpoint). Returns the raw content or null.
 */
async function callOpenAICompatible(
  url: string,
  key: string | undefined,
  model: string,
  messages: Msg[],
  timeoutMs = 20000
): Promise<string | null> {
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Call Groq (ultra-fast inference, Llama/Qwen/DeepSeek models). */
async function callGroq(
  model: string,
  messages: Msg[],
  timeoutMs = 15000
): Promise<string | null> {
  return callOpenAICompatible(
    "https://api.groq.com/openai/v1/chat/completions",
    process.env.GROQ_API_KEY,
    model,
    messages,
    timeoutMs
  );
}

/** Call NVIDIA NIM (Nemotron, Llama, Qwen models on NVIDIA's edge infra). */
async function callNvidia(
  model: string,
  messages: Msg[],
  timeoutMs = 20000
): Promise<string | null> {
  return callOpenAICompatible(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    process.env.NVIDIA_API_KEY,
    model,
    messages,
    timeoutMs
  );
}

/** Call HuggingFace Inference API (router, OpenAI-compatible). */
async function callHuggingFace(
  model: string,
  messages: Msg[],
  timeoutMs = 25000
): Promise<string | null> {
  return callOpenAICompatible(
    "https://api-inference.huggingface.co/v1/chat/completions",
    process.env.HF_API_KEY,
    model,
    messages,
    timeoutMs
  );
}

/**
 * Call Google Gemini (Generative Language API). Uses Google's native request
 * format (contents/parts, not OpenAI's messages). Returns the text or null.
 */
async function callGemini(
  model: string,
  messages: Msg[],
  timeoutMs = 20000
): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  // Gemini uses role "model" instead of "assistant"
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Multi-model consensus: call N models in parallel, return all raw responses
 * (non-null only). Used for majority-vote classification + best-confidence
 * generation.
 */
async function multiModel(
  messages: Msg[],
  models: Array<{ name: string; call: () => Promise<string | null> }>
): Promise<Array<{ model: string; content: string }>> {
  const results = await Promise.allSettled(models.map((m) => m.call()));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<string> =>
        r.status === "fulfilled" && r.value != null
    )
    .map((r, i) => ({ model: models[i].name, content: r.value! }));
}

/**
 * Consensus models for classification — 8 models across 6 providers for
 * maximum diversity + majority-vote accuracy. Fast models (≤20s timeout).
 * Each provider adds architectural diversity (Llama, Qwen, DeepSeek, Gemini,
 * Nemotron, z-ai) so no single model's bias dominates.
 */
function classifyModels(messages: Msg[]): Array<{ name: string; call: () => Promise<string | null> }> {
  return [
    // OpenRouter (3 models)
    { name: "or-llama-3.1-8b", call: () => callOpenRouter("meta-llama/llama-3.1-8b-instruct", messages, 15000) },
    { name: "or-qwen-2.5-7b", call: () => callOpenRouter("qwen/qwen-2.5-7b-instruct", messages, 15000) },
    { name: "or-deepseek-chat", call: () => callOpenRouter("deepseek/deepseek-chat", messages, 20000) },
    // Groq (ultra-fast, 2 models)
    { name: "groq-llama-3.1-8b", call: () => callGroq("llama-3.1-8b-instant", messages, 12000) },
    { name: "groq-qwen-2.5", call: () => callGroq("qwen-2.5-7b", messages, 12000) },
    // NVIDIA NIM (1 model — Nemotron 70B, strong reasoning)
    { name: "nv-nemotron-70b", call: () => callNvidia("nvidia/llama-3.1-nemotron-70b-instruct", messages, 20000) },
    // Gemini (1 model — Google's native format)
    { name: "gemini-1.5-flash", call: () => callGemini("gemini-1.5-flash", messages, 15000) },
    // HuggingFace (1 model)
    { name: "hf-llama-3.2-3b", call: () => callHuggingFace("meta-llama/Llama-3.2-3B-Instruct", messages, 20000) },
    // z-ai SDK (always-available built-in fallback)
    { name: "z-ai", call: () => callZai(messages) },
  ];
}

/**
 * Generation models — 5 models across 5 providers for best-confidence pick.
 * Larger/better-reasoning models (higher timeouts). The result with the
 * highest confidence wins.
 */
function generationModels(messages: Msg[]): Array<{ name: string; call: () => Promise<string | null> }> {
  return [
    { name: "or-deepseek-chat", call: () => callOpenRouter("deepseek/deepseek-chat", messages, 25000) },
    { name: "groq-llama-3.3-70b", call: () => callGroq("llama-3.3-70b-versatile", messages, 20000) },
    { name: "nv-nemotron-70b", call: () => callNvidia("nvidia/llama-3.1-nemotron-70b-instruct", messages, 25000) },
    { name: "gemini-1.5-pro", call: () => callGemini("gemini-1.5-pro", messages, 25000) },
    { name: "z-ai", call: () => callZai(messages) },
  ];
}

// ─── Robust JSON extraction ─────────────────────────────────────────────────

function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "").trim();
  try { return JSON.parse(s) as T; } catch {}
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end > start) {
    try { return JSON.parse(s.slice(start, end + 1)) as T; } catch {}
  }
  return null;
}

function stripHtml(html: string, max = 3000): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, max);
}

// ─── Intent classification (consensus: majority vote) ───────────────────────

export async function aiClassify(params: {
  subject: string; fromName: string; fromEmail: string; body: string;
}): Promise<{ intent: string; confidence: number; reason: string } | null> {
  const plain = stripHtml(params.body, 2000);
  const systemMsg: Msg = {
    role: "assistant",
    content:
      "You classify emails into exactly one intent. Respond with ONLY a JSON object: " +
      '{"intent": "...", "confidence": 0.0, "reason": "..."}. ' +
      "Valid intents: REQUIRES_REPLY, FYI, INVOICE, RECEIPT, ORDER, SHIPMENT, COMMITMENT, MEETING, NEWSLETTER, PROMOTION, NOTIFICATION, SECURITY_ALERT, SOCIAL, PERSONAL, BUSINESS. " +
      "confidence is 0-1. reason is one short sentence grounded in the email text. No prose outside the JSON.",
  };
  const userMsg: Msg = {
    role: "user",
    content: `From: ${params.fromName} <${params.fromEmail}>\nSubject: ${params.subject}\n\n${plain}`,
  };
  const messages = [systemMsg, userMsg];

  // Consensus: call 4 models, majority vote
  const responses = await multiModel(messages, classifyModels(messages));
  const parsed = responses
    .map((r) => ({ model: r.model, data: extractJson<{ intent?: string; confidence?: number; reason?: string }>(r.content) }))
    .filter((r) => r.data?.intent);

  if (parsed.length === 0) return null;

  // Majority vote
  const votes: Record<string, number> = {};
  for (const p of parsed) {
    const intent = p.data!.intent!;
    votes[intent] = (votes[intent] ?? 0) + 1;
  }
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const [winner, count] = sorted[0];
  const confidence = count / parsed.length;
  const bestReason = parsed.find((p) => p.data!.intent === winner)?.data!.reason ?? "";
  return { intent: winner, confidence, reason: bestReason };
}

// ─── HANDLE email (generation: best-confidence pick) ────────────────────────

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

export async function aiHandleEmail(email: {
  id: string; subject: string; fromName: string; fromEmail: string; body: string; date: string;
}): Promise<HandleResult> {
  const provenance = { emailId: email.id, subject: email.subject, from: `${email.fromName} <${email.fromEmail}>`, date: email.date };
  const fallback: HandleResult = {
    intent: "FYI", summary: `Email from ${email.fromName} about "${email.subject}".`,
    keyInfo: [], commitments: [], openQuestions: [], suggestedReply: "", followUp: null,
    risk: "low", confidence: 0.3, provenance,
  };
  const plain = stripHtml(email.body, 3000);
  const messages: Msg[] = [
    {
      role: "assistant",
      content:
        "You analyze emails and propose a workflow. Respond with ONLY a JSON object (no markdown, no prose) with these keys:\n" +
        "intent: one of REQUIRES_REPLY|FYI|INVOICE|RECEIPT|ORDER|SHIPMENT|COMMITMENT|MEETING|NEWSLETTER|PROMOTION|NOTIFICATION|SECURITY_ALERT|SOCIAL|PERSONAL|BUSINESS\n" +
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
    { role: "user", content: `EMAIL TO ANALYZE\nFrom: ${email.fromName} <${email.fromEmail}>\nSubject: ${email.subject}\nDate: ${email.date}\n\n${plain}` },
  ];

  const responses = await multiModel(messages, generationModels(messages));
  // Pick the result with the highest confidence
  let best: HandleResult | null = null;
  for (const r of responses) {
    const parsed = extractJson<Partial<HandleResult>>(r.content);
    if (parsed && (parsed.summary || parsed.suggestedReply)) {
      const merged = { ...fallback, ...parsed, provenance };
      if (!best || (merged.confidence ?? 0) > (best.confidence ?? 0)) {
        best = merged;
      }
    }
  }
  if (best) return best;
  console.error("[aiHandleEmail] no valid JSON from any model");
  return fallback;
}

// ─── Conversation Reconstruction (§8) ───────────────────────────────────────

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

export async function aiConversation(messages: Array<{
  id: string; fromName: string; fromEmail: string; subject: string; body: string; date: string;
}>, threadId: string): Promise<ConversationResult> {
  const provenance = {
    threadId, messageCount: messages.length,
    messages: messages.map((m) => ({ id: m.id, from: `${m.fromName} <${m.fromEmail}>`, date: m.date, subject: m.subject })),
  };
  const fallback: ConversationResult = {
    status: messages.length > 1
      ? `Thread of ${messages.length} messages between ${[...new Set(messages.map(m => m.fromName))].slice(0, 3).join(", ")}.`
      : `Single message from ${messages[0]?.fromName ?? "unknown"}.`,
    decisions: [], openQuestions: [], commitments: [],
    participants: [...new Set(messages.map((m) => m.fromName))],
    nextAction: null, confidence: 0.3, provenance,
  };
  if (messages.length === 0) return fallback;

  const transcript = messages.map((m, i) =>
    `--- Message ${i + 1} ---\nFrom: ${m.fromName} <${m.fromEmail}>\nDate: ${m.date}\nSubject: ${m.subject}\n\n${stripHtml(m.body, 1200)}`
  ).join("\n\n").slice(0, 6000);

  const chatMessages: Msg[] = [
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
  ];

  const responses = await multiModel(chatMessages, generationModels(chatMessages));
  let best: ConversationResult | null = null;
  for (const r of responses) {
    const parsed = extractJson<Partial<ConversationResult>>(r.content);
    if (parsed && parsed.status) {
      const merged = { ...fallback, ...parsed, provenance };
      if (!best || (merged.confidence ?? 0) > (best.confidence ?? 0)) best = merged;
    }
  }
  if (best) return best;
  console.error("[aiConversation] no valid JSON from any model");
  return fallback;
}

// ─── Daily Briefing ─────────────────────────────────────────────────────────

export interface BriefingResult {
  greeting: string;
  headline: string;
  highlights: Array<{ text: string; source: string; severity: "high" | "medium" | "low" }>;
  suggestedFirstAction: string | null;
  confidence: number;
}

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
    suggestedFirstAction: input.needsReply[0] ? `Reply to ${input.needsReply[0].fromName} — "${input.needsReply[0].subject}".` : null,
    confidence: 0.3,
  };
  if (count === 0) return fallback;

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

  const chatMessages: Msg[] = [
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
  ];

  const responses = await multiModel(chatMessages, generationModels(chatMessages));
  let best: BriefingResult | null = null;
  for (const r of responses) {
    const parsed = extractJson<Partial<BriefingResult>>(r.content);
    if (parsed && parsed.headline) {
      const merged = { ...fallback, ...parsed };
      if (!best || (merged.confidence ?? 0) > (best.confidence ?? 0)) best = merged;
    }
  }
  if (best) return best;
  console.error("[aiBriefing] no valid JSON from any model");
  return fallback;
}

// ─── Smart Follow-up ────────────────────────────────────────────────────────

export async function aiFollowUp(input: {
  subject: string; toName: string; body: string; ageDays: number;
}): Promise<{ draft: string; confidence: number } | null> {
  const plain = stripHtml(input.body, 800);
  const messages: Msg[] = [
    {
      role: "assistant",
      content: "You draft a short, polite follow-up email for a message the user sent that hasn't received a reply. Respond with ONLY a JSON object: {\"draft\":\"...\",\"confidence\":0.0}. The draft should be 2-3 sentences, reference the original ask, and be professional. No markdown, no prose outside the JSON.",
    },
    { role: "user", content: `Original subject: ${input.subject}\nTo: ${input.toName}\nSent ${input.ageDays} days ago.\n\nOriginal message:\n${plain}` },
  ];
  // Use fast models for follow-up
  const responses = await multiModel(messages, [
    { name: "llama-3.1-8b", call: () => callOpenRouter("meta-llama/llama-3.1-8b-instruct", messages, 15000) },
    { name: "z-ai", call: () => callZai(messages) },
  ]);
  let best: { draft: string; confidence: number } | null = null;
  for (const r of responses) {
    const parsed = extractJson<{ draft?: string; confidence?: number }>(r.content);
    if (parsed?.draft) {
      if (!best || (parsed.confidence ?? 0) > (best.confidence ?? 0)) {
        best = { draft: parsed.draft, confidence: parsed.confidence ?? 0.6 };
      }
    }
  }
  if (best) return best;
  console.error("[aiFollowUp] no valid JSON from any model");
  return null;
}

// ─── Command interpretation ────────────────────────────────────────────────

export async function aiInterpretCommand(command: string): Promise<{
  action: "search" | "view" | "compose" | "answer";
  query?: string; view?: string; answer?: string; confidence: number;
} | null> {
  const messages: Msg[] = [
    {
      role: "assistant",
      content:
        'You interpret a user command for an email app. Respond with ONLY JSON: ' +
        '{"action":"search|view|compose|answer","query":"...","view":"now|reply|waiting|commitments|people|receipts|subscriptions|inbox|sent|starred","answer":"...","confidence":0.0}. ' +
        "For 'find/show X' use action=search with a keyword query. For 'show everything waiting/overdue/needs reply' use action=view with the matching view. For 'draft/reply/compose' use action=compose. For a factual question about the inbox use action=answer with a short grounded answer. No prose outside JSON, no markdown fences.",
    },
    { role: "user", content: command },
  ];
  const responses = await multiModel(messages, [
    { name: "llama-3.1-8b", call: () => callOpenRouter("meta-llama/llama-3.1-8b-instruct", messages, 15000) },
    { name: "z-ai", call: () => callZai(messages) },
  ]);
  let best: { action: string; query?: string; view?: string; answer?: string; confidence: number } | null = null;
  for (const r of responses) {
    const parsed = extractJson<{ action?: string; query?: string; view?: string; answer?: string; confidence?: number }>(r.content);
    if (parsed?.action) {
      if (!best || (parsed.confidence ?? 0) > (best.confidence ?? 0)) {
        best = {
          action: parsed.action ?? "search",
          query: parsed.query, view: parsed.view, answer: parsed.answer,
          confidence: parsed.confidence ?? 0.5,
        };
      }
    }
  }
  if (best) return best as { action: "search" | "view" | "compose" | "answer"; query?: string; view?: string; answer?: string; confidence: number };
  console.error("[aiInterpretCommand] no valid JSON from any model");
  return null;
}

export const AI_FALLBACK_INTENT = { intent: "FYI", confidence: 0.4, reason: "AI unavailable — fell back to default" };

// ─── One-Click Quick Replies (context-aware, per-email) ─────────────────────

export async function aiQuickReplies(email: {
  subject: string; fromName: string; fromEmail: string; body: string;
}): Promise<Array<{ text: string; tone: string }> | null> {
  const plain = stripHtml(email.body, 1500);
  const messages: Msg[] = [
    {
      role: "assistant",
      content:
        "You generate 3 short one-click reply options for this email. Respond with ONLY a JSON array: [{\"text\":\"...\",\"tone\":\"...\"}]. Each 'text' is 2-8 words (what the user would click to send as a quick reply). 'tone' is one of: positive, neutral, declining, question. Make the replies specific to THIS email's content (not generic). No markdown, no prose outside the JSON array.",
    },
    { role: "user", content: `From: ${email.fromName}\nSubject: ${email.subject}\n\n${plain}` },
  ];
  const responses = await multiModel(messages, [
    { name: "llama-3.1-8b", call: () => callOpenRouter("meta-llama/llama-3.1-8b-instruct", messages, 15000) },
    { name: "z-ai", call: () => callZai(messages) },
  ]);
  for (const r of responses) {
    const parsed = extractJson<Array<{ text?: string; tone?: string }>>(r.content);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.text) {
      return parsed.filter((p) => p.text).slice(0, 3).map((p) => ({ text: p.text!, tone: p.tone ?? "neutral" }));
    }
  }
  return null;
}

// ─── AI Subject Line Improver ────────────────────────────────────────────────

export async function aiImproveSubject(draft: string): Promise<string[] | null> {
  const messages: Msg[] = [
    {
      role: "assistant",
      content:
        "You suggest 3 improved email subject lines for the user's draft subject. Respond with ONLY a JSON array of strings: [\"subject 1\", \"subject 2\", \"subject 3\"]. Make them clear, concise, and professional. No markdown, no prose outside the JSON.",
    },
    { role: "user", content: `Draft subject: "${draft}"\n\nSuggest 3 better subject lines.` },
  ];
  const responses = await multiModel(messages, [
    { name: "llama-3.1-8b", call: () => callOpenRouter("meta-llama/llama-3.1-8b-instruct", messages, 12000) },
    { name: "z-ai", call: () => callZai(messages) },
  ]);
  for (const r of responses) {
    const parsed = extractJson<string[]>(r.content);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
  }
  return null;
}

// ─── AI Composition Copilot (inline draft improvement) ─────────────────────

export async function aiImprove(input: {
  text: string;
  instruction: string;
}): Promise<{ text: string; confidence: number } | null> {
  const plain = stripHtml(input.text, 3000);
  const instructionMap: Record<string, string> = {
    professional: "Rewrite this email draft to be more professional and polished. Keep the same meaning.",
    concise: "Rewrite this email draft to be more concise and to the point. Remove fluff.",
    friendly: "Rewrite this email draft to be warmer and more friendly, while staying professional.",
    urgent: "Rewrite this email draft to convey appropriate urgency without being aggressive.",
    "add-call-to-action": "Rewrite this email draft to add a clear call-to-action at the end.",
    "fix-grammar": "Fix any grammar, spelling, or punctuation issues in this email draft. Keep the meaning the same.",
  };
  const systemInstruction = instructionMap[input.instruction] ?? instructionMap.professional;
  const messages: Msg[] = [
    {
      role: "assistant",
      content:
        systemInstruction +
        " Respond with ONLY a JSON object: {\"text\":\"...\",\"confidence\":0.0}. The 'text' is the improved version. No markdown, no prose outside the JSON.",
    },
    { role: "user", content: plain },
  ];
  const responses = await multiModel(messages, [
    { name: "deepseek", call: () => callOpenRouter("deepseek/deepseek-chat", messages, 20000) },
    { name: "z-ai", call: () => callZai(messages) },
  ]);
  let best: { text: string; confidence: number } | null = null;
  for (const r of responses) {
    const parsed = extractJson<{ text?: string; confidence?: number }>(r.content);
    if (parsed?.text) {
      if (!best || (parsed.confidence ?? 0) > (best.confidence ?? 0)) {
        best = { text: parsed.text, confidence: parsed.confidence ?? 0.7 };
      }
    }
  }
  if (best) return best;
  console.error("[aiImprove] no valid JSON from any model");
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// AI PRIORITY SCORE — a 0-100 priority score per email
// Outsmarts competitors: every email gets a smart priority score based on
// sender, subject, body content, intent, and deadline signals. Displayed as
// a color-coded badge so users instantly know what to tackle first.
// ═══════════════════════════════════════════════════════════════════════

export interface PriorityResult {
  score: number;        // 0-100 (0=ignore, 100=urgent)
  level: "low" | "medium" | "high" | "urgent";
  reasoning: string;    // 1-sentence why
  confidence: number;   // 0-1
}

export async function aiPriority(email: {
  fromName?: string;
  fromEmail?: string;
  subject?: string;
  body?: string;
  snippet?: string;
  intent?: string;
  isImportant?: boolean;
  hasAttachment?: boolean;
}): Promise<PriorityResult | null> {
  const system = `You are an email triage assistant. Score the email's priority 0-100 based on:
- Urgency (deadlines, time-sensitive language like "today", "tomorrow", "asap", "EOD")
- Sender importance (known senders vs newsletters/promotions)
- Action required (does this need a reply/decision/action?)
- Impact (financial, legal, security, career implications)
Return JSON: {"score": number, "level": "low"|"medium"|"high"|"urgent", "reasoning": "one short sentence", "confidence": 0-1}
Score guide: 0-30 low (newsletter/ FYI), 31-60 medium (routine), 61-85 high (needs action soon), 86-100 urgent (deadline/important).`;

  const content = `From: ${email.fromName ?? ""} <${email.fromEmail ?? ""}>
Subject: ${email.subject ?? ""}
Intent: ${email.intent ?? "unknown"}
Important: ${email.isImportant ? "yes" : "no"}
Attachment: ${email.hasAttachment ? "yes" : "no"}
Body (first 800 chars): ${(email.body ?? email.snippet ?? "").slice(0, 800)}`;

  const messages: Msg[] = [
    { role: "system", content: system },
    { role: "user", content },
  ];

  const responses = await multiModel(messages, generationModels(messages));
  for (const r of responses) {
    const parsed = extractJson<PriorityResult>(r.content);
    if (parsed && typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 100) {
      const score = Math.round(parsed.score);
      const level = score >= 86 ? "urgent" : score >= 61 ? "high" : score >= 31 ? "medium" : "low";
      return {
        score,
        level,
        reasoning: parsed.reasoning ?? "",
        confidence: parsed.confidence ?? 0.7,
      };
    }
  }
  return null;
}
