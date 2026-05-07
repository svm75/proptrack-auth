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

export default function CalendarScreen() {
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPropId, setFilterPropId] = useState('')
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [invRes, propRes, conRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_checkin asc'] }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
        Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'] }),
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
    properties.forEach((p, i) => {
      map[p.cr9b5_pt_propertyid] = PROPERTY_COLORS[i % PROPERTY_COLORS.length]
    })
    return map
  }, [properties])

  const events = useMemo<CalEvent[]>(() => {
    return invoices
      .filter(inv => {
        if (!isActive(inv)) return false
        if ((inv.cr9b5_type as unknown as number) !== TYPE_OUTGOING) return false
        if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) return false
        if (filterPropId) {
          const raw = inv as unknown as Record<string, unknown>
          if (raw['_cr9b5_property_value'] !== filterPropId) return false
        }
        return true
      })
      .map(inv => {
        const raw = inv as unknown as Record<string, unknown>
        const propId = raw['_cr9b5_property_value'] as string | undefined
        const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
        const color = propId ? (colorMap[propId] ?? '#6b7280') : '#6b7280'
        const checkin  = new Date(inv.cr9b5_checkin!)
        // end is exclusive for all-day events in react-big-calendar
        const checkout = addDays(new Date(inv.cr9b5_checkout!), 1)
        return {
          title: [prop?.cr9b5_name, inv.cr9b5_internalid].filter(Boolean).join(' · '),
          start: checkin,
          end:   checkout,
          resource: inv,
          color,
        }
      })
  }, [invoices, properties, colorMap, filterPropId])

  const visibleProps = properties.filter(p => !filterPropId || p.cr9b5_pt_propertyid === filterPropId)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Calendar</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterPropId}
            onChange={e => setFilterPropId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All properties</option>
            {properties.map(p => (
              <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 flex-wrap">
            {visibleProps.map(p => (
              <span key={p.cr9b5_pt_propertyid} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMap[p.cr9b5_pt_propertyid] }} />
                {p.cr9b5_name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="p-6 text-gray-400">Loading…</p>
      ) : (
        <div className="flex-1 min-h-0 px-6 py-4">
          <style>{`
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
          `}</style>
          <BigCalendar
            localizer={localizer}
            events={events}
            defaultView="month"
            views={['month']}
            date={currentDate}
            onNavigate={date => setCurrentDate(date)}
            style={{ height: '100%' }}
            eventPropGetter={event => ({
              style: { backgroundColor: (event as CalEvent).color, opacity: 0.92 },
            })}
            onSelectEvent={event => setViewInvoice((event as CalEvent).resource)}
            tooltipAccessor={event => (event as CalEvent).title}
          />
        </div>
      )}

      {viewInvoice && (
        <InvoiceForm
          invoice={viewInvoice}
          properties={properties}
          contacts={contacts}
          readOnly
          onSaved={() => {}}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}
