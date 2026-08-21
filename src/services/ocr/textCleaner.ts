/**
 * Text Cleaner — Normalizes raw OCR output from medicine strip images.
 *
 * Handles:
 *  - Extra / irregular whitespace
 *  - OCR punctuation artifacts (stray dots, pipes, underscores used as lines)
 *  - Incorrect all-caps or inconsistent capitalization
 *  - Common ligature recognition errors (fi, fl, ffi, rn→m)
 *  - Non-standard Unicode lookalikes (em-dash, smart quotes, etc.)
 */

// ─── Character Substitution Map ───────────────────────────────────────────────

/**
 * OCR commonly confuses certain character sequences.
 * Applied at the raw character level before tokenization.
 */
const CHAR_FIXES: [RegExp, string][] = [
  // Ligatures incorrectly recognized as two characters
  [/ﬁ/g, 'fi'],
  [/ﬂ/g, 'fl'],
  [/ﬃ/g, 'ffi'],
  [/ﬄ/g, 'ffl'],
  [/ﬀ/g, 'ff'],

  // Unicode lookalikes
  [/['']/g, "'"],           // smart single quotes
  [/[""]/g, '"'],           // smart double quotes
  [/[–—]/g, '-'],           // em/en dash → hyphen
  [/…/g, '...'],

  // OCR separator lines (often recognized as underscores, pipes, dashes, tildes)
  [/[_|~]{2,}/g, ' '],

  // Bullet / separator characters
  [/[•·∙▪▸►◆◇]/g, ' '],

  // Registered / trademark symbols (common on medicine labels)
  [/[®™©]/g, ''],

  // Remove control characters
  // eslint-disable-next-line no-control-regex
  [/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''],
]

// ─── Word-level OCR Fixes ─────────────────────────────────────────────────────

/**
 * In numeric contexts OCR confuses O↔0 and l/I↔1.
 * These fixes are context-sensitive (only applied adjacent to digits).
 */
function fixDigitLetterConfusion(text: string): string {
  return text
    // "mg" strength values: 65O → 650, 5OO → 500 (O between digits)
    .replace(/(\d)[oO](\d)/g, '$10$2')
    // Leading O before digits in numbers: O5 → 05 (but not in words)
    .replace(/\bO(\d{2,})\b/g, '0$1')
    // Trailing l after digits: 50l → 501 (but not "ml")
    .replace(/(\d)l\b(?![\s]*m)/g, '$11')
    // "l" as standalone number: " l " → " 1 "
    .replace(/\bl\b/g, '1')
    // I as 1 in numeric contexts: I50mg → 150mg
    .replace(/\bI(\d)/g, '1$1')
    // Lowercase L as 1 before mg/mcg/ml
    .replace(/\bl(\d+\s*(?:mg|mcg|ml|g))/gi, '1$1')
}

// ─── Whitespace / Structure Normalization ─────────────────────────────────────

/**
 * Normalize whitespace and line structure in OCR output.
 */
function normalizeWhitespace(text: string): string {
  return text
    // Replace tabs with space
    .replace(/\t/g, ' ')
    // Collapse multiple spaces on same line
    .replace(/ {2,}/g, ' ')
    // Remove spaces at start/end of each line
    .split('\n').map((l) => l.trim()).join('\n')
    // Collapse 3+ consecutive empty lines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Capitalization Fixes ─────────────────────────────────────────────────────

/**
 * Fix medicine-label-specific capitalization issues.
 * Brand names should be Title Case or ALL CAPS — leave them.
 * Label keywords (MFG, EXP, BATCH) should be normalized.
 */
function fixCapitalization(text: string): string {
  return text
    // Fix common label keywords that OCR sometimes lowercases
    .replace(/\b(mfg|mfd|exp|batch|lot|b\.no)\b/gi, (m) => m.toUpperCase())
    // "IP" / "BP" / "USP" pharmacopoeial designations
    .replace(/\b(ip|bp|usp|ep|jp)\b/gi, (m) => m.toUpperCase())
    // "Rx" symbol
    .replace(/\brx\b/gi, 'Rx')
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Normalize raw OCR text from a medicine strip image.
 *
 * @param raw - Raw string from Tesseract.js
 * @returns Cleaned, normalized string ready for field extraction
 */
export function normalizeOcrText(raw: string): string {
  if (!raw) return ''

  let text = raw

  // 1. Character-level substitutions
  for (const [pattern, replacement] of CHAR_FIXES) {
    text = text.replace(pattern, replacement)
  }

  // 2. Digit/letter confusion in numeric contexts
  text = fixDigitLetterConfusion(text)

  // 3. Whitespace and structure
  text = normalizeWhitespace(text)

  // 4. Capitalization of label keywords
  text = fixCapitalization(text)

  return text
}

/**
 * Normalize a specific field value (brand name, manufacturer, etc.)
 * Lighter version for post-extraction field cleanup.
 */
export function normalizeFieldValue(value: string | null): string | null {
  if (!value) return null
  let v = value
  for (const [pattern, replacement] of CHAR_FIXES) {
    v = v.replace(pattern, replacement)
  }
  return v.replace(/\s+/g, ' ').trim() || null
}
