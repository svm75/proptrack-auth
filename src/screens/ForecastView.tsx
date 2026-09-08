import { useMemo, useState, Fragment } from 'react'
import {
  makeStyles, tokens, mergeClasses, Text, Button, Select, Input, Field,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import {
  useForecastFlows, useForecastFlowProperties, useForecastFlowComponents, useReferenceData,
  useProperties, useInvoices, useForecastScenarios, useSaveForecastScenario, useDeleteForecastScenario,
} from '@/hooks/data'
import { CategoryType, ForecastFlowType, InvoiceType } from '@/domain/types'
import type { ForecastFlow, ForecastFlowComponent, ForecastScenario, ReferenceData } from '@/domain/types'
import { formatMoney } from '@/domain/money'

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_INCOME  = ForecastFlowType.Income
const TYPE_EXPENSE = ForecastFlowType.Expense

const FREQ_ONE_OFF        = 233100000
const FREQ_DAILY          = 233100001
const FREQ_WEEKLY         = 233100002
const FREQ_MONTHLY        = 233100003
const FREQ_QUARTERLY      = 233100004
const FREQ_SEMI_ANNUALLY  = 233100005
const FREQ_ANNUALLY       = 233100006

const REF_INCOME_CATEGORY  = CategoryType.Income
const REF_EXPENSE_CATEGORY = CategoryType.Expense

const AMOUNT_SOURCE_CALCULATED = 925060001
const DIRECTION_SUBTRACT = 925060001

// Invoices.type uses the OPPOSITE numbering from ForecastFlows.type
// — Income on Invoices is Expense on ForecastFlows. See docs/schema.md.
const INV_TYPE_INCOME  = InvoiceType.Income
const INV_TYPE_EXPENSE = InvoiceType.Expense

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
  versions: ForecastFlow[]
  linkedPropertyIds: string[]
  allProperties: boolean
}

type DisplayMode = 'forecast' | 'both' | 'blend'

interface ScenarioForm { id: string | null; name: string; incomePct: string; expensePct: string; propertyId: string; notes: string }
function emptyScenarioForm(): ScenarioForm {
  return { id: null, name: '', incomePct: '', expensePct: '', propertyId: '', notes: '' }
}
function scenarioToForm(sc: ForecastScenario): ScenarioForm {
  return {
    id: sc.id, name: sc.name ?? '',
    incomePct: String(sc.incomeAdjustmentPct ?? ''), expensePct: String(sc.expenseAdjustmentPct ?? ''),
    propertyId: sc.propertyId ?? '', notes: sc.notes ?? '',
  }
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

function monthInRange(mk: MonthKey, flow: ForecastFlow): boolean {
  const start = parseDate(flow.startDate)
  const end   = parseDate(flow.endDate)
  if (!start) return false
  const after  = mk.year > start.year || (mk.year === start.year && mk.month >= start.month)
  const before = !end || mk.year < end.year || (mk.year === end.year && mk.month <= end.month)
  return after && before
}

function isMonthClosed(mk: MonthKey): boolean {
  const monthEndExclusive = new Date(mk.year, mk.month + 1, 1)
  return monthEndExclusive <= new Date()
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

function logicalIdOf(flow: ForecastFlow): string {
  return flow.parentFlowId ?? flow.id
}

// ── Amount calculation engine ────────────────────────────────────────────────
// Fixed flows compute from their own frequency/amount; Calculated flows derive
// their amount, per month, as Percentage% of the signed sum of their linked
// component flows' own (recursively resolved) amounts for that same month.

function computeGrossForMonth(flow: ForecastFlow, mk: MonthKey): number {
  const gross = flow.grossAmount ?? 0
  const freq  = Number(flow.frequency)

  if (!monthInRange(mk, flow)) return 0

  switch (freq) {
    case FREQ_ONE_OFF: {
      const start = parseDate(flow.startDate)
      if (!start) return 0
      return start.year === mk.year && start.month === mk.month ? gross : 0
    }
    case FREQ_DAILY: {
      const dowStr = flow.daysOfWeek ?? ''
      if (!dowStr) return 0
      const dows  = dowStr.split(',').map(Number).filter(n => n >= 1 && n <= 7)
      const count = dows.reduce((s, d) => s + countDowInMonth(mk.year, mk.month, d), 0)
      return round2(gross * count)
    }
    case FREQ_WEEKLY:
      return round2(gross * (daysInMonth(mk.year, mk.month) / 7))
    case FREQ_MONTHLY:
      return gross
    case FREQ_QUARTERLY:
    case FREQ_SEMI_ANNUALLY:
    case FREQ_ANNUALLY: {
      const interval = freq === FREQ_QUARTERLY ? 3 : freq === FREQ_SEMI_ANNUALLY ? 6 : 12
      const start = parseDate(flow.startDate)
      if (!start) return 0
      const totalMonths = (mk.year - start.year) * 12 + (mk.month - start.month)
      return totalMonths >= 0 && totalMonths % interval === 0 ? gross : 0
    }
    default:
      return 0
  }
}

function sumLogicalNet(allFlows: ForecastFlow[], logicalId: string, mk: MonthKey, components: ForecastFlowComponent[], depth: number): number {
  return allFlows
    .filter(f => logicalIdOf(f) === logicalId)
    .reduce((s, f) => s + computeAmountsForMonth(f, mk, allFlows, components, depth).net, 0)
}

function computeAmountsForMonth(flow: ForecastFlow, mk: MonthKey, allFlows: ForecastFlow[], components: ForecastFlowComponent[], depth = 0): MonthAmounts {
  const amountSource = flow.amountSource ?? undefined

  if (amountSource === AMOUNT_SOURCE_CALCULATED) {
    if (!monthInRange(mk, flow) || depth >= 5) return { gross: 0, vat: 0, net: 0 }
    const pct = flow.percentage ?? 0
    const flowComponents = components.filter(c => c.targetFlowId === flow.id)
    let sumNet = 0
    for (const comp of flowComponents) {
      const sourceId = comp.sourceFlowId
      if (!sourceId) continue
      const sourceFlow = allFlows.find(f => f.id === sourceId)
      if (!sourceFlow) continue
      const sign = Number(comp.direction) === DIRECTION_SUBTRACT ? -1 : 1
      sumNet += sign * sumLogicalNet(allFlows, logicalIdOf(sourceFlow), mk, components, depth + 1)
    }
    const net = round2(sumNet * (pct / 100))
    return { gross: net, vat: 0, net }
  }

  const gross = computeGrossForMonth(flow, mk)
  if (gross === 0) return { gross: 0, vat: 0, net: 0 }
  const vatBase   = flow.vatAmount ?? 0
  const grossBase = flow.grossAmount ?? 0
  const vat = grossBase > 0 ? round2((vatBase / grossBase) * gross) : 0
  const net = round2(gross - vat)
  return { gross, vat, net }
}

function applyProRata(a: MonthAmounts, ratio: number): MonthAmounts {
  if (ratio === 1) return a
  return { gross: round2(a.gross * ratio), vat: round2(a.vat * ratio), net: round2(a.net * ratio) }
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
  segmented: { display: 'flex', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, overflow: 'hidden', fontSize: '13px' },
  segBtn: { padding: '6px 12px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground2 },
  segBtnActive: { backgroundColor: tokens.colorBrandBackground, color: '#fff' },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  filterLabel: { fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.03em' },
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
  actualLine: { fontSize: '10px', color: tokens.colorBrandForeground1, marginTop: '1px' },
})

// ── Component ────────────────────────────────────────────────────────────────

export default function ForecastView() {
  const s = useStyles()
  const { data: flows = [], isLoading: loadingFlows }           = useForecastFlows()
  const { data: flowProps = [], isLoading: loadingFlowProps }   = useForecastFlowProperties()
  const { data: components = [], isLoading: loadingComponents } = useForecastFlowComponents()
  const { data: references = [], isLoading: loadingRefs }       = useReferenceData()
  const { data: properties = [], isLoading: loadingProperties } = useProperties()
  const { data: invoices = [], isLoading: loadingInvoices }     = useInvoices()
  const { data: scenarios = [], isLoading: loadingScenarios }   = useForecastScenarios()
  const saveForecastScenario = useSaveForecastScenario()
  const deleteForecastScenario = useDeleteForecastScenario()
  const loading = loadingFlows || loadingFlowProps || loadingComponents || loadingRefs || loadingProperties || loadingInvoices || loadingScenarios

  const curYear = new Date().getFullYear()
  const minYear = curYear
  const maxYear = curYear + 10

  const [year, setYear]             = useState(curYear)
  const [propFilter, setPropFilter] = useState<string[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('forecast')
  const [scenarioId, setScenarioId] = useState('')

  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  const [scenarioManagerOpen, setScenarioManagerOpen] = useState(false)
  const [scenarioForm, setScenarioForm] = useState<ScenarioForm>(emptyScenarioForm())
  const [scenarioSaving, setScenarioSaving] = useState(false)
  const [scenarioError, setScenarioError] = useState('')

  const selectedScenario = scenarios.find(sc => sc.id === scenarioId) ?? null

  function openNewScenario() { setScenarioForm(emptyScenarioForm()); setScenarioError(''); setScenarioManagerOpen(true) }
  function openEditScenario(sc: ForecastScenario) { setScenarioForm(scenarioToForm(sc)); setScenarioError(''); setScenarioManagerOpen(true) }
  async function saveScenario() {
    setScenarioError('')
    if (!scenarioForm.name.trim()) { setScenarioError('Name is required.'); return }
    const incomePct = parseFloat(scenarioForm.incomePct) || 0
    const expensePct = parseFloat(scenarioForm.expensePct) || 0
    setScenarioSaving(true)
    try {
      const payload = {
        name: scenarioForm.name.trim(),
        incomeAdjustmentPct: incomePct,
        expenseAdjustmentPct: expensePct,
        notes: scenarioForm.notes.trim() || undefined,
        propertyId: scenarioForm.propertyId || undefined,
      }
      if (scenarioForm.id) {
        await saveForecastScenario.mutateAsync({ id: scenarioForm.id, ...payload })
      } else {
        await saveForecastScenario.mutateAsync(payload)
      }
      setScenarioForm(emptyScenarioForm())
    } catch (e: unknown) {
      setScenarioError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setScenarioSaving(false)
    }
  }
  async function deleteScenario(sc: ForecastScenario) {
    if (!confirm(`Delete scenario "${sc.name}"?`)) return
    await deleteForecastScenario.mutateAsync(sc.id)
    if (scenarioId === sc.id) setScenarioId('')
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
      const parentId = flow.parentFlowId
      const logicalId = parentId ?? flow.id
      const typeNum = Number(flow.type)

      if (!map.has(logicalId)) {
        const rootFlow = flows.find(f => f.id === logicalId)
        map.set(logicalId, {
          logicalId,
          name: rootFlow?.name ?? flow.name ?? '',
          type: typeNum,
          categoryId: (rootFlow ?? flow).categoryId ?? '',
          contactId:  (rootFlow ?? flow).contactId ?? '',
          versions: [],
          linkedPropertyIds: [],
          allProperties: false,
        })
      }
      const lf = map.get(logicalId)!
      lf.versions.push(flow)
      if (flow.allProperties) lf.allProperties = true
    }

    for (const fp of flowProps) {
      const flowId = fp.forecastFlowId ?? ''
      const propId = fp.propertyId ?? ''
      const flow = flows.find(f => f.id === flowId)
      if (!flow) continue
      const parentId  = flow.parentFlowId
      const logicalId = parentId ?? flow.id
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
      const matching = propFilter.filter(pid => properties.some(p => p.id === pid)).length
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
          const a = computeAmountsForMonth(version, mk, flows, components)
          combined = { gross: combined.gross + a.gross, vat: combined.vat + a.vat, net: combined.net + a.net }
        }
        byMonth.set(key, applyProRata(combined, ratio))
      }
      result.set(lf.logicalId, byMonth)
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalFlows, months, propFilter, properties, flows, components])

  // ── Accessors (forecast, with scenario adjustment applied) ────────────────

  function scenarioFactor(type: number): number {
    if (!selectedScenario) return 1
    const pct = type === TYPE_INCOME ? selectedScenario.incomeAdjustmentPct : selectedScenario.expenseAdjustmentPct
    return 1 + (pct ?? 0) / 100
  }

  function getAmt(logicalId: string, mk: MonthKey): MonthAmounts {
    const raw = flowAmounts.get(logicalId)?.get(`${mk.year}-${mk.month}`) ?? { gross: 0, vat: 0, net: 0 }
    const lf = logicalFlows.find(l => l.logicalId === logicalId)
    if (!lf) return raw
    const factor = scenarioFactor(lf.type)
    if (factor === 1) return raw
    return { gross: round2(raw.gross * factor), vat: round2(raw.vat * factor), net: round2(raw.net * factor) }
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

  // ── Actuals (never scenario-adjusted) ─────────────────────────────────────

  function actualRatio(): number {
    if (propFilter.length === 0) return 1
    return properties.length > 0 ? propFilter.length / properties.length : 0
  }
  type ActualField = 'net' | 'gross' | 'vat'
  function invoiceFieldValue(inv: (typeof invoices)[number], field: ActualField): number {
    if (field === 'gross') return inv.totalGross ?? 0
    if (field === 'vat') return inv.taxAmount ?? 0
    return inv.baseAmount ?? 0
  }
  function actualForCategoryMonth(categoryId: string, flowType: number, mk: MonthKey, field: ActualField = 'net'): number {
    if (!isMonthClosed(mk)) return 0
    const invType = flowType === TYPE_INCOME ? INV_TYPE_INCOME : INV_TYPE_EXPENSE
    const ratio = actualRatio()
    if (ratio === 0 && propFilter.length > 0) return 0
    let total = 0
    for (const inv of invoices) {
      if (inv.cancelled) continue
      if (Number(inv.type) !== invType) continue
      if ((inv.categoryId ?? '') !== categoryId) continue
      if (!inv.date) continue
      const d = new Date(inv.date)
      if (d.getFullYear() !== mk.year || d.getMonth() !== mk.month) continue
      const val = invoiceFieldValue(inv, field)
      if (inv.allProperties) total += val * ratio
      else if (propFilter.length === 0 || propFilter.includes(inv.propertyId ?? '')) total += val
    }
    return total
  }
  // Type-level actuals sum ALL invoices of that type/month directly (not via
  // categories), so uncategorised invoices are still counted in the total.
  function actualForTypeMonth(type: number, mk: MonthKey, field: ActualField = 'net'): number {
    if (!isMonthClosed(mk)) return 0
    const invType = type === TYPE_INCOME ? INV_TYPE_INCOME : INV_TYPE_EXPENSE
    const ratio = actualRatio()
    if (ratio === 0 && propFilter.length > 0) return 0
    let total = 0
    for (const inv of invoices) {
      if (inv.cancelled) continue
      if (Number(inv.type) !== invType) continue
      if (!inv.date) continue
      const d = new Date(inv.date)
      if (d.getFullYear() !== mk.year || d.getMonth() !== mk.month) continue
      const val = invoiceFieldValue(inv, field)
      if (inv.allProperties) total += val * ratio
      else if (propFilter.length === 0 || propFilter.includes(inv.propertyId ?? '')) total += val
    }
    return total
  }
  function actualNetForCategoryMonth(categoryId: string, flowType: number, mk: MonthKey): number { return actualForCategoryMonth(categoryId, flowType, mk, 'net') }
  function actualNetForTypeMonth(type: number, mk: MonthKey): number { return actualForTypeMonth(type, mk, 'net') }
  function yearActualCategoryTotal(categoryId: string, type: number): number {
    return months.reduce((s, mk) => s + actualForCategoryMonth(categoryId, type, mk, 'net'), 0)
  }
  function yearActualTypeTotal(type: number, field: ActualField = 'net'): number {
    return months.reduce((s, mk) => s + actualForTypeMonth(type, mk, field), 0)
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
        cats.forEach(c => allKeys.add(`cat-${type}-${c.id}`))
      }
      setExpanded(allKeys)
      setAllExpanded(true)
    }
  }

  // ── Derived lists ─────────────────────────────────────────────────────────

  const incomeCategories = useMemo(
    () => references.filter(r => Number(r.referenceType) === REF_INCOME_CATEGORY),
    [references],
  )
  const expenseCategories = useMemo(
    () => references.filter(r => Number(r.referenceType) === REF_EXPENSE_CATEGORY),
    [references],
  )

  // ── Render helpers ────────────────────────────────────────────────────────

  function fmtCell(n: number): string {
    if (n === 0) return '—'
    return formatMoney(round2(n))
  }

  // Renders one month cell for a forecast-vs-actual-capable row (category or
  // type-total rows only — individual flows have no actual counterpart).
  function renderModeCell(forecastVal: number, actualVal: number | null, mk: MonthKey, cls: string) {
    if (displayMode === 'forecast' || actualVal === null) {
      return <td key={`${mk.year}-${mk.month}`} className={cls}>{fmtCell(forecastVal)}</td>
    }
    if (displayMode === 'both') {
      return (
        <td key={`${mk.year}-${mk.month}`} className={cls}>
          <div>{fmtCell(forecastVal)}</div>
          {isMonthClosed(mk) && <div className={s.actualLine}>A: {fmtCell(actualVal)}</div>}
        </td>
      )
    }
    // blend: actuals for closed months, forecast for current/future
    const v = isMonthClosed(mk) ? actualVal : forecastVal
    return <td key={`${mk.year}-${mk.month}`} className={cls}>{fmtCell(v)}</td>
  }

  function renderAmountRow(
    label: string,
    getMonthVal: (mk: MonthKey) => number,
    getYearVal: () => number,
    opts: {
      bold?: boolean
      separator?: boolean
      subtle?: boolean
      positive?: boolean
      negative?: boolean
      getActualMonthVal?: (mk: MonthKey) => number
      getActualYearVal?: () => number
    } = {},
  ) {
    const { bold, separator, subtle, positive, negative, getActualMonthVal, getActualYearVal } = opts
    return (
      <tr key={label} className={mergeClasses(s.amtRow, separator && s.amtRowSeparator, subtle && s.amtRowSubtle)}>
        <td className={mergeClasses(s.amtLabel, separator && s.amtLabelSep, bold ? s.amtLabelBold : s.amtLabelReg)}>{label}</td>
        {months.map(mk => {
          const v = round2(getMonthVal(mk))
          const neg = negative || (!positive && v < 0)
          const pos = positive || (!negative && v > 0)
          const cellCls = mergeClasses(s.cellNum, neg ? s.neg : pos ? s.pos : s.neutral)
          const actualVal = getActualMonthVal ? round2(getActualMonthVal(mk)) : null
          return renderModeCell(v, actualVal, mk, cellCls)
        })}
        <td className={mergeClasses(s.cellTotal, bold ? s.amtCellBold : s.amtCellReg)}>
          {fmtCell(round2(getYearVal()))}
          {getActualYearVal && displayMode !== 'forecast' && (
            <div className={s.actualLine}>A: {fmtCell(round2(getActualYearVal()))}</div>
          )}
        </td>
      </tr>
    )
  }

  function renderCategorySection(type: number, cats: ReferenceData[], field: keyof MonthAmounts) {
    return cats.map(cat => {
      const catKey  = `cat-${type}-${cat.id}`
      const isOpen  = expanded.has(catKey)
      const catFlows = logicalFlows.filter(
        lf => lf.type === type && lf.categoryId === cat.id && flowAmounts.has(lf.logicalId)
      )
      if (catFlows.length === 0) return null

      return (
        <Fragment key={catKey}>
          <tr className={s.catRow} onClick={() => toggleExpand(catKey)}>
            <td className={s.catLabel}>
              <span className={s.catCaret}>{isOpen ? '▾' : '▸'}</span>
              {cat.value}
            </td>
            {months.map(mk => {
              const v = round2(sumCategory(cat.id, type, mk, field))
              const actualVal = displayMode !== 'forecast' ? round2(actualNetForCategoryMonth(cat.id, type, mk)) : null
              return renderModeCell(v, actualVal, mk, s.cellNum)
            })}
            <td className={mergeClasses(s.cellTotal, s.amtCellReg)}>
              {fmtCell(round2(yearCategoryTotal(cat.id, type, field)))}
              {displayMode !== 'forecast' && (
                <div className={s.actualLine}>A: {fmtCell(round2(yearActualCategoryTotal(cat.id, type)))}</div>
              )}
            </td>
          </tr>

          {isOpen && catFlows.map(lf => (
            <tr key={lf.logicalId} className={s.flowRow}>
              <td className={s.flowLabel}>{lf.name}</td>
              {months.map(mk => (
                <td key={`${mk.year}-${mk.month}`} className={s.flowCell}>
                  {fmtCell(round2(getAmt(lf.logicalId, mk)[field]))}
                </td>
              ))}
              <td className={mergeClasses(s.flowCell, s.cellTotal)}>
                {fmtCell(round2(yearTotal(lf.logicalId, field)))}
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
          <button onClick={() => setPropFilter([])} className={s.chip} style={propFilter.length === 0 ? { border: `1px solid ${tokens.colorBrandForeground1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : undefined}>All</button>
          {properties.map(p => {
            const sel = propFilter.includes(p.id)
            return (
              <button
                key={p.id}
                onClick={() => setPropFilter(prev => sel ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                className={s.chip}
                style={sel ? { border: `1px solid ${tokens.colorBrandForeground1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : undefined}
              >
                {p.name}
              </button>
            )
          })}
        </div>

        {/* Display mode */}
        <div className={s.filterGroup}>
          <Text className={s.filterLabel}>Show</Text>
          <div className={s.segmented}>
            {([['forecast', 'Forecast only'], ['both', 'Forecast + Actuals'], ['blend', 'Actuals (past) + Forecast']] as [DisplayMode, string][]).map(([m, label]) => (
              <button key={m} className={mergeClasses(s.segBtn, displayMode === m && s.segBtnActive)} onClick={() => setDisplayMode(m)}>{label}</button>
            ))}
          </div>
        </div>

        {/* Scenario */}
        <div className={s.filterGroup}>
          <Text className={s.filterLabel}>Scenario</Text>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Select value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
              <option value="">None (base forecast)</option>
              {scenarios.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </Select>
            <Button appearance="outline" size="small" onClick={openNewScenario}>Manage…</Button>
          </div>
        </div>
      </div>

      {selectedScenario && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          Scenario applied to forecast only: income {selectedScenario.incomeAdjustmentPct >= 0 ? '+' : ''}{selectedScenario.incomeAdjustmentPct}%, expense {selectedScenario.expenseAdjustmentPct >= 0 ? '+' : ''}{selectedScenario.expenseAdjustmentPct}%. Actuals are never adjusted.
        </Text>
      )}

      {/* Table */}
      {loading ? (
        <div className={s.empty}>Loading…</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr className={s.theadRow}>
                <th className={s.thLabel}>
                  <Button appearance="transparent" size="small" onClick={toggleExpandAll} style={{ color: tokens.colorBrandForeground1, fontWeight: 500 }}>
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
              {renderAmountRow('TOTAL INCOME',
                mk => sumType(TYPE_INCOME, mk, 'net'),
                () => yearTypeTotal(TYPE_INCOME, 'net'),
                { bold: true, separator: true, getActualMonthVal: mk => actualNetForTypeMonth(TYPE_INCOME, mk), getActualYearVal: () => yearActualTypeTotal(TYPE_INCOME) },
              )}

              {renderSpacer()}

              {/* EXPENSES */}
              {renderSectionHeader('EXPENSES', s.expenseBg)}
              {renderCategorySection(TYPE_EXPENSE, expenseCategories, 'net')}
              {renderAmountRow('TOTAL EXPENSES',
                mk => sumType(TYPE_EXPENSE, mk, 'net'),
                () => yearTypeTotal(TYPE_EXPENSE, 'net'),
                { bold: true, separator: true, getActualMonthVal: mk => actualNetForTypeMonth(TYPE_EXPENSE, mk), getActualYearVal: () => yearActualTypeTotal(TYPE_EXPENSE) },
              )}

              {renderSpacer()}

              {/* VAT */}
              {renderAmountRow('VAT COLLECTED (income)', mk => sumType(TYPE_INCOME,  mk, 'vat'), () => yearTypeTotal(TYPE_INCOME,  'vat'),
                { subtle: true, getActualMonthVal: mk => actualForTypeMonth(TYPE_INCOME, mk, 'vat'), getActualYearVal: () => yearActualTypeTotal(TYPE_INCOME, 'vat') })}
              {renderAmountRow('VAT PAID (expenses)',    mk => sumType(TYPE_EXPENSE, mk, 'vat'), () => yearTypeTotal(TYPE_EXPENSE, 'vat'),
                { subtle: true, getActualMonthVal: mk => actualForTypeMonth(TYPE_EXPENSE, mk, 'vat'), getActualYearVal: () => yearActualTypeTotal(TYPE_EXPENSE, 'vat') })}
              {renderAmountRow('NET VAT',
                mk => round2(sumType(TYPE_INCOME, mk, 'vat') - sumType(TYPE_EXPENSE, mk, 'vat')),
                () => round2(yearTypeTotal(TYPE_INCOME, 'vat') - yearTypeTotal(TYPE_EXPENSE, 'vat')),
                {
                  bold: true, separator: true,
                  getActualMonthVal: mk => round2(actualForTypeMonth(TYPE_INCOME, mk, 'vat') - actualForTypeMonth(TYPE_EXPENSE, mk, 'vat')),
                  getActualYearVal: () => round2(yearActualTypeTotal(TYPE_INCOME, 'vat') - yearActualTypeTotal(TYPE_EXPENSE, 'vat')),
                },
              )}

              {renderSpacer()}

              {/* CASH FLOW */}
              {renderAmountRow('CASH INFLOW',  mk => sumType(TYPE_INCOME,  mk, 'gross'), () => yearTypeTotal(TYPE_INCOME,  'gross'),
                { positive: true, getActualMonthVal: mk => actualForTypeMonth(TYPE_INCOME, mk, 'gross'), getActualYearVal: () => yearActualTypeTotal(TYPE_INCOME, 'gross') })}
              {renderAmountRow('CASH OUTFLOW', mk => sumType(TYPE_EXPENSE, mk, 'gross'), () => yearTypeTotal(TYPE_EXPENSE, 'gross'),
                { negative: true, getActualMonthVal: mk => actualForTypeMonth(TYPE_EXPENSE, mk, 'gross'), getActualYearVal: () => yearActualTypeTotal(TYPE_EXPENSE, 'gross') })}
              {renderAmountRow('NET CASH FLOW',
                mk => round2(sumType(TYPE_INCOME, mk, 'gross') - sumType(TYPE_EXPENSE, mk, 'gross')),
                () => round2(yearTypeTotal(TYPE_INCOME, 'gross') - yearTypeTotal(TYPE_EXPENSE, 'gross')),
                {
                  bold: true, separator: true,
                  getActualMonthVal: mk => round2(actualForTypeMonth(TYPE_INCOME, mk, 'gross') - actualForTypeMonth(TYPE_EXPENSE, mk, 'gross')),
                  getActualYearVal: () => round2(yearActualTypeTotal(TYPE_INCOME, 'gross') - yearActualTypeTotal(TYPE_EXPENSE, 'gross')),
                },
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={scenarioManagerOpen} onOpenChange={(_, d) => !d.open && setScenarioManagerOpen(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Manage Scenarios</DialogTitle>
            <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {scenarios.length > 0 && (
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Income %</TableHeaderCell>
                      <TableHeaderCell>Expense %</TableHeaderCell>
                      <TableHeaderCell>Property</TableHeaderCell>
                      <TableHeaderCell />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenarios.map(sc => {
                      const propName = sc.propertyId ? (properties.find(p => p.id === sc.propertyId)?.name ?? '') : ''
                      return (
                        <TableRow key={sc.id}>
                          <TableCell>{sc.name}</TableCell>
                          <TableCell>{sc.incomeAdjustmentPct >= 0 ? '+' : ''}{sc.incomeAdjustmentPct}%</TableCell>
                          <TableCell>{sc.expenseAdjustmentPct >= 0 ? '+' : ''}{sc.expenseAdjustmentPct}%</TableCell>
                          <TableCell>{propName || 'All properties'}</TableCell>
                          <TableCell>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <Button size="small" appearance="subtle" onClick={() => openEditScenario(sc)}>Edit</Button>
                              <Button size="small" appearance="subtle" onClick={() => deleteScenario(sc)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}

              <Text weight="semibold" size={300}>{scenarioForm.id ? 'Edit Scenario' : 'New Scenario'}</Text>
              {scenarioError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{scenarioError}</Text>}
              <Field label="Name" required>
                <Input value={scenarioForm.name} onChange={(_, d) => setScenarioForm(f => ({ ...f, name: d.value }))} placeholder="e.g. Downside case" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="Income Adjustment (%)" hint="e.g. 20 for +20%, -10 for -10%">
                  <Input type="number" step={0.1} value={scenarioForm.incomePct} onChange={(_, d) => setScenarioForm(f => ({ ...f, incomePct: d.value }))} placeholder="0" />
                </Field>
                <Field label="Expense Adjustment (%)">
                  <Input type="number" step={0.1} value={scenarioForm.expensePct} onChange={(_, d) => setScenarioForm(f => ({ ...f, expensePct: d.value }))} placeholder="0" />
                </Field>
              </div>
              <Field label="Property" hint="Optional — leave blank to apply regardless of property filter">
                <Select value={scenarioForm.propertyId} onChange={e => setScenarioForm(f => ({ ...f, propertyId: e.target.value }))}>
                  <option value="">All properties</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Notes">
                <Input value={scenarioForm.notes} onChange={(_, d) => setScenarioForm(f => ({ ...f, notes: d.value }))} placeholder="Optional" />
              </Field>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {scenarioForm.id && <Button appearance="secondary" onClick={() => setScenarioForm(emptyScenarioForm())}>Cancel Edit</Button>}
                <Button appearance="primary" disabled={scenarioSaving} onClick={saveScenario}>{scenarioSaving ? 'Saving…' : scenarioForm.id ? 'Save Changes' : '+ Add Scenario'}</Button>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setScenarioManagerOpen(false)}>Close</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
