/**
 * Confidence Fusion Engine
 *
 * Combines multiple verification signals into a final confidence score
 * with structured explainable evidence.
 *
 * Signals:
 *  - OCR Confidence      (configurable weight, default 30%)
 *  - Fuzzy Match Score   (configurable weight, default 30%)
 *  - Packaging Match     (configurable weight, default 20%)
 *  - Image Quality       (configurable weight, default 10%)
 *  - Textual Evidence    (configurable weight, default 10%)
 *
 * Output: FusionReport with structured evidence, warnings, and status.
 */

import type {
  FusionReport,
  OcrResult,
  FuzzyMatchResult,
  QualityReport,
  PackagingVerificationResult,
  MedicineEntry,
  SignalScores,
  VerificationStatus,
  FusionWeights,
  EvidenceItem,
  OnlineRetrievalResult,
} from '@/types'

// ─── Default Weights ──────────────────────────────────────────────────────────

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  ocr:       0.30,
  fuzzy:     0.30,
  packaging: 0.20,
  quality:   0.10,
  evidence:  0.10,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeStatus(score: number, medicine: MedicineEntry | null): VerificationStatus {
  if (medicine === null) return 'NOT_FOUND'
  if (score >= 85) return 'VERIFIED'
  if (score >= 60) return 'CAUTION'
  return 'UNVERIFIED'
}

function isExpired(expDate: string | null): boolean {
  if (!expDate) return false
  const cleaned = expDate.replace(/[^0-9\/\-]/g, ' ').trim()
  const parsed  = new Date(cleaned)
  if (isNaN(parsed.getTime())) return false
  return parsed < new Date()
}

/**
 * Compute a 0–100 textual evidence score:
 * +20 for each extracted field (brandName, genericName, manufacturer, batchNo, expDate)
 */
function computeTextualEvidence(ocr: OcrResult): number {
  const fields = ocr.fields
  let score = 0
  if (fields.brandName)    score += 25
  if (fields.genericName)  score += 20
  if (fields.manufacturer) score += 20
  if (fields.strength)     score += 15
  if (fields.batchNo)      score += 10
  if (fields.expDate)      score += 10
  return Math.min(100, score)
}

// ─── Evidence Builder ─────────────────────────────────────────────────────────

/**
 * Build structured EvidenceItem[] for the Explainable AI report.
 */
function buildEvidence(params: {
  ocrResult:    OcrResult
  fuzzyMatches: FuzzyMatchResult[]
  qualityReport: QualityReport
  packaging:    PackagingVerificationResult | null
  medicine:     MedicineEntry | null
  signals:      SignalScores
}): { evidence: EvidenceItem[]; warnings: EvidenceItem[] } {
  const { ocrResult, fuzzyMatches, qualityReport, packaging, medicine, signals } = params
  const evidence: EvidenceItem[] = []
  const warnings: EvidenceItem[] = []

  // ── OCR ──────────────────────────────────────────────────────────────────
  if (signals.ocrConfidence >= 80) {
    evidence.push({
      type: 'success', field: 'OCR',
      message: `Text extracted with ${signals.ocrConfidence}% confidence${ocrResult.enhancementUsed ? ' (OpenCV enhanced)' : ''}`,
      value: null,
    })
  } else if (signals.ocrConfidence >= 50) {
    warnings.push({
      type: 'warning', field: 'OCR',
      message: `Moderate OCR confidence (${signals.ocrConfidence}%) — image quality may affect accuracy`,
      value: null,
    })
  } else {
    warnings.push({
      type: 'warning', field: 'OCR',
      message: `Low OCR confidence (${signals.ocrConfidence}%) — consider rescanning with better lighting`,
      value: null,
    })
  }

  // ── Brand Name ────────────────────────────────────────────────────────────
  if (ocrResult.fields.brandName) {
    evidence.push({
      type: 'success', field: 'Brand Name',
      message: `Detected "${ocrResult.fields.brandName}"`,
      value: ocrResult.fields.brandName,
    })
  } else {
    warnings.push({
      type: 'warning', field: 'Brand Name',
      message: 'Brand name could not be extracted from the image',
      value: null,
    })
  }

  // ── Generic Name / Composition ────────────────────────────────────────────
  if (ocrResult.fields.genericName) {
    evidence.push({
      type: 'success', field: 'Generic Name',
      message: `Identified composition: ${ocrResult.fields.genericName}`,
      value: ocrResult.fields.genericName,
    })
  }

  // ── Strength ─────────────────────────────────────────────────────────────
  if (ocrResult.fields.strength) {
    evidence.push({
      type: 'success', field: 'Strength',
      message: `Dosage strength detected: ${ocrResult.fields.strength}`,
      value: ocrResult.fields.strength,
    })
  }

  // ── Database Match ────────────────────────────────────────────────────────
  if (fuzzyMatches.length > 0) {
    const top = fuzzyMatches[0]
    if (signals.fuzzyScore >= 85) {
      evidence.push({
        type: 'success', field: 'Database Match',
        message: `Strong match — ${signals.fuzzyScore}% similarity to "${top.medicine.b}" (${top.medicine.m})`,
        value: `${signals.fuzzyScore}%`,
      })
    } else if (signals.fuzzyScore >= 65) {
      evidence.push({
        type: 'info', field: 'Database Match',
        message: `Partial match — ${signals.fuzzyScore}% similarity to "${top.medicine.b}"`,
        value: `${signals.fuzzyScore}%`,
      })
      warnings.push({
        type: 'warning', field: 'Database Match',
        message: 'Match confidence below 85% — verify the medicine name manually',
        value: null,
      })
    } else {
      warnings.push({
        type: 'warning', field: 'Database Match',
        message: `Weak database match (${signals.fuzzyScore}%) — medicine may not be in our database`,
        value: `${signals.fuzzyScore}%`,
      })
    }
  } else {
    warnings.push({
      type: 'warning', field: 'Database Match',
      message: 'No matching medicine found in local database',
      value: null,
    })
  }

  // ── Manufacturer ──────────────────────────────────────────────────────────
  if (ocrResult.fields.manufacturer && medicine?.manufacturer) {
    const ocrMfr  = ocrResult.fields.manufacturer.toLowerCase()
    const dbMfr   = medicine.manufacturer.toLowerCase()
    const matched = ocrMfr.includes(dbMfr.slice(0, 8)) || dbMfr.includes(ocrMfr.slice(0, 8))
    if (matched) {
      evidence.push({
        type: 'success', field: 'Manufacturer',
        message: `Manufacturer matched: ${medicine.manufacturer}`,
        value: medicine.manufacturer,
      })
    } else {
      warnings.push({
        type: 'warning', field: 'Manufacturer',
        message: `Manufacturer mismatch — OCR: "${ocrResult.fields.manufacturer}" vs DB: "${medicine.manufacturer}"`,
        value: null,
      })
    }
  } else if (medicine?.manufacturer) {
    evidence.push({
      type: 'info', field: 'Manufacturer',
      message: `Database manufacturer: ${medicine.manufacturer}`,
      value: medicine.manufacturer,
    })
  }

  // ── Packaging Verification ────────────────────────────────────────────────
  if (packaging) {
    if (packaging.isUsingMock) {
      evidence.push({
        type: 'info', field: 'Packaging AI',
        message: `Visual similarity score: ${Math.round(packaging.visualSimilarity * 100)}% (no trained model — visual analysis mode)`,
        value: `${Math.round(packaging.confidence * 100)}%`,
      })
    } else if (packaging.confidence >= 0.80) {
      evidence.push({
        type: 'success', field: 'Packaging AI',
        message: `Packaging visually matched with ${Math.round(packaging.confidence * 100)}% confidence`,
        value: `${Math.round(packaging.confidence * 100)}%`,
      })
    } else {
      warnings.push({
        type: 'warning', field: 'Packaging AI',
        message: `Low packaging visual confidence (${Math.round(packaging.confidence * 100)}%)`,
        value: null,
      })
    }
  }

  // ── Image Quality ─────────────────────────────────────────────────────────
  if (qualityReport.score >= 80) {
    evidence.push({
      type: 'success', field: 'Image Quality',
      message: `Image quality is good (${qualityReport.score}/100)`,
      value: `${qualityReport.score}/100`,
    })
  } else {
    for (const s of qualityReport.suggestions) {
      warnings.push({ type: 'warning', field: 'Image Quality', message: s, value: null })
    }
  }

  // ── Batch Number ─────────────────────────────────────────────────────────
  if (ocrResult.fields.batchNo) {
    evidence.push({
      type: 'info', field: 'Batch No',
      message: `Batch number detected: ${ocrResult.fields.batchNo}`,
      value: ocrResult.fields.batchNo,
    })
  }

  // ── Expiry Date ────────────────────────────────────────────────────────────
  const expDate = ocrResult.fields.expDate
  if (expDate && isExpired(expDate)) {
    warnings.push({
      type: 'warning', field: 'Expiry Date',
      message: `⚠ EXPIRED: This medicine expired on ${expDate}`,
      value: expDate,
    })
  } else if (expDate) {
    evidence.push({
      type: 'success', field: 'Expiry Date',
      message: `Expiry date: ${expDate}`,
      value: expDate,
    })
  } else {
    warnings.push({
      type: 'warning', field: 'Expiry Date',
      message: 'Expiry date could not be detected from the image',
      value: null,
    })
  }

  // ── Medicine-specific flags ────────────────────────────────────────────────
  if (medicine) {
    if (medicine.isDiscontinued) {
      warnings.push({
        type: 'warning', field: 'Status',
        message: 'This medicine has been discontinued according to our database',
        value: null,
      })
    }
    if (medicine.rxRequired) {
      warnings.push({
        type: 'warning', field: 'Prescription',
        message: 'This medicine requires a valid prescription (Rx)',
        value: null,
      })
    }
    if (medicine.habitForming) {
      warnings.push({
        type: 'warning', field: 'Caution',
        message: 'This medicine may be habit-forming — use under medical supervision',
        value: null,
      })
    }
  }

  return { evidence, warnings }
}

// ─── Main Fusion Function ─────────────────────────────────────────────────────

export function runConfidenceFusion(params: {
  medicine:       MedicineEntry | null
  ocrResult:      OcrResult
  fuzzyMatches:   FuzzyMatchResult[]
  qualityReport:  QualityReport
  packaging:      PackagingVerificationResult | null
  imageDataUrl:   string
  onlineResult?:  OnlineRetrievalResult | null
  weights?:       FusionWeights
}): FusionReport {
  const {
    medicine, ocrResult, fuzzyMatches, qualityReport,
    packaging, imageDataUrl, onlineResult = null,
    weights = DEFAULT_FUSION_WEIGHTS,
  } = params

  const ocrConf        = ocrResult.confidence                               // 0–100
  const fuzzyScore     = fuzzyMatches[0]?.score ?? 0                        // 0–100
  const packagingConf  = packaging ? Math.round(packaging.confidence * 100) : 50
  const qualityScore   = qualityReport.score                                 // 0–100
  const textEvidence   = computeTextualEvidence(ocrResult)                  // 0–100

  const signals: SignalScores = {
    ocrConfidence:    Math.round(ocrConf),
    fuzzyScore:       Math.round(fuzzyScore),
    packagingMatch:   Math.round(packagingConf),
    imageQuality:     Math.round(qualityScore),
    textualEvidence:  Math.round(textEvidence),
  }

  // Normalize weights to sum = 1.0
  const total = weights.ocr + weights.fuzzy + weights.packaging + weights.quality + weights.evidence || 1
  const w = {
    ocr:       weights.ocr       / total,
    fuzzy:     weights.fuzzy     / total,
    packaging: weights.packaging / total,
    quality:   weights.quality   / total,
    evidence:  weights.evidence  / total,
  }

  const finalConfidence = Math.round(
    ocrConf       * w.ocr       +
    fuzzyScore    * w.fuzzy     +
    packagingConf * w.packaging +
    qualityScore  * w.quality   +
    textEvidence  * w.evidence
  )

  const status = computeStatus(finalConfidence, medicine)

  // Build structured evidence
  const { evidence, warnings: warningItems } = buildEvidence({
    ocrResult, fuzzyMatches, qualityReport, packaging, medicine, signals,
  })

  // Flat string lists for backwards compatibility
  const explanations = evidence.map((e) => `✓ ${e.message}`)
  const warnings     = warningItems.map((w) => `⚠ ${w.message}`)

  // Determine data source
  const dataSource = medicine
    ? (fuzzyMatches.length > 0 ? 'local_db' : onlineResult?.cached ? 'cache' : 'online')
    : 'not_found'

  return {
    medicine,
    finalConfidence,
    status,
    signals,
    weights,
    evidence: [...evidence, ...warningItems],
    explanations,
    warnings,
    ocrResult,
    fuzzyMatches,
    qualityReport,
    onlineResult,
    dataSource,
    offlineAvailable: onlineResult?.offlineAvailable ?? (fuzzyMatches.length > 0),
    lastUpdated:      onlineResult?.cachedAt ?? Date.now(),
    timestamp:        Date.now(),
    imageDataUrl,
  }
}
