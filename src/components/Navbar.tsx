import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Scan, Home, History, Settings, Info, Shield } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',        icon: Home,    label: 'Home'    },
  { to: '/scanner', icon: Scan,    label: 'Scanner' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/settings',icon: Settings,label: 'Settings'},
  { to: '/about',   icon: Info,    label: 'About'   },
]

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <>
      {/* Desktop Top Bar */}
      <header className="hidden md:flex items-center justify-between px-6 py-4 glass-card rounded-none border-b border-surface-700/50 sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glow-primary group-hover:shadow-glow-primary transition-all">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-lg text-gradient-primary">MediVerify</span>
            <span className="text-[10px] text-surface-500 block leading-none">Edge AI Medicine Scanner</span>
          </div>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to))
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-primary-500/15 text-primary-400 border border-primary-500/30'
                    : 'text-surface-400 hover:text-surface-50 hover:bg-surface-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-500 bg-surface-800 px-2 py-1 rounded-lg border border-surface-700">
            250k medicines
          </span>
          <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse-slow" title="Offline ready" />
        </div>
      </header>

      {/* Mobile Bottom Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card rounded-none border-t border-surface-700/50 px-2 py-2">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
            const active = pathname === to || (to !== '/' && pathname.startsWith(to))
            return (
              <Link key={to} to={to} className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl relative">
                {active && (
                  <motion.div
                    layoutId="mobile-nav-indicator"
                    className="absolute inset-0 bg-primary-500/15 rounded-xl border border-primary-500/30"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon className={`w-5 h-5 relative z-10 transition-colors ${active ? 'text-primary-400' : 'text-surface-500'}`} />
                <span className={`text-[10px] font-medium relative z-10 transition-colors ${active ? 'text-primary-400' : 'text-surface-500'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
