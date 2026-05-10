import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import InvoiceForm from './InvoiceForm'
import InvoiceImport from './InvoiceImport'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [filterPropId, setFilterPropId] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')

  // Form
  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  async function load() {
    setLoading(true)
    const [invRes, propRes, conRes] = await Promise.all([
      Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date desc'], maxPageSize: 5000 }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
    ])
    setInvoices(invRes.data ?? [])
    setProperties(propRes.data ?? [])
    setContacts(conRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function propName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_property_value'] as string | undefined
    return properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? '—'
  }

  function contactName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_contact_value'] as string | undefined
    return contacts.find(c => c.cr9b5_pt_contactid === id)?.cr9b5_name ?? '—'
  }

  // Apply filters
  const filtered = invoices.filter(inv => {
    if (filterType === 'incoming' && (inv.cr9b5_type as number) !== TYPE_INCOMING) return false
    if (filterType === 'outgoing' && (inv.cr9b5_type as number) !== TYPE_OUTGOING) return false
    if (filterPropId) {
      const raw = inv as unknown as Record<string, unknown>
      if (raw['_cr9b5_property_value'] !== filterPropId) return false
    }
    if (filterFrom && inv.cr9b5_date && inv.cr9b5_date < new Date(filterFrom).toISOString()) return false
    if (filterTo && inv.cr9b5_date && inv.cr9b5_date > new Date(filterTo + 'T23:59:59').toISOString()) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = [
        inv.cr9b5_internalid,
        inv.cr9b5_description,
        propName(inv),
        contactName(inv),
        inv.cr9b5_bookingreference,
      ].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  function openNew() {
    setEditInvoice(null)
    setFormOpen(true)
  }

  function exportExcel() {
    const fmtD = (iso: string | undefined) => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
    }
    const fmtN = (n: number | undefined) => n != null ? Number(n.toFixed(2)) : ''

    const rows = filtered.map(inv => ({
      'Internal ID':  inv.cr9b5_internalid,
      'Type':         (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING ? 'Outgoing' : 'Incoming',
      'Property':     propName(inv),
      'Contact':      contactName(inv),
      'Date':         fmtD(inv.cr9b5_date),
      'Description':  inv.cr9b5_description ?? '',
      'Booking Ref':  inv.cr9b5_bookingreference ?? '',
      'Check-in':     fmtD(inv.cr9b5_checkin),
      'Check-out':    fmtD(inv.cr9b5_checkout),
      'Nights':       inv.cr9b5_nights ?? '',
      'Adults':       inv.cr9b5_adults ?? '',
      'Children':     inv.cr9b5_children ?? '',
      'Babies':       inv.cr9b5_babies ?? '',
      'Base Amount':  fmtN(inv.cr9b5_baseamount),
      'Tax Rate':     inv.cr9b5_taxrate ?? '',
      'Tax Amount':   fmtN(inv.cr9b5_taxamount),
      'Total Gross':  fmtN(inv.cr9b5_totalgross),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    // Auto-width for each column
    const colWidths = Object.keys(rows[0] ?? {}).map(k => ({
      wch: Math.max(k.length, ...rows.map(r => String((r as Record<string,unknown>)[k] ?? '').length)) + 2
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')

    const from = filterFrom || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date < m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const to   = filterTo   || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date > m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    XLSX.writeFile(wb, `invoices_${from}to${to}.xlsx`)
  }

  function openEdit(inv: Cr9b5_pt_invoices) {
    setEditInvoice(inv)
    setFormOpen(true)
  }

  async function cancelInvoice(inv: Cr9b5_pt_invoices) {
    if (!confirm(`Cancel invoice ${inv.cr9b5_internalid}? This cannot be undone.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_invoicesService.update(inv.cr9b5_pt_invoiceid, { statecode: 1 as any, statuscode: 2 as any })
    await load()
  }

  function isCancelled(inv: Cr9b5_pt_invoices): boolean {
    return (inv.statecode as unknown as number) === 1 || (inv.statecodename as unknown as string) === 'Inactive'
  }

  function totalGuests(inv: Cr9b5_pt_invoices): string {
    const a = inv.cr9b5_adults ?? 0
    const c = inv.cr9b5_children ?? 0
    const b = inv.cr9b5_babies ?? 0
    const total = a + c + b
    return total > 0 ? String(total) : '—'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
          <div className="flex gap-2">
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              ↓ Export Excel
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              ↑ Import from Excel
            </button>
            <button
              onClick={openNew}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + New Invoice
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Type */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {(['all', 'incoming', 'outgoing'] as const).map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={[
                  'px-3 py-1.5 font-medium capitalize transition-colors',
                  filterType === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Property */}
          <select
            value={filterPropId}
            onChange={e => setFilterPropId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All properties</option>
            {properties.map(p => (
              <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="From date"
          />
          <span className="text-gray-400 text-sm">—</span>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="To date"
          />

          {/* Search */}
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ID, description, contact…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-52"
          />

          {(filterType !== 'all' || filterPropId || filterFrom || filterTo || search) && (
            <button
              onClick={() => { setFilterType('all'); setFilterPropId(''); setFilterFrom(''); setFilterTo(''); setSearch('') }}
              className="text-xs text-gray-400 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <p className="p-6 text-gray-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-gray-400 text-sm">No invoices match the current filters.</p>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="px-4 py-3">Internal ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Booking Ref</th>
                <th className="px-4 py-3 text-right">Nights</th>
                <th className="px-4 py-3 text-right">Guests</th>
                <th className="px-4 py-3 text-right">Base</th>
                <th className="px-4 py-3 text-right">Tax %</th>
                <th className="px-4 py-3 text-right">Tax €</th>
                <th className="px-4 py-3 text-right">Total Gross</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map(inv => {
                const isOut = (inv.cr9b5_type as number) === TYPE_OUTGOING
                const cancelled = isCancelled(inv)
                return (
                  <tr key={inv.cr9b5_pt_invoiceid} className={['hover:bg-gray-50 transition-colors', cancelled ? 'opacity-60' : ''].join(' ')}>
                    <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">
                      <button
                        onClick={() => setViewInvoice(inv)}
                        className={['hover:underline', cancelled ? 'text-gray-400 line-through' : 'text-indigo-700'].join(' ')}
                      >
                        {inv.cr9b5_internalid}
                      </button>
                      {cancelled && <span className="ml-2 text-xs text-red-500 font-sans font-normal no-underline">cancelled</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        isOut ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700',
                      ].join(' ')}>
                        {isOut ? 'Outgoing' : 'Incoming'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{propName(inv)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{contactName(inv)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.cr9b5_date)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{inv.cr9b5_bookingreference ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{inv.cr9b5_nights ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{totalGuests(inv)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmtEur(inv.cr9b5_baseamount)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {inv.cr9b5_taxismanual ? (
                        <span className="text-xs text-amber-600 font-medium">n/a</span>
                      ) : (
                        inv.cr9b5_taxrate ? `${inv.cr9b5_taxrate}%` : '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmtEur(inv.cr9b5_taxamount)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {fmtEur(inv.cr9b5_totalgross)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        {!cancelled && (
                          <button
                            onClick={() => openEdit(inv)}
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            Edit
                          </button>
                        )}
                        {!cancelled && (
                          <button
                            onClick={() => cancelInvoice(inv)}
                            className="text-red-400 hover:text-red-600 text-xs font-medium"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary row */}
      {!loading && filtered.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex gap-6 text-sm text-gray-600">
          {(() => {
            const active = filtered.filter(i => !isCancelled(i))
            const cancelledCount = filtered.length - active.length
            return (
              <>
                <span>{active.length} invoice{active.length !== 1 ? 's' : ''}{cancelledCount > 0 ? ` (+ ${cancelledCount} cancelled)` : ''}</span>
                <span>
                  Total gross: <strong className="text-gray-900">
                    {fmtEur(active.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0))}
                  </strong>
                </span>
              </>
            )
          })()}
        </div>
      )}

      {/* Invoice form modal */}
      {formOpen && (
        <InvoiceForm
          invoice={editInvoice}
          properties={properties}
          contacts={contacts}
          onSaved={async () => { setFormOpen(false); await load() }}
          onClose={() => setFormOpen(false)}
        />
      )}

      {/* Invoice view modal (read-only) */}
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

      {/* Excel import screen */}
      {importOpen && (
        <InvoiceImport
          onClose={() => setImportOpen(false)}
          onImported={() => load()}
        />
      )}
    </div>
  )
}
