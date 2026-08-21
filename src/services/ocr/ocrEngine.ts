/**
 * OCR Engine — Tesseract.js wrapper with adaptive preprocessing
 *
 * Pipeline:
 *  1. Image enhancement via imageEnhancementService (OpenCV.js or canvas fallback)
 *  2. Tesseract.js OCR on the enhanced image
 *  3. Text cleaning via textCleaner (normalizeOcrText)
 *  4. Spell correction via spellCorrector (correctOcrSpelling)
 *  5. Field extraction (brand name, generic, manufacturer, strength, batch, dates)
 *
 * On low confidence: runs 3 additional preprocessing variants and takes best.
 */

import { createWorker } from 'tesseract.js'
import type { Worker } from 'tesseract.js'
import { enhanceForOcr } from '@/services/imageEnhancement/imageEnhancementService'
import { normalizeOcrText } from './textCleaner'
import { correctOcrSpelling } from './spellCorrector'
import type { OcrResult, ExtractedFields } from '@/types'

let worker: Worker | null = null
let workerReady = false
let workerLanguage = 'eng'

/** Initialise (or reinitialise) the Tesseract worker */
async function getWorker(lang = 'eng'): Promise<Worker> {
  if (worker && workerReady && workerLanguage === lang) return worker
  if (worker) {
    await worker.terminate()
    worker      = null
    workerReady = false
  }
  const options: Record<string, any> = {
    logger: () => {},   // suppress verbose logs
  }

  // Gateway: Use local files for pure offline Edge AI mode.
  // Temporarily forced to true for automated offline testing
  if (true) {
    options.workerPath = '/tesseract/worker.min.js'
    options.corePath = '/tesseract/tesseract-core.wasm.js'
    options.langPath = '/tesseract'
  }

  worker = await createWorker(lang, 1, options)
  workerLanguage = lang
  workerReady    = true
  return worker
}

// ─── Fallback Preprocessing Passes ───────────────────────────────────────────
// Used when OpenCV enhancement yields low confidence.

/** Load a data URL into an HTMLImageElement */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img   = new Image()
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src     = dataUrl
  })
}

/** Resize image so width is at least minWidth px */
function upscaleCanvas(src: HTMLCanvasElement | HTMLImageElement, minWidth = 1600): HTMLCanvasElement {
  const srcW   = src instanceof HTMLCanvasElement ? src.width  : src.naturalWidth
  const srcH   = src instanceof HTMLCanvasElement ? src.height : src.naturalHeight
  const scale  = srcW < minWidth ? minWidth / srcW : 1
  const W = Math.round(srcW * scale)
  const H = Math.round(srcH * scale)
  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, W, H)
  return canvas
}

/** Fallback Pass A — grayscale + unsharp mask */
function passA(img: HTMLImageElement): string {
  const canvas = upscaleCanvas(img)
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  const id  = ctx.getImageData(0, 0, W, H)
  const d   = id.data
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(id, 0, 0)
  const blur = document.createElement('canvas')
  blur.width = W; blur.height = H
  const bCtx = blur.getContext('2d')!
  bCtx.filter = 'blur(2px)'
  bCtx.drawImage(canvas, 0, 0)
  const bd  = bCtx.getImageData(0, 0, W, H)
  const sh  = ctx.getImageData(0, 0, W, H)
  for (let i = 0; i < sh.data.length; i += 4) {
    const v = Math.min(255, Math.max(0, sh.data[i] + 1.5 * (sh.data[i] - bd.data[i])))
    sh.data[i] = sh.data[i + 1] = sh.data[i + 2] = v
  }
  ctx.putImageData(sh, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Fallback Pass B — adaptive threshold */
function passB(img: HTMLImageElement): string {
  const canvas = upscaleCanvas(img)
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  const id  = ctx.getImageData(0, 0, W, H)
  const d   = id.data
  const gray = new Uint8Array(W * H)
  for (let i = 0; i < d.length; i += 4) {
    gray[i >> 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
  }
  const integral = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      integral[(y + 1) * (W + 1) + (x + 1)] =
        gray[y * W + x] +
        integral[y * (W + 1) + (x + 1)] +
        integral[(y + 1) * (W + 1) + x] -
        integral[y * (W + 1) + x]
    }
  }
  const blockR = 32, C = 8
  const out = new Uint8ClampedArray(d.length)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x1 = Math.max(0, x - blockR), y1 = Math.max(0, y - blockR)
      const x2 = Math.min(W - 1, x + blockR), y2 = Math.min(H - 1, y + blockR)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum   = integral[(y2 + 1) * (W + 1) + (x2 + 1)]
                  - integral[y1 * (W + 1) + (x2 + 1)]
                  - integral[(y2 + 1) * (W + 1) + x1]
                  + integral[y1 * (W + 1) + x1]
      const px = gray[y * W + x] < sum / count - C ? 0 : 255
      const idx = (y * W + x) * 4
      out[idx] = out[idx + 1] = out[idx + 2] = px
      out[idx + 3] = 255
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0)
  return canvas.toDataURL('image/png')
}

/** Fallback Pass C — inverted threshold (light text on dark background) */
function passC(img: HTMLImageElement): string {
  const canvas = upscaleCanvas(img)
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  const id  = ctx.getImageData(0, 0, W, H)
  const d   = id.data
  const gray = new Uint8Array(W * H)
  for (let i = 0; i < d.length; i += 4) {
    gray[i >> 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
  }
  let dark = 0
  for (let i = 0; i < gray.length; i++) if (gray[i] < 128) dark++
  const isDark = dark / gray.length > 0.5
  const out = new Uint8ClampedArray(d.length)
  for (let i = 0; i < gray.length; i++) {
    const v = isDark ? 255 - gray[i] : gray[i]
    const idx = i * 4
    out[idx] = out[idx + 1] = out[idx + 2] = v
    out[idx + 3] = 255
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0)
  return canvas.toDataURL('image/png')
}

// ─── Multi-pass OCR ───────────────────────────────────────────────────────────

interface PassResult {
  text: string
  rawConf: number
  effectiveConf: number
  wordCount: number
}

async function runPass(w: Worker, dataUrl: string): Promise<PassResult> {
  const { data } = await w.recognize(dataUrl)
  const rawConf  = data.confidence ?? 0
  const text     = data.text || ''
  const wc       = (text.match(/\b\w{2,}\b/g) || []).length
  // Boost: if many words found, Tesseract's raw score underestimates real quality
  const wordBonus     = Math.min(35, wc * 2)
  const effectiveConf = Math.min(95, rawConf + wordBonus)
  return { text, rawConf, effectiveConf, wordCount: wc }
}

// ─── Main OCR Function ────────────────────────────────────────────────────────

/**
 * Run OCR on a medicine strip image.
 *
 * @param source  - Image data URL or File
 * @param lang    - Tesseract language code (default: 'eng')
 */
export async function runOcr(source: string | File, lang = 'eng'): Promise<OcrResult> {
  const t0 = Date.now()

  // ── Step 1: Image Enhancement ──────────────────────────────────────────────
  const enhancement = await enhanceForOcr(source instanceof File ? source : source)
  const enhancedUrl = enhancement.enhancedDataUrl

  // ── Step 2: Primary OCR pass on enhanced image ────────────────────────────
  const w = await getWorker(lang)
  let best = await runPass(w, enhancedUrl)

  // ── Step 3: Fallback passes if confidence is low (<75) ───────────────────
  if (best.effectiveConf < 75) {
    // Need original image for fallback passes
    let rawUrl: string
    if (source instanceof File) {
      rawUrl = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload  = (e) => res(e.target!.result as string)
        reader.onerror = rej
        reader.readAsDataURL(source)
      })
    } else {
      rawUrl = source
    }

    const img = await loadImage(rawUrl)
    const fallbackPasses = [passA(img), passB(img), passC(img)]

    for (const url of fallbackPasses) {
      const result = await runPass(w, url)
      if (result.effectiveConf > best.effectiveConf) {
        best = result
      }
    }
  }

  // ── Step 4: Text cleaning + spell correction ─────────────────────────────
  const cleaned   = normalizeOcrText(best.text)
  const corrected = correctOcrSpelling(cleaned)

  // ── Step 5: Field extraction ─────────────────────────────────────────────
  const fields = parseFields(corrected)

  return {
    fields,
    rawText:          best.text,
    cleanedText:      corrected,
    confidence:       Math.round(best.effectiveConf),
    wordCount:        best.wordCount,
    duration:         Date.now() - t0,
    enhancementUsed:  enhancement.enhancementApplied,
  }
}

// ─── Field Parsers ────────────────────────────────────────────────────────────

const stripNoise = (s: string) => s.replace(/[®™©·]/g, '').trim()

function parseFields(text: string): ExtractedFields {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return {
    brandName:    extractBrandName(lines, text),
    genericName:  extractGenericName(text),
    strength:     extractStrength(text),
    manufacturer: extractManufacturer(text),
    batchNo:      extractBatchNo(text),
    mfgDate:      extractDate(text, /(?:mfg\.?|manufactured|manuf\.?)\s*:?\s*([\w\/\-]+\s*\d{2,4})/i),
    expDate:      extractDate(text, /(?:exp\.?|expiry|expires?|use\s+before)\s*:?\s*([\w\/\-]+\s*\d{2,4})/i),
    rawText:      text,
  }
}

function extractBrandName(lines: string[], text: string): string | null {
  // Priority 1 — Word-Hyphen-Number brand format
  const brandStrengthPat = /\b([A-Z][a-zA-Z]{2,}[-\s]\d{2,4}(?:\s*(?:mg|mcg|g|ml))?)\b/
  const m1 = text.match(brandStrengthPat)
  if (m1) return stripNoise(m1[1])

  // Priority 2 — skip label keywords
  const SKIP = /^(mfg|exp|batch|lot|b\.no|net|contents|rx|ip|bp|usp|marketed|manufactured|each|contains|store|dosage|tablet|capsule|syrup|injection|uncoated|film|composition|name)/i
  for (const line of lines.slice(0, 10)) {
    const c = stripNoise(line).replace(/[^a-zA-Z0-9\s\-\.]/g, '').trim()
    if (c.length >= 4 && !SKIP.test(c) && /^[A-Z][A-Za-z\-\d]/.test(c)) {
      return c
    }
  }
  return stripNoise(lines[0] ?? '') || null
}

function extractGenericName(text: string): string | null {
  const m1 = text.match(
    /(?:each\s+(?:uncoated\s+)?(?:tablet|capsule|ml|film[.\-]?coated\s+tablet)\s+contains?|composition|active\s+ingredient|generic\s+name)\s*:?\s*([^\n,;]{3,80})/i
  )
  if (m1) return m1[1].replace(/\s+\d+(?:\.\d+)?\s*(mg|mcg|g|ml|iu|%)/i, '').trim()

  const INN = /\b(Paracetamol|Amoxicillin|Azithromycin|Metformin|Atorvastatin|Cetirizine|Omeprazole|Pantoprazole|Ibuprofen|Aspirin|Diclofenac|Cefixime|Levofloxacin|Ciprofloxacin|Doxycycline|Montelukast|Ranitidine|Losartan|Amlodipine|Telmisartan|Rosuvastatin|Rabeprazole|Domperidone|Ondansetron|Tramadol|Sertraline|Alprazolam|Clonazepam|Metronidazole|Fluconazole|Albendazole|Ivermectin|Hydroxychloroquine|Aceclofenac|Nimesulide|Ketorolac|Pregabalin|Gabapentin|Levetiracetam|Atenolol|Metoprolol|Bisoprolol|Ramipril|Enalapril|Clopidogrel|Warfarin|Apixaban|Glibenclamide|Glimepiride|Sitagliptin|Voglibose|Levothyroxine|Prednisolone|Dexamethasone|Budesonide|Salbutamol|Theophylline|Fexofenadine|Loratadine|Dextromethorphan|Guaifenesin|Codeine|Calcium|Vitamin)\b/i
  const m2 = text.match(INN)
  if (m2) return m2[1]
  return null
}

function extractStrength(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?\s*(?:mg|mcg|μg|g|ml|iu|%|units?)(?:\s*\/\s*\d+\s*(?:ml|g))?)/i)
  return m ? m[1].trim() : null
}

function extractManufacturer(text: string): string | null {
  const m = text.match(
    /(?:mfg\.?\s+by|manufactured\s+by|marketed\s+by|distributed\s+by|mfd\.?\s+by)\s*:?\s*([^\n]{3,80})/i
  )
  return m ? m[1].trim() : null
}

function extractBatchNo(text: string): string | null {
  const m = text.match(/(?:b\.?\s*no\.?|batch\s*(?:no\.?|number)?|lot\s*(?:no\.?)?)\s*:?\s*([A-Z0-9\-\/]+)/i)
  return m ? m[1].trim() : null
}

function extractDate(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern)
  return m ? m[1].trim() : null
}

/** Terminate the Tesseract worker (call on component unmount if needed) */
export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker      = null
    workerReady = false
  }
}
