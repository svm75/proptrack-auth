import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Cr9b5_pt_forecastflowsService }   from '../generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService }  from '../generated/services/Cr9b5_forecastpropertiesService'
import type { Cr9b5_pt_forecastflows }      from '../generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties }    from '../generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_invoices }           from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties }         from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references }         from '../generated/models/Cr9b5_pt_referencesModel'
import { fmtEur } from '../utils/formatters'

// ── Constants ─────────────────────────────────────────────────────────────────
const INV_INCOME       = 233100001   // invoice type: outgoing = income
const FLOW_INCOME      = 233100000   // forecast flow type: income
const REF_INC_CAT      = 233100005
const FREQ_ONE_OFF     = 233100000
const FREQ_DAILY       = 233100001
const FREQ_WEEKLY      = 233100002
const FREQ_MONTHLY     = 233100003
const FREQ_QUARTERLY   = 233100004
const FREQ_SEMI_ANN    = 233100005
const FREQ_ANNUALLY    = 233100006
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

function monthInRange(year: number, month: number, flow: Cr9b5_pt_forecastflows): boolean {
  const start = parseDate(flow.cr9b5_startdate)
  const end   = parseDate(flow.cr9b5_enddate)
  if (!start) return false
  const after  = year > start.year || (year === start.year && month >= start.month)
  const before = !end || year < end.year || (year === end.year && month <= end.month)
  return after && before
}

function computeNetForMonth(flow: Cr9b5_pt_forecastflows, year: number, month: number): number {
  if (!monthInRange(year, month, flow)) return 0
  const r     = flow as unknown as Record<string, unknown>
  const gross = (r['cr9b5_grossamount'] as number) ?? 0
  const vat   = flow.cr9b5_vatamount ?? 0
  const freq  = Number(flow.cr9b5_frequency)
  const grossBase = gross

  let g = 0
  switch (freq) {
    case FREQ_ONE_OFF: {
      const s = parseDate(flow.cr9b5_startdate)
      g = (s && s.year === year && s.month === month) ? gross : 0
      break
    }
    case FREQ_DAILY: {
      const dowStr = (r['cr9b5_daysofweek'] as string) ?? ''
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
      const s = parseDate(flow.cr9b5_startdate)
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
  invoices:   Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
  references: Cr9b5_pt_references[]
}

interface LogicalFlow {
  logicalId:          string
  categoryId:         string
  versions:           Cr9b5_pt_forecastflows[]
  linkedPropertyIds:  string[]
  allProperties:      boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IncomevsForecast({ invoices, properties, references }: Props) {
  const curYear = new Date().getFullYear()

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [curYear]
  }, [invoices, curYear])

  const [year,       setYear]       = useState(curYear)
  const [propId,     setPropId]     = useState('')
  const [flows,      setFlows]      = useState<Cr9b5_pt_forecastflows[]>([])
  const [flowProps,  setFlowProps]  = useState<Cr9b5_forecastproperties[]>([])
  const [fcLoading,  setFcLoading]  = useState(true)

  useEffect(() => {
    setFcLoading(true)
    Promise.all([
      Cr9b5_pt_forecastflowsService.getAll({}),
      Cr9b5_forecastpropertiesService.getAll({}),
    ]).then(([fRes, fpRes]) => {
      setFlows(fRes.data ?? [])
      setFlowProps(fpRes.data ?? [])
    }).finally(() => setFcLoading(false))
  }, [])

  const incomeCats = useMemo(
    () => references.filter(r => Number(r.cr9b5_referencetype) === REF_INC_CAT),
    [references],
  )

  // Build logical flows for income
  const logicalFlows = useMemo((): LogicalFlow[] => {
    const map = new Map<string, LogicalFlow>()
    for (const flow of flows) {
      if (Number(flow.cr9b5_type) !== FLOW_INCOME) continue
      const parentId  = (flow as unknown as Record<string, unknown>)['_cr9b5_parentflowid_value'] as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
      if (!map.has(logicalId)) {
        const root = flows.find(f => f.cr9b5_pt_forecastflowid === logicalId)
        map.set(logicalId, {
          logicalId,
          categoryId:        (root ?? flow)._cr9b5_categoryid_value ?? '',
          versions:          [],
          linkedPropertyIds: [],
          allProperties:     false,
        })
      }
      const lf = map.get(logicalId)!
      lf.versions.push(flow)
      if (flow.cr9b5_allproperties) lf.allProperties = true
    }
    for (const fp of flowProps) {
      const flowId = fp._cr9b5_forecastflowid_value ?? ''
      const pid    = fp._cr9b5_propertyid_value ?? ''
      const flow   = flows.find(f => f.cr9b5_pt_forecastflowid === flowId)
      if (!flow) continue
      const parentId  = (flow as unknown as Record<string, unknown>)['_cr9b5_parentflowid_value'] as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
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
        (inv.statecode as unknown as number) !== 1 &&
        (inv.cr9b5_type as unknown as number) === INV_INCOME &&
        inv.cr9b5_year === year &&
        (!propId || (inv as unknown as Record<string, unknown>)['cr9b5_allproperties'] || (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] === propId)
      )
      .forEach(inv => {
        const m = inv.cr9b5_date ? new Date(inv.cr9b5_date).getMonth() : -1
        if (m >= 0) map.set(m, (map.get(m) ?? 0) + (inv.cr9b5_baseamount ?? 0))
      })
    return map
  }, [invoices, year, propId])

  // Actual income per category (annual total)
  const actualByCat = useMemo(() => {
    const map = new Map<string, number>()
    invoices
      .filter(inv =>
        (inv.statecode as unknown as number) !== 1 &&
        (inv.cr9b5_type as unknown as number) === INV_INCOME &&
        inv.cr9b5_year === year &&
        (!propId || (inv as unknown as Record<string, unknown>)['cr9b5_allproperties'] || (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] === propId)
      )
      .forEach(inv => {
        const catId = ((inv as unknown as Record<string, unknown>)['_cr9b5_categoryid_value'] as string) ?? ''
        map.set(catId, (map.get(catId) ?? 0) + (inv.cr9b5_baseamount ?? 0))
      })
    return map
  }, [invoices, year, propId])

  // Build table rows: defined income categories + Uncategorised
  const tableRows = useMemo(() => {
    const rows: { id: string; label: string; forecast: number; actual: number }[] = incomeCats
      .map(c => ({
        id:       c.cr9b5_pt_referenceid,
        label:    c.cr9b5_value ?? '',
        forecast: forecastByCat.get(c.cr9b5_pt_referenceid) ?? 0,
        actual:   actualByCat.get(c.cr9b5_pt_referenceid) ?? 0,
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

  function rowColor(forecast: number, actual: number): string {
    if (forecast === 0) return 'text-gray-400'
    return actual >= forecast ? 'text-green-700' : 'text-red-600'
  }

  function fmtVar(v: number): string {
    if (v === 0) return '—'
    return (v > 0 ? '+' : '') + fmtEur(Math.round(v * 100) / 100)
  }

  function fmtVarPct(actual: number, forecast: number): string {
    if (forecast === 0) return '—'
    const pct = ((actual - forecast) / forecast) * 100
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%'
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
        {fcLoading && <span className="text-xs text-gray-400">Loading forecast…</span>}
      </div>

      {/* Comparison table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Category</th>
              <th className="px-4 py-2.5 text-right">Forecast Net</th>
              <th className="px-4 py-2.5 text-right">Actual Net</th>
              <th className="px-4 py-2.5 text-right">Variance</th>
              <th className="px-4 py-2.5 text-right">Variance %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No income data for selected filters.
                </td>
              </tr>
            ) : tableRows.map(row => {
              const variance = row.actual - row.forecast
              const cls = rowColor(row.forecast, row.actual)
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{row.label}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">
                    {row.forecast > 0 ? fmtEur(row.forecast) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-800 tabular-nums font-medium">
                    {row.actual > 0 ? fmtEur(row.actual) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${cls}`}>
                    {fmtVar(variance)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${cls}`}>
                    {fmtVarPct(row.actual, row.forecast)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {tableRows.length > 0 && (
            <tfoot className="bg-gray-50 border-t border-gray-300">
              <tr>
                <td className="px-4 py-2.5 text-sm font-bold text-gray-900">TOTAL</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-800 tabular-nums">{fmtEur(totalForecast)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums">{fmtEur(totalActual)}</td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${totalVariance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtVar(totalVariance)}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${totalVariance >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtVarPct(totalActual, totalForecast)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Forecast vs Actual by Month</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={barData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `€${Math.round(v / 1000)}k`} />
            <Tooltip
              formatter={(v, name) => [fmtEur(Number(v)), name as string]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Forecast" fill="#9ca3af" maxBarSize={28} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual"   fill="#0d9488" maxBarSize={28} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
