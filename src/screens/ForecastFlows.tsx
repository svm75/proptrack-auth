import { useEffect, useState } from 'react'
import { Cr9b5_pt_forecastflowsService } from '../generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService } from '../generated/services/Cr9b5_forecastpropertiesService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import type { Cr9b5_pt_forecastflows } from '../generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties } from '../generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import { logActivity } from '../services/activitylog'
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

const FREQ_LABELS: Record<number, string> = {
  [FREQ_ONE_OFF]:       'One-off',
  [FREQ_DAILY]:         'Daily',
  [FREQ_WEEKLY]:        'Weekly',
  [FREQ_MONTHLY]:       'Monthly',
  [FREQ_QUARTERLY]:     'Quarterly',
  [FREQ_SEMI_ANNUALLY]: 'Semi-annually',
  [FREQ_ANNUALLY]:      'Annually',
}

const REF_INCOME_CATEGORY  = 233100005
const REF_EXPENSE_CATEGORY = 233100006

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// day numbers 1=Mon … 7=Sun

// ── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function firstOfNextMonth(): string {
  const d = new Date()
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
  const m = d.getMonth() === 11 ? 1 : d.getMonth() + 2
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function lastDayOfPrevMonth(firstDay: string): string {
  // e.g. firstDay = '2025-03-01' → last day of Feb = '2025-02-28'
  const [y, m] = firstDay.split('-').map(Number)
  return new Date(y, m - 1, 0).toISOString().slice(0, 10)
}

function lastDayOfCurrentMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

function isActiveFlow(flow: Cr9b5_pt_forecastflows): boolean {
  return !flow.cr9b5_enddate || flow.cr9b5_enddate >= today()
}

function isFirstOfMonth(date: string): boolean {
  return date.endsWith('-01')
}

function calcVat(gross: string): string {
  const g = parseFloat(gross)
  if (isNaN(g) || g <= 0) return ''
  return String(Math.round((g / 1.07) * 0.07 * 100) / 100)
}

// ── Form state ───────────────────────────────────────────────────────────────

interface FlowForm {
  id: string | null
  parentFlowId: string | null  // original parent for versioning
  name: string
  type: number
  categoryId: string
  contactId: string
  frequency: number
  daysOfWeek: number[]
  startDate: string
  endDate: string
  grossAmount: string
  vatRate: string
  vatAmount: string
  vatIsManual: boolean
  allProperties: boolean
  propertyIds: string[]
  notes: string
  effectiveFrom: string  // versioning: only used when editing
}

function emptyForm(): FlowForm {
  return {
    id: null,
    parentFlowId: null,
    name: '',
    type: TYPE_INCOME,
    categoryId: '',
    contactId: '',
    frequency: FREQ_MONTHLY,
    daysOfWeek: [1, 2, 3, 4, 5],
    startDate: firstOfNextMonth(),
    endDate: '',
    grossAmount: '',
    vatRate: '7',
    vatAmount: '',
    vatIsManual: false,
    allProperties: true,
    propertyIds: [],
    notes: '',
    effectiveFrom: firstOfNextMonth(),
  }
}

function flowToForm(
  flow: Cr9b5_pt_forecastflows,
  linkedPropIds: string[],
): FlowForm {
  const raw = flow as unknown as Record<string, unknown>
  return {
    id: flow.cr9b5_pt_forecastflowid,
    parentFlowId:
      (flow._cr9b5_parentflowid_value as string | undefined) ??
      (flow.cr9b5_pt_forecastflowid),   // if no parent, itself becomes parent ref on next version
    name: flow.cr9b5_name ?? '',
    type: (flow.cr9b5_type as unknown as number) ?? TYPE_INCOME,
    categoryId: (flow._cr9b5_categoryid_value as string) ?? '',
    contactId: (flow._cr9b5_contactid_value as string) ?? '',
    frequency: (flow.cr9b5_frequency as unknown as number) ?? FREQ_MONTHLY,
    daysOfWeek: parseDaysOfWeek((raw['cr9b5_daysofweek'] as string) ?? ''),
    startDate: flow.cr9b5_startdate?.slice(0, 10) ?? '',
    endDate: flow.cr9b5_enddate?.slice(0, 10) ?? '',
    grossAmount: String((raw['cr9b5_grossamount'] as number) ?? ''),
    vatRate: flow.cr9b5_vatrate ?? '7',
    vatAmount: String(flow.cr9b5_vatamount ?? ''),
    vatIsManual: flow.cr9b5_vatismanual ?? false,
    allProperties: flow.cr9b5_allproperties ?? true,
    propertyIds: linkedPropIds,
    notes: flow.cr9b5_notes ?? '',
    effectiveFrom: firstOfNextMonth(),
  }
}

function parseDaysOfWeek(s: string): number[] {
  if (!s) return [1, 2, 3, 4, 5]
  return s.split(',').map(Number).filter(n => n >= 1 && n <= 7)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ForecastFlows() {
  const [flows, setFlows]             = useState<Cr9b5_pt_forecastflows[]>([])
  const [flowProps, setFlowProps]     = useState<Cr9b5_forecastproperties[]>([])
  const [references, setReferences]   = useState<Cr9b5_pt_references[]>([])
  const [contacts, setContacts]       = useState<Cr9b5_pt_contacts[]>([])
  const [properties, setProperties]   = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading]         = useState(true)

  // Filters
  const [search, setSearch]           = useState('')
  const [typeFilter, setTypeFilter]   = useState<number | null>(null)
  const [freqFilter, setFreqFilter]   = useState<number | null>(null)
  const [propFilter, setPropFilter]   = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)

  // Form
  const [formOpen, setFormOpen]       = useState(false)
  const [form, setForm]               = useState<FlowForm>(emptyForm())
  const [saving, setSaving]           = useState(false)
  const [formError, setFormError]     = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Cr9b5_pt_forecastflows | null>(null)
  const [deleteError, setDeleteError]   = useState('')

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

  // ── Derived data ──────────────────────────────────────────────────────────

  const incomeCategories = references.filter(
    r => (r.cr9b5_referencetype as unknown as number) === REF_INCOME_CATEGORY
  )
  const expenseCategories = references.filter(
    r => (r.cr9b5_referencetype as unknown as number) === REF_EXPENSE_CATEGORY
  )

  function propIdsForFlow(flowId: string): string[] {
    return flowProps
      .filter(fp => fp._cr9b5_forecastflowid_value === flowId)
      .map(fp => fp._cr9b5_propertyid_value ?? '')
      .filter(Boolean)
  }

  // Resolve display name helpers
  function categoryName(id: string): string {
    return references.find(r => r.cr9b5_pt_referenceid === id)?.cr9b5_value ?? '—'
  }
  function contactName(id: string): string {
    return contacts.find(c => c.cr9b5_pt_contactid === id)?.cr9b5_name ?? '—'
  }
  function propertyName(id: string): string {
    return properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? id
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const visibleFlows = flows.filter(f => {
    const raw = f as unknown as Record<string, unknown>
    const active = isActiveFlow(f)
    if (!showInactive && !active) return false

    if (typeFilter !== null && (f.cr9b5_type as unknown as number) !== typeFilter) return false
    if (freqFilter !== null && (f.cr9b5_frequency as unknown as number) !== freqFilter) return false

    if (propFilter) {
      const allProps = f.cr9b5_allproperties
      if (!allProps) {
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

  // ── Form open ─────────────────────────────────────────────────────────────

  function openNew() {
    setForm(emptyForm())
    setFormError('')
    setFormOpen(true)
  }

  function openEdit(flow: Cr9b5_pt_forecastflows) {
    const linked = propIdsForFlow(flow.cr9b5_pt_forecastflowid)
    setForm(flowToForm(flow, linked))
    setFormError('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormError('')
  }

  // ── VAT helpers ───────────────────────────────────────────────────────────

  function handleGrossChange(val: string) {
    setForm(f => f.vatIsManual
      ? { ...f, grossAmount: val }
      : { ...f, grossAmount: val, vatAmount: calcVat(val) }
    )
  }

  function handleVatChange(val: string) {
    setForm(f => ({ ...f, vatAmount: val, vatIsManual: true, vatRate: 'n/a' }))
  }

  function resetVat() {
    setForm(f => ({
      ...f,
      vatIsManual: false,
      vatRate: '7',
      vatAmount: calcVat(f.grossAmount),
    }))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function save() {
    setFormError('')

    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.categoryId)  { setFormError('Category is required.'); return }
    if (!form.startDate)   { setFormError('Start date is required.'); return }
    if (!isFirstOfMonth(form.startDate)) { setFormError('Start date must be the first day of a month.'); return }
    if (!form.grossAmount || parseFloat(form.grossAmount) <= 0) { setFormError('Gross amount must be > 0.'); return }
    if (!form.allProperties && form.propertyIds.length === 0) { setFormError('Select at least one property.'); return }
    if ((form.frequency as number) === FREQ_DAILY && form.daysOfWeek.length === 0) {
      setFormError('Select at least one day of the week.'); return
    }
    if (form.id) {
      // Editing — versioning
      if (!form.effectiveFrom) { setFormError('Effective From is required.'); return }
      if (!isFirstOfMonth(form.effectiveFrom)) { setFormError('Effective From must be the first day of a month.'); return }
      if (form.effectiveFrom < today()) { setFormError('Effective From cannot be in the past.'); return }
    }

    setSaving(true)
    try {
      if (form.id) {
        await saveEdit()
      } else {
        await saveNew()
      }
      await loadAll()
      closeForm()
    } catch (e) {
      setFormError('Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function saveNew() {
    const payload = buildPayload()
    const res = await Cr9b5_pt_forecastflowsService.create(payload as any)
    const newId = (res.data as any)?.cr9b5_pt_forecastflowid as string
    await savePropertyLinks(newId)
    await logActivity('Created', 'Forecast Flow', form.name.trim())
  }

  async function saveEdit() {
    const currentId = form.id!
    const parentId  = form.parentFlowId ?? currentId

    // End the current record: enddate = last day of month before effectiveFrom
    const newEndDate = lastDayOfPrevMonth(form.effectiveFrom)
    await Cr9b5_pt_forecastflowsService.update(currentId, { cr9b5_enddate: newEndDate } as any)

    // Find the original end date (what we want the new version to inherit)
    const currentFlow = flows.find(f => f.cr9b5_pt_forecastflowid === currentId)
    const originalEndDate = currentFlow?.cr9b5_enddate ?? null

    // Create new version
    const payload = {
      ...buildPayload(),
      cr9b5_startdate: form.effectiveFrom,
      ...(originalEndDate ? { cr9b5_enddate: originalEndDate } : {}),
      'cr9b5_parentflowid@odata.bind': `/cr9b5_pt_forecastflows(${parentId})`,
    }
    const res = await Cr9b5_pt_forecastflowsService.create(payload as any)
    const newId = (res.data as any)?.cr9b5_pt_forecastflowid as string
    await savePropertyLinks(newId)

    await logActivity(
      'Updated',
      'Forecast Flow',
      form.name.trim(),
      `Versioned from ${form.effectiveFrom}`,
    )
  }

  function buildPayload() {
    const gross = parseFloat(form.grossAmount) || 0
    const vat   = parseFloat(form.vatAmount) || 0
    const net   = Math.round((gross - vat) * 100) / 100

    return {
      cr9b5_name:       form.name.trim(),
      cr9b5_type:       form.type as any,
      'cr9b5_categoryid@odata.bind': `/cr9b5_pt_references(${form.categoryId})`,
      ...(form.contactId
        ? { 'cr9b5_contactid@odata.bind': `/cr9b5_pt_contacts(${form.contactId})` }
        : {}),
      cr9b5_frequency:  form.frequency as any,
      cr9b5_daysofweek: form.frequency === FREQ_DAILY ? form.daysOfWeek.join(',') : null,
      cr9b5_startdate:  form.startDate,
      ...(form.endDate && form.frequency !== FREQ_ONE_OFF
        ? { cr9b5_enddate: form.endDate }
        : form.frequency === FREQ_ONE_OFF
          ? { cr9b5_enddate: form.startDate }
          : {}),
      cr9b5_grossamount: gross,
      cr9b5_vatrate:     form.vatIsManual ? 'n/a' : form.vatRate,
      cr9b5_vatamount:   vat,
      cr9b5_netamount:   net,
      cr9b5_vatismanual: form.vatIsManual,
      cr9b5_allproperties: form.allProperties,
      cr9b5_notes:       form.notes.trim() || null,
    }
  }

  async function savePropertyLinks(flowId: string) {
    if (form.allProperties) return
    await Promise.all(
      form.propertyIds.map(pid =>
        Cr9b5_forecastpropertiesService.create({
          cr9b5_name: `${form.name.trim()} - ${propertyName(pid)}`,
          'cr9b5_forecastflowid@odata.bind': `/cr9b5_pt_forecastflows(${flowId})`,
          'cr9b5_propertyid@odata.bind': `/cr9b5_pt_properties(${pid})`,
        } as any)
      )
    )
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  function requestDelete(flow: Cr9b5_pt_forecastflows) {
    const endDate = flow.cr9b5_enddate?.slice(0, 10)
    if (endDate && endDate < today()) {
      setDeleteError('This flow has already ended and cannot be deleted.')
      setDeleteTarget(flow)
      return
    }
    setDeleteError('')
    setDeleteTarget(flow)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const endDate = deleteTarget.cr9b5_enddate?.slice(0, 10)
    if (endDate && endDate < today()) return

    const eom = lastDayOfCurrentMonth()
    await Cr9b5_pt_forecastflowsService.update(deleteTarget.cr9b5_pt_forecastflowid, {
      cr9b5_enddate: eom,
    } as any)
    await logActivity('Deleted', 'Forecast Flow', deleteTarget.cr9b5_name ?? '')
    await loadAll()
    setDeleteTarget(null)
  }

  // ── Computed form values ──────────────────────────────────────────────────

  const grossNum = parseFloat(form.grossAmount) || 0
  const vatNum   = parseFloat(form.vatAmount) || 0
  const netNum   = Math.round((grossNum - vatNum) * 100) / 100

  const categories = form.type === TYPE_INCOME ? incomeCategories : expenseCategories

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Forecast Flows</h1>
        <button
          onClick={openNew}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Add Flow
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white border border-gray-200 rounded-xl p-3">
        <input
          type="text"
          placeholder="Search name or counterparty…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 w-56"
        />
        <select
          value={typeFilter ?? ''}
          onChange={e => setTypeFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Types</option>
          <option value={TYPE_INCOME}>Income</option>
          <option value={TYPE_EXPENSE}>Expense</option>
        </select>
        <select
          value={freqFilter ?? ''}
          onChange={e => setFreqFilter(e.target.value === '' ? null : Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Frequencies</option>
          {Object.entries(FREQ_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={propFilter}
          onChange={e => setPropFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All Properties</option>
          {properties.map(p => (
            <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          Show inactive
        </label>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : visibleFlows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No flows found.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Counterparty</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Frequency</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Start</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">End</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Gross</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Properties</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibleFlows.map(f => {
                const active = isActiveFlow(f)
                const raw = f as unknown as Record<string, unknown>
                const linked = propIdsForFlow(f.cr9b5_pt_forecastflowid)
                return (
                  <tr
                    key={f.cr9b5_pt_forecastflowid}
                    className={[
                      'border-b border-gray-50 last:border-0',
                      active ? 'hover:bg-gray-50' : 'opacity-50',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{f.cr9b5_name}</td>
                    <td className="px-4 py-3">
                      {(f.cr9b5_type as unknown as number) === TYPE_INCOME ? (
                        <span className="text-xs font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Income</span>
                      ) : (
                        <span className="text-xs font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Expense</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {categoryName(f._cr9b5_categoryid_value ?? '')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {f._cr9b5_contactid_value ? contactName(f._cr9b5_contactid_value) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {FREQ_LABELS[(f.cr9b5_frequency as unknown as number)] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{f.cr9b5_startdate?.slice(0, 10) ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{f.cr9b5_enddate?.slice(0, 10) ?? '∞'}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">
                      {raw['cr9b5_grossamount'] != null ? fmtEur(raw['cr9b5_grossamount'] as number) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {f.cr9b5_allproperties
                        ? <span className="italic">All</span>
                        : linked.map(id => propertyName(id)).join(', ') || '—'
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => openEdit(f)}
                          className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => requestDelete(f)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Form modal ────────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900">
              {form.id ? 'Edit Forecast Flow' : 'New Forecast Flow'}
            </h2>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                {formError}
              </div>
            )}

            {/* Effective From (edit only) */}
            {form.id && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Versioning</p>
                <p className="text-xs text-amber-700">
                  Saving will end the current version and create a new one from the effective date.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
                  <input
                    type="date"
                    value={form.effectiveFrom}
                    onChange={e => setForm(f => ({ ...f, effectiveFrom: e.target.value }))}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">Must be the 1st of a month and not in the past.</p>
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
              <div className="flex gap-3">
                {[
                  { val: TYPE_INCOME,  label: 'Income',  cls: 'green' },
                  { val: TYPE_EXPENSE, label: 'Expense', cls: 'red'   },
                ].map(t => (
                  <button
                    key={t.val}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, type: t.val, categoryId: '' }))}
                    className={[
                      'px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors',
                      form.type === t.val
                        ? t.cls === 'green'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select
                value={form.categoryId}
                onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">— Select —</option>
                {categories.map(c => (
                  <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>
                    {c.cr9b5_value}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  No {form.type === TYPE_INCOME ? 'Income' : 'Expense'} Categories found. Add them in Admin → Reference Data.
                </p>
              )}
            </div>

            {/* Counterparty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Counterparty</label>
              <select
                value={form.contactId}
                onChange={e => setForm(f => ({ ...f, contactId: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">— None —</option>
                {contacts.map(c => (
                  <option key={c.cr9b5_pt_contactid} value={c.cr9b5_pt_contactid}>{c.cr9b5_name}</option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Frequency *</label>
              <select
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {Object.entries(FREQ_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Days of week (Daily only) */}
            {form.frequency === FREQ_DAILY && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week *</label>
                <div className="flex gap-2 flex-wrap">
                  {DOW_LABELS.map((lbl, i) => {
                    const day = i + 1
                    const active = form.daysOfWeek.includes(day)
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          daysOfWeek: active
                            ? f.daysOfWeek.filter(d => d !== day)
                            : [...f.daysOfWeek, day].sort(),
                        }))}
                        className={[
                          'px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors',
                          active
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
                        ].join(' ')}
                      >
                        {lbl}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Start / End date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date * <span className="text-xs text-gray-400">(1st of month)</span></label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {form.frequency !== FREQ_ONE_OFF && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-xs text-gray-400">(blank = infinite)</span></label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}
            </div>

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gross Amount (€) *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.grossAmount}
                  onChange={e => handleGrossChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  VAT Amount (€)
                  {form.vatIsManual && (
                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">manual</span>
                  )}
                  <button type="button" onClick={resetVat} title="Reset to 7%" className="text-gray-400 hover:text-teal-600 text-base leading-none ml-auto">↺</button>
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.vatAmount}
                  onChange={e => handleVatChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Rate: {form.vatIsManual ? 'n/a (manual)' : `${form.vatRate}%`}
                </p>
              </div>
            </div>

            {/* Net amount display */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Net Amount</span>
              <span className="text-lg font-semibold text-gray-900">
                {grossNum > 0 ? fmtEur(netNum) : '—'}
              </span>
            </div>

            {/* Properties */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Properties</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer mb-3 select-none">
                <input
                  type="checkbox"
                  checked={form.allProperties}
                  onChange={e => setForm(f => ({ ...f, allProperties: e.target.checked, propertyIds: [] }))}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="font-medium text-gray-700">All Properties</span>
                <span className="text-xs text-gray-400">(pro-rata at render time)</span>
              </label>
              {!form.allProperties && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {properties.map(p => {
                    const checked = form.propertyIds.includes(p.cr9b5_pt_propertyid)
                    return (
                      <label key={p.cr9b5_pt_propertyid} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setForm(f => ({
                            ...f,
                            propertyIds: checked
                              ? f.propertyIds.filter(id => id !== p.cr9b5_pt_propertyid)
                              : [...f.propertyIds, p.cr9b5_pt_propertyid],
                          }))}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="text-sm text-gray-700">{p.cr9b5_name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            {deleteError ? (
              <>
                <h2 className="text-base font-bold text-red-700">Cannot Delete</h2>
                <p className="text-sm text-gray-600">{deleteError}</p>
                <div className="flex justify-end">
                  <button
                    onClick={() => { setDeleteTarget(null); setDeleteError('') }}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-gray-900">End Forecast Flow?</h2>
                <p className="text-sm text-gray-600">
                  <strong>{deleteTarget.cr9b5_name}</strong> will end on{' '}
                  <strong>{lastDayOfCurrentMonth()}</strong>. Confirm?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg"
                  >
                    Confirm
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
