import { useState } from 'react'
import Dashboard from './screens/Dashboard'
import Properties from './screens/Properties'
import Contacts from './screens/Contacts'
import Invoices from './screens/Invoices'
import Calendar from './screens/Calendar'
import Admin from './screens/Admin'

type Screen = 'dashboard' | 'properties' | 'contacts' | 'invoices' | 'calendar' | 'admin'

const NAV_ITEMS: { id: Screen; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: '▦' },
  { id: 'properties', label: 'Properties', icon: '🏠' },
  { id: 'contacts',   label: 'Contacts',   icon: '👥' },
  { id: 'invoices',   label: 'Invoices',   icon: '📄' },
  { id: 'calendar',   label: 'Calendar',   icon: '📅' },
  { id: 'admin',      label: 'Admin',      icon: '⚙️' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-gray-200">
          <span className="text-lg font-semibold text-indigo-600 tracking-tight">PropTrack</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={[
                'w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors text-left',
                screen === item.id
                  ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              ].join(' ')}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">PropTrack v0.1</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {screen === 'dashboard'  && <Dashboard />}
        {screen === 'properties' && <Properties />}
        {screen === 'contacts'   && <Contacts />}
        {screen === 'invoices'   && <Invoices />}
        {screen === 'calendar'   && <Calendar />}
        {screen === 'admin'      && <Admin />}
      </main>
    </div>
  )
}
