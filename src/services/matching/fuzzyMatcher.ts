/**
 * Fuzzy Matcher — uses Fuse.js for tolerant medicine name matching.
 * Handles OCR errors like "TRICHOSPIRE M" → "Trichospire-M"
 *
 * Improvements over v1:
 * - INN → brand synonym table (Paracetamol → Dolo, Crocin, Calpol, etc.)
 * - Searches mini index AND letter bucket simultaneously, merges results
 * - Lower threshold fallback when no result found at normal threshold
 */

import Fuse, { type IFuseOptions } from 'fuse.js'
import type { SlimMedicineEntry, FuzzyMatchResult } from '@/types'

let fuseInstance: Fuse<SlimMedicineEntry> | null = null
let loadedLetter: string | null = null
let miniIndex: SlimMedicineEntry[] = []
let miniLoaded = false

// Mini-index Fuse (always available after seed)
let miniFuse: Fuse<SlimMedicineEntry> | null = null

const FUSE_OPTIONS: IFuseOptions<SlimMedicineEntry> = {
  keys: [
    { name: 'b',  weight: 0.70 },   // brandName  — primary signal
    { name: 'g',  weight: 0.25 },   // genericName — secondary
    { name: 'm',  weight: 0.05 },   // manufacturer — almost ignored (prevents e.g. "Pan" in "Pan Pharma" driving match)
  ],
  threshold:          0.35,          // tighter: 0 = exact, 1 = anything
  distance:           200,
  minMatchCharLength: 3,             // raised from 2 to avoid single-letter noise
  includeScore:       true,
  useExtendedSearch:  true,
  shouldSort:         true,
}

// ─── INN → Brand synonym table ───────────────────────────────────────────────
/**
 * Maps common INN (generic) names to brand names to expand the search.
 * When OCR extracts "Paracetamol", we also search for "Dolo", "Crocin", etc.
 */
const INN_TO_BRANDS: Record<string, string[]> = {
  paracetamol:      ['Dolo', 'Crocin', 'Calpol', 'Tylenol', 'Panadol', 'Metacin'],
  ibuprofen:        ['Brufen', 'Advil', 'Nurofen', 'Combiflam'],
  amoxicillin:      ['Mox', 'Amoxil', 'Wymox', 'Novamox'],
  azithromycin:     ['Zithromax', 'Azithral', 'Azee', 'Zady', 'Zithrox'],
  cetirizine:       ['Zyrtec', 'Cetriz', 'Alerid', 'CTZ'],
  omeprazole:       ['Omez', 'Prilosec', 'Losec'],
  pantoprazole:     ['Pantop', 'Pan', 'Pantocid', 'Protonix'],
  metformin:        ['Glucophage', 'Glycomet', 'Obimet', 'Gluconorm'],
  atorvastatin:     ['Lipitor', 'Atorva', 'Storvas'],
  diclofenac:       ['Voveran', 'Voltaren', 'Dicloran'],
  levofloxacin:     ['Levaquin', 'Levoflox', 'Ciplox-L'],
  ciprofloxacin:    ['Cipro', 'Ciplox', 'Cifran'],
  cefixime:         ['Cefix', 'Taxim-O', 'Suprax'],
  metronidazole:    ['Flagyl', 'Metro', 'Metrogyl'],
  domperidone:      ['Domstal', 'Motilium', 'Vomistop'],
  ondansetron:      ['Zofran', 'Emeset', 'Ondem'],
  montelukast:      ['Singulair', 'Montek', 'Romilast'],
  salbutamol:       ['Ventolin', 'Asthalin', 'Proventil'],
  losartan:         ['Cozaar', 'Losacar', 'Losar'],
  amlodipine:       ['Norvasc', 'Amlopress', 'Amlodac'],
  telmisartan:      ['Micardis', 'Telma', 'Telsartan'],
  rosuvastatin:     ['Crestor', 'Rozucor', 'Rosuvas'],
  rabeprazole:      ['Aciphex', 'Razo', 'Rablet'],
  levothyroxine:    ['Eltroxin', 'Thyrox', 'Synthroid'],
  prednisolone:     ['Wysolone', 'Omnacortil', 'Deltasone'],
  dexamethasone:    ['Decadron', 'Dexona', 'Decdan'],
  aspirin:          ['Ecosprin', 'Disprin', 'Loprin'],
  clopidogrel:      ['Plavix', 'Clopilet', 'Deplatt'],
  glimepiride:      ['Amaryl', 'Glimpid', 'Glimestar'],
  sitagliptin:      ['Januvia', 'Sitaday', 'Istamet'],
  hydroxychloroquine: ['Plaquenil', 'HCQ', 'Hcqs'],
  doxycycline:      ['Doxy', 'Doxt', 'Vibramycin'],
  aceclofenac:      ['Aceclo', 'Acenac', 'Zerodol'],
  nimesulide:       ['Nise', 'Nimulid', 'Nicip'],
  pregabalin:       ['Lyrica', 'Pregabalin-75', 'Gabapin'],
}

// ─── Index Management ────────────────────────────────────────────────────────

/** Seed the mini index (top-5000 medicines) for instant offline search */
export async function seedMiniIndex(): Promise<void> {
  if (miniLoaded) return
  try {
    const res = await fetch('/src/database/medicines_mini_index.json')
    miniIndex  = await res.json() as SlimMedicineEntry[]
    miniLoaded = true
    miniFuse   = new Fuse(miniIndex, FUSE_OPTIONS)
    // Also set as default bucket fuse so first search always has something
    fuseInstance  = miniFuse
    loadedLetter  = '__mini__'
  } catch (err) {
    console.warn('[FuzzyMatcher] Could not load mini index:', err)
  }
}

/** Lazy-load the alphabetical letter bucket for a given query */
async function loadBucketForQuery(query: string): Promise<void> {
  const firstChar = query.trim().toLowerCase().replace(/[^a-z]/g, '')[0]
  if (!firstChar || firstChar === loadedLetter) return

  try {
    const res = await fetch(`/src/database/index_buckets/bucket_${firstChar}.json`)
    if (!res.ok) throw new Error(`Bucket not found: ${firstChar}`)
    const bucket  = await res.json() as SlimMedicineEntry[]
    fuseInstance  = new Fuse(bucket, FUSE_OPTIONS)
    loadedLetter  = firstChar
  } catch {
    // Fall back to mini index if bucket unavailable
    if (miniFuse) fuseInstance = miniFuse
  }
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

/** Convert Fuse.js score (0=perfect, 1=worst) to 0–100 */
function fuseScoreToPercent(score: number | undefined): number {
  if (score === undefined) return 0
  return Math.round((1 - score) * 100)
}

/** Determine which fields actually contributed to the match */
function determineMatchedOn(
  entry: SlimMedicineEntry,
  query: string
): FuzzyMatchResult['matchedOn'] {
  const q       = query.toLowerCase()
  const prefix  = q.substring(0, Math.min(5, q.length))
  const matched: FuzzyMatchResult['matchedOn'] = []
  if (entry.b?.toLowerCase().includes(prefix)) matched.push('brandName')
  if (entry.g?.toLowerCase().includes(prefix)) matched.push('genericName')
  if (entry.m?.toLowerCase().includes(prefix)) matched.push('manufacturer')
  return matched.length > 0 ? matched : ['brandName']
}

// ─── Core Search ─────────────────────────────────────────────────────────────

/**
 * Search for medicines matching a single query string.
 * Searches the letter bucket AND the mini index, merges by highest score.
 *
 * @param query      — OCR-extracted term (brand name, INN, etc.)
 * @param maxResults — max results to return
 * @param threshold  — minimum similarity 0–100
 */
export async function fuzzySearch(
  query: string,
  maxResults = 5,
  threshold  = 70      // raised from 60 → 70 to reduce false positives
): Promise<FuzzyMatchResult[]> {
  if (!query || query.trim().length < 2) return []

  const cleanQuery = query.trim().replace(/[^a-zA-Z0-9\s\-\.]/g, ' ').replace(/\s+/g, ' ').trim()

  // Load the bucket for this query's first letter
  await loadBucketForQuery(cleanQuery)

  const byId = new Map<string, FuzzyMatchResult>()

  // Search letter bucket
  if (fuseInstance) {
    for (const r of fuseInstance.search(cleanQuery, { limit: maxResults * 3 })) {
      const score = fuseScoreToPercent(r.score)
      if (score >= threshold) {
        const existing = byId.get(r.item.id)
        if (!existing || score > existing.score) {
          byId.set(r.item.id, { medicine: r.item, score, matchedOn: determineMatchedOn(r.item, cleanQuery) })
        }
      }
    }
  }

  // Always also search mini index (catches top medicines the bucket may lack)
  if (miniFuse && fuseInstance !== miniFuse) {
    for (const r of miniFuse.search(cleanQuery, { limit: maxResults * 3 })) {
      const score = fuseScoreToPercent(r.score)
      if (score >= threshold) {
        const existing = byId.get(r.item.id)
        if (!existing || score > existing.score) {
          byId.set(r.item.id, { medicine: r.item, score, matchedOn: determineMatchedOn(r.item, cleanQuery) })
        }
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

/**
 * Search using multiple terms (brand name + generic name + manufacturer).
 * Also expands INN names to known brand synonyms.
 * Falls back to a lower threshold if nothing found at the requested threshold.
 *
 * @param terms     — array of OCR-extracted strings (nulls are filtered)
 * @param threshold — minimum similarity 0–100 (default 60)
 */
export async function fuzzySearchMulti(
  terms: (string | null)[],
  threshold = 70        // raised from 60 → 70
): Promise<FuzzyMatchResult[]> {
  const validTerms = terms.filter((t): t is string => Boolean(t && t.length >= 3))  // min 3 chars
  if (validTerms.length === 0) return []

  // Expand terms with INN synonyms
  const expandedTerms = new Set<string>(validTerms)
  for (const term of validTerms) {
    const key = term.toLowerCase().replace(/[^a-z]/g, '')
    const synonyms = INN_TO_BRANDS[key]
    if (synonyms) synonyms.forEach((s) => expandedTerms.add(s))
  }

  const runSearch = async (thr: number) => {
    const allResults = await Promise.all(
      Array.from(expandedTerms).map((t) => fuzzySearch(t, 10, thr))
    )
    const byId = new Map<string, FuzzyMatchResult>()
    for (const results of allResults) {
      for (const r of results) {
        const existing = byId.get(r.medicine.id)
        if (!existing || r.score > existing.score) {
          byId.set(r.medicine.id, r)
        }
      }
    }
    return Array.from(byId.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }

  // Try at requested threshold first
  let results = await runSearch(threshold)

  // Fallback: drop to 50 if nothing found (handles OCR noise on brand names)
  if (results.length === 0 && threshold > 50) {
    results = await runSearch(50)
  }

  return results
}
