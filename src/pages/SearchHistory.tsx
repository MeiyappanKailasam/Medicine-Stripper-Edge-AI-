import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { History, Trash2, ChevronRight, Clock, CheckCircle, AlertTriangle, XCircle, HelpCircle, Search } from 'lucide-react'
import { useHistoryStore } from '@/store/appStore'
import { formatDate } from '@/utils/idUtils'
import { useState } from 'react'

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  VERIFIED: CheckCircle, CAUTION: AlertTriangle, UNVERIFIED: XCircle, NOT_FOUND: HelpCircle,
}
const STATUS_COLOR: Record<string, string> = {
  VERIFIED: 'text-success-400', CAUTION: 'text-warning-400', UNVERIFIED: 'text-danger-400', NOT_FOUND: 'text-surface-400',
}

export default function SearchHistory() {
  const { entries, removeEntry, clearHistory } = useHistoryStore()
  const [query, setQuery] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = entries.filter((e) =>
    e.medicineName.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="max-w-2xl mx-auto px-4 py-8 space-y-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Scan History</h1>
          <p className="text-surface-400 text-sm">{entries.length} scans recorded</p>
        </div>
        {entries.length > 0 && (
          confirmClear ? (
            <div className="flex gap-2">
              <button onClick={() => { clearHistory(); setConfirmClear(false) }} className="btn-danger text-xs px-3 py-1.5">Confirm Clear</button>
              <button onClick={() => setConfirmClear(false)} className="btn-ghost text-xs">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} className="btn-ghost text-xs gap-1 text-danger-400 hover:text-danger-300">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          )
        )}
      </div>

      {/* Search */}
      {entries.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            className="input-field pl-9"
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-700/50 flex items-center justify-center mx-auto">
            <History className="w-8 h-8 text-surface-500" />
          </div>
          <p className="text-surface-300 font-medium">No scans yet</p>
          <p className="text-surface-500 text-sm">Your scan history will appear here after your first verification.</p>
          <Link to="/scanner" className="btn-primary inline-flex">Start Scanning</Link>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-3">
        <AnimatePresence>
          {filtered.map((entry) => {
            const Icon = STATUS_ICON[entry.status] ?? HelpCircle
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="glass-card-hover flex items-center gap-4 p-4 group"
              >
                <img
                  src={entry.thumbnailDataUrl}
                  alt={entry.medicineName}
                  className="w-14 h-14 rounded-xl object-cover bg-surface-800 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-100 truncate">{entry.medicineName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Icon className={`w-3.5 h-3.5 ${STATUS_COLOR[entry.status]}`} />
                    <span className={`text-xs font-medium ${STATUS_COLOR[entry.status]}`}>{entry.status}</span>
                    <span className="text-xs text-surface-500">•</span>
                    <span className="text-xs text-surface-500">{entry.confidence}%</span>
                    <span className="text-xs text-surface-500">•</span>
                    <span className={`text-xs ${entry.source === 'online' ? 'text-primary-400' : 'text-surface-500'}`}>
                      {entry.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-xs text-surface-600">
                    <Clock className="w-3 h-3" />{formatDate(entry.timestamp)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="opacity-0 group-hover:opacity-100 btn-ghost p-1.5 text-danger-400 hover:text-danger-300 transition-opacity"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <Link to={`/report/${entry.id}`} className="btn-ghost p-1.5">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {filtered.length === 0 && query && (
          <p className="text-center text-surface-500 py-8">No results for "{query}"</p>
        )}
      </div>
    </motion.div>
  )
}
