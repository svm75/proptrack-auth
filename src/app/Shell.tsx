import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { makeStyles, tokens, Button } from '@fluentui/react-components'
import { WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons'
import { useDarkMode } from './darkMode'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { QueryErrorBanner } from '@/components/QueryErrorBanner'
import { GlobalSearch } from '@/components/GlobalSearch'
import { QuickAdd } from '@/components/QuickAdd'
import { AlertsBell } from '@/components/AlertsBell'

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: '224px 1fr', height: '100vh' },
  rail: {
    backgroundColor: '#2F3538',
    backgroundImage:
      'repeating-linear-gradient(45deg,  rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px),' +
      'repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 4px)',
    color: '#C7CBD1',
    padding: '18px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto',
  },
  brand: { color: '#F5F5F7', fontWeight: 700, fontSize: '16px', padding: '4px 10px 14px' },
  brandSub: { display: 'block', fontSize: '10px', letterSpacing: '0.14em', color: '#868C94', textTransform: 'uppercase', marginTop: '3px' },
  link: { color: '#C7CBD1', textDecoration: 'none', padding: '8px 11px', borderRadius: tokens.borderRadiusMedium, fontSize: '14px' },
  subLink: { color: '#C7CBD1', textDecoration: 'none', padding: '6px 11px 6px 22px', borderRadius: tokens.borderRadiusMedium, fontSize: '13px' },
  on: { backgroundColor: '#2563EB', color: '#F5F5F7', fontWeight: 600 },
  // height:100% (not minHeight) so this establishes a definite height for
  // .content's flex:1 below — screens that themselves rely on height:100%
  // (Properties, Invoices, the Dashboard calendar tab, ...) need a real,
  // bounded height chain all the way from the viewport, not just a floor.
  main: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 },
  topbar: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', padding: '10px 28px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, flexShrink: 0 },
  content: { padding: '20px 24px', maxWidth: '1690px', width: '100%', minWidth: 0, minHeight: 0, flex: 1, overflow: 'auto', backgroundColor: tokens.colorNeutralBackground2 },
})

interface NavItem {
  to: string
  label: string
  parent?: string
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/reports', label: 'Reports', parent: '/' },
  { to: '/forecast', label: 'Forecast' },
  { to: '/forecast/flows', label: 'Forecast Flows', parent: '/forecast' },
  { to: '/forecast/view', label: 'Forecast View', parent: '/forecast' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/invoices/regular', label: 'Regular Invoices', parent: '/invoices' },
  { to: '/invoices/owner-occupancy', label: 'Owner Occupancy', parent: '/invoices' },
  { to: '/properties', label: 'Properties' },
  { to: '/contacts', label: 'Contacts' },
  { to: '/admin', label: 'Admin' },
]

function Topbar() {
  const s = useStyles()
  const { dark, toggle } = useDarkMode()
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    // Power Apps / model-driven app global context for the logged-in user's name
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      const xrm = win.Xrm ?? win.parent?.Xrm
      const name: string | undefined = xrm?.Utility?.getGlobalContext?.()?.getUserName?.()
      if (name) setDisplayName(name)
    } catch { /* not available in dev */ }
  }, [])

  return (
    <div className={s.topbar}>
      {displayName && <span style={{ fontSize: '13px', color: tokens.colorNeutralForeground2, marginRight: 'auto' }}>{displayName}</span>}
      <GlobalSearch />
      <QuickAdd />
      <AlertsBell />
      <Button
        appearance="subtle" size="small" icon={dark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
        onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      />
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const s = useStyles()
  const { pathname } = useLocation()
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname === to)

  return (
    <div className={s.root}>
      <nav className={s.rail}>
        <div className={s.brand}>Property Tracker<span className={s.brandSub}>PropTrack</span></div>
        {NAV.map(n => (
          <Link key={n.to} to={n.to} className={`${n.parent ? s.subLink : s.link} ${isActive(n.to) ? s.on : ''}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className={s.main}>
        <Topbar />
        <div className={s.content}>
          <QueryErrorBanner />
          <AppErrorBoundary>
            {children}
          </AppErrorBoundary>
        </div>
      </div>
    </div>
  )
}
