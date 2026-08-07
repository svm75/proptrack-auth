import { useEffect, useMemo, useRef, useState } from 'react'
import { makeStyles, tokens, Button, Text, Spinner } from '@fluentui/react-components'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import { Svm_pt_suppliercontractsService } from '@/generated/services/Svm_pt_suppliercontractsService'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import { formatMoney } from '@/domain/money'

const TYPE_INCOMING   = 233100000
const REF_CAT_EXPENSE = 233100006

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '860px' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '10px 10px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  input: { border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, padding: '6px 10px', fontSize: '14px', width: '100%' },
  footer: { padding: '14px 24px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, display: 'flex', alignItems: 'center', gap: '16px' },
})

function parseAmount(raw: string): number {
  let s = raw.replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) s = s.replace('.', '')
  return parseFloat(s) || 0
}
function calcTax(base: string): string {
  const n = parseAmount(base)
  if (!n || n <= 0) return ''
  return String(Math.round(n * 0.07 * 100) / 100)
}
async function getNextSequence(year: number): Promise<number> {
  const res = await Cr9b5_pt_invoicesService.getAll({ filter: `cr9b5_year eq ${year}`, select: ['cr9b5_globalsequence'], orderBy: ['cr9b5_globalsequence desc'], top: 1 })
  const records = res.data ?? []
  return records.length === 0 ? 1 : (records[0].cr9b5_globalsequence ?? 0) + 1
}
function buildInternalId(shortId: string, seq: number, year: number): string {
  return `${shortId}${String(seq).padStart(3, '0')}/${year}`
}
function toIso(date: string): string {
  return date ? new Date(`${date}T12:00:00`).toISOString() : ''
}

type SortKey = 'supplier' | 'property' | 'category' | 'date' | 'amount' | 'ready'

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
  skipInternalId: boolean
}

export default function RegularInvoices() {
  const s = useStyles()
  const [rows, setRows] = useState<Row[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [categories, setCategories] = useState<Cr9b5_pt_references[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('supplier')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [nextSeqByYear, setNextSeqByYear] = useState<Record<number, number>>({})
  const pendingYearsRef = useRef<Set<number>>(new Set())

  async function load() {
    setLoading(true)
    const [contractRes, contactRes, propRes, catRes] = await Promise.all([
      Svm_pt_suppliercontractsService.getAll({ filter: 'svm_pt_active eq true', maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ filter: `cr9b5_role eq 233100000`, orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_EXPENSE}`, orderBy: ['cr9b5_sortorder asc'], maxPageSize: 500 }),
    ])
    const contacts = contactRes.data ?? []
    setProperties(propRes.data ?? [])
    setCategories(catRes.data ?? [])
    const contactById = new Map(contacts.map(c => [c.cr9b5_pt_contactid, c]))
    const newRows: Row[] = []
    const contracts = [...(contractRes.data ?? [])].sort((a, b) =>
      (contactById.get(a._svm_pt_contact_value ?? '')?.cr9b5_name ?? '').localeCompare(contactById.get(b._svm_pt_contact_value ?? '')?.cr9b5_name ?? '')
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
        newRows.push({ key: `${contract.svm_pt_suppliercontractid}-${i}`, supplier, description, date: '', propertyId, allProperties, categoryId, baseAmount: '', taxAmount: '', taxIsManual: false, skipInternalId: false })
      }
    }
    setRows(newRows)
    setNextSeqByYear({})
    pendingYearsRef.current.clear()
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    const years = new Set<number>()
    for (const r of rows) if (r.date) years.add(new Date(r.date).getFullYear())
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

  const previewIds = useMemo(() => {
    const counters = { ...nextSeqByYear }
    return rows.map(row => {
      const ready = !!(row.date && (row.propertyId || row.allProperties) && row.baseAmount && parseFloat(row.baseAmount) > 0)
      if (!ready) return null
      if (row.skipInternalId) return '(no ID)'
      const year = new Date(row.date).getFullYear() // note: counters only advance for non-skip rows below
      if (!(year in counters)) return null
      const property = row.allProperties ? null : properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
      const shortId = row.allProperties ? 'ALL' : (property?.cr9b5_shortid ?? '')
      const seq = counters[year]
      counters[year] = seq + 1
      return buildInternalId(shortId, seq, year)
    })
  }, [rows, nextSeqByYear, properties])

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
        case 'ready': return (row.date && (row.propertyId || row.allProperties) && row.baseAmount && parseFloat(row.baseAmount) > 0) ? 0 : 1
      }
    }
    const indices = rows.map((_, i) => i)
    indices.sort((a, b) => {
      const va = sortValue(rows[a]); const vb = sortValue(rows[b])
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return indices
  }, [rows, sortKey, sortDir, properties, categories])

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r))
    setSummary(null); setError(null)
  }
  function handleBase(idx: number, val: string) {
    setRows(rs => rs.map((r, i) => i !== idx ? r : r.taxIsManual ? { ...r, baseAmount: val } : { ...r, baseAmount: val, taxAmount: calcTax(val) }))
    setSummary(null); setError(null)
  }
  function resetAll() {
    setRows(rs => rs.map(r => ({ ...r, date: '', propertyId: '', allProperties: false, categoryId: '', baseAmount: '', taxAmount: '', taxIsManual: false, skipInternalId: false })))
    setSummary(null); setError(null)
  }
  function handleTax(idx: number, val: string) {
    setRows(rs => rs.map((r, i) => i !== idx ? r : { ...r, taxAmount: val, taxIsManual: true }))
    setSummary(null); setError(null)
  }
  function resetTax(idx: number) {
    setRows(rs => rs.map((r, i) => i !== idx ? r : { ...r, taxIsManual: false, taxAmount: calcTax(r.baseAmount) }))
  }

  async function saveAll() {
    const toSave = rows.filter(r => r.date && (r.propertyId || r.allProperties) && r.baseAmount && parseFloat(r.baseAmount) > 0)
    if (toSave.length === 0) { setError('No rows have Date, Property and Base Amount filled in.'); return }
    setSaving(true); setError(null); setSummary(null)
    try {
      for (const row of toSave) {
        const rowYear = new Date(row.date).getFullYear()
        const property = row.allProperties ? null : properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
        if (!row.allProperties && !property) throw new Error(`Property not found for ${row.supplier.cr9b5_name}.`)
        let internalId = ''
        let seq = 0
        if (!row.skipInternalId) {
          seq = await getNextSequence(rowYear)
          const shortId = property?.cr9b5_shortid ?? 'ALL'
          internalId = buildInternalId(shortId, seq, rowYear)
        }
        const base = parseAmount(row.baseAmount)
        const tax = parseAmount(row.taxAmount) || 0
        const payload: Record<string, unknown> = {
          cr9b5_internalid: internalId, cr9b5_globalsequence: seq, cr9b5_year: rowYear, cr9b5_type: TYPE_INCOMING,
          cr9b5_date: toIso(row.date), cr9b5_description: row.description.trim() || undefined,
          cr9b5_baseamount: base, cr9b5_taxrate: row.taxIsManual ? 'n/a' : '7', cr9b5_taxamount: tax,
          cr9b5_taxismanual: row.taxIsManual, cr9b5_totalgross: base + tax, cr9b5_allproperties: row.allProperties,
          'cr9b5_Contact@odata.bind': `/cr9b5_pt_contacts(${row.supplier.cr9b5_pt_contactid})`,
        }
        if (property) payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${property.cr9b5_pt_propertyid})`
        if (row.categoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${row.categoryId})`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await Cr9b5_pt_invoicesService.create(payload as any)
        if (!result.success) throw (result.error as Error) ?? new Error(`Failed to create invoice for ${row.supplier.cr9b5_name}.`)
      }
      const savedKeys = new Set(toSave.map(r => r.key))
      setRows(rs => rs.map(r => savedKeys.has(r.key) ? { ...r, date: '', propertyId: '', allProperties: false, categoryId: '', baseAmount: '', taxAmount: '', taxIsManual: false, skipInternalId: false } : r))
      setNextSeqByYear({}); pendingYearsRef.current.clear()
      setSummary(`${toSave.length} invoice${toSave.length !== 1 ? 's' : ''} created.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading…" style={{ padding: '24px' }} />
  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <Text size={600} weight="semibold" style={{ display: 'block', marginBottom: '8px' }}>Regular Invoices</Text>
        <Text style={{ color: tokens.colorNeutralForeground4 }}>No active supplier contracts found. Add property contracts for a supplier in the Contacts screen.</Text>
      </div>
    )
  }

  const readyCount = rows.filter(r => r.date && (r.propertyId || r.allProperties) && r.baseAmount && parseFloat(r.baseAmount) > 0).length

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <Text size={600} weight="semibold" style={{ display: 'block' }}>Regular Invoices</Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Quick-entry for recurring supplier invoices. Fill in the rows and click Save All.</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Sort by</Text>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={{ padding: '6px 10px', borderRadius: 4, border: `1px solid ${tokens.colorNeutralStroke1}`, fontSize: '14px' }}>
            <option value="supplier">Supplier</option>
            <option value="property">Property</option>
            <option value="category">Category</option>
            <option value="date">Date</option>
            <option value="amount">Base Amount</option>
            <option value="ready">Ready first</option>
          </select>
          <Button appearance="secondary" onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
            {sortDir === 'asc' ? '↑' : '↓'}
          </Button>
        </div>
      </div>

      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>Next ID</th>
              <th className={s.th}>No ID</th>
              <th className={s.th}>Supplier</th>
              <th className={s.th}>Description</th>
              <th className={s.th}>Date</th>
              <th className={s.th}>Category</th>
              <th className={s.th}>Property</th>
              <th className={s.th}>All Prop</th>
              <th className={s.th}>Base Amount</th>
              <th className={s.th}>Tax Amount</th>
              <th className={s.th}>Total Gross</th>
            </tr>
          </thead>
          <tbody>
            {displayIndices.map(idx => {
              const row = rows[idx]
              const base = parseFloat(row.baseAmount) || 0
              const tax = parseFloat(row.taxAmount) || 0
              const total = base + tax
              const ready = !!(row.date && (row.propertyId || row.allProperties) && row.baseAmount && base > 0)
              const previewId = previewIds[idx]
              return (
                <tr key={row.key}>
                  <td className={s.td} style={{ textAlign: 'center' }}>
                    {ready && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ color: tokens.colorPaletteGreenForeground1, fontWeight: 700 }}>✓</span>
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: tokens.colorPaletteGreenForeground1 }}>{previewId ?? '…'}</span>
                      </div>
                    )}
                  </td>
                  <td className={s.td} style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={row.skipInternalId} onChange={e => updateRow(idx, { skipInternalId: e.target.checked })} title="Don't auto-generate an Internal ID for this invoice" />
                  </td>
                  <td className={s.td} style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.supplier.cr9b5_name}</td>
                  <td className={s.td}><input className={s.input} value={row.description} onChange={e => updateRow(idx, { description: e.target.value })} placeholder="Description" /></td>
                  <td className={s.td}><input className={s.input} type="date" value={row.date} onChange={e => updateRow(idx, { date: e.target.value })} /></td>
                  <td className={s.td}>
                    <select className={s.input} value={row.categoryId} onChange={e => updateRow(idx, { categoryId: e.target.value })}>
                      <option value="">No category</option>
                      {categories.map(c => <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>)}
                    </select>
                  </td>
                  <td className={s.td}>
                    <select className={s.input} value={row.propertyId} disabled={row.allProperties} onChange={e => updateRow(idx, { propertyId: e.target.value })}>
                      <option value="">Select property…</option>
                      {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
                    </select>
                  </td>
                  <td className={s.td} style={{ textAlign: 'center' }}>
                    <select className={s.input} value={row.allProperties ? 'yes' : 'no'} onChange={e => updateRow(idx, { allProperties: e.target.value === 'yes', propertyId: e.target.value === 'yes' ? '' : row.propertyId })}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </td>
                  <td className={s.td} style={{ textAlign: 'right' }}>
                    <input className={s.input} type="number" min={0} step="0.01" value={row.baseAmount} onChange={e => handleBase(idx, e.target.value)} placeholder="0.00" style={{ textAlign: 'right', width: '110px' }} />
                  </td>
                  <td className={s.td} style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <input className={s.input} type="number" min={0} step="0.01" value={row.taxAmount} onChange={e => handleTax(idx, e.target.value)} placeholder="0.00"
                        style={{ textAlign: 'right', width: '110px', borderColor: row.taxIsManual ? tokens.colorPaletteMarigoldBorderActive : undefined }} />
                      {row.taxIsManual && <Button size="small" appearance="transparent" onClick={() => resetTax(idx)} title="Reset to 7%">↺</Button>}
                    </div>
                    {row.taxIsManual && <Text size={100} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>manual</Text>}
                  </td>
                  <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{base > 0 || tax > 0 ? formatMoney(total) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={s.footer}>
        <Button appearance="primary" disabled={saving || readyCount === 0} onClick={saveAll}>
          {saving ? 'Saving…' : `Save All${readyCount > 0 ? ` (${readyCount})` : ''}`}
        </Button>
        <Button appearance="secondary" disabled={saving} onClick={resetAll}>Reset All</Button>
        {summary && <Text style={{ color: tokens.colorPaletteGreenForeground1, fontWeight: 600 }}>✓ {summary}</Text>}
        {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
      </div>
    </div>
  )
}
