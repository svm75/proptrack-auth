import { useState } from 'react'
import {
  makeStyles, tokens, Button, Text, Spinner,
  Table, TableHeader, TableRow, TableHeaderCell, TableBody, TableCell,
} from '@fluentui/react-components'
import { useOwnerOccupancies, useProperties } from '@/hooks/data'
import type { OwnerOccupancy } from '@/domain/types'
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
  const { data: records = [], isLoading: loadingOcc, refetch } = useOwnerOccupancies()
  const { data: properties = [], isLoading: loadingProps } = useProperties()
  const loading = loadingOcc || loadingProps

  const [formOpen, setFormOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<OwnerOccupancy | null>(null)

  function propertyName(id: string): string {
    return properties.find(p => p.id === id)?.name ?? '—'
  }

  function openNew() { setEditRecord(null); setFormOpen(true) }
  function openEdit(r: OwnerOccupancy) { setEditRecord(r); setFormOpen(true) }
  function closeForm() { setFormOpen(false); setEditRecord(null) }
  async function handleSaved() { closeForm(); await refetch() }
  async function handleDeleted() { closeForm(); await refetch() }

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
              {records.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{propertyName(r.propertyId)}</TableCell>
                  <TableCell>{fmtDate(r.fromDate)}</TableCell>
                  <TableCell>{fmtDate(r.toDate)}</TableCell>
                  <TableCell>{nightsBetween(r.fromDate, r.toDate)}</TableCell>
                  <TableCell>{r.adults ?? '—'}</TableCell>
                  <TableCell>{r.children ?? '—'}</TableCell>
                  <TableCell>{r.babies ?? '—'}</TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <Button size="small" appearance="subtle" onClick={() => openEdit(r)}>Edit</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
