import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scan, CheckCircle, AlertTriangle, Loader2, RotateCcw,
  ChevronRight, ChevronDown, ChevronUp, Bug, Zap
} from 'lucide-react'
import ImageUploader from '@/components/ImageUploader'
import { useScanStore } from '@/store/appStore'
import { useScanPipeline } from '@/hooks/useScanPipeline'
import { seedMiniIndex } from '@/services/matching/fuzzyMatcher'

const STAGE_LABELS: Record<string, string> = {
  idle:              'Ready to scan',
  image_enhancement: 'Image Enhancement (OpenCV)',
  quality_check:     'Image Quality Analysis',
  ocr:               'OCR + Spell Correction',
  fuzzy_match:       'Fuzzy Database Search',
  db_lookup:         'Loading Medicine Details',
  online_fetch:      'Searching Knowledge Base',
  ai_verification:   'AI Packaging Verification',
  fusion:            'Confidence Fusion',
  complete:          'Verification Complete',
  error:             'Error',
}

const STAGE_ORDER = [
  'image_enhancement', 'quality_check', 'ocr', 'fuzzy_match',
  'db_lookup', 'online_fetch', 'ai_verification', 'fusion', 'complete'
]

export default function Scanner() {
  const { imageDataUrl, progress, resetScan, qualityReport, ocrResult } = useScanStore()
  const { runPipeline } = useScanPipeline()
  const [debugOpen, setDebugOpen] = useState(false)

  useEffect(() => { seedMiniIndex() }, [])

  const isRunning = !['idle', 'complete', 'error'].includes(progress.stage)
  const isDone    = progress.stage === 'complete'
  const isError   = progress.stage === 'error'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-2xl mx-auto px-4 py-8 space-y-6"
    >
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gradient-primary">Medicine Scanner</h1>
        <p className="text-surface-400">Upload or capture a medicine strip to begin verification</p>
      </div>

      {/* Upload Area */}
      <div className="glass-card p-5">
        <ImageUploader />
      </div>

      {/* Scan Button */}
      <AnimatePresence>
        {imageDataUrl && !isRunning && !isDone && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={runPipeline}
            className="btn-primary w-full justify-center py-4 text-base"
          >
            <Scan className="w-5 h-5" />
            Verify Medicine
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pipeline Progress */}
      <AnimatePresence>
        {(isRunning || isDone || isError) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-surface-100">Verification Pipeline</h2>
              {(isDone || isError) && (
                <button onClick={resetScan} className="btn-ghost text-xs gap-1">
                  <RotateCcw className="w-3.5 h-3.5" /> New Scan
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="confidence-bar">
              <motion.div
                className="confidence-bar-fill bg-gradient-to-r from-primary-600 to-primary-400"
                initial={{ width: 0 }}
                animate={{ width: `${progress.progress}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>

            {/* Stage list */}
            <div className="space-y-2">
              {STAGE_ORDER.map((stage) => {
                const stageIdx   = STAGE_ORDER.indexOf(stage)
                const currentIdx = STAGE_ORDER.indexOf(progress.stage)
                const isDoneStep = stageIdx < currentIdx || isDone
                const isActive   = stage === progress.stage && isRunning
                const isPending  = stageIdx > currentIdx && !isDone

                // Special icon for image_enhancement stage
                const isEnhancement = stage === 'image_enhancement'

                return (
                  <div
                    key={stage}
                    className={`pipeline-step ${
                      isActive   ? 'pipeline-step-active' :
                      isDoneStep ? 'pipeline-step-done'   :
                                   'pipeline-step-pending'
                    }`}
                  >
                    <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
                      {isActive   && <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />}
                      {isDoneStep && (
                        isEnhancement
                          ? <Zap className="w-4 h-4 text-primary-400" />
                          : <CheckCircle className="w-4 h-4 text-success-400" />
                      )}
                      {isPending  && <div className="w-2 h-2 rounded-full bg-surface-600" />}
                    </div>
                    <span className={`text-sm font-medium ${
                      isActive   ? 'text-primary-300' :
                      isDoneStep ? 'text-success-400'  :
                                   'text-surface-500'
                    }`}>
                      {STAGE_LABELS[stage] ?? stage}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-xs text-surface-500 animate-pulse">
                        {progress.message}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Error state */}
            {isError && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-danger-500/10 border border-danger-500/20">
                <AlertTriangle className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-danger-300 text-sm font-medium">Verification failed</p>
                  <p className="text-danger-400/70 text-xs mt-1">{progress.error}</p>
                </div>
              </div>
            )}

            {/* Quick preview of results */}
            {(isRunning || isDone) && qualityReport && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-surface-700/50">
                <div className="text-center">
                  <p className="section-label text-center">Image Quality</p>
                  <p className={`text-2xl font-bold mt-1 ${
                    qualityReport.score >= 80 ? 'text-success-400' :
                    qualityReport.score >= 60 ? 'text-warning-400' : 'text-danger-400'
                  }`}>{qualityReport.score}<span className="text-sm font-normal text-surface-500">/100</span></p>
                </div>
                {ocrResult && (
                  <div className="text-center">
                    <p className="section-label text-center">OCR Confidence</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      ocrResult.confidence >= 80 ? 'text-success-400' :
                      ocrResult.confidence >= 50 ? 'text-warning-400' : 'text-danger-400'
                    }`}>{ocrResult.confidence}<span className="text-sm font-normal text-surface-500">%</span></p>
                  </div>
                )}
              </div>
            )}

            {isDone && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 p-3 rounded-xl bg-success-500/10 border border-success-500/20"
              >
                <CheckCircle className="w-5 h-5 text-success-400 flex-shrink-0" />
                <p className="text-success-300 text-sm font-medium">
                  Verification complete! Redirecting to report…
                </p>
                <ChevronRight className="w-4 h-4 text-success-400 ml-auto" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR Debug Panel */}
      <AnimatePresence>
        {ocrResult && (progress.stage === 'complete' || progress.stage === 'error' || STAGE_ORDER.indexOf(progress.stage) > STAGE_ORDER.indexOf('ocr')) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card overflow-hidden"
          >
            <button
              onClick={() => setDebugOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-white/5 transition-colors"
            >
              <Bug className="w-4 h-4 text-primary-400 flex-shrink-0" />
              <span className="text-sm font-medium text-surface-300">OCR Debug — extracted fields</span>
              <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded-full ${
                ocrResult.confidence >= 70
                  ? 'bg-success-500/20 text-success-400'
                  : ocrResult.confidence >= 40
                  ? 'bg-warning-500/20 text-warning-400'
                  : 'bg-danger-500/20 text-danger-400'
              }`}>
                {ocrResult.confidence}% confidence
                {ocrResult.enhancementUsed && ' · OpenCV'}
              </span>
              {debugOpen ? <ChevronUp className="w-4 h-4 text-surface-500" /> : <ChevronDown className="w-4 h-4 text-surface-500" />}
            </button>

            <AnimatePresence>
              {debugOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-surface-700/50"
                >
                  <div className="p-5 space-y-4">
                    <div>
                      <p className="section-label mb-2">Extracted Fields</p>
                      <div className="space-y-1.5">
                        {([
                          ['Brand Name',   ocrResult.fields.brandName],
                          ['Generic Name', ocrResult.fields.genericName],
                          ['Strength',     ocrResult.fields.strength],
                          ['Manufacturer', ocrResult.fields.manufacturer],
                          ['Batch No',     ocrResult.fields.batchNo],
                          ['Mfg Date',     ocrResult.fields.mfgDate],
                          ['Exp Date',     ocrResult.fields.expDate],
                        ] as [string, string | null][]).map(([label, value]) => (
                          <div key={label} className="flex gap-2 text-xs">
                            <span className="w-28 flex-shrink-0 text-surface-500">{label}</span>
                            <span className={value ? 'text-surface-200 font-mono' : 'text-surface-600 italic'}>
                              {value ?? '— not detected'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="section-label mb-2">Cleaned OCR Text ({ocrResult.wordCount} words)</p>
                      <pre className="text-xs text-surface-400 font-mono bg-surface-900/60 rounded-xl p-3 whitespace-pre-wrap max-h-40 overflow-y-auto border border-surface-700/40">
                        {ocrResult.cleanedText || ocrResult.rawText || '— no text extracted'}
                      </pre>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tips */}
      {progress.stage === 'idle' && (
        <div className="glass-card p-5">
          <p className="section-label mb-3">Tips for best results</p>
          <ul className="space-y-2 text-sm text-surface-400">
            {[
              'Ensure the medicine name is clearly visible and in focus',
              'Use natural lighting — avoid flash glare on packaging',
              'Hold the camera steady and close to the strip',
              'Include the full strip front in the frame',
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2">
                <span className="text-primary-500 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  )
}
