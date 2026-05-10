import { useEffect, useState } from 'react'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'

const TYPE_INCOMING = 233100000

function calcTax(base: string): string {
  const n = parseFloat(base)
  if (isNaN(n) || n <= 0) return ''
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

function toIso(date: string): string {
  if (!date) return ''
  return new Date(`${date}T12:00:00`).toISOString()
}

interface Row {
  supplier: Cr9b5_pt_contacts
  description: string
  date: string
  propertyId: string
  baseAmount: string
  taxAmount: string
  taxIsManual: boolean
}

export default function RegularInvoices() {
  const [rows, setRows] = useState<Row[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [suppRes, propRes] = await Promise.all([
      Cr9b5_pt_contactsService.getAll({
        filter: `cr9b5_role eq 233100000 and cr9b5_regularsupplier eq true`,
        orderBy: ['cr9b5_name asc'],
        maxPageSize: 5000,
      }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
    ])
    setProperties(propRes.data ?? [])
    setRows((suppRes.data ?? []).map(s => ({
      supplier: s,
      description: s.cr9b5_defaultdescription ?? '',
      date: '',
      propertyId: '',
      baseAmount: '',
      taxAmount: '',
      taxIsManual: false,
    })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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
    const toSave = rows.filter(r => r.date && r.propertyId && r.baseAmount && parseFloat(r.baseAmount) > 0)
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
        const property = properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
        if (!property) throw new Error(`Property not found for ${row.supplier.cr9b5_name}.`)

        const seq = await getNextSequence(rowYear)
        const internalId = buildInternalId(property.cr9b5_shortid, seq, rowYear)

        const base = parseFloat(row.baseAmount)
        const tax = parseFloat(row.taxAmount) || 0
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
          'cr9b5_Property@odata.bind': `/cr9b5_pt_properties(${row.propertyId})`,
          'cr9b5_Contact@odata.bind': `/cr9b5_pt_contacts(${row.supplier.cr9b5_pt_contactid})`,
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await Cr9b5_pt_invoicesService.create(payload as any)
        if (!result.success) throw (result.error as Error) ?? new Error(`Failed to create invoice for ${row.supplier.cr9b5_name}.`)
      }

      // Clear transient fields for saved rows, keep description
      const savedIds = new Set(toSave.map(r => r.supplier.cr9b5_pt_contactid))
      setRows(rs => rs.map(r =>
        savedIds.has(r.supplier.cr9b5_pt_contactid)
          ? { ...r, date: '', propertyId: '', baseAmount: '', taxAmount: '', taxIsManual: false }
          : r
      ))

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
        <p className="text-gray-400 text-sm">No regular suppliers found. Mark suppliers as "Regular" in the Contacts screen.</p>
      </div>
    )
  }

  const readyCount = rows.filter(r => r.date && r.propertyId && r.baseAmount && parseFloat(r.baseAmount) > 0).length

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <h1 className="text-2xl font-semibold text-gray-900">Regular Invoices</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quick-entry for recurring supplier invoices. Fill in the rows and click Save All.</p>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
              <th className="px-4 py-3 w-6"></th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3 text-right">Base Amount</th>
              <th className="px-4 py-3 text-right">Tax Amount</th>
              <th className="px-4 py-3 text-right">Total Gross</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {rows.map((row, idx) => {
              const base = parseFloat(row.baseAmount) || 0
              const tax = parseFloat(row.taxAmount) || 0
              const total = base + tax
              const ready = !!(row.date && row.propertyId && row.baseAmount && base > 0)
              return (
                <tr key={row.supplier.cr9b5_pt_contactid} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-center">
                    {ready && <span className="text-green-500 font-bold text-base leading-none">✓</span>}
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
                      value={row.propertyId}
                      onChange={e => updateRow(idx, { propertyId: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white min-w-[140px]"
                    >
                      <option value="">Select property…</option>
                      {properties.map(p => (
                        <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
                      ))}
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
                    {base > 0 || tax > 0 ? `€ ${total.toFixed(2)}` : '—'}
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
          disabled={saving}
          className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : `Save All${readyCount > 0 ? ` (${readyCount})` : ''}`}
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
