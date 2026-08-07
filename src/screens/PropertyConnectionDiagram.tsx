import { useEffect, useRef, useState } from 'react'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import { fmtEur } from '../utils/formatters'
import InvoiceForm from './InvoiceForm'

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

function invType(inv: Cr9b5_pt_invoices): 'Income' | 'Expense' {
  return (inv as unknown as Record<string, unknown>)['cr9b5_type'] as number === TYPE_OUTGOING ? 'Income' : 'Expense'
}

function contactId(inv: Cr9b5_pt_invoices): string {
  return ((inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined) ?? '__none__'
}

export default function PropertyConnectionDiagram({ property, allProperties, invoices, contacts, onClose }: Props) {
  const currentYear = new Date().getFullYear()
  const [diagYear, setDiagYear] = useState<string>(String(currentYear))
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedContact, setExpandedContact] = useState<string | null>(null)
  const [viewInvoice, setViewInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null)
  const [lines, setLines] = useState<Line[]>([])
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
  const daysInPeriod = diagYear === 'all' ? 365 : (new Date(Number(diagYear) + 1, 0, 1).getTime() - new Date(Number(diagYear), 0, 1).getTime()) / 86400000
  const occupancy = daysInPeriod > 0 && totalNights > 0 ? Math.round(totalNights / daysInPeriod * 100) : null

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
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '95vw', height: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Connection Diagram</h2>
            <p className="text-sm text-gray-500">{property.cr9b5_name} · {property.cr9b5_shortid}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Year</label>
              <select
                value={diagYear}
                onChange={e => {
                  setDiagYear(e.target.value)
                  setExpandedCategory(null)
                  setExpandedContact(null)
                }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="all">All years</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
          </div>
        </div>

        {/* Diagram */}
        <div className="flex-1 overflow-auto p-10">
          <div ref={containerRef} className="relative mx-auto" style={{ minWidth: 480 }}>
            {/* SVG lines — overflow:visible so lines always show */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width="100%"
              height="100%"
              style={{ overflow: 'visible' }}
            >
              {lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1} y1={l.y1}
                  x2={l.x2} y2={l.y2}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                />
              ))}
            </svg>

            {/* Level 1 — Property */}
            <div className="flex justify-center mb-16">
              <div
                data-node-level="1"
                className="bg-teal-600 text-white rounded-xl px-6 py-4 shadow-lg text-center select-none"
                style={{ minWidth: 200 }}
              >
                <p className="text-base font-bold leading-tight">{property.cr9b5_name}</p>
                <p className="text-xs font-mono mt-1 text-teal-200">{property.cr9b5_shortid}</p>
                {occupancy !== null && (
                  <p className="text-xs mt-1.5 text-teal-100">{occupancy}% occupancy</p>
                )}
              </div>
            </div>

            {/* Level 2 — Categories */}
            {categories.length === 0 ? (
              <p className="text-center text-sm text-gray-400">No invoices for this period.</p>
            ) : (
              <div className="flex justify-center gap-4 mb-16 flex-wrap">
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
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900">{cat.name}</p>
                            <p>Invoices: {cat.count}</p>
                            <p>Net: {fmtEur(cat.net)}</p>
                            <p>Gross: {fmtEur(cat.gross)}</p>
                            <p>VAT: {fmtEur(cat.vat)}</p>
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={[
                        'rounded-xl px-4 py-3 shadow cursor-pointer transition-all text-center select-none',
                        isExpanded
                          ? 'bg-gray-200 border-2 border-gray-500'
                          : 'bg-gray-100 border border-gray-300 hover:border-gray-400 hover:shadow-md',
                      ].join(' ')}
                      style={{ minWidth: 160 }}
                    >
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{cat.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{cat.count} invoice{cat.count !== 1 ? 's' : ''}</p>
                      <p className="text-xs font-medium text-gray-700 mt-0.5">{fmtEur(cat.net)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Level 3 — Contacts */}
            {expandedCategory && contactNodes.length > 0 && (
              <div className="flex justify-center gap-4 mb-16 flex-wrap">
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
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900">{con.name}</p>
                            {con.email && <p className="text-gray-500">{con.email}</p>}
                            <p>Role: {con.role}</p>
                            <p>Invoices: {con.count}</p>
                            <p>Net: {fmtEur(con.net)}</p>
                            <p>First: {fmtDate(con.firstDate)}</p>
                            <p>Latest: {fmtDate(con.lastDate)}</p>
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={[
                        'bg-white rounded-xl px-4 py-3 shadow cursor-pointer transition-all text-center select-none',
                        isExpanded
                          ? 'border-2 border-teal-600'
                          : 'border border-teal-400 hover:border-teal-500 hover:shadow-md',
                      ].join(' ')}
                      style={{ minWidth: 176 }}
                    >
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{con.name}</p>
                      <span className={[
                        'text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block',
                        isIncome ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700',
                      ].join(' ')}>{con.role}</span>
                      <p className="text-xs text-gray-500 mt-1">{con.count} invoice{con.count !== 1 ? 's' : ''}</p>
                      <p className="text-xs font-medium text-gray-700 mt-0.5">{fmtEur(con.net)}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Level 4 — Invoices */}
            {expandedContact && invoiceNodes.length > 0 && (
              <div className="flex justify-center gap-3 flex-wrap">
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
                          <div className="space-y-0.5">
                            <p className="font-semibold text-gray-900">{inv.cr9b5_internalid}</p>
                            <p>Date: {fmtDate(inv.cr9b5_date)}</p>
                            <p>Type: {invType(inv)}</p>
                            {con && <p>Contact: {con.cr9b5_name}</p>}
                            {inv.cr9b5_description && <p>Desc: {inv.cr9b5_description}</p>}
                            <p>Net: {fmtEur((raw['cr9b5_baseamount'] as number) ?? 0)}</p>
                            <p>VAT: {fmtEur((raw['cr9b5_taxamount'] as number) ?? 0)}</p>
                            <p>Gross: {fmtEur(inv.cr9b5_totalgross ?? 0)}</p>
                            {inv.cr9b5_checkin && <p>Check-in: {fmtDate(inv.cr9b5_checkin)}</p>}
                            {inv.cr9b5_checkout && <p>Check-out: {fmtDate(inv.cr9b5_checkout)}</p>}
                            {inv.cr9b5_nights != null && isIncome && <p>Nights: {inv.cr9b5_nights}</p>}
                          </div>
                        ),
                      })}
                      onMouseLeave={() => setTooltip(null)}
                      className={[
                        'bg-white rounded-xl px-4 py-3 shadow-sm cursor-pointer transition-all text-center select-none',
                        isIncome
                          ? 'border border-green-400 hover:border-green-600 hover:shadow-md'
                          : 'border border-red-300 hover:border-red-500 hover:shadow-md',
                      ].join(' ')}
                      style={{ minWidth: 152 }}
                    >
                      <p className="text-xs font-mono font-semibold text-indigo-700">{inv.cr9b5_internalid}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(inv.cr9b5_date)}</p>
                      <span className={[
                        'text-xs px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block',
                        isIncome ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                      ].join(' ')}>{isIncome ? 'Income' : 'Expense'}</span>
                      <p className="text-xs font-semibold text-gray-800 mt-1">{fmtEur(inv.cr9b5_totalgross ?? 0)}</p>
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
        <div
          className="fixed z-[60] bg-white text-gray-700 text-xs rounded-lg shadow-xl border border-gray-200 p-3 pointer-events-none"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14, maxWidth: 240 }}
        >
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
