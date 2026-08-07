import { useEffect, useState } from 'react'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_attachmentsService } from '../generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_activitylogsService } from '../generated/services/Cr9b5_pt_activitylogsService'
import { Svm_pt_invoicetemplatesService } from '../generated/services/Svm_pt_invoicetemplatesService'
import type { Cr9b5_pt_references, Cr9b5_pt_referencescr9b5_referencetype } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_activitylogs } from '../generated/models/Cr9b5_pt_activitylogsModel'
import type { Svm_pt_invoicetemplates } from '../generated/models/Svm_pt_invoicetemplatesModel'

type AdminTab = 'refdata' | 'templates' | 'activitylog'
type RefType = Cr9b5_pt_referencescr9b5_referencetype

// ─── Invoice Templates ──────────────────────────────────────────────────────

const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006
const TEMPLATE_TYPE_INCOME  = 925060000
const TEMPLATE_TYPE_EXPENSE = 925060001

interface TemplateForm {
  id: string | null
  name: string
  type: number
  categoryId: string
  description: string
  defaultAmount: string
}

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  id: null, name: '', type: TEMPLATE_TYPE_EXPENSE, categoryId: '', description: '', defaultAmount: '',
}

// ─── Reference Data ─────────────────────────────────────────────────────────

const REF_TYPE_LABELS: Record<number, string> = {
  233100000: 'Property',
  233100001: 'Supplier',
  233100002: 'Client',
  233100003: 'Expense',
  233100004: 'Income',
  233100005: 'Income Category',
  233100006: 'Expense Category',
}

const REF_TYPE_OPTIONS = Object.entries(REF_TYPE_LABELS).map(([k, v]) => ({
  value: Number(k) as RefType,
  label: v,
}))

interface FormState {
  id: string | null
  value: string
  reftype: RefType | ''
  sortorder: string
}

const EMPTY_FORM: FormState = { id: null, value: '', reftype: '', sortorder: '' }

// ─── Activity Log ────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<number, string> = {
  233100000: 'Created',
  233100001: 'Updated',
  233100002: 'Deleted',
  233100003: 'Exported',
}

const TABLE_LABELS: Record<number, string> = {
  233100000: 'Invoice',
  233100001: 'Contact',
  233100002: 'Property',
  233100003: 'Attachment',
}

function fmtTs(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Admin() {
  const [tab, setTab] = useState<AdminTab>('refdata')

  // ── Reference Data state ──
  const [refs, setRefs] = useState<Cr9b5_pt_references[]>([])
  const [usedCounts, setUsedCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Invoice Templates state ──
  const [templates, setTemplates] = useState<Svm_pt_invoicetemplates[]>([])
  const [templateCategories, setTemplateCategories] = useState<Cr9b5_pt_references[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateForm, setTemplateForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM)
  const [templateFormOpen, setTemplateFormOpen] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  // ── Activity Log state ──
  const [logs, setLogs] = useState<Cr9b5_pt_activitylogs[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logFilterAction, setLogFilterAction] = useState('')
  const [logFilterTable, setLogFilterTable] = useState('')
  const [logFilterFrom, setLogFilterFrom] = useState('')
  const [logFilterTo, setLogFilterTo] = useState('')

  // ── Reference Data ────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)
    const [refsResult, attachResult] = await Promise.all([
      Cr9b5_pt_referencesService.getAll({ orderBy: ['cr9b5_sortorder asc'], maxPageSize: 5000 }),
      Cr9b5_pt_attachmentsService.getAll({ maxPageSize: 5000 }),
    ])
    const allRefs = refsResult.data ?? []
    const allAttach = attachResult.data ?? []

    const counts: Record<string, number> = {}
    for (const a of allAttach) {
      const id = a._cr9b5_attachtype_value
      if (id) counts[id] = (counts[id] ?? 0) + 1
    }

    setRefs(allRefs)
    setUsedCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setForm(EMPTY_FORM)
    setError(null)
    setFormOpen(true)
  }

  function openEdit(r: Cr9b5_pt_references) {
    setForm({
      id: r.cr9b5_pt_referenceid,
      value: r.cr9b5_value,
      reftype: r.cr9b5_referencetype ?? '',
      sortorder: r.cr9b5_sortorder?.toString() ?? '',
    })
    setError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function save() {
    if (!form.value.trim() || form.reftype === '') {
      setError('Value and type are required.')
      return
    }
    const duplicate = refs.find(
      r =>
        r.cr9b5_referencetype === form.reftype &&
        r.cr9b5_value.trim().toLowerCase() === form.value.trim().toLowerCase() &&
        r.cr9b5_pt_referenceid !== form.id
    )
    if (duplicate) {
      setError('A reference with this type and value already exists.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      cr9b5_value: form.value.trim(),
      cr9b5_referencetype: form.reftype as RefType,
      cr9b5_sortorder: form.sortorder !== '' ? Number(form.sortorder) : undefined,
    }
    try {
      if (form.id) {
        await Cr9b5_pt_referencesService.update(form.id, payload)
      } else {
        // ownerid / owneridtype / statecode are injected by the platform at runtime
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_referencesService.create(payload as any)
      }
      closeForm()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function del(r: Cr9b5_pt_references) {
    const count = usedCounts[r.cr9b5_pt_referenceid] ?? 0
    if (count > 0) return
    if (!confirm(`Delete "${r.cr9b5_value}"?`)) return
    await Cr9b5_pt_referencesService.delete(r.cr9b5_pt_referenceid)
    await load()
  }

  const grouped = REF_TYPE_OPTIONS.map(opt => ({
    ...opt,
    items: refs.filter(r => r.cr9b5_referencetype === opt.value),
  })).filter(g => g.items.length > 0)

  // ── Invoice Templates ────────────────────────────────────────────────────

  async function loadTemplates() {
    setTemplatesLoading(true)
    const [tplRes, catRes] = await Promise.all([
      Svm_pt_invoicetemplatesService.getAll({ orderBy: ['svm_pt_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${REF_CAT_INCOME} or cr9b5_referencetype eq ${REF_CAT_EXPENSE}`,
        orderBy: ['cr9b5_sortorder asc'],
        maxPageSize: 5000,
      }),
    ])
    setTemplates(tplRes.data ?? [])
    setTemplateCategories(catRes.data ?? [])
    setTemplatesLoading(false)
  }

  useEffect(() => {
    if (tab === 'templates' && templates.length === 0) loadTemplates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  function openNewTemplate() {
    setTemplateForm(EMPTY_TEMPLATE_FORM)
    setTemplateError(null)
    setTemplateFormOpen(true)
  }

  function openEditTemplate(t: Svm_pt_invoicetemplates) {
    setTemplateForm({
      id: t.svm_pt_invoicetemplateid,
      name: t.svm_pt_name ?? '',
      type: t.svm_pt_type ?? TEMPLATE_TYPE_EXPENSE,
      categoryId: t._svm_category_value ?? '',
      description: t.svm_pt_description ?? '',
      defaultAmount: t.svm_pt_defaultamount?.toString() ?? '',
    })
    setTemplateError(null)
    setTemplateFormOpen(true)
  }

  function closeTemplateForm() {
    setTemplateFormOpen(false)
    setTemplateForm(EMPTY_TEMPLATE_FORM)
    setTemplateError(null)
  }

  async function saveTemplate() {
    if (!templateForm.name.trim()) {
      setTemplateError('Name is required.')
      return
    }
    setTemplateSaving(true)
    setTemplateError(null)
    const payload: Record<string, unknown> = {
      svm_pt_name: templateForm.name.trim(),
      svm_pt_type: templateForm.type,
      svm_pt_description: templateForm.description.trim() || undefined,
      svm_pt_defaultamount: templateForm.defaultAmount !== '' ? Number(templateForm.defaultAmount) : undefined,
    }
    if (templateForm.categoryId) {
      payload['svm_Category@odata.bind'] = `/cr9b5_pt_references(${templateForm.categoryId})`
    }
    try {
      if (templateForm.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Svm_pt_invoicetemplatesService.update(templateForm.id, payload as any)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Svm_pt_invoicetemplatesService.create(payload as any)
      }
      closeTemplateForm()
      await loadTemplates()
    } catch (e: unknown) {
      setTemplateError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function deleteTemplate(t: Svm_pt_invoicetemplates) {
    if (!confirm(`Delete template "${t.svm_pt_name}"?`)) return
    await Svm_pt_invoicetemplatesService.delete(t.svm_pt_invoicetemplateid)
    await loadTemplates()
  }

  const templateCategoryOptions = templateCategories.filter(c =>
    (c.cr9b5_referencetype as unknown as number) === (templateForm.type === TEMPLATE_TYPE_INCOME ? REF_CAT_INCOME : REF_CAT_EXPENSE)
  )

  // ── Activity Log ──────────────────────────────────────────────────────────

  async function loadLogs() {
    setLogsLoading(true)
    const result = await Cr9b5_pt_activitylogsService.getAll({
      orderBy: ['cr9b5_timestamp desc'],
      maxPageSize: 5000,
    })
    setLogs(result.data ?? [])
    setLogsLoading(false)
  }

  useEffect(() => {
    if (tab === 'activitylog' && logs.length === 0) loadLogs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const filteredLogs = logs.filter(l => {
    const actionNum = (l.cr9b5_action as unknown as number)
    const tableNum  = (l.cr9b5_tablemame as unknown as number)
    if (logFilterAction && String(actionNum) !== logFilterAction) return false
    if (logFilterTable  && String(tableNum)  !== logFilterTable)  return false
    if (logFilterFrom && l.cr9b5_timestamp && l.cr9b5_timestamp < new Date(logFilterFrom).toISOString()) return false
    if (logFilterTo   && l.cr9b5_timestamp && l.cr9b5_timestamp > new Date(logFilterTo + 'T23:59:59').toISOString()) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-5">Admin</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          { id: 'refdata',     label: 'Reference Data' },
          { id: 'templates',   label: 'Invoice Templates' },
          { id: 'activitylog', label: 'Activity Log' },
        ] as { id: AdminTab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Reference Data ── */}
      {tab === 'refdata' && (
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">Manage lookup values used across the app.</p>
            <button
              onClick={openNew}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Reference
            </button>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <div className="space-y-6">
              {grouped.length === 0 && (
                <p className="text-gray-400 text-sm">No reference data yet. Add your first entry.</p>
              )}
              {grouped.map(group => (
                <div key={group.value} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group.label}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                        <th className="px-4 py-2 font-medium">Value</th>
                        <th className="px-4 py-2 font-medium w-20">Sort</th>
                        <th className="px-4 py-2 font-medium w-24">Usage</th>
                        <th className="px-4 py-2 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(r => {
                        const count = usedCounts[r.cr9b5_pt_referenceid] ?? 0
                        return (
                          <tr key={r.cr9b5_pt_referenceid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-800">{r.cr9b5_value}</td>
                            <td className="px-4 py-2.5 text-gray-500">{r.cr9b5_sortorder ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              {count > 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                  Used {count}×
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">unused</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => openEdit(r)}
                                  className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => del(r)}
                                  disabled={count > 0}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium disabled:text-gray-300 disabled:cursor-not-allowed"
                                  title={count > 0 ? 'In use — cannot delete' : 'Delete'}
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
              ))}
            </div>
          )}

          {/* Modal */}
          {formOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {form.id ? 'Edit Reference' : 'Add Reference'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={form.reftype}
                      onChange={e => setForm(f => ({ ...f, reftype: Number(e.target.value) as RefType }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select type…</option>
                      {REF_TYPE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                    <input
                      type="text"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. House Rules, Receipt…"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                    <input
                      type="number"
                      value={form.sortorder}
                      onChange={e => setForm(f => ({ ...f, sortorder: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {error && (
                  <p className="mt-3 text-sm text-red-600">{error}</p>
                )}

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={closeForm}
                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Invoice Templates ── */}
      {tab === 'templates' && (
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">Reusable presets shown as "Use Template" when creating a new invoice.</p>
            <button
              onClick={openNewTemplate}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Template
            </button>
          </div>

          {templatesLoading ? (
            <p className="text-gray-500">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="text-gray-400 text-sm">No templates yet. Add your first one.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Type</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Description</th>
                    <th className="px-4 py-2.5 font-medium text-right">Default Amount</th>
                    <th className="px-4 py-2.5 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.svm_pt_invoicetemplateid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{t.svm_pt_name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{t.svm_pt_type === TEMPLATE_TYPE_INCOME ? 'Income' : 'Expense'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{t.svm_categoryname ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{t.svm_pt_description ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">
                        {t.svm_pt_defaultamount != null ? t.svm_pt_defaultamount.toFixed(2) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEditTemplate(t)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Edit</button>
                          <button onClick={() => deleteTemplate(t)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal */}
          {templateFormOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {templateForm.id ? 'Edit Template' : 'Add Template'}
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={templateForm.name}
                      onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g. Annual Insurance Renewal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
                      {[{ val: TEMPLATE_TYPE_EXPENSE, label: 'Expense' }, { val: TEMPLATE_TYPE_INCOME, label: 'Income' }].map(opt => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setTemplateForm(f => ({ ...f, type: opt.val, categoryId: '' }))}
                          className={[
                            'px-4 py-1.5 text-sm font-medium transition-colors',
                            templateForm.type === opt.val ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={templateForm.categoryId}
                      onChange={e => setTemplateForm(f => ({ ...f, categoryId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">No category</option>
                      {templateCategoryOptions.map(c => (
                        <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <input
                      type="text"
                      value={templateForm.description}
                      onChange={e => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Pre-fills the invoice description (optional)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Amount</label>
                    <input
                      type="number" min="0" step="0.01"
                      value={templateForm.defaultAmount}
                      onChange={e => setTemplateForm(f => ({ ...f, defaultAmount: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                {templateError && <p className="mt-3 text-sm text-red-600">{templateError}</p>}

                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={closeTemplateForm} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveTemplate}
                    disabled={templateSaving}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {templateSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Activity Log ── */}
      {tab === 'activitylog' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
              <select
                value={logFilterAction}
                onChange={e => setLogFilterAction(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All actions</option>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Table</label>
              <select
                value={logFilterTable}
                onChange={e => setLogFilterTable(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All tables</option>
                {Object.entries(TABLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={logFilterFrom}
                onChange={e => setLogFilterFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={logFilterTo}
                onChange={e => setLogFilterTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={loadLogs}
              className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
          </div>

          {logsLoading ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 font-medium">Timestamp</th>
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 font-medium">Action</th>
                      <th className="px-4 py-2.5 font-medium">Table</th>
                      <th className="px-4 py-2.5 font-medium">Record</th>
                      <th className="px-4 py-2.5 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">
                          No activity log entries found.
                        </td>
                      </tr>
                    ) : filteredLogs.map(l => {
                      const actionNum = l.cr9b5_action as unknown as number
                      const tableNum  = l.cr9b5_tablemame as unknown as number
                      return (
                        <tr key={l.cr9b5_pt_activitylogid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">{fmtTs(l.cr9b5_timestamp)}</td>
                          <td className="px-4 py-2.5 text-gray-800">{l.cr9b5_user}</td>
                          <td className="px-4 py-2.5">
                            <span className={[
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                              actionNum === 233100000 ? 'bg-green-50 text-green-700' :
                              actionNum === 233100001 ? 'bg-blue-50 text-blue-700' :
                              actionNum === 233100002 ? 'bg-red-50 text-red-700' :
                              'bg-purple-50 text-purple-700',
                            ].join(' ')}>
                              {ACTION_LABELS[actionNum] ?? l.cr9b5_actionname ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{TABLE_LABELS[tableNum] ?? l.cr9b5_tablemamename ?? '—'}</td>
                          <td className="px-4 py-2.5 text-gray-800 font-mono text-xs">{l.cr9b5_recordname}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate" title={l.cr9b5_details ?? undefined}>
                            {l.cr9b5_details ?? <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
                {filteredLogs.length !== logs.length && ` (filtered from ${logs.length})`}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
