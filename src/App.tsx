import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Navbar from '@/components/Navbar'
import Home from '@/pages/Home'
import Scanner from '@/pages/Scanner'
import VerificationReport from '@/pages/VerificationReport'
import MedicineDetails from '@/pages/MedicineDetails'
import SearchHistory from '@/pages/SearchHistory'
import Settings from '@/pages/Settings'
import About from '@/pages/About'
import { useAppStore } from '@/store/appStore'
import { useEffect } from 'react'

export default function App() {
  const { settings } = useAppStore()

  // Apply dark mode class to html element
  useEffect(() => {
    if (settings.darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [settings.darkMode])

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pb-20 md:pb-0">
          <AnimatePresence mode="wait">
            <Routes>
              <Route path="/"            element={<Home />} />
              <Route path="/scanner"     element={<Scanner />} />
              <Route path="/report/:id"  element={<VerificationReport />} />
              <Route path="/medicine/:id" element={<MedicineDetails />} />
              <Route path="/history"     element={<SearchHistory />} />
              <Route path="/settings"    element={<Settings />} />
              <Route path="/about"       element={<About />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </BrowserRouter>
  )
}
