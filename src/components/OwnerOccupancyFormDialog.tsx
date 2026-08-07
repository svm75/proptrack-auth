import { useEffect, useState } from 'react'
import {
  tokens, Button, Input, Field, Select, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'
import { Svm_pt_owneroccupanciesService } from '@/generated/services/Svm_pt_owneroccupanciesService'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import type { Svm_pt_owneroccupancies } from '@/generated/models/Svm_pt_owneroccupanciesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import { nightsOverlap } from '@/domain/dateRanges'
import { logActivity } from '@/services/activitylog'

const TYPE_OUTGOING = 233100001 // Income (guest booking)

interface OccForm {
  id: string | null; propertyId: string; fromDate: string; toDate: string
  adults: string; children: string; babies: string
}

function emptyForm(defaultPropertyId?: string): OccForm {
  return { id: null, propertyId: defaultPropertyId ?? '', fromDate: '', toDate: '', adults: '', children: '', babies: '' }
}
function toForm(r: Svm_pt_owneroccupancies): OccForm {
  const raw = r as unknown as Record<string, unknown>
  return {
    id: r.svm_pt_owneroccupancyid,
    propertyId: (raw['_svm_pt_property_value'] as string) ?? '',
    fromDate: r.svm_pt_fromdate?.slice(0, 10) ?? '',
    toDate: r.svm_pt_todate?.slice(0, 10) ?? '',
    adults: r.svm_pt_adults?.toString() ?? '',
    children: r.svm_pt_children?.toString() ?? '',
    babies: r.svm_pt_babies?.toString() ?? '',
  }
}

export interface OwnerOccupancyFormDialogProps {
  record: Svm_pt_owneroccupancies | null
  properties: Cr9b5_pt_properties[]
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
      const [invRes, occRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({
          filter: `_cr9b5_property_value eq '${form.propertyId}' and cr9b5_type eq ${TYPE_OUTGOING} and statecode eq 0`,
          select: ['cr9b5_internalid', 'cr9b5_checkin', 'cr9b5_checkout'],
        }),
        Svm_pt_owneroccupanciesService.getAll({ filter: `_svm_pt_property_value eq '${form.propertyId}'` }),
      ])
      if (cancelled) return
      const found: string[] = []
      for (const inv of invRes.data ?? []) {
        if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) continue
        if (nightsOverlap(form.fromDate, form.toDate, inv.cr9b5_checkin, inv.cr9b5_checkout)) {
          found.push(`Overlaps guest booking ${inv.cr9b5_internalid ?? '(no internal ID)'}`)
        }
      }
      for (const occ of occRes.data ?? []) {
        if (occ.svm_pt_owneroccupancyid === form.id) continue
        if (!occ.svm_pt_fromdate || !occ.svm_pt_todate) continue
        if (nightsOverlap(form.fromDate, form.toDate, occ.svm_pt_fromdate, occ.svm_pt_todate)) {
          found.push(`Overlaps another owner occupancy block (${occ.svm_pt_fromdate.slice(0, 10)} – ${occ.svm_pt_todate.slice(0, 10)})`)
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
      const propertyName = properties.find(p => p.cr9b5_pt_propertyid === form.propertyId)?.cr9b5_name ?? ''
      const payload = {
        svm_pt_name: `${propertyName} ${form.fromDate} – ${form.toDate}`,
        'svm_pt_Property@odata.bind': `/cr9b5_pt_properties(${form.propertyId})`,
        svm_pt_fromdate: form.fromDate,
        svm_pt_todate: form.toDate,
        svm_pt_adults: form.adults !== '' ? parseInt(form.adults, 10) : undefined,
        svm_pt_children: form.children !== '' ? parseInt(form.children, 10) : undefined,
        svm_pt_babies: form.babies !== '' ? parseInt(form.babies, 10) : undefined,
      }
      if (form.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Svm_pt_owneroccupanciesService.update(form.id, payload as any)
        await logActivity('Updated', 'Property', payload.svm_pt_name)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Svm_pt_owneroccupanciesService.create(payload as any)
        await logActivity('Created', 'Property', payload.svm_pt_name)
      }
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
      await Svm_pt_owneroccupanciesService.delete(form.id)
      await logActivity('Deleted', 'Property', record?.svm_pt_name ?? '')
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
                {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
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
