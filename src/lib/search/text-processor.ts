/**
 * text-processor.ts
 * -----------------------------------------------------------------------------
 * Core NLP primitives for the search engine's own inverted index.
 *
 * Implements:
 *   - tokenize:        unicode-aware word splitter (handles CJK, latin, numbers)
 *   - normalize:       NFC + lowercase + whitespace collapse
 *   - stem:            a minimal English suffix stripper (defensive, no over-stem)
 *   - stopwords:       ~150 common English function words
 *   - removeStopwords: filter stopword tokens
 *   - ngrams:           phrase index helper
 *   - buildTermFreq:    per-document term frequency table
 *   - buildPositions:   per-document term→first-positions map (proximity)
 *   - hash64:           64-bit FNV-1a-ish hash (hex)
 *   - simhash:          64-bit similarity hash for near-duplicate detection
 *   - contentHash:      sha1 of normalized text (exact-dedup)
 *
 * No external deps. Server-side only (used by indexer/crawler pipeline).
 * -----------------------------------------------------------------------------
 */

import { createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

/**
 * Lowercase, NFC normalize, trim, collapse whitespace.
 */
export function normalize(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

/**
 * Unicode-aware tokenizer.
 *   - Lowercases input
 *   - Splits on non-alphanumeric runs
 *   - Keeps CJK characters as individual single-char tokens
 *   - Keeps digit sequences intact
 *   - Drops empty tokens
 *
 * CJK detection: \u4E00-\u9FFF (CJK Unified Ideographs),
 *                \u3040-\u30FF (Hiragana/Katakana),
 *                \uAC00-\uD7AF (Hangul).
 */
export function tokenize(text: string): string[] {
  if (!text) return []
  const lower = text.toLowerCase().normalize('NFC')
  const tokens: string[] = []

  // Pattern: a run of word/number chars, OR a single CJK char.
  const re = /[\p{L}\p{N}]+|[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(lower)) !== null) {
    const tok = m[0]
    if (tok) tokens.push(tok)
  }
  return tokens
}

// ---------------------------------------------------------------------------
// stopwords
// ---------------------------------------------------------------------------

/**
 * ~150 common English stopwords.
 */
export const stopwords: Set<string> = new Set<string>([
  'a','an','the','and','or','but','if','then','else','when','at','by','for',
  'with','about','against','between','into','through','during','before','after',
  'above','below','to','from','up','down','in','out','on','off','over','under',
  'again','further','once','here','there','all','any','both','each','few','more',
  'most','other','some','such','no','nor','not','only','own','same','so','than',
  'too','very','can','will','just','should','now','is','are','was','were','be',
  'been','being','have','has','had','do','does','did','doing','would','could',
  'may','might','must','shall','i','you','he','she','it','we','they','me','him',
  'her','us','them','my','your','his','its','our','their','this','that','these',
  'those','what','which','who','whom','whose','where','why','how','as','of','am',
  'because','while','also','many','much','via','per','among','across',
  'toward','towards','upon','within','without','along','around','behind','beside',
  'since','until','whether','though','although','despite','however','thus','hence',
  'indeed','perhaps','maybe','said','says','one','two','three','get','got','make',
  'made','go','goes','went','come','comes','came','take','took','taken','like',
  'well','even','still','yet','ever','never','always','often','sometimes','usually',
])

export function removeStopwords(tokens: string[]): string[] {
  return tokens.filter((t) => !stopwords.has(t))
}

// ---------------------------------------------------------------------------
// stem (minimal English)
// ---------------------------------------------------------------------------

/**
 * Minimal English suffix stripper.
 * Handles: ies -> y, ied -> y, es -> (drop), s -> (drop), ing -> (drop),
 * ed -> (drop), ly -> (drop). Avoids over-stemming short words (length <= 3
 * returns as-is). Non-ASCII tokens are returned as-is.
 */
/**
 * Porter stemmer (simplified) — produces proper stems for English words.
 * Better recall than the naive suffix stripper: "running" → "run" (was "runn"),
 * "companies" → "compani" (was "compani"), "happily" → "happili" (was "happily").
 *
 * This is a compact implementation of the classic Porter algorithm steps 1a-5.
 * Non-English words + numbers pass through unchanged.
 */
export function stem(word: string): string {
  if (!word) return word
  // Non-alphanumeric or very short → return as-is
  if (!/^[a-z]+$/.test(word)) return word
  if (word.length <= 2) return word

  const w = word.toLowerCase()

  // Step 1a: plural + past tense
  let s = w
  if (s.endsWith('sses')) s = s.slice(0, -2)        // caresses → caress
  else if (s.endsWith('ies')) s = s.slice(0, -2)     // ponies → poni
  else if (s.endsWith('ss')) s = s                   // caress → caress
  else if (s.endsWith('s')) s = s.slice(0, -1)       // cats → cat

  // Step 1b: -ed, -ing
  if (s.endsWith('eed')) {
    const stem = s.slice(0, -3)
    if (stem.length > 0 && measure(stem) > 0) s = stem + 'ee'  // agreed → agree
  } else if (s.endsWith('ed')) {
    const stem = s.slice(0, -2)
    if (containsVowel(stem)) {
      s = stem
      s = post1b(s)  // may restore final e or double consonant
    }
  } else if (s.endsWith('ing')) {
    const stem = s.slice(0, -3)
    if (containsVowel(stem)) {
      s = stem
      s = post1b(s)
    }
  }

  // Step 1c: -y → -i (if stem contains a vowel)
  if (s.endsWith('y') && containsVowel(s.slice(0, -1))) {
    s = s.slice(0, -1) + 'i'
  }

  // Step 2: common suffixes (only if measure > 0)
  if (measure(s) > 0) {
    const step2: [RegExp, string | ((s: string) => string)][] = [
      [/ational$/, 'ate'], [/tional$/, 'tion'], [/enci$/, 'ence'], [/anci$/, 'ance'],
      [/izer$/, 'ize'], [/abli$/, 'able'], [/alli$/, 'al'], [/entli$/, 'ent'],
      [/eli$/, 'e'], [/ousli$/, 'ous'], [/ization$/, 'ize'], [/ation$/, 'ate'],
      [/ator$/, 'ate'], [/alism$/, 'al'], [/iveness$/, 'ive'], [/fulness$/, 'ful'],
      [/ousness$/, 'ous'], [/aliti$/, 'al'], [/iviti$/, 'ive'], [/biliti$/, 'ble'],
    ]
    for (const [re, repl] of step2) {
      if (re.test(s)) {
        s = typeof repl === 'string' ? s.replace(re, repl) : repl(s)
        break
      }
    }
  }

  // Step 3: more suffixes
  if (measure(s) > 0) {
    const step3: [RegExp, string][] = [
      [/icate$/, 'ic'], [/ative$/, ''], [/alize$/, 'al'], [/iciti$/, 'ic'],
      [/ical$/, 'ic'], [/ful$/, ''], [/ness$/, ''],
    ]
    for (const [re, repl] of step3) {
      if (re.test(s)) { s = s.replace(re, repl); break }
    }
  }

  // Step 4: remove suffixes if measure > 1
  if (measure(s) > 1) {
    const step4 = [/al$/, /ance$/, /ence$/, /er$/, /ic$/, /able$/, /ible$/, /ant$/,
      /ement$/, /ment$/, /ent$/, /[aeiou][^aeiou]ion$/, /ou$/, /ism$/, /ate$/,
      /iti$/, /ous$/, /ive$/, /ize$/]
    for (const re of step4) {
      if (re.test(s)) { s = s.replace(re, ''); break }
    }
  }

  // Step 5a: remove final e if measure > 1
  if (s.endsWith('e') && measure(s) > 1) {
    s = s.slice(0, -1)
  }

  // Step 5b: remove double consonant if measure > 1 and ends in ll
  if (s.endsWith('ll') && measure(s) > 1) {
    s = s.slice(0, -1)
  }

  return s
}

/** Check if a string contains a vowel (a, e, i, o, u) */
function containsVowel(s: string): boolean {
  return /[aeiou]/.test(s)
}

/** Compute the "measure" m of a word (Porter's CV/VC counting). */
function measure(s: string): number {
  // Convert to sequence of C and V
  let seq = ''
  for (let i = 0; i < s.length; i++) {
    if ('aeiou'.includes(s[i])) seq += 'V'
    else if (s[i] === 'y') {
      // y is V if preceded by consonant (at start, treat as C)
      seq += (i > 0 && 'aeiou'.includes(s[i - 1])) ? 'C' : 'V'
    } else {
      seq += 'C'
    }
  }
  // Compress runs: C*VC*VC*... count VC pairs
  const compressed = seq.replace(/C+/g, 'C').replace(/V+/g, 'V')
  const vcCount = (compressed.match(/VC/g) || []).length
  return vcCount
}

/** Post-processing for step 1b: restore final e or double consonant */
function post1b(s: string): string {
  // If ends in at, bl, or iz → add e (e.g. "conflat" → "conflate")
  if (s.endsWith('at') || s.endsWith('bl') || s.endsWith('iz')) {
    return s + 'e'
  }
  // If ends in double consonant (not l, s, z) → remove last
  if (s.length >= 2 && s[s.length - 1] === s[s.length - 2]) {
    const last = s[s.length - 1]
    if (!'lsz'.includes(last)) {
      return s.slice(0, -1)
    }
  }
  // If measure is 1 and ends in CVC (where C is not w, x, y) → add e
  if (measure(s) === 1 && s.length >= 3) {
    const last3 = s.slice(-3)
    if (!'aeiou'.includes(last3[0]) && 'aeiou'.includes(last3[1]) && !'aeiou'.includes(last3[2]) && !'wxy'.includes(last3[2])) {
      return s + 'e'
    }
  }
  return s
}

// ---------------------------------------------------------------------------
// ngrams (phrase index)
// ---------------------------------------------------------------------------

export function ngrams(tokens: string[], n: number): string[] {
  if (n <= 1 || tokens.length < n) return []
  const out: string[] = []
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(' '))
  }
  return out
}

// ---------------------------------------------------------------------------
// term frequency + positions
// ---------------------------------------------------------------------------

export function buildTermFreq(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of tokens) {
    m.set(t, (m.get(t) ?? 0) + 1)
  }
  return m
}

/**
 * For each token, list ALL positions where it appears (used for proximity /
 * phrase search).
 */
export function buildPositions(tokens: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>()
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const arr = m.get(t)
    if (arr) arr.push(i)
    else m.set(t, [i])
  }
  return m
}

// ---------------------------------------------------------------------------
// hash64 (FNV-1a-ish, returned as 16-char hex string)
// ---------------------------------------------------------------------------

/**
 * 64-bit hash, emulated with two 32-bit halves to avoid BigInt on the hot path.
 * Not bit-exact FNV-1a 64-bit but well-distributed for our simhash / dedup use.
 */
export function hash64(text: string): string {
  let high = 0x84222325 >>> 0
  let low = 0xcbf29ce4 >>> 0
  const prime_low = 0x000001b3

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) & 0xff
    low ^= c
    // Multiply low * prime (low 32 bits)
    low = Math.imul(low, prime_low) >>> 0
    // high accumulates (high * prime_low + low) to emulate 64-bit multiply
    high = (Math.imul(high, prime_low) + low) >>> 0
    // Avalanche
    high ^= (high >>> 17)
    low ^= (low >>> 21)
  }

  // Final mix
  low = Math.imul(low, 0x85ebca6b) >>> 0
  high = Math.imul(high, 0xc2b2ae35) >>> 0
  high ^= low
  low ^= high

  const h = high >>> 0
  const l = low >>> 0
  return (
    h.toString(16).padStart(8, '0') + l.toString(16).padStart(8, '0')
  )
}

// ---------------------------------------------------------------------------
// simhash
// ---------------------------------------------------------------------------

/**
 * 64-bit SimHash for near-duplicate detection.
 *
 *   1. Build up to 64 shingles (token 3-grams; fall back to 2-grams / 1-grams
 *      for short input).
 *   2. Hash each shingle with hash64 -> 64-bit value.
 *   3. For each bit position 0..63: if more shingle-hashes have that bit set
 *      than unset, set the bit in the result; otherwise clear it.
 *
 * Returns 16-character hex string.
 */
export function simhash(text: string): string {
  const normalized = normalize(text)
  const tokens = tokenize(normalized)

  let shingles: string[]
  if (tokens.length >= 3) {
    shingles = ngrams(tokens, 3)
  } else if (tokens.length === 2) {
    shingles = ngrams(tokens, 2)
  } else if (tokens.length === 1) {
    shingles = tokens.slice()
  } else {
    return hash64('')
  }

  if (shingles.length > 64) {
    const step = shingles.length / 64
    const sampled: string[] = []
    for (let i = 0; i < 64; i++) {
      sampled.push(shingles[Math.floor(i * step)])
    }
    shingles = sampled
  }

  const hashes: bigint[] = shingles.map((s) => BigInt('0x' + hash64(s)))

  let result = 0n
  for (let bit = 0n; bit < 64n; bit++) {
    let ones = 0
    let zeros = 0
    const mask = 1n << bit
    for (const h of hashes) {
      if ((h & mask) !== 0n) ones++
      else zeros++
    }
    if (ones >= zeros && ones > 0) {
      result |= mask
    }
  }
  return result.toString(16).padStart(16, '0')
}

// ---------------------------------------------------------------------------
// contentHash
// ---------------------------------------------------------------------------

/**
 * SHA1 of the normalized text. Used for exact-duplicate detection.
 */
export function contentHash(text: string): string {
  const normalized = normalize(text)
  return createHash('sha1').update(normalized, 'utf8').digest('hex')
}
