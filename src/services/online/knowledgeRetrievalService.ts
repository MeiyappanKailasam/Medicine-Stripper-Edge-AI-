/**
 * Online Knowledge Retrieval Service
 *
 * Orchestrates medicine lookups from external sources with caching:
 *  1. Check IndexedDB cache first (instant, offline-capable)
 *  2. If not cached: fetch from OpenFDA API
 *  3. Normalize retrieved data to MedicineEntry schema
 *  4. Store in IndexedDB for future offline access
 *  5. Never overwrite verified local DB entries
 *
 * Future providers can be added by implementing the KnowledgeProvider interface
 * and adding them to the PROVIDERS array.
 */

import type { MedicineEntry, OnlineRetrievalResult } from '@/types'
import { getCachedMedicine, findCachedByName, cacheMedicine } from '@/services/cache/cacheService'
import { fetchMedicineOnline } from './openFDAClient'
import { makeId } from '@/utils/idUtils'

// ─── Provider Interface ───────────────────────────────────────────────────────

/**
 * Interface that all online knowledge providers must implement.
 * Add new providers here (e.g. RxNorm, WHO, 1mg, Pharmeasy) in the future.
 */
interface KnowledgeProvider {
  /** Human-readable name shown in the UI (e.g. 'OpenFDA') */
  name: string
  /** True if this provider should be tried */
  isAvailable(): boolean
  /** Fetch and normalize medicine data */
  fetch(query: string): Promise<MedicineEntry | null>
}

// ─── Provider Implementations ─────────────────────────────────────────────────

/**
 * OpenFDA provider — wraps the existing openFDAClient
 */
const openFdaProvider: KnowledgeProvider = {
  name: 'OpenFDA',
  isAvailable: () => navigator.onLine,
  async fetch(query: string): Promise<MedicineEntry | null> {
    const result = await fetchMedicineOnline(query)
    return result.status === 'found' ? result.medicine : null
  },
}

/**
 * TODO: RxNorm provider
 * Implement when RxNorm API access is available.
 * Reference: https://rxnav.nlm.nih.gov/RxNormAPIs.html
 */
// const rxNormProvider: KnowledgeProvider = {
//   name: 'RxNorm',
//   isAvailable: () => navigator.onLine,
//   async fetch(_query: string): Promise<MedicineEntry | null> {
//     // TODO: implement RxNorm lookup
//     return null
//   },
// }

/**
 * Active provider list — tried in order, stops at first result.
 */
const PROVIDERS: KnowledgeProvider[] = [
  openFdaProvider,
  // rxNormProvider,   // add here when implemented
]

// ─── Main Retrieval Function ──────────────────────────────────────────────────

/**
 * Retrieve medicine knowledge for a given query string.
 *
 * Flow:
 *  1. Check IndexedDB cache by name → return if found
 *  2. Try each provider in order → normalize → cache → return
 *  3. On failure: return not_found / offline gracefully
 *
 * @param query - Medicine name (OCR-extracted brand or generic name)
 */
export async function retrieveMedicineKnowledge(
  query: string
): Promise<OnlineRetrievalResult> {
  if (!query || query.trim().length < 2) {
    return _notFound('Empty query')
  }

  const cleanQuery = query.trim()

  // ── Step 1: Check IndexedDB cache ────────────────────────────────────────
  const id = makeId(cleanQuery)
  const cachedById = await getCachedMedicine(id)
  if (cachedById) {
    return {
      status:           'found_in_cache',
      medicine:         cachedById,
      source:           `Cache (${cachedById._cacheSource})`,
      cached:           true,
      cachedAt:         cachedById._cachedAt,
      offlineAvailable: true,
    }
  }

  // Name-based cache search (handles slight name variations)
  const cachedByName = await findCachedByName(cleanQuery)
  if (cachedByName) {
    return {
      status:           'found_in_cache',
      medicine:         cachedByName,
      source:           `Cache (${cachedByName._cacheSource})`,
      cached:           true,
      cachedAt:         cachedByName._cachedAt,
      offlineAvailable: true,
    }
  }

  // ── Step 2: Check online availability ────────────────────────────────────
  if (!navigator.onLine) {
    return {
      status:           'offline',
      medicine:         null,
      source:           'None (offline)',
      cached:           false,
      cachedAt:         null,
      offlineAvailable: false,
    }
  }

  // ── Step 3: Try each provider ─────────────────────────────────────────────
  for (const provider of PROVIDERS) {
    if (!provider.isAvailable()) continue

    try {
      const medicine = await provider.fetch(cleanQuery)

      if (medicine) {
        // Cache for offline use
        await cacheMedicine(medicine, provider.name)

        return {
          status:           'found',
          medicine,
          source:           provider.name,
          cached:           false,
          cachedAt:         null,
          offlineAvailable: true,   // just cached it
        }
      }
    } catch (err) {
      console.warn(`[KnowledgeRetrieval] Provider ${provider.name} failed:`, err)
      // Continue to next provider
    }
  }

  // ── All providers exhausted ───────────────────────────────────────────────
  return _notFound(cleanQuery)
}

/** Helper: build a not_found result */
function _notFound(query: string): OnlineRetrievalResult {
  return {
    status:           'not_found',
    medicine:         null,
    source:           `All providers tried for "${query}"`,
    cached:           false,
    cachedAt:         null,
    offlineAvailable: false,
  }
}
