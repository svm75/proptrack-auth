import { useEffect, useRef, useState } from 'react'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_attachmentsService } from '../generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_attachments } from '../generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import { uploadFile, deleteFile, getOrCreateFolder, propertyFolderPath, isAuthorized, authorizeWithPopup } from '../services/googledrive'
import InvoiceForm from './InvoiceForm'

const PROP_REF_TYPE = 233100000
const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001

interface PropForm {
  id: string | null
  name: string
  shortid: string
  address: string
  notes: string
}

const EMPTY_FORM: PropForm = { id: null, name: '', shortid: '', address: '', notes: '' }

interface AttachForm {
  typeRefId: string
  fileName: string
  file: File | null
  uploading: boolean
  driveId: string
  driveUrl: string
}

const EMPTY_ATTACH: AttachForm = { typeRefId: '', fileName: '', file: null, uploading: false, driveId: '', driveUrl: '' }

interface YearSummary {
  year: number
  income: number
  expenses: number
}

function fmtEur(n: number): string {
  const [int, dec] = n.toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `€ ${intFormatted}.${dec}`
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Properties() {
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Property form modal
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<PropForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Detail panel
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [propInvoices, setPropInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [propInvLoading, setPropInvLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)

  // Attachments sub-panel (inside detail panel)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachments, setAttachments] = useState<Cr9b5_pt_attachments[]>([])
  const [attachRefTypes, setAttachRefTypes] = useState<Cr9b5_pt_references[]>([])
  const [attachForm, setAttachForm] = useState<AttachForm>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [gdConnected, setGdConnected] = useState(isAuthorized())

  async function load() {
    setLoading(true)
    const [propsRes, invRes, conRes] = await Promise.all([
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_invoicesService.getAll({ select: ['cr9b5_pt_invoiceid', '_cr9b5_property_value'], maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
    ])
    const allProps = propsRes.data ?? []
    const allInv = (invRes.data ?? []) as unknown as Array<Record<string, unknown>>

    const counts: Record<string, number> = {}
    for (const inv of allInv) {
      const pid = inv['_cr9b5_property_value'] as string | undefined
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1
    }
    setProperties(allProps)
    setContacts(conRes.data ?? [])
    setInvoiceCounts(counts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // --- Property CRUD ---

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(p: Cr9b5_pt_properties) {
    setForm({ id: p.cr9b5_pt_propertyid, name: p.cr9b5_name, shortid: p.cr9b5_shortid, address: p.cr9b5_address, notes: p.cr9b5_notes ?? '' })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  async function saveProperty() {
    if (!form.name.trim() || !form.shortid.trim() || !form.address.trim()) {
      setFormError('Name, Short ID, and Address are required.')
      return
    }
    const shortIdUpper = form.shortid.trim().toUpperCase()
    const duplicate = properties.find(
      p => p.cr9b5_shortid.toUpperCase() === shortIdUpper && p.cr9b5_pt_propertyid !== form.id
    )
    if (duplicate) {
      setFormError(`Short ID "${shortIdUpper}" is already used by "${duplicate.cr9b5_name}".`)
      return
    }
    setSaving(true)
    setFormError(null)
    const payload = {
      cr9b5_name: form.name.trim(),
      cr9b5_shortid: shortIdUpper,
      cr9b5_address: form.address.trim(),
      cr9b5_notes: form.notes.trim() || undefined,
    }
    try {
      if (form.id) {
        await Cr9b5_pt_propertiesService.update(form.id, payload)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_propertiesService.create(payload as any)
      }
      closeForm()
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteProperty(p: Cr9b5_pt_properties) {
    const count = invoiceCounts[p.cr9b5_pt_propertyid] ?? 0
    if (count > 0) {
      alert(`Cannot delete — "${p.cr9b5_name}" has ${count} invoice(s).`)
      return
    }
    if (!confirm(`Delete property "${p.cr9b5_name}"?`)) return
    await Cr9b5_pt_propertiesService.delete(p.cr9b5_pt_propertyid)
    if (selectedPropId === p.cr9b5_pt_propertyid) setSelectedPropId(null)
    await load()
  }

  // --- Detail panel ---

  async function openDetail(propId: string) {
    if (selectedPropId === propId) {
      setSelectedPropId(null)
      return
    }
    setSelectedPropId(propId)
    setAttachOpen(false)
    setPropInvLoading(true)
    setSelectedYear(null)
    setPropInvoices([])

    const res = await Cr9b5_pt_invoicesService.getAll({
      filter: `_cr9b5_property_value eq '${propId}'`,
      orderBy: ['cr9b5_date desc'],
      maxPageSize: 5000,
    })
    const invs = res.data ?? []
    setPropInvoices(invs)

    // default to most recent year > 2020
    const years = Array.from(new Set(
      invs
        .map(i => i.cr9b5_date ? new Date(i.cr9b5_date).getFullYear() : null)
        .filter((y): y is number => y !== null && y > 2020)
    )).sort((a, b) => b - a)
    setSelectedYear(years[0] ?? null)
    setPropInvLoading(false)
  }

  function closeDetail() {
    setSelectedPropId(null)
    setAttachOpen(false)
  }

  // Year summaries
  const yearSummaries: YearSummary[] = (() => {
    const map = new Map<number, YearSummary>()
    for (const inv of propInvoices) {
      if (!inv.cr9b5_date) continue
      const y = new Date(inv.cr9b5_date).getFullYear()
      if (y <= 2020) continue
      if (!map.has(y)) map.set(y, { year: y, income: 0, expenses: 0 })
      const s = map.get(y)!
      const raw = inv as unknown as Record<string, unknown>
      const type = raw['cr9b5_type'] as number | undefined ?? (inv.cr9b5_type as unknown as number)
      const gross = inv.cr9b5_totalgross ?? 0
      if (type === TYPE_INCOMING) s.income += gross
      else if (type === TYPE_OUTGOING) s.expenses += gross
    }
    return Array.from(map.values()).sort((a, b) => b.year - a.year)
  })()

  const yearInvoices = propInvoices.filter(inv => {
    if (!inv.cr9b5_date || !selectedYear) return false
    return new Date(inv.cr9b5_date).getFullYear() === selectedYear
  })

  function contactName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_contact_value'] as string | undefined
    return contacts.find(c => c.cr9b5_pt_contactid === id)?.cr9b5_name ?? '—'
  }

  function invType(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const type = raw['cr9b5_type'] as number | undefined ?? (inv.cr9b5_type as unknown as number)
    return type === TYPE_OUTGOING ? 'Outgoing' : 'Incoming'
  }

  // --- Attachments ---

  async function openAttachments(propId: string) {
    setAttachOpen(true)
    setAttachForm(EMPTY_ATTACH)
    setAttachError(null)
    setAttachLoading(true)
    const [attachRes, refRes] = await Promise.all([
      Cr9b5_pt_attachmentsService.getAll({
        filter: `_cr9b5_propertyid_value eq '${propId}'`,
        orderBy: ['cr9b5_uploadedon desc'],
      }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${PROP_REF_TYPE}`,
        orderBy: ['cr9b5_sortorder asc'],
      }),
    ])
    setAttachments(attachRes.data ?? [])
    setAttachRefTypes(refRes.data ?? [])
    setAttachLoading(false)
  }

  async function handleFileSelect(file: File, propId: string) {
    const prop = properties.find(p => p.cr9b5_pt_propertyid === propId)
    if (!prop) return
    setAttachForm(f => ({ ...f, file, fileName: file.name, uploading: true, driveId: '', driveUrl: '' }))
    setAttachError(null)
    try {
      const folderId = await getOrCreateFolder(propertyFolderPath(prop.cr9b5_name, prop.cr9b5_shortid))
      const { id, webViewLink } = await uploadFile(file, folderId)
      setAttachForm(f => ({ ...f, uploading: false, driveId: id, driveUrl: webViewLink }))
    } catch (e: unknown) {
      setAttachForm(f => ({ ...f, uploading: false, file: null }))
      setAttachError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  async function addAttachment(propId: string) {
    if (!attachForm.fileName.trim()) { setAttachError('Choose a file first.'); return }
    if (attachForm.uploading) return
    setAttachSaving(true)
    setAttachError(null)
    try {
      const payload: Record<string, unknown> = {
        cr9b5_filename: attachForm.fileName.trim(),
        cr9b5_referencetype: PROP_REF_TYPE,
        cr9b5_uploadedon: new Date().toISOString(),
        'cr9b5_PropertyId@odata.bind': `/cr9b5_pt_properties(${propId})`,
      }
      if (attachForm.typeRefId) payload['cr9b5_AttachType@odata.bind'] = `/cr9b5_pt_references(${attachForm.typeRefId})`
      if (attachForm.driveId) payload.cr9b5_googledriveid = attachForm.driveId
      if (attachForm.driveUrl) payload.cr9b5_googledriveurl = attachForm.driveUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Cr9b5_pt_attachmentsService.create(payload as any)
      setAttachForm(EMPTY_ATTACH)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await openAttachments(propId)
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to add attachment.')
    } finally {
      setAttachSaving(false)
    }
  }

  async function deleteAttachment(a: Cr9b5_pt_attachments, propId: string) {
    if (!confirm('Delete this attachment?')) return
    if (a.cr9b5_googledriveid) {
      try { await deleteFile(a.cr9b5_googledriveid) } catch { /* ignore */ }
    }
    await Cr9b5_pt_attachmentsService.delete(a.cr9b5_pt_attachmentid)
    await openAttachments(propId)
  }

  const selectedProp = properties.find(p => p.cr9b5_pt_propertyid === selectedPropId)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: property tile grid (~50% width) */}
      <div className="w-1/2 shrink-0 flex flex-col overflow-hidden border-r border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Property
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-gray-500">Loading…</p>
          ) : properties.length === 0 ? (
            <p className="text-gray-400 text-sm">No properties yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {properties.map(p => {
                const invCount = invoiceCounts[p.cr9b5_pt_propertyid] ?? 0
                const isSelected = selectedPropId === p.cr9b5_pt_propertyid
                return (
                  <div
                    key={p.cr9b5_pt_propertyid}
                    className={[
                      'bg-white border rounded-xl p-4 flex flex-col gap-3 transition-shadow cursor-pointer',
                      isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:shadow-md',
                    ].join(' ')}
                    onClick={() => openDetail(p.cr9b5_pt_propertyid)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900 leading-tight">{p.cr9b5_name}</h2>
                        <span className="inline-block mt-0.5 text-xs font-mono font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                          {p.cr9b5_shortid}
                        </span>
                      </div>
                      <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(p)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteProperty(p)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Address */}
                    <p className="text-sm text-gray-500 leading-snug">{p.cr9b5_address}</p>

                    {/* Notes */}
                    {p.cr9b5_notes && (
                      <p className="text-xs text-gray-400 leading-snug line-clamp-2">{p.cr9b5_notes}</p>
                    )}

                    {/* Footer */}
                    <div className="flex items-center mt-auto pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">{invCount} invoice{invCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: content area with overlay panel */}
      <div className="flex-1 relative overflow-hidden bg-gray-50">
        {/* Empty state */}
        {!selectedPropId && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Select a property to view details</p>
          </div>
        )}

        {/* Overlay: click-outside zone + panel */}
        {selectedPropId && selectedProp && (
          <div className="absolute inset-0 flex">
            {/* Click outside to close */}
            <div className="flex-1 cursor-pointer" onClick={closeDetail} />

            {/* Detail panel — fills right 2/3 of the right half */}
            <div className="flex-[2] bg-white border-l border-gray-200 shadow-xl flex flex-col overflow-hidden">
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-gray-200 flex items-start justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Property</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{selectedProp.cr9b5_name}</p>
                  <p className="text-xs font-mono text-gray-400">{selectedProp.cr9b5_shortid}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => attachOpen ? setAttachOpen(false) : openAttachments(selectedPropId)}
                    className={[
                      'text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors',
                      attachOpen
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    Attachments
                  </button>
                  <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
                </div>
              </div>

              {/* Attachments sub-panel */}
              {attachOpen && (
                <div className="border-b border-gray-200 bg-gray-50 flex flex-col shrink-0" style={{ maxHeight: '50%' }}>
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachments</p>
                    <button onClick={() => setAttachOpen(false)} className="text-gray-400 hover:text-gray-600 text-sm">×</button>
                  </div>

                  {/* Add form */}
                  <div className="px-4 py-2 space-y-1.5 border-b border-gray-100">
                    <select
                      value={attachForm.typeRefId}
                      onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="">Type (optional)…</option>
                      {attachRefTypes.map(r => (
                        <option key={r.cr9b5_pt_referenceid} value={r.cr9b5_pt_referenceid}>{r.cr9b5_value}</option>
                      ))}
                    </select>
                    <input ref={fileInputRef} type="file" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f && selectedPropId) handleFileSelect(f, selectedPropId)
                      }}
                    />
                    {gdConnected ? (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="w-full border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors text-left"
                      >
                        {attachForm.uploading ? '⏳ Uploading…' : attachForm.driveId ? `✓ ${attachForm.fileName}` : '📎 Choose file…'}
                      </button>
                    ) : (
                      <button type="button"
                        onClick={async () => {
                          try { await authorizeWithPopup(); setGdConnected(true) }
                          catch (e) { setAttachError(e instanceof Error ? e.message : 'Google Drive sign-in failed.') }
                        }}
                        className="w-full border border-dashed border-indigo-300 rounded-lg px-2 py-1.5 text-xs text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
                      >
                        🔗 Connect Google Drive
                      </button>
                    )}
                    {attachError && <p className="text-xs text-red-600">{attachError}</p>}
                    <button
                      onClick={() => addAttachment(selectedPropId!)}
                      disabled={attachSaving || attachForm.uploading || !attachForm.driveId}
                      className="w-full py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      {attachSaving ? 'Adding…' : '+ Add'}
                    </button>
                  </div>

                  {/* List */}
                  <div className="overflow-y-auto flex-1">
                    {attachLoading ? (
                      <p className="text-xs text-gray-400 p-3">Loading…</p>
                    ) : attachments.length === 0 ? (
                      <p className="text-xs text-gray-400 p-3">No attachments yet.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {attachments.map(a => (
                          <li key={a.cr9b5_pt_attachmentid} className="px-4 py-2 flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              {a.cr9b5_googledriveurl ? (
                                <a href={a.cr9b5_googledriveurl} target="_blank" rel="noreferrer"
                                  className="text-xs text-indigo-600 hover:underline font-medium truncate block"
                                >{a.cr9b5_filename}</a>
                              ) : (
                                <span className="text-xs text-gray-800 font-medium truncate block">{a.cr9b5_filename}</span>
                              )}
                              {a.cr9b5_attachtypename && <span className="text-xs text-gray-400">{a.cr9b5_attachtypename}</span>}
                            </div>
                            <button onClick={() => deleteAttachment(a, selectedPropId!)}
                              className="text-red-400 hover:text-red-600 text-xs shrink-0 mt-0.5"
                            >✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Year summary table — ~35% */}
              <div className="flex flex-col border-b border-gray-200 shrink-0" style={{ flex: '0 0 35%' }}>
                <div className="px-4 py-2 border-b border-gray-100 shrink-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Income & Expenses by Year</p>
                </div>
                {propInvLoading ? (
                  <p className="text-xs text-gray-400 px-4 py-3">Loading…</p>
                ) : yearSummaries.length === 0 ? (
                  <p className="text-xs text-gray-400 px-4 py-3">No data (2021 onwards).</p>
                ) : (
                  <div className="overflow-y-auto flex-1">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                        <tr className="text-left text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-4 py-2">Year</th>
                          <th className="px-4 py-2 text-right">Income</th>
                          <th className="px-4 py-2 text-right">Expenses</th>
                          <th className="px-4 py-2 text-right">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {yearSummaries.map(s => {
                          const net = s.income - s.expenses
                          const isSelected = selectedYear === s.year
                          return (
                            <tr
                              key={s.year}
                              onClick={() => setSelectedYear(s.year)}
                              className={[
                                'cursor-pointer transition-colors',
                                isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50',
                              ].join(' ')}
                            >
                              <td className={['px-4 py-2 font-semibold', isSelected ? 'text-indigo-700' : 'text-gray-700'].join(' ')}>
                                {s.year}
                              </td>
                              <td className="px-4 py-2 text-right text-blue-700">{fmtEur(s.income)}</td>
                              <td className="px-4 py-2 text-right text-green-700">{fmtEur(s.expenses)}</td>
                              <td className={['px-4 py-2 text-right font-semibold', net >= 0 ? 'text-gray-900' : 'text-red-600'].join(' ')}>
                                {fmtEur(net)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Invoice list — ~65% */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 shrink-0 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Invoices{selectedYear ? ` — ${selectedYear}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">{yearInvoices.length} invoice{yearInvoices.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="overflow-y-auto flex-1">
                  {propInvLoading ? (
                    <p className="text-xs text-gray-400 px-4 py-3">Loading…</p>
                  ) : !selectedYear ? (
                    <p className="text-xs text-gray-400 px-4 py-3">Select a year above.</p>
                  ) : yearInvoices.length === 0 ? (
                    <p className="text-xs text-gray-400 px-4 py-3">No invoices for {selectedYear}.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                        <tr className="text-left text-gray-400 font-semibold uppercase tracking-wide">
                          <th className="px-3 py-2">ID</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Contact</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {yearInvoices.map(inv => {
                          const isOut = (inv as unknown as Record<string, unknown>)['cr9b5_type'] === TYPE_OUTGOING
                          return (
                            <tr
                              key={inv.cr9b5_pt_invoiceid}
                              onClick={() => setViewInvoice(inv)}
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-3 py-2 font-mono font-medium text-indigo-700 whitespace-nowrap">
                                {inv.cr9b5_internalid}
                              </td>
                              <td className="px-3 py-2">
                                <span className={[
                                  'inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium',
                                  isOut ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700',
                                ].join(' ')}>
                                  {invType(inv)}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{contactName(inv)}</td>
                              <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDate(inv.cr9b5_date)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap">
                                {inv.cr9b5_totalgross != null ? fmtEur(inv.cr9b5_totalgross) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Property form modal */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {form.id ? 'Edit Property' : 'Add Property'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Lake Villa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short ID *</label>
                <input
                  type="text"
                  value={form.shortid}
                  onChange={e => setForm(f => ({ ...f, shortid: e.target.value.toUpperCase() }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. LV"
                  maxLength={10}
                />
                <p className="mt-1 text-xs text-gray-400">Used in invoice IDs, e.g. LV001/2026. Must be unique.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Full address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Optional notes…"
                />
              </div>
            </div>

            {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={closeForm} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={saveProperty}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice detail popup */}
      {viewInvoice && (
        <InvoiceForm
          invoice={viewInvoice}
          properties={properties}
          contacts={contacts}
          readOnly
          onSaved={() => {}}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}
