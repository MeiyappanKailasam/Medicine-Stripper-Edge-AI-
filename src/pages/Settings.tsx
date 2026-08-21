import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2, Save, Moon, Sun, Sliders, ShieldAlert, Cpu,
  CheckCircle, Database, Zap, Weight
} from 'lucide-react'
import { useAppStore, useHistoryStore } from '@/store/appStore'
import { getCacheStats, clearCache } from '@/services/cache/cacheService'
import { DEFAULT_FUSION_WEIGHTS } from '@/services/verification/confidenceFusion'
import type { FusionWeights } from '@/types'

interface CacheInfo {
  count: number
  lastUpdated: number | null
  sizeEstimateKb: number
}

// ─── Toggle Switch Component ──────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-11 h-6 bg-surface-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-300 after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600 peer-checked:after:bg-surface-50" />
    </label>
  )
}

// ─── Slider Row Component ─────────────────────────────────────────────────────

function SliderRow({
  label, hint, value, min, max, step, unit, onChange
}: {
  label: string; hint: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-sm">
        <span className="text-surface-300 font-medium">{label}</span>
        <span className="text-primary-400 font-semibold">{value}{unit ?? ''}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
      />
      <p className="text-xs text-surface-500">{hint}</p>
    </div>
  )
}

// ─── Fusion Weight Editor ─────────────────────────────────────────────────────

function FusionWeightsEditor({
  weights, onChange
}: {
  weights: FusionWeights
  onChange: (w: FusionWeights) => void
}) {
  const keys: (keyof FusionWeights)[] = ['ocr', 'fuzzy', 'packaging', 'quality', 'evidence']
  const labels: Record<keyof FusionWeights, string> = {
    ocr:       'OCR Confidence',
    fuzzy:     'Fuzzy Match',
    packaging: 'Packaging AI',
    quality:   'Image Quality',
    evidence:  'Text Evidence',
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const balanced = Math.abs(total - 1.0) < 0.01

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const pct = Math.round(weights[key] * 100)
        return (
          <div key={key} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-surface-300">{labels[key]}</span>
              <span className={`font-semibold ${pct > 0 ? 'text-primary-400' : 'text-surface-600'}`}>{pct}%</span>
            </div>
            <input
              type="range" min={0} max={0.5} step={0.05}
              value={weights[key]}
              onChange={(e) => onChange({ ...weights, [key]: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        )
      })}
      <div className={`text-xs flex items-center justify-between pt-2 border-t border-surface-700/50 ${balanced ? 'text-success-400' : 'text-warning-400'}`}>
        <span>Weights total: {Math.round(total * 100)}%</span>
        {!balanced && <span>Note: weights are automatically normalized during computation</span>}
      </div>
      <button
        onClick={() => onChange(DEFAULT_FUSION_WEIGHTS)}
        className="btn-ghost text-xs gap-1"
      >
        Reset to defaults
      </button>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Settings() {
  const { settings, updateSettings } = useAppStore()
  const { entries, clearHistory } = useHistoryStore()
  const [successMsg, setSuccessMsg]   = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmCacheClr, setConfirmCacheClr] = useState(false)
  const [cacheInfo, setCacheInfo]     = useState<CacheInfo | null>(null)

  useEffect(() => {
    getCacheStats().then(setCacheInfo)
  }, [])

  const showNotification = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const exportHistory = () => {
    try {
      const dataStr = JSON.stringify(entries, null, 2)
      const uri     = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
      const a       = document.createElement('a')
      a.href     = uri
      a.download = `mediverify-history-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      showNotification('History exported successfully!')
    } catch {
      showNotification('Failed to export history.')
    }
  }

  const handleClearCache = async () => {
    const removed = await clearCache()
    const info    = await getCacheStats()
    setCacheInfo(info)
    setConfirmCacheClr(false)
    showNotification(`Cache cleared (${removed} entries removed)`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="max-w-2xl mx-auto px-4 py-8 space-y-6"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-surface-50">System Settings</h1>
        <p className="text-surface-400 text-sm">Configure pipeline parameters, AI weights, and local storage.</p>
      </div>

      {/* Notification Banner */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="p-3 rounded-xl bg-success-500/10 border border-success-500/20 text-success-400 text-xs font-semibold flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" /> {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pipeline Controls */}
      <div className="glass-card p-6 space-y-5">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary-400" /> Pipeline Controls
        </h2>
        <SliderRow
          label="Fuzzy Matching Threshold" unit="%"
          value={settings.fuzzyThreshold} min={50} max={95} step={5}
          hint="Higher values require closer name matches, reducing false positives but lowering recall."
          onChange={(v) => updateSettings({ fuzzyThreshold: v })}
        />
        <div className="flex items-center justify-between pt-3 border-t border-surface-700/50">
          <div>
            <span className="text-sm text-surface-200 font-medium block">Auto-Save Scans</span>
            <span className="text-xs text-surface-500">Automatically save verified scan reports locally.</span>
          </div>
          <Toggle checked={settings.autoSaveHistory} onChange={(v) => updateSettings({ autoSaveHistory: v })} />
        </div>
      </div>

      {/* Fusion Weights */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2">
          <Weight className="w-5 h-5 text-primary-400" /> Confidence Fusion Weights
        </h2>
        <p className="text-xs text-surface-500">
          Control how each signal contributes to the final verification confidence score.
          Weights are automatically normalized — they don't need to sum to 100%.
        </p>
        <FusionWeightsEditor
          weights={settings.fusionWeights}
          onChange={(w) => updateSettings({ fusionWeights: w })}
        />
      </div>

      {/* Visual Settings */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2">
          {settings.darkMode ? <Moon className="w-5 h-5 text-primary-400" /> : <Sun className="w-5 h-5 text-primary-400" />}
          Aesthetic Theme
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-surface-200 font-medium block">Dark Mode UI</span>
            <span className="text-xs text-surface-500">Vibrant dark colors optimized for eye comfort.</span>
          </div>
          <Toggle checked={settings.darkMode} onChange={(v) => updateSettings({ darkMode: v })} />
        </div>
      </div>

      {/* Diagnostics */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary-400" /> Diagnostics & Advanced
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-surface-200 font-medium block">Show Debug Info</span>
            <span className="text-xs text-surface-500">Show raw OCR text, blur scores, and class predictions.</span>
          </div>
          <Toggle checked={settings.showDebugInfo} onChange={(v) => updateSettings({ showDebugInfo: v })} />
        </div>
        <div className="pt-3 border-t border-surface-700/50 flex items-start gap-3 text-xs text-surface-500">
          <Zap className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-surface-300 mb-0.5">OpenCV.js Image Enhancement</p>
            <p>Loaded on first scan from CDN (one-time ~7MB). Falls back to canvas processing when unavailable.</p>
          </div>
        </div>
      </div>

      {/* Online Medicine Cache */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary-400" /> Online Medicine Cache
        </h2>
        {cacheInfo !== null ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-surface-700/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-primary-400">{cacheInfo.count}</p>
              <p className="text-xs text-surface-500 mt-1">Entries</p>
            </div>
            <div className="bg-surface-700/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-primary-400">~{cacheInfo.sizeEstimateKb}KB</p>
              <p className="text-xs text-surface-500 mt-1">Est. Size</p>
            </div>
            <div className="bg-surface-700/50 rounded-xl p-3">
              <p className="text-2xl font-bold text-success-400">✓</p>
              <p className="text-xs text-surface-500 mt-1">Offline Ready</p>
            </div>
          </div>
        ) : (
          <p className="text-surface-500 text-xs">Loading cache statistics…</p>
        )}
        <p className="text-xs text-surface-500">
          Medicines found via OpenFDA are cached here for offline access. Cleared entries are re-fetched on next scan.
        </p>
        {confirmCacheClr ? (
          <div className="flex gap-2">
            <button onClick={handleClearCache} className="btn-danger text-xs px-3 py-1.5">Confirm Clear Cache</button>
            <button onClick={() => setConfirmCacheClr(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmCacheClr(true)}
            disabled={cacheInfo?.count === 0}
            className="btn-secondary text-xs border-danger-500/20 text-danger-400 hover:bg-danger-500/10 hover:text-danger-300"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Cache
          </button>
        )}
      </div>

      {/* Data Management */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-bold text-surface-50 flex items-center gap-2 text-danger-400">
          <ShieldAlert className="w-5 h-5" /> Scan History
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-sm text-surface-200 font-medium block">Scan History</span>
            <span className="text-xs text-surface-500">{entries.length} items stored locally (max 200)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {entries.length > 0 && (
              <button onClick={exportHistory} className="btn-secondary text-xs">
                <Save className="w-3.5 h-3.5" /> Export JSON
              </button>
            )}
            {confirmClear ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { clearHistory(); setConfirmClear(false); showNotification('Scan history cleared.') }}
                  className="btn-danger text-xs px-3 py-1.5"
                >Confirm Delete</button>
                <button onClick={() => setConfirmClear(false)} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={entries.length === 0}
                className="btn-secondary text-xs border-danger-500/20 text-danger-400 hover:bg-danger-500/10 hover:text-danger-300"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear History
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
