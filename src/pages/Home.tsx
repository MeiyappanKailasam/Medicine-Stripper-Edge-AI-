import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Scan, Shield, Zap, Database, WifiOff, ChevronRight, Star, Clock } from 'lucide-react'
import { useHistoryStore } from '@/store/appStore'
import { formatDate } from '@/utils/idUtils'

const FEATURES = [
  { icon: Scan,     title: 'Multi-Modal OCR',    desc: 'Extracts brand name, generic, batch number, expiry and more from any medicine strip.' },
  { icon: Shield,   title: 'AI Verification',    desc: 'TensorFlow.js packaging verification confirms the visual match — no server needed.' },
  { icon: Database, title: '250k Medicine DB',   desc: 'Offline-first database built from Kaggle datasets covering all major Indian medicines.' },
  { icon: Zap,      title: 'Confidence Fusion',  desc: 'Combines OCR, fuzzy match, AI and image quality into one explained confidence score.' },
  { icon: WifiOff,  title: 'Works Offline',      desc: 'Full PWA with service worker. Scan medicines anywhere — no internet after first load.' },
  { icon: Star,     title: 'Explainable AI',     desc: 'Every prediction shows exactly why it was made. Never just a name — always a reason.' },
]

const STATUS_COLOR: Record<string, string> = {
  VERIFIED:   'text-success-400',
  CAUTION:    'text-warning-400',
  UNVERIFIED: 'text-danger-400',
  NOT_FOUND:  'text-surface-400',
}

export default function Home() {
  const { entries } = useHistoryStore()
  const recent = entries.slice(0, 3)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-5xl mx-auto px-4 py-10 space-y-16"
    >
      {/* Hero */}
      <section className="text-center space-y-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/30 text-primary-400 text-sm font-medium"
        >
          <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
          Edge AI • Offline Ready • 250,554 Medicines
        </motion.div>

        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-5xl md:text-6xl font-extrabold leading-tight"
        >
          Verify Any Medicine
          <br />
          <span className="text-gradient-primary">In Seconds</span>
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-surface-400 text-xl max-w-2xl mx-auto leading-relaxed"
        >
          Upload a photo of any medicine strip. MediVerify uses OCR, fuzzy matching, and on-device AI
          to verify and explain every result — even without internet.
        </motion.p>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-4 flex-wrap"
        >
          <Link to="/scanner" className="btn-primary text-base px-8 py-3.5">
            <Scan className="w-5 h-5" />
            Start Scanning
          </Link>
          <Link to="/about" className="btn-secondary text-base px-8 py-3.5">
            How It Works
            <ChevronRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </section>

      {/* Pipeline visual */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="glass-card p-6 md:p-8"
      >
        <p className="section-label text-center mb-6">Verification Pipeline</p>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {['Upload', 'Quality Check', 'OCR', 'Fuzzy Match', 'DB Lookup', 'AI Verify', 'Report'].map((step, i, arr) => (
            <div key={step} className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-surface-700/50 border border-surface-600 text-surface-300 font-medium">
                {step}
              </div>
              {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-surface-600" />}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Features grid */}
      <section>
        <p className="section-label text-center mb-8">What MediVerify Does</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="glass-card-hover p-5 space-y-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary-500/15 border border-primary-500/20 flex items-center justify-center">
                <f.icon className="w-5 h-5 text-primary-400" />
              </div>
              <h3 className="font-semibold text-surface-100">{f.title}</h3>
              <p className="text-surface-400 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Recent Scans */}
      {recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="section-label">Recent Scans</p>
            <Link to="/history" className="btn-ghost text-xs gap-1">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="space-y-3">
            {recent.map((entry) => (
              <Link
                key={entry.id}
                to={`/report/${entry.id}`}
                className="glass-card-hover flex items-center gap-4 p-4"
              >
                <img
                  src={entry.thumbnailDataUrl}
                  alt={entry.medicineName}
                  className="w-14 h-14 rounded-xl object-cover bg-surface-800 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-100 truncate">{entry.medicineName}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs font-medium ${STATUS_COLOR[entry.status] ?? 'text-surface-400'}`}>
                      {entry.status}
                    </span>
                    <span className="text-xs text-surface-500">{entry.confidence}% confidence</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs text-surface-500">
                    <Clock className="w-3 h-3" />
                    {formatDate(entry.timestamp)}
                  </div>
                  <ChevronRight className="w-4 h-4 text-surface-600 ml-auto mt-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  )
}
