import { useMemo, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { makeStyles, tokens, mergeClasses, Select } from '@fluentui/react-components'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { formatMoney } from '@/domain/money'

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

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '24px' },
  filterRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  empty: { padding: '64px', textAlign: 'center', color: tokens.colorNeutralForeground4, fontSize: '14px' },
  chartCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '16px' },
  tooltipBox: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, padding: '8px 12px', fontSize: '13px' },
  tooltipTitle: { fontWeight: 600, color: tokens.colorNeutralForeground2 },
  tooltipVal: { color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  tooltipPct: { color: tokens.colorNeutralForeground4, fontSize: '12px' },
  tableCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, overflowX: 'auto' },
  table: { fontSize: '14px', borderCollapse: 'collapse', width: '100%', minWidth: '900px' },
  th: { padding: '10px 8px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'right', whiteSpace: 'nowrap' },
  thLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '10px 16px', textAlign: 'left', minWidth: '160px', zIndex: 1 },
  thTotal: { borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  td: { padding: '8px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  tdLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground1, padding: '8px 16px', whiteSpace: 'nowrap', zIndex: 1, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  dot: { display: 'inline-block', width: '10px', height: '10px', borderRadius: tokens.borderRadiusCircular, marginRight: '8px' },
  catName: { color: tokens.colorNeutralForeground1, fontWeight: 500 },
  tdTotal: { fontWeight: 600, color: tokens.colorNeutralForeground1, borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  tfootRow: { backgroundColor: tokens.colorNeutralBackground2 },
  tfootLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '10px 16px', fontSize: '14px', fontWeight: 700, color: tokens.colorNeutralForeground1, zIndex: 1, borderTop: `2px solid ${tokens.colorNeutralStroke1}` },
  tfootCell: { padding: '10px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', borderTop: `2px solid ${tokens.colorNeutralStroke1}` },
})

function DonutLabel({ cx, cy, total }: { cx: number; cy: number; total: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} dy="-0.4em" fontSize={13} fill="#374151" fontWeight={600}>Total</tspan>
      <tspan x={cx} dy="1.4em" fontSize={14} fill="#111827" fontWeight={700}>{formatMoney(total)}</tspan>
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
  const s = useStyles()
  if (!active || !payload?.length) return null
  const { name, value } = payload[0]
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
  return (
    <div className={s.tooltipBox}>
      <p className={s.tooltipTitle}>{name}</p>
      <p className={s.tooltipVal}>{formatMoney(value)}</p>
      <p className={s.tooltipPct}>{pct}% of total</p>
    </div>
  )
}

export default function ExpenseBreakdown({ invoices, properties, references }: Props) {
  const s = useStyles()
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
    <div className={s.root}>
      {/* Filters */}
      <div className={s.filterRow}>
        <Select value={String(year)} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={propId} onChange={e => setPropId(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className={s.empty}>No expense data for selected filters.</div>
      ) : (
        <>
          {/* Donut chart */}
          <div className={s.chartCard}>
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
          <div className={s.tableCard}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={mergeClasses(s.th, s.thLabel)}>Category</th>
                  {MONTHS.map(mn => <th key={mn} className={s.th}>{mn}</th>)}
                  <th className={mergeClasses(s.th, s.thTotal)}>Total</th>
                  <th className={s.th}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {catRows.map(row => {
                  const rowTotal = row.invs.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
                  return (
                    <tr key={row.id}>
                      <td className={s.tdLabel}>
                        <span className={s.dot} style={{ backgroundColor: row.color }} />
                        <span className={s.catName}>{row.label}</span>
                      </td>
                      {MONTHS.map((_, m) => (
                        <td key={m} className={s.td}>{fmtCell(monthTotal(row.invs, m))}</td>
                      ))}
                      <td className={mergeClasses(s.td, s.tdTotal)}>{fmtWhole(rowTotal)}</td>
                      <td className={s.td}>{fmtPct(rowTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className={s.tfootRow}>
                  <td className={s.tfootLabel}>TOTAL</td>
                  {MONTHS.map((_, m) => (
                    <td key={m} className={s.tfootCell}>
                      {fmtCell(filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === m).reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0))}
                    </td>
                  ))}
                  <td className={mergeClasses(s.tfootCell, s.tdTotal)}>{fmtWhole(totalExpenses)}</td>
                  <td className={s.tfootCell} style={{ color: tokens.colorNeutralForeground4 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
