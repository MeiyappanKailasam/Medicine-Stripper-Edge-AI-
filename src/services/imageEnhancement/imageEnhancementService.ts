/**
 * Image Enhancement Service — OpenCV.js preprocessing pipeline
 *
 * Applies a 7-step enhancement pipeline to medicine strip images before OCR:
 *  1. Resize  — ensure minimum width for Tesseract accuracy
 *  2. Grayscale conversion
 *  3. CLAHE   — contrast limited adaptive histogram equalization
 *  4. Gaussian blur  — noise removal
 *  5. Adaptive thresholding — binarize text
 *  6. Deskew  — correct minor rotation
 *  7. Unsharp mask — sharpen text edges
 *
 * Falls back to a lightweight canvas-based alternative if OpenCV is unavailable.
 */

import { loadOpenCv, isOpenCvReady, getOpenCvStatus } from './opencvLoader'
import type { EnhancementResult, OpenCvStatus } from '@/types'

const MIN_WIDTH = 1600   // minimum image width for Tesseract
const MAX_DIM   = 3000   // cap to avoid OOM on very large images

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Load a data URL into an HTMLImageElement */
function loadImg(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src     = dataUrl
  })
}

/** Draw img to canvas, optionally scaling to minWidth */
function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight

  // Scale up if too small, scale down if too large
  let scale = 1
  if (srcW < MIN_WIDTH) scale = MIN_WIDTH / srcW
  if (srcW * scale > MAX_DIM) scale = MAX_DIM / srcW

  const W = Math.round(srcW * scale)
  const H = Math.round(srcH * scale)

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled  = true
  ctx.imageSmoothingQuality  = 'high'
  ctx.drawImage(img, 0, 0, W, H)
  return canvas
}

// ─── Fallback Pipeline (canvas-only, no OpenCV) ───────────────────────────────

/**
 * Lightweight canvas-based fallback when OpenCV is unavailable.
 * Applies: upscale + grayscale + contrast stretch + unsharp mask
 */
function fallbackEnhance(img: HTMLImageElement): string {
  const canvas = imgToCanvas(img)
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  const id  = ctx.getImageData(0, 0, W, H)
  const d   = id.data

  // Grayscale
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = g
  }

  // Contrast stretch (min-max normalization)
  let lo = 255, hi = 0
  for (let i = 0; i < d.length; i += 4) {
    lo = Math.min(lo, d[i])
    hi = Math.max(hi, d[i])
  }
  const range = hi - lo || 1
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(((d[i] - lo) / range) * 255)
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(id, 0, 0)

  // Unsharp mask via blur-subtract
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = W; blurCanvas.height = H
  const bCtx = blurCanvas.getContext('2d')!
  bCtx.filter = 'blur(1.5px)'
  bCtx.drawImage(canvas, 0, 0)
  const blurData = bCtx.getImageData(0, 0, W, H)
  const sharp    = ctx.getImageData(0, 0, W, H)
  for (let i = 0; i < sharp.data.length; i += 4) {
    const v = Math.min(255, Math.max(0, sharp.data[i] + 1.2 * (sharp.data[i] - blurData.data[i])))
    sharp.data[i] = sharp.data[i + 1] = sharp.data[i + 2] = v
  }
  ctx.putImageData(sharp, 0, 0)

  return canvas.toDataURL('image/png')
}

// ─── OpenCV Pipeline ──────────────────────────────────────────────────────────

/** Type alias for the OpenCV global (accessed via window.cv) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any

/**
 * Full OpenCV.js enhancement pipeline:
 * resize → grayscale → CLAHE → denoise → adaptive threshold → deskew → sharpen
 */
function opencvEnhance(img: HTMLImageElement): string {
  const cv = (window as unknown as { cv: CV }).cv

  const canvas = imgToCanvas(img)
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!

  // Read source mat from canvas
  const src = cv.imread(canvas)
  const dst = new cv.Mat()

  try {
    // Step 1: Grayscale
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)

    // Step 2: CLAHE (Contrast Limited Adaptive Histogram Equalization)
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8))
    const claheOut = new cv.Mat()
    clahe.apply(dst, claheOut)
    clahe.delete()
    dst.delete()

    // Step 3: Gaussian blur for noise removal (3×3 kernel)
    const blurred = new cv.Mat()
    cv.GaussianBlur(claheOut, blurred, new cv.Size(3, 3), 0)
    claheOut.delete()

    // Step 4: Adaptive thresholding (binarize text)
    // Using a much larger block size (81 vs 11) for high-res blister pack images
    // to avoid hollowing out thick text strokes.
    const binary = new cv.Mat()
    cv.adaptiveThreshold(
      blurred, binary, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      81,   // block size
      2     // C constant
    )
    blurred.delete()

    // Step 5: Morphological closing to fill small holes in letters caused by glare
    const morphClosed = new cv.Mat()
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.morphologyEx(binary, morphClosed, cv.MORPH_CLOSE, kernel)
    binary.delete()
    kernel.delete()

    // Step 6: Deskew — find contours, compute rotation angle, rotate
    const deskewed = deskewMat(cv, morphClosed)
    morphClosed.delete()

    // Write result to output canvas
    const outCanvas = document.createElement('canvas')
    outCanvas.width  = W
    outCanvas.height = H
    cv.imshow(outCanvas, deskewed)
    deskewed.delete()
    src.delete()

    return outCanvas.toDataURL('image/png')

  } catch (err) {
    // Clean up on error, fall back to canvas
    try { src.delete() } catch { /* ignore */ }
    try { dst.delete() } catch { /* ignore */ }
    console.warn('[ImageEnhancement] OpenCV pipeline error, using fallback:', err)
    ctx.clearRect(0, 0, W, H)
    return fallbackEnhance(img)
  }
}

/**
 * Estimate image skew angle and rotate to correct it.
 * Uses the dominant line angle from Hough line detection.
 */
function deskewMat(cv: CV, src: CV): CV {
  try {
    const lines = new cv.Mat()
    // HoughLinesP to find text lines
    cv.HoughLinesP(src, lines, 1, Math.PI / 180, 50, 50, 10)

    if (lines.rows === 0) {
      lines.delete()
      return src.clone()
    }

    // Compute median angle
    const angles: number[] = []
    for (let i = 0; i < Math.min(lines.rows, 20); i++) {
      const x1 = lines.data32S[i * 4]
      const y1 = lines.data32S[i * 4 + 1]
      const x2 = lines.data32S[i * 4 + 2]
      const y2 = lines.data32S[i * 4 + 3]
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI
      if (Math.abs(angle) < 45) angles.push(angle)
    }
    lines.delete()

    if (angles.length === 0) return src.clone()

    angles.sort((a, b) => a - b)
    const median = angles[Math.floor(angles.length / 2)]

    // Only deskew if angle is meaningful (> 0.5°) and small (< 15°)
    if (Math.abs(median) < 0.5 || Math.abs(median) > 15) return src.clone()

    // Rotate image
    const center = new cv.Point(src.cols / 2, src.rows / 2)
    const M = cv.getRotationMatrix2D(center, median, 1.0)
    const rotated = new cv.Mat()
    cv.warpAffine(
      src, rotated, M,
      new cv.Size(src.cols, src.rows),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE
    )
    M.delete()
    return rotated

  } catch {
    return src.clone()
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Enhance an image for OCR.
 * Tries OpenCV.js pipeline first. Falls back to canvas-based enhancement.
 *
 * @param dataUrl - Input image as data URL or File
 * @returns EnhancementResult with enhanced data URL and status info
 */
export async function enhanceForOcr(
  dataUrl: string | File
): Promise<EnhancementResult> {
  const t0 = Date.now()

  // Resolve File to data URL
  let sourceUrl: string
  if (dataUrl instanceof File) {
    sourceUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader()
      reader.onload  = (e) => res(e.target!.result as string)
      reader.onerror = rej
      reader.readAsDataURL(dataUrl)
    })
  } else {
    sourceUrl = dataUrl
  }

  const img = await loadImg(sourceUrl)

  // Attempt to load OpenCV if not ready
  let status: OpenCvStatus = getOpenCvStatusSafe()
  if (status !== 'ready' && navigator.onLine) {
    try {
      await loadOpenCv()
      status = 'ready'
    } catch {
      status = 'error'
    }
  }

  let enhancedDataUrl: string
  let enhancementApplied: boolean

  if (status === 'ready') {
    // OpenCV loaded successfully
    enhancedDataUrl     = opencvEnhance(img)
    enhancementApplied  = true
  } else {
    // Use canvas fallback for this scan
    enhancedDataUrl    = fallbackEnhance(img)
    enhancementApplied = false
    status             = isOpenCvReady() ? 'ready' : 'unavailable'
  }

  return {
    enhancedDataUrl,
    originalDataUrl:    sourceUrl,
    enhancementApplied,
    status,
    durationMs:         Date.now() - t0,
  }
}

/** Safe status read that doesn't throw */
function getOpenCvStatusSafe(): OpenCvStatus {
  try {
    return getOpenCvStatus()
  } catch {
    return 'not_loaded'
  }
}

// Re-export loader utilities for components
export { loadOpenCv, isOpenCvReady, onOpenCvStatusChange, getOpenCvStatus } from './opencvLoader'
