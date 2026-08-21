// ============================================================
// MediVerify — Shared TypeScript Types
// Adaptive Edge AI Medicine Verification System
// ============================================================

// ── Image Quality ─────────────────────────────────────────────
export type QualityIssue =
  | 'blur'
  | 'too_dark'
  | 'overexposed'
  | 'low_resolution'
  | 'glare';

export interface QualityReport {
  score: number;               // 0–100
  passed: boolean;             // score >= threshold (default 60)
  issues: QualityIssue[];
  suggestions: string[];
  metrics: {
    blurScore: number;         // Laplacian variance (higher = sharper)
    brightness: number;        // 0–255 mean luminance
    resolution: { w: number; h: number };
    glareRatio: number;        // 0–1 fraction of overexposed pixels
  };
}

// ── OpenCV.js Enhancement ─────────────────────────────────────
export type OpenCvStatus =
  | 'not_loaded'
  | 'loading'
  | 'ready'
  | 'error'
  | 'unavailable';             // CDN blocked / offline

export interface EnhancementResult {
  enhancedDataUrl: string;     // OpenCV-processed image for OCR
  originalDataUrl: string;     // Kept for display
  enhancementApplied: boolean; // false if OpenCV unavailable (fallback used)
  status: OpenCvStatus;
  durationMs: number;
}

// ── OCR ───────────────────────────────────────────────────────
export interface ExtractedFields {
  brandName:       string | null;
  genericName:     string | null;
  strength:        string | null;
  manufacturer:    string | null;
  batchNo:         string | null;
  mfgDate:         string | null;
  expDate:         string | null;
  rawText:         string;
}

export interface OcrResult {
  fields:           ExtractedFields;
  rawText:          string;
  cleanedText:      string;     // After textCleaner + spellCorrector
  confidence:       number;     // 0–100 overall word confidence
  wordCount:        number;
  duration:         number;     // ms
  enhancementUsed:  boolean;    // Was OpenCV enhancement applied?
}

// ── Fuzzy Matching ────────────────────────────────────────────
export interface FuzzyMatchResult {
  medicine:     SlimMedicineEntry;
  score:        number;          // 0–100 (100 = perfect match)
  matchedOn:    ('brandName' | 'genericName' | 'manufacturer' | 'composition')[];
}

// ── Medicine Database ─────────────────────────────────────────
/** Slim entry stored in index buckets — used for Fuse.js search */
export interface SlimMedicineEntry {
  id:               string;
  b:                string;      // brandName
  g:                string;      // genericName
  m:                string;      // manufacturer
  tc:               string;      // therapeuticClass
  ci:               number;      // chunkIndex
  disc:             boolean;     // isDiscontinued
}

/** Full entry from chunk files — loaded on-demand */
export interface MedicineEntry {
  id:                   string;
  brandName:            string;
  genericName:          string;
  composition:          string;
  compositionList:      string[];
  manufacturer:         string;
  price:                string;
  packType:             string;
  isDiscontinued:       boolean;
  uses:                 string[];
  sideEffects:          string[];
  substitutes:          string[];
  therapeuticClass:     string;
  actionClass:          string;
  chemicalClass:        string;
  habitForming:         boolean;
  rxRequired:           boolean;
  reviewExcellent:      number | null;
  reviewAverage:        number | null;
  reviewPoor:           number | null;
  dosage:               string;
  contraindications:    string[];
  storage:              string;
  precautions:          string[];
  interactions:         string[];          // drug interaction checker
  genericAlternatives:  string[];          // generic substitute
  dosageSchedule:       null;             // future: medicine reminder
  clinicalNotes:        null;             // future: doctor mode
  _searchTokens:        string[];
}

/** DB meta loaded at startup */
export interface DbMeta {
  version:          number;
  builtAt:          string;
  totalEntries:     number;
  chunkSize:        number;
  numChunks:        number;
  sources:          { dataset: string; license: string }[];
  chunks:           { index: number; file: string; count: number; sizeBytes: number }[];
  indexBuckets:     Record<string, { file: string; count: number; sizeKB: number }>;
  indexBucketDir:   string;
  loadingStrategy:  string;
  miniIndexFile:    string;
  miniIndexEntries: number;
}

// ── IndexedDB Cache ───────────────────────────────────────────
/** A MedicineEntry stored in the IndexedDB online cache */
export interface CachedMedicineEntry extends MedicineEntry {
  _cachedAt:      number;   // Unix timestamp (ms)
  _cacheSource:   string;   // e.g. 'OpenFDA', 'manual'
  _cacheVersion:  number;   // Increment on schema change
  _isVerified:    boolean;  // true = came from trusted local DB, never overwrite
}

export interface CacheStats {
  count:       number;
  lastUpdated: number | null;
  sizeEstimateKb: number;
}

// ── AI / Packaging Verifier ───────────────────────────────────
export interface Prediction {
  classIndex: number;
  className:  string;
  confidence: number;   // 0–1
}

export interface PackagingVerificationResult {
  matchedClass:       string;
  confidence:         number;    // 0–1
  top5:               Prediction[];
  matchedOcrName:     boolean;   // did top-1 match the OCR-identified medicine?
  isUsingMock:        boolean;
  visualSimilarity:   number;    // 0–1 visual feature score (color + texture)
  modelStatus:        'loaded' | 'mock' | 'error';
}

// ── Online Retrieval ──────────────────────────────────────────
export type OnlineRetrievalStatus =
  | 'idle'
  | 'fetching'
  | 'found'
  | 'found_in_cache'
  | 'not_found'
  | 'offline'
  | 'error';

export interface OnlineRetrievalResult {
  status:           OnlineRetrievalStatus;
  medicine:         MedicineEntry | null;
  source:           string;             // e.g. 'OpenFDA', 'IndexedDB Cache'
  cached:           boolean;            // was this result served from IndexedDB?
  cachedAt:         number | null;      // timestamp if from cache
  offlineAvailable: boolean;            // is this medicine now available offline?
}

// ── Confidence Fusion ─────────────────────────────────────────
export type VerificationStatus = 'VERIFIED' | 'CAUTION' | 'UNVERIFIED' | 'NOT_FOUND';

/** Configurable fusion weights — must sum to 1.0 */
export interface FusionWeights {
  ocr:       number;   // default 0.30
  fuzzy:     number;   // default 0.30
  packaging: number;   // default 0.20
  quality:   number;   // default 0.10
  evidence:  number;   // default 0.10 (textual field matches)
}

export interface SignalScores {
  ocrConfidence:        number;    // 0–100
  fuzzyScore:           number;    // 0–100
  packagingMatch:       number;    // 0–100
  imageQuality:         number;    // 0–100
  textualEvidence:      number;    // 0–100 (how many fields were extracted)
}

/** A single piece of evidence shown in the Explainable AI report */
export interface EvidenceItem {
  type:    'success' | 'warning' | 'info';
  field:   string;    // e.g. 'Brand Name', 'Manufacturer'
  message: string;    // e.g. 'Detected "DOLO 650" with 94% confidence'
  value:   string | null;
}

export interface FusionReport {
  medicine:           MedicineEntry | null;
  finalConfidence:    number;              // 0–100
  status:             VerificationStatus;
  signals:            SignalScores;
  weights:            FusionWeights;
  evidence:           EvidenceItem[];      // Structured evidence (new)
  explanations:       string[];            // Legacy flat list (kept for compatibility)
  warnings:           string[];
  ocrResult:          OcrResult;
  fuzzyMatches:       FuzzyMatchResult[];
  qualityReport:      QualityReport;
  onlineResult:       OnlineRetrievalResult | null;
  dataSource:         'local_db' | 'online' | 'cache' | 'not_found';
  offlineAvailable:   boolean;
  lastUpdated:        number | null;       // timestamp of data freshness
  timestamp:          number;
  imageDataUrl:       string;
}

// ── Scan History ──────────────────────────────────────────────
export interface ScanHistoryEntry {
  id:               string;
  timestamp:        number;
  medicineName:     string;
  confidence:       number;
  status:           VerificationStatus;
  thumbnailDataUrl: string;
  reportSnapshot:   FusionReport;
  source:           'local' | 'online' | 'cache' | 'not_found';
}

// ── Scan Pipeline State ───────────────────────────────────────
export type PipelineStage =
  | 'idle'
  | 'image_enhancement'    // NEW: OpenCV.js preprocessing
  | 'quality_check'
  | 'ocr'
  | 'fuzzy_match'
  | 'db_lookup'
  | 'online_fetch'
  | 'ai_verification'
  | 'fusion'
  | 'complete'
  | 'error';

export interface PipelineProgress {
  stage:     PipelineStage;
  progress:  number;          // 0–100
  message:   string;
  error:     string | null;
}

// ── Settings ──────────────────────────────────────────────────
export interface AppSettings {
  darkMode:           boolean;
  fuzzyThreshold:     number;          // 50–95 (default 70)
  autoSaveHistory:    boolean;
  ocrLanguage:        string;          // default 'eng'
  showDebugInfo:      boolean;
  fusionWeights:      FusionWeights;   // configurable via Settings page
}

// ── Storage Adapter (generic, swappable) ─────────────────────
export interface StorageAdapter<T> {
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  put(item: T): Promise<void>;
  putMany(items: T[]): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
}
