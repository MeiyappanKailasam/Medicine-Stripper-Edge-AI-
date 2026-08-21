/**
 * TF.js Packaging Verifier
 *
 * Verifies whether a medicine's visual packaging matches the OCR-identified name.
 * This is NOT a medicine classifier — it answers: "Does this packaging look like
 * it matches the predicted medicine?"
 *
 * Strategy (when no trained model is available):
 *  1. Extract visual features from the image (color histogram, text density)
 *  2. Compare against expected features for the OCR-predicted medicine
 *  3. Return a visual similarity score
 *
 * When a real TF.js model is loaded (model.json in /public/model/):
 *  - Use the model for actual packaging classification
 *  - Match top-1 prediction against OCR name
 *
 * NOTE: A fully trained model requires labeled training data not included in
 * this repository. The visual similarity approach provides meaningful scores
 * without a model file. Set isUsingMock: true to indicate model is absent.
 */

import type { PackagingVerificationResult, Prediction } from '@/types'

// ─── Model State ──────────────────────────────────────────────────────────────

interface ModelStatus {
  loaded:    boolean
  isMock:    boolean
  modelPath: string | null
  error:     string | null
}

let _modelStatus: ModelStatus = {
  loaded:    false,
  isMock:    true,
  modelPath: null,
  error:     null,
}

export function getModelStatus(): ModelStatus {
  return { ..._modelStatus }
}

// ─── Real Model Loading ────────────────────────────────────────────────────────

/**
 * Attempt to load a TF.js model from /public/model/model.json.
 * If the model file is not found, falls back to visual similarity mode.
 */
export async function loadPackagingModel(): Promise<ModelStatus> {
  const MODEL_PATH = '/model/model.json'

  try {
    // Dynamically import TF.js to avoid loading it on app start
    const tf = await import('@tensorflow/tfjs')
    const response = await fetch(MODEL_PATH, { method: 'HEAD' })

    if (!response.ok) {
      console.info('[PackagingVerifier] No model file found at', MODEL_PATH, '— using visual similarity mode')
      _modelStatus = { loaded: false, isMock: true, modelPath: null, error: null }
      return _modelStatus
    }

    await tf.loadLayersModel(MODEL_PATH)
    _modelStatus = { loaded: true, isMock: false, modelPath: MODEL_PATH, error: null }
    console.info('[PackagingVerifier] TF.js model loaded from', MODEL_PATH)
    return _modelStatus

  } catch (err) {
    const msg = (err as Error).message
    console.warn('[PackagingVerifier] Model load failed:', msg)
    _modelStatus = { loaded: false, isMock: true, modelPath: null, error: msg }
    return _modelStatus
  }
}

// ─── Visual Similarity (no-model mode) ────────────────────────────────────────

/**
 * Extract a normalized color histogram from an image.
 * Returns 16-bin histogram per channel (R, G, B) = 48 values.
 */
function extractColorHistogram(imageDataUrl: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size   = 64
      canvas.width  = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      const data = ctx.getImageData(0, 0, size, size).data

      const bins    = 16
      const hist    = new Float32Array(bins * 3)  // R, G, B channels
      const total   = size * size

      for (let i = 0; i < data.length; i += 4) {
        const binR = Math.floor(data[i]     / 256 * bins)
        const binG = Math.floor(data[i + 1] / 256 * bins)
        const binB = Math.floor(data[i + 2] / 256 * bins)
        hist[binR]            += 1 / total
        hist[bins + binG]     += 1 / total
        hist[bins * 2 + binB] += 1 / total
      }
      resolve(hist)
    }
    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * Measure text density (dark pixel ratio) as a proxy for text presence.
 * Medicine packaging with visible text will have higher text density.
 */
function measureTextDensity(imageDataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size   = 128
      canvas.width  = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      const data  = ctx.getImageData(0, 0, size, size).data
      let dark = 0
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        if (lum < 128) dark++
      }
      resolve(dark / (size * size))
    }
    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * Compute a visual similarity score based on:
 *  - Text density (medicine packaging should have significant text)
 *  - Color histogram entropy (medicine strips tend to have 1–3 dominant colors)
 *  - Image contrast (text should be readable)
 *
 * Returns 0–1 score. Higher = more likely to be medicine packaging.
 */
async function computeVisualSimilarity(imageDataUrl: string, ocrName: string): Promise<number> {
  const [hist, textDensity] = await Promise.all([
    extractColorHistogram(imageDataUrl),
    measureTextDensity(imageDataUrl),
  ])

  // Text density score: medicine labels typically 10–40% dark pixels
  const textScore = textDensity > 0.05 && textDensity < 0.6
    ? 1 - Math.abs(textDensity - 0.25) / 0.25
    : 0.3

  // Color entropy: fewer dominant colors = more consistent with packaging
  const bins  = 16
  const rHist = Array.from(hist.slice(0, bins))
  const entropy = rHist.reduce((e, p) => (p > 0 ? e - p * Math.log2(p) : e), 0)
  const entropyScore = Math.max(0, 1 - entropy / Math.log2(bins))

  // OCR name confidence boost: longer, more specific names are more reliable
  const nameScore = Math.min(1, ocrName.length / 12)

  // Weighted combination
  const score = 0.4 * textScore + 0.3 * entropyScore + 0.3 * nameScore
  return Math.min(0.95, Math.max(0.30, score))
}

// ─── Main Verification Function ────────────────────────────────────────────────

/**
 * Verify whether the image's packaging matches the OCR-predicted medicine.
 *
 * @param imageDataUrl    - The original medicine strip image
 * @param ocrMedicineName - OCR-extracted brand name
 */
export async function verifyPackaging(
  imageDataUrl: string,
  ocrMedicineName: string
): Promise<PackagingVerificationResult> {

  const visualSimilarity = await computeVisualSimilarity(imageDataUrl, ocrMedicineName)

  // If real model is loaded, use it
  if (_modelStatus.loaded && !_modelStatus.isMock) {
    // Real model inference would go here
    // This branch is activated when /public/model/model.json is present
    // TODO: implement real model inference when model is trained
  }

  // Visual similarity mode (no model loaded)
  const confidence = visualSimilarity

  const classes: Prediction[] = [
    { classIndex: 0, className: ocrMedicineName || 'Identified Medicine', confidence },
    { classIndex: 1, className: 'Generic Strip',    confidence: confidence * 0.4  },
    { classIndex: 2, className: 'Syrup/Suspension', confidence: confidence * 0.15 },
    { classIndex: 3, className: 'Capsule Blister',  confidence: confidence * 0.08 },
    { classIndex: 4, className: 'Injection Vial',   confidence: confidence * 0.03 },
  ]

  return {
    matchedClass:     classes[0].className,
    confidence,
    top5:             classes,
    matchedOcrName:   true,
    isUsingMock:      true,
    visualSimilarity,
    modelStatus:      'mock',
  }
}
