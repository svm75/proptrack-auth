import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'

const TYPE_OUTGOING = 233100001
const TYPE_INCOMING = 233100000

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL   = ['January','February','March','April','May','June','July','August','September','October','November','December']

const COLOR_INCOME  = '#4f46e5'
const COLOR_EXPENSE = '#f87171'
const COLOR_PROFIT  = '#10b981'

const PROPERTY_COLORS = [
  '#4f46e5','#059669','#d97706','#dc2626',
  '#7c3aed','#0891b2','#be185d','#65a30d',
]

// ---------- helpers ----------

function isActive(inv: Cr9b5_pt_invoices): boolean {
  return (inv.statecode as unknown as number) !== 1 && (inv.statecodename as unknown as string) !== 'Inactive'
}

function daysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function fmtEur(n: number): string {
  return `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string { return `${n.toFixed(1)} %` }

function fmtEurShort(n: number): string {
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${n.toFixed(0)}`
}

// ---------- shared types ----------

interface SharedProps {
  invoices: Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
}

// ---------- KpiCard ----------

interface KpiCardProps {
  label: string; value: string; sub?: string; subLabel?: string
  accent?: 'green' | 'red' | 'blue' | 'purple' | 'gray'
}

function KpiCard({ label, value, sub, subLabel, accent = 'blue' }: KpiCardProps) {
  const bar: Record<string, string> = {
    green: 'bg-green-500', red: 'bg-red-400', blue: 'bg-indigo-500',
    purple: 'bg-purple-500', gray: 'bg-gray-400',
  }
  const val: Record<string, string> = {
    green: 'text-green-700', red: 'text-red-600', blue: 'text-indigo-700',
    purple: 'text-purple-700', gray: 'text-gray-600',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
      <div className={['absolute top-0 left-0 right-0 h-1', bar[accent]].join(' ')} />
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={['text-2xl font-bold tabular-nums', val[accent]].join(' ')}>{value}</span>
      {sub && (
        <span className="text-xs text-gray-400 tabular-nums">
          {subLabel && <span className="font-medium text-gray-500">{subLabel} </span>}
          {sub}
        </span>
      )}
    </div>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">{children}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
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

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 items-center flex-wrap mb-6">{children}</div>
}

function YearSelect({ value, years, onChange }: { value: number | 'all'; years: number[]; onChange: (v: number | 'all') => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
    >
      <option value="all">All years</option>
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}

function PropSelect({ value, properties, onChange }: { value: string; properties: Cr9b5_pt_properties[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
    >
      <option value="">All properties</option>
      {properties.map(p => (
        <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
      ))}
    </select>
  )
}

// ============================================================
// SUMMARY TAB (existing content)
// ============================================================

function DashboardSummary({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number | 'all'>(currentYear)
  const [filterPropId, setFilterPropId] = useState('')

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a, b) => b - a)
  }, [invoices])

  const propFiltered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (filterPropId && (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] !== filterPropId) return false
    return true
  }), [invoices, filterPropId])

  const filtered = useMemo(() =>
    filterYear === 'all' ? propFiltered : propFiltered.filter(i => i.cr9b5_year === filterYear)
  , [propFiltered, filterYear])

  const income   = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING), [filtered])
  const expenses = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING), [filtered])

  const incomeGross    = income.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
  const expensesGross  = expenses.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
  const netProfitGross = incomeGross - expensesGross
  const incomeNet      = income.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
  const expensesNet    = expenses.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
  const netProfitNet   = incomeNet - expensesNet
  const vatComponent   = income.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0)
                       + expenses.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0)
  const totalNights    = income.reduce((s, i) => s + (i.cr9b5_nights ?? 0), 0)
  const propCount      = filterPropId ? 1 : properties.length
  const availableNights = filterYear !== 'all' && propCount > 0 ? daysInYear(filterYear as number) * propCount : null
  const occupancyPct   = availableNights ? (totalNights / availableNights) * 100 : null

  const monthlyData = useMemo(() => MONTH_LABELS.map((month, idx) => {
    const inv = filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === idx)
    return {
      month,
      income:   inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING).reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0),
      expenses: inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING).reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0),
    }
  }), [filtered])

  const yearlyData = useMemo(() => {
    const byYear: Record<number, { income: number; expenses: number }> = {}
    propFiltered.forEach(inv => {
      const y = inv.cr9b5_year; if (!y) return
      if (!byYear[y]) byYear[y] = { income: 0, expenses: 0 }
      if ((inv.cr9b5_type as unknown as number) === TYPE_OUTGOING) byYear[y].income += inv.cr9b5_totalgross ?? 0
      else byYear[y].expenses += inv.cr9b5_totalgross ?? 0
    })
    return Object.entries(byYear).sort(([a],[b]) => Number(a)-Number(b))
      .map(([year, { income, expenses }]) => ({ year, income, expenses, profit: income - expenses }))
  }, [propFiltered])

  return (
    <div className="space-y-8">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>

      <div>
        <SectionHeading>Gross — incl. VAT</SectionHeading>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Income"     value={fmtEur(incomeGross)}    sub={`${income.length} invoice${income.length !== 1 ? 's' : ''}`} accent="green" />
          <KpiCard label="Expenses"   value={fmtEur(expensesGross)}  sub={`${expenses.length} invoice${expenses.length !== 1 ? 's' : ''}`} accent="red" />
          <KpiCard label="Net Profit" value={fmtEur(netProfitGross)} accent={netProfitGross >= 0 ? 'blue' : 'red'} />
          <KpiCard label="Occupancy"  value={occupancyPct !== null ? fmtPct(occupancyPct) : '—'}
            sub={occupancyPct !== null ? `${totalNights} / ${availableNights} nights` : filterYear === 'all' ? 'Select a year' : 'No properties'}
            accent="purple" />
        </div>
      </div>

      <div>
        <SectionHeading>Net — excl. VAT</SectionHeading>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Income Net"   value={fmtEur(incomeNet)}   sub={fmtEur(income.reduce((s,i) => s+(i.cr9b5_taxamount??0),0))}   subLabel="VAT:" accent="green" />
          <KpiCard label="Expenses Net" value={fmtEur(expensesNet)} sub={fmtEur(expenses.reduce((s,i) => s+(i.cr9b5_taxamount??0),0))} subLabel="VAT:" accent="red" />
          <KpiCard label="Net Profit"   value={fmtEur(netProfitNet)} sub={fmtEur(vatComponent)} subLabel="VAT total:" accent={netProfitNet >= 0 ? 'blue' : 'red'} />
        </div>
      </div>

      <div>
        <SectionHeading>{filterYear !== 'all' ? `Monthly Breakdown — ${filterYear}` : 'Monthly Breakdown — select a year'}</SectionHeading>
        {filterYear === 'all' ? (
          <p className="text-sm text-gray-400">Select a year to see the monthly breakdown.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="income"   name="Income"   fill={COLOR_INCOME}  radius={[4,4,0,0]} maxBarSize={36} />
                <Bar dataKey="expenses" name="Expenses" fill={COLOR_EXPENSE} radius={[4,4,0,0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <SectionHeading>Year-on-Year</SectionHeading>
        {yearlyData.length < 1 ? (
          <p className="text-sm text-gray-400">No data available.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={yearlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Line dataKey="income"   name="Income"     stroke={COLOR_INCOME}  strokeWidth={2} dot={{ r: 4 }} />
                <Line dataKey="expenses" name="Expenses"   stroke={COLOR_EXPENSE} strokeWidth={2} dot={{ r: 4 }} />
                <Line dataKey="profit"   name="Net Profit" stroke={COLOR_PROFIT}  strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// PROPERTY COMPARISON TAB
// ============================================================

interface PropStat {
  prop: Cr9b5_pt_properties
  color: string
  income: number
  expenses: number
  profit: number
  occupancyPct: number
  avgNightlyRate: number
  avgStayLength: number
  busiestMonth: string
  nights: number
  stayCount: number
}

function DashboardComparison({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number | 'all'>(currentYear)

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a, b) => b - a)
  }, [invoices])

  const propStats = useMemo<PropStat[]>(() => {
    return properties.map((prop, idx) => {
      const propInvoices = invoices.filter(inv => {
        if (!isActive(inv)) return false
        if (filterYear !== 'all' && inv.cr9b5_year !== filterYear) return false
        return (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] === prop.cr9b5_pt_propertyid
      })
      const outgoing = propInvoices.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING)
      const incoming = propInvoices.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING)

      const income   = outgoing.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
      const expenses = incoming.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
      const nights   = outgoing.reduce((s, i) => s + (i.cr9b5_nights ?? 0), 0)
      const stayCount = outgoing.length

      const available = filterYear !== 'all' ? daysInYear(filterYear as number) : 365

      const nightsByMonth = Array(12).fill(0)
      outgoing.forEach(inv => {
        if (inv.cr9b5_checkin) nightsByMonth[new Date(inv.cr9b5_checkin).getMonth()] += (inv.cr9b5_nights ?? 0)
      })
      const maxNights = Math.max(...nightsByMonth)
      const busiestIdx = nightsByMonth.indexOf(maxNights)

      return {
        prop,
        color: PROPERTY_COLORS[idx % PROPERTY_COLORS.length],
        income,
        expenses,
        profit: income - expenses,
        occupancyPct: available > 0 ? (nights / available) * 100 : 0,
        avgNightlyRate: nights > 0 ? income / nights : 0,
        avgStayLength: stayCount > 0 ? nights / stayCount : 0,
        busiestMonth: maxNights > 0 ? MONTH_FULL[busiestIdx] : '—',
        nights,
        stayCount,
      }
    })
  }, [invoices, properties, filterYear])

  return (
    <div className="space-y-6">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
      </FilterRow>

      {properties.length === 0 && (
        <p className="text-sm text-gray-400">No properties found.</p>
      )}

      <div className={`grid gap-5 ${properties.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-sm'}`}>
        {propStats.map(s => (
          <div key={s.prop.cr9b5_pt_propertyid}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="h-1.5" style={{ backgroundColor: s.color }} />
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <h3 className="font-semibold text-gray-900 text-base truncate">{s.prop.cr9b5_name}</h3>
                {s.prop.cr9b5_shortid && (
                  <span className="text-xs text-gray-400 shrink-0">({s.prop.cr9b5_shortid})</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <StatRow label="Income (gross)"    value={fmtEur(s.income)}   accent="green" />
                <StatRow label="Expenses (gross)"  value={fmtEur(s.expenses)} accent="red" />
                <StatRow label="Net Profit"        value={fmtEur(s.profit)}   accent={s.profit >= 0 ? 'blue' : 'red'} />
                <StatRow label="Occupancy"         value={fmtPct(s.occupancyPct)} sub={`${s.nights} nights`} accent="purple" />
                <StatRow label="Avg Nightly Rate"  value={s.nights > 0 ? fmtEur(s.avgNightlyRate) : '—'} />
                <StatRow label="Avg Stay Length"   value={s.stayCount > 0 ? `${s.avgStayLength.toFixed(1)} nights` : '—'} sub={`${s.stayCount} stays`} />
                <div className="col-span-2">
                  <StatRow label="Busiest Month" value={s.busiestMonth} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatRow({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' | 'blue' | 'purple' }) {
  const colors: Record<string, string> = {
    green: 'text-green-700', red: 'text-red-600', blue: 'text-indigo-700', purple: 'text-purple-700',
  }
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
      <div className={['font-bold tabular-nums text-sm', accent ? colors[accent] : 'text-gray-800'].join(' ')}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 tabular-nums">{sub}</div>}
    </div>
  )
}

// ============================================================
// OCCUPANCY HEATMAP TAB
// ============================================================

interface HeatTooltip { x: number; y: number; lines: string[] }

function blendHexColors(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const rgbs = colors.map(hex => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }))
  const avg = {
    r: Math.round(rgbs.reduce((s, c) => s + c.r, 0) / rgbs.length),
    g: Math.round(rgbs.reduce((s, c) => s + c.g, 0) / rgbs.length),
    b: Math.round(rgbs.reduce((s, c) => s + c.b, 0) / rgbs.length),
  }
  return `#${avg.r.toString(16).padStart(2,'0')}${avg.g.toString(16).padStart(2,'0')}${avg.b.toString(16).padStart(2,'0')}`
}

function DashboardHeatmap({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState(currentYear)
  const [filterPropId, setFilterPropId] = useState('')
  const [tooltip, setTooltip] = useState<HeatTooltip | null>(null)

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [currentYear]
  }, [invoices, currentYear])

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {}
    properties.forEach((p, i) => { map[p.cr9b5_pt_propertyid] = PROPERTY_COLORS[i % PROPERTY_COLORS.length] })
    return map
  }, [properties])

  // Map dateStr → array of { propId, propName, contactName }
  const occupiedMap = useMemo(() => {
    const map: Record<string, { propId: string; propName: string; contactName: string }[]> = {}
    invoices.forEach(inv => {
      if (!isActive(inv)) return
      if ((inv.cr9b5_type as unknown as number) !== TYPE_OUTGOING) return
      if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) return
      const propId = (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] as string
      if (filterPropId && propId !== filterPropId) return
      const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
      const checkin  = new Date(inv.cr9b5_checkin)
      const checkout = new Date(inv.cr9b5_checkout)
      const cur = new Date(checkin)
      while (cur < checkout) {
        if (cur.getFullYear() === filterYear) {
          const key = `${filterYear}-${String(cur.getMonth() + 1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
          if (!map[key]) map[key] = []
          map[key].push({
            propId,
            propName: prop?.cr9b5_name ?? 'Unknown',
            contactName: (inv as unknown as Record<string, unknown>)['cr9b5_contactname'] as string ?? '',
          })
        }
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [invoices, properties, filterYear, filterPropId])

  function getCellColor(month: number, day: number): string {
    const key = `${filterYear}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const entries = occupiedMap[key]
    if (!entries?.length) return '#e5e7eb'
    const colors = [...new Set(entries.map(e => colorMap[e.propId] ?? '#6b7280'))]
    return blendHexColors(colors)
  }

  function getCellTooltip(month: number, day: number): string[] | null {
    const key = `${filterYear}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const entries = occupiedMap[key]
    if (!entries?.length) return null
    const dateStr = `${day} ${MONTH_FULL[month]} ${filterYear}`
    const seen = new Set<string>()
    const lines = [dateStr]
    entries.forEach(e => {
      const line = e.contactName ? `${e.propName} — ${e.contactName}` : e.propName
      if (!seen.has(line)) { seen.add(line); lines.push(line) }
    })
    return lines
  }

  // Count occupied days per month for the legend
  const occupiedByMonth = useMemo(() => {
    const counts = Array(12).fill(0)
    Object.keys(occupiedMap).forEach(key => {
      const month = parseInt(key.slice(5, 7)) - 1
      counts[month]++
    })
    return counts
  }, [occupiedMap])

  const totalOccupied = occupiedByMonth.reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-6">
      {tooltip && (
        <div
          style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 8, zIndex: 9999 }}
          className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none"
        >
          {tooltip.lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'font-semibold mb-0.5' : 'text-gray-300'}>{l}</div>
          ))}
        </div>
      )}

      <FilterRow>
        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
        <span className="text-sm text-gray-500 tabular-nums">{totalOccupied} / {daysInYear(filterYear)} days occupied</span>
      </FilterRow>

      {/* Property colour legend */}
      {!filterPropId && properties.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-2">
          {properties.map((p, i) => (
            <div key={p.cr9b5_pt_propertyid} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PROPERTY_COLORS[i % PROPERTY_COLORS.length] }} />
              {p.cr9b5_name}
            </div>
          ))}
        </div>
      )}

      {/* 12-month heatmap grid */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
        <div className="grid grid-cols-12 gap-2 min-w-[520px]">
          {Array.from({ length: 12 }, (_, month) => {
            const dim = daysInMonth(filterYear, month)
            const cells: React.ReactNode[] = []
            for (let day = 1; day <= 31; day++) {
              if (day > dim) {
                cells.push(<div key={day} className="w-full aspect-square" />)
              } else {
                const tipLines = getCellTooltip(month, day)
                cells.push(
                  <div
                    key={day}
                    className="w-full aspect-square rounded-[2px] cursor-default transition-opacity hover:opacity-80"
                    style={{ backgroundColor: getCellColor(month, day) }}
                    onMouseEnter={e => {
                      if (tipLines) setTooltip({ x: e.clientX, y: e.clientY, lines: tipLines })
                    }}
                    onMouseMove={e => {
                      if (tipLines) setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              }
            }
            return (
              <div key={month} className="flex flex-col gap-[2px]">
                <div className="text-[10px] font-semibold text-gray-400 text-center mb-1 tracking-wide uppercase">
                  {MONTH_LABELS[month]}
                </div>
                <div className="text-[9px] text-gray-300 text-center mb-0.5 tabular-nums">
                  {occupiedByMonth[month]}d
                </div>
                {cells}
              </div>
            )
          })}
        </div>

        {/* Day count scale legend */}
        <div className="flex items-center gap-2 mt-5 text-[10px] text-gray-400">
          <span>Empty</span>
          <div className="w-4 h-4 rounded-[2px]" style={{ backgroundColor: '#e5e7eb' }} />
          <span className="mx-2">→</span>
          <span>Occupied</span>
          {!filterPropId && properties.map((p, i) => (
            <div key={p.cr9b5_pt_propertyid} className="w-4 h-4 rounded-[2px] ml-1"
              style={{ backgroundColor: PROPERTY_COLORS[i % PROPERTY_COLORS.length] }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CASH FLOW TIMELINE TAB
// ============================================================

function DashboardCashFlow({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number | 'all'>(currentYear)
  const [filterPropId, setFilterPropId] = useState('')

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a, b) => b - a)
  }, [invoices])

  const filtered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (filterYear !== 'all' && inv.cr9b5_year !== filterYear) return false
    if (filterPropId && (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] !== filterPropId) return false
    return true
  }), [invoices, filterYear, filterPropId])

  // Monthly income/expenses + cumulative
  const monthlyData = useMemo(() => {
    const months = filterYear !== 'all'
      ? MONTH_LABELS.map((month, idx) => {
          const inv = filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === idx)
          return {
            month,
            income:   inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING).reduce((s,i) => s+(i.cr9b5_totalgross??0),0),
            expenses: inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING).reduce((s,i) => s+(i.cr9b5_totalgross??0),0),
          }
        })
      : []

    let cumulative = 0
    return months.map(m => {
      cumulative += m.income - m.expenses
      return { ...m, cumulative }
    })
  }, [filtered, filterYear])

  // KPIs
  const totalIncome   = filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING).reduce((s,i) => s+(i.cr9b5_totalgross??0),0)
  const totalExpenses = filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING).reduce((s,i) => s+(i.cr9b5_totalgross??0),0)
  const closingBalance = totalIncome - totalExpenses
  const highestMonthIncome  = monthlyData.length ? Math.max(...monthlyData.map(m => m.income))   : 0
  const highestMonthExpense = monthlyData.length ? Math.max(...monthlyData.map(m => m.expenses)) : 0

  return (
    <div className="space-y-6">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Opening Balance"         value="€ 0"                       sub="Start of period"                accent="gray" />
        <KpiCard label="Closing Balance"          value={fmtEur(closingBalance)}    accent={closingBalance >= 0 ? 'blue' : 'red'} />
        <KpiCard label="Highest Month — Income"   value={fmtEur(highestMonthIncome)}   accent="green" />
        <KpiCard label="Highest Month — Expense"  value={fmtEur(highestMonthExpense)}  accent="red" />
      </div>

      {filterYear === 'all' ? (
        <p className="text-sm text-gray-400">Select a year to see the cash flow timeline.</p>
      ) : (
        <>
          {/* Cumulative net line */}
          <div>
            <SectionHeading>{`Cumulative Net Cash Flow — ${filterYear}`}</SectionHeading>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <Line dataKey="cumulative" name="Cumulative Net" stroke={COLOR_PROFIT} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Monthly income vs expenses bar */}
          <div>
            <SectionHeading>{`Monthly Income vs Expenses — ${filterYear}`}</SectionHeading>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtEurShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar dataKey="income"   name="Income"   fill={COLOR_INCOME}  radius={[4,4,0,0]} maxBarSize={36} />
                  <Bar dataKey="expenses" name="Expenses" fill={COLOR_EXPENSE} radius={[4,4,0,0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// MAIN DASHBOARD — tab shell
// ============================================================

type DashTab = 'summary' | 'comparison' | 'heatmap' | 'cashflow'

const TABS: { id: DashTab; label: string }[] = [
  { id: 'summary',    label: 'Summary' },
  { id: 'comparison', label: 'Property Comparison' },
  { id: 'heatmap',    label: 'Occupancy Heatmap' },
  { id: 'cashflow',   label: 'Cash Flow' },
]

export default function Dashboard() {
  const [invoices,   setInvoices]   = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DashTab>('summary')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [invRes, propRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date desc'] }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header + tab nav */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {tab === 'summary'    && <DashboardSummary    invoices={invoices} properties={properties} />}
          {tab === 'comparison' && <DashboardComparison invoices={invoices} properties={properties} />}
          {tab === 'heatmap'    && <DashboardHeatmap    invoices={invoices} properties={properties} />}
          {tab === 'cashflow'   && <DashboardCashFlow   invoices={invoices} properties={properties} />}
        </>
      )}
    </div>
  )
}
