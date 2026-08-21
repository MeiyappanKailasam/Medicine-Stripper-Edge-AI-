/**
 * Image Quality Analyzer
 * Analyzes an image for blur, brightness, resolution, and glare
 * using canvas pixel analysis — no server required.
 */

import type { QualityReport, QualityIssue } from '@/types'

const QUALITY_THRESHOLD = 60

/** Draw image to a canvas and extract pixel data */
function getImageData(img: HTMLImageElement, maxDim = 400): ImageData {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** Convert RGBA pixels to grayscale array */
function toGrayscale(data: Uint8ClampedArray): Float32Array {
  const len = data.length / 4
  const gray = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return gray
}

/** Laplacian variance — higher = sharper */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap =
        -gray[idx - w - 1] - gray[idx - w] - gray[idx - w + 1] +
        -gray[idx - 1]     + 8 * gray[idx] - gray[idx + 1] +
        -gray[idx + w - 1] - gray[idx + w] - gray[idx + w + 1]
      sum += lap * lap
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

/** Mean brightness 0–255 */
function meanBrightness(gray: Float32Array): number {
  return gray.reduce((a, b) => a + b, 0) / gray.length
}

/** Fraction of pixels with luminance > 245 (overexposed) */
function glareRatio(gray: Float32Array): number {
  const overexposed = gray.filter((v) => v > 245).length
  return overexposed / gray.length
}

/**
 * Analyze an HTMLImageElement (or data URL string) for quality issues.
 */
export async function analyzeImageQuality(
  source: HTMLImageElement | string
): Promise<QualityReport> {
  // Resolve to HTMLImageElement
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    if (typeof source === 'string') {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = source
    } else {
      if (source.complete) resolve(source)
      else { source.onload = () => resolve(source); source.onerror = reject }
    }
  })

  const { naturalWidth: w, naturalHeight: h } = img
  const imageData = getImageData(img)
  const gray = toGrayscale(imageData.data)
  const scaledW = imageData.width
  const scaledH = imageData.height

  const blurScore   = laplacianVariance(gray, scaledW, scaledH)
  const brightness  = meanBrightness(gray)
  const glare       = glareRatio(gray)

  const issues: QualityIssue[] = []
  const suggestions: string[] = []

  // Blur — Laplacian variance < 100 is blurry
  if (blurScore < 100) {
    issues.push('blur')
    suggestions.push('Image appears blurry. Move closer and hold your camera steady.')
  }

  // Too dark
  if (brightness < 60) {
    issues.push('too_dark')
    suggestions.push('Image is too dark. Move to better lighting or use flash.')
  }

  // Overexposed
  if (brightness > 220) {
    issues.push('overexposed')
    suggestions.push('Image is overexposed. Reduce light or avoid direct flash.')
  }

  // Glare
  if (glare > 0.12) {
    issues.push('glare')
    suggestions.push('Glare detected. Tilt the strip slightly to reduce reflection.')
  }

  // Low resolution
  if (w < 300 || h < 200) {
    issues.push('low_resolution')
    suggestions.push('Image resolution is too low. Move closer to the medicine strip.')
  }

  // Compute score
  let score = 100
  if (issues.includes('blur'))            score -= 35
  if (issues.includes('too_dark'))        score -= 25
  if (issues.includes('overexposed'))     score -= 20
  if (issues.includes('glare'))           score -= 15
  if (issues.includes('low_resolution'))  score -= 20
  score = Math.max(0, score)

  return {
    score,
    passed: score >= QUALITY_THRESHOLD && issues.length === 0,
    issues,
    suggestions,
    metrics: {
      blurScore: Math.round(blurScore),
      brightness: Math.round(brightness),
      resolution: { w, h },
      glareRatio: Math.round(glare * 100) / 100,
    },
  }
}
