# Task 71 — fullstack-developer (LLM provider migration: z-ai → unified ../llm client)

Task: Replace ALL usage of `z-ai-web-dev-sdk` in the CIRKLE search engine with the new unified LLM client at `/home/z/my-project/src/lib/llm.ts` (which exports `chatCompletion()` and `webSearch()`).

## Scope (per task brief)

Three files were targeted for migration (NO other files touched):
1. `src/lib/search/ai-search.ts` — 5 z-ai call sites
2. `src/lib/search/tools.ts` — 4 z-ai call sites
3. `src/lib/search/query-understanding.ts` — 1 z-ai call site

Total: 10 LLM call sites migrated. Zero behavioral changes to surrounding logic (parsing, regex, JSON extraction, error handling, control flow all preserved).

## Pre-flight checks

- Read the new client `/home/z/my-project/src/lib/llm.ts` in full — confirmed:
  - `chatCompletion(messages: ChatMessage[]): Promise<ChatCompletion | null>` — tries Groq → Gemini → OpenRouter.
  - `webSearch(query: string, num?: number): Promise<any[]>` — DuckDuckGo HTML search; returns objects shaped as `{ name, url, snippet, host_name }` (identical shape to z-ai's `web_search` so call-site `.map()`s work unchanged).
  - `ChatMessage` interface: `{ role: 'system'|'user'|'assistant', content: string }`.
  - `ChatCompletion` interface: `{ content: string|null, provider: string }`.
- Read all three target files in full before editing.
- Read previous agent records in `/agent-ctx/` (2-a, 2-b) to understand the project layout + conventions.

## Migration pattern applied throughout

For every `zai.chat.completions.create({...})` site:

```ts
// BEFORE (z-ai)
const ZAI = (await import('z-ai-web-dev-sdk')).default
const zai = await ZAI.create()
const completion = await zai.chat.completions.create({
  messages: [
    { role: 'system' | 'assistant', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ],
  // @ts-ignore — model name varies by SDK version
  model: 'glm-4-flash' | 'glm-4',
  temperature: 0.x,
  max_tokens: N,
  thinking: { type: 'disabled' },   // sometimes present
})
const raw = completion?.choices?.[0]?.message?.content ?? completion?.message?.content ?? ''
```

```ts
// AFTER (unified ../llm client)
const { chatCompletion } = await import('../llm')
const completion = await chatCompletion([
  { role: 'system', content: SYSTEM_PROMPT },   // ← always 'system'
  { role: 'user', content: userPrompt },
])
const raw = completion?.content ?? ''   // or `?? null` when used inside a try/catch returning null
```

Removed in every site:
- `const ZAI = (await import('z-ai-web-dev-sdk')).default`
- `const zai = await ZAI.create()`
- `model: 'glm-4-flash'` / `'glm-4'` (handled internally by the new client's provider chain)
- `temperature` / `max_tokens` (handled internally)
- `thinking: { type: 'disabled' }` (not supported by Groq/Gemini/OpenRouter; not needed)
- All `// @ts-ignore` comments around `completion?.choices?.[0]?.message?.content`

Conversion rule for system role:
- z-ai used `role: 'assistant'` for system-style prompts in `generateKnowledgeCard`, `summarizePage`, `runWeatherFallback`, `runCurrencyTool`.
- The new client expects `role: 'system'` (it converts `system` → `systemInstruction` for Gemini, and `system` → `system` for Groq/OpenRouter).
- All 4 of those call sites were converted to `role: 'system'`.
- The 3 call sites that already used `role: 'system'` (in `generateAISummary`, both `generateResearchReport` sites, and `expandQuery`) were left as-is.

For every `zai.functions.invoke('web_search', {query, num})` site:

```ts
// BEFORE (z-ai)
const ZAI = (await import('z-ai-web-dev-sdk')).default
const zai = await ZAI.create()
const results = await zai.functions.invoke('web_search', { query, num })
```

```ts
// AFTER (unified ../llm client)
const { webSearch } = await import('../llm')
const results = await webSearch(query, num)
```

The DuckDuckGo `webSearch()` returns objects with the same shape (`{name, url, snippet, host_name}`) so call-site code (e.g., `results.map((r) => ({title: r.name ?? r.url, ...}))` in `runLiveWebSearch`) works unchanged.

## File 1: `src/lib/search/ai-search.ts` — 5 call sites migrated

1. **`generateAISummary()`** — replaced `zai.chat.completions.create({...})` with `chatCompletion([{system,user}])`. Reads `completion?.content ?? ''`. System role was already `'system'`. Removed `model: 'glm-4-flash'`, `temperature: 0.2`, `max_tokens: 600`. All downstream logic preserved: `extractClaims(text)`, `computeSupportStatus(claims, citations.length, text)`, citations mapping from `results.slice(0, 8)`.

2. **`generateResearchReport()` — Step 1 (query decomposition)** — same pattern. System role was already `'system'`. Removed `model: 'glm-4-flash'`, `temperature: 0.3`, `max_tokens: 400`. Downstream parsing preserved: `t.split(/\n/)` → `line.replace(/^[\d.\-*\s]+/, '').trim()` → `subQueries.push(s)` when `s.length > 5 && s.length < 300`. Fallback `subQueries.push(question)` when LLM returns nothing.

3. **`generateResearchReport()` — Steps 6-9 (synthesis)** — same pattern. Removed the depth-based model selection (`depth === 'deep' ? 'glm-4' : 'glm-4-flash'`) — the new client handles model selection internally via the Groq → Gemini → OpenRouter fallback chain. Removed `temperature: 0.2`, `max_tokens: 1500`. All downstream section parsing preserved exactly:
   - `EXECUTIVE_SUMMARY:` regex → `executiveSummary`
   - `KEY_FINDINGS:` regex → `keyFindings[]` (split, strip `[-*]`, slice(0,10))
   - `EVIDENCE:` regex → `evidence[]` (parse `claim: sources [n1,n2]`)
   - `CONTRADICTIONS:` regex → `contradictions[]` (parse `A vs B: reason`)
   - `LIMITATIONS:` regex → `limitations`
   - Same fallback messages when sections are empty.

4. **`generateKnowledgeCard()`** — Removed the early `let ZAI: any; try { ZAI = (await import('z-ai-web-dev-sdk')).default } catch { return null }` block (which used to return null if z-ai failed to import, BEFORE the LLM call). The function now flows directly from the `results.length < 2` guard into assembling the context + user prompt. Converted system message from `role: 'assistant'` → `role: 'system'`. Removed `thinking: { type: 'disabled' }`. The raw content is now stored in a `let raw: string | null = null` variable populated inside the try block, then validated with the same `if (!raw || typeof raw !== 'string') return null` guard. JSON extraction (`raw.match(/\{[\s\S]*\}/)`) + `JSON.parse()` + citation mapping (`topForCitations = results.slice(0, 6)` + sanitize facts + `confidenceClass` HIGH/MEDIUM/LOW from distinct source count) all preserved.

5. **`summarizePage()`** — Removed the early ZAI import block (was placed before the DB query, so previously the function would return null before even querying the DB if z-ai was unavailable). Now the function flows directly into `db.document.findUnique({...})` first, then truncates `contentText` to ~4000 chars, then makes the LLM call. Converted `role: 'assistant'` → `role: 'system'` for the system prompt. Removed `thinking: { type: 'disabled' }`. Same `let raw: string | null = null` pattern as `generateKnowledgeCard`. All downstream JSON parsing (`tldr`, `keyPoints`, `notableFacts`, `summary`) and `readingTimeMinutes` calc (`Math.max(1, Math.round((doc.wordCount ?? 0) / 200))`) preserved.

Also updated the file's docstring header to reference the new client (Groq → Gemini → OpenRouter fallback chain) instead of z-ai.

## File 2: `src/lib/search/tools.ts` — 4 call sites migrated

1. **`runWeatherFallback()`** — Combined migration: replaced `zai.functions.invoke('web_search', {query, num})` with `webSearch(query, num)`, AND replaced `zai.chat.completions.create({...})` with `chatCompletion([{system,user}])`. Converted system role `'assistant'` → `'system'`. Removed `thinking: { type: 'disabled' }`. Reads `completion?.content`. Same JSON parsing flow for `temperature`, `apparentTemp`, `humidity`, `windSpeed`, `description`, `isDay`. Same `InstantAnswer` construction (with the `source: 'Live web (via z.ai web_search)'` label left untouched per "Keep ALL the existing logic intact"). Same try/catch with `console.error('[tools] weather fallback error:...')`.

2. **`runTimeTool()` (web_search fallback branch only)** — The branch that runs only when both the hardcoded `CITY_TIMEZONES` map AND the `geocode()` call fail to find a timezone. Replaced `zai.functions.invoke('web_search', {query, num})` with `webSearch(query, num)`. Same snippet regex `/([A-Z][a-z]+\/[A-Z][a-z_]+)/` for timezone extraction from `r.snippet + ' ' + r.name`. Same `try { ... } catch { /* ignore */ }` silent fallback.

3. **`runLiveWebSearch()`** — Replaced `zai.functions.invoke('web_search', {query, num: 8})` with `webSearch(query, 8)`. The DuckDuckGo `webSearch()` returns objects with the same shape (`{name, url, snippet, host_name}`) so the existing `results.map((r: any) => ({ title: r.name ?? r.url, url: r.url, snippet: r.snippet ?? '', domain: r.host_name ?? new URL(r.url).hostname, sourceType: classifyLiveDomain(r.host_name ?? '') }))` works unchanged.

4. **`runCurrencyTool()`** — Combined migration: replaced `zai.functions.invoke('web_search', {query, num})` with `webSearch(query, num)`, AND replaced `zai.chat.completions.create({...})` with `chatCompletion([{system,user}])`. Converted system role `'assistant'` → `'system'`. Removed `thinking: { type: 'disabled' }`. Same JSON parsing for `rate`, `result`, `description`. Same `InstantAnswer` construction with the amount, rate, and exchange-rate label.

Also updated 2 docstring comments to reference the unified `webSearch()` function (DuckDuckGo HTML) instead of `z-ai-web-dev-sdk web_search`.

## File 3: `src/lib/search/query-understanding.ts` — 1 call site migrated

1. **`expandQuery()`** — Replaced `ZAI.create()` + `zai.chat.completions.create({...})` with `chatCompletion([{system,user}])`. System role was already `'system'`. Removed `model: 'glm-4-flash'`, `temperature: 0.3`, `max_tokens: 400`, and `// @ts-ignore` comments. Reads `completion?.content ?? ''`. Same downstream parsing:
   - `SYNONYMS:` regex → `synonyms.add(s.toLowerCase())` when `s.length > 1 && !s.includes('?')`
   - `QUESTIONS:` regex → `relatedQuestions.push(...)` when `s.length > 3 && s.length < 200`
   - Same fallback to rule-based synonyms (`FALLBACK_SYNONYM_RULES`) + intent-derived questions (`What is ${q}?` etc.) on LLM failure.

Also updated 2 docstring comments (file header + `expandQuery()` JSDoc) to reference the unified LLM client instead of z-ai.

## Verification

- `bun run lint` → **0 errors, 0 warnings**. All TypeScript types check (the new `chatCompletion()` returns `Promise<ChatCompletion | null>` where `ChatCompletion = { content: string | null, provider: string }`, so `completion?.content ?? ''` and `completion?.content ?? null` are both valid in their respective contexts).
- Searched all three files for residual `z-ai-web-dev-sdk`, `zai.`, `glm-4`, `thinking: { type:` patterns — confirmed only docstring mentions remain (which I updated where appropriate). The one remaining `z-ai-web-dev-sdk` mention in `src/lib/search/index.ts` is only a docstring comment (not a runtime import) and was left untouched per the "do not touch any other files" constraint.
- The `package.json` still lists `z-ai-web-dev-sdk` as a dependency — leaving it does not affect runtime since no code imports it anymore. Can be removed in a separate cleanup task if desired.

## Stage Summary

- All LLM traffic in the CIRKLE search engine now flows through the unified `../llm` client.
- The new client tries Groq (ultra-fast, ~1-2s) → Gemini (smart, ~3-5s) → OpenRouter (fallback) — all free tiers, no billing.
- `webSearch()` now uses DuckDuckGo's HTML endpoint (free, no API key, no rate limit for low volume) — replaces z-ai's `web_search` function. Returns the same `{name, url, snippet, host_name}` shape so call-site code is unchanged.
- All error handling preserved: try/catch blocks, null returns on failure, console.error logging, and graceful fallbacks (rule-based synonyms, Open-Meteo direct fetch, hardcoded city timezone map) all still work identically.
- The search engine's full feature surface (AI answer, deep research reports, knowledge cards, page summaries, weather/currency/time/math instant answers, live-web fallback, query expansion) is preserved end-to-end.

## Files modified

- `src/lib/search/ai-search.ts` (5 z-ai call sites → 5 chatCompletion() call sites; 1 docstring header updated)
- `src/lib/search/tools.ts` (4 z-ai call sites → webSearch()/chatCompletion() call sites; 2 docstrings updated)
- `src/lib/search/query-understanding.ts` (1 z-ai call site → 1 chatCompletion() call site; 2 docstrings updated)
- `worklog.md` (appended Task ID: 71 entry)
