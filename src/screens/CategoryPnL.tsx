import { useMemo, useState } from 'react'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_contacts }   from '../generated/models/Cr9b5_pt_contactsModel'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOME  = 233100001   // outgoing invoice = income
const TYPE_EXPENSE = 233100000   // incoming invoice = expense
const REF_INC_CAT  = 233100005
const REF_EXP_CAT  = 233100006
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isActive(inv: Cr9b5_pt_invoices) {
  return (inv.statecode as unknown as number) !== 1
}

function raw(inv: Cr9b5_pt_invoices): Record<string, unknown> {
  return inv as unknown as Record<string, unknown>
}

function getCatId(inv: Cr9b5_pt_invoices): string {
  return (raw(inv)['_cr9b5_categoryid_value'] as string) ?? ''
}

function invMonth(inv: Cr9b5_pt_invoices): number {
  return inv.cr9b5_date ? new Date(inv.cr9b5_date).getMonth() : -1
}

function sumNet(invs: Cr9b5_pt_invoices[], month: number | null): number {
  return invs
    .filter(i => month === null || invMonth(i) === month)
    .reduce((s, i) => s + (i.cr9b5_baseamount ?? 0), 0)
}

function fmtCell(n: number): string {
  return n === 0 ? '—' : fmtEur(Math.round(n * 100) / 100)
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  invoices:   Cr9b5_pt_invoices[]
  properties: Cr9b5_pt_properties[]
  references: Cr9b5_pt_references[]
  contacts:   Cr9b5_pt_contacts[]
}

export default function CategoryPnL({ invoices, properties, references, contacts }: Props) {
  const curYear = new Date().getFullYear()

  const years = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [curYear]
  }, [invoices, curYear])

  const [year,        setYear]        = useState(curYear)
  const [propId,      setPropId]      = useState('')
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [allExpanded, setAllExpanded] = useState(false)

  const contactMap = useMemo(() => {
    const m = new Map<string, string>()
    contacts.forEach(c => { if (c.cr9b5_pt_contactid) m.set(c.cr9b5_pt_contactid, c.cr9b5_name ?? '') })
    return m
  }, [contacts])

  const filtered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (inv.cr9b5_year !== year) return false
    if (propId) {
      const r = raw(inv)
      if (!r['cr9b5_allproperties'] && r['_cr9b5_property_value'] !== propId) return false
    }
    return true
  }), [invoices, year, propId])

  const incomeInvs  = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_INCOME),  [filtered])
  const expenseInvs = useMemo(() => filtered.filter(i => (i.cr9b5_type as unknown as number) === TYPE_EXPENSE), [filtered])
  const incomeCats  = useMemo(() => references.filter(r => Number(r.cr9b5_referencetype) === REF_INC_CAT), [references])
  const expenseCats = useMemo(() => references.filter(r => Number(r.cr9b5_referencetype) === REF_EXP_CAT), [references])

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function toggleAll() {
    if (allExpanded) { setExpanded(new Set()); setAllExpanded(false); return }
    const keys = new Set<string>()
    incomeCats.forEach(c  => keys.add(`inc-${c.cr9b5_pt_referenceid}`))
    expenseCats.forEach(c => keys.add(`exp-${c.cr9b5_pt_referenceid}`))
    keys.add('inc-__uncat'); keys.add('exp-__uncat')
    setExpanded(keys); setAllExpanded(true)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderSectionHeader(label: string, cls: string) {
    return (
      <tr className={`${cls} border-b`}>
        <td className={`sticky left-0 ${cls} px-3 py-2 text-xs font-bold uppercase tracking-widest z-10`} colSpan={15}>
          {label}
        </td>
      </tr>
    )
  }

  function renderSpacer() {
    return (
      <tr className="bg-gray-100 border-b border-gray-200">
        <td className="sticky left-0 bg-gray-100 py-0.5 z-10" colSpan={15} />
      </tr>
    )
  }

  function renderTotalRow(label: string, invs: Cr9b5_pt_invoices[]) {
    return (
      <tr className="border-b border-gray-300 bg-gray-50">
        <td className="sticky left-0 bg-gray-50 px-3 py-1.5 text-sm font-bold text-gray-900 z-10 whitespace-nowrap">{label}</td>
        {MONTHS.map((_, m) => (
          <td key={m} className="px-2 py-1.5 text-right text-xs font-bold text-gray-800 whitespace-nowrap">
            {fmtCell(sumNet(invs, m))}
          </td>
        ))}
        <td className="px-3 py-1.5 text-right text-xs font-bold text-gray-900 whitespace-nowrap border-l border-gray-200">
          {fmtCell(sumNet(invs, null))}
        </td>
      </tr>
    )
  }

  function renderCategories(sectionInvs: Cr9b5_pt_invoices[], cats: Cr9b5_pt_references[], prefix: string) {
    const rows: { id: string; label: string; invs: Cr9b5_pt_invoices[] }[] = [
      ...cats.map(c => ({
        id:    c.cr9b5_pt_referenceid,
        label: c.cr9b5_value ?? '',
        invs:  sectionInvs.filter(i => getCatId(i) === c.cr9b5_pt_referenceid),
      })).filter(r => r.invs.length > 0),
    ]
    rows.sort((a, b) => a.label.localeCompare(b.label))
    const uncatInvs = sectionInvs.filter(i => !getCatId(i))
    if (uncatInvs.length > 0) rows.push({ id: '__uncat', label: 'Uncategorised', invs: uncatInvs })

    return rows.map(row => {
      const catKey   = `${prefix}-${row.id}`
      const isCatOpen = expanded.has(catKey)

      // Group invoices by contact name for second-level drill-down
      const contactGroups: { contactKey: string; contactName: string; invs: Cr9b5_pt_invoices[] }[] = []
      const seen = new Map<string, Cr9b5_pt_invoices[]>()
      row.invs.forEach(inv => {
        const cid  = raw(inv)['_cr9b5_contact_value'] as string ?? ''
        const name = cid ? (contactMap.get(cid) ?? 'Unknown') : 'Unknown'
        if (!seen.has(name)) seen.set(name, [])
        seen.get(name)!.push(inv)
      })
      seen.forEach((invs, name) => contactGroups.push({ contactKey: `${catKey}__${name}`, contactName: name, invs }))
      contactGroups.sort((a, b) => a.contactName.localeCompare(b.contactName))

      return (
        <>
          <tr key={catKey} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpand(catKey)}>
            <td className="sticky left-0 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 pl-6 z-10 whitespace-nowrap">
              <span className="mr-1.5 text-gray-400 text-xs">{isCatOpen ? '▾' : '▸'}</span>
              {row.label}
            </td>
            {MONTHS.map((_, m) => (
              <td key={m} className="px-2 py-1.5 text-right text-xs text-gray-700 whitespace-nowrap">
                {fmtCell(sumNet(row.invs, m))}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-800 whitespace-nowrap border-l border-gray-200">
              {fmtCell(sumNet(row.invs, null))}
            </td>
          </tr>

          {isCatOpen && contactGroups.map(cg => {
            const isContactOpen = expanded.has(cg.contactKey)
            return (
              <>
                <tr key={cg.contactKey} className="border-b border-gray-100 hover:bg-indigo-50/40 cursor-pointer bg-gray-50/60"
                  onClick={() => toggleExpand(cg.contactKey)}>
                  <td className="sticky left-0 bg-gray-50/60 px-3 py-1.5 pl-10 z-10 whitespace-nowrap">
                    <span className="mr-1.5 text-gray-400 text-xs">{isContactOpen ? '▾' : '▸'}</span>
                    <span className="text-xs font-semibold text-gray-700">{cg.contactName}</span>
                  </td>
                  {MONTHS.map((_, m) => (
                    <td key={m} className="px-2 py-1.5 text-right text-xs text-gray-600 whitespace-nowrap">
                      {fmtCell(sumNet(cg.invs, m))}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-700 whitespace-nowrap border-l border-gray-200">
                    {fmtCell(sumNet(cg.invs, null))}
                  </td>
                </tr>

                {isContactOpen && cg.invs
                  .slice()
                  .sort((a, b) => (a.cr9b5_date ?? '') > (b.cr9b5_date ?? '') ? 1 : -1)
                  .map(inv => {
                    const m = invMonth(inv)
                    return (
                      <tr key={inv.cr9b5_pt_invoiceid} className="border-b border-gray-50 bg-indigo-50/20">
                        <td className="sticky left-0 bg-indigo-50/20 px-3 py-1 pl-16 z-10 whitespace-nowrap">
                          <span className="text-xs font-medium text-gray-700">{inv.cr9b5_internalid}</span>
                          <span className="text-xs text-gray-400 ml-2">{fmtDate(inv.cr9b5_date)}</span>
                        </td>
                        {MONTHS.map((_, mi) => (
                          <td key={mi} className="px-2 py-1 text-right text-xs text-gray-500 whitespace-nowrap">
                            {mi === m ? (
                              <span title={`Net: ${fmtEur(inv.cr9b5_baseamount??0)} · VAT: ${fmtEur(inv.cr9b5_taxamount??0)} · Gross: ${fmtEur(inv.cr9b5_totalgross??0)}`}>
                                {fmtCell(inv.cr9b5_baseamount ?? 0)}
                              </span>
                            ) : null}
                          </td>
                        ))}
                        <td className="px-3 py-1 text-right text-xs text-gray-500 whitespace-nowrap border-l border-gray-200">
                          {fmtCell(inv.cr9b5_baseamount ?? 0)}
                        </td>
                      </tr>
                    )
                  })}
              </>
            )
          })}
        </>
      )
    })
  }

  const netProfitMonths = MONTHS.map((_, m) => sumNet(incomeInvs, m) - sumNet(expenseInvs, m))
  const netProfitTotal  = sumNet(incomeInvs, null) - sumNet(expenseInvs, null)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={propId} onChange={e => setPropId(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500 min-w-[240px] z-10">
                <button onClick={toggleAll} className="text-xs text-teal-600 hover:text-teal-800 font-medium">
                  {allExpanded ? '− Collapse All' : '+ Expand All'}
                </button>
              </th>
              {MONTHS.map(mn => (
                <th key={mn} className="px-2 py-2 text-center text-xs font-medium text-gray-500 whitespace-nowrap">{mn}</th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-l border-gray-200 whitespace-nowrap">
                {year} Total
              </th>
            </tr>
          </thead>
          <tbody>
            {renderSectionHeader('INCOME', 'bg-green-50 text-green-800')}
            {renderCategories(incomeInvs, incomeCats, 'inc')}
            {renderTotalRow('TOTAL INCOME', incomeInvs)}
            {renderSpacer()}

            {renderSectionHeader('EXPENSES', 'bg-red-50 text-red-800')}
            {renderCategories(expenseInvs, expenseCats, 'exp')}
            {renderTotalRow('TOTAL EXPENSES', expenseInvs)}
            {renderSpacer()}

            <tr className="bg-gray-50 border-b border-gray-200">
              <td className="sticky left-0 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-900 z-10 whitespace-nowrap">
                NET PROFIT
              </td>
              {netProfitMonths.map((v, m) => (
                <td key={m} className={['px-2 py-2 text-right text-xs font-bold whitespace-nowrap', v >= 0 ? 'text-green-700' : 'text-red-600'].join(' ')}>
                  {fmtCell(Math.round(v * 100) / 100)}
                </td>
              ))}
              <td className={['px-3 py-2 text-right text-xs font-bold whitespace-nowrap border-l border-gray-200', netProfitTotal >= 0 ? 'text-green-700' : 'text-red-600'].join(' ')}>
                {fmtCell(Math.round(netProfitTotal * 100) / 100)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
