import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { makeStyles, tokens, mergeClasses, Text, Button, Select } from '@fluentui/react-components'
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
import { formatMoney, formatMoneyShort } from '@/domain/money'

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

// ---------- shared styles ----------

const useStyles = makeStyles({
  page: { padding: '24px', maxWidth: '83rem' },
  pageCalendar: { display: 'flex', flexDirection: 'column', height: '100%' },
  headerRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' },
  headerRowCalendar: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', padding: '24px 24px 0', flexShrink: 0 },
  tabBar: { display: 'flex', backgroundColor: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, padding: '2px', gap: '2px', flexWrap: 'wrap' },
  tabBtn: { padding: '6px 12px', borderRadius: tokens.borderRadiusSmall, fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: tokens.colorNeutralForeground3 },
  tabBtnActive: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, boxShadow: tokens.shadow2 },
  exportBtn: { flexShrink: 0 },
  loading: { marginTop: '32px', color: tokens.colorNeutralForeground4 },
  loadingCalendar: { padding: '24px', color: tokens.colorNeutralForeground4 },
  content: { marginTop: '24px' },
  contentCalendar: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: '16px' },

  stack: { display: 'flex', flexDirection: 'column', gap: '32px' },
  stack6: { display: 'flex', flexDirection: 'column', gap: '24px' },
  filterRow: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '24px' },

  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' },
  kpiGrid4: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' },
  kpiCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden' },
  kpiBar: { position: 'absolute', top: 0, left: 0, right: 0, height: '4px' },
  kpiLabel: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.colorNeutralForeground4 },
  kpiValue: { fontSize: '24px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  kpiSub: { fontSize: '11px', color: tokens.colorNeutralForeground4, fontVariantNumeric: 'tabular-nums' },
  kpiSubLabel: { fontWeight: 500, color: tokens.colorNeutralForeground3 },

  sectionHeading: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  sectionHeadingText: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.colorNeutralForeground4 },
  sectionHeadingLine: { flex: 1, height: '1px', backgroundColor: tokens.colorNeutralStroke2 },

  chartCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '20px' },
  muted: { fontSize: '14px', color: tokens.colorNeutralForeground4 },
  tooltipBox: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, padding: '8px 12px', fontSize: '13px' },
  tooltipTitle: { fontWeight: 600, color: tokens.colorNeutralForeground2, marginBottom: '4px' },

  compGrid1: { display: 'grid', gridTemplateColumns: '1fr', gap: '20px', maxWidth: '384px' },
  compGrid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
  compCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, overflow: 'hidden', boxShadow: tokens.shadow2 },
  compCardBar: { height: '6px' },
  compCardBody: { padding: '20px' },
  compHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' },
  compDot: { width: '12px', height: '12px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  compTitle: { fontWeight: 600, color: tokens.colorNeutralForeground1, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  compSub: { fontSize: '12px', color: tokens.colorNeutralForeground4, flexShrink: 0 },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' },
  statRow: { backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px' },
  statLabel: { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.colorNeutralForeground4, marginBottom: '2px' },
  statValue: { fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: '13px', color: tokens.colorNeutralForeground1 },
  statSub: { fontSize: '10px', color: tokens.colorNeutralForeground4, fontVariantNumeric: 'tabular-nums' },

  heatmapWrap: { position: 'relative' },
  heatTooltip: { position: 'fixed', zIndex: 9999, backgroundColor: '#111827', color: '#fff', fontSize: '12px', borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, padding: '6px 10px', pointerEvents: 'none' },
  heatTooltipTitle: { fontWeight: 600, marginBottom: '2px' },
  heatTooltipLine: { color: '#d1d5db' },
  heatYearRow: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' },
  heatYearLabel: { fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground2, width: '40px', flexShrink: 0 },
  heatYearSub: { fontSize: '12px', color: tokens.colorNeutralForeground4, fontVariantNumeric: 'tabular-nums' },
  heatGrid: { display: 'grid', gridTemplateColumns: 'repeat(12, auto)', gap: '6px' },
  heatMonthCol: { display: 'flex', flexDirection: 'column', gap: '1px' },
  heatMonthLabel: { fontSize: '9px', fontWeight: 600, color: tokens.colorNeutralForeground4, textAlign: 'center', marginBottom: '2px' },
  heatCell: { width: '12px', height: '12px', borderRadius: '2px' },
  legendRow: { display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: tokens.colorNeutralForeground3 },
  legendSwatch: { width: '12px', height: '12px', borderRadius: '2px', flexShrink: 0 },
  heatFooter: { display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, fontSize: '10px', color: tokens.colorNeutralForeground4 },

  tableCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, overflow: 'hidden' },
  table: { width: '100%', fontSize: '14px', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  thRight: { textAlign: 'right' },
  td: { padding: '10px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground2 },
  tdLabel: { fontWeight: 500, color: tokens.colorNeutralForeground2 },
  tdRight: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tokens.colorNeutralForeground3 },
  tdTotal: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  trTotal: { backgroundColor: tokens.colorNeutralBackground2, fontWeight: 600 },

  sbCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '16px', position: 'relative' },
  sbLegendCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '20px', minWidth: '220px' },
  sbLegendTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: tokens.colorNeutralForeground4, marginBottom: '12px' },
  sbLegendRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginBottom: '8px' },
  sbLegendName: { color: tokens.colorNeutralForeground2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  sbLegendVal: { fontVariantNumeric: 'tabular-nums', color: tokens.colorNeutralForeground4, fontSize: '12px' },
})

// ---------- shared small components ----------

interface KpiCardProps {
  label: string; value: string; sub?: string; subLabel?: string
  accent?: 'green' | 'red' | 'blue' | 'purple' | 'gray'
}

function KpiCard({ label, value, sub, subLabel, accent = 'blue' }: KpiCardProps) {
  const s = useStyles()
  const bar: Record<string, string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1, purple: tokens.colorPalettePurpleForeground2, gray: tokens.colorNeutralForeground4,
  }
  const val: Record<string, string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1, purple: tokens.colorPalettePurpleForeground2, gray: tokens.colorNeutralForeground3,
  }
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiBar} style={{ backgroundColor: bar[accent] }} />
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiValue} style={{ color: val[accent] }}>{value}</span>
      {sub && <span className={s.kpiSub}>{subLabel && <span className={s.kpiSubLabel}>{subLabel} </span>}{sub}</span>}
    </div>
  )
}

function SectionHeading({ children }: { children: string }) {
  const s = useStyles()
  return (
    <div className={s.sectionHeading}>
      <span className={s.sectionHeadingText}>{children}</span>
      <div className={s.sectionHeadingLine} />
    </div>
  )
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: {name:string;value:number;color:string}[]; label?: string }) {
  const s = useStyles()
  if (!active || !payload?.length) return null
  return (
    <div className={s.tooltipBox}>
      <p className={s.tooltipTitle}>{label}</p>
      {payload.map(p => <p key={p.name} style={{ color: p.color, fontVariantNumeric: 'tabular-nums' }}>{p.name}: {formatMoney(p.value)}</p>)}
    </div>
  )
}

function FilterRow({ children }: { children: React.ReactNode }) {
  const s = useStyles()
  return <div className={s.filterRow}>{children}</div>
}

function YearSelect({ value, years, onChange, allowAll = true }: { value: number|'all'; years: number[]; onChange:(v:number|'all')=>void; allowAll?: boolean }) {
  return (
    <Select value={String(value)} onChange={e => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
      {allowAll && <option value="all">All years</option>}
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </Select>
  )
}

function PropSelect({ value, properties, onChange }: { value: string; properties: Cr9b5_pt_properties[]; onChange:(v:string)=>void }) {
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">All properties</option>
      {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
    </Select>
  )
}

// ============================================================
// OVERVIEW TAB
// ============================================================

function DashboardOverview({ invoices, properties }: SharedProps) {
  const s = useStyles()
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
    <div className={s.stack}>
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>
      <div>
        <SectionHeading>Gross — incl. VAT</SectionHeading>
        <div className={s.kpiGrid4} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <KpiCard label="Income"     value={formatMoney(incomeGross)}   sub={`${income.length} invoice${income.length!==1?'s':''}`} accent="green" />
          <KpiCard label="Expenses"   value={formatMoney(expensesGross)} sub={`${expenses.length} invoice${expenses.length!==1?'s':''}`} accent="red" />
          <KpiCard label="Net Profit" value={formatMoney(netProfitGross)} accent={netProfitGross>=0?'blue':'red'} />
          <KpiCard label="Occupancy"  value={occupancyPct!==null?fmtPct(occupancyPct):'—'}
            sub={occupancyPct!==null?`${totalNights} / ${availableNights} nights`:filterYear==='all'?'Select a year':'No properties'} accent="purple" />
        </div>
      </div>
      <div>
        <SectionHeading>Net — excl. VAT</SectionHeading>
        <div className={s.kpiGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <KpiCard label="Income Net"   value={formatMoney(incomeNet)}   sub={formatMoney(income.reduce((s,i)=>s+(i.cr9b5_taxamount??0),0))}   subLabel="VAT:" accent="green" />
          <KpiCard label="Expenses Net" value={formatMoney(expensesNet)} sub={formatMoney(expenses.reduce((s,i)=>s+(i.cr9b5_taxamount??0),0))} subLabel="VAT:" accent="red" />
          <KpiCard label="Net Profit"   value={formatMoney(netProfitNet)} sub={formatMoney(vatComponent)} subLabel="VAT total:" accent={netProfitNet>=0?'blue':'red'} />
        </div>
      </div>
      <div>
        <SectionHeading>{filterYear!=='all'?`Monthly Breakdown — ${filterYear}`:'Monthly Breakdown — select a year'}</SectionHeading>
        {filterYear==='all' ? <p className={s.muted}>Select a year to see the monthly breakdown.</p> : (
          <div className={s.chartCard}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatMoneyShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={52} />
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
        {yearlyData.length<1 ? <p className={s.muted}>No data.</p> : (
          <div className={s.chartCard}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={yearlyData} margin={{top:4,right:8,left:8,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="year" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatMoneyShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={52} />
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
  const s = useStyles()
  const colors: Record<string,string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1, purple: tokens.colorPalettePurpleForeground2,
  }
  return (
    <div className={s.statRow}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue} style={{ color: accent ? colors[accent] : undefined }}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  )
}

function DashboardComparison({ invoices, properties }: SharedProps) {
  const s = useStyles()
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
    <div className={s.stack6}>
      <FilterRow><YearSelect value={filterYear} years={years} onChange={setFilterYear} /></FilterRow>
      {properties.length===0 && <p className={s.muted}>No properties found.</p>}
      <div className={properties.length>1 ? s.compGrid2 : s.compGrid1}>
        {propStats.map(p => (
          <div key={p.prop.cr9b5_pt_propertyid} className={s.compCard}>
            <div className={s.compCardBar} style={{backgroundColor:p.color}} />
            <div className={s.compCardBody}>
              <div className={s.compHeader}>
                <span className={s.compDot} style={{backgroundColor:p.color}} />
                <h3 className={s.compTitle}>{p.prop.cr9b5_name}</h3>
                {p.prop.cr9b5_shortid && <span className={s.compSub}>({p.prop.cr9b5_shortid})</span>}
              </div>
              <div className={s.statGrid}>
                <StatRow label="Income (gross)"   value={formatMoney(p.income)}   accent="green" />
                <StatRow label="Expenses (gross)" value={formatMoney(p.expenses)} accent="red" />
                <StatRow label="Net Profit"       value={formatMoney(p.profit)}   accent={p.profit>=0?'blue':'red'} />
                <StatRow label="Occupancy"        value={fmtPct(p.occupancyPct)} sub={`${p.nights} nights`} accent="purple" />
                <StatRow label="Avg Nightly Rate" value={p.nights>0?formatMoney(p.avgNightlyRate):'—'} />
                <StatRow label="Avg Stay Length"  value={p.stayCount>0?`${p.avgStayLength.toFixed(1)} nights`:'—'} sub={`${p.stayCount} stays`} />
                <div style={{ gridColumn: 'span 2' }}><StatRow label="Busiest Month" value={p.busiestMonth} /></div>
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
  const s = useStyles()
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
      const str = e.contactName ? `${e.propName} — ${e.contactName}` : e.propName
      if (!seen.has(str)) { seen.add(str); lines.push(str) }
    })
    return lines
  }

  const MONTH_1 = ['J','F','M','A','M','J','J','A','S','O','N','D']

  return (
    <div className={s.heatmapWrap}>
      {tooltip && (
        <div style={{position:'fixed',left:tooltip.x+14,top:tooltip.y-8,zIndex:9999}} className={s.heatTooltip}>
          {tooltip.lines.map((l,i) => <div key={i} className={i===0?s.heatTooltipTitle:s.heatTooltipLine}>{l}</div>)}
        </div>
      )}

      <div className={s.heatYearRow}>
        <span className={s.heatYearLabel}>{year}</span>
        <span className={s.heatYearSub}>{totalOccupied} / {daysInYear(year)} days occupied</span>
      </div>

      <div className={s.heatGrid}>
        {Array.from({length:12}, (_,month) => {
          const dim = daysInMonth(year, month)
          return (
            <div key={month} className={s.heatMonthCol}>
              <div className={s.heatMonthLabel}>{MONTH_1[month]}</div>
              {Array.from({length:31}, (_,di) => {
                const day = di+1
                if (day>dim) return <div key={day} style={{width:12,height:12}} />
                const tipLines = getCellTip(month, day)
                return (
                  <div key={day}
                    className={s.heatCell}
                    style={{backgroundColor:getCellColor(month,day)}}
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
  const s = useStyles()
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
    <div className={s.stack6}>
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>

      {!filterPropId && properties.length>1 && (
        <div className={s.legendRow}>
          {properties.map((p,i) => (
            <div key={p.cr9b5_pt_propertyid} className={s.legendItem}>
              <span className={s.legendSwatch} style={{backgroundColor:PROPERTY_COLORS[i%PROPERTY_COLORS.length]}} />
              {p.cr9b5_name}
            </div>
          ))}
        </div>
      )}

      <div className={s.chartCard} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {visibleYears.map(year => (
          <YearHeatmap key={year} year={year} occupiedMap={occupiedMap} colorMap={colorMap} />
        ))}
        {visibleYears.length===0 && <p className={s.muted}>No data.</p>}
        <div className={s.heatFooter}>
          <span>Empty</span>
          <div style={{width:12,height:12,borderRadius:2,backgroundColor:'#e5e7eb'}} />
          <span style={{marginLeft:8}}>→ Occupied</span>
          {!filterPropId && properties.map((p,i) => (
            <div key={p.cr9b5_pt_propertyid} style={{width:12,height:12,borderRadius:2,backgroundColor:PROPERTY_COLORS[i%PROPERTY_COLORS.length],marginLeft:4}} />
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
  const s = useStyles()
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
    <div className={s.stack6}>
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={setFilterYear} />
        <PropSelect value={filterPropId} properties={properties} onChange={setFilterPropId} />
      </FilterRow>
      <div className={s.kpiGrid4} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <KpiCard label="Opening Balance"        value="€ 0"              sub="Start of period" accent="gray" />
        <KpiCard label="Closing Balance"         value={formatMoney(closing)} accent={closing>=0?'blue':'red'} />
        <KpiCard label="Highest Month — Income"  value={formatMoney(highIncome)}  accent="green" />
        <KpiCard label="Highest Month — Expense" value={formatMoney(highExpense)} accent="red" />
      </div>
      {filterYear==='all' ? <p className={s.muted}>Select a year to see the cash flow timeline.</p> : (
        <>
          <div>
            <SectionHeading>{`Cumulative Net Cash Flow — ${filterYear}`}</SectionHeading>
            <div className={s.chartCard}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatMoneyShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={0} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <Line dataKey="cumulative" name="Cumulative Net" stroke={COLOR_PROFIT} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <SectionHeading>{`Monthly Income vs Expenses — ${filterYear}`}</SectionHeading>
            <div className={s.chartCard}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{top:4,right:8,left:8,bottom:0}} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{fontSize:12,fill:'#9ca3af'}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatMoneyShort} tick={{fontSize:11,fill:'#9ca3af'}} axisLine={false} tickLine={false} width={56} />
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
  const s = useStyles()
  const cols = ['Q1','Q2','Q3','Q4','Annual']
  return (
    <div>
      <SectionHeading>{title}</SectionHeading>
      <div className={s.tableCard}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Period / Name</th>
              {cols.map(c => <th key={c} className={mergeClasses(s.th, s.thRight)}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={mergeClasses(s.td, s.tdLabel)}>{r.label}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(r.q1)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(r.q2)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(r.q3)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(r.q4)}</td>
                <td className={mergeClasses(s.td, s.tdTotal)}>{formatMoney(r.total)}</td>
              </tr>
            ))}
            {totalRow && (
              <tr className={s.trTotal}>
                <td className={s.td}>{totalRow.label}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(totalRow.q1)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(totalRow.q2)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(totalRow.q3)}</td>
                <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(totalRow.q4)}</td>
                <td className={mergeClasses(s.td, s.tdTotal)} style={{ color: tokens.colorBrandForeground1 }}>{formatMoney(totalRow.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DashboardTax({ invoices, contacts }: { invoices: Cr9b5_pt_invoices[]; contacts: Cr9b5_pt_contacts[] }) {
  const s = useStyles()
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
    <div className={s.stack}>
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={v => setFilterYear(v as number)} allowAll={false} />
      </FilterRow>

      {/* VAT table — custom column headers */}
      <div>
        <SectionHeading>VAT per Quarter</SectionHeading>
        <div className={s.tableCard}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Quarter</th>
                <th className={mergeClasses(s.th, s.thRight)} style={{ color: tokens.colorPaletteGreenForeground1 }}>VAT Collected</th>
                <th className={mergeClasses(s.th, s.thRight)} style={{ color: tokens.colorPaletteRedForeground1 }}>VAT Paid</th>
                <th className={mergeClasses(s.th, s.thRight)} style={{ color: tokens.colorBrandForeground1 }}>Net VAT</th>
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4].map(q => {
                const collected = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING&&getQuarter(i)===q).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const paid      = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING&&getQuarter(i)===q).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const net = collected - paid
                return (
                  <tr key={q}>
                    <td className={mergeClasses(s.td, s.tdLabel)}>Q{q}</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ color: tokens.colorPaletteGreenForeground1 }}>{formatMoney(collected)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ color: tokens.colorPaletteRedForeground1 }}>{formatMoney(paid)}</td>
                    <td className={mergeClasses(s.td, s.tdTotal)} style={{ color: net>=0?tokens.colorBrandForeground1:tokens.colorPaletteRedForeground1 }}>{formatMoney(net)}</td>
                  </tr>
                )
              })}
              {(() => {
                const tc = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_OUTGOING).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const tp = yearInvoices.filter(i=>(i.cr9b5_type as unknown as number)===TYPE_INCOMING).reduce((s,i)=>s+(i.cr9b5_taxamount??0),0)
                const tn = tc-tp
                return (
                  <tr className={s.trTotal}>
                    <td className={s.td}>Annual Total</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ color: tokens.colorPaletteGreenForeground1 }}>{formatMoney(tc)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ color: tokens.colorPaletteRedForeground1 }}>{formatMoney(tp)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ color: tn>=0?tokens.colorBrandForeground1:tokens.colorPaletteRedForeground1, fontWeight: 600 }}>{formatMoney(tn)}</td>
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
  const s = useStyles()
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
      { r0: 60,  r1: 140 },
      { r0: 148, r1: 210 },
      { r0: 218, r1: 275 },
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
    <div className={s.stack6}>
      <FilterRow>
        <YearSelect value={filterYear} years={years} onChange={v => setFilterYear(v as number)} allowAll={false} />
      </FilterRow>

      {total === 0 ? (
        <p className={s.muted}>No expense data for {filterYear}.</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-start' }}>
          <div className={s.sbCard}>
            {tooltip && (
              <div style={{ position: 'fixed', left: tooltip.x + 14, top: tooltip.y - 8, zIndex: 9999 }} className={s.heatTooltip}>
                <div className={s.heatTooltipTitle}>{tooltip.label}</div>
                <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(tooltip.value)}</div>
                <div className={s.heatTooltipLine} style={{ fontVariantNumeric: 'tabular-nums' }}>{tooltip.pct.toFixed(1)} % of total</div>
              </div>
            )}
            <svg width={600} height={600} viewBox="0 0 600 600">
              <text x={300} y={294} textAnchor="middle" fontSize={13} fill="#6b7280" fontWeight={600}>Expenses</text>
              <text x={300} y={312} textAnchor="middle" fontSize={12} fill="#9ca3af" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</text>

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

              {[{ r: 100, label: 'Property' }, { r: 179, label: 'Category' }, { r: 246, label: 'Contact' }].map(({ r, label }) => (
                <text key={label} x={300} y={300 - r} textAnchor="middle" fontSize={9} fill="#9ca3af" dy={-3}>{label}</text>
              ))}
            </svg>
          </div>

          {/* Legend: top-level properties */}
          <div className={s.sbLegendCard}>
            <div className={s.sbLegendTitle}>Properties</div>
            <div>
              {Array.from(hierarchy.entries())
                .sort((a, b) => b[1].value - a[1].value)
                .map(([propId, propEntry], idx) => {
                  const name = propId === '__none__' ? 'No Property' : (propById[propId] ?? propId)
                  const color = PROPERTY_COLORS[idx % PROPERTY_COLORS.length]
                  return (
                    <div key={propId} className={s.sbLegendRow}>
                      <span className={s.legendSwatch} style={{ backgroundColor: color, borderRadius: '2px' }} />
                      <span className={s.sbLegendName}>{name}</span>
                      <span className={s.sbLegendVal}>{formatMoney(propEntry.value)}</span>
                    </div>
                  )
                })}
            </div>
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` }}>
              <div className={s.sbLegendTitle} style={{ marginBottom: '4px' }}>Ring guide</div>
              {RING_LABELS.map((l, i) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: tokens.colorNeutralForeground4, marginTop: '4px' }}>
                  <span style={{ width: '16px', height: '8px', borderRadius: '2px', backgroundColor: tokens.colorNeutralStroke1, opacity: 0.4 + i * 0.2, flexShrink: 0 }} />
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
  const s = useStyles()
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
  const isCalendar = tab === 'calendar'

  return (
    <div className={isCalendar ? s.pageCalendar : s.page}>
      {/* Header row */}
      <div className={isCalendar ? s.headerRowCalendar : s.headerRow}>
        <div className={s.tabBar}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={mergeClasses(s.tabBtn, tab===t.id && s.tabBtnActive)}>
              {t.label}
            </button>
          ))}
        </div>
        <Button className={mergeClasses('no-print', s.exportBtn)} appearance="secondary" onClick={() => handlePrint(activeTab.printName)}>
          ↓ Export PDF
        </Button>
      </div>

      {loading ? (
        <Text className={isCalendar ? s.loadingCalendar : s.loading}>Loading…</Text>
      ) : (
        <div className={mergeClasses('dashboard-print-content', isCalendar ? s.contentCalendar : s.content)}>
          {tab==='overview'            && <DashboardOverview    invoices={invoices} properties={properties} />}
          {tab==='comparison'          && <DashboardComparison  invoices={invoices} properties={properties} />}
          {tab==='heatmap'             && <DashboardHeatmap     invoices={invoices} properties={properties} />}
          {tab==='cashflow'            && <DashboardCashFlow    invoices={invoices} properties={properties} />}
          {tab==='tax'                 && <DashboardTax         invoices={invoices} contacts={contacts} />}
          {tab==='calendar'            && <div style={{ flex: 1, minHeight: 0 }}><CalendarScreen /></div>}
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
