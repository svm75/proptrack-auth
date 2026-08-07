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
import { Svm_pt_owneroccupanciesService } from '../generated/services/Svm_pt_owneroccupanciesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Svm_pt_owneroccupancies } from '../generated/models/Svm_pt_owneroccupanciesModel'
import CalendarScreen from './Calendar'
import CategoryPnL from './CategoryPnL'
import CategoryTrend from './CategoryTrend'
import OccupancyTrend from './OccupancyTrend'
import ExpenseBreakdown from './ExpenseBreakdown'
import IncomevsForecast from './IncomevsForecast'
import { formatMoney, formatMoneyShort } from '@/domain/money'

const TYPE_OUTGOING = 233100001
const TYPE_INCOMING = 233100000

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL   = ['January','February','March','April','May','June','July','August','September','October','November','December']

const COLOR_INCOME  = '#15803D'
const COLOR_EXPENSE = '#DC2626'
const COLOR_PROFIT  = '#0F766E'

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

// Occupancy denominator: full year for past years, but only elapsed days
// (1 Jan through today, inclusive) for the current year — a partial year
// shouldn't be judged against a full year's worth of available nights.
function daysElapsedInYear(year: number): number {
  const now = new Date()
  if (year < now.getFullYear()) return daysInYear(year)
  if (year > now.getFullYear()) return 0
  const start = new Date(year, 0, 1)
  return Math.floor((now.getTime() - start.getTime()) / 86400000) + 1
}

function fmtPct(n: number): string { return `${n.toFixed(1)} %` }

// Nights blocked for owner use within [1 Jan, elapsed-end) of `year`, clipped
// to the same window daysElapsedInYear() uses so incl./excl. occupancy share
// one consistent denominator. propertyId === '' sums across all properties.
function ownerNightsForPeriod(records: Svm_pt_owneroccupancies[], propertyId: string, year: number): number {
  const now = new Date()
  const yearStart = new Date(year, 0, 1)
  const yearEndExclusive = year === now.getFullYear() ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : new Date(year + 1, 0, 1)
  let total = 0
  for (const r of records) {
    const raw = r as unknown as Record<string, unknown>
    const pid = (raw['_svm_pt_property_value'] as string) ?? ''
    if (propertyId && pid !== propertyId) continue
    if (!r.svm_pt_fromdate || !r.svm_pt_todate) continue
    const from = new Date(r.svm_pt_fromdate) < yearStart ? yearStart : new Date(r.svm_pt_fromdate)
    const to = new Date(r.svm_pt_todate) > yearEndExclusive ? yearEndExclusive : new Date(r.svm_pt_todate)
    const nights = Math.round((to.getTime() - from.getTime()) / 86400000)
    if (nights > 0) total += nights
  }
  return total
}

// "Incl. owner" treats owner-use nights as occupied too (bigger numerator,
// same denominator as the plain guest-only rate) — the higher of the two
// figures, showing overall property utilization rather than just paying
// rentals.
function inclOccupancyPct(totalGuestNights: number, ownerNights: number, availableNights: number): number | null {
  return availableNights > 0 ? ((totalGuestNights + ownerNights) / availableNights) * 100 : null
}

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
  kpiCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden' },
  kpiBar: { position: 'absolute', top: 0, left: 0, right: 0, height: '3px' },
  kpiLabel: { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.colorNeutralForeground4 },
  kpiDualRow: { display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' },
  kpiValueTag: { fontSize: '10px', fontWeight: 500, color: tokens.colorNeutralForeground4, marginRight: '5px' },
  kpiValue: { fontSize: '19px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  kpiValue2: { fontSize: '14px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tokens.colorNeutralForeground2 },
  kpiSub: { fontSize: '11px', color: tokens.colorNeutralForeground4, fontVariantNumeric: 'tabular-nums' },
  kpiSubLabel: { fontWeight: 500, color: tokens.colorNeutralForeground3 },

  dashboardGrid: { display: 'grid', gridTemplateColumns: '212px 1fr', gap: '20px', alignItems: 'start' },
  kpiSidebar: { display: 'flex', flexDirection: 'column', gap: '10px', position: 'sticky', top: '20px' },
  kpiSidebarTitle: { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.colorNeutralForeground4, marginBottom: '2px' },
  sidebarKpiCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '2px', position: 'relative', overflow: 'hidden' },
  sidebarKpiBar: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px' },
  sidebarKpiLabel: { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: tokens.colorNeutralForeground4 },
  sidebarKpiValue: { fontSize: '17px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' },

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
  accent?: 'green' | 'red' | 'blue' | 'gray'
  value2?: string; value2Label?: string
}

function KpiCard({ label, value, sub, subLabel, accent = 'blue', value2, value2Label }: KpiCardProps) {
  const s = useStyles()
  const bar: Record<string, string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1, gray: tokens.colorNeutralForeground4,
  }
  const val: Record<string, string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1, gray: tokens.colorNeutralForeground3,
  }
  return (
    <div className={s.kpiCard}>
      <div className={s.kpiBar} style={{ backgroundColor: bar[accent] }} />
      <span className={s.kpiLabel}>{label}</span>
      <div className={s.kpiDualRow}>
        <div>
          {value2 != null && <span className={s.kpiValueTag}>Gross</span>}
          <span className={s.kpiValue} style={{ color: val[accent] }}>{value}</span>
        </div>
        {value2 != null && (
          <div>
            <span className={s.kpiValueTag}>{value2Label ?? 'Net'}</span>
            <span className={s.kpiValue2}>{value2}</span>
          </div>
        )}
      </div>
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

function DashboardOverview({ invoices, properties, ownerOccupancy }: SharedProps & { ownerOccupancy: Svm_pt_owneroccupancies[] }) {
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
  const availableNights = filterYear !== 'all' && propCount > 0 ? daysElapsedInYear(filterYear as number) * propCount : null
  const occupancyExclPct = availableNights ? (totalNights / availableNights) * 100 : null
  const ownerNights    = filterYear !== 'all' ? ownerNightsForPeriod(ownerOccupancy, filterPropId, filterYear as number) : 0
  const occupancyInclPct = availableNights !== null ? inclOccupancyPct(totalNights, ownerNights, availableNights) : null

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
        <div className={s.kpiGrid4} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <KpiCard label="Income" value={formatMoney(incomeGross)} value2={formatMoney(incomeNet)}
            sub={`${income.length} invoice${income.length!==1?'s':''}`} accent="green" />
          <KpiCard label="Expenses" value={formatMoney(expensesGross)} value2={formatMoney(expensesNet)}
            sub={`${expenses.length} invoice${expenses.length!==1?'s':''}`} accent="red" />
          <KpiCard label="Net Profit" value={formatMoney(netProfitGross)} value2={formatMoney(netProfitNet)}
            sub={formatMoney(vatComponent)} subLabel="VAT total:" accent={netProfitGross>=0?'blue':'red'} />
          <KpiCard label="Occupancy" value={occupancyInclPct!==null?fmtPct(occupancyInclPct):'—'}
            value2={occupancyExclPct!==null?fmtPct(occupancyExclPct):undefined} value2Label="Excl. Owner"
            sub={occupancyExclPct!==null?`${totalNights} / ${availableNights} nights`:filterYear==='all'?'Select a year':'No properties'} accent="blue" />
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

function StatRow({ label, value, sub, accent }: { label:string; value:string; sub?:string; accent?:'green'|'red'|'blue' }) {
  const s = useStyles()
  const colors: Record<string,string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1,
    blue: tokens.colorBrandForeground1,
  }
  return (
    <div className={s.statRow}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue} style={{ color: accent ? colors[accent] : undefined }}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  )
}

function DashboardComparison({ invoices, properties, ownerOccupancy }: SharedProps & { ownerOccupancy: Svm_pt_owneroccupancies[] }) {
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
    const avail    = filterYear!=='all' ? daysElapsedInYear(filterYear as number) : 365
    const nightsByMonth = Array(12).fill(0)
    out.forEach(inv => { if (inv.cr9b5_checkin) nightsByMonth[new Date(inv.cr9b5_checkin).getMonth()] += (inv.cr9b5_nights??0) })
    const maxN = Math.max(...nightsByMonth)
    const ownerNights = filterYear !== 'all' ? ownerNightsForPeriod(ownerOccupancy, prop.cr9b5_pt_propertyid, filterYear as number) : 0
    return {
      prop, color: PROPERTY_COLORS[idx % PROPERTY_COLORS.length],
      income, expenses, profit: income-expenses,
      occupancyPct: avail>0 ? (nights/avail)*100 : 0,
      occupancyInclPct: inclOccupancyPct(nights, ownerNights, avail),
      avgNightlyRate: nights>0 ? income/nights : 0,
      avgStayLength: out.length>0 ? nights/out.length : 0,
      busiestMonth: maxN>0 ? MONTH_FULL[nightsByMonth.indexOf(maxN)] : '—',
      nights, stayCount: out.length,
    }
  }), [invoices, properties, filterYear, ownerOccupancy])

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
                <StatRow label="Occupancy"        value={p.occupancyInclPct!==null?fmtPct(p.occupancyInclPct):'—'} sub={`${p.nights} nights`} accent="blue" />
                <StatRow label="Occ. Excl. Owner"  value={fmtPct(p.occupancyPct)} accent="blue" />
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
                <th className={mergeClasses(s.th, s.thRight)}>VAT Collected</th>
                <th className={mergeClasses(s.th, s.thRight)}>VAT Paid</th>
                <th className={mergeClasses(s.th, s.thRight)}>Net VAT</th>
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
                    <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(collected)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(paid)}</td>
                    <td className={mergeClasses(s.td, s.tdTotal)}>{formatMoney(net)}</td>
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
                    <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(tc)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)}>{formatMoney(tp)}</td>
                    <td className={mergeClasses(s.td, s.tdRight)} style={{ fontWeight: 600 }}>{formatMoney(tn)}</td>
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
// MAIN DASHBOARD — tab shell
// ============================================================

type DashTab = 'overview' | 'comparison' | 'cashflow' | 'tax' | 'calendar' | 'cat-pnl' | 'cat-trend' | 'occupancy-trend' | 'expense-breakdown' | 'income-vs-forecast'

const TABS: { id: DashTab; label: string; printName: string }[] = [
  { id: 'overview',            label: 'Overview',            printName: 'overview' },
  { id: 'comparison',          label: 'Property Comparison', printName: 'property-comparison' },
  { id: 'cashflow',            label: 'Cash Flow',            printName: 'cash-flow' },
  { id: 'tax',                 label: 'Tax Summary',          printName: 'tax-summary' },
  { id: 'calendar',            label: 'Calendar',             printName: 'calendar' },
  { id: 'cat-pnl',             label: 'Category P&L',         printName: 'category-pnl' },
  { id: 'cat-trend',           label: 'Category Trend',       printName: 'category-trend' },
  { id: 'occupancy-trend',     label: 'Occupancy Trend',      printName: 'occupancy-trend' },
  { id: 'expense-breakdown',   label: 'Expense Breakdown',    printName: 'expense-breakdown' },
  { id: 'income-vs-forecast',  label: 'Income vs Forecast',   printName: 'income-vs-forecast' },
]

// ---------- Left-hand key KPI sidebar (always visible, current year to date) ----------

function KeyKpiSidebar({ invoices, properties, ownerOccupancy }: SharedProps & { ownerOccupancy: Svm_pt_owneroccupancies[] }) {
  const s = useStyles()
  const currentYear = new Date().getFullYear()

  const yearInvoices = invoices.filter(inv => isActive(inv) && inv.cr9b5_year === currentYear)
  const income   = yearInvoices.filter(i => (i.cr9b5_type as unknown as number) === TYPE_OUTGOING)
  const expenses = yearInvoices.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOMING)
  const incomeGross   = income.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
  const expensesGross = expenses.reduce((s,i) => s+(i.cr9b5_totalgross??0), 0)
  const netProfit      = incomeGross - expensesGross
  const totalNights    = income.reduce((s,i) => s+(i.cr9b5_nights??0), 0)
  const availableNights = properties.length > 0 ? daysElapsedInYear(currentYear) * properties.length : 0
  const occupancyExclPct = availableNights > 0 ? (totalNights / availableNights) * 100 : null
  const ownerNights    = ownerNightsForPeriod(ownerOccupancy, '', currentYear)
  const occupancyInclPct = inclOccupancyPct(totalNights, ownerNights, availableNights)

  const items: { label: string; value: string; sub?: string; accent: 'green'|'red'|'blue' }[] = [
    { label: 'Income',     value: formatMoney(incomeGross),   accent: 'green' },
    { label: 'Expenses',   value: formatMoney(expensesGross), accent: 'red' },
    { label: 'Net Profit', value: formatMoney(netProfit),     accent: netProfit>=0 ? 'blue' : 'red' },
    { label: 'Occupancy',  value: occupancyInclPct!==null?fmtPct(occupancyInclPct):'—',
      sub: occupancyExclPct!==null ? `excl. owner: ${fmtPct(occupancyExclPct)}` : undefined, accent: 'blue' },
  ]
  const barColor: Record<string,string> = {
    green: tokens.colorPaletteGreenForeground1, red: tokens.colorPaletteRedForeground1, blue: tokens.colorBrandForeground1,
  }

  return (
    <div className={s.kpiSidebar}>
      <Text className={s.kpiSidebarTitle}>{currentYear} at a glance</Text>
      {items.map(item => (
        <div key={item.label} className={s.sidebarKpiCard}>
          <div className={s.sidebarKpiBar} style={{ backgroundColor: barColor[item.accent] }} />
          <span className={s.sidebarKpiLabel}>{item.label}</span>
          <span className={s.sidebarKpiValue} style={{ color: barColor[item.accent] }}>{item.value}</span>
          {item.sub && <span className={s.kpiSub}>{item.sub}</span>}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const s = useStyles()
  const [invoices,   setInvoices]   = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts,   setContacts]   = useState<Cr9b5_pt_contacts[]>([])
  const [references, setReferences] = useState<Cr9b5_pt_references[]>([])
  const [ownerOccupancy, setOwnerOccupancy] = useState<Svm_pt_owneroccupancies[]>([])
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
      const [invRes, propRes, conRes, refRes, occRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date desc'], maxPageSize: 5000 }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ select: ['cr9b5_pt_contactid', 'cr9b5_name'], maxPageSize: 5000 }),
        Cr9b5_pt_referencesService.getAll({ select: ['cr9b5_pt_referenceid', 'cr9b5_value', 'cr9b5_referencetype'], maxPageSize: 5000 }),
        Svm_pt_owneroccupanciesService.getAll({ maxPageSize: 5000 }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setContacts(conRes.data ?? [])
      setReferences(refRes.data ?? [])
      setOwnerOccupancy(occRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const activeTab = TABS.find(t => t.id === tab)!
  const isCalendar = tab === 'calendar'

  return (
    <div className={s.dashboardGrid}>
      <KeyKpiSidebar invoices={invoices} properties={properties} ownerOccupancy={ownerOccupancy} />
      <div className={isCalendar ? s.pageCalendar : s.page} style={{ padding: isCalendar ? undefined : '24px 24px 24px 0', maxWidth: 'none' }}>
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
            {tab==='overview'            && <DashboardOverview    invoices={invoices} properties={properties} ownerOccupancy={ownerOccupancy} />}
            {tab==='comparison'          && <DashboardComparison  invoices={invoices} properties={properties} ownerOccupancy={ownerOccupancy} />}
            {tab==='cashflow'            && <DashboardCashFlow    invoices={invoices} properties={properties} />}
            {tab==='tax'                 && <DashboardTax         invoices={invoices} contacts={contacts} />}
            {tab==='calendar'            && <div style={{ flex: 1, minHeight: 0 }}><CalendarScreen /></div>}
            {tab==='cat-pnl'             && <CategoryPnL          invoices={invoices} properties={properties} references={references} contacts={contacts} />}
            {tab==='cat-trend'           && <CategoryTrend        invoices={invoices} properties={properties} references={references} />}
            {tab==='occupancy-trend'     && <OccupancyTrend       invoices={invoices} properties={properties} ownerOccupancy={ownerOccupancy} />}
            {tab==='expense-breakdown'   && <ExpenseBreakdown     invoices={invoices} properties={properties} references={references} />}
            {tab==='income-vs-forecast'  && <IncomevsForecast     invoices={invoices} properties={properties} references={references} />}
          </div>
        )}
      </div>
    </div>
  )
}
