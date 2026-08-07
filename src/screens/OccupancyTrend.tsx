import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { makeStyles, tokens, mergeClasses, Select } from '@fluentui/react-components'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Svm_pt_owneroccupancies } from '../generated/models/Svm_pt_owneroccupanciesModel'

const TYPE_INCOME = 233100001
const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const COLOR_INCL   = '#0F766E'
const COLOR_EXCL   = '#9CA3AF'
const PROPERTY_COLORS = [
  '#4f46e5','#059669','#d97706','#dc2626',
  '#7c3aed','#0891b2','#be185d','#65a30d',
]

function isActive(inv: Cr9b5_pt_invoices) {
  return (inv.statecode as unknown as number) !== 1
}
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}
function getLastNMonths(n: number): { year: number; month: number; label: string }[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  })
}
// Nights within [monthStart, monthEndExclusive) that a period [fromIso,toIso) overlaps.
function clippedNights(fromIso: string | undefined, toIso: string | undefined, monthStart: Date, monthEndExclusive: Date): number {
  if (!fromIso || !toIso) return 0
  const from = new Date(fromIso) < monthStart ? monthStart : new Date(fromIso)
  const to = new Date(toIso) > monthEndExclusive ? monthEndExclusive : new Date(toIso)
  const nights = Math.round((to.getTime() - from.getTime()) / 86400000)
  return nights > 0 ? nights : 0
}

interface Props {
  invoices:       Cr9b5_pt_invoices[]
  properties:     Cr9b5_pt_properties[]
  ownerOccupancy: Svm_pt_owneroccupancies[]
}

interface TooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '24px' },
  filterRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  segmented: { display: 'flex', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden', fontSize: '14px' },
  segBtn: { padding: '6px 16px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground2 },
  segBtnActive: { backgroundColor: '#0F766E', color: '#fff' },
  chartCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '16px' },
  empty: { padding: '64px', textAlign: 'center', color: tokens.colorNeutralForeground4, fontSize: '14px' },
  tooltipBox: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, padding: '8px 12px', fontSize: '13px' },
  tooltipTitle: { fontWeight: 600, color: tokens.colorNeutralForeground2, marginBottom: '4px' },
  tableCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, overflow: 'hidden' },
  table: { width: '100%', fontSize: '14px', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left' },
  thRight: { textAlign: 'right' },
  td: { padding: '10px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  dot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: tokens.borderRadiusCircular, marginRight: '8px' },
  rowName: { color: tokens.colorNeutralForeground1, fontWeight: 500 },
  tdRight: { textAlign: 'right', color: tokens.colorNeutralForeground2, fontVariantNumeric: 'tabular-nums' },
  tdRightBold: { textAlign: 'right', fontWeight: 600, color: tokens.colorNeutralForeground1, fontVariantNumeric: 'tabular-nums' },
})

function ChartTooltip({ active, payload, label }: TooltipProps) {
  const s = useStyles()
  if (!active || !payload?.length) return null
  return (
    <div className={s.tooltipBox}>
      <p className={s.tooltipTitle}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontVariantNumeric: 'tabular-nums' }}>
          {p.name}: {p.value.toFixed(1)} %
        </p>
      ))}
    </div>
  )
}

// Guest nights for one property within [monthStart, monthEndExclusive).
function guestNightsForMonth(invoices: Cr9b5_pt_invoices[], propertyId: string, year: number, month: number): number {
  return invoices
    .filter(inv => {
      if (!isActive(inv)) return false
      if ((inv.cr9b5_type as unknown as number) !== TYPE_INCOME) return false
      const r = inv as unknown as Record<string, unknown>
      if (!r['cr9b5_allproperties'] && r['_cr9b5_property_value'] !== propertyId) return false
      return inv.cr9b5_date && new Date(inv.cr9b5_date).getFullYear() === year && new Date(inv.cr9b5_date).getMonth() === month
    })
    .reduce((s, i) => s + (i.cr9b5_nights ?? 0), 0)
}
// Owner-occupied nights for one property within [monthStart, monthEndExclusive).
function ownerNightsForMonth(records: Svm_pt_owneroccupancies[], propertyId: string, monthStart: Date, monthEndExclusive: Date): number {
  return records
    .filter(r => (r as unknown as Record<string, unknown>)['_svm_pt_property_value'] === propertyId)
    .reduce((s, r) => s + clippedNights(r.svm_pt_fromdate, r.svm_pt_todate, monthStart, monthEndExclusive), 0)
}

export default function OccupancyTrend({ invoices, properties, ownerOccupancy }: Props) {
  const s = useStyles()
  const [propId,  setPropId]  = useState('')
  const [metric,  setMetric]  = useState<'incl' | 'excl'>('incl')
  const [nMonths, setNMonths] = useState(24)

  const monthSlots = useMemo(() => getLastNMonths(nMonths), [nMonths])
  const breakdown = propId === '' // no single property selected -> per-property breakdown

  // Single-property mode: two lines (Incl./Excl. Owner) for the selected property.
  const singleChartData = useMemo(() => {
    if (breakdown) return []
    return monthSlots.map(({ year, month, label }) => {
      const monthStart = new Date(year, month, 1)
      const monthEndExclusive = new Date(year, month + 1, 1)
      const available = daysInMonth(year, month)
      const guestNights = guestNightsForMonth(invoices, propId, year, month)
      const ownerNights = ownerNightsForMonth(ownerOccupancy, propId, monthStart, monthEndExclusive)
      const inclPct = available > 0 ? ((guestNights + ownerNights) / available) * 100 : 0
      const exclPct = available > 0 ? (guestNights / available) * 100 : 0
      return { label, 'Incl. Owner': Math.round(inclPct * 10) / 10, 'Excl. Owner': Math.round(exclPct * 10) / 10 }
    })
  }, [breakdown, monthSlots, invoices, ownerOccupancy, propId])

  // Breakdown mode: one line per property, for the selected metric.
  const breakdownChartData = useMemo(() => {
    if (!breakdown) return []
    return monthSlots.map(({ year, month, label }) => {
      const monthStart = new Date(year, month, 1)
      const monthEndExclusive = new Date(year, month + 1, 1)
      const available = daysInMonth(year, month)
      const row: Record<string, unknown> = { label }
      properties.forEach(p => {
        const guestNights = guestNightsForMonth(invoices, p.cr9b5_pt_propertyid, year, month)
        const ownerNights = ownerNightsForMonth(ownerOccupancy, p.cr9b5_pt_propertyid, monthStart, monthEndExclusive)
        const pct = available > 0 ? ((metric === 'incl' ? guestNights + ownerNights : guestNights) / available) * 100 : 0
        row[p.cr9b5_name] = Math.round(pct * 10) / 10
      })
      return row
    })
  }, [breakdown, monthSlots, invoices, ownerOccupancy, properties, metric])

  const chartData = breakdown ? breakdownChartData : singleChartData

  const summaryRows = useMemo(() => {
    if (!breakdown) {
      const inclVals = singleChartData.map(d => d['Incl. Owner'])
      const exclVals = singleChartData.map(d => d['Excl. Owner'])
      const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
      return [
        { id: 'incl', label: 'Incl. Owner', color: COLOR_INCL, avg: avg(inclVals), max: Math.max(0, ...inclVals), min: inclVals.length ? Math.min(...inclVals) : 0 },
        { id: 'excl', label: 'Excl. Owner', color: COLOR_EXCL, avg: avg(exclVals), max: Math.max(0, ...exclVals), min: exclVals.length ? Math.min(...exclVals) : 0 },
      ]
    }
    return properties.map((p, idx) => {
      const vals = breakdownChartData.map(d => Number(d[p.cr9b5_name] ?? 0))
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
      return { id: p.cr9b5_pt_propertyid, label: p.cr9b5_name, color: PROPERTY_COLORS[idx % PROPERTY_COLORS.length], avg, max: Math.max(0, ...vals), min: vals.length ? Math.min(...vals) : 0 }
    })
  }, [breakdown, singleChartData, breakdownChartData, properties])

  return (
    <div className={s.root}>
      {/* Filters */}
      <div className={s.filterRow}>
        <Select value={propId} onChange={e => setPropId(e.target.value)}>
          <option value="">All properties (breakdown)</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </Select>
        {breakdown && (
          <div className={s.segmented}>
            {(['incl', 'excl'] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)} className={mergeClasses(s.segBtn, metric === m && s.segBtnActive)}>
                {m === 'incl' ? 'Incl. Owner' : 'Excl. Owner'}
              </button>
            ))}
          </div>
        )}
        <Select value={String(nMonths)} onChange={e => setNMonths(Number(e.target.value))}>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
          <option value={36}>Last 36 months</option>
        </Select>
      </div>

      {/* Line chart */}
      {chartData.length === 0 || (breakdown && properties.length === 0) ? (
        <div className={s.empty}>No data for selected filters.</div>
      ) : (
        <div className={s.chartCard}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={nMonths === 12 ? 0 : nMonths === 24 ? 1 : 2} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, (dataMax: number) => Math.max(100, Math.ceil(dataMax / 10) * 10)]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {breakdown
                ? properties.map((p, idx) => (
                    <Line key={p.cr9b5_pt_propertyid} type="monotone" dataKey={p.cr9b5_name}
                      stroke={PROPERTY_COLORS[idx % PROPERTY_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  ))
                : (
                  <>
                    <Line type="monotone" dataKey="Incl. Owner" stroke={COLOR_INCL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Excl. Owner" stroke={COLOR_EXCL} strokeWidth={2} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                  </>
                )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      {chartData.length > 0 && (
        <div className={s.tableCard}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>{breakdown ? 'Property' : 'Series'}</th>
                <th className={mergeClasses(s.th, s.thRight)}>Avg / Month</th>
                <th className={mergeClasses(s.th, s.thRight)}>Highest</th>
                <th className={mergeClasses(s.th, s.thRight)}>Lowest</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(row => (
                <tr key={row.id}>
                  <td className={s.td}>
                    <span className={s.dot} style={{ backgroundColor: row.color }} />
                    <span className={s.rowName}>{row.label}</span>
                  </td>
                  <td className={mergeClasses(s.td, s.tdRightBold)}>{row.avg.toFixed(1)} %</td>
                  <td className={mergeClasses(s.td, s.tdRight)}>{row.max.toFixed(1)} %</td>
                  <td className={mergeClasses(s.td, s.tdRight)}>{row.min.toFixed(1)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
