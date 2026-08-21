/**
 * Medicine Database Service
 * Loads full medicine entries from chunked JSON files.
 * Caches chunks in memory to avoid repeat fetches.
 */

import type { MedicineEntry, DbMeta } from '@/types'

let dbMeta: DbMeta | null = null
const chunkCache = new Map<number, MedicineEntry[]>()

/** Load and cache the db_meta.json manifest */
async function getDbMeta(): Promise<DbMeta> {
  if (dbMeta) return dbMeta
  const res = await fetch('/src/database/db_meta.json')
  if (!res.ok) throw new Error('Failed to load db_meta.json')
  dbMeta = await res.json() as DbMeta
  return dbMeta
}

/** Load a specific chunk by index */
async function loadChunk(chunkIndex: number): Promise<MedicineEntry[]> {
  if (chunkCache.has(chunkIndex)) return chunkCache.get(chunkIndex)!
  const meta = await getDbMeta()
  const chunkInfo = meta.chunks[chunkIndex]
  if (!chunkInfo) throw new Error(`Chunk ${chunkIndex} not found in manifest`)
  const res = await fetch(`/src/database/${chunkInfo.file}`)
  if (!res.ok) throw new Error(`Failed to load chunk ${chunkIndex}`)
  const entries = await res.json() as MedicineEntry[]
  chunkCache.set(chunkIndex, entries)
  return entries
}

/** Get a single full MedicineEntry by id and chunkIndex */
export async function getMedicineById(
  id: string,
  chunkIndex: number
): Promise<MedicineEntry | null> {
  try {
    const chunk = await loadChunk(chunkIndex)
    return chunk.find((e) => e.id === id) ?? null
  } catch {
    return null
  }
}

/** Get multiple medicines by their ids + chunkIndexes */
export async function getMedicinesByIds(
  items: { id: string; chunkIndex: number }[]
): Promise<MedicineEntry[]> {
  const results: MedicineEntry[] = []
  // Group by chunk to minimise fetches
  const byChunk = new Map<number, string[]>()
  for (const { id, chunkIndex } of items) {
    if (!byChunk.has(chunkIndex)) byChunk.set(chunkIndex, [])
    byChunk.get(chunkIndex)!.push(id)
  }
  await Promise.all(
    Array.from(byChunk.entries()).map(async ([ci, ids]) => {
      const chunk = await loadChunk(ci)
      for (const id of ids) {
        const entry = chunk.find((e) => e.id === id)
        if (entry) results.push(entry)
      }
    })
  )
  return results
}

/** Clear chunk cache (used when clearing app data) */
export function clearChunkCache(): void {
  chunkCache.clear()
  dbMeta = null
}

export { getDbMeta }
