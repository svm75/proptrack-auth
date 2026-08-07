import { useEffect, useState } from 'react'
import {
  makeStyles, tokens, Button, Text, Spinner,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import { Svm_pt_owneroccupanciesService } from '@/generated/services/Svm_pt_owneroccupanciesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import type { Svm_pt_owneroccupancies } from '@/generated/models/Svm_pt_owneroccupanciesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import { OwnerOccupancyFormDialog } from '@/components/OwnerOccupancyFormDialog'

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function nightsBetween(fromIso: string | undefined, toIso: string | undefined): number {
  if (!fromIso || !toIso) return 0
  return Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000))
}

const useStyles = makeStyles({
  root: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  intro: { color: tokens.colorNeutralForeground3, maxWidth: '640px' },
  tableWrap: { borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, overflowX: 'auto' },
  empty: { textAlign: 'center', padding: '48px', color: tokens.colorNeutralForeground4 },
})

export default function OwnerOccupancy() {
  const s = useStyles()
  const [records, setRecords] = useState<Svm_pt_owneroccupancies[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<Svm_pt_owneroccupancies | null>(null)

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

  function openNew() { setEditRecord(null); setFormOpen(true) }
  function openEdit(r: Svm_pt_owneroccupancies) { setEditRecord(r); setFormOpen(true) }
  function closeForm() { setFormOpen(false); setEditRecord(null) }
  async function handleSaved() { closeForm(); await loadAll() }
  async function handleDeleted() { closeForm(); await loadAll() }

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
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {formOpen && (
        <OwnerOccupancyFormDialog
          record={editRecord}
          properties={properties}
          onSaved={handleSaved}
          onClose={closeForm}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
