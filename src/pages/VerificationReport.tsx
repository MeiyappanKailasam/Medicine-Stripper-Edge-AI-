import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle, AlertTriangle, XCircle, HelpCircle,
  Scan, Share2, BookOpen, ChevronRight,
  Database, Globe, HardDrive, Clock, Wifi, WifiOff,
  ShieldCheck,
} from 'lucide-react'
import { useScanStore } from '@/store/appStore'
import type { VerificationStatus, EvidenceItem } from '@/types'

// ─── Generic Name Cleaner ─────────────────────────────────────────────────────

/**
 * The `genericName` field from the DB contains raw scraped text, e.g.:
 *   "composition    Levocetirizine (2.5mg) \ncomposition Montelukast (4mg)\nName: 47007"
 * This function parses it into a clean display string.
 */
function cleanGenericName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const matches = [...raw.matchAll(/composition\s+([A-Z][\w\s]+(?:\([^)]+\))?)/gi)]
  if (matches.length > 0) {
    return matches
      .map(m => m[1].trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(' + ')
  }
  return raw.replace(/\bName:\s*\d+/gi, '').replace(/\bcomposition\b/gi, '').trim().replace(/\s+/g, ' ') || null
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<VerificationStatus, {
  icon: typeof CheckCircle; color: string; bg: string; label: string; desc: string
}> = {
  VERIFIED:   { icon: CheckCircle,   color: 'text-success-400', bg: 'bg-success-500/10 border-success-500/30',  label: 'VERIFIED',    desc: 'High confidence match' },
  CAUTION:    { icon: AlertTriangle, color: 'text-warning-400', bg: 'bg-warning-500/10 border-warning-500/30',  label: 'CAUTION',     desc: 'Partial match — verify manually' },
  UNVERIFIED: { icon: XCircle,       color: 'text-danger-400',  bg: 'bg-danger-500/10 border-danger-500/30',    label: 'UNVERIFIED',  desc: 'Low confidence — not verified' },
  NOT_FOUND:  { icon: HelpCircle,    color: 'text-surface-400', bg: 'bg-surface-700/30 border-surface-600/30',  label: 'NOT FOUND',   desc: 'Medicine not in database' },
}

// ─── Confidence Meter ─────────────────────────────────────────────────────────

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 85 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#f43f5e'
  const r = 54; const circ = 2 * Math.PI * r
  const offset = circ * (1 - value / 100)
  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" className="-rotate-90" style={{ position: 'absolute', top: 0, left: 0 }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgb(51 65 85)" strokeWidth="10" />
        <motion.circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ position: 'relative', zIndex: 1 }}>
        <span className="text-3xl font-extrabold leading-none" style={{ color }}>{value}</span>
        <span className="text-xs text-surface-500 font-medium mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ─── Evidence Row ─────────────────────────────────────────────────────────────

function EvidenceRow({ item }: { item: EvidenceItem }) {
  const iconClass =
    item.type === 'success' ? 'text-success-400' :
    item.type === 'warning' ? 'text-warning-400' :
    'text-primary-400'
  const icon =
    item.type === 'success' ? '✓' :
    item.type === 'warning' ? '⚠' : '•'

  return (
    <div className="flex items-start gap-3 py-2 border-b border-surface-700/30 last:border-0">
      <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${iconClass}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-surface-500 font-medium block">{item.field}</span>
        <span className={`text-sm ${item.type === 'warning' ? 'text-warning-300' : 'text-surface-200'}`}>
          {item.message}
        </span>
      </div>
      {item.value && (
        <span className="text-xs font-mono text-surface-400 flex-shrink-0 bg-surface-700/50 px-2 py-0.5 rounded">
          {item.value}
        </span>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VerificationReport() {
  const nav = useNavigate()
  const { fusionReport, resetScan } = useScanStore()

  if (!fusionReport) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-surface-400 text-lg">No report available. Please scan a medicine first.</p>
        <button onClick={() => nav('/scanner')} className="btn-primary">
          <Scan className="w-4 h-4" /> Go to Scanner
        </button>
      </div>
    )
  }

  const {
    medicine, finalConfidence, status, signals, evidence,
    ocrResult, dataSource, offlineAvailable, lastUpdated, onlineResult
  } = fusionReport
  const cfg  = STATUS_CONFIG[status]
  const Icon = cfg.icon

  // Split evidence into success/info and warnings
  const successEvidence = evidence.filter(e => e.type !== 'warning')
  const warningEvidence = evidence.filter(e => e.type === 'warning')

  const SIGNAL_LABELS = [
    { label: 'OCR Confidence',  value: signals.ocrConfidence  },
    { label: 'Database Match',  value: signals.fuzzyScore     },
    { label: 'AI Packaging',    value: signals.packagingMatch },
    { label: 'Image Quality',   value: signals.imageQuality   },
    { label: 'Text Evidence',   value: signals.textualEvidence},
  ]

  const share = () => {
    const text = `Medicine: ${ocrResult.fields.brandName ?? medicine?.brandName}\nStatus: ${status}\nConfidence: ${finalConfidence}%\n\nVerified with MediVerify Edge AI`
    if (navigator.share) navigator.share({ title: 'MediVerify Report', text })
    else navigator.clipboard.writeText(text)
  }

  // Source icon + label
  const sourceLabel = dataSource === 'local_db' ? 'Local Database'
    : dataSource === 'cache'    ? `Cache (${onlineResult?.source ?? 'IndexedDB'})`
    : dataSource === 'online'   ? (onlineResult?.source ?? 'Online')
    : 'Not Found'
  const SourceIcon  = dataSource === 'local_db' ? Database
    : dataSource === 'cache'    ? HardDrive
    : dataSource === 'online'   ? Globe
    : HelpCircle

  const TABS = ['Uses', 'Dosage', 'Side Effects', 'Precautions', 'Storage']
  const tabContent: Record<string, React.ReactNode> = {
    'Uses':        <ul className="list-disc list-inside space-y-1 text-surface-300 text-sm">{medicine?.uses?.map((u,i) => <li key={i}>{u}</li>) ?? <li>Not available</li>}</ul>,
    'Dosage':      <p className="text-surface-300 text-sm">{medicine?.dosage || 'Consult your doctor or pharmacist for dosage information.'}</p>,
    'Side Effects':<ul className="list-disc list-inside space-y-1 text-surface-300 text-sm">{medicine?.sideEffects?.slice(0,10).map((s,i) => <li key={i}>{s}</li>) ?? <li>Not available</li>}</ul>,
    'Precautions': <ul className="list-disc list-inside space-y-1 text-surface-300 text-sm">{medicine?.precautions?.map((p,i) => <li key={i}>{p}</li>) ?? [<li key="0">Consult a doctor before use.</li>]}</ul>,
    'Storage':     <p className="text-surface-300 text-sm">{medicine?.storage || 'Store in a cool, dry place.'}</p>,
  }
  const [activeTab, setActiveTab] = useState(TABS[0])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-2xl mx-auto px-4 py-8 space-y-5"
    >
      {/* ── Header: Medicine Verification Report ─────────────────────────── */}
      <div className={`glass-card p-6 border ${cfg.bg}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-surface-500" />
              <p className="section-label text-xs">Medicine Verification Report</p>
            </div>
            {/* OCR name takes priority — prevents wrong DB name showing */}
            <h1 className="text-2xl font-bold text-surface-50 mt-1 truncate">
              {ocrResult.fields.brandName ?? medicine?.brandName ?? 'Unknown Medicine'}
            </h1>
            {medicine?.genericName && (
              <p className="text-surface-400 text-sm mt-1">{cleanGenericName(medicine.genericName)}</p>
            )}
            {medicine?.manufacturer && (
              <p className="text-surface-500 text-xs mt-1">{medicine.manufacturer}</p>
            )}
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${cfg.bg} flex-shrink-0`}>
            <Icon className={`w-4 h-4 ${cfg.color}`} />
            <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
          </div>
        </div>

        {/* Metadata row: source, last updated, offline */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-surface-700/40">
          <div className="flex items-center gap-1.5 text-xs text-surface-500">
            <SourceIcon className="w-3.5 h-3.5" />
            <span>{sourceLabel}</span>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs text-surface-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{new Date(lastUpdated).toLocaleDateString()}</span>
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs ${offlineAvailable ? 'text-success-400' : 'text-surface-600'}`}>
            {offlineAvailable ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{offlineAvailable ? 'Available offline' : 'Online only'}</span>
          </div>
        </div>
      </div>

      {/* ── Confidence + Signal Breakdown ─────────────────────────────────── */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-6">
          <div className="relative">
            <ConfidenceMeter value={finalConfidence} />
          </div>
          <div className="flex-1 space-y-2.5">
            {SIGNAL_LABELS.map(({ label, value }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs text-surface-400">
                  <span>{label}</span>
                  <span className="font-semibold text-surface-300">{value}%</span>
                </div>
                <div className="confidence-bar">
                  <motion.div
                    className={`confidence-bar-fill ${value >= 80 ? 'bg-success-500' : value >= 60 ? 'bg-warning-500' : 'bg-danger-500'}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Explainable Evidence Table ────────────────────────────────────── */}
      <div className="glass-card p-5 space-y-1">
        <p className="section-label mb-3">Verification Evidence</p>
        <div>
          {successEvidence.length > 0 && (
            <div className="mb-2">
              {successEvidence.map((item, i) => <EvidenceRow key={i} item={item} />)}
            </div>
          )}
          {warningEvidence.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-700/40">
              <p className="text-xs text-warning-400 font-semibold mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Warnings
              </p>
              {warningEvidence.map((item, i) => <EvidenceRow key={i} item={item} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── OCR Fields ────────────────────────────────────────────────────── */}
      <div className="glass-card p-5 space-y-3">
        <p className="section-label">Extracted from Image (OCR)</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {Object.entries(ocrResult.fields)
            .filter(([k, v]) => k !== 'rawText' && v)
            .map(([k, v]) => (
              <div key={k} className="space-y-0.5">
                <p className="text-surface-500 text-xs capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-surface-200 font-medium truncate">{v as string}</p>
              </div>
            ))}
        </div>
      </div>

      {/* ── Medicine Information Tabs ─────────────────────────────────────── */}
      {medicine && (
        <div className="glass-card p-5 space-y-4">
          <p className="section-label">Medicine Information</p>
          <div className="flex gap-2 flex-wrap">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === tab ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                                   : 'text-surface-400 hover:text-surface-200 bg-surface-700/50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="min-h-[80px]">{tabContent[activeTab]}</div>
          <Link
            to={`/medicine/${medicine.id}`}
            className="btn-ghost text-xs gap-1 w-full justify-center"
          >
            <BookOpen className="w-3.5 h-3.5" /> Full Medicine Details
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* ── NOT_FOUND state ───────────────────────────────────────────────── */}
      {status === 'NOT_FOUND' && (
        <div className="glass-card p-5 space-y-2 border border-surface-600/30">
          <p className="section-label">Searching Knowledge Base</p>
          <p className="text-surface-400 text-sm">
            This medicine was not found in our local database or online sources.
            Try rescanning with a clearer image, or check the medicine name manually.
          </p>
          {ocrResult.fields.brandName && (
            <p className="text-surface-500 text-xs">
              OCR detected: <span className="font-mono text-surface-300">{ocrResult.fields.brandName}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { resetScan(); nav('/scanner') }}
          className="btn-secondary justify-center"
        >
          <Scan className="w-4 h-4" /> Scan Again
        </button>
        <button onClick={share} className="btn-primary justify-center">
          <Share2 className="w-4 h-4" /> Share Report
        </button>
      </div>
    </motion.div>
  )
}
