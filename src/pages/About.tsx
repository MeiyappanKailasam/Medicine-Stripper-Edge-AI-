import { motion } from 'framer-motion'
import { Shield, Eye, ShieldCheck, HeartPulse, Smartphone } from 'lucide-react'

export default function About() {
  const steps = [
    {
      title: 'Image Quality Assessment',
      desc: 'Analyses brightness, contrast, glare, and blur in the client browser. Rejects low-quality images to keep verification reliable.'
    },
    {
      title: 'OCR Primary Identification',
      desc: 'Tesseract.js parses typography to extract Brand Name, salt Composition, Strength, and Batch / Expiry dates locally.'
    },
    {
      title: 'Fuzzy Matching Engine',
      desc: 'Resolves typos or missing characters against a 250,554-medicine database using Fuse.js, returning high-confidence candidates.'
    },
    {
      title: 'TF.js Packaging Check',
      desc: 'On-device neural network (TensorFlow.js) acts as a secondary verifier, confirming that the visual container matches the database template.'
    },
    {
      title: 'Confidence Fusion Engine',
      desc: 'Synthesizes all signals—text match, visual packaging templates, fuzzy match parameters, and image quality—to calculate a verified score.'
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="max-w-3xl mx-auto px-4 py-8 space-y-10"
    >
      {/* Title block */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-extrabold text-gradient-primary">About MediVerify</h1>
        <p className="text-surface-400 text-sm max-w-lg mx-auto">
          MediVerify is an offline-first Edge AI system that helps verify medicines using multi-modal AI fusion.
        </p>
      </div>

      {/* Trust & Privacy Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 space-y-2 text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-400" />
          </div>
          <h3 className="font-semibold text-surface-100 text-sm">100% Privacy</h3>
          <p className="text-surface-400 text-xs">Images and scans are processed locally. Zero data leaves your device.</p>
        </div>

        <div className="glass-card p-5 space-y-2 text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <Eye className="w-5 h-5 text-primary-400" />
          </div>
          <h3 className="font-semibold text-surface-100 text-sm">Explainable AI</h3>
          <p className="text-surface-400 text-xs">No "black-box" outputs. You see the exact confidence breakdown for every scan.</p>
        </div>

        <div className="glass-card p-5 space-y-2 text-center flex flex-col items-center">
          <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-primary-400" />
          </div>
          <h3 className="font-semibold text-surface-100 text-sm">Offline First</h3>
          <p className="text-surface-400 text-xs">PWA caching lets the app download database chunks dynamically and run offline.</p>
        </div>
      </div>

      {/* How it works pipeline */}
      <div className="glass-card p-6 md:p-8 space-y-6">
        <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
          <HeartPulse className="w-5 h-5 text-primary-400" /> Verification Pipeline
        </h2>
        <div className="relative border-l border-surface-700/80 ml-3 space-y-6">
          {steps.map((s, idx) => (
            <div key={idx} className="relative pl-6">
              <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-surface-900 border-2 border-primary-500 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-primary-500" />
              </div>
              <h4 className="font-semibold text-surface-200 text-sm">{s.title}</h4>
              <p className="text-surface-400 text-xs leading-relaxed mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Technology Specifications */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-lg font-bold text-surface-50 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-400" /> System Specifications
        </h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-surface-500">Framework</p>
            <p className="text-surface-200 font-medium">React 18 / Vite 5 / Tailwind v3</p>
          </div>
          <div>
            <p className="text-surface-500">Database Size</p>
            <p className="text-surface-200 font-medium">250,554 Entries (CC BY-SA 4.0)</p>
          </div>
          <div>
            <p className="text-surface-500">Edge AI Framework</p>
            <p className="text-surface-200 font-medium">TensorFlow.js Core</p>
          </div>
          <div>
            <p className="text-surface-500">OCR Library</p>
            <p className="text-surface-200 font-medium">Tesseract.js Core</p>
          </div>
          <div>
            <p className="text-surface-500">Fuzzy Search Engine</p>
            <p className="text-surface-200 font-medium">Fuse.js Extended Matcher</p>
          </div>
          <div>
            <p className="text-surface-500">Platform Availability</p>
            <p className="text-surface-200 font-medium">PWA (iOS / Android / Desktop)</p>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-surface-600">
        <p>Developed with privacy & explainability first.</p>
        <p className="mt-1">MediVerify • version 1.0.0</p>
      </div>
    </motion.div>
  )
}
