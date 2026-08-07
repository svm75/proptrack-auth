import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  makeStyles, tokens, Button, Input, Select, Text, Spinner, Badge, Checkbox,
} from '@fluentui/react-components'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import InvoiceForm from './InvoiceForm'
import InvoiceImport from './InvoiceImport'
import ExportConfigModal from './ExportConfigModal'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'

const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006
const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  toolbar: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', flexDirection: 'column', gap: '12px' },
  toolbarTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  segment: { display: 'flex', borderRadius: tokens.borderRadiusMedium, overflow: 'hidden', border: `1px solid ${tokens.colorNeutralStroke1}` },
  segmentBtn: { padding: '6px 12px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1 },
  segmentBtnActive: { backgroundColor: tokens.colorBrandBackground, color: 'white' },
  bulkBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', backgroundColor: tokens.colorBrandBackground2, border: `1px solid ${tokens.colorBrandStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px' },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '860px' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '10px 10px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase' },
  td: { padding: '8px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  summary: { padding: '10px 24px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, display: 'flex', gap: '24px', fontSize: '14px', color: tokens.colorNeutralForeground2 },
})

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Invoices() {
  const s = useStyles()
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkPropertyId, setBulkPropertyId] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterPropId, setFilterPropId] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'id_asc' | 'id_desc' | 'total_desc' | 'total_asc'>('date_desc')

  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [importOpen, setImportOpen]   = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  async function loadRefData() {
    const [propRes, conRes, catRes] = await Promise.all([
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_INCOME} or cr9b5_referencetype eq ${REF_CAT_EXPENSE}`, maxPageSize: 5000 }),
    ])
    setProperties(propRes.data ?? [])
    setContacts(conRes.data ?? [])
    const map: Record<string, string> = {}
    const list: { id: string; name: string }[] = []
    for (const ref of catRes.data ?? []) {
      if (ref.cr9b5_pt_referenceid && ref.cr9b5_value) { map[ref.cr9b5_pt_referenceid] = ref.cr9b5_value; list.push({ id: ref.cr9b5_pt_referenceid, name: ref.cr9b5_value }) }
    }
    setCategoryMap(map)
    setCategoryList(list.sort((a, b) => a.name.localeCompare(b.name)))
  }

  function buildInvoiceFilter(): string | undefined {
    const parts: string[] = []
    if (filterType === 'income') parts.push(`cr9b5_type eq ${TYPE_OUTGOING}`)
    if (filterType === 'expense') parts.push(`cr9b5_type eq ${TYPE_INCOMING}`)
    if (filterPropId) parts.push(`_cr9b5_property_value eq '${filterPropId}'`)
    if (filterFrom) parts.push(`cr9b5_date ge ${new Date(filterFrom).toISOString()}`)
    if (filterTo) parts.push(`cr9b5_date le ${new Date(filterTo + 'T23:59:59').toISOString()}`)
    return parts.length ? parts.join(' and ') : undefined
  }

  async function loadInvoices() {
    setLoading(true)
    const res = await Cr9b5_pt_invoicesService.getAll({ filter: buildInvoiceFilter(), orderBy: ['cr9b5_date desc'], maxPageSize: 5000 })
    setInvoices(res.data ?? [])
    setSelectedIds(new Set())
    setLoading(false)
  }

  useEffect(() => { loadRefData() }, [])
  useEffect(() => { loadInvoices() }, [filterType, filterPropId, filterFrom, filterTo])

  const propertyById = useMemo(() => new Map(properties.map(p => [p.cr9b5_pt_propertyid, p])), [properties])
  const contactById = useMemo(() => new Map(contacts.map(c => [c.cr9b5_pt_contactid, c])), [contacts])

  function propName(inv: Cr9b5_pt_invoices): string {
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_property_value'] as string | undefined
    return (id && propertyById.get(id)?.cr9b5_name) ?? '—'
  }
  function contactName(inv: Cr9b5_pt_invoices): string {
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined
    return (id && contactById.get(id)?.cr9b5_name) ?? '—'
  }
  function contactWithTax(inv: Cr9b5_pt_invoices): string {
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined
    const con = id ? contactById.get(id) : undefined
    if (!con) return '—'
    return con.cr9b5_taxid ? `${con.cr9b5_name} (${con.cr9b5_taxid})` : (con.cr9b5_name ?? '—')
  }
  function internalIdSortKey(id: string | undefined): number {
    if (!id) return 0
    const m = id.replace(/^(LV|TIAS)/i, '').match(/\d+/)
    return m ? parseInt(m[0], 10) : 0
  }

  const filtered = invoices.filter(inv => {
    if (search) {
      const q = search.toLowerCase()
      const haystack = [inv.cr9b5_internalid, inv.cr9b5_description, propName(inv), contactName(inv), inv.cr9b5_bookingreference].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    switch (sortBy) {
      case 'date_asc': return (a.cr9b5_date ?? '') < (b.cr9b5_date ?? '') ? -1 : 1
      case 'date_desc': return (a.cr9b5_date ?? '') > (b.cr9b5_date ?? '') ? -1 : 1
      case 'id_asc': return internalIdSortKey(a.cr9b5_internalid) - internalIdSortKey(b.cr9b5_internalid)
      case 'id_desc': return internalIdSortKey(b.cr9b5_internalid) - internalIdSortKey(a.cr9b5_internalid)
      case 'total_asc': return (a.cr9b5_totalgross ?? 0) - (b.cr9b5_totalgross ?? 0)
      case 'total_desc': return (b.cr9b5_totalgross ?? 0) - (a.cr9b5_totalgross ?? 0)
    }
  })

  function openNew() { setEditInvoice(null); setFormOpen(true) }

  function exportExcel(orderedColumns: string[]) {
    const fmtD = (iso: string | undefined) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
    const fmtN = (n: number | undefined) => n != null ? Number(n.toFixed(2)) : ''
    const allCols: Record<string, (inv: Cr9b5_pt_invoices) => unknown> = {
      'Internal ID': inv => inv.cr9b5_internalid,
      'Type': inv => (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING ? 'Income' : 'Expense',
      'Category': inv => categoryMap[(inv as unknown as Record<string,unknown>)['_cr9b5_categoryid_value'] as string] ?? '',
      'Property': inv => (inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? 'All' : propName(inv),
      'All Properties': inv => (inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? 'Yes' : 'No',
      'Contact': inv => contactWithTax(inv),
      'Contact (TaxID)': inv => contactWithTax(inv),
      'Date': inv => fmtD(inv.cr9b5_date),
      'Description': inv => inv.cr9b5_description ?? '',
      'Booking Ref': inv => inv.cr9b5_bookingreference ?? '',
      'Check-in': inv => fmtD(inv.cr9b5_checkin),
      'Check-out': inv => fmtD(inv.cr9b5_checkout),
      'Nights': inv => inv.cr9b5_nights ?? '',
      'Days': inv => (inv as unknown as Record<string,unknown>)['cr9b5_days'] ?? '',
      'Adults': inv => inv.cr9b5_adults ?? '',
      'Children': inv => inv.cr9b5_children ?? '',
      'Babies': inv => inv.cr9b5_babies ?? '',
      'Base Amount': inv => fmtN(inv.cr9b5_baseamount),
      'Tax Rate': inv => inv.cr9b5_taxrate ?? '',
      'Tax Amount': inv => fmtN(inv.cr9b5_taxamount),
      'Total Gross': inv => fmtN(inv.cr9b5_totalgross),
    }
    const rows = filtered.filter(inv => !isCancelled(inv)).map(inv => {
      const row: Record<string, unknown> = {}
      for (const col of orderedColumns) row[col] = allCols[col]?.(inv) ?? ''
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows, { header: orderedColumns })
    ws['!cols'] = orderedColumns.map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    const from = filterFrom || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date < m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const to = filterTo || (filtered.length ? filtered.reduce((m, i) => i.cr9b5_date && i.cr9b5_date > m ? i.cr9b5_date : m, filtered[0].cr9b5_date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const filename = `invoices_${from}to${to}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'invoices export', filename)
    setExportOpen(false)
  }

  function openEdit(inv: Cr9b5_pt_invoices) { setEditInvoice(inv); setFormOpen(true) }

  async function cancelInvoice(inv: Cr9b5_pt_invoices) {
    if (!confirm(`Cancel invoice ${inv.cr9b5_internalid}? This cannot be undone.`)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_invoicesService.update(inv.cr9b5_pt_invoiceid, { statecode: 1 as any, statuscode: 2 as any })
    logActivity('Deleted', 'Invoice', inv.cr9b5_internalid ?? inv.cr9b5_pt_invoiceid)
    setInvoices(list => list.map(i => i.cr9b5_pt_invoiceid === inv.cr9b5_pt_invoiceid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? { ...i, statecode: 1 as any, statuscode: 2 as any, statecodename: 'Inactive' } : i))
  }

  function upsertInvoiceLocal(record: Cr9b5_pt_invoices) {
    setInvoices(list => {
      const idx = list.findIndex(i => i.cr9b5_pt_invoiceid === record.cr9b5_pt_invoiceid)
      if (idx === -1) return [record, ...list]
      const next = [...list]; next[idx] = record; return next
    })
  }

  function isCancelled(inv: Cr9b5_pt_invoices): boolean {
    return (inv.statecode as unknown as number) === 1 || (inv.statecodename as unknown as string) === 'Inactive'
  }

  function toggleSelect(id: string) {
    setSelectedIds(sel => { const next = new Set(sel); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const selectableIds = filtered.filter(inv => !isCancelled(inv)).map(inv => inv.cr9b5_pt_invoiceid)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  function toggleSelectAll() { setSelectedIds(allSelected ? new Set() : new Set(selectableIds)) }

  async function applyBulkEdit() {
    if (!bulkCategoryId && !bulkPropertyId) return
    setBulkApplying(true)
    const ids = [...selectedIds]
    try {
      for (const id of ids) {
        const payload: Record<string, unknown> = {}
        if (bulkCategoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${bulkCategoryId})`
        if (bulkPropertyId) { payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${bulkPropertyId})`; payload.cr9b5_allproperties = false }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_invoicesService.update(id, payload as any)
      }
      const changed = [bulkCategoryId && 'category', bulkPropertyId && 'property'].filter(Boolean).join(' + ')
      logActivity('Updated', 'Invoice', `${ids.length} invoices`, `Bulk edit: ${changed}`)
      setSelectedIds(new Set()); setBulkCategoryId(''); setBulkPropertyId('')
      await loadInvoices()
    } finally {
      setBulkApplying(false)
    }
  }

  function totalGuests(inv: Cr9b5_pt_invoices): { display: string; title: string } {
    const a = inv.cr9b5_adults ?? 0, c = inv.cr9b5_children ?? 0, b = inv.cr9b5_babies ?? 0
    const total = a + c + b
    if (total === 0) return { display: '—', title: '' }
    return { display: `${a} / ${c} / ${b}`, title: `${a} adult${a !== 1 ? 's' : ''}, ${c} child${c !== 1 ? 'ren' : ''}, ${b} bab${b !== 1 ? 'ies' : 'y'}` }
  }

  return (
    <div className={s.root}>
      <div className={s.toolbar}>
        <div className={s.toolbarTop}>
          <Text size={600} weight="semibold">Invoices</Text>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button appearance="secondary" disabled={filtered.length === 0} onClick={() => setExportOpen(true)}>↓ Export Excel</Button>
            <Button appearance="secondary" onClick={() => setImportOpen(true)}>↑ Import from Excel</Button>
            <Button appearance="primary" onClick={openNew}>+ New Invoice</Button>
          </div>
        </div>

        <div className={s.filterRow}>
          <div className={s.segment}>
            {([['all', 'All'], ['income', 'Income'], ['expense', 'Expense']] as const).map(([t, label]) => (
              <button key={t} className={`${s.segmentBtn} ${filterType === t ? s.segmentBtnActive : ''}`} onClick={() => setFilterType(t)}>{label}</button>
            ))}
          </div>
          <Select value={filterPropId} onChange={e => setFilterPropId(e.target.value)} style={{ minWidth: '160px' }}>
            <option value="">All properties</option>
            {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
          </Select>
          <Input type="date" value={filterFrom} onChange={(_, d) => setFilterFrom(d.value)} title="From date" />
          <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
          <Input type="date" value={filterTo} onChange={(_, d) => setFilterTo(d.value)} title="To date" />
          <Input type="search" value={search} onChange={(_, d) => setSearch(d.value)} placeholder="Search ID, description, contact…" style={{ minWidth: '220px' }} />
          <Select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date_desc">Date (newest first)</option>
            <option value="date_asc">Date (oldest first)</option>
            <option value="id_asc">Internal ID (asc)</option>
            <option value="id_desc">Internal ID (desc)</option>
            <option value="total_desc">Total (highest first)</option>
            <option value="total_asc">Total (lowest first)</option>
          </Select>
          {(filterType !== 'all' || filterPropId || filterFrom || filterTo || search || sortBy !== 'date_desc') && (
            <Button appearance="transparent" size="small" onClick={() => { setFilterType('all'); setFilterPropId(''); setFilterFrom(''); setFilterTo(''); setSearch(''); setSortBy('date_desc') }}>
              Clear filters
            </Button>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className={s.bulkBar}>
            <Text weight="semibold">{selectedIds.size} selected</Text>
            <Select value={bulkCategoryId} onChange={e => setBulkCategoryId(e.target.value)}>
              <option value="">Set category…</option>
              {categoryList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select value={bulkPropertyId} onChange={e => setBulkPropertyId(e.target.value)}>
              <option value="">Set property…</option>
              {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
            </Select>
            <Button appearance="primary" size="small" disabled={bulkApplying || (!bulkCategoryId && !bulkPropertyId)} onClick={applyBulkEdit}>{bulkApplying ? 'Applying…' : 'Apply'}</Button>
            <Button appearance="transparent" size="small" disabled={bulkApplying} onClick={() => { setSelectedIds(new Set()); setBulkCategoryId(''); setBulkPropertyId('') }}>Clear selection</Button>
          </div>
        )}
      </div>

      <div className={s.tableWrap}>
        {loading ? <Spinner label="Loading…" style={{ padding: '24px' }} /> : filtered.length === 0 ? (
          <Text style={{ padding: '24px', display: 'block', color: tokens.colorNeutralForeground4 }}>No invoices match the current filters.</Text>
        ) : (
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}><Checkbox checked={allSelected} onChange={toggleSelectAll} /></th>
                <th className={s.th}>Internal ID</th>
                <th className={s.th}>Type</th>
                <th className={s.th}>Category</th>
                <th className={s.th}>Property</th>
                <th className={s.th}>Contact</th>
                <th className={s.th}>Date</th>
                <th className={s.th}>Booking Ref</th>
                <th className={s.th}>Nights</th>
                <th className={s.th}>Guests</th>
                <th className={s.th}>Base</th>
                <th className={s.th}>Tax %</th>
                <th className={s.th}>Tax €</th>
                <th className={s.th}>Total Gross</th>
                <th className={s.th} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isOut = (inv.cr9b5_type as number) === TYPE_OUTGOING
                const cancelled = isCancelled(inv)
                return (
                  <tr key={inv.cr9b5_pt_invoiceid} style={{ opacity: cancelled ? 0.6 : 1 }}>
                    <td className={s.td}>{!cancelled && <Checkbox checked={selectedIds.has(inv.cr9b5_pt_invoiceid)} onChange={() => toggleSelect(inv.cr9b5_pt_invoiceid)} />}</td>
                    <td className={s.td} style={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <a href="#" onClick={e => { e.preventDefault(); setViewInvoice(inv) }} style={{ color: cancelled ? tokens.colorNeutralForeground4 : tokens.colorBrandForegroundLink, textDecoration: cancelled ? 'line-through' : 'none' }}>{inv.cr9b5_internalid}</a>
                      {cancelled && <span style={{ marginLeft: 6, fontSize: '11px', color: tokens.colorPaletteRedForeground1, fontWeight: 400 }}>cancelled</span>}
                    </td>
                    <td className={s.td}><Badge appearance="tint" color={isOut ? 'success' : 'danger'}>{isOut ? 'Income' : 'Expense'}</Badge></td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap', color: tokens.colorNeutralForeground3, fontSize: '12px' }}>{categoryMap[(inv as unknown as Record<string,unknown>)['_cr9b5_categoryid_value'] as string] ?? '—'}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{(inv as unknown as Record<string,unknown>)['cr9b5_allproperties'] ? <Text weight="semibold" style={{ color: tokens.colorBrandForeground1, fontSize: '12px' }}>All</Text> : propName(inv)}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{contactName(inv)}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.cr9b5_date)}</td>
                    <td className={s.td} style={{ color: tokens.colorNeutralForeground4, fontSize: '12px' }}>{inv.cr9b5_bookingreference ?? '—'}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{inv.cr9b5_nights ?? '—'}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{(() => { const g = totalGuests(inv); return <span title={g.title}>{g.display}</span> })()}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(inv.cr9b5_baseamount)}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{inv.cr9b5_taxismanual ? <span style={{ color: tokens.colorPaletteMarigoldForeground1, fontSize: '12px', fontWeight: 600 }}>n/a</span> : (inv.cr9b5_taxrate ? `${inv.cr9b5_taxrate}%` : '—')}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(inv.cr9b5_taxamount)}</td>
                    <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(inv.cr9b5_totalgross)}</td>
                    <td className={s.td}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {!cancelled && <Button size="small" appearance="subtle" onClick={() => openEdit(inv)}>Edit</Button>}
                        {!cancelled && <Button size="small" appearance="subtle" onClick={() => cancelInvoice(inv)}>Cancel</Button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className={s.summary}>
          {(() => {
            const active = filtered.filter(i => !isCancelled(i))
            const cancelledCount = filtered.length - active.length
            return (
              <>
                <span>{active.length} invoice{active.length !== 1 ? 's' : ''}{cancelledCount > 0 ? ` (+ ${cancelledCount} cancelled)` : ''}</span>
                <span>Total gross: <strong style={{ color: tokens.colorNeutralForeground1 }}>{formatMoney(active.reduce((sum, i) => sum + (i.cr9b5_totalgross ?? 0), 0))}</strong></span>
              </>
            )
          })()}
        </div>
      )}

      {formOpen && (
        <InvoiceForm
          invoice={editInvoice} properties={properties} contacts={contacts}
          onSaved={record => { setFormOpen(false); if (record) upsertInvoiceLocal(record); else loadInvoices() }}
          onClose={() => setFormOpen(false)}
        />
      )}
      {viewInvoice && (
        <InvoiceForm invoice={viewInvoice} properties={properties} contacts={contacts} readOnly onSaved={() => undefined} onClose={() => setViewInvoice(null)} />
      )}
      {importOpen && <InvoiceImport onClose={() => setImportOpen(false)} onImported={() => loadInvoices()} />}
      {exportOpen && <ExportConfigModal rowCount={filtered.length} onExport={exportExcel} onClose={() => setExportOpen(false)} />}
    </div>
  )
}
