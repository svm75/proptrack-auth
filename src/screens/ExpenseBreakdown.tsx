import { useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { fmtEur } from '../utils/formatters'

const TYPE_EXPENSE = 233100000
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

interface Props {
  invoices:   Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
  references: Cr9b5_pt_references[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutLabel({ cx, cy, total }: { cx: number; cy: number; total: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} dy="-0.4em" fontSize={13} fill="#374151" fontWeight={600}>Total</tspan>
      <tspan x={cx} dy="1.4em" fontSize={14} fill="#111827" fontWeight={700}>{fmtEur(total)}</tspan>
    </text>
  )
}

interface PieTooltipProps {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  total: number
}

function PieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700">{name}</p>
      <p className="text-gray-600 tabular-nums">{fmtEur(value)}</p>
      <p className="text-gray-400 text-xs">{pct}% of total</p>
    </div>
  )
}

export default function ExpenseBreakdown({ invoices, properties, references }: Props) {
  const curYear = new Date().getFullYear()

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [curYear]
  }, [invoices, curYear])

  const [year,   setYear]   = useState(curYear)
  const [propId, setPropId] = useState('')

  const expenseCats = useMemo(
    () => references.filter(r => Number(r.cr9b5_referencetype) === REF_EXP_CAT),
    [references],
  )

  const filtered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if ((inv.cr9b5_type as unknown as number) !== TYPE_EXPENSE) return false
    if (inv.cr9b5_year !== year) return false
    if (propId) {
      const r = inv as unknown as Record<string, unknown>
      if (!r['cr9b5_allproperties'] && r['_cr9b5_property_value'] !== propId) return false
    }
    return true
  }), [invoices, year, propId])

  // Category rows: defined cats with data + Uncategorised
  const catRows = useMemo(() => {
    const rows: { id: string; label: string; invs: Cr9b5_pt_invoices[]; color: string }[] = expenseCats
      .map((c, idx) => ({
        id:    c.cr9b5_pt_referenceid,
        label: c.cr9b5_value ?? '',
        invs:  filtered.filter(i => getCatId(i) === c.cr9b5_pt_referenceid),
        color: CAT_COLORS[idx % CAT_COLORS.length],
      }))
      .filter(r => r.invs.length > 0 && !r.label.startsWith('.'))

    const uncatInvs = filtered.filter(i => !getCatId(i))
    if (uncatInvs.length > 0) {
      rows.push({ id: '', label: 'Uncategorised', invs: uncatInvs, color: '#9ca3af' })
    }
    return rows.sort((a, b) => {
      const ta = a.invs.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
      const tb = b.invs.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
      return tb - ta
    })
  }, [filtered, expenseCats])

  const totalExpenses = useMemo(
    () => filtered.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0),
    [filtered],
  )

  const pieData = useMemo(
    () => catRows.map(r => ({ name: r.label, value: r.invs.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0) })),
    [catRows],
  )

  function monthTotal(invs: Cr9b5_pt_invoices[], m: number): number {
    return invs
      .filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === m)
      .reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
  }

  function fmtWhole(n: number): string {
    if (n === 0) return '—'
    const int = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")
    return `€ ${int}`
  }

  function fmtCell(n: number): string {
    return fmtWhole(n)
  }

  function fmtPct(n: number): string {
    return totalExpenses > 0 ? `${((n / totalExpenses) * 100).toFixed(1)}%` : '—'
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={propId} onChange={e => setPropId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">No expense data for selected filters.</div>
      ) : (
        <>
          {/* Donut chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  dataKey="value"
                  labelLine={false}
                  label={({ cx, cy }: { cx: number; cy: number }) => (
                    <DonutLabel cx={cx} cy={cy} total={totalExpenses} />
                  )}
                >
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={catRows[idx]?.color ?? CAT_COLORS[idx % CAT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip total={totalExpenses} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly breakdown table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="text-sm border-collapse w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="sticky left-0 bg-gray-50 px-4 py-2.5 text-left min-w-[160px] z-10">Category</th>
                  {MONTHS.map(mn => <th key={mn} className="px-2 py-2.5 text-right whitespace-nowrap">{mn}</th>)}
                  <th className="px-4 py-2.5 text-right border-l border-gray-200 whitespace-nowrap">Total</th>
                  <th className="px-4 py-2.5 text-right whitespace-nowrap">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {catRows.map(row => {
                  const rowTotal = row.invs.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 bg-white px-4 py-2 whitespace-nowrap z-10">
                        <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: row.color }} />
                        <span className="text-gray-800 font-medium">{row.label}</span>
                      </td>
                      {MONTHS.map((_, m) => (
                        <td key={m} className="px-2 py-2 text-right text-xs text-gray-600 whitespace-nowrap tabular-nums">
                          {fmtCell(monthTotal(row.invs, m))}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right text-xs font-semibold text-gray-900 whitespace-nowrap tabular-nums border-l border-gray-200">
                        {fmtWhole(rowTotal)}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-gray-600 whitespace-nowrap tabular-nums">
                        {fmtPct(rowTotal)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-300">
                <tr>
                  <td className="sticky left-0 bg-gray-50 px-4 py-2.5 text-sm font-bold text-gray-900 z-10">TOTAL</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} className="px-2 py-2.5 text-right text-xs font-bold text-gray-900 whitespace-nowrap tabular-nums">
                      {fmtCell(filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === m).reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0))}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-900 whitespace-nowrap tabular-nums border-l border-gray-200">
                    {fmtWhole(totalExpenses)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-500 whitespace-nowrap">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
