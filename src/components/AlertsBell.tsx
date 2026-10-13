import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  makeStyles, tokens, Button, Badge, Text,
  Popover, PopoverTrigger, PopoverSurface,
} from '@fluentui/react-components'
import { AlertRegular, CheckmarkRegular } from '@fluentui/react-icons'
import { useInvoices, useProperties, useOwnerOccupancies, useAttachments } from '@/hooks/data'
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

// Accepted alert ids, remembered per browser. Alerts are computed from live data on every render,
// so "accepting" one just hides its id; an id that encodes state (e.g. doc expiry severity) makes
// the alert come back when that state changes.
const ACCEPTED_KEY = 'pt-accepted-alerts'
const ACCEPTED_MAX = 2000

function loadAccepted(): Set<string> {
  try {
    const raw = localStorage.getItem(ACCEPTED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveAccepted(ids: Set<string>): void {
  try {
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify([...ids].slice(-ACCEPTED_MAX)))
  } catch {
    // localStorage unavailable — accepted alerts just won't persist across sessions
  }
}

const useStyles = makeStyles({
  surface: { width: '360px', maxHeight: '440px', overflowY: 'auto', padding: 0 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 8px 8px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontWeight: 600, fontSize: '14px', minHeight: '24px' },
  row: { display: 'flex', alignItems: 'center', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, paddingRight: '8px' },
  item: { flex: 1, minWidth: 0, textAlign: 'left', padding: '10px 8px 10px 16px', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', color: tokens.colorNeutralForeground1 },
  footer: { padding: '6px 16px', fontSize: '12px', color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
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
  const { data: attachments = [] } = useAttachments()

  const [accepted, setAccepted] = useState<Set<string>>(loadAccepted)

  const accept = (ids: string[]) => {
    const next = new Set(accepted)
    for (const id of ids) next.add(id)
    saveAccepted(next)
    setAccepted(next)
  }

  const restoreAccepted = () => {
    saveAccepted(new Set())
    setAccepted(new Set())
  }

  const { alerts, acceptedHiddenCount } = useMemo(() => {
    const propName = (id: string) => properties.find(p => p.id === id)?.name ?? 'Unknown property'

    const items: AlertItem[] = []
    // Accepted alerts are skipped before the per-type caps below are counted, so accepting
    // some lets further ones of the same type surface. Returns whether the alert was shown.
    let hidden = 0
    const add = (item: AlertItem) => {
      if (accepted.has(item.id)) { hidden++; return false }
      items.push(item)
      return true
    }

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
          if (nightsOverlap(invs[i].checkIn!, invs[i].checkOut!, invs[j].checkIn!, invs[j].checkOut!) && add({
            id: `conflict-inv-${invs[i].id}-${invs[j].id}`,
            text: `${invs[i].internalId ?? '(no ID)'} overlaps ${invs[j].internalId ?? '(no ID)'} at ${propName(propId)}`,
            severity: 'warning', navigateTo: '/invoices',
          })) {
            conflictCount++
          }
        }
      }
      const owners = ownerOccupancy.filter(o => o.propertyId === propId && o.fromDate && o.toDate)
      for (const inv of invs) {
        for (const occ of owners) {
          if (conflictCount >= 15) break
          if (nightsOverlap(inv.checkIn!, inv.checkOut!, occ.fromDate, occ.toDate) && add({
            id: `conflict-owner-${inv.id}-${occ.id}`,
            text: `${inv.internalId ?? '(no ID)'} overlaps owner occupancy at ${propName(propId)}`,
            severity: 'warning', navigateTo: '/invoices/owner-occupancy',
          })) {
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
        add({
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
      if (add({
        id: `nocat-${inv.id}`,
        text: `${inv.internalId ?? '(no ID)'} has no category`,
        severity: 'info', navigateTo: '/invoices',
      })) missingCatCount++
    }

    // ---- Documents expiring within 90 days, or already expired (Document Management Phase 2) ----
    const in90Days = new Date(today.getTime() + 90 * 86400000)
    let expiringDocCount = 0
    for (const a of attachments) {
      if (expiringDocCount >= 15) break
      if (!a.storagePath || !a.expiryDate) continue
      const expiry = new Date(a.expiryDate)
      if (expiry > in90Days) continue
      const name = a.originalFilename ?? a.fileName
      const expired = expiry < today
      // State in the id: accepting "expires soon" doesn't also silence the later "expired".
      if (add({
        id: `docexpiry-${a.id}-${expired ? 'expired' : 'soon'}-${a.expiryDate}`,
        text: expired
          ? `"${name}" expired ${expiry.toLocaleDateString('de-DE')}`
          : `"${name}" expires ${expiry.toLocaleDateString('de-DE')}`,
        severity: expired ? 'warning' : 'info',
        navigateTo: '/documents',
      })) expiringDocCount++
    }

    return { alerts: items, acceptedHiddenCount: hidden }
  }, [invoices, properties, ownerOccupancy, attachments, accepted])

  return (
    <Popover open={open} onOpenChange={(_, d) => setOpen(d.open)} positioning="below-end">
      <PopoverTrigger disableButtonEnhancement>
        <span className={s.badgeWrap}>
          <Button appearance="subtle" size="small" icon={<AlertRegular />} aria-label="Alerts" />
          {alerts.length > 0 && <Badge className={s.badge} size="small" color="danger">{alerts.length > 99 ? '99+' : alerts.length}</Badge>}
        </span>
      </PopoverTrigger>
      <PopoverSurface className={s.surface}>
        <div className={s.header}>
          <span>Alerts {alerts.length > 0 && `(${alerts.length})`}</span>
          {alerts.length > 0 && (
            <Button appearance="subtle" size="small" icon={<CheckmarkRegular />} onClick={() => accept(alerts.map(a => a.id))}>
              Accept all
            </Button>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className={s.empty}>No alerts right now.</div>
        ) : alerts.map(a => (
          <div key={a.id} className={s.row}>
            <button className={s.item} onClick={() => { setOpen(false); navigate(a.navigateTo) }}>
              <span className={a.severity === 'warning' ? s.dotWarning : s.dotInfo} />
              <Text size={200}>{a.text}</Text>
            </button>
            <Button appearance="subtle" size="small" icon={<CheckmarkRegular />} title="Accept" aria-label={`Accept: ${a.text}`} onClick={() => accept([a.id])} />
          </div>
        ))}
        {acceptedHiddenCount > 0 && (
          <div className={s.footer}>
            <span>{acceptedHiddenCount} accepted</span>
            <Button appearance="transparent" size="small" onClick={restoreAccepted}>Restore</Button>
          </div>
        )}
      </PopoverSurface>
    </Popover>
  )
}
