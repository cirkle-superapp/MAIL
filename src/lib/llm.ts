/**
 * llm.ts
 * -----------------------------------------------------------------------------
 * Unified LLM client replacing z-ai-web-dev-sdk.
 *
 * Providers (all free tiers):
 *   1. Gemini (Google AI) — primary, for complex reasoning (AI answers, knowledge cards)
 *   2. Groq — ultra-fast for instant answers (lowest latency)
 *   3. OpenRouter — multi-model fallback
 *
 * All providers use simple REST API calls (no SDK needed — just fetch()).
 * The client tries providers in order: Groq (fast) → Gemini (smart) → OpenRouter (fallback).
 * -----------------------------------------------------------------------------
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const GROQ_KEY = process.env.GROQ_API_KEY || ''
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || ''

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletion {
  content: string | null
  provider: string
}

/** Call Groq (ultra-fast, OpenAI-compatible API). */
async function callGroq(messages: ChatMessage[]): Promise<ChatCompletion | null> {
  try {
    // Convert system → assistant for Groq compatibility
    const mapped = messages.map(m => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    }))
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: mapped,
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    return { content, provider: 'groq' }
  } catch {
    return null
  }
}

/** Call Gemini (Google AI Studio, REST API). */
async function callGemini(messages: ChatMessage[]): Promise<ChatCompletion | null> {
  try {
    // Convert messages to Gemini format (contents array)
    const systemMsg = messages.find(m => m.role === 'system')
    const userMsgs = messages.filter(m => m.role !== 'system')
    const contents = userMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const body: any = {
      contents,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    }
    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: systemMsg.content }],
      }
    }
    const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) return null
    return { content, provider: 'gemini' }
  } catch {
    return null
  }
}

/** Call OpenRouter (multi-model, OpenAI-compatible API). */
async function callOpenRouter(messages: ChatMessage[]): Promise<ChatCompletion | null> {
  try {
    const mapped = messages.map(m => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    }))
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cirkle-mail.vercel.app',
        'X-Title': 'CIRKLE Search',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct:free',
        messages: mapped,
        temperature: 0.3,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) return null
    return { content, provider: 'openrouter' }
  } catch {
    return null
  }
}

/**
 * Unified chat completion — tries Groq (fast) → Gemini (smart) → OpenRouter (fallback).
 * Returns the first successful response.
 */
export async function chatCompletion(messages: ChatMessage[]): Promise<ChatCompletion | null> {
  // Try Groq first (ultra-fast, ~1-2s)
  const groqResult = await callGroq(messages)
  if (groqResult) return groqResult

  // Try Gemini next (smart, ~3-5s)
  const geminiResult = await callGemini(messages)
  if (geminiResult) return geminiResult

  // Try OpenRouter last (fallback)
  const orResult = await callOpenRouter(messages)
  if (orResult) return orResult

  return null
}

/**
 * DuckDuckGo Instant Answer API — replaces z-ai web_search.
 * Free, no API key, returns search results + instant answers.
 */
export async function webSearch(query: string, num: number = 8): Promise<any[]> {
  try {
    // DuckDuckGo HTML search (free, no key needed)
    const resp = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CirkleBot/1.0)',
        },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!resp.ok) return []
    const html = await resp.text()

    // Parse results from DuckDuckGo HTML (result links + snippets)
    const results: any[] = []
    const blocks = html.match(/<a rel="nofollow" class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi) || []
    const links = html.match(/<a rel="nofollow" class="result__a"[^>]*href="([^"]+)"/gi) || []

    for (let i = 0; i < Math.min(blocks.length, num); i++) {
      const linkMatch = links[i]?.match(/href="([^"]+)"/)
      const titleMatch = blocks[i].match(/<a rel="nofollow" class="result__a"[^>]*>([\s\S]*?)<\/a>/)
      const snippetMatch = blocks[i].match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)

      let url = linkMatch ? linkMatch[1] : ''
      // DuckDuckGo uses redirect URLs — extract the actual URL
      const ddgRedirect = url.match(/uddg=([^&]+)/)
      if (ddgRedirect) url = decodeURIComponent(ddgRedirect[1])

      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

      if (url && title) {
        let domain = ''
        try { domain = new URL(url).hostname } catch { domain = '' }
        results.push({
          name: title,
          url,
          snippet,
          host_name: domain,
        })
      }
    }
    return results
  } catch {
    return []
  }
}
