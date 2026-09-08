import { useEffect, useState } from 'react'
import {
  tokens, Button, Input, Field, Select, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'
import { repositories as repo } from '@/data'
import { InvoiceType } from '@/domain/types'
import type { Property, OwnerOccupancy } from '@/domain/types'
import { nightsOverlap } from '@/domain/dateRanges'
import { logActivity } from '@/services/activitylog'

interface OccForm {
  id: string | null; propertyId: string; fromDate: string; toDate: string
  adults: string; children: string; babies: string
}

function emptyForm(defaultPropertyId?: string): OccForm {
  return { id: null, propertyId: defaultPropertyId ?? '', fromDate: '', toDate: '', adults: '', children: '', babies: '' }
}
function toForm(r: OwnerOccupancy): OccForm {
  return {
    id: r.id,
    propertyId: r.propertyId,
    fromDate: r.fromDate?.slice(0, 10) ?? '',
    toDate: r.toDate?.slice(0, 10) ?? '',
    adults: r.adults?.toString() ?? '',
    children: r.children?.toString() ?? '',
    babies: r.babies?.toString() ?? '',
  }
}

export interface OwnerOccupancyFormDialogProps {
  record: OwnerOccupancy | null
  properties: Property[]
  defaultPropertyId?: string
  onSaved: () => void
  onClose: () => void
  onDeleted?: () => void
}

export function OwnerOccupancyFormDialog({ record, properties, defaultPropertyId, onSaved, onClose, onDeleted }: OwnerOccupancyFormDialogProps) {
  const [form, setForm] = useState<OccForm>(() => record ? toForm(record) : emptyForm(defaultPropertyId))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  // Non-blocking conflict check against guest bookings and other owner blocks
  // for the same property whenever the relevant fields change.
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!form.propertyId || !form.fromDate || !form.toDate) { setWarnings([]); return }
      const [allInvoices, allOccupancies] = await Promise.all([
        repo.invoices.list(),
        repo.ownerOccupancies.list(),
      ])
      if (cancelled) return
      const found: string[] = []
      for (const inv of allInvoices) {
        if (inv.cancelled) continue
        if (inv.type !== InvoiceType.Income) continue
        if (inv.propertyId !== form.propertyId) continue
        if (!inv.checkIn || !inv.checkOut) continue
        if (nightsOverlap(form.fromDate, form.toDate, inv.checkIn, inv.checkOut)) {
          found.push(`Overlaps guest booking ${inv.internalId || '(no internal ID)'}`)
        }
      }
      for (const occ of allOccupancies) {
        if (occ.propertyId !== form.propertyId) continue
        if (occ.id === form.id) continue
        if (!occ.fromDate || !occ.toDate) continue
        if (nightsOverlap(form.fromDate, form.toDate, occ.fromDate, occ.toDate)) {
          found.push(`Overlaps another owner occupancy block (${occ.fromDate.slice(0, 10)} – ${occ.toDate.slice(0, 10)})`)
        }
      }
      if (!cancelled) setWarnings(found)
    }
    check()
    return () => { cancelled = true }
  }, [form.propertyId, form.fromDate, form.toDate, form.id])

  function closeForm() { setFormError(''); onClose() }

  async function save() {
    setFormError('')
    if (!form.propertyId) { setFormError('Property is required.'); return }
    if (!form.fromDate) { setFormError('From date is required.'); return }
    if (!form.toDate) { setFormError('To date is required.'); return }
    if (form.toDate < form.fromDate) { setFormError('To date must be on or after the from date.'); return }
    setSaving(true)
    try {
      const propertyName = properties.find(p => p.id === form.propertyId)?.name ?? ''
      const name = `${propertyName} ${form.fromDate} – ${form.toDate}`
      const payload: OwnerOccupancy | Omit<OwnerOccupancy, 'id'> = {
        ...(form.id ? { id: form.id } : {}),
        name,
        propertyId: form.propertyId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        adults: form.adults !== '' ? parseInt(form.adults, 10) : undefined,
        children: form.children !== '' ? parseInt(form.children, 10) : undefined,
        babies: form.babies !== '' ? parseInt(form.babies, 10) : undefined,
      } as OwnerOccupancy | Omit<OwnerOccupancy, 'id'>
      await repo.ownerOccupancies.save(payload)
      await logActivity(form.id ? 'Updated' : 'Created', 'Property', name)
      onSaved()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecord() {
    if (!form.id || !confirm('Delete this owner occupancy block?')) return
    setDeleting(true)
    try {
      await repo.ownerOccupancies.remove(form.id)
      await logActivity('Deleted', 'Property', record?.name ?? '')
      onDeleted?.()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && closeForm()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{form.id ? 'Edit Owner Occupancy' : 'New Owner Occupancy'}</DialogTitle>
          <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {formError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{formError}</Text>}
            {warnings.length > 0 && (
              <div style={{ backgroundColor: tokens.colorPaletteMarigoldBackground1, border: `1px solid ${tokens.colorPaletteMarigoldBorder1}`, borderRadius: tokens.borderRadiusMedium, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Text weight="semibold" size={200} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>⚠ Possible conflicts (not blocking):</Text>
                {warnings.map((w, i) => <Text key={i} size={200} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>{w}</Text>)}
              </div>
            )}
            <Field label="Property" required>
              <Select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                <option value="">— Select —</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Field label="From Date" required>
                <Input type="date" value={form.fromDate} onChange={(_, d) => setForm(f => ({ ...f, fromDate: d.value }))} />
              </Field>
              <Field label="To Date" required>
                <Input type="date" value={form.toDate} onChange={(_, d) => setForm(f => ({ ...f, toDate: d.value }))} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <Field label="Adults"><Input type="number" min={0} value={form.adults} onChange={(_, d) => setForm(f => ({ ...f, adults: d.value }))} placeholder="0" /></Field>
              <Field label="Children"><Input type="number" min={0} value={form.children} onChange={(_, d) => setForm(f => ({ ...f, children: d.value }))} placeholder="0" /></Field>
              <Field label="Babies"><Input type="number" min={0} value={form.babies} onChange={(_, d) => setForm(f => ({ ...f, babies: d.value }))} placeholder="0" /></Field>
            </div>
          </DialogContent>
          <DialogActions>
            {form.id && onDeleted && (
              <Button appearance="secondary" disabled={saving || deleting} onClick={deleteRecord} style={{ marginRight: 'auto', color: tokens.colorPaletteRedForeground1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
            <Button appearance="secondary" disabled={saving || deleting} onClick={closeForm}>Cancel</Button>
            <Button appearance="primary" disabled={saving || deleting} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
