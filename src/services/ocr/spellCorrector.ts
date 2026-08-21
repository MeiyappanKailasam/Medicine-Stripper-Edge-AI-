/**
 * Spell Corrector — Rule-based OCR error correction for medicine names.
 *
 * Handles pharmaceutical-specific OCR misreads without any external dependencies.
 * Corrections are applied in priority order:
 *  1. Exact token replacements (most specific, highest confidence)
 *  2. Pattern-based corrections (digit/letter confusion in brand names)
 *  3. Suffix / dosage form normalization
 *
 * Examples:
 *   DOLO65O    → DOLO 650
 *   TRICHOSPIRE M → Trichospire-M
 *   AugMENTlN  → Augmentin
 *   Pantop4Zole → Pantoprazole
 */

// ─── Token Replacement Dictionary ─────────────────────────────────────────────

/**
 * Maps common OCR misreads to their correct form.
 * Keys are lowercased for case-insensitive matching.
 * Applied at word/token level.
 */
const TOKEN_CORRECTIONS: Record<string, string> = {
  // Digit-embedded brand name corrections
  'dolo65o':      'DOLO 650',
  'dol0650':      'DOLO 650',
  'dolo6so':      'DOLO 650',
  'croc1n':       'Crocin',
  'calc1um':      'Calcium',
  'v1tamin':      'Vitamin',
  'asp1rin':      'Aspirin',
  'ibuprofeln':   'Ibuprofen',
  'ibupr0fen':    'Ibuprofen',
  'amox1cillin':  'Amoxicillin',
  'azithromyc1n': 'Azithromycin',
  'metform1n':    'Metformin',
  'atorvastat1n': 'Atorvastatin',
  'pantopraz0le': 'Pantoprazole',
  'pantop4zole':  'Pantoprazole',
  'omepraz0le':   'Omeprazole',
  'cetiriz1ne':   'Cetirizine',
  'levofloxac1n': 'Levofloxacin',
  'ciprofloxac1n':'Ciprofloxacin',
  'cef1xime':     'Cefixime',
  'metronidaz0le':'Metronidazole',
  'domperid0ne':  'Domperidone',
  'monteluka5t':  'Montelukast',
  'pregabal1n':   'Pregabalin',
  'losart4n':     'Losartan',
  'amlod1pine':   'Amlodipine',
  'telmis4rtan':  'Telmisartan',
  'rosuvastat1n': 'Rosuvastatin',
  'rabepraz0le':  'Rabeprazole',

  // Common brand name OCR errors
  'augmentin':    'Augmentin',     // catches AugMENTlN etc.
  'trichospire':  'Trichospire',
  'trichospir':   'Trichospire',
  'combifl4m':    'Combiflam',
  'comb1flam':    'Combiflam',
  'glucoph4ge':   'Glucophage',
  'glucom3t':     'Glycomet',

  // Dosage form misreads
  'tabl3t':       'Tablet',
  'tabiet':       'Tablet',
  'tab|et':       'Tablet',
  'caps|e':       'Capsule',
  'capsu|e':      'Capsule',
  'symp':         'Syrup',
  'syr':          'Syrup',
  'iniection':    'Injection',
  'inlection':    'Injection',
  'supensi0n':    'Suspension',
  'suspens10n':   'Suspension',

  // Unit misreads
  'rng':          'mg',
  'mcq':          'mcg',
  'mi':           'ml',     // only when standalone
}

// ─── Pattern-based Corrections ────────────────────────────────────────────────

/**
 * Pattern corrections applied to individual tokens.
 * These handle the structural OCR errors in brand + strength combos.
 */
const PATTERN_CORRECTIONS: [RegExp, string][] = [
  // Digit-letter confusions within strength values already in brand names
  // e.g. "DOLO65O" → "DOLO 650": split brand from strength
  [/^([A-Z]{3,}[-\s]?)([0-9]+)([oO])$/i,          '$1$2' + '0'],
  [/^([A-Z]{3,}[-\s]?)([oO0])([0-9]+)$/i,          '$1' + '0$3'],

  // Brand name with embedded digit confusion: "PANTOP4O" → "PANTOP40"
  [/([A-Za-z])([Oo])([0-9])/g,                     '$10$3'],
  [/([0-9])([Oo])([A-Za-z])/g,                     '$10$3'],

  // "l" as "1" inside numeric strength suffix: "5Omg" → "50mg"
  [/([0-9])l(mg|mcg|ml|g)\b/gi,                    '$11$2'],

  // Rogue comma inside numbers: "1,000mg" → "1000mg"
  [/(\d),(\d{3})(mg|mcg|g|ml)/gi,                  '$1$2$3'],

  // Extra spaces between number and unit: "50 mg" → keep, "50  mg" → "50 mg"
  [/(\d)\s{2,}(mg|mcg|ml|g|iu|%)/gi,              '$1 $2'],
]

// ─── Core Correction Logic ────────────────────────────────────────────────────

/**
 * Apply token-level corrections (dictionary lookup).
 */
function correctTokens(text: string): string {
  return text
    .split(/\b/)
    .map((token) => {
      const lower = token.toLowerCase().replace(/[^a-z0-9]/g, '')
      return TOKEN_CORRECTIONS[lower] ?? token
    })
    .join('')
}

/**
 * Apply pattern-based corrections.
 */
function applyPatternCorrections(text: string): string {
  let result = text
  for (const [pattern, replacement] of PATTERN_CORRECTIONS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Normalize common Tesseract segmentation errors around hyphens in brand names.
 * "Trichospire M" → "Trichospire-M" when M is a known suffix.
 */
function fixBrandHyphenation(text: string): string {
  // Known single-letter / short suffixes that should be hyphenated
  const SUFFIXES = /\b([A-Z][a-z]{4,})\s+([A-Z]{1,3}|[A-Z][a-z]{1,3}|[0-9]+[A-Z]{1,2})\b/g
  return text.replace(SUFFIXES, (_, brand, suffix) => {
    // Only hyphenate if both parts look like a medicine brand pattern
    if (/^[A-Z]/.test(brand) && /^[A-Z0-9]/.test(suffix)) {
      return `${brand}-${suffix}`
    }
    return `${brand} ${suffix}`
  })
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Apply pharmaceutical OCR spell correction to a cleaned text string.
 * Should be called AFTER normalizeOcrText() from textCleaner.ts.
 *
 * @param text - Pre-cleaned OCR text
 * @returns Spell-corrected text
 */
export function correctOcrSpelling(text: string): string {
  if (!text) return ''

  let result = text

  // 1. Token dictionary corrections
  result = correctTokens(result)

  // 2. Pattern corrections
  result = applyPatternCorrections(result)

  // 3. Brand hyphenation normalization
  result = fixBrandHyphenation(result)

  return result
}

/**
 * Correct a single extracted field value (e.g. brandName after extraction).
 * Less aggressive than full-text correction.
 */
export function correctFieldValue(value: string | null): string | null {
  if (!value) return null
  const lower = value.toLowerCase().trim().replace(/\s+/g, ' ')
  // Check direct dictionary hit first
  if (TOKEN_CORRECTIONS[lower.replace(/[^a-z0-9]/g, '')]) {
    return TOKEN_CORRECTIONS[lower.replace(/[^a-z0-9]/g, '')]
  }
  // Otherwise apply pattern corrections only
  return applyPatternCorrections(value).trim() || null
}
