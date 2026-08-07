import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { makeStyles, tokens, mergeClasses, Select } from '@fluentui/react-components'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { formatMoney } from '@/domain/money'

const TYPE_INCOME  = 233100001
const TYPE_EXPENSE = 233100000
const REF_INC_CAT  = 233100005
const REF_EXP_CAT  = 233100006
const MONTHS       = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CAT_COLORS   = [
  '#4f46e5','#059669','#d97706','#dc2626',
  '#7c3aed','#0891b2','#be185d','#65a30d',
  '#ea580c','#0369a1','#7e22ce','#15803d',
]

function isActive(inv: Cr9b5_pt_invoices) {
  return (inv.statecode as unknown as number) !== 1
}

function getCatId(inv: Cr9b5_pt_invoices): string {
  return ((inv as unknown as Record<string, unknown>)['_cr9b5_categoryid_value'] as string) ?? ''
}

function getLastNMonths(n: number): { year: number; month: number; label: string }[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  })
}

interface Props {
  invoices:   Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
  references: Cr9b5_pt_references[]
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
  catName: { color: tokens.colorNeutralForeground1, fontWeight: 500 },
  tdRight: { textAlign: 'right', color: tokens.colorNeutralForeground2, fontVariantNumeric: 'tabular-nums' },
  tdRightBold: { textAlign: 'right', fontWeight: 600, color: tokens.colorNeutralForeground1, fontVariantNumeric: 'tabular-nums' },
  faded: { color: tokens.colorNeutralForeground4, fontSize: '12px' },
})

function ChartTooltip({ active, payload, label }: TooltipProps) {
  const s = useStyles()
  if (!active || !payload?.length) return null
  return (
    <div className={s.tooltipBox}>
      <p className={s.tooltipTitle}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontVariantNumeric: 'tabular-nums' }}>
          {p.name}: {formatMoney(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function CategoryTrend({ invoices, properties, references }: Props) {
  const s = useStyles()
  const [typeFilter, setTypeFilter] = useState<'income' | 'expense'>('income')
  const [propId,     setPropId]     = useState('')
  const [nMonths,    setNMonths]    = useState(24)

  const isIncome = typeFilter === 'income'
  const invType  = isIncome ? TYPE_INCOME : TYPE_EXPENSE
  const refType  = isIncome ? REF_INC_CAT : REF_EXP_CAT

  const cats = useMemo(
    () => references.filter(r => Number(r.cr9b5_referencetype) === refType),
    [references, refType],
  )

  const monthSlots = useMemo(() => getLastNMonths(nMonths), [nMonths])

  const filteredInvs = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if ((inv.cr9b5_type as unknown as number) !== invType) return false
    if (propId) {
      const r = inv as unknown as Record<string, unknown>
      if (!r['cr9b5_allproperties'] && r['_cr9b5_property_value'] !== propId) return false
    }
    return true
  }), [invoices, invType, propId])

  const activeCatIds = useMemo(() => {
    const ids = new Set(filteredInvs.map(getCatId))
    const result: { id: string; label: string }[] = cats
      .filter(c => ids.has(c.cr9b5_pt_referenceid))
      .map(c => ({ id: c.cr9b5_pt_referenceid, label: c.cr9b5_value ?? '' }))
    if (ids.has('')) result.push({ id: '', label: 'Uncategorised' })
    return result
  }, [filteredInvs, cats])

  const chartData = useMemo(() => monthSlots.map(({ year, month, label }) => {
    const monthInvs = filteredInvs.filter(inv => {
      if (!inv.cr9b5_date) return false
      const d = new Date(inv.cr9b5_date)
      return d.getFullYear() === year && d.getMonth() === month
    })
    const row: Record<string, unknown> = { label }
    activeCatIds.forEach(({ id, label: catLabel }) => {
      row[catLabel] = monthInvs
        .filter(i => getCatId(i) === id)
        .reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
    })
    return row
  }), [monthSlots, filteredInvs, activeCatIds])

  const summaryRows = useMemo(() => activeCatIds.map(({ id, label }, idx) => {
    const catInvs = filteredInvs.filter(i => getCatId(i) === id)
    const monthlySums = monthSlots.map(({ year, month }) =>
      catInvs
        .filter(inv => inv.cr9b5_date && new Date(inv.cr9b5_date).getFullYear() === year && new Date(inv.cr9b5_date).getMonth() === month)
        .reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
    )
    const total   = monthlySums.reduce((s, v) => s + v, 0)
    const avg     = total / (nMonths || 1)
    const maxVal  = Math.max(...monthlySums)
    const minVal  = Math.min(...monthlySums.filter(v => v > 0))
    const maxIdx  = monthlySums.indexOf(maxVal)
    const minIdx  = monthlySums.findIndex(v => v === minVal)
    return { id, label, total, avg, maxVal, minVal, maxIdx, minIdx, color: CAT_COLORS[idx % CAT_COLORS.length] }
  }).sort((a, b) => b.total - a.total), [activeCatIds, filteredInvs, monthSlots, nMonths])

  return (
    <div className={s.root}>
      {/* Filters */}
      <div className={s.filterRow}>
        <div className={s.segmented}>
          {(['income', 'expense'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={mergeClasses(s.segBtn, typeFilter === t && s.segBtnActive)}
            >
              {t === 'income' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>
        <Select value={propId} onChange={e => setPropId(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </Select>
        <Select value={String(nMonths)} onChange={e => setNMonths(Number(e.target.value))}>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
          <option value={36}>Last 36 months</option>
        </Select>
      </div>

      {/* Line chart */}
      {activeCatIds.length === 0 ? (
        <div className={s.empty}>No data for selected filters.</div>
      ) : (
        <div className={s.chartCard}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={nMonths === 12 ? 0 : nMonths === 24 ? 1 : 2} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${Math.round(v / 1000)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {activeCatIds.map(({ label }, idx) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={CAT_COLORS[idx % CAT_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      {summaryRows.length > 0 && (
        <div className={s.tableCard}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Category</th>
                <th className={mergeClasses(s.th, s.thRight)}>Avg / Month</th>
                <th className={mergeClasses(s.th, s.thRight)}>Highest Month</th>
                <th className={mergeClasses(s.th, s.thRight)}>Lowest Month</th>
                <th className={mergeClasses(s.th, s.thRight)}>Total</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map(row => (
                <tr key={row.id}>
                  <td className={s.td}>
                    <span className={s.dot} style={{ backgroundColor: row.color }} />
                    <span className={s.catName}>{row.label}</span>
                  </td>
                  <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(row.avg)}</td>
                  <td className={mergeClasses(s.td, s.tdRight)}>
                    {row.maxIdx >= 0 ? <>{formatMoney(row.maxVal)} <span className={s.faded}>({monthSlots[row.maxIdx]?.label})</span></> : '—'}
                  </td>
                  <td className={mergeClasses(s.td, s.tdRight)}>
                    {row.minIdx >= 0 ? <>{formatMoney(row.minVal)} <span className={s.faded}>({monthSlots[row.minIdx]?.label})</span></> : '—'}
                  </td>
                  <td className={mergeClasses(s.td, s.tdRightBold)}>{formatMoney(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
