import { useEffect, useMemo, useState } from 'react'
import { Cr9b5_pt_forecastflowsService } from '../generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService } from '../generated/services/Cr9b5_forecastpropertiesService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import type { Cr9b5_pt_forecastflows } from '../generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties } from '../generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import { fmtEur } from '../utils/formatters'

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_INCOME  = 233100000
const TYPE_EXPENSE = 233100001

const FREQ_ONE_OFF        = 233100000
const FREQ_DAILY          = 233100001
const FREQ_WEEKLY         = 233100002
const FREQ_MONTHLY        = 233100003
const FREQ_QUARTERLY      = 233100004
const FREQ_SEMI_ANNUALLY  = 233100005
const FREQ_ANNUALLY       = 233100006

const REF_INCOME_CATEGORY  = 233100005
const REF_EXPENSE_CATEGORY = 233100006

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Types ────────────────────────────────────────────────────────────────────

interface MonthKey { year: number; month: number }   // month 0-11

/** Amounts for a single month for one logical flow */
interface MonthAmounts {
  gross: number
  vat: number
  net: number
}

/** A logical flow (possibly spanning multiple versions) */
interface LogicalFlow {
  logicalId: string          // parentflowid of oldest, or the flow id if no parent
  name: string
  type: number               // TYPE_INCOME | TYPE_EXPENSE
  categoryId: string
  contactId: string
  versions: Cr9b5_pt_forecastflows[]
  linkedPropertyIds: string[]   // union across all versions (allProperties OR specific)
  allProperties: boolean        // true if ANY version is allProperties
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Count occurrences of day-of-week (1=Mon…7=Sun) in a given month */
function countDowInMonth(year: number, month: number, dow: number): number {
  // Convert 1=Mon…7=Sun → JS getDay() 0=Sun…6=Sat
  const jsDow = dow === 7 ? 0 : dow
  let count = 0
  const days = daysInMonth(year, month)
  for (let d = 1; d <= days; d++) {
    if (new Date(year, month, d).getDay() === jsDow) count++
  }
  return count
}

function monthsBetween(startYear: number, startMonth: number, endYear: number, endMonth: number): MonthKey[] {
  const result: MonthKey[] = []
  let y = startYear, m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    result.push({ year: y, month: m })
    m++
    if (m > 11) { m = 0; y++ }
  }
  return result
}

function parseDate(s: string | undefined): { year: number; month: number } | null {
  if (!s) return null
  const [y, mo] = s.slice(0, 10).split('-').map(Number)
  return { year: y, month: mo - 1 }
}

/** Is the given month within [startDate, endDate]? endDate null = infinite */
function monthInRange(mk: MonthKey, flow: Cr9b5_pt_forecastflows): boolean {
  const start = parseDate(flow.cr9b5_startdate)
  const end   = parseDate(flow.cr9b5_enddate)
  if (!start) return false
  const after = mk.year > start.year || (mk.year === start.year && mk.month >= start.month)
  const before = !end || mk.year < end.year || (mk.year === end.year && mk.month <= end.month)
  return after && before
}

// ── Amount calculation engine ────────────────────────────────────────────────

function computeGrossForMonth(flow: Cr9b5_pt_forecastflows, mk: MonthKey): number {
  const raw = flow as unknown as Record<string, unknown>
  const gross = (raw['cr9b5_grossamount'] as number) ?? 0
  const freq = flow.cr9b5_frequency as unknown as number

  if (!monthInRange(mk, flow)) return 0

  switch (freq) {
    case FREQ_ONE_OFF:
      // Only in the exact month of startdate
      const start = parseDate(flow.cr9b5_startdate)
      if (!start) return 0
      return start.year === mk.year && start.month === mk.month ? gross : 0

    case FREQ_DAILY: {
      const dowStr = (raw['cr9b5_daysofweek'] as string) ?? ''
      if (!dowStr) return 0
      const dows = dowStr.split(',').map(Number).filter(n => n >= 1 && n <= 7)
      const count = dows.reduce((sum, d) => sum + countDowInMonth(mk.year, mk.month, d), 0)
      return Math.round(gross * count * 100) / 100
    }

    case FREQ_WEEKLY:
      return Math.round(gross * (daysInMonth(mk.year, mk.month) / 7) * 100) / 100

    case FREQ_MONTHLY:
      return gross

    case FREQ_QUARTERLY:
    case FREQ_SEMI_ANNUALLY:
    case FREQ_ANNUALLY: {
      const interval = freq === FREQ_QUARTERLY ? 3 : freq === FREQ_SEMI_ANNUALLY ? 6 : 12
      const start = parseDate(flow.cr9b5_startdate)
      if (!start) return 0
      const totalMonths = (mk.year - start.year) * 12 + (mk.month - start.month)
      return totalMonths >= 0 && totalMonths % interval === 0 ? gross : 0
    }

    default:
      return 0
  }
}

function computeAmountsForMonth(flow: Cr9b5_pt_forecastflows, mk: MonthKey): MonthAmounts {
  const gross = computeGrossForMonth(flow, mk)
  if (gross === 0) return { gross: 0, vat: 0, net: 0 }
  const vatBase = (flow.cr9b5_vatamount ?? 0)
  const grossBase = (flow as unknown as Record<string, unknown>)['cr9b5_grossamount'] as number ?? 0
  // Scale vat proportionally to gross
  const vat = grossBase > 0 ? Math.round((vatBase / grossBase) * gross * 100) / 100 : 0
  const net = Math.round((gross - vat) * 100) / 100
  return { gross, vat, net }
}

// ── Pro-rata helper ──────────────────────────────────────────────────────────

function applyProRata(amounts: MonthAmounts, ratio: number): MonthAmounts {
  if (ratio === 1) return amounts
  return {
    gross: Math.round(amounts.gross * ratio * 100) / 100,
    vat:   Math.round(amounts.vat   * ratio * 100) / 100,
    net:   Math.round(amounts.net   * ratio * 100) / 100,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ForecastView() {
  const [flows, setFlows]           = useState<Cr9b5_pt_forecastflows[]>([])
  const [flowProps, setFlowProps]   = useState<Cr9b5_forecastproperties[]>([])
  const [references, setReferences] = useState<Cr9b5_pt_references[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading]       = useState(true)

  const curYear = new Date().getFullYear()
  const [fromYear, setFromYear]     = useState(curYear)
  const [toYear, setToYear]         = useState(curYear + 2)
  const [propFilter, setPropFilter] = useState<string[]>([])  // empty = All

  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [fRes, fpRes, rRes, pRes] = await Promise.all([
        Cr9b5_pt_forecastflowsService.getAll({}),
        Cr9b5_forecastpropertiesService.getAll({}),
        Cr9b5_pt_referencesService.getAll({ orderBy: ['cr9b5_sortorder asc', 'cr9b5_value asc'] }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      ])
      setFlows(fRes.data ?? [])
      setFlowProps(fpRes.data ?? [])
      setReferences(rRes.data ?? [])
      setProperties(pRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const yearOptions = useMemo(() => {
    const opts: number[] = []
    for (let y = curYear; y <= curYear + 10; y++) opts.push(y)
    return opts
  }, [curYear])

  const months = useMemo(
    () => monthsBetween(fromYear, 0, toYear, 11),
    [fromYear, toYear],
  )

  const years = useMemo(() => {
    const ys: number[] = []
    for (let y = fromYear; y <= toYear; y++) ys.push(y)
    return ys
  }, [fromYear, toYear])

  // ── Build logical flows ──────────────────────────────────────────────────

  const logicalFlows = useMemo((): LogicalFlow[] => {
    const map = new Map<string, LogicalFlow>()

    // First pass: group by logical id (parentflowid chain)
    for (const flow of flows) {
      const raw = flow as unknown as Record<string, unknown>
      const parentId = flow._cr9b5_parentflowid_value as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
      const typeNum = flow.cr9b5_type as unknown as number

      if (!map.has(logicalId)) {
        // Find the "original" flow (no parent = the root)
        const rootFlow = flows.find(f => f.cr9b5_pt_forecastflowid === logicalId)
        map.set(logicalId, {
          logicalId,
          name: rootFlow?.cr9b5_name ?? flow.cr9b5_name ?? '',
          type: typeNum,
          categoryId: (rootFlow ?? flow)._cr9b5_categoryid_value ?? '',
          contactId:  (rootFlow ?? flow)._cr9b5_contactid_value ?? '',
          versions: [],
          linkedPropertyIds: [],
          allProperties: false,
        })
      }
      const lf = map.get(logicalId)!
      lf.versions.push(flow)
      if (flow.cr9b5_allproperties) lf.allProperties = true
    }

    // Second pass: attach property links
    for (const fp of flowProps) {
      const flowId = fp._cr9b5_forecastflowid_value ?? ''
      const propId = fp._cr9b5_propertyid_value ?? ''
      // Find which logical flow this version belongs to
      const flow = flows.find(f => f.cr9b5_pt_forecastflowid === flowId)
      if (!flow) continue
      const parentId = flow._cr9b5_parentflowid_value as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
      const lf = map.get(logicalId)
      if (lf && propId && !lf.linkedPropertyIds.includes(propId)) {
        lf.linkedPropertyIds.push(propId)
      }
    }

    return Array.from(map.values())
  }, [flows, flowProps])

  // ── Pro-rata ratio for a logical flow given current property filter ───────

  function proRataRatio(lf: LogicalFlow): number {
    if (propFilter.length === 0) return 1  // All → no pro-rata needed

    if (lf.allProperties) {
      const total = properties.length
      if (total === 0) return 0
      const matching = propFilter.filter(pid =>
        properties.some(p => p.cr9b5_pt_propertyid === pid)
      ).length
      return matching / total
    } else {
      const total = lf.linkedPropertyIds.length
      if (total === 0) return 0
      const matching = propFilter.filter(pid => lf.linkedPropertyIds.includes(pid)).length
      if (matching === 0) return -1  // exclude entirely
      return matching / total
    }
  }

  // ── Compute amounts per logical flow per month ────────────────────────────

  const flowAmounts = useMemo((): Map<string, Map<string, MonthAmounts>> => {
    const result = new Map<string, Map<string, MonthAmounts>>()

    for (const lf of logicalFlows) {
      const ratio = proRataRatio(lf)
      if (ratio === -1) continue  // excluded by property filter

      const byMonth = new Map<string, MonthAmounts>()
      for (const mk of months) {
        const key = `${mk.year}-${mk.month}`
        let combined: MonthAmounts = { gross: 0, vat: 0, net: 0 }
        for (const version of lf.versions) {
          const a = computeAmountsForMonth(version, mk)
          combined = {
            gross: combined.gross + a.gross,
            vat:   combined.vat   + a.vat,
            net:   combined.net   + a.net,
          }
        }
        const proRated = applyProRata(combined, ratio)
        byMonth.set(key, proRated)
      }
      result.set(lf.logicalId, byMonth)
    }
    return result
  }, [logicalFlows, months, propFilter, properties])

  // ── Accessors ─────────────────────────────────────────────────────────────

  function getAmt(logicalId: string, mk: MonthKey): MonthAmounts {
    return flowAmounts.get(logicalId)?.get(`${mk.year}-${mk.month}`) ?? { gross: 0, vat: 0, net: 0 }
  }

  function sumCategory(categoryId: string, type: number, mk: MonthKey, field: keyof MonthAmounts): number {
    return logicalFlows
      .filter(lf => lf.type === type && lf.categoryId === categoryId && flowAmounts.has(lf.logicalId))
      .reduce((s, lf) => s + getAmt(lf.logicalId, mk)[field], 0)
  }

  function sumType(type: number, mk: MonthKey, field: keyof MonthAmounts): number {
    return logicalFlows
      .filter(lf => lf.type === type && flowAmounts.has(lf.logicalId))
      .reduce((s, lf) => s + getAmt(lf.logicalId, mk)[field], 0)
  }

  function yearTotal(logicalId: string, year: number, field: keyof MonthAmounts): number {
    return months
      .filter(mk => mk.year === year)
      .reduce((s, mk) => s + getAmt(logicalId, mk)[field], 0)
  }

  function yearCategoryTotal(categoryId: string, type: number, year: number, field: keyof MonthAmounts): number {
    return months
      .filter(mk => mk.year === year)
      .reduce((s, mk) => s + sumCategory(categoryId, type, mk, field), 0)
  }

  function yearTypeTotal(type: number, year: number, field: keyof MonthAmounts): number {
    return months
      .filter(mk => mk.year === year)
      .reduce((s, mk) => s + sumType(type, mk, field), 0)
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleExpandAll() {
    if (allExpanded) {
      setExpanded(new Set())
      setAllExpanded(false)
    } else {
      const allKeys = new Set<string>()
      for (const type of [TYPE_INCOME, TYPE_EXPENSE]) {
        const cats = type === TYPE_INCOME ? incomeCategories : expenseCategories
        cats.forEach(c => allKeys.add(`cat-${type}-${c.cr9b5_pt_referenceid}`))
      }
      setExpanded(allKeys)
      setAllExpanded(true)
    }
  }

  // ── Derived lists ─────────────────────────────────────────────────────────

  const incomeCategories = useMemo(
    () => references.filter(r => (r.cr9b5_referencetype as unknown as number) === REF_INCOME_CATEGORY),
    [references],
  )
  const expenseCategories = useMemo(
    () => references.filter(r => (r.cr9b5_referencetype as unknown as number) === REF_EXPENSE_CATEGORY),
    [references],
  )

  function contactName(id: string): string {
    return ''  // We don't have contacts loaded in view — use flow name instead
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function fmtCell(n: number): string {
    if (n === 0) return '—'
    return fmtEur(Math.round(n * 100) / 100)
  }

  const totalCols = years.length * 13  // 12 months + 1 year total, per year

  // Column header structure: for each year, 12 months + 1 year total
  const colCount = years.reduce((s) => s + 13, 0) + 1  // +1 for label col

  function renderYearHeaders() {
    return (
      <tr className="bg-gray-100">
        <th className="sticky left-0 bg-gray-100 px-3 py-2 text-left text-xs font-semibold text-gray-600 min-w-[220px] z-10"></th>
        {years.map(y => (
          <th
            key={y}
            colSpan={13}
            className="px-2 py-2 text-center text-xs font-bold text-gray-700 border-l border-gray-300"
          >
            {y}
          </th>
        ))}
      </tr>
    )
  }

  function renderMonthHeaders() {
    return (
      <tr className="bg-gray-50 border-b border-gray-200">
        <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500 min-w-[220px] z-10">
          <button
            onClick={toggleExpandAll}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium"
          >
            {allExpanded ? '− Collapse All' : '+ Expand All'}
          </button>
        </th>
        {years.map(y => (
          <>
            {MONTH_NAMES.map((mn, mi) => (
              <th key={`${y}-${mi}`} className={[
                'px-1.5 py-2 text-center text-xs font-medium text-gray-500 whitespace-nowrap',
                mi === 0 ? 'border-l border-gray-300' : '',
              ].join(' ')}>
                {mn}
              </th>
            ))}
            <th key={`${y}-total`} className="px-2 py-2 text-center text-xs font-semibold text-gray-600 border-l border-gray-200 whitespace-nowrap">
              Total
            </th>
          </>
        ))}
      </tr>
    )
  }

  function renderAmountRow(
    label: string,
    field: keyof MonthAmounts,
    getMonthVal: (mk: MonthKey) => number,
    getYearVal: (year: number) => number,
    opts: {
      bold?: boolean
      indent?: number
      separator?: boolean
      subtle?: boolean
      positive?: boolean  // force green tint
      negative?: boolean  // force red tint
    } = {},
  ) {
    const { bold, indent = 0, separator, subtle, positive, negative } = opts
    const rowCls = [
      'border-b',
      separator ? 'border-gray-300 bg-gray-50' : 'border-gray-100',
      subtle ? 'text-gray-400' : '',
    ].join(' ')
    const labelCls = [
      'sticky left-0 px-3 py-1.5 text-sm z-10 whitespace-nowrap',
      separator ? 'bg-gray-50' : 'bg-white',
      bold ? 'font-bold text-gray-900' : 'text-gray-700',
      indent === 1 ? 'pl-6' : indent === 2 ? 'pl-10' : '',
    ].join(' ')

    return (
      <tr className={rowCls}>
        <td className={labelCls}>{label}</td>
        {years.map(y => (
          <>
            {months.filter(mk => mk.year === y).map(mk => {
              const v = Math.round(getMonthVal(mk) * 100) / 100
              const neg = negative || (!positive && v < 0)
              const pos = positive || (!negative && v > 0)
              return (
                <td key={`${mk.year}-${mk.month}`} className={[
                  'px-1.5 py-1.5 text-right text-xs whitespace-nowrap',
                  mk.month === 0 ? 'border-l border-gray-300' : '',
                  neg ? 'text-red-600' : pos ? 'text-gray-800' : 'text-gray-400',
                ].join(' ')}>
                  {fmtCell(v)}
                </td>
              )
            })}
            <td key={`${y}-ytotal`} className={[
              'px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap border-l border-gray-200',
              bold ? 'font-bold' : '',
            ].join(' ')}>
              {fmtCell(Math.round(getYearVal(y) * 100) / 100)}
            </td>
          </>
        ))}
      </tr>
    )
  }

  function renderCategorySection(
    type: number,
    cats: Cr9b5_pt_references[],
    field: keyof MonthAmounts,
  ) {
    return cats.map(cat => {
      const catKey = `cat-${type}-${cat.cr9b5_pt_referenceid}`
      const isOpen = expanded.has(catKey)
      const catFlows = logicalFlows.filter(
        lf => lf.type === type && lf.categoryId === cat.cr9b5_pt_referenceid && flowAmounts.has(lf.logicalId)
      )
      if (catFlows.length === 0) return null

      return (
        <>
          {/* Category row */}
          <tr
            key={catKey}
            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
            onClick={() => toggleExpand(catKey)}
          >
            <td className="sticky left-0 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 pl-6 z-10 whitespace-nowrap">
              <span className="mr-1.5 text-gray-400 text-xs">{isOpen ? '▾' : '▸'}</span>
              {cat.cr9b5_value}
            </td>
            {years.map(y => (
              <>
                {months.filter(mk => mk.year === y).map(mk => (
                  <td key={`${mk.year}-${mk.month}`} className={[
                    'px-1.5 py-1.5 text-right text-xs whitespace-nowrap',
                    mk.month === 0 ? 'border-l border-gray-300' : '',
                  ].join(' ')}>
                    {fmtCell(Math.round(sumCategory(cat.cr9b5_pt_referenceid, type, mk, field) * 100) / 100)}
                  </td>
                ))}
                <td key={`${y}-ytotal`} className="px-2 py-1.5 text-right text-xs font-semibold whitespace-nowrap border-l border-gray-200">
                  {fmtCell(Math.round(yearCategoryTotal(cat.cr9b5_pt_referenceid, type, y, field) * 100) / 100)}
                </td>
              </>
            ))}
          </tr>

          {/* Flow rows (expanded) */}
          {isOpen && catFlows.map(lf => (
            <tr key={lf.logicalId} className="border-b border-gray-50 bg-gray-50/50">
              <td className="sticky left-0 bg-gray-50/50 px-3 py-1 text-xs text-gray-600 pl-12 z-10 whitespace-nowrap">
                {lf.name}
                {lf.contactId && (
                  <span className="ml-1 text-gray-400">— {lf.contactId}</span>
                )}
              </td>
              {years.map(y => (
                <>
                  {months.filter(mk => mk.year === y).map(mk => (
                    <td key={`${mk.year}-${mk.month}`} className={[
                      'px-1.5 py-1 text-right text-xs text-gray-500 whitespace-nowrap',
                      mk.month === 0 ? 'border-l border-gray-300' : '',
                    ].join(' ')}>
                      {fmtCell(Math.round(getAmt(lf.logicalId, mk)[field] * 100) / 100)}
                    </td>
                  ))}
                  <td key={`${y}-ytotal`} className="px-2 py-1 text-right text-xs text-gray-500 whitespace-nowrap border-l border-gray-200">
                    {fmtCell(Math.round(yearTotal(lf.logicalId, y, field) * 100) / 100)}
                  </td>
                </>
              ))}
            </tr>
          ))}
        </>
      )
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Forecast View</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3">
        {/* Year range */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600 font-medium">From</label>
          <select
            value={fromYear}
            onChange={e => {
              const v = Number(e.target.value)
              setFromYear(v)
              if (toYear < v) setToYear(v)
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <label className="text-gray-600 font-medium">To</label>
          <select
            value={toYear}
            onChange={e => {
              const v = Number(e.target.value)
              setToYear(v)
              if (fromYear > v) setFromYear(v)
            }}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Property filter */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600 font-medium">Properties</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPropFilter([])}
              className={[
                'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                propFilter.length === 0
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50',
              ].join(' ')}
            >
              All
            </button>
            {properties.map(p => {
              const sel = propFilter.includes(p.cr9b5_pt_propertyid)
              return (
                <button
                  key={p.cr9b5_pt_propertyid}
                  onClick={() => setPropFilter(prev =>
                    sel
                      ? prev.filter(id => id !== p.cr9b5_pt_propertyid)
                      : [...prev, p.cr9b5_pt_propertyid]
                  )}
                  className={[
                    'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                    sel
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                  ].join(' ')}
                >
                  {p.cr9b5_name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="text-sm border-collapse">
            <thead>
              {renderYearHeaders()}
              {renderMonthHeaders()}
            </thead>
            <tbody>
              {/* ── INCOME ── */}
              <tr className="bg-green-50 border-b border-green-200">
                <td className="sticky left-0 bg-green-50 px-3 py-2 text-sm font-bold text-green-800 uppercase tracking-wide z-10" colSpan={1}>
                  INCOME
                </td>
                {years.map(y => (
                  <>
                    {Array.from({ length: 12 }, (_, mi) => (
                      <td key={`${y}-${mi}`} className={mi === 0 ? 'border-l border-gray-300' : ''} />
                    ))}
                    <td className="border-l border-gray-200" />
                  </>
                ))}
              </tr>

              {renderCategorySection(TYPE_INCOME, incomeCategories, 'net')}

              {renderAmountRow(
                'TOTAL INCOME',
                'net',
                mk => sumType(TYPE_INCOME, mk, 'net'),
                y  => yearTypeTotal(TYPE_INCOME, y, 'net'),
                { bold: true, separator: true },
              )}

              {/* ── EXPENSES ── */}
              <tr className="bg-red-50 border-b border-red-200">
                <td className="sticky left-0 bg-red-50 px-3 py-2 text-sm font-bold text-red-800 uppercase tracking-wide z-10" colSpan={1}>
                  EXPENSES
                </td>
                {years.map(y => (
                  <>
                    {Array.from({ length: 12 }, (_, mi) => (
                      <td key={`${y}-${mi}`} className={mi === 0 ? 'border-l border-gray-300' : ''} />
                    ))}
                    <td className="border-l border-gray-200" />
                  </>
                ))}
              </tr>

              {renderCategorySection(TYPE_EXPENSE, expenseCategories, 'net')}

              {renderAmountRow(
                'TOTAL EXPENSES',
                'net',
                mk => sumType(TYPE_EXPENSE, mk, 'net'),
                y  => yearTypeTotal(TYPE_EXPENSE, y, 'net'),
                { bold: true, separator: true },
              )}

              {/* ── VAT ── */}
              <tr className="bg-gray-100 border-b border-gray-200">
                <td className="sticky left-0 bg-gray-100 px-3 py-1 z-10" />
                {years.map(y => (
                  <>
                    {Array.from({ length: 12 }, (_, mi) => (
                      <td key={`${y}-${mi}`} className={mi === 0 ? 'border-l border-gray-300' : ''} />
                    ))}
                    <td className="border-l border-gray-200" />
                  </>
                ))}
              </tr>

              {renderAmountRow(
                'VAT COLLECTED (income)',
                'vat',
                mk => sumType(TYPE_INCOME,  mk, 'vat'),
                y  => yearTypeTotal(TYPE_INCOME,  y, 'vat'),
                { subtle: true },
              )}
              {renderAmountRow(
                'VAT PAID (expenses)',
                'vat',
                mk => sumType(TYPE_EXPENSE, mk, 'vat'),
                y  => yearTypeTotal(TYPE_EXPENSE, y, 'vat'),
                { subtle: true },
              )}
              {renderAmountRow(
                'NET VAT',
                'vat',
                mk => Math.round((sumType(TYPE_INCOME, mk, 'vat') - sumType(TYPE_EXPENSE, mk, 'vat')) * 100) / 100,
                y  => Math.round((yearTypeTotal(TYPE_INCOME, y, 'vat') - yearTypeTotal(TYPE_EXPENSE, y, 'vat')) * 100) / 100,
                { bold: true, separator: true },
              )}

              {/* ── CASH FLOW ── */}
              <tr className="bg-gray-100 border-b border-gray-200">
                <td className="sticky left-0 bg-gray-100 px-3 py-1 z-10" />
                {years.map(y => (
                  <>
                    {Array.from({ length: 12 }, (_, mi) => (
                      <td key={`${y}-${mi}`} className={mi === 0 ? 'border-l border-gray-300' : ''} />
                    ))}
                    <td className="border-l border-gray-200" />
                  </>
                ))}
              </tr>

              {renderAmountRow(
                'CASH INFLOW',
                'gross',
                mk => sumType(TYPE_INCOME,  mk, 'gross'),
                y  => yearTypeTotal(TYPE_INCOME,  y, 'gross'),
                { positive: true },
              )}
              {renderAmountRow(
                'CASH OUTFLOW',
                'gross',
                mk => sumType(TYPE_EXPENSE, mk, 'gross'),
                y  => yearTypeTotal(TYPE_EXPENSE, y, 'gross'),
                { negative: true },
              )}
              {renderAmountRow(
                'NET CASH FLOW',
                'gross',
                mk => Math.round((sumType(TYPE_INCOME, mk, 'gross') - sumType(TYPE_EXPENSE, mk, 'gross')) * 100) / 100,
                y  => Math.round((yearTypeTotal(TYPE_INCOME, y, 'gross') - yearTypeTotal(TYPE_EXPENSE, y, 'gross')) * 100) / 100,
                { bold: true, separator: true },
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
