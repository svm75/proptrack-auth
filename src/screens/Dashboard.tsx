import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import CalendarScreen from './Calendar'
import CategoryPnL from './CategoryPnL'
import CategoryTrend from './CategoryTrend'
import ExpenseBreakdown from './ExpenseBreakdown'
import IncomevsForecast from './IncomevsForecast'
import { fmtEur, fmtEurShort } from '../utils/formatters'

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

function fmtPct(n: number): string { return `${n.toFixed(1)} %` }

function getQuarter(inv: Cr9b5_pt_invoices): number {
  if (!inv.cr9b5_date) return 0
  return Math.floor(new Date(inv.cr9b5_date).getMonth() / 3) + 1
}

// ---------- shared types ----------

interface SharedProps {
  invoices: Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
}

// ---------- print ----------

function handlePrint(screenName: string) {
  const slug = screenName.toLowerCase().replace(/\s+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  const prev = document.title
  document.title = `proptrack-${slug}-${date}`
  document.body.classList.add('dashboard-print-mode')
  window.print()
  setTimeout(() => {
    document.title = prev
    document.body.classList.remove('dashboard-print-mode')
  }, 500)
}

const PRINT_CSS = `
@media print {
  body.dashboard-print-mode * { visibility: hidden !important; }
  body.dashboard-print-mode .dashboard-print-content,
  body.dashboard-print-mode .dashboard-print-content * { visibility: visible !important; }
  body.dashboard-print-mode .dashboard-print-content {
    position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 9999;
  }
  body.dashboard-print-mode .no-print { display: none !important; }
}
`

// ---------- shared small components ----------

interface KpiCardProps {
  label: string; value: string; sub?: string; subLabel?: string
  accent?: 'green' | 'red' | 'blue' | 'purple' | 'gray'
}

function KpiCard({ label, value, sub, subLabel, accent = 'blue' }: KpiCardProps) {
  const bar: Record<string, string> = { green:'bg-green-500', red:'bg-red-400', blue:'bg-indigo-500', purple:'bg-purple-500', gray:'bg-gray-400' }
  const val: Record<string, string> = { green:'text-green-700', red:'text-red-600', blue:'text-indigo-700', purple:'text-purple-700', gray:'text-gray-600' }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-1 relative overflow-hidden">
      <div className={['absolute top-0 left-0 right-0 h-1', bar[accent]].join(' ')} />
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={['text-2xl font-bold tabular-nums', val[accent]].join(' ')}>{value}</span>
      {sub && <span className="text-xs text-gray-400 tabular-nums">{subLabel && <span className="font-medium text-gray-500">{subLabel} </span>}{sub}</span>}
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

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map(p => <p key={p.name} style={{color:p.color}} className="tabular-nums">{p.name}: {fmtEur(p.value)}</p>)}
    </div>
  )
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 items-center flex-wrap mb-6">{children}</div>
}

function YearSelect({ value, years, onChange, allowAll = true }: { value: number|'all'; years: number[]; onChange:(v:number|'all')=>void; allowAll?: boolean }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
      {allowAll && <option value="all">All years</option>}
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  )
}

function PropSelect({ value, properties, onChange }: { value: string; properties: Cr9b5_pt_properties[]; onChange:(v:string)=>void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
      <option value="">All properties</option>
      {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
    </select>
  )
}

// ============================================================
// OVERVIEW TAB
// ============================================================

function DashboardOverview({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear,   setFilterYear]   = useState<number|'all'>(currentYear)
  const [filterPropId, setFilterPropId] = useState('')

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a,b) => b-a)
  }, [invoices])

  const propFiltered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (filterPropId) {
      const raw = inv as unknown as Record<string,unknown>
      if (!raw['cr9b5_allproperties'] && raw['_cr9b5_property_value'] !== filterPropId) return false
    }
    return true
  }), [invoices, filterPropId])

  const filtered = useMemo(() =>
    filterYear === 'all' ? propFiltered : propFiltered.filter(i => i.cr9b5_year === filterYear)
  , [propFiltered, filterYear])

  const income   = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING), [filtered])
  const expenses = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING), [filtered])

  const incomeGross    = income.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
  const expensesGross  = expenses.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
  const netProfitGross = incomeGross - expensesGross
  const incomeNet      = income.reduce((s,i) => s+(i.cr9b5_baseamount??0), 0)
  const expensesNet    = expenses.reduce((s,i) => s+(i.cr9b5_baseamount??0), 0)
  const netProfitNet   = incomeNet - expensesNet
  const vatComponent   = income.reduce((s,i) => s+(i.cr9b5_taxamount??0),0) + expenses.reduce((s,i) => s+(i.cr9b5_taxamount??0),0)
  const totalNights    = income.reduce((s,i) => s+(i.cr9b5_nights??0), 0)
  const propCount      = filterPropId ? 1 : properties.length
  const availableNights = filterYear !== 'all' && propCount > 0 ? daysInYear(filterYear as number) * propCount : null
  const occupancyPct   = availableNights ? (totalNights / availableNights) * 100 : null

  const monthlyData = useMemo(() => MONTH_LABELS.map((month, idx) => {
    const inv = filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth() === idx)
    return {
      month,
      income:   inv.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0),
      expenses: inv.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0),
    }
  }), [filtered])

  const yearlyData = useMemo(() => {
    const byYear: Record<number,{income:number;expenses:number}> = {}
    propFiltered.forEach(inv => {
      const y = inv.cr9b5_year; if (!y) return
      if (!byYear[y]) byYear[y] = {income:0,expenses:0}
      if ((inv.cr9b5_type as unknown as number) === TYPE_OUTGOING) byYear[y].income += inv.cr9b5_totalgross??0
      else byYear[y].expenses += inv.cr9b5_totalgross??0
    })
    return Object.entries(byYear).sort(([a],[b])=>Number(a)-Number(b))
      .map(([year,{income,expenses}]) => ({year, income, expenses, profit:income-expenses}))
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
          <KpiCard label="Income"     value={fmtEur(incomeGross)}   sub={`${income.length} invoice${income.length!==1?'s':''}`} accent="green" />
          <KpiCard label="Expenses"   value={fmtEur(expensesGross)} sub={`${expenses.length} invoice${expenses.length!==1?'s':''}`} accent="red" />
          <KpiCard label="Net Profit" value={fmtEur(netProfitGross)} accent={netProfitGross>=0?'blue':'red'} />
          <KpiCard label="Occupancy"  value={occupancyPct!==null?fmtPct(occupancyPct):'—'}
            sub={occupancyPct!==null?`${totalNights} / ${availableNights} nights`:filterYear==='all'?'Select a year':'No properties'} accent="purple" />
        </div>
      </div>
      <div>
        <SectionHeading>Net — excl. VAT</SectionHeading>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Income Net"   value={fmtEur(incomeNet)}   sub={fmtEur(income.reduce((s,i)=>s+(i.cr9b5_taxamount??0),0))}   subLabel="VAT:" accent="green" />
          <KpiCard label="Expenses Net" value={fmtEur(expensesNet)} sub={fmtEur(expenses.reduce((s,i)=>s+(i.cr9b5_taxamount??0),0))} subLabel="VAT:" accent="red" />
          <KpiCard label="Net Profit"   value={fmtEur(netProfitNet)} sub={fmtEur(vatComponent)} subLabel="VAT total:" accent={netProfitNet>=0?'blue':'red'} />
        </div>
      </div>
      <div>
        <SectionHeading>{filterYear!=='all'?`Monthly Breakdown — ${filterYear}`:'Monthly Breakdown — select a year'}</SectionHeading>
        {filterYear==='all' ? <p className="text-sm text-gray-400">Select a year to see the monthly breakdown.</p> : (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtEurShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{fontSize:12,paddingTop:12}} />
                <Bar dataKey="income"   name="Income"   fill={COLOR_INCOME}  radius={[4,4,0,0]} maxBarSize={36} />
                <Bar dataKey="expenses" name="Expenses" fill={COLOR_EXPENSE} radius={[4,4,0,0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div>
        <SectionHeading>Year-on-Year</SectionHeading>
        {yearlyData.length<1 ? <p className="text-sm text-gray-400">No data.</p> : (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={yearlyData} margin={{top:4,right:8,left:8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="year" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtEurShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{fontSize:12,paddingTop:12}} />
                <Line dataKey="income"   name="Income"     stroke={COLOR_INCOME}  strokeWidth={2} dot={{r:4}} />
                <Line dataKey="expenses" name="Expenses"   stroke={COLOR_EXPENSE} strokeWidth={2} dot={{r:4}} />
                <Line dataKey="profit"   name="Net Profit" stroke={COLOR_PROFIT}  strokeWidth={2} dot={{r:4}} strokeDasharray="5 3" />
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

function StatRow({ label, value, sub, accent }: { label:string; value:string; sub?:string; accent?:'green'|'red'|'blue'|'purple' }) {
  const colors: Record<string,string> = { green:'text-green-700', red:'text-red-600', blue:'text-indigo-700', purple:'text-purple-700' }
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</div>
      <div className={['font-bold tabular-nums text-sm', accent?colors[accent]:'text-gray-800'].join(' ')}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 tabular-nums">{sub}</div>}
    </div>
  )
}

function DashboardComparison({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number|'all'>(currentYear)
  const years = useMemo(() => {
    const s = new Set<number>(); invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a,b) => b-a)
  }, [invoices])

  const propStats = useMemo(() => properties.map((prop, idx) => {
    const propInv = invoices.filter(inv => {
      if (!isActive(inv)) return false
      if (filterYear !== 'all' && inv.cr9b5_year !== filterYear) return false
      return (inv as unknown as Record<string,unknown>)['_cr9b5_property_value'] === prop.cr9b5_pt_propertyid
    })
    const out = propInv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING)
    const inc = propInv.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING)
    const income   = out.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
    const expenses = inc.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
    const nights   = out.reduce((s,i) => s+(i.cr9b5_nights??0), 0)
    const avail    = filterYear!=='all' ? daysInYear(filterYear as number) : 365
    const nightsByMonth = Array(12).fill(0)
    out.forEach(inv => { if (inv.cr9b5_checkin) nightsByMonth[new Date(inv.cr9b5_checkin).getMonth()] += (inv.cr9b5_nights??0) })
    const maxN = Math.max(...nightsByMonth)
    return {
      prop, color: PROPERTY_COLORS[idx % PROPERTY_COLORS.length],
      income, expenses, profit: income-expenses,
      occupancyPct: avail>0 ? (nights/avail)*100 : 0,
      avgNightlyRate: nights>0 ? income/nights : 0,
      avgStayLength: out.length>0 ? nights/out.length : 0,
      busiestMonth: maxN>0 ? MONTH_FULL[nightsByMonth.indexOf(maxN)] : '—',
      nights, stayCount: out.length,
    }
  }), [invoices, properties, filterYear])

  return (
    <div className="space-y-6">
      <FilterRow><YearSelect value={filterYear} years={years} onChange={setFilterYear} /></FilterRow>
      {properties.length===0 && <p className="text-sm text-gray-400">No properties found.</p>}
      <div className={`grid gap-5 ${properties.length>1?'grid-cols-1 md:grid-cols-2':'grid-cols-1 max-w-sm'}`}>
        {propStats.map(s => (
          <div key={s.prop.cr9b5_pt_propertyid} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="h-1.5" style={{backgroundColor:s.color}} />
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor:s.color}} />
                <h3 className="font-semibold text-gray-900 text-base truncate">{s.prop.cr9b5_name}</h3>
                {s.prop.cr9b5_shortid && <span className="text-xs text-gray-400 shrink-0">({s.prop.cr9b5_shortid})</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <StatRow label="Income (gross)"   value={fmtEur(s.income)}   accent="green" />
                <StatRow label="Expenses (gross)" value={fmtEur(s.expenses)} accent="red" />
                <StatRow label="Net Profit"       value={fmtEur(s.profit)}   accent={s.profit>=0?'blue':'red'} />
                <StatRow label="Occupancy"        value={fmtPct(s.occupancyPct)} sub={`${s.nights} nights`} accent="purple" />
                <StatRow label="Avg Nightly Rate" value={s.nights>0?fmtEur(s.avgNightlyRate):'—'} />
                <StatRow label="Avg Stay Length"  value={s.stayCount>0?`${s.avgStayLength.toFixed(1)} nights`:'—'} sub={`${s.stayCount} stays`} />
                <div className="col-span-2"><StatRow label="Busiest Month" value={s.busiestMonth} /></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// OCCUPANCY HEATMAP TAB  (all years stacked, compact cells)
// ============================================================

function blendHex(colors: string[]): string {
  if (colors.length===1) return colors[0]
  const r = colors.map(c=>({r:parseInt(c.slice(1,3),16),g:parseInt(c.slice(3,5),16),b:parseInt(c.slice(5,7),16)}))
  const a = {r:Math.round(r.reduce((s,c)=>s+c.r,0)/r.length),g:Math.round(r.reduce((s,c)=>s+c.g,0)/r.length),b:Math.round(r.reduce((s,c)=>s+c.b,0)/r.length)}
  return `#${a.r.toString(16).padStart(2,'0')}${a.g.toString(16).padStart(2,'0')}${a.b.toString(16).padStart(2,'0')}`
}

interface HeatTooltip { x: number; y: number; lines: string[] }

function YearHeatmap({ year, occupiedMap, colorMap }: {
  year: number
  occupiedMap: Record<string, {propId:string;propName:string;contactName:string}[]>
  colorMap: Record<string, string>
}) {
  const [tooltip, setTooltip] = useState<HeatTooltip|null>(null)
  const totalOccupied = useMemo(() => {
    return Object.keys(occupiedMap).filter(k => k.startsWith(`${year}-`)).length
  }, [occupiedMap, year])

  function getCellColor(month: number, day: number): string {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const entries = occupiedMap[key]
    if (!entries?.length) return '#e5e7eb'
    const colors = [...new Set(entries.map(e => colorMap[e.propId] ?? '#6b7280'))]
    return blendHex(colors)
  }

  function getCellTip(month: number, day: number): string[] | null {
    const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const entries = occupiedMap[key]
    if (!entries?.length) return null
    const lines = [`${day} ${MONTH_FULL[month]} ${year}`]
    const seen = new Set<string>()
    entries.forEach(e => {
      const s = e.contactName ? `${e.propName} — ${e.contactName}` : e.propName
      if (!seen.has(s)) { seen.add(s); lines.push(s) }
    })
    return lines
  }

  const MONTH_1 = ['J','F','M','A','M','J','J','A','S','O','N','D']

  return (
    <div className="relative">
      {tooltip && (
        <div style={{position:'fixed',left:tooltip.x+14,top:tooltip.y-8,zIndex:9999}}
          className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-xl pointer-events-none">
          {tooltip.lines.map((l,i) => <div key={i} className={i===0?'font-semibold mb-0.5':'text-gray-300'}>{l}</div>)}
        </div>
      )}

      <div className="flex items-center gap-4 mb-2">
        <span className="text-sm font-semibold text-gray-700 w-10 shrink-0">{year}</span>
        <span className="text-xs text-gray-400 tabular-nums">{totalOccupied} / {daysInYear(year)} days occupied</span>
      </div>

      {/* 12-month grid with compact cells */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(12, auto)',gap:'6px'}}>
        {Array.from({length:12}, (_,month) => {
          const dim = daysInMonth(year, month)
          return (
            <div key={month} className="flex flex-col" style={{gap:'1px'}}>
              <div className="text-[9px] font-semibold text-gray-400 text-center mb-[2px]">{MONTH_1[month]}</div>
              {Array.from({length:31}, (_,di) => {
                const day = di+1
                if (day>dim) return <div key={day} style={{width:12,height:12}} />
                const tipLines = getCellTip(month, day)
                return (
                  <div key={day}
                    style={{width:12,height:12,borderRadius:2,backgroundColor:getCellColor(month,day),cursor:tipLines?'default':'default'}}
                    onMouseEnter={e => { if(tipLines) setTooltip({x:e.clientX,y:e.clientY,lines:tipLines}) }}
                    onMouseMove={e => { if(tipLines) setTooltip(t => t?{...t,x:e.clientX,y:e.clientY}:null) }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DashboardHeatmap({ invoices, properties }: SharedProps) {
  const currentYear = new Date().getFullYear()
  const [filterYear,   setFilterYear]   = useState<number|'all'>('all')
  const [filterPropId, setFilterPropId] = useState('')

  const years = useMemo(() => {
    const s = new Set<number>(); invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a,b) => b-a)
    return arr.length ? arr : [currentYear]
  }, [invoices, currentYear])

  const visibleYears = filterYear==='all' ? years : [filterYear as number]

  const colorMap = useMemo(() => {
    const map: Record<string,string> = {}
    properties.forEach((p,i) => { map[p.cr9b5_pt_propertyid] = PROPERTY_COLORS[i % PROPERTY_COLORS.length] })
    return map
  }, [properties])

  // Build full occupied map (all years)
  const occupiedMap = useMemo(() => {
    const map: Record<string, {propId:string;propName:string;contactName:string}[]> = {}
    invoices.forEach(inv => {
      if (!isActive(inv)) return
      if ((inv.cr9b5_type as unknown as number) !== TYPE_OUTGOING) return
      if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) return
      const propId = (inv as unknown as Record<string,unknown>)['_cr9b5_property_value'] as string
      if (filterPropId && propId !== filterPropId) return
      const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
      const checkin  = new Date(inv.cr9b5_checkin)
      const checkout = new Date(inv.cr9b5_checkout)
      const cur = new Date(checkin)
      while (cur < checkout) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
        if (!map[key]) map[key] = []
        map[key].push({
          propId,
          propName: prop?.cr9b5_name ?? 'Unknown',
          contactName: (inv as unknown as Record<string,unknown>)['cr9b5_contactname'] as string ?? '',
        })
        cur.setDate(cur.getDate()+1)
      }
    })
    return map
  }, [invoices, properties, filterPropId])

  return (
    <div className="space-y-6">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>

      {!filterPropId && properties.length>1 && (
        <div className="flex flex-wrap gap-4 mb-2">
          {properties.map((p,i) => (
            <div key={p.cr9b5_pt_propertyid} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{backgroundColor:PROPERTY_COLORS[i%PROPERTY_COLORS.length]}} />
              {p.cr9b5_name}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-6">
        {visibleYears.map(year => (
          <YearHeatmap key={year} year={year} occupiedMap={occupiedMap} colorMap={colorMap} />
        ))}
        {visibleYears.length===0 && <p className="text-sm text-gray-400">No data.</p>}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
          <span>Empty</span>
          <div className="w-3 h-3 rounded-[2px]" style={{backgroundColor:'#e5e7eb'}} />
          <span className="mx-2">→ Occupied</span>
          {!filterPropId && properties.map((p,i) => (
            <div key={p.cr9b5_pt_propertyid} className="w-3 h-3 rounded-[2px] ml-1" style={{backgroundColor:PROPERTY_COLORS[i%PROPERTY_COLORS.length]}} />
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
  const [filterYear,   setFilterYear]   = useState<number|'all'>(currentYear)
  const [filterPropId, setFilterPropId] = useState('')

  const years = useMemo(() => {
    const s = new Set<number>(); invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    return Array.from(s).sort((a,b) => b-a)
  }, [invoices])

  const filtered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (filterYear!=='all' && inv.cr9b5_year !== filterYear) return false
    if (filterPropId) {
      const raw = inv as unknown as Record<string,unknown>
      if (!raw['cr9b5_allproperties'] && raw['_cr9b5_property_value'] !== filterPropId) return false
    }
    return true
  }), [invoices, filterYear, filterPropId])

  const monthlyData = useMemo(() => {
    if (filterYear==='all') return []
    let cum = 0
    return MONTH_LABELS.map((month, idx) => {
      const inv = filtered.filter(i => i.cr9b5_date && new Date(i.cr9b5_date).getMonth()===idx)
      const income   = inv.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0)
      const expenses = inv.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0)
      cum += income - expenses
      return { month, income, expenses, cumulative: cum }
    })
  }, [filtered, filterYear])

  const totalIncome   = filtered.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0)
  const totalExpenses = filtered.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING).reduce((s,i)=>s+(i.cr9b5_totalgross??0),0)
  const closing = totalIncome - totalExpenses
  const highIncome  = monthlyData.length ? Math.max(...monthlyData.map(m=>m.income))   : 0
  const highExpense = monthlyData.length ? Math.max(...monthlyData.map(m=>m.expenses)) : 0

  return (
    <div className="space-y-6">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Opening Balance"        value="€ 0"              sub="Start of period" accent="gray" />
        <KpiCard label="Closing Balance"         value={fmtEur(closing)} accent={closing>=0?'blue':'red'} />
        <KpiCard label="Highest Month — Income"  value={fmtEur(highIncome)}  accent="green" />
        <KpiCard label="Highest Month — Expense" value={fmtEur(highExpense)} accent="red" />
      </div>
      {filterYear==='all' ? <p className="text-sm text-gray-400">Select a year to see the cash flow timeline.</p> : (
        <>
          <div>
            <SectionHeading>{`Cumulative Net Cash Flow — ${filterYear}`}</SectionHeading>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtEurShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <Line dataKey="cumulative" name="Cumulative Net" stroke={COLOR_PROFIT} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <SectionHeading>{`Monthly Income vs Expenses — ${filterYear}`}</SectionHeading>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtEurShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{fontSize:12,paddingTop:12}} />
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
// TAX SUMMARY TAB
// ============================================================

function TaxTable({ title, rows, totalRow }: {
  title: string
  rows: { label:string; q1:number; q2:number; q3:number; q4:number; total:number }[]
  totalRow?: { label:string; q1:number; q2:number; q3:number; q4:number; total:number }
}) {
  const cols = ['Q1','Q2','Q3','Q4','Annual']
  const fmt = (n: number) => fmtEur(n)
  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period / Name</th>
              {cols.map(c => <th key={c} className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-700">{r.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.q1)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.q2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.q3)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmt(r.q4)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmt(r.total)}</td>
              </tr>
            ))}
            {totalRow && (
              <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                <td className="px-4 py-2.5 text-gray-800">{totalRow.label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalRow.q1)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalRow.q2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalRow.q3)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalRow.q4)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-indigo-700">{fmt(totalRow.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DashboardTax({ invoices, contacts }: { invoices: Cr9b5_pt_invoices[]; contacts: Cr9b5_pt_contacts[] }) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState(currentYear)

  const contactById = useMemo(() => {
    const map: Record<string, string> = {}
    contacts.forEach(c => { map[c.cr9b5_pt_contactid] = c.cr9b5_name })
    return map
  }, [contacts])

  const years = useMemo(() => {
    const s = new Set<number>(); invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a,b) => b-a)
    return arr.length ? arr : [currentYear]
  }, [invoices, currentYear])

  const yearInvoices = useMemo(() =>
    invoices.filter(inv => isActive(inv) && inv.cr9b5_year === filterYear)
  , [invoices, filterYear])

  // Helper: group invoices by contact name, get quarterly net
  function buildContactTable(type: number, threshold: number) {
    const grouped: Record<string, {q1:number;q2:number;q3:number;q4:number}> = {}
    yearInvoices.filter(i => (i.cr9b5_type as unknown as number)===type).forEach(inv => {
      const contactId = (inv as unknown as Record<string,unknown>)['_cr9b5_contact_value'] as string | undefined
      const name = (contactId && contactById[contactId]) || 'Unknown'
      if (!grouped[name]) grouped[name] = {q1:0,q2:0,q3:0,q4:0}
      const q = getQuarter(inv)
      if (q>=1 && q<=4) grouped[name][`q${q}` as 'q1'|'q2'|'q3'|'q4'] += (inv.cr9b5_baseamount??0)
    })
    return Object.entries(grouped)
      .map(([label,v]) => ({ label, q1:v.q1, q2:v.q2, q3:v.q3, q4:v.q4, total:v.q1+v.q2+v.q3+v.q4 }))
      .filter(r => r.total >= threshold)
      .sort((a,b) => b.total-a.total)
  }

  const supplierRows = useMemo(() => buildContactTable(TYPE_INCOMING, 3000), [yearInvoices, contactById])
  const clientRows   = useMemo(() => buildContactTable(TYPE_OUTGOING, 3000), [yearInvoices, contactById])

  return (
    <div className="space-y-8">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={v => setFilterYear(v as number)} allowAll={false} />
      </FilterRow>

      {/* VAT table — custom column headers */}
      <div>
        <SectionHeading>VAT per Quarter</SectionHeading>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Quarter</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-green-600 uppercase tracking-wide">VAT Collected</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wide">VAT Paid</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-indigo-600 uppercase tracking-wide">Net VAT</th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4].map(q => {
                const collected = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING&&getQuarter(i)===q).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const paid      = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING&&getQuarter(i)===q).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const net = collected - paid
                return (
                  <tr key={q} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">Q{q}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{fmtEur(collected)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmtEur(paid)}</td>
                    <td className={['px-4 py-2.5 text-right tabular-nums font-semibold', net>=0?'text-indigo-700':'text-red-600'].join(' ')}>{fmtEur(net)}</td>
                  </tr>
                )
              })}
              {(() => {
                const tc = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const tp = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const tn = tc-tp
                return (
                  <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                    <td className="px-4 py-2.5 text-gray-800">Annual Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{fmtEur(tc)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmtEur(tp)}</td>
                    <td className={['px-4 py-2.5 text-right tabular-nums', tn>=0?'text-indigo-700':'text-red-600'].join(' ')}>{fmtEur(tn)}</td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <TaxTable
        title={`Suppliers over € 3,000 net — ${filterYear}`}
        rows={supplierRows.length ? supplierRows : [{label:'No suppliers above threshold',q1:0,q2:0,q3:0,q4:0,total:0}]}
      />

      <TaxTable
        title={`Clients over € 3,000 net — ${filterYear}`}
        rows={clientRows.length ? clientRows : [{label:'No clients above threshold',q1:0,q2:0,q3:0,q4:0,total:0}]}
      />
    </div>
  )
}

// ============================================================
// EXPENSE SUNBURST TAB
// ============================================================

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle - Math.PI / 2), y: cy + r * Math.sin(angle - Math.PI / 2) }
}

function arcPath(cx: number, cy: number, r0: number, r1: number, startAngle: number, endAngle: number): string {
  const gap = 0.012
  const s = startAngle + gap / 2
  const e = endAngle - gap / 2
  if (e <= s) return ''
  const p0s = polarToCartesian(cx, cy, r0, s)
  const p0e = polarToCartesian(cx, cy, r0, e)
  const p1s = polarToCartesian(cx, cy, r1, s)
  const p1e = polarToCartesian(cx, cy, r1, e)
  const large = e - s > Math.PI ? 1 : 0
  return [
    `M ${p1s.x.toFixed(2)} ${p1s.y.toFixed(2)}`,
    `A ${r1} ${r1} 0 ${large} 1 ${p1e.x.toFixed(2)} ${p1e.y.toFixed(2)}`,
    `L ${p0e.x.toFixed(2)} ${p0e.y.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${p0s.x.toFixed(2)} ${p0s.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`
}

interface SbSegment { path: string; color: string; label: string; value: number; depth: number }

function DashboardExpenseSunburst({ invoices, properties, contacts, references }: SharedProps & { contacts: Cr9b5_pt_contacts[]; references: Cr9b5_pt_references[] }) {
  const currentYear = new Date().getFullYear()
  const [filterYear, setFilterYear] = useState<number>(currentYear)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number; pct: number } | null>(null)

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [currentYear]
  }, [invoices, currentYear])

  const contactById = useMemo(() => {
    const m: Record<string, string> = {}
    contacts.forEach(c => { m[c.cr9b5_pt_contactid] = c.cr9b5_name })
    return m
  }, [contacts])

  const propById = useMemo(() => {
    const m: Record<string, string> = {}
    properties.forEach(p => { m[p.cr9b5_pt_propertyid] = p.cr9b5_name })
    return m
  }, [properties])

  const catNameById = useMemo(() => {
    const m: Record<string, string> = {}
    references.forEach(ref => {
      if (ref.cr9b5_pt_referenceid && ref.cr9b5_value) m[ref.cr9b5_pt_referenceid] = ref.cr9b5_value
    })
    return m
  }, [references])

  // Build hierarchy: property → category → contact
  const hierarchy = useMemo(() => {
    const expenses = invoices.filter(inv =>
      isActive(inv) &&
      (inv.cr9b5_type as unknown as number) === TYPE_INCOMING &&
      inv.cr9b5_year === filterYear
    )

    type ContactMap = Map<string, number>
    type CatMap = Map<string, { value: number; contacts: ContactMap }>
    type PropMap = Map<string, { value: number; cats: CatMap }>

    const propMap: PropMap = new Map()

    expenses.forEach(inv => {
      const raw = inv as unknown as Record<string, unknown>
      const propId  = (raw['_cr9b5_property_value'] as string) ?? '__none__'
      const catId   = (raw['_cr9b5_categoryid_value'] as string) ?? '__none__'
      const ctId    = (raw['_cr9b5_contact_value'] as string) ?? '__none__'
      const amount  = (inv.cr9b5_totalgross ?? 0)

      if (!propMap.has(propId)) propMap.set(propId, { value: 0, cats: new Map() })
      const propEntry = propMap.get(propId)!
      propEntry.value += amount

      if (!propEntry.cats.has(catId)) propEntry.cats.set(catId, { value: 0, contacts: new Map() })
      const catEntry = propEntry.cats.get(catId)!
      catEntry.value += amount

      catEntry.contacts.set(ctId, (catEntry.contacts.get(ctId) ?? 0) + amount)
    })

    return propMap
  }, [invoices, filterYear])

  const total = useMemo(() => {
    let t = 0
    hierarchy.forEach(p => { t += p.value })
    return t
  }, [hierarchy])

  const segments = useMemo<SbSegment[]>(() => {
    if (total === 0) return []
    const cx = 300, cy = 300
    const R = [
      { r0: 60,  r1: 140 },  // ring 1: property
      { r0: 148, r1: 210 },  // ring 2: category
      { r0: 218, r1: 275 },  // ring 3: contact
    ]
    const segs: SbSegment[] = []
    const TWO_PI = 2 * Math.PI
    let propAngleStart = 0

    const propEntries = Array.from(hierarchy.entries()).sort((a, b) => b[1].value - a[1].value)

    propEntries.forEach(([propId, propEntry], propIdx) => {
      const propAngleEnd = propAngleStart + (propEntry.value / total) * TWO_PI
      const propColor = PROPERTY_COLORS[propIdx % PROPERTY_COLORS.length]
      const propName = propId === '__none__' ? 'No Property' : (propById[propId] ?? propId)

      segs.push({
        path: arcPath(cx, cy, R[0].r0, R[0].r1, propAngleStart, propAngleEnd),
        color: propColor,
        label: propName,
        value: propEntry.value,
        depth: 0,
      })

      const catEntries = Array.from(propEntry.cats.entries()).sort((a, b) => b[1].value - a[1].value)
      let catAngleStart = propAngleStart
      catEntries.forEach(([catId, catEntry], catIdx) => {
        const catAngleEnd = catAngleStart + (catEntry.value / propEntry.value) * (propAngleEnd - propAngleStart)
        const catColor = lighten(propColor, 0.35 + (catIdx % 3) * 0.1)
        const catName = catId === '__none__' ? 'Uncategorized' : (catNameById[catId] ?? catId)

        segs.push({
          path: arcPath(cx, cy, R[1].r0, R[1].r1, catAngleStart, catAngleEnd),
          color: catColor,
          label: catName,
          value: catEntry.value,
          depth: 1,
        })

        const ctEntries = Array.from(catEntry.contacts.entries()).sort((a, b) => b[1] - a[1])
        let ctAngleStart = catAngleStart
        ctEntries.forEach(([ctId, ctValue], ctIdx) => {
          const ctAngleEnd = ctAngleStart + (ctValue / catEntry.value) * (catAngleEnd - catAngleStart)
          const ctColor = lighten(propColor, 0.55 + (ctIdx % 3) * 0.08)
          const ctName = ctId === '__none__' ? 'No Contact' : (contactById[ctId] ?? ctId)

          segs.push({
            path: arcPath(cx, cy, R[2].r0, R[2].r1, ctAngleStart, ctAngleEnd),
            color: ctColor,
            label: ctName,
            value: ctValue,
            depth: 2,
          })
          ctAngleStart = ctAngleEnd
        })

        catAngleStart = catAngleEnd
      })

      propAngleStart = propAngleEnd
    })

    return segs
  }, [hierarchy, total, propById, contactById, catNameById])

  const RING_LABELS = ['Property', 'Category', 'Contact']

  return (
    <div className="space-y-6">
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={v => setFilterYear(v as number)} allowAll={false} />
      </FilterRow>

      {total === 0 ? (
        <p className="text-sm text-gray-400">No expense data for {filterYear}.</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="bg-white border border-gray-200 rounded-xl p-4 relative">
            {tooltip && (
              <div
                style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 8, zIndex: 9999 }}
                className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none"
              >
                <div className="font-semibold mb-0.5">{tooltip.label}</div>
                <div className="tabular-nums">{fmtEur(tooltip.value)}</div>
                <div className="text-gray-300 tabular-nums">{tooltip.pct.toFixed(1)} % of total</div>
              </div>
            )}
            <svg width={600} height={600} viewBox="0 0 600 600">
              {/* center label */}
              <text x={300} y={294} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight={600}>Expenses</text>
              <text x={300} y={312} textAnchor="middle" fontSize={12} fill="#9ca3af" className="tabular-nums">{fmtEur(total)}</text>

              {segments.map((seg, i) => (
                <path
                  key={i}
                  d={seg.path}
                  fill={seg.color}
                  stroke="white"
                  strokeWidth={1}
                  style={{ cursor: 'pointer', transition: 'opacity 0.1s' }}
                  onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, label: seg.label, value: seg.value, pct: (seg.value / total) * 100 })}
                  onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}

              {/* ring labels */}
              {[{ r: 100, label: 'Property' }, { r: 179, label: 'Category' }, { r: 246, label: 'Contact' }].map(({ r, label }) => (
                <text key={label} x={300} y={300 - r} textAnchor="middle" fontSize={9} fill="#9ca3af" dy={-3}>{label}</text>
              ))}
            </svg>
          </div>

          {/* Legend: top-level properties */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 min-w-[220px]">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Properties</div>
            <div className="space-y-2">
              {Array.from(hierarchy.entries())
                .sort((a, b) => b[1].value - a[1].value)
                .map(([propId, propEntry], idx) => {
                  const name = propId === '__none__' ? 'No Property' : (propById[propId] ?? propId)
                  const color = PROPERTY_COLORS[idx % PROPERTY_COLORS.length]
                  return (
                    <div key={propId} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-gray-700 truncate flex-1">{name}</span>
                      <span className="tabular-nums text-gray-500 text-xs">{fmtEur(propEntry.value)}</span>
                    </div>
                  )
                })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Ring guide</div>
              {RING_LABELS.map((l, i) => (
                <div key={l} className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className="w-4 h-2 rounded-sm bg-gray-300 shrink-0" style={{ opacity: 0.4 + i * 0.2 }} />
                  {i + 1}. {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// MAIN DASHBOARD — tab shell
// ============================================================

type DashTab = 'overview' | 'comparison' | 'heatmap' | 'cashflow' | 'tax' | 'calendar' | 'cat-pnl' | 'cat-trend' | 'expense-breakdown' | 'income-vs-forecast' | 'expense-sunburst'

const TABS: { id: DashTab; label: string; printName: string }[] = [
  { id: 'overview',            label: 'Overview',            printName: 'overview' },
  { id: 'comparison',          label: 'Property Comparison', printName: 'property-comparison' },
  { id: 'heatmap',             label: 'Occupancy Heatmap',   printName: 'occupancy-heatmap' },
  { id: 'cashflow',            label: 'Cash Flow',            printName: 'cash-flow' },
  { id: 'tax',                 label: 'Tax Summary',          printName: 'tax-summary' },
  { id: 'calendar',            label: 'Calendar',             printName: 'calendar' },
  { id: 'cat-pnl',             label: 'Category P&L',         printName: 'category-pnl' },
  { id: 'cat-trend',           label: 'Category Trend',       printName: 'category-trend' },
  { id: 'expense-breakdown',   label: 'Expense Breakdown',    printName: 'expense-breakdown' },
  { id: 'income-vs-forecast',  label: 'Income vs Forecast',   printName: 'income-vs-forecast' },
  { id: 'expense-sunburst',    label: 'Expense Sunburst',     printName: 'expense-sunburst' },
]

export default function Dashboard() {
  const [invoices,   setInvoices]   = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts,   setContacts]   = useState<Cr9b5_pt_contacts[]>([])
  const [references, setReferences] = useState<Cr9b5_pt_references[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<DashTab>('overview')

  // Inject print CSS once
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'dashboard-print-style'
    el.textContent = PRINT_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [invRes, propRes, conRes, refRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date desc'], maxPageSize: 5000 }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ select: ['cr9b5_pt_contactid', 'cr9b5_name'], maxPageSize: 5000 }),
        Cr9b5_pt_referencesService.getAll({ select: ['cr9b5_pt_referenceid', 'cr9b5_value', 'cr9b5_referencetype'], maxPageSize: 5000 }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setContacts(conRes.data ?? [])
      setReferences(refRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const activeTab = TABS.find(t => t.id === tab)!

  return (
    <div className={tab === 'calendar' ? 'flex flex-col h-full' : 'p-6 max-w-[83rem]'}>
      {/* Header row */}
      <div className={['flex flex-wrap items-start justify-between gap-4', tab==='calendar'?'px-6 pt-6 pb-0 shrink-0':'mb-6'].join(' ')}>
        <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={['px-3 py-1.5 rounded-md text-sm font-medium transition-colors', tab===t.id?'bg-white text-indigo-700 shadow-sm':'text-gray-500 hover:text-gray-700'].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => handlePrint(activeTab.printName)}
          className="no-print flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors shrink-0"
        >
          ↓ Export PDF
        </button>
      </div>

      {loading ? (
        <p className={tab==='calendar'?'p-6 text-gray-400':'mt-8 text-gray-400'}>Loading…</p>
      ) : (
        <div className={['dashboard-print-content', tab==='calendar'?'flex-1 min-h-0 flex flex-col mt-4':'mt-6 space-y-0'].join(' ')}>
          {tab==='overview'            && <DashboardOverview    invoices={invoices} properties={properties} />}
          {tab==='comparison'          && <DashboardComparison  invoices={invoices} properties={properties} />}
          {tab==='heatmap'             && <DashboardHeatmap     invoices={invoices} properties={properties} />}
          {tab==='cashflow'            && <DashboardCashFlow    invoices={invoices} properties={properties} />}
          {tab==='tax'                 && <DashboardTax         invoices={invoices} contacts={contacts} />}
          {tab==='calendar'            && <div className="flex-1 min-h-0"><CalendarScreen /></div>}
          {tab==='cat-pnl'             && <CategoryPnL          invoices={invoices} properties={properties} references={references} contacts={contacts} />}
          {tab==='cat-trend'           && <CategoryTrend        invoices={invoices} properties={properties} references={references} />}
          {tab==='expense-breakdown'   && <ExpenseBreakdown     invoices={invoices} properties={properties} references={references} />}
          {tab==='income-vs-forecast'  && <IncomevsForecast     invoices={invoices} properties={properties} references={references} />}
          {tab==='expense-sunburst'   && <DashboardExpenseSunburst invoices={invoices} properties={properties} contacts={contacts} references={references} />}
        </div>
      )}
    </div>
  )
}
