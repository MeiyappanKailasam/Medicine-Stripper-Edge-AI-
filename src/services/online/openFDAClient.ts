/**
 * Online Retrieval Service — OpenFDA fallback
 * When a medicine is not found locally, fetches from api.fda.gov,
 * normalizes the result to MedicineEntry schema, and returns it.
 */

import type { MedicineEntry, OnlineRetrievalResult } from '@/types'
import { makeId } from '@/utils/idUtils'

const FDA_BASE    = 'https://api.fda.gov/drug/label.json'
const TIMEOUT_MS  = 8000

/** Normalize an OpenFDA label JSON response to MedicineEntry */
function normalizeFdaLabel(label: Record<string, unknown>, query: string): MedicineEntry {
  const openfda = (label.openfda as Record<string, string[]>) ?? {}

  const brandNames   = (openfda.brand_name   as string[]) ?? []
  const genericNames = (openfda.generic_name as string[]) ?? []
  const manufacturers= (openfda.manufacturer_name as string[]) ?? []
  const substances   = (openfda.substance_name as string[]) ?? []

  const brandName    = brandNames[0]    || query
  const genericName  = genericNames[0]  || substances[0] || ''
  const manufacturer = manufacturers[0] || ''

  const indicationsRaw = (label.indications_and_usage as string[]) ?? []
  const warningsRaw    = (label.warnings as string[]) ?? []
  const dosageRaw      = (label.dosage_and_administration as string[]) ?? []
  const storageRaw     = (label.storage_and_handling as string[]) ?? []

  const uses         = indicationsRaw.flatMap((s) => s.split('\n').map((l) => l.trim())).filter(Boolean).slice(0, 5)
  const sideEffects  = warningsRaw.flatMap((s) => s.split('\n').map((l) => l.trim())).filter(Boolean).slice(0, 10)
  const dosage       = dosageRaw[0]?.substring(0, 300) || ''
  const storage      = storageRaw[0]?.substring(0, 200) || 'Store as directed on label.'

  const id = makeId(brandName)

  return {
    id,
    brandName,
    genericName,
    composition:      genericName,
    compositionList:  substances.slice(0, 5),
    manufacturer,
    price:            '',
    packType:         '',
    isDiscontinued:   false,
    uses,
    sideEffects,
    substitutes:      [],
    therapeuticClass: '',
    actionClass:      '',
    chemicalClass:    '',
    habitForming:     false,
    rxRequired:       false,
    reviewExcellent:  null,
    reviewAverage:    null,
    reviewPoor:       null,
    dosage,
    contraindications:[],
    storage,
    precautions:      [],
    interactions:     [],
    genericAlternatives: [],
    dosageSchedule:   null,
    clinicalNotes:    null,
    _searchTokens:    [brandName.toLowerCase(), genericName.toLowerCase()],
  }
}

/** Fetch with timeout */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Try to retrieve medicine information from OpenFDA.
 * Falls back gracefully on offline / rate-limit / not-found.
 */
export async function fetchMedicineOnline(query: string): Promise<OnlineRetrievalResult> {
  if (!navigator.onLine) {
    return { status: 'offline', medicine: null, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }
  }

  const encoded = encodeURIComponent(`"${query}"`)
  const url = `${FDA_BASE}?search=openfda.brand_name:${encoded}+OR+openfda.generic_name:${encoded}&limit=1`

  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS)

    if (res.status === 404) {
      return { status: 'not_found', medicine: null, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }
    }
    if (res.status === 429) {
      return { status: 'error', medicine: null, source: 'OpenFDA (rate limited)', cached: false, cachedAt: null, offlineAvailable: false }
    }
    if (!res.ok) {
      return { status: 'error', medicine: null, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }
    }

    const data = await res.json() as { results: Record<string, unknown>[] }
    if (!data.results?.length) {
      return { status: 'not_found', medicine: null, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }
    }

    const medicine = normalizeFdaLabel(data.results[0], query)
    return { status: 'found', medicine, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { status: 'error', medicine: null, source: 'OpenFDA (timeout)', cached: false, cachedAt: null, offlineAvailable: false }
    }
    return { status: 'offline', medicine: null, source: 'OpenFDA', cached: false, cachedAt: null, offlineAvailable: false }
  }
}
