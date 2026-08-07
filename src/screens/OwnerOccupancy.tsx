import { useEffect, useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Field, Select, Text, Spinner,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import { Svm_pt_owneroccupanciesService } from '@/generated/services/Svm_pt_owneroccupanciesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import type { Svm_pt_owneroccupancies } from '@/generated/models/Svm_pt_owneroccupanciesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function nightsBetween(fromIso: string | undefined, toIso: string | undefined): number {
  if (!fromIso || !toIso) return 0
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000))
}

interface OccForm {
  id: string | null; propertyId: string; fromDate: string; toDate: string
  adults: string; children: string; babies: string
}
function emptyForm(): OccForm {
  return { id: null, propertyId: '', fromDate: '', toDate: '', adults: '', children: '', babies: '' }
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

const useStyles = makeStyles({
  root: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: '640px' },
  tableWrap: { borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, overflowX: 'auto' },
  empty: { textAlign: 'center', padding: '48px', color: tokens.colorNeutralForeground4 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' },
})

export default function OwnerOccupancy() {
  const s = useStyles()
  const [records, setRecords] = useState<Svm_pt_owneroccupancies[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<OccForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<Svm_pt_owneroccupancies | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [occRes, propRes] = await Promise.all([
        Svm_pt_owneroccupanciesService.getAll({ orderBy: ['svm_pt_fromdate desc'] }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      ])
      setRecords(occRes.data ?? [])
      setProperties(propRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  function propertyName(id: string): string {
    return properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? '—'
  }

  function openNew() { setForm(emptyForm()); setFormError(''); setFormOpen(true) }
  function openEdit(r: Svm_pt_owneroccupancies) { setForm(toForm(r)); setFormError(''); setFormOpen(true) }
  function closeForm() { setFormOpen(false); setFormError('') }

  async function save() {
    setFormError('')
    if (!form.propertyId) { setFormError('Property is required.'); return }
    if (!form.fromDate) { setFormError('From date is required.'); return }
    if (!form.toDate) { setFormError('To date is required.'); return }
    if (form.toDate < form.fromDate) { setFormError('To date must be on or after the from date.'); return }
    setSaving(true)
    try {
      const propertyName_ = properties.find(p => p.cr9b5_pt_propertyid === form.propertyId)?.cr9b5_name ?? ''
      const payload = {
        svm_pt_name: `${propertyName_} ${form.fromDate} – ${form.toDate}`,
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
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Svm_pt_owneroccupanciesService.create(payload as any)
      }
      await loadAll()
      closeForm()
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await Svm_pt_owneroccupanciesService.delete(deleteTarget.svm_pt_owneroccupancyid)
    setDeleteTarget(null)
    await loadAll()
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <Text size={600} weight="semibold">Owner Occupancy</Text>
          <Text className={s.intro} block>
            Log periods when a property is blocked for the owner's own use rather than rented out. These nights
            are excluded from the "excl. owner occupancy" figure shown alongside occupancy percentages elsewhere in the app.
          </Text>
        </div>
        <Button appearance="primary" onClick={openNew}>+ Add Block</Button>
      </div>

      {loading ? <Spinner label="Loading…" /> : records.length === 0 ? (
        <div className={s.tableWrap}><div className={s.empty}>No owner occupancy blocks recorded yet.</div></div>
      ) : (
        <div className={s.tableWrap}>
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Property</TableHeaderCell>
                <TableHeaderCell>From</TableHeaderCell>
                <TableHeaderCell>To</TableHeaderCell>
                <TableHeaderCell>Nights</TableHeaderCell>
                <TableHeaderCell>Adults</TableHeaderCell>
                <TableHeaderCell>Children</TableHeaderCell>
                <TableHeaderCell>Babies</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map(r => {
                const raw = r as unknown as Record<string, unknown>
                const propId = (raw['_svm_pt_property_value'] as string) ?? ''
                return (
                  <TableRow key={r.svm_pt_owneroccupancyid}>
                    <TableCell>{propertyName(propId)}</TableCell>
                    <TableCell>{fmtDate(r.svm_pt_fromdate)}</TableCell>
                    <TableCell>{fmtDate(r.svm_pt_todate)}</TableCell>
                    <TableCell>{nightsBetween(r.svm_pt_fromdate, r.svm_pt_todate)}</TableCell>
                    <TableCell>{r.svm_pt_adults ?? '—'}</TableCell>
                    <TableCell>{r.svm_pt_children ?? '—'}</TableCell>
                    <TableCell>{r.svm_pt_babies ?? '—'}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button size="small" appearance="subtle" onClick={() => openEdit(r)}>Edit</Button>
                        <Button size="small" appearance="subtle" onClick={() => setDeleteTarget(r)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(_, d) => !d.open && closeForm()}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{form.id ? 'Edit Owner Occupancy' : 'New Owner Occupancy'}</DialogTitle>
            <DialogContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{formError}</Text>}
              <Field label="Property" required>
                <Select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
                </Select>
              </Field>
              <div className={s.grid2}>
                <Field label="From Date" required>
                  <Input type="date" value={form.fromDate} onChange={(_, d) => setForm(f => ({ ...f, fromDate: d.value }))} />
                </Field>
                <Field label="To Date" required>
                  <Input type="date" value={form.toDate} onChange={(_, d) => setForm(f => ({ ...f, toDate: d.value }))} />
                </Field>
              </div>
              <div className={s.grid3}>
                <Field label="Adults"><Input type="number" min={0} value={form.adults} onChange={(_, d) => setForm(f => ({ ...f, adults: d.value }))} placeholder="0" /></Field>
                <Field label="Children"><Input type="number" min={0} value={form.children} onChange={(_, d) => setForm(f => ({ ...f, children: d.value }))} placeholder="0" /></Field>
                <Field label="Babies"><Input type="number" min={0} value={form.babies} onChange={(_, d) => setForm(f => ({ ...f, babies: d.value }))} placeholder="0" /></Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" disabled={saving} onClick={closeForm}>Cancel</Button>
              <Button appearance="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(_, d) => !d.open && setDeleteTarget(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Owner Occupancy Block?</DialogTitle>
            <DialogContent><Text>This cannot be undone.</Text></DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button appearance="primary" onClick={confirmDelete}>Delete</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
