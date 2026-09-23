/**
 * ai-search.ts
 * -----------------------------------------------------------------------------
 * Evidence-grounded AI search (§24-§28). Uses the unified LLM client
 * (../llm — Groq → Gemini → OpenRouter fallback chain) via chatCompletion
 * (server-side only) to synthesize an answer from the retrieved sources —
 * NOT from the model's parametric memory.
 *
 * Two entry points:
 *   1. generateAISummary()  — compact answer + claims + citations +
 *                              support status (DIRECTLY_SUPPORTED /
 *                              MULTI_SOURCE / INDIRECT / CONFLICTING /
 *                              INSUFFICIENT).
 *   2. generateResearchReport() — Deep Research pipeline (§28):
 *                                  query decomposition → multiple searches →
 *                                  source classification → cross-checking →
 *                                  evidence collection → conflict detection →
 *                                  synthesis → citation generation.
 *
 * The function never throws — if the LLM call fails it returns null (for the
 * summary) or a report with `limitations` set (for deep research).
 * -----------------------------------------------------------------------------
 */

import type { ParsedQuery } from './query-understanding'

export interface AICitation {
  id: number
  title: string
  url: string
  snippet: string
  sourceType: string
}

export interface AIClaim {
  text: string
  citations: number[]
}

export interface AIConflict {
  a: string
  b: string
  reason: string
}

export type AISupportStatus =
  | 'DIRECTLY_SUPPORTED'
  | 'MULTI_SOURCE'
  | 'INDIRECT'
  | 'CONFLICTING'
  | 'INSUFFICIENT'

export interface AISearchResult {
  answer: string
  claims: AIClaim[]
  citations: AICitation[]
  supportStatus: AISupportStatus
  conflicts?: AIConflict[]
  generatedAt: string
}

export interface ResearchStep {
  step: string
  status: string
}

export interface ResearchEvidence {
  claim: string
  sources: number[]
  support: string
}

export interface ResearchSource {
  id: number
  title: string
  url: string
  snippet: string
  sourceType: string
}

export interface ResearchReport {
  subQueries: string[]
  steps: ResearchStep[]
  executiveSummary: string
  keyFindings: string[]
  evidence: ResearchEvidence[]
  contradictions: AIConflict[]
  limitations: string
  sources: ResearchSource[]
  generatedAt: string
}

// --- Knowledge Graph entity card (§7.3, §23) -------------------------------
// When the query matches a clear entity (a person, organization, place,
// technology, etc.) the LLM extracts structured facts from the top retrieved
// sources. The card is OPTIONAL — it only renders when the LLM detects a
// clear primary entity. Like the AI answer, every fact cites a source.

export interface KnowledgeFact {
  label: string      // e.g. "Founded", "Headquarters", "Industry"
  value: string      // e.g. "1976", "Cupertino, CA", "Technology"
  citations: number[]  // references into the citations[] array
}

export interface KnowledgeCard {
  entityName: string
  entityType: string   // ORGANIZATION|PERSON|PLACE|PRODUCT|TECHNOLOGY|EVENT|PUBLICATION|CONCEPT
  description: string  // 1-2 sentence summary, evidence-grounded
  facts: KnowledgeFact[]
  citations: AICitation[]
  confidenceClass: 'HIGH' | 'MEDIUM' | 'LOW'  // HIGH = ≥3 sources agree
  generatedAt: string
}

interface SearchResultForAI {
  id: string
  title: string
  url: string
  snippet: string
  sourceType: string
  domain: string
}

const SYSTEM_PROMPT_SUMMARY = `You are an evidence-grounded search assistant. Using ONLY the provided retrieved sources, synthesize a concise answer. Every factual claim MUST cite source IDs in [n] format (e.g., "X is true [1][2]"). If sources disagree, say so. If evidence is insufficient, say so explicitly. Do not fabricate. Do not use information outside the provided sources.`

function assembleContext(results: SearchResultForAI[]): string {
  const top = results.slice(0, 8)
  return top
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\nSource: ${r.sourceType}\nSnippet: ${r.snippet}`
    )
    .join('\n\n')
}

function parseCitations(text: string): number[] {
  const ids = new Set<number>()
  const re = /\[(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n)) ids.add(n)
  }
  return Array.from(ids).sort((a, b) => a - b)
}

function extractClaims(answer: string): AIClaim[] {
  // Split into sentences; each sentence with a [n] citation is a claim.
  const sentences = answer
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const claims: AIClaim[] = []
  for (const s of sentences) {
    const cits = parseCitations(s)
    if (cits.length > 0) {
      claims.push({ text: s, citations: cits })
    }
  }
  return claims
}

function computeSupportStatus(
  claims: AIClaim[],
  nSources: number,
  llmText: string
): AISupportStatus {
  if (/insufficient|no (reliable )?evidence|cannot (verify|confirm)/i.test(llmText)) {
    return 'INSUFFICIENT'
  }
  if (/disagree|conflict|contradict/i.test(llmText)) {
    return 'CONFLICTING'
  }
  // Count how many distinct sources the claims collectively cite.
  const allCited = new Set<number>()
  for (const c of claims) for (const n of c.citations) allCited.add(n)
  if (allCited.size === 0) return 'INDIRECT'
  if (allCited.size === 1) return 'DIRECTLY_SUPPORTED'
  if (allCited.size >= 2) return 'MULTI_SOURCE'
  return nSources >= 1 ? 'DIRECTLY_SUPPORTED' : 'INSUFFICIENT'
}

/**
 * Generate an evidence-grounded AI summary.
 *
 * Server-side only. Returns null on LLM failure.
 */
export async function generateAISummary(
  query: string,
  _parsed: ParsedQuery,
  results: SearchResultForAI[]
): Promise<AISearchResult | null> {
  if (!results || results.length === 0) return null

  let text = ''
  try {
    const { chatCompletion } = await import('../llm')
    const ctx = assembleContext(results)
    const userPrompt = `User question: ${query}

Retrieved sources (use ONLY these, cite by [n]):
${ctx}

Synthesize a concise answer (3-5 sentences). Every factual claim must cite at least one source ID in [n] form. If sources disagree, mention the conflict. If evidence is insufficient, say "Evidence is insufficient" explicitly.`

    const completion = await chatCompletion([
      { role: 'system', content: SYSTEM_PROMPT_SUMMARY },
      { role: 'user', content: userPrompt },
    ])
    text = completion?.content ?? ''
  } catch {
    return null
  }
  if (!text) return null

  const claims = extractClaims(text)
  const citations: AICitation[] = results.slice(0, 8).map((r, i) => ({
    id: i + 1,
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    sourceType: r.sourceType,
  }))
  const supportStatus = computeSupportStatus(claims, citations.length, text)

  return {
    answer: text.trim(),
    claims,
    citations,
    supportStatus,
    generatedAt: new Date().toISOString(),
  }
}

// ---- Deep Research (§28) -------------------------------------------------

interface ResearchOptions {
  depth: 'standard' | 'deep'
}

/**
 * Deep research pipeline:
 *   1. LLM decomposes the question into 3-6 sub-questions.
 *   2. For each sub-question: run a `search()` call via the orchestrator
 *      (dynamically imported to avoid a module-load cycle).
 *   3. Collect sources from all sub-searches (dedup by URL).
 *   4. Single LLM call synthesizes an executive summary, key findings,
 *      evidence (each with source IDs), contradictions, and limitations.
 *   5. Return the structured report.
 *
 * Server-side only. Never throws.
 */
export async function generateResearchReport(
  question: string,
  depth: ResearchOptions['depth'] = 'standard'
): Promise<ResearchReport> {
  const steps: ResearchStep[] = []
  const subQueries: string[] = []
  const collected: Map<string, ResearchSource & { snippet: string }> = new Map()
  let sourcesList: ResearchSource[] = []

  // Step 1: Decompose
  steps.push({ step: 'Query decomposition', status: 'running' })
  try {
    const { chatCompletion } = await import('../llm')
    const completion = await chatCompletion([
      { role: 'system', content: 'You decompose research questions into 3-6 sub-questions that together cover the topic. Output only the sub-questions, one per line, no numbering.' },
      { role: 'user', content: `Research question: "${question}"\nDepth: ${depth}\nDecompose into 3-6 sub-questions.` },
    ])
    const t = completion?.content ?? ''
    for (const line of t.split(/\n/)) {
      const s = line.replace(/^[\d.\-*\s]+/, '').trim()
      if (s && s.length > 5 && s.length < 300) subQueries.push(s)
    }
  } catch {
    // ignore
  }
  if (subQueries.length === 0) {
    subQueries.push(question)
  }
  steps[0].status = 'done'

  // Step 2-4: For each sub-query, run search() and collect sources
  steps.push({ step: `Searching ${subQueries.length} sub-queries`, status: 'running' })
  try {
    const searchMod = await import('./index')
    for (const sq of subQueries) {
      try {
        const resp = await searchMod.search(sq, 'RESEARCH', {
          freshness: 'ANY',
          sourceTypes: [],
          domainDiversity: 2,
          aiMode: 'OFF',
          personalization: 'OFF',
          safeSearch: 'ON',
          page: 1,
          pageSize: 8,
        })
        for (const r of resp.results) {
          if (!r || !r.url) continue
          if (collected.has(r.url)) continue
          collected.set(r.url, {
            id: collected.size + 1,
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            sourceType: r.sourceType,
          })
        }
      } catch {
        // continue with next sub-query
      }
    }
    sourcesList = Array.from(collected.values())
  } catch {
    // ignore
  }
  steps[1].status = sourcesList.length > 0 ? 'done' : 'failed'

  // Step 5: Source classification already done (we have sourceType per source).

  // Step 6-9: Synthesis (single LLM call)
  steps.push({ step: 'Synthesizing report', status: 'running' })
  let executiveSummary = ''
  let keyFindings: string[] = []
  let evidence: ResearchEvidence[] = []
  let contradictions: AIConflict[] = []
  let limitations = ''
  try {
    const { chatCompletion } = await import('../llm')

    const ctx = sourcesList.slice(0, 16).map(
      (r) => `[${r.id}] ${r.title}\nURL: ${r.url}\nSource: ${r.sourceType}\nSnippet: ${r.snippet}`
    ).join('\n\n')

    const userPrompt = `Research question: "${question}"

You have gathered the following retrieved sources. Use ONLY these sources for your answer.

${ctx}

Produce a research report in this exact format (no extra prose):

EXECUTIVE_SUMMARY:
<2-4 sentences>

KEY_FINDINGS:
- <finding 1>
- <finding 2>
- ...

EVIDENCE:
- <claim>: sources [n1,n2]
- ...

CONTRADICTIONS:
- <source A claim> vs <source B claim>: <reason>
- (if none, write "none")

LIMITATIONS:
<1-2 sentences about coverage gaps, source quality limits, etc.>`

    const completion = await chatCompletion([
      { role: 'system', content: 'You are an evidence-grounded research assistant. Every claim must cite at least one source by [n]. Do not fabricate. If sources disagree, surface the contradiction. If evidence is insufficient, say so.' },
      { role: 'user', content: userPrompt },
    ])
    const text = completion?.content ?? ''

    // Parse sections
    const execM = text.match(/EXECUTIVE_SUMMARY:\s*([\s\S]*?)(?:\n\s*(?=KEY_FINDINGS:|$))/i)
    if (execM) executiveSummary = execM[1].trim()
    const kfM = text.match(/KEY_FINDINGS:\s*([\s\S]*?)(?:\n\s*(?=EVIDENCE:|$))/i)
    if (kfM) {
      keyFindings = kfM[1].split(/\n/).map((l) => l.replace(/^[-*]\s*/, '').trim()).filter((l) => l && !/^EVIDENCE:/i.test(l)).slice(0, 10)
    }
    const evM = text.match(/EVIDENCE:\s*([\s\S]*?)(?:\n\s*(?=CONTRADICTIONS:|$))/i)
    if (evM) {
      for (const line of evM[1].split(/\n/)) {
        const m = line.match(/^[-*]?\s*(.*?):\s*sources?\s*\[([0-9,\s]+)\]/i)
        if (m) {
          const srcIds = m[2].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n))
          evidence.push({ claim: m[1].trim(), sources: srcIds, support: srcIds.length >= 2 ? 'MULTI_SOURCE' : 'DIRECTLY_SUPPORTED' })
        }
      }
    }
    const conM = text.match(/CONTRADICTIONS:\s*([\s\S]*?)(?:\n\s*(?=LIMITATIONS:|$))/i)
    if (conM) {
      for (const line of conM[1].split(/\n/)) {
        if (/none/i.test(line) && !/:/i.test(line)) continue
        const m = line.match(/^[-*]?\s*(.+?)\s+vs\.?\s+(.+?):\s*(.+)$/i)
        if (m) contradictions.push({ a: m[1].trim(), b: m[2].trim(), reason: m[3].trim() })
      }
    }
    const limM = text.match(/LIMITATIONS:\s*([\s\S]*)$/i)
    if (limM) limitations = limM[1].trim()
    if (!executiveSummary) {
      executiveSummary = 'Research synthesis completed; see key findings below.'
    }
    if (!limitations) {
      limitations = sourcesList.length < 4
        ? 'Limited source coverage — only a small number of relevant documents were available in the index for this question.'
        : 'Sources retrieved from the local index; additional sources may exist outside our current crawl coverage.'
    }
  } catch (e: any) {
    executiveSummary = 'Research synthesis failed due to an LLM error; see the gathered sources below.'
    limitations = 'AI synthesis unavailable: ' + (e?.message ?? String(e))
  }
  steps[2].status = executiveSummary ? 'done' : 'failed'

  return {
    subQueries,
    steps,
    executiveSummary,
    keyFindings,
    evidence,
    contradictions,
    limitations,
    sources: sourcesList,
    generatedAt: new Date().toISOString(),
  }
}

// --- Knowledge Graph entity card -------------------------------------------
// Detects whether the query refers to a clear primary entity (a person,
// organization, place, technology, etc.) and, if so, extracts structured
// facts from the top retrieved sources. Returns null when no clear entity is
// detected (e.g., for vague or purely informational queries like "how to
// cook pasta"). The card is rendered to the side of the organic results.

const KNOWLEDGE_CARD_SYSTEM = `You are a knowledge-graph extractor for an independent search engine. Given a user query and a set of retrieved sources, decide whether the query refers to a SINGLE CLEAR PRIMARY ENTITY (a specific person, organization, place, product, technology, publication, event, or concept). If yes, extract structured facts about that entity using ONLY the provided sources — every fact must cite one or more source IDs in [n] format. If the query does NOT refer to a clear single entity, return { "entityDetected": false }. Do not fabricate. Do not use outside knowledge. Respond with valid JSON only — no markdown, no prose.`

export async function generateKnowledgeCard(
  query: string,
  results: SearchResultForAI[],
): Promise<KnowledgeCard | null> {
  if (results.length < 2) return null

  const context = assembleContext(results.slice(0, 6))
  const userPrompt = `Query: "${query}"

Retrieved sources:
${context}

Extract a knowledge card. Return JSON in EXACTLY this shape:
{
  "entityDetected": true | false,
  "entityName": "string (the entity's canonical name)",
  "entityType": "ORGANIZATION|PERSON|PLACE|PRODUCT|TECHNOLOGY|EVENT|PUBLICATION|CONCEPT",
  "description": "1-2 sentence summary of the entity, with [n] citations",
  "facts": [
    { "label": "Founded", "value": "1976", "citations": [1] },
    { "label": "Headquarters", "value": "Cupertino, California", "citations": [1, 2] }
  ]
}

Rules:
- Only set entityDetected=true if the query clearly refers to ONE specific entity.
- For "what is X" / "who is X" / "X" where X is a proper noun, entityDetected=true.
- For "how to X" / "best X" / "X vs Y" / vague queries, entityDetected=false.
- Every fact MUST cite at least one source [n] where n is the source index (1-based).
- Keep facts to 4-7 items max — only the most clearly supported ones.
- If sources don't clearly describe the entity, set entityDetected=false.`

  let raw: string | null = null
  try {
    const { chatCompletion } = await import('../llm')
    const completion = await chatCompletion([
      { role: 'system', content: KNOWLEDGE_CARD_SYSTEM },
      { role: 'user', content: userPrompt },
    ])
    raw = completion?.content ?? null
  } catch {
    return null
  }

  if (!raw || typeof raw !== 'string') return null

  // Extract the JSON object (LLMs sometimes wrap in ```json fences).
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  if (!parsed || parsed.entityDetected === false) return null
  if (!parsed.entityName || !parsed.entityType || !parsed.description) return null

  // Map citations: the LLM uses 1-based source indices into the top-N we
  // sent it. Map back to AICitation objects.
  const topForCitations = results.slice(0, 6)
  const citations: AICitation[] = topForCitations.map((r, i) => ({
    id: i + 1,
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    sourceType: r.sourceType,
  }))

  // Sanitize + validate facts.
  const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : []
  const facts: KnowledgeFact[] = []
  for (const f of rawFacts) {
    if (!f || typeof f.label !== 'string' || typeof f.value !== 'string') continue
    const cites = Array.isArray(f.citations)
      ? f.citations.filter((n: any) => typeof n === 'number' && n >= 1 && n <= citations.length)
      : []
    if (cites.length === 0) continue // require at least one citation per fact
    facts.push({ label: f.label, value: f.value, citations: cites })
    if (facts.length >= 7) break
  }

  if (facts.length === 0) return null

  // Confidence: HIGH if ≥3 distinct sources are cited across facts, MEDIUM
  // if 2, LOW if only 1.
  const distinctSources = new Set<number>()
  for (const f of facts) for (const c of f.citations) distinctSources.add(c)
  const confidenceClass: KnowledgeCard['confidenceClass'] =
    distinctSources.size >= 3 ? 'HIGH' : distinctSources.size === 2 ? 'MEDIUM' : 'LOW'

  return {
    entityName: String(parsed.entityName).slice(0, 200),
    entityType: String(parsed.entityType).slice(0, 50),
    description: String(parsed.description).slice(0, 600),
    facts,
    citations,
    confidenceClass,
    generatedAt: new Date().toISOString(),
  }
}

// --- Page reader / summarizer (advanced browser capability) ---------------
// When the user clicks "Summary" on a result, this reads the page's stored
// contentText from the index + synthesizes a structured summary with the LLM.
// This is the "advanced browser" feature: the user can read any page without
// leaving CIRKLE — the LLM extracts key points, a TL;DR, and notable facts.

export interface PageSummary {
  docId: string
  title: string
  url: string
  domain: string
  tldr: string             // 1-2 sentence "too long; didn't read"
  keyPoints: string[]      // 3-5 bullet points
  notableFacts: { label: string; value: string }[]
  summary: string          // ~200 word structured summary (markdown)
  readingTimeMinutes: number
  generatedAt: string
}

export async function summarizePage(
  docId: string,
): Promise<PageSummary | null> {
  // Fetch the document from the DB (we need contentText which isn't in the cache).
  const { db } = await import('@/lib/db')
  const doc = await db.document.findUnique({
    where: { id: docId },
    select: {
      id: true, title: true, url: true, domain: true, contentText: true,
      wordCount: true, sourceType: true, author: true, publisher: true,
      publishedAt: true, updatedAt: true,
    },
  })
  if (!doc || !doc.contentText) return null

  // Truncate the contentText to ~4000 chars to stay within LLM context limits.
  const content = doc.contentText.slice(0, 4000)

  const systemPrompt = `You are an expert page summarizer for an advanced search engine. Given the full text of a web page, produce a structured summary. Return ONLY valid JSON — no markdown, no prose outside JSON. The JSON must have this shape:
{
  "tldr": "1-2 sentence summary — the most important takeaway",
  "keyPoints": ["3-5 bullet points, each a complete sentence"],
  "notableFacts": [{"label": "Category", "value": "Detail"}],
  "summary": "~200 word structured summary in markdown format with ## sections"
}`

  const userPrompt = `Title: ${doc.title}
URL: ${doc.url}
Source type: ${doc.sourceType}
Author: ${doc.author ?? 'Unknown'}
Publisher: ${doc.publisher ?? 'Unknown'}

Full page text (first ~4000 chars):
${content}`

  let raw: string | null = null
  try {
    const { chatCompletion } = await import('../llm')
    const completion = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])
    raw = completion?.content ?? null
  } catch {
    return null
  }

  if (!raw) return null
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  const readingTimeMinutes = Math.max(1, Math.round((doc.wordCount ?? 0) / 200))

  return {
    docId: doc.id,
    title: doc.title,
    url: doc.url,
    domain: doc.domain,
    tldr: String(parsed.tldr ?? '').slice(0, 300),
    keyPoints: Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((p: any) => String(p).slice(0, 200)).slice(0, 7)
      : [],
    notableFacts: Array.isArray(parsed.notableFacts)
      ? parsed.notableFacts
          .filter((f: any) => f && typeof f.label === 'string' && typeof f.value === 'string')
          .map((f: any) => ({ label: String(f.label).slice(0, 50), value: String(f.value).slice(0, 200) }))
          .slice(0, 6)
      : [],
    summary: String(parsed.summary ?? '').slice(0, 2000),
    readingTimeMinutes,
    generatedAt: new Date().toISOString(),
  }
}
