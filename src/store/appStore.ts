import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppSettings,
  FusionReport,
  PipelineProgress,
  PipelineStage,
  QualityReport,
  OcrResult,
  FuzzyMatchResult,
  ScanHistoryEntry,
  EnhancementResult,
  OnlineRetrievalResult,
  FusionWeights,
} from '@/types'
import { DEFAULT_FUSION_WEIGHTS } from '@/services/verification/confidenceFusion'

// ── App Settings Store ─────────────────────────────────────────
interface AppStore {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      settings: {
        darkMode:        true,
        fuzzyThreshold:  70,
        autoSaveHistory: true,
        ocrLanguage:     'eng',
        showDebugInfo:   false,
        fusionWeights:   DEFAULT_FUSION_WEIGHTS,
      },
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
    }),
    { name: 'mediverify-settings' }
  )
)

// ── Fusion Weights Helper ──────────────────────────────────────
/** Update a single weight key while keeping the others */
export function updateFusionWeight(
  patch: Partial<FusionWeights>,
  current: FusionWeights
): FusionWeights {
  return { ...current, ...patch }
}

// ── Scan Pipeline Store ────────────────────────────────────────
interface ScanStore {
  // Current image
  imageFile:    File | null
  imageDataUrl: string | null
  setImage: (file: File, dataUrl: string) => void
  clearImage: () => void

  // Enhanced image (from OpenCV)
  enhancementResult: EnhancementResult | null
  setEnhancementResult: (r: EnhancementResult) => void

  // Pipeline progress
  progress:      PipelineProgress
  setStage:      (stage: PipelineStage, message: string, pct?: number) => void
  setError:      (error: string) => void

  // Intermediate results
  qualityReport:       QualityReport | null
  ocrResult:           OcrResult | null
  fuzzyMatches:        FuzzyMatchResult[]
  onlineRetrievalResult: OnlineRetrievalResult | null
  setQualityReport:    (r: QualityReport) => void
  setOcrResult:        (r: OcrResult) => void
  setFuzzyMatches:     (m: FuzzyMatchResult[]) => void
  setOnlineResult:     (r: OnlineRetrievalResult | null) => void

  // Final report
  fusionReport: FusionReport | null
  setFusionReport: (r: FusionReport) => void

  // Reset
  resetScan: () => void
}

const initialProgress: PipelineProgress = {
  stage:    'idle',
  progress: 0,
  message:  'Ready to scan',
  error:    null,
}

export const useScanStore = create<ScanStore>()((set) => ({
  imageFile:     null,
  imageDataUrl:  null,
  setImage: (file, dataUrl) => set({ imageFile: file, imageDataUrl: dataUrl }),
  clearImage: () => set({ imageFile: null, imageDataUrl: null }),

  enhancementResult:    null,
  setEnhancementResult: (r) => set({ enhancementResult: r }),

  progress:      initialProgress,
  setStage: (stage, message, pct) =>
    set((s) => ({
      progress: {
        ...s.progress,
        stage,
        message,
        progress: pct ?? s.progress.progress,
        error: null,
      },
    })),
  setError: (error) =>
    set((s) => ({
      progress: { ...s.progress, stage: 'error', error },
    })),

  qualityReport:        null,
  ocrResult:            null,
  fuzzyMatches:         [],
  onlineRetrievalResult: null,
  setQualityReport:     (r) => set({ qualityReport: r }),
  setOcrResult:         (r) => set({ ocrResult: r }),
  setFuzzyMatches:      (m) => set({ fuzzyMatches: m }),
  setOnlineResult:      (r) => set({ onlineRetrievalResult: r }),

  fusionReport:    null,
  setFusionReport: (r) => set({ fusionReport: r }),

  resetScan: () =>
    set({
      imageFile:            null,
      imageDataUrl:         null,
      enhancementResult:    null,
      progress:             initialProgress,
      qualityReport:        null,
      ocrResult:            null,
      fuzzyMatches:         [],
      onlineRetrievalResult: null,
      fusionReport:         null,
    }),
}))

// ── History Store ──────────────────────────────────────────────
interface HistoryStore {
  entries:      ScanHistoryEntry[]
  addEntry:     (e: ScanHistoryEntry) => void
  removeEntry:  (id: string) => void
  clearHistory: () => void
}

export const useHistoryStore = create<HistoryStore>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (e) =>
        set((s) => ({ entries: [e, ...s.entries].slice(0, 200) })),
      removeEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      clearHistory: () => set({ entries: [] }),
    }),
    { name: 'mediverify-history' }
  )
)
