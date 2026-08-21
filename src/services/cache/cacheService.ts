/**
 * Cache Service — IndexedDB adapter for online-retrieved medicine entries.
 *
 * Responsibilities:
 *  - Store medicines fetched from online sources (OpenFDA etc.)
 *  - Serve cached results on repeat lookups without a network call
 *  - Never overwrite entries marked as _isVerified = true
 *  - Track cache metadata: source, timestamp, version
 *
 * Uses the `idb` library (already in package.json) for a clean Promise API.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { MedicineEntry, CachedMedicineEntry, CacheStats } from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME    = 'mediverify-cache'
const DB_VERSION = 1
const STORE_NAME = 'online-medicine-cache'
const CACHE_SCHEMA_VERSION = 1

// ─── DB Singleton ────────────────────────────────────────────────────────────

let _db: IDBPDatabase | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('by-source',    '_cacheSource', { unique: false })
        store.createIndex('by-cachedAt',  '_cachedAt',    { unique: false })
      }
    },
  })
  return _db
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve a cached medicine entry by its ID.
 * Returns null if not found or cache is unavailable.
 */
export async function getCachedMedicine(id: string): Promise<CachedMedicineEntry | null> {
  try {
    const db = await getDb()
    return (await db.get(STORE_NAME, id)) ?? null
  } catch (err) {
    console.warn('[CacheService] getCachedMedicine failed:', err)
    return null
  }
}

/**
 * Search for a cached medicine by brand name (case-insensitive prefix search).
 * Uses a linear scan — acceptable for a small cache (< 1000 entries).
 */
export async function findCachedByName(query: string): Promise<CachedMedicineEntry | null> {
  if (!query || query.trim().length < 2) return null
  try {
    const db = await getDb()
    const all: CachedMedicineEntry[] = await db.getAll(STORE_NAME)
    const q = query.toLowerCase().trim()
    return all.find(
      (e) =>
        e.brandName?.toLowerCase().includes(q) ||
        e.genericName?.toLowerCase().includes(q) ||
        e._searchTokens?.some((t) => t.includes(q))
    ) ?? null
  } catch (err) {
    console.warn('[CacheService] findCachedByName failed:', err)
    return null
  }
}

/**
 * Store a MedicineEntry in the IndexedDB cache.
 * Will NOT overwrite an existing entry where _isVerified = true.
 *
 * @param entry  - the MedicineEntry to cache
 * @param source - human-readable source label (e.g. 'OpenFDA')
 */
export async function cacheMedicine(entry: MedicineEntry, source: string): Promise<void> {
  try {
    const db = await getDb()

    // Check if existing entry is verified — never overwrite
    const existing: CachedMedicineEntry | undefined = await db.get(STORE_NAME, entry.id)
    if (existing?._isVerified) {
      console.info(`[CacheService] Skipping overwrite of verified entry: ${entry.id}`)
      return
    }

    const cached: CachedMedicineEntry = {
      ...entry,
      _cachedAt:     Date.now(),
      _cacheSource:  source,
      _cacheVersion: CACHE_SCHEMA_VERSION,
      _isVerified:   false,
    }
    await db.put(STORE_NAME, cached)
  } catch (err) {
    console.warn('[CacheService] cacheMedicine failed:', err)
  }
}

/**
 * Check if a medicine ID is already in the cache.
 */
export async function isCached(id: string): Promise<boolean> {
  try {
    const db = await getDb()
    const entry = await db.getKey(STORE_NAME, id)
    return entry !== undefined
  } catch {
    return false
  }
}

/**
 * Get statistics about the cache (count, last updated timestamp).
 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const db   = await getDb()
    const all: CachedMedicineEntry[] = await db.getAll(STORE_NAME)
    const count = all.length
    const lastUpdated = count > 0
      ? Math.max(...all.map((e) => e._cachedAt))
      : null
    // Rough size estimate: average JSON serialized entry ~1.5 KB
    const sizeEstimateKb = Math.round(count * 1.5)
    return { count, lastUpdated, sizeEstimateKb }
  } catch {
    return { count: 0, lastUpdated: null, sizeEstimateKb: 0 }
  }
}

/**
 * Clear all non-verified entries from the cache.
 * Verified entries (from trusted DB imports) are preserved.
 */
export async function clearCache(includeVerified = false): Promise<number> {
  try {
    const db  = await getDb()
    const all: CachedMedicineEntry[] = await db.getAll(STORE_NAME)
    let removed = 0
    for (const entry of all) {
      if (includeVerified || !entry._isVerified) {
        await db.delete(STORE_NAME, entry.id)
        removed++
      }
    }
    return removed
  } catch (err) {
    console.warn('[CacheService] clearCache failed:', err)
    return 0
  }
}

/**
 * Get all cached entries (for admin/debug purposes).
 */
export async function getAllCachedEntries(): Promise<CachedMedicineEntry[]> {
  try {
    const db = await getDb()
    return db.getAll(STORE_NAME)
  } catch {
    return []
  }
}
