import { useEffect, useState } from 'react'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_attachmentsService } from '../generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_activitylogsService } from '../generated/services/Cr9b5_pt_activitylogsService'
import type { Cr9b5_pt_references, Cr9b5_pt_referencescr9b5_referencetype } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_activitylogs } from '../generated/models/Cr9b5_pt_activitylogsModel'

type AdminTab = 'refdata' | 'activitylog'
type RefType = Cr9b5_pt_referencescr9b5_referencetype

// ─── Reference Data ─────────────────────────────────────────────────────────

const REF_TYPE_LABELS: Record<number, string> = {
  233100000: 'Property',
  233100001: 'Supplier',
  233100002: 'Client',
  233100003: 'Incoming Invoice',
  233100004: 'Outgoing Invoice',
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
