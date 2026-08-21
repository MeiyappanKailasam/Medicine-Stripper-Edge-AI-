import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Shield, AlertTriangle, AlertCircle, RefreshCw, Layers, DollarSign, Package } from 'lucide-react'
import { getMedicineById } from '@/services/database/medicineDB'
import type { MedicineEntry, SlimMedicineEntry } from '@/types'

export default function MedicineDetails() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [medicine, setMedicine] = useState<MedicineEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMedicine() {
      if (!id) return
      setLoading(true)
      setError(null)
      try {
        // Resolve chunkIndex using the first letter bucket
        const firstChar = id.trim().toLowerCase()[0] || '0'
        const bucketChar = /^[a-z]$/.test(firstChar) ? firstChar : '0'

        const res = await fetch(`/src/database/index_buckets/bucket_${bucketChar}.json`)
        if (!res.ok) {
          throw new Error(`Failed to load bucket for identifier "${bucketChar}"`)
        }
        const bucket = await res.json() as SlimMedicineEntry[]
        const entry = bucket.find((e) => e.id === id)

        if (!entry) {
          throw new Error('Medicine not found in offline index')
        }

        const fullEntry = await getMedicineById(id, entry.ci)
        if (!fullEntry) {
          throw new Error('Failed to load medicine details from chunk database')
        }

        setMedicine(fullEntry)
      } catch (err) {
        console.error(err)
        setError((err as Error).message || 'An error occurred while loading medicine details')
      } finally {
        setLoading(false)
      }
    }

    loadMedicine()
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
        <p className="text-surface-400 text-sm">Loading medicine details...</p>
      </div>
    )
  }

  if (error || !medicine) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 bg-danger-500/10 border border-danger-500/20 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-danger-400" />
        </div>
        <h2 className="text-xl font-bold text-surface-50">Failed to load medicine</h2>
        <p className="text-surface-400 text-sm max-w-md mx-auto">{error || 'Medicine details could not be found.'}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary">
          <ChevronLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    )
  }

  const badges = [
    medicine.rxRequired && { label: 'Rx Prescription Required', color: 'bg-danger-500/20 text-danger-400 border-danger-500/30' },
    medicine.habitForming && { label: 'Habit Forming', color: 'bg-warning-500/20 text-warning-400 border-warning-500/30' },
    medicine.isDiscontinued && { label: 'Discontinued', color: 'bg-surface-700 text-surface-400 border-surface-600' },
  ].filter(Boolean) as { label: string; color: string }[]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="max-w-3xl mx-auto px-4 py-8 space-y-6"
    >
      <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 text-xs">
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Main header block */}
      <div className="glass-card p-6 md:p-8 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b.label} className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${b.color}`}>
                {b.label}
              </span>
            ))}
          </div>
          <h1 className="text-3xl font-extrabold text-surface-50">{medicine.brandName}</h1>
          <p className="text-primary-400 font-medium text-sm leading-relaxed">{medicine.composition}</p>
          <p className="text-surface-400 text-xs">Manufactured by: {medicine.manufacturer || 'Unknown'}</p>
        </div>

        {/* Pricing / Pack details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-surface-700/50">
          {medicine.price && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Price (MRP)</p>
                <p className="text-sm font-semibold text-surface-200">{medicine.price}</p>
              </div>
            </div>
          )}
          {medicine.packType && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Packaging</p>
                <p className="text-sm font-semibold text-surface-200">{medicine.packType}</p>
              </div>
            </div>
          )}
          {medicine.therapeuticClass && (
            <div className="flex items-center gap-3 col-span-2 sm:col-span-1">
              <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-[10px] text-surface-500 uppercase tracking-wider">Therapeutic Class</p>
                <p className="text-sm font-semibold text-surface-200 truncate max-w-[150px]" title={medicine.therapeuticClass}>
                  {medicine.therapeuticClass}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Safety Alert Banner */}
      {(medicine.rxRequired || medicine.habitForming) && (
        <div className="p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="text-danger-300 font-semibold">Important Clinical Warning</p>
            <p className="text-danger-400/80 leading-relaxed">
              {medicine.rxRequired && 'This medication requires a doctor prescription and should not be self-administered. '}
              {medicine.habitForming && 'This medicine carries a risk of psychological or physiological dependence. Use with caution under supervision.'}
            </p>
          </div>
        </div>
      )}

      {/* Primary details sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: Uses and dosage */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary-400" /> Therapeutic Uses
            </h2>
            {medicine.uses && medicine.uses.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 text-sm text-surface-300 leading-relaxed">
                {medicine.uses.map((use, i) => (
                  <li key={i}>{use}</li>
                ))}
              </ul>
            ) : (
              <p className="text-surface-500 text-sm italic">No specific uses listed in database.</p>
            )}
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary-400" /> Storage & Precautions
            </h2>
            <div className="space-y-3 text-sm text-surface-300">
              <div>
                <p className="text-xs text-surface-500 font-semibold mb-1">Storage Instructions</p>
                <p>{medicine.storage || 'Store in a cool, dry place away from direct sunlight.'}</p>
              </div>
              {medicine.precautions && medicine.precautions.length > 0 && (
                <div>
                  <p className="text-xs text-surface-500 font-semibold mb-1 font-sans">Special Precautions</p>
                  <ul className="list-disc list-inside space-y-1">
                    {medicine.precautions.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Side effects and class details */}
        <div className="space-y-6">
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-400" /> Side Effects
            </h2>
            {medicine.sideEffects && medicine.sideEffects.length > 0 ? (
              <ul className="list-disc list-inside space-y-2 text-sm text-surface-300 leading-relaxed">
                {medicine.sideEffects.slice(0, 10).map((effect, i) => (
                  <li key={i} className="hover:text-warning-300 transition-colors">{effect}</li>
                ))}
              </ul>
            ) : (
              <p className="text-surface-500 text-sm italic">No serious side effects cataloged in local cache.</p>
            )}
          </div>

          {/* Classification details */}
          {(medicine.actionClass || medicine.chemicalClass) && (
            <div className="glass-card p-6 space-y-3 text-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-500">Pharmacology Details</h2>
              {medicine.actionClass && (
                <div>
                  <p className="text-xs text-surface-500 font-semibold">Mechanism / Action Class</p>
                  <p className="text-surface-200 mt-0.5">{medicine.actionClass}</p>
                </div>
              )}
              {medicine.chemicalClass && (
                <div className="pt-2">
                  <p className="text-xs text-surface-500 font-semibold">Chemical Class</p>
                  <p className="text-surface-200 mt-0.5">{medicine.chemicalClass}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Substitutes / Alternatives */}
      {medicine.substitutes && medicine.substitutes.length > 0 && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-surface-50">Generic Substitutes & Alternatives</h2>
          <p className="text-xs text-surface-500">Other manufacturers producing similar salt composition:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {medicine.substitutes.map((sub, i) => (
              <div key={i} className="p-3 rounded-xl bg-surface-800/40 border border-surface-700/50 flex items-center justify-between">
                <span className="text-sm text-surface-200 font-medium truncate max-w-[85%]">{sub}</span>
                <Link to={`/medicine/${sub.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="text-xs text-primary-400 hover:text-primary-300 font-semibold">
                  View
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
