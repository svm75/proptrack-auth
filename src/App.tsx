import { useEffect, useState } from 'react'
import Dashboard       from './screens/Dashboard'
import Properties      from './screens/Properties'
import Contacts        from './screens/Contacts'
import Invoices        from './screens/Invoices'
import RegularInvoices from './screens/RegularInvoices'
import Admin           from './screens/Admin'

type Screen = 'dashboard' | 'invoices' | 'regular-invoices' | 'properties' | 'contacts' | 'admin'

interface NavItem {
  id: Screen
  label: string
  icon: string
  parent?: Screen
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',       label: 'Dashboard',        icon: '▦' },
  { id: 'invoices',        label: 'Invoices',          icon: '📄' },
  { id: 'regular-invoices',label: 'Regular Invoices',  icon: '↻', parent: 'invoices' },
  { id: 'properties',      label: 'Properties',        icon: '🏠' },
  { id: 'contacts',        label: 'Contacts',          icon: '👥' },
  { id: 'admin',           label: 'Admin',             icon: '⚙️' },
]

export default function App() {
  const [screen,      setScreen]      = useState<Screen>('dashboard')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    // Try Power Apps / model-driven app global context for the logged-in user's name
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      const xrm = win.Xrm ?? win.parent?.Xrm
      const name: string | undefined = xrm?.Utility?.getGlobalContext?.()?.getUserName?.()
      if (name) setDisplayName(name)
    } catch { /* not available in dev */ }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* ── App header ─────────────────────────────────────────── */}
      <header className="h-12 bg-teal-700 flex items-center px-6 shrink-0 justify-between z-10 shadow-sm">
        <span className="text-white font-bold text-lg tracking-tight">Property Tracker</span>
        {displayName && (
          <span className="text-teal-100 text-sm font-medium">{displayName}</span>
        )}
      </header>

      {/* ── Sidebar + main ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
          <nav className="flex-1 py-3 overflow-y-auto">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setScreen(item.id)}
                className={[
                  'w-full flex items-center gap-3 text-sm font-medium transition-colors text-left',
                  item.parent ? 'pl-10 pr-5 py-2' : 'px-5 py-2.5',
                  screen === item.id
                    ? 'bg-teal-50 text-teal-700 border-r-2 border-teal-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ].join(' ')}
              >
                <span className={['leading-none', item.parent ? 'text-sm' : 'text-base'].join(' ')}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 text-center">PropTrack v0.1</p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto">
          {screen === 'dashboard'        && <Dashboard />}
          {screen === 'invoices'         && <Invoices />}
          {screen === 'regular-invoices' && <RegularInvoices />}
          {screen === 'properties'       && <Properties />}
          {screen === 'contacts'         && <Contacts />}
          {screen === 'admin'            && <Admin />}
        </main>
      </div>
    </div>
  )
}
