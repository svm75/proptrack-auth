import { useEffect, useState } from 'react'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_contacts, Cr9b5_pt_contactscr9b5_role } from '../generated/models/Cr9b5_pt_contactsModel'

const ROLE_CLIENT: Cr9b5_pt_contactscr9b5_role = 233100001
const ROLE_SUPPLIER: Cr9b5_pt_contactscr9b5_role = 233100000

type Tab = 'clients' | 'suppliers'

interface ContactForm {
  id: string | null
  name: string
  email: string
  taxid: string
  defaultdesc: string
  role: Cr9b5_pt_contactscr9b5_role
  regularSupplier: boolean
}

function emptyForm(role: Cr9b5_pt_contactscr9b5_role): ContactForm {
  return { id: null, name: '', email: '', taxid: '', defaultdesc: '', role, regularSupplier: false }
}

export default function Contacts() {
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('clients')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ContactForm>(emptyForm(ROLE_CLIENT))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 })
    setContacts(res.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const roleForTab = tab === 'clients' ? ROLE_CLIENT : ROLE_SUPPLIER
  const visible = contacts.filter(c => c.cr9b5_role === roleForTab)

  function openNew() {
    setForm(emptyForm(roleForTab))
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(c: Cr9b5_pt_contacts) {
    setForm({
      id: c.cr9b5_pt_contactid,
      name: c.cr9b5_name,
      email: c.cr9b5_email ?? '',
      taxid: c.cr9b5_taxid ?? '',
      defaultdesc: c.cr9b5_defaultdescription ?? '',
      role: c.cr9b5_role ?? roleForTab,
      regularSupplier: c.cr9b5_regularsupplier ?? false,
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormError(null)
  }

  async function save() {
    if (!form.name.trim()) {
      setFormError('Name is required.')
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
      payload.cr9b5_regularsupplier = form.regularSupplier
    }
    try {
      if (form.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_contactsService.update(form.id, payload as any)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_contactsService.create(payload as any)
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
    await Cr9b5_pt_contactsService.delete(c.cr9b5_pt_contactid)
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

      {/* Table */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-gray-400 text-sm">No {tab} yet. Add one above.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Tax ID</th>
                <th className="px-4 py-2.5 font-medium">Default Description</th>
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
                    <td className="px-4 py-3">
                      {c.cr9b5_regularsupplier && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">Regular</span>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, regularSupplier: !f.regularSupplier }))}
                    className={[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500',
                      form.regularSupplier ? 'bg-teal-600' : 'bg-gray-200',
                    ].join(' ')}
                  >
                    <span className={[
                      'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                      form.regularSupplier ? 'translate-x-6' : 'translate-x-1',
                    ].join(' ')} />
                  </button>
                  <label className="text-sm font-medium text-gray-700">Regular Supplier</label>
                </div>
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
