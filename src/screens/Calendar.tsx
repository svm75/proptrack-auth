import { useEffect, useMemo, useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import InvoiceForm from './InvoiceForm'

const TYPE_OUTGOING = 233100001

const PROPERTY_COLORS = [
  '#4f46e5', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0891b2', '#be185d', '#65a30d',
]

const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_LABELS  = ['M','T','W','T','F','S','S']

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { 'en-US': enUS },
})

interface CalEvent {
  title: string
  start: Date
  end: Date
  resource: Cr9b5_pt_invoices
  color: string
}

function isActive(inv: Cr9b5_pt_invoices): boolean {
  return (inv.statecode as unknown as number) !== 1 && (inv.statecodename as unknown as string) !== 'Inactive'
}

function blendHex(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const rgbs = colors.map(c => ({ r: parseInt(c.slice(1,3),16), g: parseInt(c.slice(3,5),16), b: parseInt(c.slice(5,7),16) }))
  const a = { r: Math.round(rgbs.reduce((s,c)=>s+c.r,0)/rgbs.length), g: Math.round(rgbs.reduce((s,c)=>s+c.g,0)/rgbs.length), b: Math.round(rgbs.reduce((s,c)=>s+c.b,0)/rgbs.length) }
  return `#${a.r.toString(16).padStart(2,'0')}${a.g.toString(16).padStart(2,'0')}${a.b.toString(16).padStart(2,'0')}`
}

// ---------- Mini calendar for annual view ----------

function MiniMonth({ year, month, events, onSelectEvent }: {
  year: number; month: number; events: CalEvent[]
  onSelectEvent: (inv: Cr9b5_pt_invoices) => void
}) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const dim = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= dim; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function dayEvts(day: number): CalEvent[] {
    const d0 = new Date(year, month, day)
    const d1 = new Date(year, month, day + 1)
    return events.filter(e => e.start < d1 && e.end > d0)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <div className="text-xs font-semibold text-gray-700 text-center mb-1.5">{MONTH_SHORT[month]}</div>
      <div className="grid grid-cols-7 gap-px">
        {DOW_LABELS.map((d, i) => (
          <div key={i} className="text-[8px] text-center text-gray-400 font-medium pb-px">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="w-6 h-6" />
          const evts = dayEvts(day)
          const colors = [...new Set(evts.map(e => e.color))]
          const bg = colors.length ? blendHex(colors) : undefined
          return (
            <div
              key={i}
              className={['w-6 h-6 rounded-sm text-[9px] flex items-center justify-center', evts.length ? 'cursor-pointer hover:opacity-80' : ''].join(' ')}
              style={{ backgroundColor: bg, color: bg ? 'white' : '#9ca3af' }}
              onClick={() => evts.length === 1 ? onSelectEvent(evts[0].resource) : undefined}
              title={evts.map(e => e.title).join(', ')}
            >
              {day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Shared BigCalendar CSS ----------

const CAL_CSS = `
  .rbc-calendar { font-family: inherit; height: 100%; }
  .rbc-header { font-size: 0.72rem; font-weight: 600; color: #6b7280; text-transform: uppercase; padding: 6px 4px; background: #f9fafb; }
  .rbc-today { background-color: #eef2ff !important; }
  .rbc-off-range-bg { background-color: #f9fafb; }
  .rbc-event { border: none !important; border-radius: 4px !important; font-size: 0.72rem; padding: 1px 5px; cursor: pointer; }
  .rbc-event:focus { outline: none; }
  .rbc-event-label { display: none; }
  .rbc-show-more { font-size: 0.7rem; color: #6366f1; font-weight: 600; background: transparent; }
  .rbc-toolbar { margin-bottom: 12px; gap: 8px; }
  .rbc-toolbar button { font-size: 0.8rem; border-radius: 6px; padding: 4px 12px; border-color: #e5e7eb; color: #374151; cursor: pointer; }
  .rbc-toolbar button:hover { background-color: #f3f4f6; }
  .rbc-toolbar button.rbc-active, .rbc-toolbar button.rbc-active:hover { background-color: #4f46e5; border-color: #4f46e5; color: white; }
  .rbc-toolbar-label { font-weight: 600; font-size: 1rem; color: #111827; }
  .rbc-month-view { border-radius: 12px; overflow: hidden; border-color: #e5e7eb; }
  .rbc-day-bg + .rbc-day-bg, .rbc-header + .rbc-header { border-color: #f3f4f6; }
  .rbc-month-row + .rbc-month-row { border-color: #f3f4f6; }
  .rbc-date-cell { font-size: 0.8rem; color: #6b7280; padding: 4px 6px; }
  .rbc-date-cell.rbc-now { font-weight: 700; color: #4f46e5; }
`

type ViewMode = 'monthly' | 'quarterly' | 'annual'

// ---------- Main component ----------

export default function CalendarScreen() {
  const [invoices,   setInvoices]   = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts,   setContacts]   = useState<Cr9b5_pt_contacts[]>([])
  const [loading,    setLoading]    = useState(true)
  const [filterPropId, setFilterPropId] = useState('')
  const [viewInvoice,  setViewInvoice]  = useState<Cr9b5_pt_invoices | null>(null)
  const [currentDate,  setCurrentDate]  = useState(new Date())
  const [viewMode,     setViewMode]     = useState<ViewMode>('monthly')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [invRes, propRes, conRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_checkin asc'], maxPageSize: 5000 }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setContacts(conRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {}
    properties.forEach((p, i) => { map[p.cr9b5_pt_propertyid] = PROPERTY_COLORS[i % PROPERTY_COLORS.length] })
    return map
  }, [properties])

  const events = useMemo<CalEvent[]>(() => {
    return invoices
      .filter(inv => {
        if (!isActive(inv)) return false
        if ((inv.cr9b5_type as unknown as number) !== TYPE_OUTGOING) return false
        if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) return false
        if (filterPropId && (inv as unknown as Record<string,unknown>)['_cr9b5_property_value'] !== filterPropId) return false
        return true
      })
      .map(inv => {
        const raw = inv as unknown as Record<string, unknown>
        const propId = raw['_cr9b5_property_value'] as string | undefined
        const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
        return {
          title: [prop?.cr9b5_name, inv.cr9b5_internalid].filter(Boolean).join(' · '),
          start: new Date(inv.cr9b5_checkin!),
          end:   addDays(new Date(inv.cr9b5_checkout!), 1),
          resource: inv,
          color: propId ? (colorMap[propId] ?? '#6b7280') : '#6b7280',
        }
      })
  }, [invoices, properties, colorMap, filterPropId])

  const visibleProps = properties.filter(p => !filterPropId || p.cr9b5_pt_propertyid === filterPropId)
  const quarter      = Math.floor(currentDate.getMonth() / 3)
  const quarterStart = quarter * 3
  const year         = currentDate.getFullYear()

  const eventPropGetter = (event: object) => ({
    style: { backgroundColor: (event as CalEvent).color, opacity: 0.92 },
  })

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['monthly', 'quarterly', 'annual'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={['px-3 py-1 rounded-md text-xs font-medium transition-colors', viewMode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'].join(' ')}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Property filter */}
          <select value={filterPropId} onChange={e => setFilterPropId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="">All properties</option>
            {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
          </select>

          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {visibleProps.map(p => (
              <span key={p.cr9b5_pt_propertyid} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMap[p.cr9b5_pt_propertyid] }} />
                {p.cr9b5_name}
              </span>
            ))}
          </div>
        </div>

        {/* Quarterly / Annual navigation */}
        {viewMode !== 'monthly' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - (viewMode === 'quarterly' ? 3 : 12), 1))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">‹</button>
            <span className="text-sm font-semibold text-gray-700 min-w-[90px] text-center">
              {viewMode === 'quarterly' ? `Q${quarter + 1} ${year}` : year}
            </span>
            <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + (viewMode === 'quarterly' ? 3 : 12), 1))}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">›</button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="p-6 text-gray-400">Loading…</p>
      ) : (
        <div className="flex-1 min-h-0 px-6 py-4 overflow-auto">
          <style>{CAL_CSS}</style>

          {viewMode === 'monthly' && (
            <BigCalendar
              localizer={localizer}
              events={events}
              defaultView="month"
              views={['month']}
              date={currentDate}
              onNavigate={d => setCurrentDate(d)}
              style={{ height: '100%', minHeight: 520 }}
              eventPropGetter={eventPropGetter}
              onSelectEvent={e => setViewInvoice((e as CalEvent).resource)}
              tooltipAccessor={e => (e as CalEvent).title}
            />
          )}

          {viewMode === 'quarterly' && (
            <div className="grid grid-cols-3 gap-5" style={{ minHeight: 480 }}>
              {[0, 1, 2].map(offset => (
                <div key={offset} className="flex flex-col">
                  <div className="text-center font-semibold text-gray-700 mb-2 text-sm">
                    {MONTH_FULL[quarterStart + offset]} {year}
                  </div>
                  <BigCalendar
                    localizer={localizer}
                    events={events}
                    defaultView="month"
                    views={['month']}
                    date={new Date(year, quarterStart + offset, 1)}
                    onNavigate={() => {}}
                    toolbar={false}
                    style={{ height: 440 }}
                    eventPropGetter={eventPropGetter}
                    onSelectEvent={e => setViewInvoice((e as CalEvent).resource)}
                    tooltipAccessor={e => (e as CalEvent).title}
                  />
                </div>
              ))}
            </div>
          )}

          {viewMode === 'annual' && (
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 12 }, (_, m) => (
                <MiniMonth key={m} year={year} month={m} events={events}
                  onSelectEvent={inv => setViewInvoice(inv)} />
              ))}
            </div>
          )}
        </div>
      )}

      {viewInvoice && (
        <InvoiceForm invoice={viewInvoice} properties={properties} contacts={contacts}
          readOnly onSaved={() => {}} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  )
}
