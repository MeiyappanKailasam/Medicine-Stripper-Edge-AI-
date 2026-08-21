import { useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Camera, ImageIcon, X, ZoomIn } from 'lucide-react'
import { fileToDataUrl } from '@/utils/idUtils'
import { useScanStore } from '@/store/appStore'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_SIZE_MB = 15

export default function ImageUploader() {
  const { setImage, imageDataUrl, clearImage } = useScanStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showCamera, setShowCamera] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic)$/i)) {
      setError('Please upload a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Image must be smaller than ${MAX_SIZE_MB}MB.`)
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setImage(file, dataUrl)
  }, [setImage])

  // Drag & Drop
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // Camera
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      setCameraStream(stream)
      setShowCamera(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
      }, 100)
    } catch {
      setError('Camera access denied. Please allow camera permission or upload an image.')
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width  = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) handleFile(new File([blob], 'capture.jpg', { type: 'image/jpeg' }))
      closeCamera()
    }, 'image/jpeg', 0.95)
  }

  const closeCamera = () => {
    cameraStream?.getTracks().forEach((t) => t.stop())
    setCameraStream(null)
    setShowCamera(false)
  }

  if (imageDataUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative rounded-2xl overflow-hidden border border-surface-700/50 group"
      >
        <img
          src={imageDataUrl}
          alt="Medicine strip preview"
          className="w-full max-h-72 object-contain bg-surface-900"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-4">
          <button
            onClick={() => setShowCamera(false)}
            className="btn-ghost text-surface-300 text-xs"
          >
            <ZoomIn className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={clearImage}
            className="btn-danger text-xs px-3 py-1.5"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
        <button
          onClick={clearImage}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-900/80 border border-surface-700 flex items-center justify-center text-surface-400 hover:text-danger-400 transition-colors"
          aria-label="Remove image"
        >
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <motion.div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-10
          flex flex-col items-center justify-center gap-4 transition-all duration-200
          ${dragging
            ? 'border-primary-400 bg-primary-500/10 shadow-glow-primary'
            : 'border-surface-600 hover:border-primary-500/60 hover:bg-surface-800/50'
          }
        `}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 ${
          dragging ? 'bg-primary-500/20' : 'bg-surface-700/50'
        }`}>
          <ImageIcon className={`w-8 h-8 transition-colors ${dragging ? 'text-primary-400' : 'text-surface-400'}`} />
        </div>
        <div className="text-center">
          <p className="text-surface-200 font-semibold text-lg">
            {dragging ? 'Drop image here' : 'Upload medicine strip'}
          </p>
          <p className="text-surface-500 text-sm mt-1">
            Drag & drop or click to browse • JPG, PNG, WebP • Max {MAX_SIZE_MB}MB
          </p>
        </div>
        {dragging && (
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-primary-400 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}
      </motion.div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary justify-center py-3"
        >
          <Upload className="w-4 h-4" />
          Browse Files
        </button>
        <button
          onClick={openCamera}
          className="btn-primary justify-center py-3"
        >
          <Camera className="w-4 h-4" />
          Use Camera
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        id="medicine-image-input"
      />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-danger-400 text-sm flex items-center gap-2"
          >
            <X className="w-4 h-4 flex-shrink-0" /> {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Camera modal */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-surface-950/95 flex flex-col items-center justify-center p-4"
          >
            <div className="w-full max-w-lg space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-surface-50 font-semibold text-lg">Capture Medicine Strip</h2>
                <button onClick={closeCamera} className="btn-ghost p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="relative rounded-2xl overflow-hidden bg-surface-900 border border-surface-700">
                <video ref={videoRef} autoPlay playsInline muted className="w-full max-h-[60vh] object-contain" />
                {/* Scan guide overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-8 border-2 border-primary-400/50 rounded-xl">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary-400 rounded-tl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary-400 rounded-tr" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary-400 rounded-bl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary-400 rounded-br" />
                    <div className="scan-overlay animate-scan-line" />
                  </div>
                </div>
              </div>
              <p className="text-surface-400 text-sm text-center">
                Align the medicine strip within the frame. Ensure good lighting.
              </p>
              <button onClick={capturePhoto} className="btn-primary w-full justify-center py-4 text-base">
                <Camera className="w-5 h-5" />
                Capture
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
