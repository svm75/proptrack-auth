import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  makeStyles, tokens, Button, Input, Select, Text, Spinner, Badge, Checkbox,
} from '@fluentui/react-components'
import { useProperties, useContacts, useCategories, useInvoices, useUpdateInvoice, useCancelInvoice } from '@/hooks/data'
import type { Property, Contact, Invoice } from '@/domain/types'
import { CategoryType } from '@/domain/types'
import InvoiceForm from './InvoiceForm'
import InvoiceImport from './InvoiceImport'
import ExportConfigModal from './ExportConfigModal'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'

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
  thSortBtn: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, font: 'inherit', color: 'inherit', textTransform: 'inherit' },
  sortArrow: { fontSize: '10px', color: tokens.colorBrandForeground1 },
  td: { padding: '8px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  summary: { padding: '10px 24px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, display: 'flex', gap: '24px', fontSize: '14px', color: tokens.colorNeutralForeground2 },
})

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type SortField = 'date' | 'id' | 'type' | 'category' | 'property' | 'contact' | 'base' | 'taxRate' | 'taxAmount' | 'total'

export default function Invoices() {
  const s = useStyles()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: properties = [] } = useProperties()
  const { data: contacts = [] } = useContacts()
  const { data: allCategories = [] } = useCategories()
  const { data: invoices = [], isLoading: loading, refetch: refetchInvoices } = useInvoices()
  const updateInvoiceMutation = useUpdateInvoice()
  const cancelInvoiceMutation = useCancelInvoice()

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of allCategories) if (c.type === CategoryType.Income || c.type === CategoryType.Expense) map[c.id] = c.value
    return map
  }, [allCategories])
  const categoryList = useMemo(() =>
    allCategories
      .filter(c => c.type === CategoryType.Income || c.type === CategoryType.Expense)
      .map(c => ({ id: c.id, name: c.value }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkPropertyId, setBulkPropertyId] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all')
  const [filterPropId, setFilterPropId] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const [formOpen, setFormOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const [importOpen, setImportOpen]   = useState(false)
  const [exportOpen, setExportOpen]   = useState(false)

  // Reset selection whenever the underlying invoice list changes (mirrors the old
  // per-filter reload behavior, without needing server-side filtering).
  useEffect(() => { setSelectedIds(new Set()) }, [invoices])

  // Deep-link support from the global Quick Add menu / search (?new=1, ?search=...)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditInvoice(null)
      setFormOpen(true)
      setSearchParams(p => { p.delete('new'); return p }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const propertyById = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties])
  const contactById = useMemo(() => new Map(contacts.map(c => [c.id, c])), [contacts])

  function propName(inv: Invoice): string {
    return (inv.propertyId && propertyById.get(inv.propertyId)?.name) ?? '—'
  }
  function contactName(inv: Invoice): string {
    return (inv.contactId && contactById.get(inv.contactId)?.name) ?? '—'
  }
  function contactWithTax(inv: Invoice): string {
    const con = inv.contactId ? contactById.get(inv.contactId) : undefined
    if (!con) return '—'
    return con.taxId ? `${con.name} (${con.taxId})` : (con.name ?? '—')
  }
  function internalIdSortKey(id: string | undefined): number {
    if (!id) return 0
    const m = id.replace(/^(LV|TIAS)/i, '').match(/\d+/)
    return m ? parseInt(m[0], 10) : 0
  }

  function sortValue(inv: Invoice, field: SortField): string | number {
    switch (field) {
      case 'date': return inv.date ?? ''
      case 'id': return internalIdSortKey(inv.internalId)
      case 'type': return inv.type === TYPE_OUTGOING ? 'Income' : 'Expense'
      case 'category': return categoryMap[inv.categoryId ?? ''] ?? ''
      case 'property': return inv.allProperties ? 'All' : propName(inv)
      case 'contact': return contactName(inv)
      case 'base': return inv.baseAmount ?? 0
      case 'taxRate': return inv.taxIsManual ? -1 : parseFloat(inv.taxRate ?? '') || 0
      case 'taxAmount': return inv.taxAmount ?? 0
      case 'total': return inv.totalGross ?? 0
    }
  }

  const filtered = invoices.filter(inv => {
    if (filterType === 'income' && inv.type !== TYPE_OUTGOING) return false
    if (filterType === 'expense' && inv.type !== TYPE_INCOMING) return false
    if (filterPropId && inv.propertyId !== filterPropId) return false
    if (filterFrom && (!inv.date || inv.date < new Date(filterFrom).toISOString())) return false
    if (filterTo && (!inv.date || inv.date > new Date(filterTo + 'T23:59:59').toISOString())) return false
    if (search) {
      const q = search.toLowerCase()
      const haystack = [inv.internalId, inv.description, propName(inv), contactName(inv), inv.bookingReference].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }).sort((a, b) => {
    const av = sortValue(a, sortField), bv = sortValue(b, sortField)
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  function openNew() { setEditInvoice(null); setFormOpen(true) }

  function exportExcel(orderedColumns: string[]) {
    const fmtD = (iso: string | undefined) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` }
    const fmtN = (n: number | undefined) => n != null ? Number(n.toFixed(2)) : ''
    const allCols: Record<string, (inv: Invoice) => unknown> = {
      'Internal ID': inv => inv.internalId,
      'Type': inv => inv.type === TYPE_OUTGOING ? 'Income' : 'Expense',
      'Category': inv => categoryMap[inv.categoryId ?? ''] ?? '',
      'Property': inv => inv.allProperties ? 'All' : propName(inv),
      'All Properties': inv => inv.allProperties ? 'Yes' : 'No',
      'Contact': inv => contactWithTax(inv),
      'Contact (TaxID)': inv => contactWithTax(inv),
      'Date': inv => fmtD(inv.date),
      'Description': inv => inv.description ?? '',
      'Booking Ref': inv => inv.bookingReference ?? '',
      'Check-in': inv => fmtD(inv.checkIn),
      'Check-out': inv => fmtD(inv.checkOut),
      'Nights': inv => inv.nights ?? '',
      'Days': inv => inv.days ?? '',
      'Adults': inv => inv.adults ?? '',
      'Children': inv => inv.children ?? '',
      'Babies': inv => inv.babies ?? '',
      'Base Amount': inv => fmtN(inv.baseAmount),
      'Tax Rate': inv => inv.taxRate ?? '',
      'Tax Amount': inv => fmtN(inv.taxAmount),
      'Total Gross': inv => fmtN(inv.totalGross),
    }
    const rows = filtered.filter(inv => !inv.cancelled).map(inv => {
      const row: Record<string, unknown> = {}
      for (const col of orderedColumns) row[col] = allCols[col]?.(inv) ?? ''
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows, { header: orderedColumns })
    ws['!cols'] = orderedColumns.map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)) + 2 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    const from = filterFrom || (filtered.length ? filtered.reduce((m, i) => i.date && i.date < m ? i.date : m, filtered[0].date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const to = filterTo || (filtered.length ? filtered.reduce((m, i) => i.date && i.date > m ? i.date : m, filtered[0].date ?? '').slice(0,10).replace(/-/g,'') : 'all')
    const filename = `invoices_${from}to${to}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'invoices export', filename)
    setExportOpen(false)
  }

  function openEdit(inv: Invoice) { setEditInvoice(inv); setFormOpen(true) }

  async function cancelInvoice(inv: Invoice) {
    if (!confirm(`Cancel invoice ${inv.internalId}? This cannot be undone.`)) return
    await cancelInvoiceMutation.mutateAsync(inv.id)
    logActivity('Deleted', 'Invoice', inv.internalId ?? inv.id)
  }

  const [localInvoice, setLocalInvoice] = useState<Invoice | null>(null)
  function upsertInvoiceLocal(record: Invoice) {
    // The invoices list refetches via the mutation's onSuccess invalidation; this only
    // keeps the just-created/edited record available for the "view" dialog immediately.
    setLocalInvoice(record)
  }

  function toggleSelect(id: string) {
    setSelectedIds(sel => { const next = new Set(sel); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }
  const selectableIds = filtered.filter(inv => !inv.cancelled).map(inv => inv.id)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  function toggleSelectAll() { setSelectedIds(allSelected ? new Set() : new Set(selectableIds)) }

  async function applyBulkEdit() {
    if (!bulkCategoryId && !bulkPropertyId) return
    setBulkApplying(true)
    const ids = [...selectedIds]
    try {
      for (const id of ids) {
        const patch: Record<string, unknown> = {}
        if (bulkCategoryId) patch.categoryId = bulkCategoryId
        if (bulkPropertyId) { patch.propertyId = bulkPropertyId; patch.allProperties = false }
        await updateInvoiceMutation.mutateAsync({ id, patch })
      }
      const changed = [bulkCategoryId && 'category', bulkPropertyId && 'property'].filter(Boolean).join(' + ')
      logActivity('Updated', 'Invoice', `${ids.length} invoices`, `Bulk edit: ${changed}`)
      setSelectedIds(new Set()); setBulkCategoryId(''); setBulkPropertyId('')
      await refetchInvoices()
    } finally {
      setBulkApplying(false)
    }
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
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input type="date" value={filterFrom} onChange={(_, d) => setFilterFrom(d.value)} title="From date" />
          <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
          <Input type="date" value={filterTo} onChange={(_, d) => setFilterTo(d.value)} title="To date" />
          <Input type="search" value={search} onChange={(_, d) => setSearch(d.value)} placeholder="Search ID, description, contact…" style={{ minWidth: '220px' }} />
          {(filterType !== 'all' || filterPropId || filterFrom || filterTo || search || sortField !== 'date' || sortDir !== 'desc') && (
            <Button appearance="transparent" size="small" onClick={() => { setFilterType('all'); setFilterPropId(''); setFilterFrom(''); setFilterTo(''); setSearch(''); setSortField('date'); setSortDir('desc') }}>
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
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                {([
                  ['date', 'Date', undefined],
                  ['id', 'Internal ID', '92px'],
                  ['type', 'Type', undefined],
                  ['category', 'Category', undefined],
                  ['property', 'Property', undefined],
                  ['contact', 'Contact', undefined],
                  ['base', 'Base', undefined],
                  ['taxRate', 'Tax %', undefined],
                  ['taxAmount', 'Tax €', undefined],
                  ['total', 'Total Gross', undefined],
                ] as [SortField, string, string | undefined][]).map(([field, label, minWidth]) => (
                  <th key={field} className={s.th} style={minWidth ? { minWidth } : undefined}>
                    <button className={s.thSortBtn} onClick={() => toggleSort(field)}>
                      {label} {sortField === field && <span className={s.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                ))}
                <th className={s.th} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isOut = inv.type === TYPE_OUTGOING
                const cancelled = inv.cancelled
                return (
                  <tr key={inv.id} style={{ opacity: cancelled ? 0.6 : 1 }}>
                    <td className={s.td}>{!cancelled && <Checkbox checked={selectedIds.has(inv.id)} onChange={() => toggleSelect(inv.id)} />}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.date)}</td>
                    <td className={s.td} style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap' }}>
                      <a href="#" onClick={e => { e.preventDefault(); setViewInvoice(inv) }} style={{ color: cancelled ? tokens.colorNeutralForeground4 : tokens.colorBrandForegroundLink, textDecoration: cancelled ? 'line-through' : 'none' }}>{inv.internalId || '—'}</a>
                      {cancelled && <span style={{ marginLeft: 6, fontSize: '11px', color: tokens.colorPaletteRedForeground1, fontWeight: 400 }}>cancelled</span>}
                    </td>
                    <td className={s.td}><Badge appearance="tint" color={isOut ? 'success' : 'danger'}>{isOut ? 'Income' : 'Expense'}</Badge></td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap', color: tokens.colorNeutralForeground3, fontSize: '12px' }}>{categoryMap[inv.categoryId ?? ''] ?? '—'}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{inv.allProperties ? <Text weight="semibold" style={{ color: tokens.colorBrandForeground1, fontSize: '12px' }}>All</Text> : propName(inv)}</td>
                    <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{contactName(inv)}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(inv.baseAmount)}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{inv.taxIsManual ? <span style={{ color: tokens.colorPaletteMarigoldForeground1, fontSize: '12px', fontWeight: 600 }}>n/a</span> : (inv.taxRate ? `${inv.taxRate}%` : '—')}</td>
                    <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(inv.taxAmount)}</td>
                    <td className={s.td} style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(inv.totalGross)}</td>
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
            const active = filtered.filter(i => !i.cancelled)
            const cancelledCount = filtered.length - active.length
            return (
              <>
                <span>{active.length} invoice{active.length !== 1 ? 's' : ''}{cancelledCount > 0 ? ` (+ ${cancelledCount} cancelled)` : ''}</span>
                <span>Total gross: <strong style={{ color: tokens.colorNeutralForeground1 }}>{formatMoney(active.reduce((sum, i) => sum + (i.totalGross ?? 0), 0))}</strong></span>
              </>
            )
          })()}
        </div>
      )}

      {formOpen && (
        <InvoiceForm
          invoice={editInvoice} properties={properties as Property[]} contacts={contacts as Contact[]}
          onSaved={record => { setFormOpen(false); if (record) upsertInvoiceLocal(record); else refetchInvoices() }}
          onClose={() => setFormOpen(false)}
        />
      )}
      {viewInvoice && (
        <InvoiceForm invoice={localInvoice?.id === viewInvoice.id ? localInvoice : viewInvoice} properties={properties as Property[]} contacts={contacts as Contact[]} readOnly onSaved={() => undefined} onClose={() => { setViewInvoice(null); setLocalInvoice(null) }} />
      )}
      {importOpen && <InvoiceImport onClose={() => setImportOpen(false)} onImported={() => refetchInvoices()} />}
      {exportOpen && <ExportConfigModal rowCount={filtered.length} onExport={exportExcel} onClose={() => setExportOpen(false)} />}
    </div>
  )
}
