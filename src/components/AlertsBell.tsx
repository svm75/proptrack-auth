import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  makeStyles, tokens, Button, Badge, Text,
  Popover, PopoverTrigger, PopoverSurface,
} from '@fluentui/react-components'
import { AlertRegular } from '@fluentui/react-icons'
import { useInvoices, useProperties, useOwnerOccupancies } from '@/hooks/data'
import type { Invoice } from '@/domain/types'
import { InvoiceType } from '@/domain/types'
import { nightsOverlap } from '@/domain/dateRanges'

const TYPE_OUTGOING = InvoiceType.Income // Income / guest booking

interface AlertItem {
  id: string
  text: string
  severity: 'warning' | 'info'
  navigateTo: string
}

const useStyles = makeStyles({
  surface: { width: '360px', maxHeight: '440px', overflowY: 'auto', padding: 0 },
  header: { padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontWeight: 600, fontSize: '14px' },
  item: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: tokens.colorNeutralForeground1 },
  dotWarning: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: tokens.colorPaletteMarigoldForeground1, marginRight: '8px' },
  dotInfo: { display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: tokens.colorBrandForeground1, marginRight: '8px' },
  empty: { padding: '24px 16px', textAlign: 'center', color: tokens.colorNeutralForeground4, fontSize: '13px' },
  badgeWrap: { position: 'relative', display: 'inline-flex' },
  badge: { position: 'absolute', top: '-4px', right: '-4px' },
})

export function AlertsBell() {
  const s = useStyles()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const { data: invoices = [] } = useInvoices()
  const { data: properties = [] } = useProperties()
  const { data: ownerOccupancy = [] } = useOwnerOccupancies()

  const [alerts, setAlerts] = useState<AlertItem[]>([])

  useEffect(() => {
    const propName = (id: string) => properties.find(p => p.id === id)?.name ?? 'Unknown property'

    const items: AlertItem[] = []

    // ---- Overlap conflicts: guest vs guest, guest vs owner, per property ----
    const byProperty = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      if (inv.type !== TYPE_OUTGOING) continue
      if (!inv.checkIn || !inv.checkOut) continue
      const propId = inv.propertyId
      if (!propId) continue
      if (!byProperty.has(propId)) byProperty.set(propId, [])
      byProperty.get(propId)!.push(inv)
    }
    let conflictCount = 0
    for (const [propId, invs] of byProperty) {
      for (let i = 0; i < invs.length && conflictCount < 15; i++) {
        for (let j = i + 1; j < invs.length && conflictCount < 15; j++) {
          if (nightsOverlap(invs[i].checkIn!, invs[i].checkOut!, invs[j].checkIn!, invs[j].checkOut!)) {
            items.push({
              id: `conflict-inv-${invs[i].id}-${invs[j].id}`,
              text: `${invs[i].internalId ?? '(no ID)'} overlaps ${invs[j].internalId ?? '(no ID)'} at ${propName(propId)}`,
              severity: 'warning', navigateTo: '/invoices',
            })
            conflictCount++
          }
        }
      }
      const owners = ownerOccupancy.filter(o => o.propertyId === propId && o.fromDate && o.toDate)
      for (const inv of invs) {
        for (const occ of owners) {
          if (conflictCount >= 15) break
          if (nightsOverlap(inv.checkIn!, inv.checkOut!, occ.fromDate, occ.toDate)) {
            items.push({
              id: `conflict-owner-${inv.id}-${occ.id}`,
              text: `${inv.internalId ?? '(no ID)'} overlaps owner occupancy at ${propName(propId)}`,
              severity: 'warning', navigateTo: '/invoices/owner-occupancy',
            })
            conflictCount++
          }
        }
      }
    }

    // ---- Upcoming owner occupancy (next 7 days) ----
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const in7Days = new Date(today.getTime() + 7 * 86400000)
    for (const occ of ownerOccupancy) {
      if (!occ.fromDate) continue
      const from = new Date(occ.fromDate)
      if (from >= today && from <= in7Days) {
        const propId = occ.propertyId
        items.push({
          id: `upcoming-${occ.id}`,
          text: `Owner occupancy starts ${from.toLocaleDateString('de-DE')} at ${propId ? propName(propId) : 'a property'}`,
          severity: 'info', navigateTo: '/invoices/owner-occupancy',
        })
      }
    }

    // ---- Invoices missing a category (last 90 days) ----
    const ninetyDaysAgo = new Date(today.getTime() - 90 * 86400000)
    let missingCatCount = 0
    for (const inv of invoices) {
      if (missingCatCount >= 10) break
      if (inv.categoryId) continue
      if (!inv.date || new Date(inv.date) < ninetyDaysAgo) continue
      items.push({
        id: `nocat-${inv.id}`,
        text: `${inv.internalId ?? '(no ID)'} has no category`,
        severity: 'info', navigateTo: '/invoices',
      })
      missingCatCount++
    }

    setAlerts(items)
  }, [invoices, properties, ownerOccupancy])

  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <span className={s.badgeWrap}>
          <Button appearance="subtle" size="small" icon={<AlertRegular />} aria-label="Alerts" />
          {alerts.length > 0 && <Badge className={s.badge} size="small" color="danger">{alerts.length > 99 ? '99+' : alerts.length}</Badge>}
        </span>
      </PopoverTrigger>
      <PopoverSurface className={s.surface}>
        <div className={s.header}>Alerts {alerts.length > 0 && `(${alerts.length})`}</div>
        {alerts.length === 0 ? (
          <div className={s.empty}>No alerts right now.</div>
        ) : alerts.map(a => (
          <button key={a.id} className={s.item} onClick={() => { setOpen(false); navigate(a.navigateTo) }}>
            <span className={a.severity === 'warning' ? s.dotWarning : s.dotInfo} />
            <Text size={200}>{a.text}</Text>
          </button>
        ))}
      </PopoverSurface>
    </Popover>
  )
}
