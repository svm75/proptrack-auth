import { useEffect, useRef, useState } from 'react'
import { makeStyles, tokens, mergeClasses, Text, Select } from '@fluentui/react-components'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import { formatMoney } from '@/domain/money'
import InvoiceForm from './InvoiceForm'
import { Svm_pt_owneroccupanciesService } from '@/generated/services/Svm_pt_owneroccupanciesService'
import type { Svm_pt_owneroccupancies } from '@/generated/models/Svm_pt_owneroccupanciesModel'

const TYPE_OUTGOING = 233100001 // Income

interface Line { x1: number; y1: number; x2: number; y2: number }

interface Props {
  property: Cr9b5_pt_properties
  allProperties: Cr9b5_pt_properties[]
  invoices: Cr9b5_pt_invoices[]
  contacts: Cr9b5_pt_contacts[]
  onClose: () => void
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Occupancy denominator: full year for past years, but only elapsed days
// (1 Jan through today, inclusive) for the current year.
function daysElapsedInYear(year: number): number {
  const now = new Date()
  if (year < now.getFullYear()) return (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86400000
  if (year > now.getFullYear()) return 0
  const start = new Date(year, 0, 1)
  return Math.floor((now.getTime() - start.getTime()) / 86400000) + 1
}

function invType(inv: Cr9b5_pt_invoices): 'Income' | 'Expense' {
  return (inv as unknown as Record<string, unknown>)['cr9b5_type'] as number === TYPE_OUTGOING ? 'Income' : 'Expense'
}

function contactId(inv: Cr9b5_pt_invoices): string {
  return ((inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined) ?? '__none__'
}

const useStyles = makeStyles({
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
  modal: { backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusXLarge, boxShadow: tokens.shadow64, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '95vw', height: '92vh' },
  header: { padding: '16px 24px', backgroundColor: tokens.colorNeutralBackground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  yearGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
  yearLabel: { fontSize: '11px', color: tokens.colorNeutralForeground4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' },
  closeBtn: { color: tokens.colorNeutralForeground4, fontSize: '22px', lineHeight: 1, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: tokens.borderRadiusMedium, cursor: 'pointer', border: 'none', backgroundColor: 'transparent' },
  body: { flex: 1, overflow: 'auto', padding: '40px' },
  canvas: { position: 'relative', margin: '0 auto', minWidth: '480px' },
  svg: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' },
  level1Row: { display: 'flex', justifyContent: 'center', marginBottom: '64px' },
  propNode: { backgroundColor: '#0F766E', color: '#fff', borderRadius: tokens.borderRadiusXLarge, padding: '16px 24px', boxShadow: tokens.shadow8, textAlign: 'center', userSelect: 'none', minWidth: '200px' },
  propName: { fontSize: '16px', fontWeight: 700, lineHeight: 1.2 },
  propShortId: { fontSize: '12px', fontFamily: 'monospace', marginTop: '4px', color: 'rgba(255,255,255,0.75)' },
  propOcc: { fontSize: '12px', marginTop: '6px', color: 'rgba(255,255,255,0.85)' },
  emptyMsg: { textAlign: 'center', fontSize: '14px', color: tokens.colorNeutralForeground4 },
  row: { display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '64px', flexWrap: 'wrap' },
  rowTight: { display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' },
  catNode: { borderRadius: tokens.borderRadiusXLarge, padding: '12px 16px', boxShadow: tokens.shadow4, cursor: 'pointer', textAlign: 'center', userSelect: 'none', minWidth: '160px', backgroundColor: tokens.colorNeutralBackground3, border: `1px solid ${tokens.colorNeutralStroke2}` },
  conNode: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusXLarge, padding: '12px 16px', boxShadow: tokens.shadow4, cursor: 'pointer', textAlign: 'center', userSelect: 'none', minWidth: '176px', border: '1px solid #2DD4BF' },
  invNode: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusXLarge, padding: '12px 16px', boxShadow: tokens.shadow2, cursor: 'pointer', textAlign: 'center', userSelect: 'none', minWidth: '152px' },
  nodeTitle: { fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground1, lineHeight: 1.2 },
  nodeSub: { fontSize: '12px', color: tokens.colorNeutralForeground4, marginTop: '4px' },
  nodeAmt: { fontSize: '12px', fontWeight: 500, color: tokens.colorNeutralForeground2, marginTop: '2px' },
  badge: { fontSize: '11px', padding: '1px 6px', borderRadius: tokens.borderRadiusCircular, fontWeight: 500, marginTop: '4px', display: 'inline-block' },
  badgeIncome: { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 },
  badgeExpense: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1 },
  invId: { fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: tokens.colorBrandForeground1 },
  tooltip: { position: 'fixed', zIndex: 60, backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground2, fontSize: '12px', borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow16, border: `1px solid ${tokens.colorNeutralStroke2}`, padding: '12px', pointerEvents: 'none', maxWidth: '240px' },
})

export default function PropertyConnectionDiagram({ property, allProperties, invoices, contacts, onClose }: Props) {
  const s = useStyles()
  const currentYear = new Date().getFullYear()
  const [diagYear, setDiagYear] = useState<string>(String(currentYear))
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedContact, setExpandedContact] = useState<string | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [ownerOccupancy, setOwnerOccupancy] = useState<Svm_pt_owneroccupancies[]>([])

  useEffect(() => {
    Svm_pt_owneroccupanciesService.getAll({ filter: `_svm_pt_property_value eq '${property.cr9b5_pt_propertyid}'` })
      .then(res => setOwnerOccupancy(res.data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.cr9b5_pt_propertyid])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !viewInvoice) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, viewInvoice])

  const years = Array.from(new Set(
    invoices.map(i => i.cr9b5_date ? new Date(i.cr9b5_date).getFullYear() : null).filter((y): y is number => y !== null)
  )).sort((a, b) => b - a)

  const filtered = diagYear === 'all'
    ? invoices
    : invoices.filter(inv => inv.cr9b5_date && new Date(inv.cr9b5_date).getFullYear() === Number(diagYear))

  // Level 2: categories
  const categoryMap = new Map<string, Cr9b5_pt_invoices[]>()
  for (const inv of filtered) {
    const cat = inv.cr9b5_categoryidname?.trim() || 'Uncategorised'
    if (!categoryMap.has(cat)) categoryMap.set(cat, [])
    categoryMap.get(cat)!.push(inv)
  }
  const categories = Array.from(categoryMap.entries()).map(([name, invs]) => ({
    name,
    count: invs.length,
    net: invs.reduce((s, i) => s + ((i as unknown as Record<string, unknown>)['cr9b5_baseamount'] as number ?? 0), 0),
    gross: invs.reduce((s, i) => s + (i.cr9b5_totalgross ?? 0), 0),
    vat: invs.reduce((s, i) => s + ((i as unknown as Record<string, unknown>)['cr9b5_taxamount'] as number ?? 0), 0),
  }))

  // Level 3: contacts within expanded category
  const catInvoices = expandedCategory ? (categoryMap.get(expandedCategory) ?? []) : []
  const contactMap = new Map<string, Cr9b5_pt_invoices[]>()
  for (const inv of catInvoices) {
    const cid = contactId(inv)
    if (!contactMap.has(cid)) contactMap.set(cid, [])
    contactMap.get(cid)!.push(inv)
  }
  const contactNodes = Array.from(contactMap.entries()).map(([cid, invs]) => {
    const contact = contacts.find(c => c.cr9b5_pt_contactid === cid)
    const dates = invs.map(i => i.cr9b5_date).filter(Boolean).sort() as string[]
    return {
      id: cid,
      name: contact?.cr9b5_name ?? '—',
      email: contact?.cr9b5_email,
      role: invType(invs[0]),
      count: invs.length,
      net: invs.reduce((s, i) => s + ((i as unknown as Record<string, unknown>)['cr9b5_baseamount'] as number ?? 0), 0),
      firstDate: dates[0],
      lastDate: dates.at(-1),
      invoices: invs,
    }
  })

  // Level 4: invoices within expanded contact
  const invoiceNodes = expandedContact
    ? (contactNodes.find(c => c.id === expandedContact)?.invoices ?? [])
    : []

  // Occupancy from income invoices
  const incomeInvs = filtered.filter(i => invType(i) === 'Income')
  const totalNights = incomeInvs.reduce((s, i) => s + (i.cr9b5_nights ?? 0), 0)
  const daysInPeriod = diagYear === 'all' ? 365 : daysElapsedInYear(Number(diagYear))
  const occupancy = daysInPeriod > 0 && totalNights > 0 ? Math.round(totalNights / daysInPeriod * 100) : null
  const ownerNightsInPeriod = diagYear === 'all' ? 0 : (() => {
    const year = Number(diagYear)
    const now = new Date()
    const yearStart = new Date(year, 0, 1)
    const yearEndExclusive = year === now.getFullYear() ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : new Date(year + 1, 0, 1)
    return ownerOccupancy.reduce((sum, r) => {
      if (!r.svm_pt_fromdate || !r.svm_pt_todate) return sum
      const from = new Date(r.svm_pt_fromdate) < yearStart ? yearStart : new Date(r.svm_pt_fromdate)
      const to = new Date(r.svm_pt_todate) > yearEndExclusive ? yearEndExclusive : new Date(r.svm_pt_todate)
      const nights = Math.round((to.getTime() - from.getTime()) / 86400000)
      return sum + (nights > 0 ? nights : 0)
    }, 0)
  })()
  // "Incl. owner" treats owner-use nights as occupied too (bigger numerator,
  // same denominator) — the higher figure; `occupancy` above (guest nights
  // only) is the "excl. owner" figure.
  const occupancyIncl = daysInPeriod > 0 && totalNights > 0 ? Math.round((totalNights + ownerNightsInPeriod) / daysInPeriod * 100) : null

  // Compute SVG lines after DOM renders
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const newLines: Line[] = []
      if (!containerRef.current) { setLines([]); return }
      const cRect = containerRef.current.getBoundingClientRect()

      function center(el: Element) {
        const r = el.getBoundingClientRect()
        return {
          x: r.left + r.width / 2 - cRect.left,
          top: r.top - cRect.top,
          bottom: r.bottom - cRect.top,
        }
      }

      const propEl = containerRef.current.querySelector('[data-node-level="1"]')
      if (!propEl) { setLines([]); return }
      const propC = center(propEl)

      const catEls = containerRef.current.querySelectorAll('[data-node-cat]')
      const expandedCatEl = expandedCategory
        ? containerRef.current.querySelector(`[data-node-cat="${expandedCategory}"]`)
        : null

      if (expandedCategory && expandedCatEl) {
        const catC = center(expandedCatEl)
        newLines.push({ x1: propC.x, y1: propC.bottom, x2: catC.x, y2: catC.top })

        const conEls = containerRef.current.querySelectorAll('[data-node-contact]')
        const expandedConEl = expandedContact
          ? containerRef.current.querySelector(`[data-node-contact="${expandedContact}"]`)
          : null

        if (expandedContact && expandedConEl) {
          const conC = center(expandedConEl)
          newLines.push({ x1: catC.x, y1: catC.bottom, x2: conC.x, y2: conC.top })
          containerRef.current.querySelectorAll('[data-node-invoice]').forEach(el => {
            const invC = center(el)
            newLines.push({ x1: conC.x, y1: conC.bottom, x2: invC.x, y2: invC.top })
          })
        } else {
          conEls.forEach(el => {
            const conC = center(el)
            newLines.push({ x1: catC.x, y1: catC.bottom, x2: conC.x, y2: conC.top })
          })
        }
      } else {
        catEls.forEach(el => {
          const catC = center(el)
          newLines.push({ x1: propC.x, y1: propC.bottom, x2: catC.x, y2: catC.top })
        })
      }

      setLines(newLines)
    })
    return () => cancelAnimationFrame(raf)
  }, [expandedCategory, expandedContact, diagYear, filtered.length])

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={s.header}>
          <div>
            <Text size={500} weight="semibold">Connection Diagram</Text>
            <Text size={300} block style={{ color: tokens.colorNeutralForeground4 }}>{property.cr9b5_name} · {property.cr9b5_shortid}</Text>
          </div>
          <div className={s.headerRight}>
            <div className={s.yearGroup}>
              <Text className={s.yearLabel}>Year</Text>
              <Select value={diagYear} onChange={e => {
                setDiagYear(e.target.value)
                setExpandedCategory(null)
                setExpandedContact(null)
              }}>
                <option value="all">All years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <button onClick={onClose} className={s.closeBtn}>×</button>
          </div>
        </div>

        {/* Diagram */}
        <div className={s.body}>
          <div ref={containerRef} className={s.canvas}>
            <svg className={s.svg} width="100%" height="100%">
              {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#94a3b8" strokeWidth={1.5} />
              ))}
            </svg>

            {/* Level 1 — Property */}
            <div className={s.level1Row}>
              <div data-node-level="1" className={s.propNode}>
                <p className={s.propName}>{property.cr9b5_name}</p>
                <p className={s.propShortId}>{property.cr9b5_shortid}</p>
                {occupancy !== null && (
                  <p className={s.propOcc}>
                    {occupancyIncl}% occupancy{occupancyIncl !== occupancy ? ` (${occupancy}% excl. owner)` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Level 2 — Categories */}
            {categories.length === 0 ? (
              <p className={s.emptyMsg}>No invoices for this period.</p>
            ) : (
              <div className={s.row}>
                {categories.map(cat => {
                  const isExpanded = expandedCategory === cat.name
                  return (
                    <div
                      key={cat.name}
                      data-node-cat={cat.name}
                      onClick={() => {
                        if (isExpanded) { setExpandedCategory(null); setExpandedContact(null) }
                        else { setExpandedCategory(cat.name); setExpandedContact(null) }
                      }}
                      onMouseEnter={e => setTooltip({
                        x: e.clientX, y: e.clientY,
                        content: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <Text weight="semibold">{cat.name}</Text>
                            <Text>Invoices: {cat.count}</Text>
                            <Text>Net: {formatMoney(cat.net)}</Text>
                            <Text>Gross: {formatMoney(cat.gross)}</Text>
                            <Text>VAT: {formatMoney(cat.vat)}</Text>
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={s.catNode}
                      style={isExpanded ? { backgroundColor: tokens.colorNeutralBackground4, border: `2px solid ${tokens.colorNeutralStroke1}` } : undefined}
                    >
                      <p className={s.nodeTitle}>{cat.name}</p>
                      <p className={s.nodeSub}>{cat.count} invoice{cat.count !== 1 ? 's' : ''}</p>
                      <p className={s.nodeAmt}>{formatMoney(cat.net)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Level 3 — Contacts */}
            {expandedCategory && contactNodes.length > 0 && (
              <div className={s.row}>
                {contactNodes.map(con => {
                  const isExpanded = expandedContact === con.id
                  const isIncome = con.role === 'Income'
                  return (
                    <div
                      key={con.id}
                      data-node-contact={con.id}
                      onClick={() => {
                        if (isExpanded) setExpandedContact(null)
                        else setExpandedContact(con.id)
                      }}
                      onMouseEnter={e => setTooltip({
                        x: e.clientX, y: e.clientY,
                        content: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <Text weight="semibold">{con.name}</Text>
                            {con.email && <Text style={{ color: tokens.colorNeutralForeground4 }}>{con.email}</Text>}
                            <Text>Role: {con.role}</Text>
                            <Text>Invoices: {con.count}</Text>
                            <Text>Net: {formatMoney(con.net)}</Text>
                            <Text>First: {fmtDate(con.firstDate)}</Text>
                            <Text>Latest: {fmtDate(con.lastDate)}</Text>
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={s.conNode}
                      style={isExpanded ? { border: '2px solid #0F766E' } : undefined}
                    >
                      <p className={s.nodeTitle}>{con.name}</p>
                      <span className={s.badge} style={isIncome ? { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 } : { backgroundColor: tokens.colorPaletteBlueBackground2, color: tokens.colorPaletteBlueForeground2 }}>{con.role}</span>
                      <p className={s.nodeSub}>{con.count} invoice{con.count !== 1 ? 's' : ''}</p>
                      <p className={s.nodeAmt}>{formatMoney(con.net)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Level 4 — Invoices */}
            {expandedContact && invoiceNodes.length > 0 && (
              <div className={s.rowTight}>
                {invoiceNodes.map(inv => {
                  const isIncome = invType(inv) === 'Income'
                  const raw = inv as unknown as Record<string, unknown>
                  const cid = raw['_cr9b5_contact_value'] as string | undefined
                  const con = cid ? contacts.find(c => c.cr9b5_pt_contactid === cid) : undefined
                  return (
                    <div
                      key={inv.cr9b5_pt_invoiceid}
                      data-node-invoice={inv.cr9b5_pt_invoiceid}
                      onClick={() => setViewInvoice(inv)}
                      onMouseEnter={e => setTooltip({
                        x: e.clientX, y: e.clientY,
                        content: (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <Text weight="semibold">{inv.cr9b5_internalid}</Text>
                            <Text>Date: {fmtDate(inv.cr9b5_date)}</Text>
                            <Text>Type: {invType(inv)}</Text>
                            {con && <Text>Contact: {con.cr9b5_name}</Text>}
                            {inv.cr9b5_description && <Text>Desc: {inv.cr9b5_description}</Text>}
                            <Text>Net: {formatMoney((raw['cr9b5_baseamount'] as number) ?? 0)}</Text>
                            <Text>VAT: {formatMoney((raw['cr9b5_taxamount'] as number) ?? 0)}</Text>
                            <Text>Gross: {formatMoney(inv.cr9b5_totalgross ?? 0)}</Text>
                            {inv.cr9b5_checkin && <Text>Check-in: {fmtDate(inv.cr9b5_checkin)}</Text>}
                            {inv.cr9b5_checkout && <Text>Check-out: {fmtDate(inv.cr9b5_checkout)}</Text>}
                            {inv.cr9b5_nights != null && isIncome && <Text>Nights: {inv.cr9b5_nights}</Text>}
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={s.invNode}
                      style={{ border: `1px solid ${isIncome ? tokens.colorPaletteGreenBorder1 : tokens.colorPaletteRedBorder1}` }}
                    >
                      <p className={s.invId}>{inv.cr9b5_internalid}</p>
                      <p className={s.nodeSub} style={{ marginTop: '2px' }}>{fmtDate(inv.cr9b5_date)}</p>
                      <span className={mergeClasses(s.badge, isIncome ? s.badgeIncome : s.badgeExpense)}>{isIncome ? 'Income' : 'Expense'}</span>
                      <p className={s.nodeTitle} style={{ fontSize: '13px', marginTop: '4px' }}>{formatMoney(inv.cr9b5_totalgross ?? 0)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className={s.tooltip} style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          {tooltip.content}
        </div>
      )}

      {/* Invoice detail */}
      {viewInvoice && (
        <InvoiceForm
          invoice={viewInvoice}
          properties={allProperties}
          contacts={contacts}
          readOnly
          onSaved={() => {}}
          onClose={() => setViewInvoice(null)}
        />
      )}
    </div>
  )
}
