/**
 * query-understanding.ts
 * -----------------------------------------------------------------------------
 * Rule-based query understanding (§8). Parses the user's raw query string
 * into a structured ParsedQuery that downstream ranking, AI, and filters can
 * consume.
 *
 * Supported operators:
 *   "quoted phrase"        -> phrases
 *   -exclusion             -> exclusions
 *   site:domain.com        -> domain filter (placed into filters)
 *   filetype:pdf           -> doc type filter
 *   lang:en                -> language
 *   region:US              -> country
 *   after:YYYY-MM-DD       -> date range start
 *   before:YYYY-MM-DD      -> date range end
 *   official:|academic:... -> sourcePreference
 *
 * Intent classification is rule-based keyword matching.
 *
 * expandQuery() optionally uses the LLM (unified client at ../llm —
 * Groq → Gemini → OpenRouter fallback chain) to suggest synonyms + related
 * questions. Server-side only — falls back to rule-based synonyms if LLM is
 * unavailable.
 * -----------------------------------------------------------------------------
 */

import { tokenize, removeStopwords, stem, normalize } from './text-processor'

export type QueryIntent =
  | 'navigational'
  | 'informational'
  | 'transactional'
  | 'commercial'
  | 'local'
  | 'news'
  | 'academic'
  | 'document'
  | 'entity'
  | 'media'
  | 'comparison'
  | 'research'

export type SourceType =
  | 'OFFICIAL'
  | 'GOVERNMENT'
  | 'ACADEMIC'
  | 'NEWS'
  | 'COMMUNITY'
  | 'COMMERCIAL'
  | 'PRIMARY'
  | 'WEB'

export interface ParsedQuery {
  original: string
  normalized: string
  tokens: string[]
  phrases: string[]
  exclusions: string[]
  intent: QueryIntent
  entities: { text: string; type: string }[]
  languages: string[]
  countries: string[]
  dateRange?: { start?: string; end?: string }
  sourcePreference?: SourceType
  modeHint?: string
  exactTerms: string[]
  // extra operator-extracted metadata
  site?: string
  filetype?: string
}

// ---- Intent rule tables ---------------------------------------------------

const INTENT_KEYWORDS: { intent: QueryIntent; words: string[] }[] = [
  { intent: 'commercial', words: ['buy','price','cheap','deal','discount','coupon','sale','shop','shopping','order','best price'] },
  { intent: 'transactional', words: ['download','sign up','register','subscribe','install','join','apply','book','reserve'] },
  { intent: 'informational', words: ['how','what','why','who','when','explain','guide','tutorial','examples','definition'] },
  { intent: 'news', words: ['news','today','latest','breaking','update','press','announced','report'] },
  { intent: 'academic', words: ['research','study','studies','paper','papers','arxiv','journal','academic','scholar'] },
  { intent: 'comparison', words: ['vs','versus','compare','comparison','or','better','alternative'] },
  { intent: 'local', words: ['near me','nearby','around me','closest','nearest'] },
  { intent: 'document', words: ['pdf','docs','documentation','manual','reference','spec','specification'] },
  { intent: 'media', words: ['image','images','picture','photo','video','videos','movie','movies','clip','clips'] },
  { intent: 'research', words: ['research','evidence','analysis','report','data','statistics','study'] },
]

const SOURCE_HINT_WORDS: { source: SourceType; words: string[] }[] = [
  { source: 'OFFICIAL', words: ['official','specification','spec','standard'] },
  { source: 'GOVERNMENT', words: ['government','gov','regulation','regulatory','law','statute','legal'] },
  { source: 'ACADEMIC', words: ['academic','scholarly','peer-reviewed','journal','university'] },
  { source: 'NEWS', words: ['news','breaking','press','report','coverage'] },
  { source: 'COMMUNITY', words: ['community','forum','discussion','stack overflow','reddit'] },
  { source: 'COMMERCIAL', words: ['buy','shop','price','store','deal'] },
]

function pickIntent(tokens: string[], raw: string): QueryIntent {
  const lowerRaw = raw.toLowerCase()
  // local: "near me" / "in <city>"
  if (/\bnear me\b/.test(lowerRaw) || /\bin\s+[a-z]+\b/i.test(lowerRaw)) {
    return 'local'
  }
  // Build a stem set for matching
  const stems = new Set(tokens.map((t) => stem(t)))
  // Score every intent by counting matched keywords
  const scores = new Map<QueryIntent, number>()
  for (const { intent, words } of INTENT_KEYWORDS) {
    let n = 0
    for (const w of words) {
      // Multi-word phrases need raw-string match
      if (w.includes(' ')) {
        if (lowerRaw.includes(w)) n++
      } else {
        if (stems.has(stem(w))) n++
      }
    }
    if (n > 0) scores.set(intent, n)
  }
  let best: QueryIntent = 'informational'
  let bestN = 0
  for (const [k, v] of scores) {
    if (v > bestN) {
      best = k
      bestN = v
    }
  }
  if (bestN === 0) {
    // Default: if query is a single token without verb, treat as navigational
    if (tokens.length === 1) return 'navigational'
    // single entity in caps
    if (raw.match(/^[A-Z][a-zA-Z]+$/)) return 'entity'
    return 'informational'
  }
  return best
}

// ---- Entity extraction (very small rule-based) ---------------------------

const ENTITY_HINTS: { pattern: RegExp; type: string }[] = [
  { pattern: /\b(?:Dr|Mr|Mrs|Ms|Prof)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, type: 'PERSON' },
  { pattern: /\b(?:the\s+)?([A-Z][a-zA-Z]+ (?:University|Institute|College|Hospital|Foundation))\b/g, type: 'ORGANIZATION' },
  { pattern: /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\s+(?:Inc|Ltd|LLC|Corp|Co|GmbH|AG|S.A.))\b/g, type: 'ORGANIZATION' },
  { pattern: /\b(New York|London|Paris|Tokyo|Beijing|Berlin|Madrid|Rome|San Francisco|Los Angeles|Chicago|Toronto|Sydney|Singapore|Dubai|Mumbai|Cairo)\b/g, type: 'PLACE' },
]

function extractEntities(raw: string): { text: string; type: string }[] {
  const out: { text: string; type: string }[] = []
  const seen = new Set<string>()
  for (const { pattern, type } of ENTITY_HINTS) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(raw)) !== null) {
      const text = (m[1] ?? m[0]).trim()
      const key = text + '|' + type
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ text, type })
    }
  }
  return out
}

// ---- Parser ---------------------------------------------------------------

/**
 * Parse a raw query into a ParsedQuery. Pure rule-based — no LLM calls.
 */
export function parseQuery(raw: string): ParsedQuery {
  const original = raw ?? ''
  let working = original

  // Pull quoted phrases first (preserve them as phrases)
  const phrases: string[] = []
  const phraseRe = /"([^"]+)"/g
  let pm: RegExpExecArray | null
  while ((pm = phraseRe.exec(working)) !== null) {
    phrases.push(pm[1].trim())
  }
  working = working.replace(phraseRe, ' ')

  // Pull operator tokens
  const operators: { key: string; val: string }[] = []
  const opRe = /(\b(?:site|filetype|lang|region|country|after|before|official|government|academic|news|community|commercial|primary|source|mode)):(\S+)/gi
  working = working.replace(opRe, (_match, key, val) => {
    operators.push({ key: key.toLowerCase(), val: val.toLowerCase() })
    return ' '
  })

  // Pull -exclusions
  const exclusions: string[] = []
  const exclRe = /\s-(\w+)/g
  working = working.replace(exclRe, (_m, w) => {
    exclusions.push(w.toLowerCase())
    return ' '
  })

  // What's left is the free-text query
  const normalized = normalize(working)
  const tokensAll = tokenize(working)
  const tokens = removeStopwords(tokensAll)
  // Apply stem AFTER collecting tokens (we still want to show the user-facing
  // tokens at the top, but ranking/indexer use stems).
  const intent = pickIntent(tokens, original)
  const entities = extractEntities(original)

  const pq: ParsedQuery = {
    original,
    normalized,
    tokens,
    phrases,
    exclusions,
    intent,
    entities,
    languages: [],
    countries: [],
    exactTerms: phrases.slice(),
  }

  // Apply operators
  for (const op of operators) {
    const v = op.val
    switch (op.key) {
      case 'site': pq.site = v; break
      case 'filetype': pq.filetype = v; break
      case 'lang': pq.languages.push(v); break
      case 'region': case 'country': pq.countries.push(v.toUpperCase()); break
      case 'after': pq.dateRange = { ...(pq.dateRange ?? {}), start: v }; break
      case 'before': pq.dateRange = { ...(pq.dateRange ?? {}), end: v }; break
      case 'mode': pq.modeHint = v.toUpperCase(); break
      case 'official': pq.sourcePreference = 'OFFICIAL'; break
      case 'government': pq.sourcePreference = 'GOVERNMENT'; break
      case 'academic': pq.sourcePreference = 'ACADEMIC'; break
      case 'news': pq.sourcePreference = 'NEWS'; break
      case 'community': pq.sourcePreference = 'COMMUNITY'; break
      case 'commercial': pq.sourcePreference = 'COMMERCIAL'; break
      case 'primary': pq.sourcePreference = 'PRIMARY'; break
      case 'source': {
        const upper = v.toUpperCase() as SourceType
        if (['OFFICIAL','GOVERNMENT','ACADEMIC','NEWS','COMMUNITY','COMMERCIAL','PRIMARY','WEB'].includes(upper)) {
          pq.sourcePreference = upper
        }
        break
      }
      default: break
    }
  }

  // SourcePreference from keyword hints if not explicitly set
  if (!pq.sourcePreference) {
    const stems = new Set(tokens.map((t) => stem(t)))
    for (const { source, words } of SOURCE_HINT_WORDS) {
      for (const w of words) {
        if (w.includes(' ')) {
          if (normalized.includes(w)) { pq.sourcePreference = source; break }
        } else {
          if (stems.has(stem(w))) { pq.sourcePreference = source; break }
        }
      }
      if (pq.sourcePreference) break
    }
  }

  // If intent is news and we don't yet have a source pref, set NEWS.
  if (!pq.sourcePreference && intent === 'news') {
    pq.sourcePreference = 'NEWS'
  }
  if (!pq.sourcePreference && intent === 'academic') {
    pq.sourcePreference = 'ACADEMIC'
  }

  return pq
}

// ---- expandQuery (LLM-assisted, server-side only) -------------------------

const FALLBACK_SYNONYM_RULES: { match: RegExp; replacements: string[] }[] = [
  { match: /\b(running|jogging)\b/i, replacements: ['running','jogging','sprint'] },
  { match: /\bcar\b/i, replacements: ['car','automobile','vehicle'] },
  { match: /\b(big|large|huge)\b/i, replacements: ['big','large','huge','massive'] },
  { match: /\b(good|great|excellent)\b/i, replacements: ['good','great','excellent','best'] },
  { match: /\b(start|begin|launch)\b/i, replacements: ['start','begin','launch','initiate'] },
  { match: /\b(stop|halt|end)\b/i, replacements: ['stop','halt','end','cease'] },
  { match: /\b(search|find|lookup)\b/i, replacements: ['search','find','lookup','discover'] },
]

/**
 * Expand the query with synonyms + related questions.
 * Server-side only — uses the unified LLM client (../llm) via chatCompletion.
 * If the LLM call fails (or returns malformed output), we fall back to
 * rule-based synonyms.
 */
export async function expandQuery(
  parsed: ParsedQuery
): Promise<{ synonyms: string[]; relatedQuestions: string[] }> {
  const synonyms: Set<string> = new Set()
  const relatedQuestions: string[] = []

  // Rule-based synonyms first (always available).
  for (const t of parsed.tokens) {
    for (const rule of FALLBACK_SYNONYM_RULES) {
      if (rule.match.test(t)) {
        for (const r of rule.replacements) {
          if (r.toLowerCase() !== t.toLowerCase()) synonyms.add(r.toLowerCase())
        }
      }
    }
    // Singular/plural variations
    if (t.endsWith('s') && t.length > 3) {
      synonyms.add(t.slice(0, -1))
    } else {
      synonyms.add(t + 's')
    }
  }

  // Try LLM for richer suggestions (server-side only).
  try {
    const { chatCompletion } = await import('../llm')
    const prompt = `For the query "${parsed.original}", suggest 3-5 synonyms or related search terms (just the words, one per line) and 3-5 related questions users might also ask (one per line, starting with "?"). Respond in this format:

SYNONYMS:
<word>
<word>
...

QUESTIONS:
?<question>
?<question>
...`

    const completion = await chatCompletion([
      { role: 'system', content: 'You are a search query expansion assistant. Output only the synonyms and questions.' },
      { role: 'user', content: prompt },
    ])

    const text: string = completion?.content ?? ''

    if (text) {
      const synMatch = text.match(/SYNONYMS:\s*([\s\S]*?)(?:\n\s*QUESTIONS:|$)/i)
      if (synMatch) {
        for (const line of synMatch[1].split(/\n/)) {
          const s = line.replace(/^[-*]\s*/, '').trim().toLowerCase()
          if (s && s.length > 1 && !s.includes('?')) synonyms.add(s)
        }
      }
      const qMatch = text.match(/QUESTIONS:\s*([\s\S]*)$/i)
      if (qMatch) {
        for (const line of qMatch[1].split(/\n/)) {
          const s = line.replace(/^\??\s*/, '').replace(/^\?\s*/, '').trim()
          if (s && s.length > 3 && s.length < 200) {
            relatedQuestions.push(s.endsWith('?') ? s : s + '?')
          }
        }
      }
    }
  } catch {
    // LLM unavailable — fall back to rule-based synonyms only.
  }

  // If LLM gave us no questions, synthesize a few from the query intent.
  if (relatedQuestions.length === 0) {
    const q = parsed.tokens.slice(0, 6).join(' ')
    if (parsed.intent === 'informational') {
      relatedQuestions.push(`What is ${q}?`)
      relatedQuestions.push(`Why does ${q} matter?`)
      relatedQuestions.push(`How does ${q} work?`)
    } else if (parsed.intent === 'commercial') {
      relatedQuestions.push(`What are the best ${q} options?`)
      relatedQuestions.push(`How much does ${q} cost?`)
    } else {
      relatedQuestions.push(`What is ${q}?`)
      relatedQuestions.push(`Latest news about ${q}?`)
    }
  }

  return {
    synonyms: Array.from(synonyms).slice(0, 8),
    relatedQuestions: relatedQuestions.slice(0, 5),
  }
}
