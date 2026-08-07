import { useEffect, useMemo, useState, Fragment } from 'react'
import { makeStyles, tokens, mergeClasses, Text, Button } from '@fluentui/react-components'
import { Cr9b5_pt_forecastflowsService } from '../generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService } from '../generated/services/Cr9b5_forecastpropertiesService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import type { Cr9b5_pt_forecastflows } from '../generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties } from '../generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import { formatMoney } from '@/domain/money'

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

interface MonthKey { year: number; month: number }

interface MonthAmounts {
  gross: number
  vat: number
  net: number
}

interface LogicalFlow {
  logicalId: string
  name: string
  type: number
  categoryId: string
  contactId: string
  versions: Cr9b5_pt_forecastflows[]
  linkedPropertyIds: string[]
  allProperties: boolean
}

// ── Calendar helpers ─────────────────────────────────────────────────────────

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

function monthInRange(mk: MonthKey, flow: Cr9b5_pt_forecastflows): boolean {
  const start = parseDate(flow.cr9b5_startdate)
  const end   = parseDate(flow.cr9b5_enddate)
  if (!start) return false
  const after  = mk.year > start.year || (mk.year === start.year && mk.month >= start.month)
  const before = !end || mk.year < end.year || (mk.year === end.year && mk.month <= end.month)
  return after && before
}

// ── Amount calculation engine ────────────────────────────────────────────────

function computeGrossForMonth(flow: Cr9b5_pt_forecastflows, mk: MonthKey): number {
  const raw   = flow as unknown as Record<string, unknown>
  const gross = (raw['cr9b5_grossamount'] as number) ?? 0
  const freq  = Number(flow.cr9b5_frequency)

  if (!monthInRange(mk, flow)) return 0

  switch (freq) {
    case FREQ_ONE_OFF: {
      const start = parseDate(flow.cr9b5_startdate)
      if (!start) return 0
      return start.year === mk.year && start.month === mk.month ? gross : 0
    }
    case FREQ_DAILY: {
      const dowStr = (raw['cr9b5_daysofweek'] as string) ?? ''
      if (!dowStr) return 0
      const dows  = dowStr.split(',').map(Number).filter(n => n >= 1 && n <= 7)
      const count = dows.reduce((s, d) => s + countDowInMonth(mk.year, mk.month, d), 0)
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
  const vatBase   = flow.cr9b5_vatamount ?? 0
  const grossBase = (flow as unknown as Record<string, unknown>)['cr9b5_grossamount'] as number ?? 0
  const vat = grossBase > 0 ? Math.round((vatBase / grossBase) * gross * 100) / 100 : 0
  const net = Math.round((gross - vat) * 100) / 100
  return { gross, vat, net }
}

function applyProRata(a: MonthAmounts, ratio: number): MonthAmounts {
  if (ratio === 1) return a
  return {
    gross: Math.round(a.gross * ratio * 100) / 100,
    vat:   Math.round(a.vat   * ratio * 100) / 100,
    net:   Math.round(a.net   * ratio * 100) / 100,
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  filterBar: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '12px' },
  yearNav: { display: 'flex', alignItems: 'center', gap: '4px' },
  yearBtn: { width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, color: tokens.colorNeutralForeground2, fontSize: '18px', fontWeight: 700, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer' },
  yearLabel: { width: '64px', textAlign: 'center', fontSize: '14px', fontWeight: 700, userSelect: 'none' },
  propFilter: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', flexWrap: 'wrap' },
  chip: { padding: '4px 10px', borderRadius: tokens.borderRadiusMedium, fontSize: '12px', fontWeight: 500, border: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground3 },
  empty: { textAlign: 'center', padding: '64px', color: tokens.colorNeutralForeground4 },
  tableWrap: { overflowX: 'auto', borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  table: { fontSize: '14px', borderCollapse: 'collapse', width: '100%' },
  theadRow: { backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  thLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground3, minWidth: '220px', zIndex: 1 },
  th: { padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  thTotal: { padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground2, borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  sectionHeader: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  sectionHeaderCell: { position: 'sticky', left: 0, padding: '8px 12px', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', zIndex: 1 },
  incomeBg: { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 },
  expenseBg: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1 },
  spacerRow: { backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  spacerCell: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '2px', zIndex: 1 },
  catRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer' },
  catLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground1, padding: '6px 12px 6px 24px', fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground1, zIndex: 1, whiteSpace: 'nowrap' },
  catCaret: { marginRight: '6px', color: tokens.colorNeutralForeground4, fontSize: '12px' },
  cellNum: { padding: '6px 8px', textAlign: 'right', fontSize: '12px', whiteSpace: 'nowrap' },
  cellTotal: { padding: '6px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  flowRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2 },
  flowLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '4px 12px 4px 48px', fontSize: '12px', color: tokens.colorNeutralForeground3, zIndex: 1, whiteSpace: 'nowrap' },
  flowCell: { padding: '4px 8px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  amtRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  amtRowSeparator: { backgroundColor: tokens.colorNeutralBackground2 },
  amtRowSubtle: { opacity: 0.6 },
  amtLabel: { position: 'sticky', left: 0, padding: '6px 12px', fontSize: '14px', backgroundColor: tokens.colorNeutralBackground1, zIndex: 1, whiteSpace: 'nowrap' },
  amtLabelSep: { backgroundColor: tokens.colorNeutralBackground2 },
  amtLabelBold: { fontWeight: 700, color: tokens.colorNeutralForeground1 },
  amtLabelReg: { color: tokens.colorNeutralForeground2 },
  amtCellBold: { fontWeight: 700, color: tokens.colorNeutralForeground1 },
  amtCellReg: { fontWeight: 600, color: tokens.colorNeutralForeground2 },
  neg: { color: tokens.colorPaletteRedForeground1 },
  pos: { color: tokens.colorNeutralForeground1 },
  neutral: { color: tokens.colorNeutralForeground4 },
})

// ── Component ────────────────────────────────────────────────────────────────

export default function ForecastView() {
  const s = useStyles()
  const [flows, setFlows]           = useState<Cr9b5_pt_forecastflows[]>([])
  const [flowProps, setFlowProps]   = useState<Cr9b5_forecastproperties[]>([])
  const [references, setReferences] = useState<Cr9b5_pt_references[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading]       = useState(true)

  const curYear = new Date().getFullYear()
  const minYear = curYear
  const maxYear = curYear + 10

  const [year, setYear]             = useState(curYear)
  const [propFilter, setPropFilter] = useState<string[]>([])

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

  // 12 months of the selected year
  const months = useMemo(
    (): MonthKey[] => Array.from({ length: 12 }, (_, m) => ({ year, month: m })),
    [year],
  )

  // ── Build logical flows ──────────────────────────────────────────────────

  const logicalFlows = useMemo((): LogicalFlow[] => {
    const map = new Map<string, LogicalFlow>()

    for (const flow of flows) {
      const parentId = flow._cr9b5_parentflowid_value as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
      const typeNum = Number(flow.cr9b5_type)

      if (!map.has(logicalId)) {
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

    for (const fp of flowProps) {
      const flowId = fp._cr9b5_forecastflowid_value ?? ''
      const propId = fp._cr9b5_propertyid_value ?? ''
      const flow = flows.find(f => f.cr9b5_pt_forecastflowid === flowId)
      if (!flow) continue
      const parentId  = flow._cr9b5_parentflowid_value as string | undefined
      const logicalId = parentId ?? flow.cr9b5_pt_forecastflowid
      const lf = map.get(logicalId)
      if (lf && propId && !lf.linkedPropertyIds.includes(propId)) {
        lf.linkedPropertyIds.push(propId)
      }
    }

    return Array.from(map.values())
  }, [flows, flowProps])

  // ── Pro-rata ratio ───────────────────────────────────────────────────────

  function proRataRatio(lf: LogicalFlow): number {
    if (propFilter.length === 0) return 1

    if (lf.allProperties) {
      const total = properties.length
      if (total === 0) return 0
      const matching = propFilter.filter(pid => properties.some(p => p.cr9b5_pt_propertyid === pid)).length
      return matching / total
    } else {
      const total = lf.linkedPropertyIds.length
      if (total === 0) return 0
      const matching = propFilter.filter(pid => lf.linkedPropertyIds.includes(pid)).length
      if (matching === 0) return -1
      return matching / total
    }
  }

  // ── Compute amounts per logical flow per month ────────────────────────────

  const flowAmounts = useMemo((): Map<string, Map<string, MonthAmounts>> => {
    const result = new Map<string, Map<string, MonthAmounts>>()
    for (const lf of logicalFlows) {
      const ratio = proRataRatio(lf)
      if (ratio === -1) continue

      const byMonth = new Map<string, MonthAmounts>()
      for (const mk of months) {
        const key = `${mk.year}-${mk.month}`
        let combined: MonthAmounts = { gross: 0, vat: 0, net: 0 }
        for (const version of lf.versions) {
          const a = computeAmountsForMonth(version, mk)
          combined = { gross: combined.gross + a.gross, vat: combined.vat + a.vat, net: combined.net + a.net }
        }
        byMonth.set(key, applyProRata(combined, ratio))
      }
      result.set(lf.logicalId, byMonth)
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function yearTotal(logicalId: string, field: keyof MonthAmounts): number {
    return months.reduce((s, mk) => s + getAmt(logicalId, mk)[field], 0)
  }

  function yearCategoryTotal(categoryId: string, type: number, field: keyof MonthAmounts): number {
    return months.reduce((s, mk) => s + sumCategory(categoryId, type, mk, field), 0)
  }

  function yearTypeTotal(type: number, field: keyof MonthAmounts): number {
    return months.reduce((s, mk) => s + sumType(type, mk, field), 0)
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
    () => references.filter(r => Number(r.cr9b5_referencetype) === REF_INCOME_CATEGORY),
    [references],
  )
  const expenseCategories = useMemo(
    () => references.filter(r => Number(r.cr9b5_referencetype) === REF_EXPENSE_CATEGORY),
    [references],
  )

  // ── Render helpers ────────────────────────────────────────────────────────

  function fmtCell(n: number): string {
    if (n === 0) return '—'
    return formatMoney(Math.round(n * 100) / 100)
  }

  function renderAmountRow(
    label: string,
    _field: keyof MonthAmounts,
    getMonthVal: (mk: MonthKey) => number,
    getYearVal: () => number,
    opts: {
      bold?: boolean
      separator?: boolean
      subtle?: boolean
      positive?: boolean
      negative?: boolean
    } = {},
  ) {
    const { bold, separator, subtle, positive, negative } = opts
    return (
      <tr key={label} className={mergeClasses(s.amtRow, separator && s.amtRowSeparator, subtle && s.amtRowSubtle)}>
        <td className={mergeClasses(s.amtLabel, separator && s.amtLabelSep, bold ? s.amtLabelBold : s.amtLabelReg)}>{label}</td>
        {months.map(mk => {
          const v = Math.round(getMonthVal(mk) * 100) / 100
          const neg = negative || (!positive && v < 0)
          const pos = positive || (!negative && v > 0)
          return (
            <td key={`${mk.year}-${mk.month}`} className={mergeClasses(s.cellNum, neg ? s.neg : pos ? s.pos : s.neutral)}>
              {fmtCell(v)}
            </td>
          )
        })}
        <td className={mergeClasses(s.cellTotal, bold ? s.amtCellBold : s.amtCellReg)}>
          {fmtCell(Math.round(getYearVal() * 100) / 100)}
        </td>
      </tr>
    )
  }

  function renderCategorySection(type: number, cats: Cr9b5_pt_references[], field: keyof MonthAmounts) {
    return cats.map(cat => {
      const catKey  = `cat-${type}-${cat.cr9b5_pt_referenceid}`
      const isOpen  = expanded.has(catKey)
      const catFlows = logicalFlows.filter(
        lf => lf.type === type && lf.categoryId === cat.cr9b5_pt_referenceid && flowAmounts.has(lf.logicalId)
      )
      if (catFlows.length === 0) return null

      return (
        <Fragment key={catKey}>
          <tr className={s.catRow} onClick={() => toggleExpand(catKey)}>
            <td className={s.catLabel}>
              <span className={s.catCaret}>{isOpen ? '▾' : '▸'}</span>
              {cat.cr9b5_value}
            </td>
            {months.map(mk => (
              <td key={`${mk.year}-${mk.month}`} className={s.cellNum}>
                {fmtCell(Math.round(sumCategory(cat.cr9b5_pt_referenceid, type, mk, field) * 100) / 100)}
              </td>
            ))}
            <td className={mergeClasses(s.cellTotal, s.amtCellReg)}>
              {fmtCell(Math.round(yearCategoryTotal(cat.cr9b5_pt_referenceid, type, field) * 100) / 100)}
            </td>
          </tr>

          {isOpen && catFlows.map(lf => (
            <tr key={lf.logicalId} className={s.flowRow}>
              <td className={s.flowLabel}>{lf.name}</td>
              {months.map(mk => (
                <td key={`${mk.year}-${mk.month}`} className={s.flowCell}>
                  {fmtCell(Math.round(getAmt(lf.logicalId, mk)[field] * 100) / 100)}
                </td>
              ))}
              <td className={mergeClasses(s.flowCell, s.cellTotal)}>
                {fmtCell(Math.round(yearTotal(lf.logicalId, field) * 100) / 100)}
              </td>
            </tr>
          ))}
        </Fragment>
      )
    })
  }

  function renderSectionHeader(label: string, colorCls: string) {
    return (
      <tr className={s.sectionHeader}>
        <td className={mergeClasses(s.sectionHeaderCell, colorCls)} colSpan={14}>
          {label}
        </td>
      </tr>
    )
  }

  function renderSpacer() {
    return (
      <tr className={s.spacerRow}>
        <td className={s.spacerCell} colSpan={14} />
      </tr>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={s.root}>
      <Text size={600} weight="semibold">Forecast View</Text>

      {/* Filters */}
      <div className={s.filterBar}>
        {/* Year navigator */}
        <div className={s.yearNav}>
          <button onClick={() => setYear(y => Math.max(minYear, y - 1))} disabled={year <= minYear} className={s.yearBtn} style={year <= minYear ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}>‹</button>
          <span className={s.yearLabel}>{year}</span>
          <button onClick={() => setYear(y => Math.min(maxYear, y + 1))} disabled={year >= maxYear} className={s.yearBtn} style={year >= maxYear ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}>›</button>
        </div>

        {/* Property filter */}
        <div className={s.propFilter}>
          <Text weight="medium" size={300}>Properties:</Text>
          <button onClick={() => setPropFilter([])} className={s.chip} style={propFilter.length === 0 ? { border: '1px solid #0F766E', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : undefined}>All</button>
          {properties.map(p => {
            const sel = propFilter.includes(p.cr9b5_pt_propertyid)
            return (
              <button
                key={p.cr9b5_pt_propertyid}
                onClick={() => setPropFilter(prev => sel ? prev.filter(id => id !== p.cr9b5_pt_propertyid) : [...prev, p.cr9b5_pt_propertyid])}
                className={s.chip}
                style={sel ? { border: '1px solid #0F766E', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : undefined}
              >
                {p.cr9b5_name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.empty}>Loading…</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.thLabel}>
                  <Button appearance="transparent" size="small" onClick={toggleExpandAll} style={{ color: '#0F766E', fontWeight: 500 }}>
                    {allExpanded ? '− Collapse All' : '+ Expand All'}
                  </Button>
                </th>
                {MONTH_NAMES.map(mn => (
                  <th key={mn} className={s.th}>{mn}</th>
                ))}
                <th className={s.thTotal}>{year} Total</th>
              </tr>
            </thead>
            <tbody>
              {/* INCOME */}
              {renderSectionHeader('INCOME', s.incomeBg)}
              {renderCategorySection(TYPE_INCOME, incomeCategories, 'net')}
              {renderAmountRow('TOTAL INCOME', 'net',
                mk => sumType(TYPE_INCOME, mk, 'net'),
                () => yearTypeTotal(TYPE_INCOME, 'net'),
                { bold: true, separator: true },
              )}

              {renderSpacer()}

              {/* EXPENSES */}
              {renderSectionHeader('EXPENSES', s.expenseBg)}
              {renderCategorySection(TYPE_EXPENSE, expenseCategories, 'net')}
              {renderAmountRow('TOTAL EXPENSES', 'net',
                mk => sumType(TYPE_EXPENSE, mk, 'net'),
                () => yearTypeTotal(TYPE_EXPENSE, 'net'),
                { bold: true, separator: true },
              )}

              {renderSpacer()}

              {/* VAT */}
              {renderAmountRow('VAT COLLECTED (income)',  'vat', mk => sumType(TYPE_INCOME,  mk, 'vat'), () => yearTypeTotal(TYPE_INCOME,  'vat'), { subtle: true })}
              {renderAmountRow('VAT PAID (expenses)',     'vat', mk => sumType(TYPE_EXPENSE, mk, 'vat'), () => yearTypeTotal(TYPE_EXPENSE, 'vat'), { subtle: true })}
              {renderAmountRow('NET VAT', 'vat',
                mk => Math.round((sumType(TYPE_INCOME, mk, 'vat') - sumType(TYPE_EXPENSE, mk, 'vat')) * 100) / 100,
                () => Math.round((yearTypeTotal(TYPE_INCOME, 'vat') - yearTypeTotal(TYPE_EXPENSE, 'vat')) * 100) / 100,
                { bold: true, separator: true },
              )}

              {renderSpacer()}

              {/* CASH FLOW */}
              {renderAmountRow('CASH INFLOW',  'gross', mk => sumType(TYPE_INCOME,  mk, 'gross'), () => yearTypeTotal(TYPE_INCOME,  'gross'), { positive: true })}
              {renderAmountRow('CASH OUTFLOW', 'gross', mk => sumType(TYPE_EXPENSE, mk, 'gross'), () => yearTypeTotal(TYPE_EXPENSE, 'gross'), { negative: true })}
              {renderAmountRow('NET CASH FLOW', 'gross',
                mk => Math.round((sumType(TYPE_INCOME, mk, 'gross') - sumType(TYPE_EXPENSE, mk, 'gross')) * 100) / 100,
                () => Math.round((yearTypeTotal(TYPE_INCOME, 'gross') - yearTypeTotal(TYPE_EXPENSE, 'gross')) * 100) / 100,
                { bold: true, separator: true },
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
