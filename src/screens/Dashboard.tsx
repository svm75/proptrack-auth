import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'

const TYPE_OUTGOING = 233100001   // invoice sent to guest  = income
const TYPE_INCOMING = 233100000   // invoice from supplier  = expense

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const COLOR_INCOME   = '#4f46e5'  // indigo
const COLOR_EXPENSE  = '#f87171'  // red
const COLOR_PROFIT   = '#10b981'  // emerald

function isActive(inv: Cr9b5_pt_invoices): boolean {
  return (inv.statecode as unknown as number) !== 1 && (inv.statecodename as unknown as string) !== 'Inactive'
}

function daysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365
}

function fmtEur(n: number): string {
  return `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)} %`
}

function fmtEurShort(n: number): string {
  if (Math.abs(n) >= 1000) return `€${(n / 1000).toFixed(1)}k`
  return `€${n.toFixed(0)}`
}

// ---------- KPI card ----------

interface KpiCardProps {
  label: string
  value: string
  sub?: string
  subLabel?: string
  accent?: 'green' | 'red' | 'blue' | 'purple' | 'gray'
}

function KpiCard({ label, value, sub, subLabel, accent = 'blue' }: KpiCardProps) {
  const bar: Record<string, string> = {
    green:  'bg-green-500',
    red:    'bg-red-400',
    blue:   'bg-indigo-500',
    purple: 'bg-purple-500',
    gray:   'bg-gray-400',
  }
  const val: Record<string, string> = {
    green:  'text-green-700',
    red:    'text-red-600',
    blue:   'text-indigo-700',
    purple: 'text-purple-700',
    gray:   'text-gray-600',
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

// ---------- custom tooltip ----------

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {name: string; value: number; color: string}[]; label?: string }) {
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

// ---------- main component ----------

export default function Dashboard() {
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)

  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number | 'all'>(currentYear)
  const [filterPropId, setFilterPropId] = useState('')

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

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a, b) => b - a)
  }, [invoices])

  // Property-only filtered (used by chart 2 and year filter options)
  const propFiltered = useMemo(() => {
    return invoices.filter(inv => {
      if (!isActive(inv)) return false
      if (filterPropId) {
        const raw = inv as unknown as Record<string, unknown>
        if (raw['_cr9b5_property_value'] !== filterPropId) return false
      }
      return true
    })
  }, [invoices, filterPropId])

  // Year + property filtered (KPIs and chart 1)
  const filtered = useMemo(() => {
    if (filterYear === 'all') return propFiltered
    return propFiltered.filter(inv => inv.cr9b5_year === filterYear)
  }, [propFiltered, filterYear])

  // Outgoing = income (sent to guests), Incoming = expense (from suppliers)
  const income   = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING), [filtered])
  const expenses = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING), [filtered])

  // ---------- KPI calculations ----------

  const incomeGross    = income.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
  const expensesGross  = expenses.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0)
  const netProfitGross = incomeGross - expensesGross

  const incomeNet    = income.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
  const expensesNet  = expenses.reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
  const netProfitNet = incomeNet - expensesNet
  const vatComponent = income.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0)
             + expenses.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0)

  const totalNights = income.reduce((s, i) => s + (i.cr9b5_nights ?? 0), 0)
  const propCount = filterPropId ? 1 : properties.length
  const availableNights = filterYear !== 'all' && propCount > 0
    ? daysInYear(filterYear as number) * propCount
    : null
  const occupancyPct = availableNights ? (totalNights / availableNights) * 100 : null

  // ---------- Chart 1: monthly (selected year, property filter) ----------

  const monthlyData = useMemo(() => {
    return MONTH_LABELS.map((month, idx) => {
      const inv = filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === idx)
      return {
        month,
        income:   inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING).reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0),
        expenses: inv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING).reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0),
      }
    })
  }, [filtered])

  // ---------- Chart 2: year-on-year (all years, property filter) ----------

  const yearlyData = useMemo(() => {
    const byYear: Record<number, { income: number; expenses: number }> = {}
    propFiltered.forEach(inv => {
      const y = inv.cr9b5_year
      if (!y) return
      if (!byYear[y]) byYear[y] = { income: 0, expenses: 0 }
      if ((inv.cr9b5_type as unknown as number) === TYPE_OUTGOING) byYear[y].income += inv.cr9b5_totalgross ?? 0
      else byYear[y].expenses += inv.cr9b5_totalgross ?? 0
    })
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, { income, expenses }]) => ({
        year: String(year),
        income,
        expenses,
        profit: income - expenses,
      }))
  }, [propFiltered])

  return (
    <div className="p-6 max-w-5xl space-y-8">
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={filterYear}
            onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="all">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
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
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <>
          {/* Row 1 — Gross (incl. VAT) */}
          <div>
            <SectionHeading>Gross — incl. VAT</SectionHeading>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KpiCard
                label="Income"
                value={fmtEur(incomeGross)}
                sub={`${income.length} invoice${income.length !== 1 ? 's' : ''}`}
                accent="green"
              />
              <KpiCard
                label="Expenses"
                value={fmtEur(expensesGross)}
                sub={`${expenses.length} invoice${expenses.length !== 1 ? 's' : ''}`}
                accent="red"
              />
              <KpiCard
                label="Net Profit"
                value={fmtEur(netProfitGross)}
                accent={netProfitGross >= 0 ? 'blue' : 'red'}
              />
              <KpiCard
                label="Occupancy"
                value={occupancyPct !== null ? fmtPct(occupancyPct) : '—'}
                sub={occupancyPct !== null ? `${totalNights} / ${availableNights} nights` : filterYear === 'all' ? 'Select a year' : 'No properties'}
                accent="purple"
              />
            </div>
          </div>

          {/* Row 2 — Net (excl. VAT) */}
          <div>
            <SectionHeading>Net — excl. VAT</SectionHeading>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <KpiCard
                label="Income Net"
                value={fmtEur(incomeNet)}
                sub={fmtEur(income.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0))}
                subLabel="VAT:"
                accent="green"
              />
              <KpiCard
                label="Expenses Net"
                value={fmtEur(expensesNet)}
                sub={fmtEur(expenses.reduce((s, i) => s + (i.cr9b5_taxamount ?? 0), 0))}
                subLabel="VAT:"
                accent="red"
              />
              <KpiCard
                label="Net Profit"
                value={fmtEur(netProfitNet)}
                sub={fmtEur(vatComponent)}
                subLabel="VAT total:"
                accent={netProfitNet >= 0 ? 'blue' : 'red'}
              />
            </div>
          </div>

          {/* Chart 1 — Monthly breakdown */}
          <div>
            <SectionHeading>
              {filterYear !== 'all' ? `Monthly Breakdown — ${filterYear}` : 'Monthly Breakdown — select a year'}
            </SectionHeading>
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

          {/* Chart 2 — Year-on-year */}
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
                    <Line dataKey="income"   name="Income"   stroke={COLOR_INCOME}  strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line dataKey="expenses" name="Expenses" stroke={COLOR_EXPENSE} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line dataKey="profit"   name="Net Profit" stroke={COLOR_PROFIT} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
