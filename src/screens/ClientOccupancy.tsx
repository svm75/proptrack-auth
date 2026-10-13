import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { makeStyles, tokens, Button, Text, Spinner } from '@fluentui/react-components'
import { useInvoices, useProperties, useContacts, useUpdateInvoice } from '@/hooks/data'
import type { Invoice, NewInvoice } from '@/domain/types'
import { InvoiceType, ContactRole } from '@/domain/types'
import { logActivity } from '@/services/activitylog'
import { useUnsavedChangesGuard } from '@/app/unsavedChangesContext'

const TYPE_INCOME = InvoiceType.Income // guest booking ("Income")
const ROLE_CLIENT = ContactRole.Client

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: '640px', display: 'block' },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1400px' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '10px 10px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase', whiteSpace: 'nowrap' },
  thSortable: { cursor: 'pointer', userSelect: 'none' },
  filters: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  filterLabel: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
  td: { padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  input: { border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, padding: '6px 8px', fontSize: '14px', width: '100%', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  footer: { padding: '14px 24px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, display: 'flex', alignItems: 'center', gap: '16px' },
  empty: { textAlign: 'center', padding: '48px', color: tokens.colorNeutralForeground4 },
})

interface Row {
  id: string
  propertyId: string
  checkin: string   // yyyy-mm-dd
  checkout: string  // yyyy-mm-dd
  nights: string
  days: string
  contactId: string
  baseAmount: string
  taxAmount: string
  totalAmount: string
  adults: string
  children: string
  babies: string
  bookingRef: string
}

function isoToInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}
function inputToIso(val: string): string | undefined {
  return val ? new Date(`${val}T12:00:00`).toISOString() : undefined
}
function numToStr(n: number | undefined): string {
  return n == null ? '' : String(n)
}
function toRow(inv: Invoice): Row {
  return {
    id: inv.id,
    propertyId: inv.propertyId ?? '',
    checkin: isoToInput(inv.checkIn),
    checkout: isoToInput(inv.checkOut),
    nights: numToStr(inv.nights),
    days: numToStr(inv.days),
    contactId: inv.contactId ?? '',
    baseAmount: numToStr(inv.baseAmount),
    taxAmount: numToStr(inv.taxAmount),
    totalAmount: numToStr(inv.totalGross),
    adults: numToStr(inv.adults),
    children: numToStr(inv.children),
    babies: numToStr(inv.babies),
    bookingRef: inv.bookingReference ?? '',
  }
}

const FIELD_KEYS: (keyof Row)[] = [
  'propertyId', 'checkin', 'checkout', 'nights', 'days', 'contactId',
  'baseAmount', 'taxAmount', 'totalAmount', 'adults', 'children', 'babies', 'bookingRef',
]

type SortKey = 'property' | 'checkin' | 'checkout' | 'nights' | 'days' | 'contact' | 'baseAmount' | 'taxAmount' | 'totalAmount' | 'adults' | 'children' | 'babies' | 'bookingRef'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'property', label: 'Property' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'checkout', label: 'Check-out' },
  { key: 'nights', label: 'Nights' },
  { key: 'days', label: 'Days' },
  { key: 'contact', label: 'Contact' },
  { key: 'baseAmount', label: 'Base Amount' },
  { key: 'taxAmount', label: 'Tax Amount' },
  { key: 'totalAmount', label: 'Total Amount' },
  { key: 'adults', label: 'Adults' },
  { key: 'children', label: 'Children' },
  { key: 'babies', label: 'Babies' },
  { key: 'bookingRef', label: 'Booking Reference' },
]

const NUMERIC_SORT_KEYS = new Set<SortKey>(['nights', 'days', 'baseAmount', 'taxAmount', 'totalAmount', 'adults', 'children', 'babies'])

export default function ClientOccupancy() {
  const s = useStyles()
  const { data: allInvoices = [], isLoading: loadingInv, refetch: refetchInvoices } = useInvoices()
  const { data: properties = [], isLoading: loadingProps } = useProperties()
  const { data: allContacts = [], isLoading: loadingContacts } = useContacts()
  const updateInvoice = useUpdateInvoice()
  const loading = loadingInv || loadingProps || loadingContacts

  const contacts = useMemo(() => allContacts.filter(c => c.role === ROLE_CLIENT), [allContacts])

  const [rows, setRows] = useState<Row[]>([])
  const [originals, setOriginals] = useState<Record<string, Row>>({})
  const [rowsInitialized, setRowsInitialized] = useState(false)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterCheckinFrom, setFilterCheckinFrom] = useState('')
  const [filterCheckinTo, setFilterCheckinTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('checkin')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function seedRows(invoices: Invoice[]) {
    const newRows = invoices.filter(inv => !inv.cancelled && inv.type === TYPE_INCOME).map(toRow)
    setRows(newRows)
    setOriginals(Object.fromEntries(newRows.map(r => [r.id, r])))
    setRowsInitialized(true)
  }

  useEffect(() => {
    if (loading || rowsInitialized) return
    seedRows(allInvoices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rowsInitialized])

  async function load() {
    const res = await refetchInvoices()
    seedRows(res.data ?? [])
  }

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of rows) {
      const orig = originals[r.id]
      if (!orig) continue
      if (FIELD_KEYS.some(k => r[k] !== orig[k])) ids.add(r.id)
    }
    return ids
  }, [rows, originals])

  const isDirty = dirtyIds.size > 0

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    setSummary(null); setError(null)
  }
  function isChanged(id: string, key: keyof Row): boolean {
    const orig = originals[id]
    if (!orig) return false
    const cur = rows.find(r => r.id === id)
    return !!cur && cur[key] !== orig[key]
  }

  function resetAll() {
    setRows(Object.values(originals).sort((a, b) => (b.checkin || '').localeCompare(a.checkin || '')))
    setSummary(null); setError(null)
  }

  async function saveAll(): Promise<boolean> {
    if (dirtyIds.size === 0) return true
    setSaving(true); setError(null); setSummary(null)
    try {
      for (const id of dirtyIds) {
        const row = rows.find(r => r.id === id)
        if (!row) continue
        const base = parseFloat(row.baseAmount) || 0
        const tax = parseFloat(row.taxAmount) || 0
        const total = row.totalAmount !== '' ? (parseFloat(row.totalAmount) || 0) : base + tax
        const patch: Partial<NewInvoice> = {
          checkIn: inputToIso(row.checkin),
          checkOut: inputToIso(row.checkout),
          nights: row.nights === '' ? undefined : parseInt(row.nights, 10),
          days: row.days === '' ? undefined : parseInt(row.days, 10),
          baseAmount: base,
          taxAmount: tax,
          totalGross: total,
          adults: row.adults === '' ? undefined : parseInt(row.adults, 10),
          children: row.children === '' ? undefined : parseInt(row.children, 10),
          babies: row.babies === '' ? undefined : parseInt(row.babies, 10),
          bookingReference: row.bookingRef || undefined,
          ...(row.propertyId ? { propertyId: row.propertyId } : {}),
          ...(row.contactId ? { contactId: row.contactId } : {}),
        }
        await updateInvoice.mutateAsync({ id, patch })
        await logActivity('Updated', 'Invoice', row.bookingRef || id, 'Client Occupancy edit')
      }
      await load()
      setSummary(`${dirtyIds.size} booking${dirtyIds.size !== 1 ? 's' : ''} saved.`)
      setSaving(false)
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.')
      setSaving(false)
      return false
    }
  }

  useUnsavedChangesGuard({
    dirty: isDirty,
    onSave: saveAll,
    onReset: resetAll,
  })

  function changedStyle(id: string, key: keyof Row): CSSProperties | undefined {
    return isChanged(id, key)
      ? { backgroundColor: tokens.colorPaletteRedBackground1, borderColor: tokens.colorPaletteRedBorder1 }
      : undefined
  }

  function propertyName(id: string): string {
    return properties.find(p => p.id === id)?.name ?? ''
  }
  function contactName(id: string): string {
    return contacts.find(c => c.id === id)?.name ?? ''
  }

  const displayRows = useMemo(() => {
    let filtered = rows
    if (filterPropertyId) filtered = filtered.filter(r => r.propertyId === filterPropertyId)
    if (filterCheckinFrom) filtered = filtered.filter(r => r.checkin && r.checkin >= filterCheckinFrom)
    if (filterCheckinTo) filtered = filtered.filter(r => r.checkin && r.checkin <= filterCheckinTo)

    function sortValue(row: Row): string | number {
      switch (sortKey) {
        case 'property': return propertyName(row.propertyId).toLowerCase()
        case 'contact': return contactName(row.contactId).toLowerCase()
        case 'checkin': return row.checkin || ''
        case 'checkout': return row.checkout || ''
        case 'bookingRef': return row.bookingRef.toLowerCase()
        default: return NUMERIC_SORT_KEYS.has(sortKey) ? (parseFloat(row[sortKey]) || 0) : ''
      }
    }
    const sorted = [...filtered].sort((a, b) => {
      const va = sortValue(a); const vb = sortValue(b)
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, properties, contacts, filterPropertyId, filterCheckinFrom, filterCheckinTo, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  function sortIndicator(key: SortKey): string {
    return sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  if (loading) return <Spinner label="Loading…" style={{ padding: '24px' }} />

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <Text size={600} weight="semibold" style={{ display: 'block' }}>Client Occupancy</Text>
          <Text className={s.intro} size={200}>
            Guest bookings, editable in place. Changed fields are highlighted until saved. Click a column header to sort.
          </Text>
        </div>
        <div className={s.filters}>
          <span className={s.filterLabel}>Property</span>
          <select className={s.input} style={{ width: '180px' }} value={filterPropertyId} onChange={e => setFilterPropertyId(e.target.value)}>
            <option value="">All properties</option>
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className={s.filterLabel}>Check-in from</span>
          <input type="date" className={s.input} style={{ width: '150px' }} value={filterCheckinFrom} onChange={e => setFilterCheckinFrom(e.target.value)} />
          <span className={s.filterLabel}>to</span>
          <input type="date" className={s.input} style={{ width: '150px' }} value={filterCheckinTo} onChange={e => setFilterCheckinTo(e.target.value)} />
          {(filterPropertyId || filterCheckinFrom || filterCheckinTo) && (
            <Button appearance="subtle" size="small" onClick={() => { setFilterPropertyId(''); setFilterCheckinFrom(''); setFilterCheckinTo('') }}>Clear filters</Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={s.empty}>No client bookings recorded yet.</div>
      ) : displayRows.length === 0 ? (
        <div className={s.empty}>No bookings match the current filters.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.key} className={`${s.th} ${s.thSortable}`} onClick={() => toggleSort(col.key)}>
                    {col.label}{sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => (
                <tr key={row.id}>
                  <td className={s.td}>
                    <select className={s.input} style={changedStyle(row.id, 'propertyId')} value={row.propertyId} onChange={e => updateRow(row.id, { propertyId: e.target.value })}>
                      <option value="">Select property…</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className={s.td}><input type="date" className={s.input} style={changedStyle(row.id, 'checkin')} value={row.checkin} onChange={e => updateRow(row.id, { checkin: e.target.value })} /></td>
                  <td className={s.td}><input type="date" className={s.input} style={changedStyle(row.id, 'checkout')} value={row.checkout} onChange={e => updateRow(row.id, { checkout: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '70px', ...changedStyle(row.id, 'nights') }} value={row.nights} onChange={e => updateRow(row.id, { nights: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '70px', ...changedStyle(row.id, 'days') }} value={row.days} onChange={e => updateRow(row.id, { days: e.target.value })} /></td>
                  <td className={s.td}>
                    <select className={s.input} style={changedStyle(row.id, 'contactId')} value={row.contactId} onChange={e => updateRow(row.id, { contactId: e.target.value })}>
                      <option value="">Select contact…</option>
                      {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className={s.td}><input type="number" step="0.01" className={s.input} style={{ width: '100px', textAlign: 'right', ...changedStyle(row.id, 'baseAmount') }} value={row.baseAmount} onChange={e => updateRow(row.id, { baseAmount: e.target.value })} /></td>
                  <td className={s.td}><input type="number" step="0.01" className={s.input} style={{ width: '100px', textAlign: 'right', ...changedStyle(row.id, 'taxAmount') }} value={row.taxAmount} onChange={e => updateRow(row.id, { taxAmount: e.target.value })} /></td>
                  <td className={s.td}><input type="number" step="0.01" className={s.input} style={{ width: '100px', textAlign: 'right', ...changedStyle(row.id, 'totalAmount') }} value={row.totalAmount} onChange={e => updateRow(row.id, { totalAmount: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '64px', ...changedStyle(row.id, 'adults') }} value={row.adults} onChange={e => updateRow(row.id, { adults: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '64px', ...changedStyle(row.id, 'children') }} value={row.children} onChange={e => updateRow(row.id, { children: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '64px', ...changedStyle(row.id, 'babies') }} value={row.babies} onChange={e => updateRow(row.id, { babies: e.target.value })} /></td>
                  <td className={s.td}><input className={s.input} style={{ width: '140px', ...changedStyle(row.id, 'bookingRef') }} value={row.bookingRef} onChange={e => updateRow(row.id, { bookingRef: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={s.footer}>
        <Button appearance="primary" disabled={saving || !isDirty} onClick={saveAll}>
          {saving ? 'Saving…' : `Save Changes${dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ''}`}
        </Button>
        <Button appearance="secondary" disabled={saving || !isDirty} onClick={resetAll}>Reset</Button>
        {summary && <Text style={{ color: tokens.colorPaletteGreenForeground1, fontWeight: 600 }}>✓ {summary}</Text>}
        {error && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>}
      </div>
    </div>
  )
}
