import { useEffect, useState } from 'react'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Svm_pt_suppliercontractsService } from '../generated/services/Svm_pt_suppliercontractsService'
import type { Cr9b5_pt_contacts, Cr9b5_pt_contactscr9b5_role } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { logActivity } from '../services/activitylog'

const ROLE_CLIENT: Cr9b5_pt_contactscr9b5_role = 233100001
const ROLE_SUPPLIER: Cr9b5_pt_contactscr9b5_role = 233100000
const REF_CAT_EXPENSE = 233100006

type Tab = 'clients' | 'suppliers'

interface ContactForm {
  id: string | null
  name: string
  email: string
  taxid: string
  defaultdesc: string
  role: Cr9b5_pt_contactscr9b5_role
  defaultCategoryId: string
}

interface ContractRow {
  id: string | null
  propertyId: string
  allProperties: boolean
  contractCount: number
  categoryId: string
  description: string
  active: boolean
}

function emptyForm(role: Cr9b5_pt_contactscr9b5_role): ContactForm {
  return { id: null, name: '', email: '', taxid: '', defaultdesc: '', role, defaultCategoryId: '' }
}

function emptyContractRow(): ContractRow {
  return { id: null, propertyId: '', allProperties: false, contractCount: 1, categoryId: '', description: '', active: true }
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [categories, setCategories] = useState<Cr9b5_pt_references[]>([])
  const [contractInfo, setContractInfo] = useState<Record<string, { count: number; propertyCount: number }>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('clients')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ContactForm>(emptyForm(ROLE_CLIENT))
  const [contractRows, setContractRows] = useState<ContractRow[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [contactRes, propRes, catRes, contractRes] = await Promise.all([
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${REF_CAT_EXPENSE}`,
        orderBy: ['cr9b5_sortorder asc'],
        maxPageSize: 500,
      }),
      Svm_pt_suppliercontractsService.getAll({
        filter: 'svm_pt_active eq true',
        select: ['svm_pt_suppliercontractid', 'svm_pt_allproperties', '_svm_pt_contact_value', '_svm_property_value'],
        maxPageSize: 5000,
      }),
    ])
    setContacts(contactRes.data ?? [])
    setProperties(propRes.data ?? [])
    setCategories(catRes.data ?? [])

    const propsByContact: Record<string, Set<string>> = {}
    const countByContact: Record<string, number> = {}
    for (const row of contractRes.data ?? []) {
      const contactId = row._svm_pt_contact_value
      if (!contactId) continue
      countByContact[contactId] = (countByContact[contactId] ?? 0) + 1
      const propKey = row.svm_pt_allproperties ? 'ALL' : (row._svm_property_value ?? '?')
      ;(propsByContact[contactId] ??= new Set()).add(propKey)
    }
    const info: Record<string, { count: number; propertyCount: number }> = {}
    for (const contactId of Object.keys(countByContact)) {
      info[contactId] = { count: countByContact[contactId], propertyCount: propsByContact[contactId]?.size ?? 0 }
    }
    setContractInfo(info)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const roleForTab = tab === 'clients' ? ROLE_CLIENT : ROLE_SUPPLIER
  const searchLower = search.trim().toLowerCase()
  const visible = contacts
    .filter(c => c.cr9b5_role === roleForTab)
    .filter(c => {
      if (!searchLower) return true
      return [c.cr9b5_name, c.cr9b5_email, c.cr9b5_taxid, c.cr9b5_defaultdescription]
        .some(v => v?.toLowerCase().includes(searchLower))
    })

  function openNew() {
    setForm(emptyForm(roleForTab))
    setContractRows(roleForTab === ROLE_SUPPLIER ? [emptyContractRow()] : [])
    setFormError(null)
    setFormOpen(true)
  }

  async function openEdit(c: Cr9b5_pt_contacts) {
    setForm({
      id: c.cr9b5_pt_contactid,
      name: c.cr9b5_name,
      email: c.cr9b5_email ?? '',
      taxid: c.cr9b5_taxid ?? '',
      defaultdesc: c.cr9b5_defaultdescription ?? '',
      role: c.cr9b5_role ?? roleForTab,
      defaultCategoryId: c._svm_defaultcategory_value ?? '',
    })
    setFormError(null)
    setContractRows([])
    setFormOpen(true)

    if (c.cr9b5_role === ROLE_SUPPLIER) {
      setContractsLoading(true)
      const res = await Svm_pt_suppliercontractsService.getAll({
        filter: `_svm_pt_contact_value eq '${c.cr9b5_pt_contactid}'`,
        maxPageSize: 500,
      })
      const rows: ContractRow[] = (res.data ?? []).map(row => ({
        id: row.svm_pt_suppliercontractid,
        propertyId: row._svm_property_value ?? '',
        allProperties: !!row.svm_pt_allproperties,
        contractCount: row.svm_pt_contractcount && row.svm_pt_contractcount > 0 ? row.svm_pt_contractcount : 1,
        categoryId: row._svm_defaultcategory_value ?? '',
        description: row.svm_pt_defaultdescription ?? '',
        active: row.svm_pt_active ?? true,
      }))
      setContractRows(rows.length > 0 ? rows : [emptyContractRow()])
      setContractsLoading(false)
    }
  }

  function closeForm() {
    setFormOpen(false)
    setFormError(null)
    setContractRows([])
  }

  function addContractRow() {
    setContractRows(rs => [...rs, emptyContractRow()])
  }

  function updateContractRow(idx: number, patch: Partial<ContractRow>) {
    setContractRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  function removeContractRow(idx: number) {
    setContractRows(rs => rs.filter((_, i) => i !== idx))
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('Name is required.')
      return
    }
    const activeRows = contractRows.filter(r => r.propertyId || r.allProperties)
    if (form.role === ROLE_SUPPLIER && contractRows.some(r => !r.propertyId && !r.allProperties)) {
      setFormError('Every contract row needs a property, or "All properties" checked.')
      return
    }

    setSaving(true)
    setFormError(null)
    const payload: Record<string, unknown> = {
      cr9b5_name: form.name.trim(),
      cr9b5_role: form.role,
      cr9b5_email: form.email.trim() || undefined,
      cr9b5_taxid: form.taxid.trim() || undefined,
      cr9b5_defaultdescription: form.defaultdesc.trim() || undefined,
    }
    if (form.role === ROLE_SUPPLIER) {
      payload.cr9b5_regularsupplier = activeRows.some(r => r.active)
      if (form.defaultCategoryId) {
        payload['svm_DefaultCategory@odata.bind'] = `/cr9b5_pt_references(${form.defaultCategoryId})`
      }
    }

    try {
      let contactId = form.id
      if (contactId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_contactsService.update(contactId, payload as any)
        logActivity('Updated', 'Contact', form.name.trim())
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await Cr9b5_pt_contactsService.create(payload as any)
        if (!result.success || !result.data) throw (result.error as Error) ?? new Error('Failed to create contact.')
        contactId = result.data.cr9b5_pt_contactid
        logActivity('Created', 'Contact', form.name.trim())
      }

      if (form.role === ROLE_SUPPLIER && contactId) {
        const originalIds = new Set(
          contractRows.filter(r => r.id).map(r => r.id as string)
        )
        // Rows the user removed from the form need to be deleted server-side.
        const keptIds = new Set(activeRows.filter(r => r.id).map(r => r.id as string))
        const deletedIds = [...originalIds].filter(id => !keptIds.has(id))

        for (const id of deletedIds) {
          await Svm_pt_suppliercontractsService.delete(id)
        }

        for (const row of activeRows) {
          const contractPayload: Record<string, unknown> = {
            svm_pt_allproperties: row.allProperties,
            svm_pt_contractcount: row.contractCount > 0 ? row.contractCount : 1,
            svm_pt_defaultdescription: row.description.trim() || undefined,
            svm_pt_active: row.active,
            'svm_pt_contact@odata.bind': `/cr9b5_pt_contacts(${contactId})`,
          }
          if (!row.allProperties && row.propertyId) {
            contractPayload['svm_Property@odata.bind'] = `/cr9b5_pt_properties(${row.propertyId})`
          }
          if (row.categoryId) {
            contractPayload['svm_DefaultCategory@odata.bind'] = `/cr9b5_pt_references(${row.categoryId})`
          }

          if (row.id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await Svm_pt_suppliercontractsService.update(row.id, contractPayload as any)
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await Svm_pt_suppliercontractsService.create(contractPayload as any)
          }
        }
      }

      closeForm()
      await load()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function del(c: Cr9b5_pt_contacts) {
    if (!confirm(`Delete "${c.cr9b5_name}"?`)) return
    if (c.cr9b5_role === ROLE_SUPPLIER) {
      const res = await Svm_pt_suppliercontractsService.getAll({
        filter: `_svm_pt_contact_value eq '${c.cr9b5_pt_contactid}'`,
        select: ['svm_pt_suppliercontractid'],
        maxPageSize: 500,
      })
      for (const row of res.data ?? []) {
        await Svm_pt_suppliercontractsService.delete(row.svm_pt_suppliercontractid)
      }
    }
    await Cr9b5_pt_contactsService.delete(c.cr9b5_pt_contactid)
    logActivity('Deleted', 'Contact', c.cr9b5_name)
    await load()
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Add {tab === 'clients' ? 'Client' : 'Supplier'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['clients', 'suppliers'] as Tab[]).map(t => {
          const count = contacts.filter(c => c.cr9b5_role === (t === 'clients' ? ROLE_CLIENT : ROLE_SUPPLIER)).length
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {t} <span className="ml-1 text-xs text-gray-400">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${tab} by name, email, tax ID or description…`}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {searchLower ? `No ${tab} match "${search}".` : `No ${tab} yet. Add one above.`}
        </p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Tax ID</th>
                <th className="px-4 py-2.5 font-medium">Default Description</th>
                {tab === 'suppliers' && <th className="px-4 py-2.5 font-medium">Default Category</th>}
                {tab === 'suppliers' && <th className="px-4 py-2.5 font-medium">Regular</th>}
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.cr9b5_pt_contactid} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.cr9b5_name}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.cr9b5_email
                      ? <a href={`mailto:${c.cr9b5_email}`} className="hover:text-indigo-600">{c.cr9b5_email}</a>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                    {c.cr9b5_taxid ?? <span className="text-gray-300 font-sans">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                    {c.cr9b5_defaultdescription ?? <span className="text-gray-300">—</span>}
                  </td>
                  {tab === 'suppliers' && (
                    <td className="px-4 py-3 text-gray-500">
                      {c.svm_defaultcategoryname ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {tab === 'suppliers' && (
                    <td className="px-4 py-3">
                      {(contractInfo[c.cr9b5_pt_contactid]?.count ?? 0) > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                          Yes · {contractInfo[c.cr9b5_pt_contactid].propertyCount} propert{contractInfo[c.cr9b5_pt_contactid].propertyCount === 1 ? 'y' : 'ies'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">No</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => del(c)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {formOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {form.id ? 'Edit Contact' : `Add ${form.role === ROLE_CLIENT ? 'Client' : 'Supplier'}`}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Full name or company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                <input
                  type="text"
                  value={form.taxid}
                  onChange={e => setForm(f => ({ ...f, taxid: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Description</label>
                <textarea
                  value={form.defaultdesc}
                  onChange={e => setForm(f => ({ ...f, defaultdesc: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Pre-fills the Description field on new invoices for this contact"
                />
              </div>

              {form.role === ROLE_SUPPLIER && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Category</label>
                    <select
                      value={form.defaultCategoryId}
                      onChange={e => setForm(f => ({ ...f, defaultCategoryId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">No default category</option>
                      {categories.map(cat => (
                        <option key={cat.cr9b5_pt_referenceid} value={cat.cr9b5_pt_referenceid}>{cat.cr9b5_value}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Falls back into every property contract below unless overridden there.</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-gray-700">Property Contracts</label>
                      <button
                        type="button"
                        onClick={addContractRow}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        + Add contract
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">
                      One row per recurring contract. A supplier with two contracts on a property will produce two rows in Regular Invoices.
                    </p>

                    {contractsLoading ? (
                      <p className="text-sm text-gray-400">Loading contracts…</p>
                    ) : (
                      <div className="space-y-2">
                        {contractRows.map((row, idx) => (
                          <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Property</label>
                                <select
                                  value={row.propertyId}
                                  onChange={e => updateContractRow(idx, { propertyId: e.target.value })}
                                  disabled={row.allProperties}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <option value="">Select property…</option>
                                  {properties.map(p => (
                                    <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Contract count</label>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={row.contractCount}
                                  onChange={e => updateContractRow(idx, { contractCount: parseInt(e.target.value, 10) || 1 })}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Category override</label>
                                <select
                                  value={row.categoryId}
                                  onChange={e => updateContractRow(idx, { categoryId: e.target.value })}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="">Use supplier default</option>
                                  {categories.map(cat => (
                                    <option key={cat.cr9b5_pt_referenceid} value={cat.cr9b5_pt_referenceid}>{cat.cr9b5_value}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Description override</label>
                                <input
                                  type="text"
                                  value={row.description}
                                  onChange={e => updateContractRow(idx, { description: e.target.value })}
                                  className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  placeholder="Optional"
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={row.allProperties}
                                    onChange={e => updateContractRow(idx, { allProperties: e.target.checked, propertyId: e.target.checked ? '' : row.propertyId })}
                                  />
                                  All properties
                                </label>
                                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <input
                                    type="checkbox"
                                    checked={row.active}
                                    onChange={e => updateContractRow(idx, { active: e.target.checked })}
                                  />
                                  Active
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeContractRow(idx)}
                                className="text-red-500 hover:text-red-700 text-xs font-medium"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                        {contractRows.length === 0 && (
                          <p className="text-sm text-gray-400">No contracts yet. Add one so this supplier appears in Regular Invoices.</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
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
  )
}
