/**
 * OpenCV.js CDN Loader — Singleton
 *
 * Loads OpenCV.js from CDN on first use. Subsequent calls return immediately.
 * OpenCV.js is ~7MB and not tree-shakeable from npm, so CDN loading is used.
 *
 * Falls back gracefully when offline or CDN is blocked.
 */

import type { OpenCvStatus } from '@/types'

const OPENCV_CDN_URL = 'https://docs.opencv.org/4.8.0/opencv.js'
const LOAD_TIMEOUT_MS = 15_000

type StatusListener = (status: OpenCvStatus) => void

let _status: OpenCvStatus = 'not_loaded'
let _loadPromise: Promise<void> | null = null
const _listeners: Set<StatusListener> = new Set()

// ─── Internal ────────────────────────────────────────────────────────────────

function setStatus(s: OpenCvStatus) {
  _status = s
  _listeners.forEach((fn) => fn(s))
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Already injected?
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src   = src
    script.async = true

    const timer = setTimeout(() => {
      script.remove()
      reject(new Error(`OpenCV.js load timeout after ${LOAD_TIMEOUT_MS}ms`))
    }, LOAD_TIMEOUT_MS)

    script.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    script.onerror = () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('OpenCV.js script failed to load'))
    }

    document.head.appendChild(script)
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Current load status of OpenCV.js.
 */
export function getOpenCvStatus(): OpenCvStatus {
  return _status
}

/**
 * True if OpenCV is ready to use.
 */
export function isOpenCvReady(): boolean {
  return _status === 'ready'
}

/**
 * Subscribe to status changes.
 * Returns an unsubscribe function.
 */
export function onOpenCvStatusChange(fn: StatusListener): () => void {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/**
 * Load OpenCV.js from CDN. Idempotent — safe to call multiple times.
 * Resolves when OpenCV is ready. Rejects if load fails or times out.
 */
export async function loadOpenCv(): Promise<void> {
  // Already ready
  if (_status === 'ready') return

  // Already loading — return same promise
  if (_loadPromise) return _loadPromise

  // Check offline early
  if (!navigator.onLine) {
    setStatus('unavailable')
    throw new Error('OpenCV.js unavailable: device is offline')
  }

  _loadPromise = (async () => {
    try {
      setStatus('loading')
      await injectScript(OPENCV_CDN_URL)

      // Wait for OpenCV runtime to initialise
      await new Promise<void>((resolve, reject) => {
        // Already initialised (script was cached)
        if (typeof (window as unknown as Record<string, unknown>)['cv'] !== 'undefined') {
          resolve()
          return
        }

        // cv['onRuntimeInitialized'] fires when WASM is ready
        const timeout = setTimeout(
          () => reject(new Error('OpenCV runtime init timeout')),
          LOAD_TIMEOUT_MS
        )

        ;(window as unknown as Record<string, unknown>)['Module'] = {
          onRuntimeInitialized: () => {
            clearTimeout(timeout)
            resolve()
          },
        }
      })

      setStatus('ready')
    } catch (err) {
      setStatus('error')
      _loadPromise = null
      throw err
    }
  })()

  return _loadPromise
}
