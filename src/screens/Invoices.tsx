import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import InvoiceForm from './InvoiceForm'
import InvoiceImport from './InvoiceImport'
import ExportConfigModal from './ExportConfigModal'
import { logActivity } from '../services/activitylog'
import { fmtEur } from '../utils/formatters'

const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006

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
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Bulk edit
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkPropertyId, setBulkPropertyId] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterPropId, setFilterPropId] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'id_asc' | 'id_desc' | 'total_desc' | 'total_asc'>('date_desc')

  // Form
  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [importOpen, setImportOpen]   = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  // Properties/contacts/categories rarely change while browsing invoices —
  // loaded once, independent of the invoice filters below.
  async function loadRefData() {
    const [propRes, conRes, catRes] = await Promise.all([
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${REF_CAT_INCOME} or cr9b5_referencetype eq ${REF_CAT_EXPENSE}`,
        maxPageSize: 5000,
      }),
    ])
    setProperties(propRes.data ?? [])
    setContacts(conRes.data ?? [])
    const map: Record<string, string> = {}
    const list: { id: string; name: string }[] = []
    for (const ref of catRes.data ?? []) {
      if (ref.cr9b5_pt_referenceid && ref.cr9b5_value) {
        map[ref.cr9b5_pt_referenceid] = ref.cr9b5_value
        list.push({ id: ref.cr9b5_pt_referenceid, name: ref.cr9b5_value })
      }
    }
    setCategoryMap(map)
    setCategoryList(list.sort((a, b) => a.name.localeCompare(b.name)))
  }

  // Type/property/date-range are pushed down to the server as $filter so we
  // only ever pull the rows the user actually asked to see, instead of the
  // full table on every visit. Search and sort stay client-side over that
  // already-scoped result set (they change on every keystroke — not worth a
  // round trip each time).
  function buildInvoiceFilter(): string | undefined {
    const parts: string[] = []
    if (filterType === 'income')  parts.push(`cr9b5_type eq ${TYPE_OUTGOING}`)
    if (filterType === 'expense') parts.push(`cr9b5_type eq ${TYPE_INCOMING}`)
    if (filterPropId) parts.push(`_cr9b5_property_value eq '${filterPropId}'`)
    if (filterFrom) parts.push(`cr9b5_date ge ${new Date(filterFrom).toISOString()}`)
    if (filterTo)   parts.push(`cr9b5_date le ${new Date(filterTo + 'T23:59:59').toISOString()}`)
    return parts.length ? parts.join(' and ') : undefined
  }

  async function loadInvoices() {
    setLoading(true)
    const res = await Cr9b5_pt_invoicesService.getAll({
      filter: buildInvoiceFilter(),
      orderBy: ['cr9b5_date desc'],
      maxPageSize: 5000,
    })
    setInvoices(res.data ?? [])
    setSelectedIds(new Set())
    setLoading(false)
  }

  useEffect(() => { loadRefData() }, [])
  useEffect(() => { loadInvoices() }, [filterType, filterPropId, filterFrom, filterTo])

  // Id → record indexes, built once per data load instead of Array.find()
  // scanning the full list for every invoice row on every render.
  const propertyById = useMemo(
    () => new Map(properties.map(p => [p.cr9b5_pt_propertyid, p])),
    [properties]
  )
  const contactById = useMemo(
    () => new Map(contacts.map(c => [c.cr9b5_pt_contactid, c])),
    [contacts]
  )

  function propName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_property_value'] as string | undefined
    return (id && propertyById.get(id)?.cr9b5_name) ?? '—'
  }

  function contactName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_contact_value'] as string | undefined
    return (id && contactById.get(id)?.cr9b5_name) ?? '—'
  }

  function contactWithTax(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_contact_value'] as string | undefined
    const con = id ? contactById.get(id) : undefined
    if (!con) return '—'
    return con.cr9b5_taxid ? `${con.cr9b5_name} (${con.cr9b5_taxid})` : (con.cr9b5_name ?? '—')
  }

  function internalIdSortKey(id: string | undefined): number {
    if (!id) return 0
    const m = id.replace(/^(LV|TIAS)/i, '').match(/\d+/)
    return m ? parseInt(m[0], 10) : 0
  }

  // Type/property/date range are already applied server-side in loadInvoices();
  // only search (changes per keystroke) and sort are still done client-side.
  const filtered = invoices.filter(inv => {
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
  }).sort((a, b) => {
    switch (sortBy) {
      case 'date_asc':   return (a.cr9b5_date ?? '') < (b.cr9b5_date ?? '') ? -1 : 1
      case 'date_desc':  return (a.cr9b5_date ?? '') > (b.cr9b5_date ?? '') ? -1 : 1
      case 'id_asc':     return internalIdSortKey(a.cr9b5_internalid) - internalIdSortKey(b.cr9b5_internalid)
      case 'id_desc':    return internalIdSortKey(b.cr9b5_internalid) - internalIdSortKey(a.cr9b5_internalid)
      case 'total_asc':  return (a.cr9b5_totalgross ?? 0) - (b.cr9b5_totalgross ?? 0)
      case 'total_desc': return (b.cr9b5_totalgross ?? 0) - (a.cr9b5_totalgross ?? 0)
    }
  })

  function openNew() {
    setEditInvoice(null)
    setFormOpen(true)
  }

  function exportExcel(orderedColumns: string[]) {
    const fmtD = (iso: string | undefined) => {
      if (!iso) return ''
      const d = new Date(iso)
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
    }
    const fmtN = (n: number | undefined) => n != null ? Number(n.toFixed(2)) : ''

    const allCols: Record<string, (inv: Cr9b5_pt_invoices) => unknown> = {
      'Internal ID':    inv => inv.cr9b5_internalid,
      'Type':           inv => (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING ? 'Income' : 'Expense',
      'Category':       inv => categoryMap[(inv as unknown as Record<string,unknown>)['_cr9b5_categoryid_value'] as string] ?? '',
      'Property':       inv => (inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? 'All' : propName(inv),
      'All Properties': inv => (inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? 'Yes' : 'No',
      'Contact':          inv => contactWithTax(inv),
      'Contact (TaxID)': inv => contactWithTax(inv),
      'Date':           inv => fmtD(inv.cr9b5_date),
      'Description':    inv => inv.cr9b5_description ?? '',
      'Booking Ref':    inv => inv.cr9b5_bookingreference ?? '',
      'Check-in':       inv => fmtD(inv.cr9b5_checkin),
      'Check-out':      inv => fmtD(inv.cr9b5_checkout),
      'Nights':         inv => inv.cr9b5_nights ?? '',
      'Days':           inv => (inv as unknown as Record<string,unknown>)['cr9b5_days'] ?? '',
      'Adults':         inv => inv.cr9b5_adults ?? '',
      'Children':       inv => inv.cr9b5_children ?? '',
      'Babies':         inv => inv.cr9b5_babies ?? '',
      'Base Amount':    inv => fmtN(inv.cr9b5_baseamount),
      'Tax Rate':       inv => inv.cr9b5_taxrate ?? '',
      'Tax Amount':     inv => fmtN(inv.cr9b5_taxamount),
      'Total Gross':    inv => fmtN(inv.cr9b5_totalgross),
    }

    const rows = filtered.filter(inv => !isCancelled(inv)).map(inv => {
      const row: Record<string, unknown> = {}
      for (const col of orderedColumns) {
        row[col] = allCols[col]?.(inv) ?? ''
      }
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows, { header: orderedColumns })
    const colWidths = orderedColumns.map(k => ({
      wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2
    }))
    ws['!cols'] = colWidths

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')

    const from = filterFrom || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date < m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const to   = filterTo   || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date > m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const filename = `invoices_${from}to${to}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'invoices export', filename)
    setExportOpen(false)
  }

  function openEdit(inv: Cr9b5_pt_invoices) {
    setEditInvoice(inv)
    setFormOpen(true)
  }

  async function cancelInvoice(inv: Cr9b5_pt_invoices) {
    if (!confirm(`Cancel invoice ${inv.cr9b5_internalid}? This cannot be undone.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_invoicesService.update(inv.cr9b5_pt_invoiceid, { statecode: 1 as any, statuscode: 2 as any })
    logActivity('Deleted', 'Invoice', inv.cr9b5_internalid ?? inv.cr9b5_pt_invoiceid)
    // Patch locally instead of reloading the whole (possibly large) filtered set.
    setInvoices(list => list.map(i => i.cr9b5_pt_invoiceid === inv.cr9b5_pt_invoiceid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? { ...i, statecode: 1 as any, statuscode: 2 as any, statecodename: 'Inactive' }
      : i
    ))
  }

  function upsertInvoiceLocal(record: Cr9b5_pt_invoices) {
    setInvoices(list => {
      const idx = list.findIndex(i => i.cr9b5_pt_invoiceid === record.cr9b5_pt_invoiceid)
      if (idx === -1) return [record, ...list]
      const next = [...list]
      next[idx] = record
      return next
    })
  }

  function isCancelled(inv: Cr9b5_pt_invoices): boolean {
    return (inv.statecode as unknown as number) === 1 || (inv.statecodename as unknown as string) === 'Inactive'
  }

  function toggleSelect(id: string) {
    setSelectedIds(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectableIds = filtered.filter(inv => !isCancelled(inv)).map(inv => inv.cr9b5_pt_invoiceid)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
  }

  async function applyBulkEdit() {
    if (!bulkCategoryId && !bulkPropertyId) return
    setBulkApplying(true)
    const ids = [...selectedIds]
    try {
      for (const id of ids) {
        const payload: Record<string, unknown> = {}
        if (bulkCategoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${bulkCategoryId})`
        if (bulkPropertyId) {
          payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${bulkPropertyId})`
          payload.cr9b5_allproperties = false
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_invoicesService.update(id, payload as any)
      }
      const changed = [bulkCategoryId && 'category', bulkPropertyId && 'property'].filter(Boolean).join(' + ')
      logActivity('Updated', 'Invoice', `${ids.length} invoices`, `Bulk edit: ${changed}`)
      setSelectedIds(new Set())
      setBulkCategoryId('')
      setBulkPropertyId('')
      await loadInvoices()
    } finally {
      setBulkApplying(false)
    }
  }

  function totalGuests(inv: Cr9b5_pt_invoices): { display: string; title: string } {
    const a = inv.cr9b5_adults ?? 0
    const c = inv.cr9b5_children ?? 0
    const b = inv.cr9b5_babies ?? 0
    const total = a + c + b
    if (total === 0) return { display: '—', title: '' }
    return {
      display: `${a} / ${c} / ${b}`,
      title: `${a} adult${a !== 1 ? 's' : ''}, ${c} child${c !== 1 ? 'ren' : ''}, ${b} bab${b !== 1 ? 'ies' : 'y'}`,
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Invoices</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setExportOpen(true)}
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
            {([['all', 'All'], ['income', 'Income'], ['expense', 'Expense']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={[
                  'px-3 py-1.5 font-medium transition-colors',
                  filterType === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {label}
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

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="date_desc">Date (newest first)</option>
            <option value="date_asc">Date (oldest first)</option>
            <option value="id_asc">Internal ID (asc)</option>
            <option value="id_desc">Internal ID (desc)</option>
            <option value="total_desc">Total (highest first)</option>
            <option value="total_asc">Total (lowest first)</option>
          </select>

          {(filterType !== 'all' || filterPropId || filterFrom || filterTo || search || sortBy !== 'date_desc') && (
            <button
              onClick={() => { setFilterType('all' as const); setFilterPropId(''); setFilterFrom(''); setFilterTo(''); setSearch(''); setSortBy('date_desc') }}
              className="text-xs text-gray-400 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Bulk edit bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
            <select
              value={bulkCategoryId}
              onChange={e => setBulkCategoryId(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Set category…</option>
              {categoryList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={bulkPropertyId}
              onChange={e => setBulkPropertyId(e.target.value)}
              className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Set property…</option>
              {properties.map(p => (
                <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
              ))}
            </select>
            <button
              onClick={applyBulkEdit}
              disabled={bulkApplying || (!bulkCategoryId && !bulkPropertyId)}
              className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {bulkApplying ? 'Applying…' : 'Apply'}
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkCategoryId(''); setBulkPropertyId('') }}
              disabled={bulkApplying}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Clear selection
            </button>
          </div>
        )}
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
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3">Internal ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
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
                    <td className="px-4 py-3">
                      {!cancelled && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.cr9b5_pt_invoiceid)}
                          onChange={() => toggleSelect(inv.cr9b5_pt_invoiceid)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      )}
                    </td>
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
                        isOut ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                      ].join(' ')}>
                        {isOut ? 'Income' : 'Expense'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {categoryMap[(inv as unknown as Record<string,unknown>)['_cr9b5_categoryid_value'] as string] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {(inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? (
                        <span className="text-xs text-indigo-600 font-medium">All</span>
                      ) : propName(inv)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{contactName(inv)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.cr9b5_date)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{inv.cr9b5_bookingreference ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{inv.cr9b5_nights ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {(() => { const g = totalGuests(inv); return <span title={g.title}>{g.display}</span> })()}
                    </td>
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
          onSaved={record => {
            setFormOpen(false)
            // Patch the saved/created record into local state directly (it's
            // already returned by the create/update call) instead of a full reload.
            if (record) upsertInvoiceLocal(record); else loadInvoices()
          }}
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
          onSaved={() => undefined}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {/* Excel import screen */}
      {importOpen && (
        <InvoiceImport
          onClose={() => setImportOpen(false)}
          onImported={() => loadInvoices()}
        />
      )}
      {exportOpen && (
        <ExportConfigModal
          rowCount={filtered.length}
          onExport={exportExcel}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  )
}
