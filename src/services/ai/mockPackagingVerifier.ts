/**
 * Mock Packaging Verifier
 * Used when no real TF.js model is present.
 * Returns realistic confidence values based on OCR match similarity.
 * Same interface as the real packagingVerifier.ts — zero code change needed to swap.
 */

import type { PackagingVerificationResult } from '@/types'

export async function verifyPackaging(
  _imageDataUrl: string,
  ocrMedicineName: string
): Promise<PackagingVerificationResult> {
  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 600))

  // Deterministic confidence based on name length (realistic mock)
  const seed = ocrMedicineName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const baseConf = 0.55 + (seed % 40) / 100   // 0.55–0.94

  const classes = [
    ocrMedicineName || 'Unknown Medicine',
    'Generic Tablet',
    'Capsule Strip',
    'Syrup Bottle',
    'Injection Vial',
  ]

  const top5 = classes.map((name, i) => ({
    classIndex: i,
    className:  name,
    confidence: i === 0 ? baseConf : baseConf * Math.pow(0.4, i),
  }))

  return {
    matchedClass:   classes[0],
    confidence:     baseConf,
    top5,
    matchedOcrName: true,
    isUsingMock: true,
    visualSimilarity: baseConf,
    modelStatus: 'mock' as const,
  }
}

export const MODEL_STATUS = {
  loaded:    false,
  isMock:    true,
  modelPath: null as string | null,
}
