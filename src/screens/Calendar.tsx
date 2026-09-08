import { useMemo, useState } from 'react'
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addDays } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import { makeStyles, tokens, mergeClasses, Select, Text } from '@fluentui/react-components'
import InvoiceForm from './InvoiceForm'
import { OwnerOccupancyFormDialog } from '@/components/OwnerOccupancyFormDialog'
import { categoricalPalette } from '@/app/dataPalette'
import { useOwnerOccupancies, useInvoices, useProperties, useContacts } from '@/hooks/data'
import type { OwnerOccupancy, Invoice, Property } from '@/domain/types'
import { InvoiceType } from '@/domain/types'

const TYPE_OUTGOING = InvoiceType.Income
const OWNER_COLOR = '#9CA3AF'

const PROPERTY_COLORS = categoricalPalette

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
  resource: Invoice | null
  ownerRecord: OwnerOccupancy | null
  color: string
  kind: 'invoice' | 'owner'
}

function isActive(inv: Invoice): boolean {
  return !inv.cancelled
}

function blendHex(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const rgbs = colors.map(c => ({ r: parseInt(c.slice(1,3),16), g: parseInt(c.slice(3,5),16), b: parseInt(c.slice(5,7),16) }))
  const a = { r: Math.round(rgbs.reduce((s,c)=>s+c.r,0)/rgbs.length), g: Math.round(rgbs.reduce((s,c)=>s+c.g,0)/rgbs.length), b: Math.round(rgbs.reduce((s,c)=>s+c.b,0)/rgbs.length) }
  return `#${a.r.toString(16).padStart(2,'0')}${a.g.toString(16).padStart(2,'0')}${a.b.toString(16).padStart(2,'0')}`
}

// ---------- Styles ----------

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  toolbar: { padding: '12px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0 },
  toolbarLeft: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  viewToggle: { display: 'flex', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, padding: '2px' },
  viewBtn: { padding: '4px 12px', borderRadius: tokens.borderRadiusSmall, fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: tokens.colorNeutralForeground3 },
  viewBtnActive: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, boxShadow: tokens.shadow2 },
  legend: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: tokens.colorNeutralForeground3 },
  legendDot: { width: '10px', height: '10px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  navGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  navBtn: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '6px 12px', fontSize: '14px', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground2 },
  navLabel: { fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground2, minWidth: '90px', textAlign: 'center' },
  loading: { padding: '24px', color: tokens.colorNeutralForeground4 },
  body: { flex: 1, minHeight: 0, padding: '16px 24px', overflow: 'auto' },
  quarterGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', minHeight: '480px' },
  quarterCol: { display: 'flex', flexDirection: 'column' },
  quarterTitle: { textAlign: 'center', fontWeight: 600, color: tokens.colorNeutralForeground2, marginBottom: '8px', fontSize: '14px' },
  annualGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  miniMonth: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, padding: '8px' },
  miniMonthTitle: { fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground2, textAlign: 'center', marginBottom: '6px' },
  miniGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' },
  miniDow: { fontSize: '8px', textAlign: 'center', color: tokens.colorNeutralForeground4, fontWeight: 500, paddingBottom: '1px' },
  miniCellEmpty: { width: '24px', height: '24px' },
  miniCell: { width: '24px', height: '24px', borderRadius: '2px', fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  miniCellClickable: { cursor: 'pointer' },
})

// ---------- Mini calendar for annual view ----------

function MiniMonth({ year, month, events, onSelectEvent }: {
  year: number; month: number; events: CalEvent[]
  onSelectEvent: (event: CalEvent) => void
}) {
  const s = useStyles()
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
    <div className={s.miniMonth}>
      <div className={s.miniMonthTitle}>{MONTH_SHORT[month]}</div>
      <div className={s.miniGrid}>
        {DOW_LABELS.map((d, i) => (
          <div key={i} className={s.miniDow}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} className={s.miniCellEmpty} />
          const evts = dayEvts(day)
          const colors = [...new Set(evts.map(e => e.color))]
          const bg = colors.length ? blendHex(colors) : undefined
          return (
            <div
              key={i}
              className={mergeClasses(s.miniCell, evts.length > 0 && s.miniCellClickable)}
              style={{ backgroundColor: bg, color: bg ? 'white' : tokens.colorNeutralForeground4 }}
              onClick={() => { if (evts.length === 1) onSelectEvent(evts[0]) }}
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
  const s = useStyles()
  const { data: invoices = [], isLoading: loadingInv } = useInvoices()
  const { data: properties = [], isLoading: loadingProps } = useProperties()
  const { data: contacts = [] } = useContacts()
  const { data: ownerOccupancy = [], isLoading: loadingOcc, refetch: refetchOcc } = useOwnerOccupancies()
  const [filterPropId, setFilterPropId] = useState('')
  const [viewInvoice,  setViewInvoice]  = useState<Invoice | null>(null)
  const [editOwnerRecord, setEditOwnerRecord] = useState<OwnerOccupancy | null>(null)
  const [currentDate,  setCurrentDate]  = useState(new Date())
  const [viewMode,     setViewMode]     = useState<ViewMode>('monthly')

  const loading = loadingInv || loadingProps

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {}
    properties.forEach((p: Property, i: number) => { map[p.id] = PROPERTY_COLORS[i % PROPERTY_COLORS.length] })
    return map
  }, [properties])

  const events = useMemo<CalEvent[]>(() => {
    const guestEvents: CalEvent[] = invoices
      .filter((inv: Invoice) => {
        if (!isActive(inv)) return false
        if (inv.type !== TYPE_OUTGOING) return false
        if (!inv.checkIn || !inv.checkOut) return false
        if (filterPropId && inv.propertyId !== filterPropId) return false
        return true
      })
      .map((inv: Invoice) => {
        const propId = inv.propertyId
        const prop = properties.find((p: Property) => p.id === propId)
        return {
          title: [prop?.name, inv.internalId].filter(Boolean).join(' · '),
          start: new Date(inv.checkIn!),
          end:   addDays(new Date(inv.checkOut!), 1),
          resource: inv,
          ownerRecord: null,
          color: propId ? (colorMap[propId] ?? '#6b7280') : '#6b7280',
          kind: 'invoice' as const,
        }
      })

    const ownerEvents: CalEvent[] = ownerOccupancy
      .filter(r => {
        if (!r.fromDate || !r.toDate) return false
        if (filterPropId && r.propertyId !== filterPropId) return false
        return true
      })
      .map(r => {
        const prop = properties.find((p: Property) => p.id === r.propertyId)
        return {
          title: ['Owner', prop?.name].filter(Boolean).join(' · '),
          start: new Date(r.fromDate),
          end:   new Date(r.toDate),
          resource: null,
          ownerRecord: r,
          color: OWNER_COLOR,
          kind: 'owner' as const,
        }
      })

    return [...guestEvents, ...ownerEvents]
  }, [invoices, properties, colorMap, filterPropId, ownerOccupancy])

  const visibleProps = properties.filter((p: Property) => !filterPropId || p.id === filterPropId)
  const quarter      = Math.floor(currentDate.getMonth() / 3)
  const quarterStart = quarter * 3
  const year         = currentDate.getFullYear()

  const eventPropGetter = (event: object) => ({
    style: { backgroundColor: (event as CalEvent).color, opacity: 0.92 },
  })

  function selectEvent(event: CalEvent) {
    if (event.kind === 'invoice' && event.resource) setViewInvoice(event.resource)
    else if (event.kind === 'owner' && event.ownerRecord) setEditOwnerRecord(event.ownerRecord)
  }

  return (
    <div className={s.root}>
      {/* Toolbar */}
      <div className={s.toolbar}>
        <div className={s.toolbarLeft}>
          {/* View toggle */}
          <div className={s.viewToggle}>
            {(['monthly', 'quarterly', 'annual'] as ViewMode[]).map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={mergeClasses(s.viewBtn, viewMode === m && s.viewBtnActive)}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>

          {/* Property filter */}
          <Select value={filterPropId} onChange={e => setFilterPropId(e.target.value)}>
            <option value="">All properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>

          {/* Legend */}
          <div className={s.legend}>
            {visibleProps.map(p => (
              <span key={p.id} className={s.legendItem}>
                <span className={s.legendDot} style={{ backgroundColor: colorMap[p.id] }} />
                {p.name}
              </span>
            ))}
            <span className={s.legendItem}>
              <span className={s.legendDot} style={{ backgroundColor: OWNER_COLOR }} />
              Owner Occupancy
            </span>
          </div>
        </div>

        {/* Quarterly / Annual navigation */}
        {viewMode !== 'monthly' && (
          <div className={s.navGroup}>
            <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - (viewMode === 'quarterly' ? 3 : 12), 1))} className={s.navBtn}>‹</button>
            <span className={s.navLabel}>
              {viewMode === 'quarterly' ? `Q${quarter + 1} ${year}` : year}
            </span>
            <button onClick={() => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + (viewMode === 'quarterly' ? 3 : 12), 1))} className={s.navBtn}>›</button>
          </div>
        )}
      </div>

      {loading || loadingOcc ? (
        <Text className={s.loading}>Loading…</Text>
      ) : (
        <div className={s.body}>
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
              onSelectEvent={e => selectEvent(e as CalEvent)}
              tooltipAccessor={e => (e as CalEvent).title}
            />
          )}

          {viewMode === 'quarterly' && (
            <div className={s.quarterGrid}>
              {[0, 1, 2].map(offset => (
                <div key={offset} className={s.quarterCol}>
                  <div className={s.quarterTitle}>
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
                    onSelectEvent={e => selectEvent(e as CalEvent)}
                    tooltipAccessor={e => (e as CalEvent).title}
                  />
                </div>
              ))}
            </div>
          )}

          {viewMode === 'annual' && (
            <div className={s.annualGrid}>
              {Array.from({ length: 12 }, (_, m) => (
                <MiniMonth key={m} year={year} month={m} events={events}
                  onSelectEvent={selectEvent} />
              ))}
            </div>
          )}
        </div>
      )}

      {viewInvoice && (
        <InvoiceForm invoice={viewInvoice} properties={properties} contacts={contacts}
          readOnly onSaved={() => {}} onClose={() => setViewInvoice(null)} />
      )}
      {editOwnerRecord && (
        <OwnerOccupancyFormDialog
          record={editOwnerRecord}
          properties={properties.map(p => ({ id: p.id, name: p.name ?? '', shortId: '', address: '' }))}
          onSaved={async () => { setEditOwnerRecord(null); await refetchOcc() }}
          onClose={() => setEditOwnerRecord(null)}
          onDeleted={async () => { setEditOwnerRecord(null); await refetchOcc() }}
        />
      )}
    </div>
  )
}
