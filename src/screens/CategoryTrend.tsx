import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { fmtEur } from '../utils/formatters'

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

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {fmtEur(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function CategoryTrend({ invoices, properties, references }: Props) {
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

  // Build category list: defined cats that have data + Uncategorised
  const activeCatIds = useMemo(() => {
    const ids = new Set(filteredInvs.map(getCatId))
    const result: { id: string; label: string }[] = cats
      .filter(c => ids.has(c.cr9b5_pt_referenceid))
      .map(c => ({ id: c.cr9b5_pt_referenceid, label: c.cr9b5_value ?? '' }))
    if (ids.has('')) result.push({ id: '', label: 'Uncategorised' })
    return result
  }, [filteredInvs, cats])

  // Chart data: one row per month
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

  // Summary table
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
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {(['income', 'expense'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={['px-4 py-1.5 font-medium transition-colors', typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'].join(' ')}
            >
              {t === 'income' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>
        <select value={propId} onChange={e => setPropId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </select>
        <select value={nMonths} onChange={e => setNMonths(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
          <option value={36}>Last 36 months</option>
        </select>
      </div>

      {/* Line chart */}
      {activeCatIds.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">No data for selected filters.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Category</th>
                <th className="px-4 py-2.5 text-right">Avg / Month</th>
                <th className="px-4 py-2.5 text-right">Highest Month</th>
                <th className="px-4 py-2.5 text-right">Lowest Month</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summaryRows.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: row.color }} />
                    <span className="text-gray-800 font-medium">{row.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{fmtEur(row.avg)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">
                    {row.maxIdx >= 0 ? <>{fmtEur(row.maxVal)} <span className="text-gray-400 text-xs">({monthSlots[row.maxIdx]?.label})</span></> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">
                    {row.minIdx >= 0 ? <>{fmtEur(row.minVal)} <span className="text-gray-400 text-xs">({monthSlots[row.minIdx]?.label})</span></> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900 tabular-nums">{fmtEur(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
