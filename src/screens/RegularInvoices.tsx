import { useEffect, useMemo, useRef, useState } from 'react'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Svm_pt_suppliercontractsService } from '../generated/services/Svm_pt_suppliercontractsService'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING   = 233100000
const REF_CAT_EXPENSE = 233100006

function parseAmount(raw: string): number {
  let s = raw.replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  } else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) {
    s = s.replace('.', '')
  }
  return parseFloat(s) || 0
}

function calcTax(base: string): string {
  const n = parseAmount(base)
  if (!n || n <= 0) return ''
  return String(Math.round(n * 0.07 * 100) / 100)
}

async function getNextSequence(year: number): Promise<number> {
  const res = await Cr9b5_pt_invoicesService.getAll({
    filter: `cr9b5_year eq ${year}`,
    select: ['cr9b5_globalsequence'],
    orderBy: ['cr9b5_globalsequence desc'],
    top: 1,
  })
  const records = res.data ?? []
  if (records.length === 0) return 1
  return (records[0].cr9b5_globalsequence ?? 0) + 1
}

function buildInternalId(shortId: string, seq: number, year: number): string {
  return `${shortId}${String(seq).padStart(3, '0')}/${year}`
}

type SortKey = 'supplier' | 'property' | 'category' | 'date' | 'amount' | 'ready'

function toIso(date: string): string {
  if (!date) return ''
  return new Date(`${date}T12:00:00`).toISOString()
}

interface Row {
  key: string
  supplier: Cr9b5_pt_contacts
  description: string
  date: string
  propertyId: string
  allProperties: boolean
  categoryId: string
  baseAmount: string
  taxAmount: string
  taxIsManual: boolean
}

export default function RegularInvoices() {
  const [rows, setRows] = useState<Row[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [categories, setCategories] = useState<Cr9b5_pt_references[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('supplier')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Next free global sequence number per year, used to preview the invoice ID
  // a row will receive on save. Populated lazily as row dates are filled in.
  const [nextSeqByYear, setNextSeqByYear] = useState<Record<number, number>>({})
  const pendingYearsRef = useRef<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    const [contractRes, contactRes, propRes, catRes] = await Promise.all([
      Svm_pt_suppliercontractsService.getAll({
        filter: 'svm_pt_active eq true',
        maxPageSize: 5000,
      }),
      Cr9b5_pt_contactsService.getAll({
        filter: `cr9b5_role eq 233100000`,
        orderBy: ['cr9b5_name asc'],
        maxPageSize: 5000,
      }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${REF_CAT_EXPENSE}`,
        orderBy: ['cr9b5_sortorder asc'],
        maxPageSize: 500,
      }),
    ])
    const contacts = contactRes.data ?? []
    setProperties(propRes.data ?? [])
    setCategories(catRes.data ?? [])

    const contactById = new Map(contacts.map(c => [c.cr9b5_pt_contactid, c]))

    // One row per contract per contract-count unit: a supplier with a
    // 2-contract deal on property A and a 1-contract deal on property B
    // yields three rows (two for A, one for B).
    const newRows: Row[] = []
    const contracts = [...(contractRes.data ?? [])].sort((a, b) =>
      (contactById.get(a._svm_pt_contact_value ?? '')?.cr9b5_name ?? '').localeCompare(
        contactById.get(b._svm_pt_contact_value ?? '')?.cr9b5_name ?? ''
      )
    )
    for (const contract of contracts) {
      const supplier = contactById.get(contract._svm_pt_contact_value ?? '')
      if (!supplier) continue
      const count = contract.svm_pt_contractcount && contract.svm_pt_contractcount > 0 ? contract.svm_pt_contractcount : 1
      const allProperties = !!contract.svm_pt_allproperties
      const propertyId = allProperties ? '' : (contract._svm_property_value ?? '')
      const categoryId = contract._svm_defaultcategory_value ?? supplier._svm_defaultcategory_value ?? ''
      const description = contract.svm_pt_defaultdescription || supplier.cr9b5_defaultdescription || ''
      for (let i = 0; i < count; i++) {
        newRows.push({
          key: `${contract.svm_pt_suppliercontractid}-${i}`,
          supplier,
          description,
          date: '',
          propertyId,
          allProperties,
          categoryId,
          baseAmount: '',
          taxAmount: '',
          taxIsManual: false,
        })
      }
    }
    setRows(newRows)
    setNextSeqByYear({})
    pendingYearsRef.current.clear()
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Lazily fetch the next free global sequence number for every year that
  // appears in a filled-in row date, so the ID preview can be computed.
  useEffect(() => {
    const years = new Set<number>()
    for (const r of rows) {
      if (r.date) years.add(new Date(r.date).getFullYear())
    }
    const missing = [...years].filter(y => !(y in nextSeqByYear) && !pendingYearsRef.current.has(y))
    if (missing.length === 0) return
    missing.forEach(y => pendingYearsRef.current.add(y))
    ;(async () => {
      const entries = await Promise.all(missing.map(async y => [y, await getNextSequence(y)] as const))
      setNextSeqByYear(prev => {
        const next = { ...prev }
        for (const [y, seq] of entries) next[y] = seq
        return next
      })
    })()
  }, [rows, nextSeqByYear])

  // Preview the internal ID each ready row would receive if saved right now,
  // allocating sequence numbers in row order per year (mirrors saveAll()).
  const previewIds = useMemo(() => {
    const counters = { ...nextSeqByYear }
    return rows.map(row => {
      const ready = !!(row.date && (row.propertyId || row.allProperties) && row.baseAmount && parseFloat(row.baseAmount) > 0)
      if (!ready) return null
      const year = new Date(row.date).getFullYear()
      if (!(year in counters)) return null
      const property = row.allProperties ? null : properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
      const shortId = row.allProperties ? 'ALL' : (property?.cr9b5_shortid ?? '')
      const seq = counters[year]
      counters[year] = seq + 1
      return buildInternalId(shortId, seq, year)
    })
  }, [rows, nextSeqByYear, properties])

  // Display order only — row handlers below still address rows by their
  // original index in `rows`, so sorting never disturbs saveAll()/preview logic.
  const displayIndices = useMemo(() => {
    const propertyName = (id: string) => properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? ''
    const categoryName = (id: string) => categories.find(c => c.cr9b5_pt_referenceid === id)?.cr9b5_value ?? ''
    const sortValue = (row: Row): string | number => {
      switch (sortKey) {
        case 'supplier': return row.supplier.cr9b5_name.toLowerCase()
        case 'property': return (row.allProperties ? 'All properties' : propertyName(row.propertyId)).toLowerCase()
        case 'category': return categoryName(row.categoryId).toLowerCase()
        case 'date': return row.date || '9999-99-99'
        case 'amount': return parseFloat(row.baseAmount) || 0
        case 'ready': {
          const ready = !!(row.date && (row.propertyId || row.allProperties) && row.baseAmount && parseFloat(row.baseAmount) > 0)
          return ready ? 0 : 1
        }
      }
    }
    const indices = rows.map((_, i) => i)
    indices.sort((a, b) => {
      const va = sortValue(rows[a])
      const vb = sortValue(rows[b])
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return indices
  }, [rows, sortKey, sortDir, properties, categories])

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r))
    setSummary(null)
    setError(null)
  }

  function handleBase(idx: number, val: string) {
    setRows(rs => rs.map((r, i) => {
      if (i !== idx) return r
      return r.taxIsManual
        ? { ...r, baseAmount: val }
        : { ...r, baseAmount: val, taxAmount: calcTax(val) }
    }))
    setSummary(null)
    setError(null)
  }

  function resetAll() {
    setRows(rs => rs.map(r => ({
      ...r,
      date: '', propertyId: '', allProperties: false, categoryId: '',
      baseAmount: '', taxAmount: '', taxIsManual: false,
    })))
    setSummary(null)
    setError(null)
  }

  function handleTax(idx: number, val: string) {
    setRows(rs => rs.map((r, i) => i !== idx ? r : { ...r, taxAmount: val, taxIsManual: true }))
    setSummary(null)
    setError(null)
  }

  function resetTax(idx: number) {
    setRows(rs => rs.map((r, i) => {
      if (i !== idx) return r
      return { ...r, taxIsManual: false, taxAmount: calcTax(r.baseAmount) }
    }))
  }

  async function saveAll() {
    const toSave = rows.filter(r => r.date && (r.propertyId || r.allProperties) && r.baseAmount && parseFloat(r.baseAmount) > 0)
    if (toSave.length === 0) {
      setError('No rows have Date, Property and Base Amount filled in.')
      return
    }

    setSaving(true)
    setError(null)
    setSummary(null)

    try {
      const year = new Date(toSave[0].date).getFullYear()

      for (const row of toSave) {
        const rowYear = new Date(row.date).getFullYear()
        const property = row.allProperties ? null : properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
        if (!row.allProperties && !property) throw new Error(`Property not found for ${row.supplier.cr9b5_name}.`)

        const seq = await getNextSequence(rowYear)
        const shortId = property?.cr9b5_shortid ?? 'ALL'
        const internalId = buildInternalId(shortId, seq, rowYear)

        const base = parseAmount(row.baseAmount)
        const tax = parseAmount(row.taxAmount) || 0
        const total = base + tax

        const payload: Record<string, unknown> = {
          cr9b5_internalid: internalId,
          cr9b5_globalsequence: seq,
          cr9b5_year: rowYear,
          cr9b5_type: TYPE_INCOMING,
          cr9b5_date: toIso(row.date),
          cr9b5_description: row.description.trim() || undefined,
          cr9b5_baseamount: base,
          cr9b5_taxrate: row.taxIsManual ? 'n/a' : '7',
          cr9b5_taxamount: tax,
          cr9b5_taxismanual: row.taxIsManual,
          cr9b5_totalgross: total,
          cr9b5_allproperties: row.allProperties,
          'cr9b5_Contact@odata.bind': `/cr9b5_pt_contacts(${row.supplier.cr9b5_pt_contactid})`,
        }
        if (property) {
          payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${property.cr9b5_pt_propertyid})`
        }
        if (row.categoryId) {
          payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${row.categoryId})`
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await Cr9b5_pt_invoicesService.create(payload as any)
        if (!result.success) throw (result.error as Error) ?? new Error(`Failed to create invoice for ${row.supplier.cr9b5_name}.`)
      }

      // Clear transient fields for saved rows, keep description
      const savedKeys = new Set(toSave.map(r => r.key))
      setRows(rs => rs.map(r =>
        savedKeys.has(r.key)
          ? { ...r, date: '', propertyId: '', allProperties: false, categoryId: '', baseAmount: '', taxAmount: '', taxIsManual: false }
          : r
      ))
      // Sequence numbers were consumed on the server; refresh the preview cache.
      setNextSeqByYear({})
      pendingYearsRef.current.clear()

      setSummary(`${toSave.length} invoice${toSave.length !== 1 ? 's' : ''} created.`)
      void year // suppress unused warning
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Regular Invoices</h1>
        <p className="text-gray-400 text-sm">No active supplier contracts found. Add property contracts for a supplier in the Contacts screen.</p>
      </div>
    )
  }

  const readyCount = rows.filter(r => r.date && (r.propertyId || r.allProperties) && r.baseAmount && parseFloat(r.baseAmount) > 0).length

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Regular Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quick-entry for recurring supplier invoices. Fill in the rows and click Save All.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Sort by</label>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="supplier">Supplier</option>
            <option value="property">Property</option>
            <option value="category">Category</option>
            <option value="date">Date</option>
            <option value="amount">Base Amount</option>
            <option value="ready">Ready first</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white hover:bg-gray-50"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
              <th className="px-4 py-3 w-24">Next ID</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3 text-center">All Prop</th>
              <th className="px-4 py-3 text-right">Base Amount</th>
              <th className="px-4 py-3 text-right">Tax Amount</th>
              <th className="px-4 py-3 text-right">Total Gross</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {displayIndices.map(idx => {
              const row = rows[idx]
              const base = parseFloat(row.baseAmount) || 0
              const tax = parseFloat(row.taxAmount) || 0
              const total = base + tax
              const ready = !!(row.date && (row.propertyId || row.allProperties) && row.baseAmount && base > 0)
              const previewId = previewIds[idx]
              return (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-center">
                    {ready && (
                      <div className="flex flex-col items-center gap-0.5 leading-none">
                        <span className="text-green-500 font-bold text-base leading-none">✓</span>
                        <span className="text-[10px] font-mono text-green-600 whitespace-nowrap">
                          {previewId ?? '…'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                    {row.supplier.cr9b5_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => updateRow(idx, { description: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[160px]"
                      placeholder="Description"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="date"
                      value={row.date}
                      onChange={e => updateRow(idx, { date: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.categoryId}
                      onChange={e => updateRow(idx, { categoryId: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px]"
                    >
                      <option value="">No category</option>
                      {categories.map(c => (
                        <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.propertyId}
                      onChange={e => updateRow(idx, { propertyId: e.target.value })}
                      disabled={row.allProperties}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">Select property…</option>
                      {properties.map(p => (
                        <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <select
                      value={row.allProperties ? 'yes' : 'no'}
                      onChange={e => updateRow(idx, { allProperties: e.target.value === 'yes', propertyId: e.target.value === 'yes' ? '' : row.propertyId })}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number" min="0" step="0.01"
                      value={row.baseAmount}
                      onChange={e => handleBase(idx, e.target.value)}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <input
                        type="number" min="0" step="0.01"
                        value={row.taxAmount}
                        onChange={e => handleTax(idx, e.target.value)}
                        className={[
                          'border rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 w-28',
                          row.taxIsManual ? 'border-amber-300' : 'border-gray-300',
                        ].join(' ')}
                        placeholder="0.00"
                      />
                      {row.taxIsManual && (
                        <button type="button" onClick={() => resetTax(idx)} title="Reset to 7%"
                          className="text-gray-400 hover:text-indigo-600 text-base leading-none">↺</button>
                      )}
                    </div>
                    {row.taxIsManual && (
                      <span className="text-xs text-amber-600">manual</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                    {base > 0 || tax > 0 ? fmtEur(total) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center gap-4">
        <button
          onClick={saveAll}
          disabled={saving || readyCount === 0}
          className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : `Save All${readyCount > 0 ? ` (${readyCount})` : ''}`}
        </button>
        <button
          onClick={resetAll}
          disabled={saving}
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Reset All
        </button>
        {summary && (
          <span className="text-sm text-green-700 font-medium">✓ {summary}</span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  )
}
