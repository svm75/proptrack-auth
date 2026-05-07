import { useEffect, useRef, useState } from 'react'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_attachmentsService } from '../generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_attachments } from '../generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { uploadFile, deleteFile, getOrCreateFolder, propertyFolderPath } from '../services/googledrive'

// Property reference type value
const PROP_REF_TYPE = 233100000

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

export default function Properties() {
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [invoiceCounts, setInvoiceCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // Property form modal
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<PropForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Selected property for attachments panel
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Cr9b5_pt_attachments[]>([])
  const [attachRefTypes, setAttachRefTypes] = useState<Cr9b5_pt_references[]>([])
  const [attachForm, setAttachForm] = useState<AttachForm>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const [propsRes, invRes] = await Promise.all([
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      Cr9b5_pt_invoicesService.getAll({ select: ['cr9b5_pt_invoiceid', '_cr9b5_property_value'] }),
    ])
    const allProps = propsRes.data ?? []
    const allInv = (invRes.data ?? []) as unknown as Array<Record<string, unknown>>

    const counts: Record<string, number> = {}
    for (const inv of allInv) {
      const pid = inv['_cr9b5_property_value'] as string | undefined
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1
    }
    setProperties(allProps)
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

  // --- Attachments panel ---

  async function openAttachments(propId: string) {
    setSelectedPropId(propId)
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
    if (!attachForm.fileName.trim()) {
      setAttachError('Choose a file first.')
      return
    }
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
      if (attachForm.driveId)  payload.cr9b5_googledriveid  = attachForm.driveId
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
      try { await deleteFile(a.cr9b5_googledriveid) } catch { /* ignore if already gone */ }
    }
    await Cr9b5_pt_attachmentsService.delete(a.cr9b5_pt_attachmentid)
    await openAttachments(propId)
  }

  const selectedProp = properties.find(p => p.cr9b5_pt_propertyid === selectedPropId)

  return (
    <div className="flex h-full">
      {/* Properties list */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
          <button
            onClick={openNew}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + Add Property
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : properties.length === 0 ? (
          <p className="text-gray-400 text-sm">No properties yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map(p => {
              const invCount = invoiceCounts[p.cr9b5_pt_propertyid] ?? 0
              const isSelected = selectedPropId === p.cr9b5_pt_propertyid
              return (
                <div
                  key={p.cr9b5_pt_propertyid}
                  className={[
                    'bg-white border rounded-xl p-4 flex flex-col gap-3 transition-shadow',
                    isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:shadow-md',
                  ].join(' ')}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 leading-tight">{p.cr9b5_name}</h2>
                      <span className="inline-block mt-0.5 text-xs font-mono font-medium bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                        {p.cr9b5_shortid}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
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
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-400">{invCount} invoice{invCount !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => isSelected ? setSelectedPropId(null) : openAttachments(p.cr9b5_pt_propertyid)}
                      className={[
                        'text-xs font-medium px-3 py-1 rounded-lg transition-colors',
                        isSelected
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      ].join(' ')}
                    >
                      {isSelected ? 'Hide Attachments' : 'Attachments'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Attachments panel */}
      {selectedPropId && selectedProp && (
        <aside className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Attachments</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{selectedProp.cr9b5_name}</p>
            </div>
            <button
              onClick={() => setSelectedPropId(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>

          {/* Add attachment form */}
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Attachment</p>

            <select
              value={attachForm.typeRefId}
              onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Type (optional)…</option>
              {attachRefTypes.map(r => (
                <option key={r.cr9b5_pt_referenceid} value={r.cr9b5_pt_referenceid}>
                  {r.cr9b5_value}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f && selectedPropId) handleFileSelect(f, selectedPropId)
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors text-left"
              >
                {attachForm.uploading ? '⏳ Uploading…' : attachForm.driveId ? `✓ ${attachForm.fileName}` : '📎 Choose file…'}
              </button>
            </div>

            {attachError && <p className="text-xs text-red-600">{attachError}</p>}

            <button
              onClick={() => addAttachment(selectedPropId!)}
              disabled={attachSaving || attachForm.uploading || !attachForm.driveId}
              className="w-full py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {attachSaving ? 'Adding…' : '+ Add'}
            </button>
          </div>

          {/* Attachment list */}
          <div className="flex-1 overflow-y-auto">
            {attachLoading ? (
              <p className="text-sm text-gray-400 p-4">Loading…</p>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">No attachments yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {attachments.map(a => (
                  <li key={a.cr9b5_pt_attachmentid} className="px-4 py-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {a.cr9b5_googledriveurl ? (
                        <a
                          href={a.cr9b5_googledriveurl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-indigo-600 hover:underline font-medium truncate block"
                        >
                          {a.cr9b5_filename}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-800 font-medium truncate block">{a.cr9b5_filename}</span>
                      )}
                      {a.cr9b5_attachtypename && (
                        <span className="text-xs text-gray-400">{a.cr9b5_attachtypename}</span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteAttachment(a, selectedPropId!)}
                      className="text-red-400 hover:text-red-600 text-xs shrink-0 mt-0.5"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

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
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
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
    </div>
  )
}
