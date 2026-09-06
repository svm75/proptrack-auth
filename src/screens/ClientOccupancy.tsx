import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { makeStyles, tokens, Button, Text, Spinner } from '@fluentui/react-components'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_invoices, Cr9b5_pt_invoicesBase } from '@/generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import { logActivity } from '@/services/activitylog'
import { useUnsavedChangesGuard } from '@/app/unsavedChangesContext'

const TYPE_INCOME = 233100001 // guest booking ("Income")
const ROLE_CLIENT = 233100001

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: '640px', display: 'block' },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '1400px' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '10px 10px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase', whiteSpace: 'nowrap' },
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
function toRow(inv: Cr9b5_pt_invoices): Row {
  const raw = inv as unknown as Record<string, unknown>
  return {
    id: inv.cr9b5_pt_invoiceid,
    propertyId: (raw['_cr9b5_property_value'] as string) ?? '',
    checkin: isoToInput(inv.cr9b5_checkin),
    checkout: isoToInput(inv.cr9b5_checkout),
    nights: numToStr(inv.cr9b5_nights),
    days: numToStr(inv.cr9b5_days),
    contactId: (raw['_cr9b5_contact_value'] as string) ?? '',
    baseAmount: numToStr(inv.cr9b5_baseamount),
    taxAmount: numToStr(inv.cr9b5_taxamount),
    totalAmount: numToStr(inv.cr9b5_totalgross),
    adults: numToStr(inv.cr9b5_adults),
    children: numToStr(inv.cr9b5_children),
    babies: numToStr(inv.cr9b5_babies),
    bookingRef: inv.cr9b5_bookingreference ?? '',
  }
}

const FIELD_KEYS: (keyof Row)[] = [
  'propertyId', 'checkin', 'checkout', 'nights', 'days', 'contactId',
  'baseAmount', 'taxAmount', 'totalAmount', 'adults', 'children', 'babies', 'bookingRef',
]

export default function ClientOccupancy() {
  const s = useStyles()
  const [rows, setRows] = useState<Row[]>([])
  const [originals, setOriginals] = useState<Record<string, Row>>({})
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [invRes, propRes, contactRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ filter: `cr9b5_type eq ${TYPE_INCOME}`, orderBy: ['cr9b5_checkin desc'], maxPageSize: 5000 }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ filter: `cr9b5_role eq ${ROLE_CLIENT}`, orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
      ])
      const newRows = (invRes.data ?? []).map(toRow)
      setRows(newRows)
      setOriginals(Object.fromEntries(newRows.map(r => [r.id, r])))
      setProperties(propRes.data ?? [])
      setContacts(contactRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

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
        const payload: Partial<Cr9b5_pt_invoicesBase> & Record<string, unknown> = {
          cr9b5_checkin: inputToIso(row.checkin),
          cr9b5_checkout: inputToIso(row.checkout),
          cr9b5_nights: row.nights === '' ? undefined : parseInt(row.nights, 10),
          cr9b5_days: row.days === '' ? undefined : parseInt(row.days, 10),
          cr9b5_baseamount: base,
          cr9b5_taxamount: tax,
          cr9b5_totalgross: total,
          cr9b5_adults: row.adults === '' ? undefined : parseInt(row.adults, 10),
          cr9b5_children: row.children === '' ? undefined : parseInt(row.children, 10),
          cr9b5_babies: row.babies === '' ? undefined : parseInt(row.babies, 10),
          cr9b5_bookingreference: row.bookingRef || undefined,
        }
        if (row.propertyId) payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${row.propertyId})`
        if (row.contactId) payload['cr9b5_Contact@odata.bind'] = `/cr9b5_pt_contacts(${row.contactId})`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await Cr9b5_pt_invoicesService.update(id, payload as any)
        if (!result.success) throw (result.error as Error) ?? new Error('Failed to save a booking.')
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

  if (loading) return <Spinner label="Loading…" style={{ padding: '24px' }} />

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <Text size={600} weight="semibold" style={{ display: 'block' }}>Client Occupancy</Text>
          <Text className={s.intro} size={200}>
            Guest bookings, editable in place. Changed fields are highlighted until saved.
          </Text>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={s.empty}>No client bookings recorded yet.</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Property</th>
                <th className={s.th}>Check-in</th>
                <th className={s.th}>Check-out</th>
                <th className={s.th}>Nights</th>
                <th className={s.th}>Days</th>
                <th className={s.th}>Contact</th>
                <th className={s.th}>Base Amount</th>
                <th className={s.th}>Tax Amount</th>
                <th className={s.th}>Total Amount</th>
                <th className={s.th}>Adults</th>
                <th className={s.th}>Children</th>
                <th className={s.th}>Babies</th>
                <th className={s.th}>Booking Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className={s.td}>
                    <select className={s.input} style={changedStyle(row.id, 'propertyId')} value={row.propertyId} onChange={e => updateRow(row.id, { propertyId: e.target.value })}>
                      <option value="">Select property…</option>
                      {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
                    </select>
                  </td>
                  <td className={s.td}><input type="date" className={s.input} style={changedStyle(row.id, 'checkin')} value={row.checkin} onChange={e => updateRow(row.id, { checkin: e.target.value })} /></td>
                  <td className={s.td}><input type="date" className={s.input} style={changedStyle(row.id, 'checkout')} value={row.checkout} onChange={e => updateRow(row.id, { checkout: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '70px', ...changedStyle(row.id, 'nights') }} value={row.nights} onChange={e => updateRow(row.id, { nights: e.target.value })} /></td>
                  <td className={s.td}><input type="number" min={0} className={s.input} style={{ width: '70px', ...changedStyle(row.id, 'days') }} value={row.days} onChange={e => updateRow(row.id, { days: e.target.value })} /></td>
                  <td className={s.td}>
                    <select className={s.input} style={changedStyle(row.id, 'contactId')} value={row.contactId} onChange={e => updateRow(row.id, { contactId: e.target.value })}>
                      <option value="">Select contact…</option>
                      {contacts.map(c => <option key={c.cr9b5_pt_contactid} value={c.cr9b5_pt_contactid}>{c.cr9b5_name}</option>)}
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
