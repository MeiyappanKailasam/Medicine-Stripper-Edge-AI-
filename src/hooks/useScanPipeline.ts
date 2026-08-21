/**
 * useScanPipeline — orchestrates the full adaptive Edge AI verification pipeline:
 *
 * Stage 0: Image Enhancement   (OpenCV.js / canvas fallback)
 * Stage 1: Image Quality Check (blur, brightness, glare, resolution)
 * Stage 2: OCR                 (Tesseract.js + textCleaner + spellCorrector)
 * Stage 3: Fuzzy Match         (Fuse.js against 250k medicine DB)
 * Stage 4: DB Lookup           (Load full MedicineEntry from chunk files)
 * Stage 5: Knowledge Retrieval (IndexedDB cache → OpenFDA → store)
 * Stage 6: AI Verification     (TF.js packaging verifier)
 * Stage 7: Confidence Fusion   (Weighted multi-signal engine)
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScanStore, useAppStore, useHistoryStore } from '@/store/appStore'
import { analyzeImageQuality } from '@/services/imageQuality/qualityAnalyzer'
import { runOcr } from '@/services/ocr/ocrEngine'
import { enhanceForOcr, loadOpenCv } from '@/services/imageEnhancement/imageEnhancementService'
import { fuzzySearchMulti } from '@/services/matching/fuzzyMatcher'
import { getMedicinesByIds } from '@/services/database/medicineDB'
import { retrieveMedicineKnowledge } from '@/services/online/knowledgeRetrievalService'
import { verifyPackaging, loadPackagingModel } from '@/services/ai/packagingVerifier'
import { runConfidenceFusion } from '@/services/verification/confidenceFusion'
import { compressThumbnail, generateScanId } from '@/utils/idUtils'
import type { MedicineEntry, OnlineRetrievalResult, ScanHistoryEntry } from '@/types'

// Kick off non-blocking preloads on module import
loadOpenCv().catch(() => { /* Will use canvas fallback — handled gracefully */ })
loadPackagingModel().catch(() => { /* Will use visual similarity mode */ })

export function useScanPipeline() {
  const nav = useNavigate()
  const { settings } = useAppStore()
  const {
    imageDataUrl,
    setStage,
    setError,
    setEnhancementResult,
    setQualityReport,
    setOcrResult,
    setFuzzyMatches,
    setOnlineResult,
    setFusionReport,
  } = useScanStore()
  const { addEntry } = useHistoryStore()

  const runPipeline = useCallback(async () => {
    if (!imageDataUrl) return
    const scanId = generateScanId()

    try {
      // ── Stage 0: Image Enhancement ────────────────────────────────────────
      setStage('image_enhancement', 'Enhancing image with OpenCV…', 5)
      const enhancement = await enhanceForOcr(imageDataUrl)
      setEnhancementResult(enhancement)

      const workingImageUrl = enhancement.enhancedDataUrl

      // ── Stage 1: Image Quality Check ──────────────────────────────────────
      setStage('quality_check', 'Analysing image quality…', 15)
      const qualityReport = await analyzeImageQuality(imageDataUrl)  // use original for quality
      setQualityReport(qualityReport)

      if (!qualityReport.passed && qualityReport.score < 30) {
        setError('Image quality too poor to process — please retake the photo')
        return
      }

      // ── Stage 2: OCR ──────────────────────────────────────────────────────
      setStage('ocr', 'Extracting and correcting text…', 30)
      // OCR engine internally uses the enhancement service, so pass original
      const ocrResult = await runOcr(imageDataUrl, settings.ocrLanguage)
      setOcrResult(ocrResult)

      const { brandName, genericName, manufacturer } = ocrResult.fields
      void workingImageUrl   // referenced above — used by enhancement display

      // ── Stage 3: Fuzzy Match ──────────────────────────────────────────────
      setStage('fuzzy_match', 'Searching 250k medicine database…', 48)
      const fuzzyMatches = await fuzzySearchMulti(
        [brandName, genericName, manufacturer],
        settings.fuzzyThreshold
      )
      setFuzzyMatches(fuzzyMatches)

      // ── Stage 4: Load Full Medicine Entry ─────────────────────────────────
      setStage('db_lookup', 'Loading medicine details…', 62)
      let medicine: MedicineEntry | null = null

      if (fuzzyMatches.length > 0) {
        const top     = fuzzyMatches[0].medicine
        const results = await getMedicinesByIds([{ id: top.id, chunkIndex: top.ci }])
        medicine      = results[0] ?? null
      }

      // ── Stage 5: Knowledge Retrieval (online fallback + cache) ────────────
      let onlineResult: OnlineRetrievalResult | null = null

      if (!medicine && brandName) {
        setStage('online_fetch', 'Medicine not found locally — searching knowledge base…', 73)
        onlineResult = await retrieveMedicineKnowledge(brandName)
        setOnlineResult(onlineResult)

        if (onlineResult.status === 'found' || onlineResult.status === 'found_in_cache') {
          medicine = onlineResult.medicine
        }
      }

      // ── Stage 6: AI Packaging Verification ───────────────────────────────
      setStage('ai_verification', 'Running visual packaging verification…', 83)
      const packaging = await verifyPackaging(imageDataUrl, brandName ?? '')

      // ── Stage 7: Confidence Fusion ────────────────────────────────────────
      setStage('fusion', 'Computing final verification confidence…', 93)
      const report = runConfidenceFusion({
        medicine,
        ocrResult,
        fuzzyMatches,
        qualityReport,
        packaging,
        imageDataUrl,
        onlineResult,
        weights: settings.fusionWeights,
      })

      setFusionReport(report)
      setStage('complete', 'Verification complete!', 100)

      // ── Save to History ────────────────────────────────────────────────────
      if (settings.autoSaveHistory) {
        const thumbnail = await compressThumbnail(imageDataUrl)
        const source = medicine
          ? (fuzzyMatches.length > 0 ? 'local' : onlineResult?.cached ? 'cache' : 'online')
          : 'not_found'

        const historyEntry: ScanHistoryEntry = {
          id:               scanId,
          timestamp:        Date.now(),
          medicineName:     ocrResult.fields.brandName ?? medicine?.brandName ?? 'Unknown',
          confidence:       report.finalConfidence,
          status:           report.status,
          thumbnailDataUrl: thumbnail,
          reportSnapshot:   report,
          source,
        }
        addEntry(historyEntry)
      }

      nav(`/report/${scanId}`)

    } catch (err) {
      setError((err as Error).message || 'An unexpected error occurred')
    }
  }, [
    imageDataUrl, settings, nav,
    setStage, setError,
    setEnhancementResult, setQualityReport, setOcrResult,
    setFuzzyMatches, setOnlineResult, setFusionReport,
    addEntry,
  ])

  return { runPipeline }
}
