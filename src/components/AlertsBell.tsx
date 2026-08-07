import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  makeStyles, tokens, Button, Badge, Text,
  Popover, PopoverTrigger, PopoverSurface,
} from '@fluentui/react-components'
import { AlertRegular } from '@fluentui/react-icons'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Svm_pt_owneroccupanciesService } from '@/generated/services/Svm_pt_owneroccupanciesService'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import { nightsOverlap } from '@/domain/dateRanges'

const TYPE_OUTGOING = 233100001 // Income / guest booking

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
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => { computeAlerts() }, [])

  async function computeAlerts() {
    const [invRes, propRes, occRes] = await Promise.all([
      Cr9b5_pt_invoicesService.getAll({
        select: ['cr9b5_pt_invoiceid', 'cr9b5_internalid', 'cr9b5_type', 'cr9b5_date', 'cr9b5_checkin', 'cr9b5_checkout'],
        filter: 'statecode eq 0',
        maxPageSize: 5000,
      }),
      Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'] }),
      Svm_pt_owneroccupanciesService.getAll({ maxPageSize: 5000 }),
    ])
    const invoices = invRes.data ?? []
    const properties = propRes.data ?? []
    const ownerOccupancy = occRes.data ?? []
    const propName = (id: string) => properties.find(p => p.cr9b5_pt_propertyid === id)?.cr9b5_name ?? 'Unknown property'

    const items: AlertItem[] = []

    // ---- Overlap conflicts: guest vs guest, guest vs owner, per property ----
    const byProperty = new Map<string, Cr9b5_pt_invoices[]>()
    for (const inv of invoices) {
      if ((inv.cr9b5_type as unknown as number) !== TYPE_OUTGOING) continue
      if (!inv.cr9b5_checkin || !inv.cr9b5_checkout) continue
      const raw = inv as unknown as Record<string, unknown>
      const propId = raw['_cr9b5_property_value'] as string | undefined
      if (!propId) continue
      if (!byProperty.has(propId)) byProperty.set(propId, [])
      byProperty.get(propId)!.push(inv)
    }
    let conflictCount = 0
    for (const [propId, invs] of byProperty) {
      for (let i = 0; i < invs.length && conflictCount < 15; i++) {
        for (let j = i + 1; j < invs.length && conflictCount < 15; j++) {
          if (nightsOverlap(invs[i].cr9b5_checkin!, invs[i].cr9b5_checkout!, invs[j].cr9b5_checkin!, invs[j].cr9b5_checkout!)) {
            items.push({
              id: `conflict-inv-${invs[i].cr9b5_pt_invoiceid}-${invs[j].cr9b5_pt_invoiceid}`,
              text: `${invs[i].cr9b5_internalid ?? '(no ID)'} overlaps ${invs[j].cr9b5_internalid ?? '(no ID)'} at ${propName(propId)}`,
              severity: 'warning', navigateTo: '/invoices',
            })
            conflictCount++
          }
        }
      }
      const owners = ownerOccupancy.filter(o => (o as unknown as Record<string, unknown>)['_svm_pt_property_value'] === propId && o.svm_pt_fromdate && o.svm_pt_todate)
      for (const inv of invs) {
        for (const occ of owners) {
          if (conflictCount >= 15) break
          if (nightsOverlap(inv.cr9b5_checkin!, inv.cr9b5_checkout!, occ.svm_pt_fromdate!, occ.svm_pt_todate!)) {
            items.push({
              id: `conflict-owner-${inv.cr9b5_pt_invoiceid}-${occ.svm_pt_owneroccupancyid}`,
              text: `${inv.cr9b5_internalid ?? '(no ID)'} overlaps owner occupancy at ${propName(propId)}`,
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
      if (!occ.svm_pt_fromdate) continue
      const from = new Date(occ.svm_pt_fromdate)
      if (from >= today && from <= in7Days) {
        const propId = (occ as unknown as Record<string, unknown>)['_svm_pt_property_value'] as string | undefined
        items.push({
          id: `upcoming-${occ.svm_pt_owneroccupancyid}`,
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
      const raw = inv as unknown as Record<string, unknown>
      if (raw['_cr9b5_categoryid_value']) continue
      if (!inv.cr9b5_date || new Date(inv.cr9b5_date) < ninetyDaysAgo) continue
      items.push({
        id: `nocat-${inv.cr9b5_pt_invoiceid}`,
        text: `${inv.cr9b5_internalid ?? '(no ID)'} has no category`,
        severity: 'info', navigateTo: '/invoices',
      })
      missingCatCount++
    }

    setAlerts(items)
  }

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
