import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { makeStyles, tokens, mergeClasses, Select, Text } from '@fluentui/react-components'
import { useForecastFlows, useForecastFlowProperties } from '@/hooks/data'
import { InvoiceType, ForecastFlowType, ForecastFrequency } from '@/domain/types'
import type { Invoice, Property, ReferenceData, ForecastFlow, ForecastFlowProperty } from '@/domain/types'
import { formatMoney } from '@/domain/money'
import { dataColors } from '@/app/dataPalette'

// ── Constants ─────────────────────────────────────────────────────────────────
const INV_INCOME       = InvoiceType.Income
const FLOW_INCOME      = ForecastFlowType.Income
const REF_INC_CAT      = 233100005
const FREQ_ONE_OFF     = ForecastFrequency.OneOff
const FREQ_DAILY       = ForecastFrequency.Daily
const FREQ_WEEKLY      = ForecastFrequency.Weekly
const FREQ_MONTHLY     = ForecastFrequency.Monthly
const FREQ_QUARTERLY   = ForecastFrequency.Quarterly
const FREQ_SEMI_ANN    = ForecastFrequency.SemiAnnually
const FREQ_ANNUALLY    = ForecastFrequency.Annually
const MONTHS           = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Forecast engine (copied from ForecastView) ────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function countDowInMonth(year: number, month: number, dow: number): number {
  const jsDow = dow === 7 ? 0 : dow
  let count = 0
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    if (new Date(year, month, d).getDay() === jsDow) count++
  }
  return count
}

function parseDate(s: string | undefined): { year: number; month: number } | null {
  if (!s) return null
  const [y, mo] = s.slice(0, 10).split('-').map(Number)
  return { year: y, month: mo - 1 }
}

function monthInRange(year: number, month: number, flow: ForecastFlow): boolean {
  const start = parseDate(flow.startDate)
  const end   = parseDate(flow.endDate)
  if (!start) return false
  const after  = year > start.year || (year === start.year && month >= start.month)
  const before = !end || year < end.year || (year === end.year && month <= end.month)
  return after && before
}

function computeNetForMonth(flow: ForecastFlow, year: number, month: number): number {
  if (!monthInRange(year, month, flow)) return 0
  const gross = flow.grossAmount ?? 0
  const vat   = flow.vatAmount ?? 0
  const freq  = Number(flow.frequency)
  const grossBase = gross

  let g = 0
  switch (freq) {
    case FREQ_ONE_OFF: {
      const s = parseDate(flow.startDate)
      g = (s && s.year === year && s.month === month) ? gross : 0
      break
    }
    case FREQ_DAILY: {
      const dowStr = flow.daysOfWeek ?? ''
      if (!dowStr) { g = 0; break }
      const dows  = dowStr.split(',').map(Number).filter(n => n >= 1 && n <= 7)
      const count = dows.reduce((s, d) => s + countDowInMonth(year, month, d), 0)
      g = Math.round(gross * count * 100) / 100
      break
    }
    case FREQ_WEEKLY:
      g = Math.round(gross * (daysInMonth(year, month) / 7) * 100) / 100
      break
    case FREQ_MONTHLY:
      g = gross
      break
    case FREQ_QUARTERLY:
    case FREQ_SEMI_ANN:
    case FREQ_ANNUALLY: {
      const interval = freq === FREQ_QUARTERLY ? 3 : freq === FREQ_SEMI_ANN ? 6 : 12
      const s = parseDate(flow.startDate)
      if (!s) { g = 0; break }
      const totalMonths = (year - s.year) * 12 + (month - s.month)
      g = (totalMonths >= 0 && totalMonths % interval === 0) ? gross : 0
      break
    }
  }
  if (g === 0) return 0
  const net = grossBase > 0 ? Math.round((g - (vat / grossBase) * g) * 100) / 100 : g
  return net
}

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Props {
  invoices:      Invoice[]
  properties:    Property[]
  referenceData: ReferenceData[]
}

interface LogicalFlow {
  logicalId:          string
  categoryId:         string
  versions:           ForecastFlow[]
  linkedPropertyIds:  string[]
  allProperties:      boolean
}

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '24px' },
  filterRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  loadingHint: { fontSize: '12px', color: tokens.colorNeutralForeground4 },
  tableCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, overflow: 'hidden' },
  table: { width: '100%', fontSize: '14px', borderCollapse: 'collapse' },
  th: { padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left' },
  thRight: { textAlign: 'right' },
  td: { padding: '10px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  tdLabel: { fontWeight: 500, color: tokens.colorNeutralForeground2 },
  tdRight: { textAlign: 'right', color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  tdRightBold: { textAlign: 'right', color: tokens.colorNeutralForeground1, fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
  faded: { color: tokens.colorNeutralForeground5 },
  empty: { padding: '32px 16px', textAlign: 'center', color: tokens.colorNeutralForeground4, fontSize: '14px' },
  tfootRow: { backgroundColor: tokens.colorNeutralBackground2 },
  tfootCell: { padding: '10px 16px', fontSize: '14px', fontWeight: 700, color: tokens.colorNeutralForeground1, borderTop: `2px solid ${tokens.colorNeutralStroke1}` },
  tfootCellRight: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  chartCard: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusXLarge, padding: '16px' },
  chartTitle: { fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', display: 'block' },
  pos: { color: tokens.colorPaletteGreenForeground1 },
  neg: { color: tokens.colorPaletteRedForeground1 },
  neutral: { color: tokens.colorNeutralForeground4 },
})

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncomevsForecast({ invoices, properties, referenceData }: Props) {
  const s = useStyles()
  const curYear = new Date().getFullYear()

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.year) s.add(inv.year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [curYear]
  }, [invoices, curYear])

  const [year,       setYear]       = useState(curYear)
  const [propId,     setPropId]     = useState('')

  const { data: flows = [],     isLoading: loadingFlows }     = useForecastFlows()
  const { data: flowProps = [], isLoading: loadingFlowProps } = useForecastFlowProperties()
  const fcLoading = loadingFlows || loadingFlowProps

  const incomeCats = useMemo(
    () => referenceData.filter(r => Number(r.referenceType) === REF_INC_CAT),
    [referenceData],
  )

  // Build logical flows for income
  const logicalFlows = useMemo((): LogicalFlow[] => {
    const map = new Map<string, LogicalFlow>()
    for (const flow of flows) {
      if (Number(flow.type) !== FLOW_INCOME) continue
      const parentId  = flow.parentFlowId
      const logicalId = parentId ?? flow.id
      if (!map.has(logicalId)) {
        const root = flows.find(f => f.id === logicalId)
        map.set(logicalId, {
          logicalId,
          categoryId:        (root ?? flow).categoryId ?? '',
          versions:          [],
          linkedPropertyIds: [],
          allProperties:     false,
        })
      }
      const lf = map.get(logicalId)!
      lf.versions.push(flow)
      if (flow.allProperties) lf.allProperties = true
    }
    for (const fp of flowProps as ForecastFlowProperty[]) {
      const flowId = fp.forecastFlowId ?? ''
      const pid    = fp.propertyId ?? ''
      const flow   = flows.find(f => f.id === flowId)
      if (!flow) continue
      const parentId  = flow.parentFlowId
      const logicalId = parentId ?? flow.id
      const lf = map.get(logicalId)
      if (lf && pid && !lf.linkedPropertyIds.includes(pid)) lf.linkedPropertyIds.push(pid)
    }
    return Array.from(map.values())
  }, [flows, flowProps])

  // Pro-rata ratio for property filter
  function proRataRatio(lf: LogicalFlow): number {
    if (!propId) return 1
    if (lf.allProperties) {
      const total = properties.length
      return total === 0 ? 0 : 1 / total
    }
    if (!lf.linkedPropertyIds.includes(propId)) return -1
    return 1 / lf.linkedPropertyIds.length
  }

  // Forecast net per category for the selected year
  const forecastByCat = useMemo(() => {
    const map = new Map<string, number>()
    for (const lf of logicalFlows) {
      const ratio = proRataRatio(lf)
      if (ratio === -1) continue
      let total = 0
      for (let m = 0; m < 12; m++) {
        let monthNet = 0
        for (const v of lf.versions) monthNet += computeNetForMonth(v, year, m)
        total += Math.round(monthNet * ratio * 100) / 100
      }
      const prev = map.get(lf.categoryId) ?? 0
      map.set(lf.categoryId, prev + total)
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalFlows, year, propId, properties])

  // Forecast net per category per month (for bar chart)
  const forecastMonthByCat = useMemo(() => {
    const map = new Map<number, number>()
    for (const lf of logicalFlows) {
      const ratio = proRataRatio(lf)
      if (ratio === -1) continue
      for (let m = 0; m < 12; m++) {
        let monthNet = 0
        for (const v of lf.versions) monthNet += computeNetForMonth(v, year, m)
        const v = Math.round(monthNet * ratio * 100) / 100
        map.set(m, (map.get(m) ?? 0) + v)
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalFlows, year, propId, properties])

  // Actual income per category per month
  const actualMonthTotal = useMemo(() => {
    const map = new Map<number, number>()
    invoices
      .filter(inv =>
        !inv.cancelled &&
        inv.type === INV_INCOME &&
        inv.year === year &&
        (!propId || inv.allProperties || inv.propertyId === propId)
      )
      .forEach(inv => {
        const m = inv.date ? new Date(inv.date).getMonth() : -1
        if (m >= 0) map.set(m, (map.get(m) ?? 0) + (inv.baseAmount ?? 0))
      })
    return map
  }, [invoices, year, propId])

  // Actual income per category (annual total)
  const actualByCat = useMemo(() => {
    const map = new Map<string, number>()
    invoices
      .filter(inv =>
        !inv.cancelled &&
        inv.type === INV_INCOME &&
        inv.year === year &&
        (!propId || inv.allProperties || inv.propertyId === propId)
      )
      .forEach(inv => {
        const catId = inv.categoryId ?? ''
        map.set(catId, (map.get(catId) ?? 0) + (inv.baseAmount ?? 0))
      })
    return map
  }, [invoices, year, propId])

  // Build table rows: defined income categories + Uncategorised
  const tableRows = useMemo(() => {
    const rows: { id: string; label: string; forecast: number; actual: number }[] = incomeCats
      .map(c => ({
        id:       c.id,
        label:    c.value ?? '',
        forecast: forecastByCat.get(c.id) ?? 0,
        actual:   actualByCat.get(c.id) ?? 0,
      }))
      .filter(r => r.forecast > 0 || r.actual > 0)

    const uncatActual   = actualByCat.get('') ?? 0
    const uncatForecast = forecastByCat.get('') ?? 0
    if (uncatActual > 0 || uncatForecast > 0) {
      rows.push({ id: '', label: 'Uncategorised', forecast: uncatForecast, actual: uncatActual })
    }
    return rows
  }, [incomeCats, forecastByCat, actualByCat])

  // Totals
  const totalForecast = tableRows.reduce((s, r) => s + r.forecast, 0)
  const totalActual   = tableRows.reduce((s, r) => s + r.actual, 0)
  const totalVariance = totalActual - totalForecast

  // Monthly bar chart data
  const barData = MONTHS.map((label, m) => ({
    label,
    Forecast: Math.round((forecastMonthByCat.get(m) ?? 0) * 100) / 100,
    Actual:   Math.round((actualMonthTotal.get(m) ?? 0) * 100) / 100,
  }))

  function rowColorCls(forecast: number, actual: number): string {
    if (forecast === 0) return s.neutral
    return actual >= forecast ? s.pos : s.neg
  }

  function fmtVar(v: number): string {
    if (v === 0) return '—'
    return (v > 0 ? '+' : '') + formatMoney(Math.round(v * 100) / 100)
  }

  function fmtVarPct(actual: number, forecast: number): string {
    if (forecast === 0) return '—'
    const pct = ((actual - forecast) / forecast) * 100
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%'
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
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        {fcLoading && <span className={s.loadingHint}>Loading forecast…</span>}
      </div>

      {/* Comparison table */}
      <div className={s.tableCard}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Category</th>
              <th className={mergeClasses(s.th, s.thRight)}>Forecast Net</th>
              <th className={mergeClasses(s.th, s.thRight)}>Actual Net</th>
              <th className={mergeClasses(s.th, s.thRight)}>Variance</th>
              <th className={mergeClasses(s.th, s.thRight)}>Variance %</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={5} className={s.empty}>No income data for selected filters.</td>
              </tr>
            ) : tableRows.map(row => {
              const variance = row.actual - row.forecast
              const cls = rowColorCls(row.forecast, row.actual)
              return (
                <tr key={row.id}>
                  <td className={mergeClasses(s.td, s.tdLabel)}>{row.label}</td>
                  <td className={mergeClasses(s.td, s.tdRight)}>
                    {row.forecast > 0 ? formatMoney(row.forecast) : <span className={s.faded}>—</span>}
                  </td>
                  <td className={mergeClasses(s.td, s.tdRightBold)}>
                    {row.actual > 0 ? formatMoney(row.actual) : <span className={s.faded}>—</span>}
                  </td>
                  <td className={mergeClasses(s.td, s.tdRightBold, cls)}>{fmtVar(variance)}</td>
                  <td className={mergeClasses(s.td, s.tdRight, cls)}>{fmtVarPct(row.actual, row.forecast)}</td>
                </tr>
              )
            })}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot>
              <tr className={s.tfootRow}>
                <td className={s.tfootCell}>TOTAL</td>
                <td className={mergeClasses(s.tfootCell, s.tfootCellRight)}>{formatMoney(totalForecast)}</td>
                <td className={mergeClasses(s.tfootCell, s.tfootCellRight)}>{formatMoney(totalActual)}</td>
                <td className={mergeClasses(s.tfootCell, s.tfootCellRight, totalVariance >= 0 ? s.pos : s.neg)}>
                  {fmtVar(totalVariance)}
                </td>
                <td className={mergeClasses(s.tfootCell, s.tfootCellRight, totalVariance >= 0 ? s.pos : s.neg)}>
                  {fmtVarPct(totalActual, totalForecast)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Monthly bar chart */}
      <div className={s.chartCard}>
        <Text className={s.chartTitle}>Forecast vs Actual by Month</Text>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${Math.round(v / 1000)}k`} />
            <Tooltip
              formatter={(v, name) => [formatMoney(Number(v)), name as string]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Forecast" fill="#9ca3af" maxBarSize={28} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual"   fill={dataColors.informational} maxBarSize={28} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
