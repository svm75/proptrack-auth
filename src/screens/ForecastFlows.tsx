import { useEffect, useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Textarea, Field, Select, Checkbox, Text, Badge,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import { Cr9b5_pt_forecastflowsService } from '@/generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService } from '@/generated/services/Cr9b5_forecastpropertiesService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Svm_forecastflowcomponentsService } from '@/generated/services/Svm_forecastflowcomponentsService'
import type { Cr9b5_pt_forecastflows } from '@/generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties } from '@/generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'

const TYPE_INCOME  = 233100000
const TYPE_EXPENSE = 233100001
const FREQ_ONE_OFF = 233100000
const FREQ_DAILY = 233100001
const FREQ_MONTHLY = 233100003

const AMOUNT_SOURCE_FIXED = 925060000
const AMOUNT_SOURCE_CALCULATED = 925060001
const DIRECTION_ADD = 925060000
const DIRECTION_SUBTRACT = 925060001

const FREQ_LABELS: Record<number, string> = {
  233100000: 'One-off', 233100001: 'Daily', 233100002: 'Weekly', 233100003: 'Monthly',
  233100004: 'Quarterly', 233100005: 'Semi-annually', 233100006: 'Annually',
}
const REF_INCOME_CATEGORY = 233100005
const REF_EXPENSE_CATEGORY = 233100006
const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function today(): string { return new Date().toISOString().slice(0, 10) }
function firstOfNextMonth(): string {
  const d = new Date()
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2
  return `${y}-${String(m).padStart(2, '0')}-01`
}
function lastDayOfPrevMonth(firstDay: string): string {
  const [y, m] = firstDay.split('-').map(Number)
  return new Date(y, m - 1, 0).toISOString().slice(0, 10)
}
function lastDayOfCurrentMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}
function isActiveFlow(flow: Cr9b5_pt_forecastflows): boolean { return !flow.cr9b5_enddate || flow.cr9b5_enddate >= today() }
function isFirstOfMonth(date: string): boolean { return date.endsWith('-01') }
function calcVat(gross: string): string {
  const g = parseFloat(gross)
  if (isNaN(g) || g <= 0) return ''
  return String(Math.round((g / 1.07) * 0.07 * 100) / 100)
}

interface ComponentRow { sourceFlowId: string; direction: number }

interface FlowForm {
  id: string | null; parentFlowId: string | null; name: string; type: number; categoryId: string; contactId: string
  frequency: number; daysOfWeek: number[]; startDate: string; endDate: string; grossAmount: string
  vatRate: string; vatAmount: string; vatIsManual: boolean; allProperties: boolean; propertyIds: string[]
  notes: string; effectiveFrom: string
  amountSource: number; percentage: string; components: ComponentRow[]
}

function emptyForm(): FlowForm {
  return {
    id: null, parentFlowId: null, name: '', type: TYPE_INCOME, categoryId: '', contactId: '', frequency: FREQ_MONTHLY,
    daysOfWeek: [1, 2, 3, 4, 5], startDate: firstOfNextMonth(), endDate: '', grossAmount: '', vatRate: '7', vatAmount: '',
    vatIsManual: false, allProperties: true, propertyIds: [], notes: '', effectiveFrom: firstOfNextMonth(),
    amountSource: AMOUNT_SOURCE_FIXED, percentage: '', components: [],
  }
}
function parseDaysOfWeek(s: string): number[] {
  if (!s) return [1, 2, 3, 4, 5]
  return s.split(',').map(Number).filter(n => n >= 1 && n <= 7)
}
function flowToForm(flow: Cr9b5_pt_forecastflows, linkedPropIds: string[], components: ComponentRow[]): FlowForm {
  const raw = flow as unknown as Record<string, unknown>
  return {
    id: flow.cr9b5_pt_forecastflowid,
    parentFlowId: (flow._cr9b5_parentflowid_value as string | undefined) ?? flow.cr9b5_pt_forecastflowid,
    name: flow.cr9b5_name ?? '', type: (flow.cr9b5_type as unknown as number) ?? TYPE_INCOME,
    categoryId: (flow._cr9b5_categoryid_value as string) ?? '', contactId: (flow._cr9b5_contactid_value as string) ?? '',
    frequency: (flow.cr9b5_frequency as unknown as number) ?? FREQ_MONTHLY,
    daysOfWeek: parseDaysOfWeek((raw['cr9b5_daysofweek'] as string) ?? ''),
    startDate: flow.cr9b5_startdate?.slice(0, 10) ?? '', endDate: flow.cr9b5_enddate?.slice(0, 10) ?? '',
    grossAmount: String((raw['cr9b5_grossamount'] as number) ?? ''), vatRate: flow.cr9b5_vatrate ?? '7',
    vatAmount: String(flow.cr9b5_vatamount ?? ''), vatIsManual: flow.cr9b5_vatismanual ?? false,
    allProperties: flow.cr9b5_allproperties ?? true, propertyIds: linkedPropIds, notes: flow.cr9b5_notes ?? '',
    effectiveFrom: firstOfNextMonth(),
    amountSource: (raw['svm_amountsource'] as number) ?? AMOUNT_SOURCE_FIXED,
    percentage: String((raw['svm_percentage'] as number) ?? ''), components,
  }
}

const useStyles = makeStyles({
  root: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  filterBar: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '12px' },
  empty: { textAlign: 'center', padding: '48px', color: tokens.colorNeutralForeground4 },
  tableWrap: { overflowX: 'auto', borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  panel: { backgroundColor: tokens.colorPaletteMarigoldBackground1, border: `1px solid ${tokens.colorPaletteMarigoldBorder1}`, borderRadius: tokens.borderRadiusLarge, padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  toggle: { padding: '8px 16px', borderRadius: tokens.borderRadiusMedium, fontSize: '14px', fontWeight: 500, border: '2px solid', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1 },
  dowBtn: { padding: '6px 12px', borderRadius: tokens.borderRadiusMedium, fontSize: '12px', fontWeight: 600, border: '2px solid', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1 },
  totalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium, padding: '10px 16px', border: `1px solid ${tokens.colorNeutralStroke2}` },
  propList: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, maxHeight: '192px', overflowY: 'auto' },
  propRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer' },
})

export default function ForecastFlows() {
  const s = useStyles()
  const [flows, setFlows] = useState<Cr9b5_pt_forecastflows[]>([])
  const [flowProps, setFlowProps] = useState<Cr9b5_forecastproperties[]>([])
  const [references, setReferences] = useState<Cr9b5_pt_references[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<number | null>(null)
  const [freqFilter, setFreqFilter] = useState<number | null>(null)
  const [propFilter, setPropFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FlowForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Cr9b5_pt_forecastflows | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [fRes, fpRes, rRes, cRes, pRes] = await Promise.all([
        Cr9b5_pt_forecastflowsService.getAll({ orderBy: ['cr9b5_startdate desc'] }),
        Cr9b5_forecastpropertiesService.getAll({}),
        Cr9b5_pt_referencesService.getAll({ orderBy: ['cr9b5_sortorder asc', 'cr9b5_value asc'] }),
        Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'] }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      ])
      setFlows(fRes.data ?? [])
      setFlowProps(fpRes.data ?? [])
      setReferences(rRes.data ?? [])
      setContacts(cRes.data ?? [])
      setProperties(pRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const incomeCategories = references.filter(r => Number(r.cr9b5_referencetype) === REF_INCOME_CATEGORY)
  const expenseCategories = references.filter(r => Number(r.cr9b5_referencetype) === REF_EXPENSE_CATEGORY)

  function propIdsForFlow(flowId: string): string[] {
    return flowProps.filter(fp => fp._cr9b5_forecastflowid_value === flowId).map(fp => fp._cr9b5_propertyid_value ?? '').filter(Boolean)
  }
  function categoryName(id: string): string { return references.find(r => r.cr9b5_pt_referenceid === id)?.cr9b5_value ?? '—' }
  function contactName(id: string): string { return contacts.find(c => c.cr9b5_pt_contactid === id)?.cr9b5_name ?? '—' }
  function propertyName(id: string): string { return properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? id }

  const visibleFlows = flows.filter(f => {
    const active = isActiveFlow(f)
    if (!showInactive && !active) return false
    if (typeFilter !== null && Number(f.cr9b5_type) !== typeFilter) return false
    if (freqFilter !== null && Number(f.cr9b5_frequency) !== freqFilter) return false
    if (propFilter) {
      if (!f.cr9b5_allproperties) {
        const linked = propIdsForFlow(f.cr9b5_pt_forecastflowid)
        if (!linked.includes(propFilter)) return false
      }
    }
    if (search) {
      const q = search.toLowerCase()
      const name = (f.cr9b5_name ?? '').toLowerCase()
      const contact = contactName(f._cr9b5_contactid_value ?? '').toLowerCase()
      if (!name.includes(q) && !contact.includes(q)) return false
    }
    return true
  })

  function openNew() { setForm(emptyForm()); setFormError(''); setFormOpen(true) }
  async function openEdit(flow: Cr9b5_pt_forecastflows) {
    const compRes = await Svm_forecastflowcomponentsService.getAll({ filter: `_svm_targetflcow_value eq '${flow.cr9b5_pt_forecastflowid}'` })
    const components: ComponentRow[] = (compRes.data ?? []).map(c => ({
      sourceFlowId: (c as unknown as Record<string, unknown>)['_svm_sourceflow_value'] as string,
      direction: (c.svm_direction as unknown as number) ?? DIRECTION_ADD,
    })).filter(c => c.sourceFlowId)
    setForm(flowToForm(flow, propIdsForFlow(flow.cr9b5_pt_forecastflowid), components))
    setFormError(''); setFormOpen(true)
  }
  function closeForm() { setFormOpen(false); setFormError('') }

  function addComponent() {
    const first = flows.find(f => isActiveFlow(f) && f.cr9b5_pt_forecastflowid !== form.id)
    setForm(f => ({ ...f, components: [...f.components, { sourceFlowId: first?.cr9b5_pt_forecastflowid ?? '', direction: DIRECTION_ADD }] }))
  }
  function updateComponent(idx: number, patch: Partial<ComponentRow>) {
    setForm(f => ({ ...f, components: f.components.map((c, i) => i === idx ? { ...c, ...patch } : c) }))
  }
  function removeComponent(idx: number) {
    setForm(f => ({ ...f, components: f.components.filter((_, i) => i !== idx) }))
  }

  function handleGrossChange(val: string) { setForm(f => f.vatIsManual ? { ...f, grossAmount: val } : { ...f, grossAmount: val, vatAmount: calcVat(val) }) }
  function handleVatChange(val: string) { setForm(f => ({ ...f, vatAmount: val, vatIsManual: true, vatRate: 'n/a' })) }
  function resetVat() { setForm(f => ({ ...f, vatIsManual: false, vatRate: '7', vatAmount: calcVat(f.grossAmount) })) }

  async function save() {
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.categoryId) { setFormError('Category is required.'); return }
    if (!form.startDate) { setFormError('Start date is required.'); return }
    if (!isFirstOfMonth(form.startDate)) { setFormError('Start date must be the first day of a month.'); return }
    if (form.amountSource === AMOUNT_SOURCE_CALCULATED) {
      if (!form.percentage || parseFloat(form.percentage) <= 0) { setFormError('Percentage must be > 0.'); return }
      if (form.components.length === 0) { setFormError('Add at least one linked flow.'); return }
      if (form.components.some(c => !c.sourceFlowId)) { setFormError('Every linked flow row needs a flow selected.'); return }
    } else if (!form.grossAmount || parseFloat(form.grossAmount) <= 0) { setFormError('Gross amount must be > 0.'); return }
    if (!form.allProperties && form.propertyIds.length === 0) { setFormError('Select at least one property.'); return }
    if ((form.frequency as number) === FREQ_DAILY && form.daysOfWeek.length === 0) { setFormError('Select at least one day of the week.'); return }
    if (form.id) {
      if (!form.effectiveFrom) { setFormError('Effective From is required.'); return }
      if (!isFirstOfMonth(form.effectiveFrom)) { setFormError('Effective From must be the first day of a month.'); return }
      if (form.effectiveFrom < today()) { setFormError('Effective From cannot be in the past.'); return }
    }
    setSaving(true)
    try {
      if (form.id) await saveEdit(); else await saveNew()
      await loadAll(); closeForm()
    } catch {
      setFormError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function saveNew() {
    const payload = buildPayload()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await Cr9b5_pt_forecastflowsService.create(payload as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newId = (res.data as any)?.cr9b5_pt_forecastflowid as string
    await savePropertyLinks(newId)
    await saveComponents(newId)
    await logActivity('Created', 'Forecast Flow', form.name.trim())
  }

  async function saveEdit() {
    const currentId = form.id!
    const parentId = form.parentFlowId ?? currentId
    const newEndDate = lastDayOfPrevMonth(form.effectiveFrom)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_forecastflowsService.update(currentId, { cr9b5_enddate: newEndDate } as any)
    const currentFlow = flows.find(f => f.cr9b5_pt_forecastflowid === currentId)
    const originalEndDate = currentFlow?.cr9b5_enddate ?? null
    const payload = {
      ...buildPayload(), cr9b5_startdate: form.effectiveFrom,
      ...(originalEndDate ? { cr9b5_enddate: originalEndDate } : {}),
      'cr9b5_parentflowid@odata.bind': `/cr9b5_pt_forecastflows(${parentId})`,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await Cr9b5_pt_forecastflowsService.create(payload as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newId = (res.data as any)?.cr9b5_pt_forecastflowid as string
    await savePropertyLinks(newId)
    await saveComponents(newId)
    await logActivity('Updated', 'Forecast Flow', form.name.trim(), `Versioned from ${form.effectiveFrom}`)
  }

  function buildPayload() {
    const isCalculated = form.amountSource === AMOUNT_SOURCE_CALCULATED
    const gross = isCalculated ? 0 : (parseFloat(form.grossAmount) || 0)
    const vat = isCalculated ? 0 : (parseFloat(form.vatAmount) || 0)
    const net = Math.round((gross - vat) * 100) / 100
    return {
      cr9b5_name: form.name.trim(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cr9b5_type: form.type as any,
      'cr9b5_categoryid@odata.bind': `/cr9b5_pt_references(${form.categoryId})`,
      ...(form.contactId ? { 'cr9b5_contactid@odata.bind': `/cr9b5_pt_contacts(${form.contactId})` } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cr9b5_frequency: form.frequency as any,
      ...(form.frequency === FREQ_DAILY && form.daysOfWeek.length > 0 ? { cr9b5_daysofweek: form.daysOfWeek.join(',') } : {}),
      cr9b5_startdate: form.startDate,
      ...(form.endDate && form.frequency !== FREQ_ONE_OFF ? { cr9b5_enddate: form.endDate } : form.frequency === FREQ_ONE_OFF ? { cr9b5_enddate: form.startDate } : {}),
      cr9b5_grossamount: isCalculated ? null : gross,
      cr9b5_vatrate: isCalculated ? null : (form.vatIsManual ? 'n/a' : form.vatRate),
      cr9b5_vatamount: isCalculated ? null : vat,
      cr9b5_netamount: isCalculated ? null : net,
      cr9b5_vatismanual: isCalculated ? false : form.vatIsManual,
      cr9b5_allproperties: form.allProperties,
      cr9b5_notes: form.notes.trim() || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      svm_amountsource: form.amountSource as any,
      svm_percentage: isCalculated ? (parseFloat(form.percentage) || 0) : null,
    }
  }

  async function saveComponents(flowId: string) {
    if (form.amountSource !== AMOUNT_SOURCE_CALCULATED) return
    await Promise.all(form.components.filter(c => c.sourceFlowId).map(c =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Svm_forecastflowcomponentsService.create({
        svm_name: `${form.name.trim()} component`,
        'svm_TargetFlcow@odata.bind': `/cr9b5_pt_forecastflows(${flowId})`,
        'svm_SourceFlow@odata.bind': `/cr9b5_pt_forecastflows(${c.sourceFlowId})`,
        svm_direction: c.direction as any,
      } as any)
    ))
  }

  async function savePropertyLinks(flowId: string) {
    if (form.allProperties) return
    await Promise.all(form.propertyIds.map(pid =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Cr9b5_forecastpropertiesService.create({
        cr9b5_name: `${form.name.trim()} - ${propertyName(pid)}`,
        'cr9b5_forecastflowid@odata.bind': `/cr9b5_pt_forecastflows(${flowId})`,
        'cr9b5_propertyid@odata.bind': `/cr9b5_pt_properties(${pid})`,
      } as any)
    ))
  }

  function requestDelete(flow: Cr9b5_pt_forecastflows) {
    const endDate = flow.cr9b5_enddate?.slice(0, 10)
    if (endDate && endDate < today()) { setDeleteError('This flow has already ended and cannot be deleted.'); setDeleteTarget(flow); return }
    setDeleteError(''); setDeleteTarget(flow)
  }
  async function confirmDelete() {
    if (!deleteTarget) return
    const endDate = deleteTarget.cr9b5_enddate?.slice(0, 10)
    if (endDate && endDate < today()) return
    const eom = lastDayOfCurrentMonth()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_forecastflowsService.update(deleteTarget.cr9b5_pt_forecastflowid, { cr9b5_enddate: eom } as any)
    await logActivity('Deleted', 'Forecast Flow', deleteTarget.cr9b5_name ?? '')
    await loadAll(); setDeleteTarget(null)
  }

  const grossNum = parseFloat(form.grossAmount) || 0
  const vatNum = parseFloat(form.vatAmount) || 0
  const netNum = Math.round((grossNum - vatNum) * 100) / 100
  const categories = form.type === TYPE_INCOME ? incomeCategories : expenseCategories

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Text size={600} weight="semibold">Forecast Flows</Text>
        <Button appearance="primary" onClick={openNew}>+ Add Flow</Button>
      </div>

      <div className={s.filterBar}>
        <Input value={search} onChange={(_, d) => setSearch(d.value)} placeholder="Search name or counterparty…" style={{ width: '224px' }} />
        <Select value={typeFilter ?? ''} onChange={e => setTypeFilter(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">All Types</option>
          <option value={TYPE_INCOME}>Income</option>
          <option value={TYPE_EXPENSE}>Expense</option>
        </Select>
        <Select value={freqFilter ?? ''} onChange={e => setFreqFilter(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">All Frequencies</option>
          {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select value={propFilter} onChange={e => setPropFilter(e.target.value)}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </Select>
        <Checkbox label="Show inactive" checked={showInactive} onChange={(_, d) => setShowInactive(!!d.checked)} />
      </div>

      {loading ? <div className={s.empty}>Loading…</div> : visibleFlows.length === 0 ? <div className={s.empty}>No flows found.</div> : (
        <div className={s.tableWrap}>
          <Table size="small">
            <TableHeader><TableRow>
              <TableHeaderCell>Name</TableHeaderCell><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Counterparty</TableHeaderCell><TableHeaderCell>Frequency</TableHeaderCell><TableHeaderCell>Start</TableHeaderCell>
              <TableHeaderCell>End</TableHeaderCell><TableHeaderCell>Gross</TableHeaderCell><TableHeaderCell>Properties</TableHeaderCell><TableHeaderCell />
            </TableRow></TableHeader>
            <TableBody>
              {visibleFlows.map(f => {
                const active = isActiveFlow(f)
                const raw = f as unknown as Record<string, unknown>
                const linked = propIdsForFlow(f.cr9b5_pt_forecastflowid)
                return (
                  <TableRow key={f.cr9b5_pt_forecastflowid} style={{ opacity: active ? 1 : 0.5 }}>
                    <TableCell style={{ fontWeight: 600 }}>{f.cr9b5_name}</TableCell>
                    <TableCell><Badge appearance="tint" color={Number(f.cr9b5_type) === TYPE_INCOME ? 'success' : 'danger'}>{Number(f.cr9b5_type) === TYPE_INCOME ? 'Income' : 'Expense'}</Badge></TableCell>
                    <TableCell>{categoryName(f._cr9b5_categoryid_value ?? '')}</TableCell>
                    <TableCell>{f._cr9b5_contactid_value ? contactName(f._cr9b5_contactid_value) : '—'}</TableCell>
                    <TableCell>{FREQ_LABELS[Number(f.cr9b5_frequency)] ?? '—'}</TableCell>
                    <TableCell>{f.cr9b5_startdate?.slice(0, 10) ?? '—'}</TableCell>
                    <TableCell>{f.cr9b5_enddate?.slice(0, 10) ?? '∞'}</TableCell>
                    <TableCell style={{ fontWeight: 600 }}>
                      {Number(raw['svm_amountsource']) === AMOUNT_SOURCE_CALCULATED
                        ? <Badge appearance="tint" color="brand">Calculated · {String(raw['svm_percentage'] ?? '')}%</Badge>
                        : raw['cr9b5_grossamount'] != null ? formatMoney(raw['cr9b5_grossamount'] as number) : '—'}
                    </TableCell>
                    <TableCell style={{ fontSize: '12px' }}>{f.cr9b5_allproperties ? <em>All</em> : linked.map(id => propertyName(id)).join(', ') || '—'}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button size="small" appearance="subtle" onClick={() => openEdit(f)}>Edit</Button>
                        <Button size="small" appearance="subtle" onClick={() => requestDelete(f)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(_, d) => !d.open && closeForm()}>
        <DialogSurface style={{ maxWidth: '640px' }}>
          <DialogBody>
            <DialogTitle>{form.id ? 'Edit Forecast Flow' : 'New Forecast Flow'}</DialogTitle>
            <DialogContent style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{formError}</Text>}

              {form.id && (
                <div className={s.panel}>
                  <Text weight="semibold" size={300} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>Versioning</Text>
                  <Text size={200} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>Saving will end the current version and create a new one from the effective date.</Text>
                  <Field label="Effective From" hint="Must be the 1st of a month and not in the past.">
                    <Input type="date" value={form.effectiveFrom} onChange={(_, d) => setForm(f => ({ ...f, effectiveFrom: d.value }))} />
                  </Field>
                </div>
              )}

              <Field label="Name" required><Input value={form.name} onChange={(_, d) => setForm(f => ({ ...f, name: d.value }))} /></Field>

              <div>
                <Text weight="medium" size={300} style={{ display: 'block', marginBottom: 8 }}>Type *</Text>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[{ val: TYPE_INCOME, label: 'Income', color: tokens.colorPaletteGreenBorderActive, bg: tokens.colorPaletteGreenBackground1, fg: tokens.colorPaletteGreenForeground1 },
                    { val: TYPE_EXPENSE, label: 'Expense', color: tokens.colorPaletteRedBorderActive, bg: tokens.colorPaletteRedBackground1, fg: tokens.colorPaletteRedForeground1 }].map(t => (
                    <button key={t.val} type="button" className={s.toggle}
                      style={form.type === t.val ? { borderColor: t.color, backgroundColor: t.bg, color: t.fg } : { borderColor: tokens.colorNeutralStroke2 }}
                      onClick={() => setForm(f => ({ ...f, type: t.val, categoryId: '' }))}>{t.label}</button>
                  ))}
                </div>
              </div>

              <Field label="Category" required hint={categories.length === 0 ? `No ${form.type === TYPE_INCOME ? 'Income' : 'Expense'} Categories found. Add them in Admin → Reference Data.` : undefined}>
                <Select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>)}
                </Select>
              </Field>

              <Field label="Counterparty">
                <Select value={form.contactId} onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}>
                  <option value="">— None —</option>
                  {contacts.map(c => <option key={c.cr9b5_pt_contactid} value={c.cr9b5_pt_contactid}>{c.cr9b5_name}</option>)}
                </Select>
              </Field>

              <Field label="Frequency" required>
                <Select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: Number(e.target.value) }))}>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>

              {form.frequency === FREQ_DAILY && (
                <div>
                  <Text weight="medium" size={300} style={{ display: 'block', marginBottom: 8 }}>Days of Week *</Text>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {DOW_LABELS.map((lbl, i) => {
                      const day = i + 1
                      const active = form.daysOfWeek.includes(day)
                      return (
                        <button key={day} type="button" className={s.dowBtn}
                          style={active ? { borderColor: tokens.colorBrandForeground1, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : { borderColor: tokens.colorNeutralStroke2 }}
                          onClick={() => setForm(f => ({ ...f, daysOfWeek: active ? f.daysOfWeek.filter(d => d !== day) : [...f.daysOfWeek, day].sort() }))}>{lbl}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className={s.grid2}>
                <Field label="Start Date" required hint="1st of month">
                  <Input type="date" value={form.startDate} onChange={(_, d) => setForm(f => ({ ...f, startDate: d.value }))} />
                </Field>
                {form.frequency !== FREQ_ONE_OFF && (
                  <Field label="End Date" hint="blank = infinite">
                    <Input type="date" value={form.endDate} onChange={(_, d) => setForm(f => ({ ...f, endDate: d.value }))} />
                  </Field>
                )}
              </div>

              <div>
                <Text weight="medium" size={300} style={{ display: 'block', marginBottom: 8 }}>Amount Source *</Text>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {[{ val: AMOUNT_SOURCE_FIXED, label: 'Fixed Amount' }, { val: AMOUNT_SOURCE_CALCULATED, label: 'Calculated from Other Flows' }].map(t => (
                    <button key={t.val} type="button" className={s.toggle}
                      style={form.amountSource === t.val ? { borderColor: tokens.colorBrandForeground1, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 } : { borderColor: tokens.colorNeutralStroke2 }}
                      onClick={() => setForm(f => ({ ...f, amountSource: t.val }))}>{t.label}</button>
                  ))}
                </div>
              </div>

              {form.amountSource === AMOUNT_SOURCE_FIXED ? (
                <>
                  <div className={s.grid2}>
                    <Field label="Gross Amount (€)" required>
                      <Input type="number" min={0} step={0.01} value={form.grossAmount} onChange={(_, d) => handleGrossChange(d.value)} placeholder="0.00" />
                    </Field>
                    <Field label={
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        VAT Amount (€)
                        {form.vatIsManual && <Text size={100} weight="semibold" style={{ backgroundColor: tokens.colorPaletteMarigoldBackground2, color: tokens.colorPaletteMarigoldForeground1, padding: '1px 6px', borderRadius: 4 }}>manual</Text>}
                        <Button appearance="transparent" size="small" onClick={resetVat} title="Reset to 7%" style={{ marginLeft: 'auto' }}>↺</Button>
                      </span>
                    }>
                      <Input type="number" min={0} step={0.01} value={form.vatAmount} onChange={(_, d) => handleVatChange(d.value)} placeholder="0.00" />
                      <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Rate: {form.vatIsManual ? 'n/a (manual)' : `${form.vatRate}%`}</Text>
                    </Field>
                  </div>

                  <div className={s.totalRow}>
                    <Text weight="medium">Net Amount</Text>
                    <Text size={500} weight="semibold">{grossNum > 0 ? formatMoney(netNum) : '—'}</Text>
                  </div>
                </>
              ) : (
                <div className={s.panel} style={{ backgroundColor: tokens.colorBrandBackground2, borderColor: tokens.colorBrandStroke2 }}>
                  <Text weight="semibold" size={300} style={{ color: tokens.colorBrandForeground1 }}>Calculated Amount</Text>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                    Each month's amount is <strong>Percentage %</strong> of the signed sum of the linked flows below (e.g. A + B − D), recomputed from each flow's own amount for that month.
                  </Text>
                  <Field label="Percentage (%)" required>
                    <Input type="number" min={0} step={0.01} value={form.percentage} onChange={(_, d) => setForm(f => ({ ...f, percentage: d.value }))} placeholder="25" />
                  </Field>
                  <Text weight="medium" size={300}>Linked Flows</Text>
                  {form.components.map((c, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Select style={{ flex: 1 }} value={c.sourceFlowId} onChange={e => updateComponent(idx, { sourceFlowId: e.target.value })}>
                        <option value="">— Select flow —</option>
                        {flows.filter(f => isActiveFlow(f) && f.cr9b5_pt_forecastflowid !== form.id).map(f => (
                          <option key={f.cr9b5_pt_forecastflowid} value={f.cr9b5_pt_forecastflowid}>{f.cr9b5_name}</option>
                        ))}
                      </Select>
                      <Select value={c.direction} onChange={e => updateComponent(idx, { direction: Number(e.target.value) })}>
                        <option value={DIRECTION_ADD}>+ Add</option>
                        <option value={DIRECTION_SUBTRACT}>− Subtract</option>
                      </Select>
                      <Button appearance="subtle" size="small" onClick={() => removeComponent(idx)}>✕</Button>
                    </div>
                  ))}
                  <Button appearance="outline" size="small" onClick={addComponent} style={{ alignSelf: 'flex-start' }}>+ Add Linked Flow</Button>
                </div>
              )}

              <div>
                <Text weight="medium" size={300} style={{ display: 'block', marginBottom: 8 }}>Properties</Text>
                <Checkbox label={<span>All Properties <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>(pro-rata at render time)</Text></span>}
                  checked={form.allProperties} onChange={(_, d) => setForm(f => ({ ...f, allProperties: !!d.checked, propertyIds: [] }))} />
                {!form.allProperties && (
                  <div className={s.propList} style={{ marginTop: 8 }}>
                    {properties.map(p => {
                      const checked = form.propertyIds.includes(p.cr9b5_pt_propertyid)
                      return (
                        <label key={p.cr9b5_pt_propertyid} className={s.propRow}>
                          <input type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, propertyIds: checked ? f.propertyIds.filter(id => id !== p.cr9b5_pt_propertyid) : [...f.propertyIds, p.cr9b5_pt_propertyid] }))} />
                          <Text size={300}>{p.cr9b5_name}</Text>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <Field label="Notes"><Textarea value={form.notes} onChange={(_, d) => setForm(f => ({ ...f, notes: d.value }))} rows={3} /></Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" disabled={saving} onClick={closeForm}>Cancel</Button>
              <Button appearance="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(_, d) => !d.open && (setDeleteTarget(null), setDeleteError(''))}>
        <DialogSurface>
          <DialogBody>
            {deleteError ? (
              <>
                <DialogTitle>Cannot Delete</DialogTitle>
                <DialogContent><Text>{deleteError}</Text></DialogContent>
                <DialogActions><Button appearance="secondary" onClick={() => { setDeleteTarget(null); setDeleteError('') }}>Close</Button></DialogActions>
              </>
            ) : (
              <>
                <DialogTitle>End Forecast Flow?</DialogTitle>
                <DialogContent><Text><strong>{deleteTarget?.cr9b5_name}</strong> will end on <strong>{lastDayOfCurrentMonth()}</strong>. Confirm?</Text></DialogContent>
                <DialogActions>
                  <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                  <Button appearance="primary" onClick={confirmDelete}>Confirm</Button>
                </DialogActions>
              </>
            )}
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
