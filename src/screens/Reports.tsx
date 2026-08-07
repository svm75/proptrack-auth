import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import { logActivity } from '../services/activitylog'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING   = 233100000 // Expense
const TYPE_OUTGOING   = 233100001 // Income
const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006
const TAX_THRESHOLD   = 3000

type ReportTab = 'pnl' | 'igic' | 'rental' | 'tax'

const REPORT_TABS: { id: ReportTab; label: string; title: string }[] = [
  { id: 'pnl',    label: 'P&L',          title: 'Profit & Loss' },
  { id: 'igic',   label: 'IGIC Report',  title: 'IGIC Report' },
  { id: 'rental', label: 'Rental Report',title: 'Rental Report' },
  { id: 'tax',    label: 'Tax Report',   title: 'Tax Report — Suppliers over €3,000' },
]

// ---------- helpers ----------

function isActive(inv: Cr9b5_pt_invoices): boolean {
  return (inv.statecode as unknown as number) !== 1 && (inv.statecodename as unknown as string) !== 'Inactive'
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateForFile(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

function round2(n: number | undefined): number {
  return Math.round((n ?? 0) * 100) / 100
}

function getQuarter(iso: string | undefined): number {
  if (!iso) return 0
  return Math.floor(new Date(iso).getMonth() / 3) + 1
}

// ---------- print ----------

const PRINT_CSS = `
@media print {
  body.reports-print-mode * { visibility: hidden !important; }
  body.reports-print-mode .reports-print-content,
  body.reports-print-mode .reports-print-content * { visibility: visible !important; }
  body.reports-print-mode .reports-print-content {
    position: fixed; top: 0; left: 0; width: 100%; background: white; z-index: 9999;
  }
  body.reports-print-mode .no-print { display: none !important; }
}
`

function handlePrint(reportName: string) {
  const slug = reportName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const date = new Date().toISOString().slice(0, 10)
  const prev = document.title
  document.title = `proptrack-${slug}-${date}`
  document.body.classList.add('reports-print-mode')
  window.print()
  setTimeout(() => {
    document.title = prev
    document.body.classList.remove('reports-print-mode')
  }, 500)
}

// ---------- shared filter bar ----------

interface FilterBarProps {
  properties: Cr9b5_pt_properties[]
  filterFrom: string
  filterTo: string
  filterPropId: string
  onFrom: (v: string) => void
  onTo: (v: string) => void
  onProp: (v: string) => void
}

function FilterBar({ properties, filterFrom, filterTo, filterPropId, onFrom, onTo, onProp }: FilterBarProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center mb-5">
      <input
        type="date" value={filterFrom} onChange={e => onFrom(e.target.value)} title="From date"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <span className="text-gray-400 text-sm">—</span>
      <input
        type="date" value={filterTo} onChange={e => onTo(e.target.value)} title="To date"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <select
        value={filterPropId} onChange={e => onProp(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All properties</option>
        {properties.map(p => (
          <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
        ))}
      </select>
      {(filterFrom || filterTo || filterPropId) && (
        <button
          onClick={() => { onFrom(''); onTo(''); onProp('') }}
          className="text-xs text-gray-400 hover:text-gray-700 underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

// ---------- main component ----------

export default function Reports() {
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ReportTab>('pnl')

  // Shared filters (P&L / IGIC / Rental)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterPropId, setFilterPropId] = useState('')

  // Tax Report uses a calendar year instead of a from/to range
  const currentYear = new Date().getFullYear()
  const [taxYear, setTaxYear] = useState(currentYear)

  // Inject print CSS once
  useEffect(() => {
    const el = document.createElement('style')
    el.id = 'reports-print-style'
    el.textContent = PRINT_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [invRes, propRes, conRes, catRes] = await Promise.all([
        Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date asc'], maxPageSize: 5000 }),
        Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ maxPageSize: 5000 }),
        Cr9b5_pt_referencesService.getAll({
          filter: `cr9b5_referencetype eq ${REF_CAT_INCOME} or cr9b5_referencetype eq ${REF_CAT_EXPENSE}`,
          maxPageSize: 5000,
        }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setContacts(conRes.data ?? [])
      const map: Record<string, string> = {}
      for (const ref of catRes.data ?? []) {
        if (ref.cr9b5_pt_referenceid && ref.cr9b5_value) map[ref.cr9b5_pt_referenceid] = ref.cr9b5_value
      }
      setCategoryMap(map)
      setLoading(false)
    }
    load()
  }, [])

  const propertyById = useMemo(() => new Map(properties.map(p => [p.cr9b5_pt_propertyid, p])), [properties])
  const contactById = useMemo(() => new Map(contacts.map(c => [c.cr9b5_pt_contactid, c])), [contacts])

  function propName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    if (raw['cr9b5_allproperties']) return 'All'
    const id = raw['_cr9b5_property_value'] as string | undefined
    return (id && propertyById.get(id)?.cr9b5_name) ?? '—'
  }

  function contactName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_contact_value'] as string | undefined
    return (id && contactById.get(id)?.cr9b5_name) ?? '—'
  }

  function categoryName(inv: Cr9b5_pt_invoices): string {
    const raw = inv as unknown as Record<string, unknown>
    const id = raw['_cr9b5_categoryid_value'] as string | undefined
    return (id && categoryMap[id]) || 'Uncategorized'
  }

  // Shared filtered set for P&L / IGIC / Rental — active invoices in the
  // selected date range and property (an "All Properties" invoice counts
  // toward every property, so it's kept regardless of the property filter).
  const filtered = useMemo(() => invoices.filter(inv => {
    if (!isActive(inv)) return false
    if (filterFrom && inv.cr9b5_date && inv.cr9b5_date < new Date(filterFrom).toISOString()) return false
    if (filterTo && inv.cr9b5_date && inv.cr9b5_date > new Date(filterTo + 'T23:59:59').toISOString()) return false
    if (filterPropId) {
      const raw = inv as unknown as Record<string, unknown>
      if (!raw['cr9b5_allproperties'] && raw['_cr9b5_property_value'] !== filterPropId) return false
    }
    return true
  }), [invoices, filterFrom, filterTo, filterPropId])

  // ---------- (1) P&L ----------

  const pnl = useMemo(() => {
    const incomeByCat = new Map<string, number>()
    const expenseByCat = new Map<string, number>()
    let totalIncome = 0, totalExpense = 0, incomeTax = 0, expenseTax = 0
    for (const inv of filtered) {
      const cat = categoryName(inv)
      const net = inv.cr9b5_baseamount ?? 0
      const tax = inv.cr9b5_taxamount ?? 0
      if ((inv.cr9b5_type as unknown as number) === TYPE_OUTGOING) {
        incomeByCat.set(cat, (incomeByCat.get(cat) ?? 0) + net)
        totalIncome += net
        incomeTax += tax
      } else {
        expenseByCat.set(cat, (expenseByCat.get(cat) ?? 0) + net)
        totalExpense += net
        expenseTax += tax
      }
    }
    const toRows = (m: Map<string, number>) =>
      [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    return {
      incomeRows: toRows(incomeByCat),
      expenseRows: toRows(expenseByCat),
      totalIncome, totalExpense, incomeTax, expenseTax,
      net: totalIncome - totalExpense,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, categoryMap])

  // ---------- (2)/(3) IGIC Report ----------

  const igicRows = useMemo(() => filtered.map(inv => {
    const isIncome = (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING
    return {
      id: inv.cr9b5_pt_invoiceid,
      date: inv.cr9b5_date,
      invoiceNo: inv.cr9b5_internalid,
      property: propName(inv),
      counterpart: contactName(inv),
      expenseNet:   isIncome ? 0 : (inv.cr9b5_baseamount ?? 0),
      expenseIgic:  isIncome ? 0 : (inv.cr9b5_taxamount ?? 0),
      expenseGross: isIncome ? 0 : (inv.cr9b5_totalgross ?? 0),
      incomeNet:    isIncome ? (inv.cr9b5_baseamount ?? 0) : 0,
      incomeIgic:   isIncome ? (inv.cr9b5_taxamount ?? 0) : 0,
      incomeGross:  isIncome ? (inv.cr9b5_totalgross ?? 0) : 0,
      rentStart: inv.cr9b5_checkin,
      rentEnd: inv.cr9b5_checkout,
      reservationId: inv.cr9b5_bookingreference,
      adults: inv.cr9b5_adults ?? 0,
      children: inv.cr9b5_children ?? 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, propertyById, contactById])

  const igicTotals = useMemo(() => igicRows.reduce((acc, r) => ({
    expenseNet: acc.expenseNet + r.expenseNet,
    expenseIgic: acc.expenseIgic + r.expenseIgic,
    expenseGross: acc.expenseGross + r.expenseGross,
    incomeNet: acc.incomeNet + r.incomeNet,
    incomeIgic: acc.incomeIgic + r.incomeIgic,
    incomeGross: acc.incomeGross + r.incomeGross,
  }), { expenseNet: 0, expenseIgic: 0, expenseGross: 0, incomeNet: 0, incomeIgic: 0, incomeGross: 0 }), [igicRows])

  function exportIgicExcel() {
    const rows = igicRows.map(r => ({
      'Date': fmtDate(r.date),
      'Invoice No': r.invoiceNo,
      'Property': r.property,
      'Counterpart': r.counterpart,
      'Expense Net': round2(r.expenseNet),
      'Expense IGIC': round2(r.expenseIgic),
      'Expense Gross': round2(r.expenseGross),
      'Income Net': round2(r.incomeNet),
      'Income IGIC': round2(r.incomeIgic),
      'Income Gross': round2(r.incomeGross),
      'Rent Start Date': fmtDate(r.rentStart),
      'Rent End Date': fmtDate(r.rentEnd),
      'Reservation ID': r.reservationId ?? '',
      'Adults': r.adults,
      'Children': r.children,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'IGIC Report')
    const filename = `igic-report_${fmtDateForFile(filterFrom) || 'all'}_to_${fmtDateForFile(filterTo) || 'all'}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'IGIC report', filename)
  }

  // ---------- (4)/(5) Rental Report ----------

  const rentalRows = useMemo(() => filtered
    .filter(inv => (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING && inv.cr9b5_checkin)
    .map(inv => {
      const nights = inv.cr9b5_nights ?? 0
      const gross = inv.cr9b5_totalgross ?? 0
      const avgNight = nights > 0 ? gross / nights : 0
      const adults = inv.cr9b5_adults ?? 0
      const children = inv.cr9b5_children ?? 0
      const babies = inv.cr9b5_babies ?? 0
      return {
        id: inv.cr9b5_pt_invoiceid,
        property: propName(inv),
        startDate: inv.cr9b5_checkin,
        endDate: inv.cr9b5_checkout,
        nights,
        client: contactName(inv),
        avgNight,
        incomeNet: inv.cr9b5_baseamount ?? 0,
        incomeIgic: inv.cr9b5_taxamount ?? 0,
        incomeGross: gross,
        bookingId: inv.cr9b5_bookingreference,
        totalPeople: adults + children + babies,
        adults, children, babies,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , [filtered, contactById])

  const rentalTotals = useMemo(() => rentalRows.reduce((acc, r) => ({
    nights: acc.nights + r.nights,
    incomeNet: acc.incomeNet + r.incomeNet,
    incomeIgic: acc.incomeIgic + r.incomeIgic,
    incomeGross: acc.incomeGross + r.incomeGross,
    totalPeople: acc.totalPeople + r.totalPeople,
    adults: acc.adults + r.adults,
    children: acc.children + r.children,
    babies: acc.babies + r.babies,
  }), { nights: 0, incomeNet: 0, incomeIgic: 0, incomeGross: 0, totalPeople: 0, adults: 0, children: 0, babies: 0 }), [rentalRows])

  function exportRentalExcel() {
    const rows = rentalRows.map(r => ({
      'Property': r.property,
      'Start Date': fmtDate(r.startDate),
      'End Date': fmtDate(r.endDate),
      'Nights': r.nights,
      'Client': r.client,
      'avgNight': round2(r.avgNight),
      'Income Net': round2(r.incomeNet),
      'Income IGIC': round2(r.incomeIgic),
      'Income Gross': round2(r.incomeGross),
      'Booking ID': r.bookingId ?? '',
      'Total People': r.totalPeople,
      'Adults': r.adults,
      'Children': r.children,
      'Babies': r.babies,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rental Report')
    const filename = `rental-report_${fmtDateForFile(filterFrom) || 'all'}_to_${fmtDateForFile(filterTo) || 'all'}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'Rental report', filename)
  }

  // ---------- (6) Tax Report ----------

  const taxYears = useMemo(() => {
    const s = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) s.add(inv.cr9b5_year) })
    const arr = Array.from(s).sort((a, b) => b - a)
    return arr.length ? arr : [currentYear]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices])

  const taxRows = useMemo(() => {
    const yearStart = `${taxYear}-01-01T00:00:00.000Z`
    const yearEnd   = `${taxYear}-12-31T23:59:59.999Z`
    const grouped = new Map<string, { q1: number; q2: number; q3: number; q4: number }>()
    for (const inv of invoices) {
      if (!isActive(inv)) continue
      if ((inv.cr9b5_type as unknown as number) !== TYPE_INCOMING) continue // suppliers = expense invoices
      if (!inv.cr9b5_date || inv.cr9b5_date < yearStart || inv.cr9b5_date > yearEnd) continue
      if (filterPropId) {
        const raw = inv as unknown as Record<string, unknown>
        if (!raw['cr9b5_allproperties'] && raw['_cr9b5_property_value'] !== filterPropId) continue
      }
      const name = contactName(inv)
      const q = getQuarter(inv.cr9b5_date)
      if (q < 1 || q > 4) continue
      const entry = grouped.get(name) ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
      entry[`q${q}` as 'q1' | 'q2' | 'q3' | 'q4'] += inv.cr9b5_baseamount ?? 0
      grouped.set(name, entry)
    }
    return [...grouped.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.q1 + v.q2 + v.q3 + v.q4 }))
      // "add them as soon as they exceed year-to-date the €3,000" — a
      // supplier is included once their cumulative net for the year passes
      // the threshold, which for a full calendar year is exactly total > 3000.
      .filter(r => r.total > TAX_THRESHOLD)
      .sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, taxYear, filterPropId, contactById])

  const taxTotal = useMemo(() => taxRows.reduce((acc, r) => ({
    q1: acc.q1 + r.q1, q2: acc.q2 + r.q2, q3: acc.q3 + r.q3, q4: acc.q4 + r.q4, total: acc.total + r.total,
  }), { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }), [taxRows])

  const activeTab = REPORT_TABS.find(t => t.id === tab)!

  return (
    <div className="p-6 max-w-[83rem]">
      <div className="flex items-start justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Reports</h1>
          <p className="text-sm text-gray-500 mb-5">Standard financial reports across properties.</p>
        </div>
        <button
          onClick={() => handlePrint(activeTab.title)}
          className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors shrink-0"
        >
          ↓ Export PDF
        </button>
      </div>

      {/* Tabs */}
      <div className="no-print flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-wrap mb-6 w-fit">
        {REPORT_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="reports-print-content">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{activeTab.title}</h2>
          {/* ── (1) P&L ── */}
          {tab === 'pnl' && (
            <div>
              <FilterBar
                properties={properties}
                filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId}
                onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-green-50 border-b border-green-100">
                    <span className="text-xs font-semibold uppercase tracking-wide text-green-700">Income</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {pnl.incomeRows.length === 0 && (
                        <tr><td className="px-4 py-3 text-gray-400 text-sm">No income in this period.</td></tr>
                      )}
                      {pnl.incomeRows.map(r => (
                        <tr key={r.name} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2 text-gray-700">{r.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-800">{fmtEur(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <td className="px-4 py-2.5 text-gray-800">Total Income (net)</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-green-700">{fmtEur(pnl.totalIncome)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-gray-500 text-xs">IGIC on income</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">{fmtEur(pnl.incomeTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-red-50 border-b border-red-100">
                    <span className="text-xs font-semibold uppercase tracking-wide text-red-700">Expenses</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {pnl.expenseRows.length === 0 && (
                        <tr><td className="px-4 py-3 text-gray-400 text-sm">No expenses in this period.</td></tr>
                      )}
                      {pnl.expenseRows.map(r => (
                        <tr key={r.name} className="border-b border-gray-50 last:border-0">
                          <td className="px-4 py-2 text-gray-700">{r.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-800">{fmtEur(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                        <td className="px-4 py-2.5 text-gray-800">Total Expenses (net)</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{fmtEur(pnl.totalExpense)}</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-gray-500 text-xs">IGIC on expenses</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500 text-xs">{fmtEur(pnl.expenseTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 max-w-md">
                <span className="text-sm font-semibold text-gray-700">Net Result</span>
                <span className={['text-xl font-bold tabular-nums', pnl.net >= 0 ? 'text-green-700' : 'text-red-600'].join(' ')}>
                  {fmtEur(pnl.net)}
                </span>
              </div>
            </div>
          )}

          {/* ── (2)/(3) IGIC Report ── */}
          {tab === 'igic' && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <FilterBar
                  properties={properties}
                  filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId}
                  onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId}
                />
                <button
                  onClick={exportIgicExcel}
                  disabled={igicRows.length === 0}
                  className="no-print mb-5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  ↓ Export Excel
                </button>
              </div>
              <div className="overflow-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-xs min-w-[1400px]">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                    <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Invoice No</th>
                      <th className="px-3 py-2.5">Property</th>
                      <th className="px-3 py-2.5">Counterpart</th>
                      <th className="px-3 py-2.5 text-right">Expense Net</th>
                      <th className="px-3 py-2.5 text-right">Expense IGIC</th>
                      <th className="px-3 py-2.5 text-right">Expense Gross</th>
                      <th className="px-3 py-2.5 text-right">Income Net</th>
                      <th className="px-3 py-2.5 text-right">Income IGIC</th>
                      <th className="px-3 py-2.5 text-right">Income Gross</th>
                      <th className="px-3 py-2.5">Rent Start</th>
                      <th className="px-3 py-2.5">Rent End</th>
                      <th className="px-3 py-2.5">Reservation ID</th>
                      <th className="px-3 py-2.5 text-right">Adults</th>
                      <th className="px-3 py-2.5 text-right">Children</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {igicRows.length === 0 ? (
                      <tr><td colSpan={15} className="px-3 py-6 text-center text-gray-400">No invoices match the current filters.</td></tr>
                    ) : igicRows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{r.invoiceNo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.property}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.counterpart}</td>
                        <td className="px-3 py-2 text-right">{r.expenseNet ? fmtEur(r.expenseNet) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.expenseIgic ? fmtEur(r.expenseIgic) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.expenseGross ? fmtEur(r.expenseGross) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.incomeNet ? fmtEur(r.incomeNet) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.incomeIgic ? fmtEur(r.incomeIgic) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.incomeGross ? fmtEur(r.incomeGross) : '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.rentStart)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.rentEnd)}</td>
                        <td className="px-3 py-2 text-gray-500">{r.reservationId || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.adults || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.children || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {igicRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                        <td className="px-3 py-2.5" colSpan={4}>Total</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.expenseNet)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.expenseIgic)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.expenseGross)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.incomeNet)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.incomeIgic)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(igicTotals.incomeGross)}</td>
                        <td colSpan={5}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ── (4)/(5) Rental Report ── */}
          {tab === 'rental' && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <FilterBar
                  properties={properties}
                  filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId}
                  onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId}
                />
                <button
                  onClick={exportRentalExcel}
                  disabled={rentalRows.length === 0}
                  className="no-print mb-5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  ↓ Export Excel
                </button>
              </div>
              <div className="overflow-auto border border-gray-200 rounded-xl bg-white">
                <table className="w-full text-xs min-w-[1200px]">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                    <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
                      <th className="px-3 py-2.5">Property</th>
                      <th className="px-3 py-2.5">Start Date</th>
                      <th className="px-3 py-2.5">End Date</th>
                      <th className="px-3 py-2.5 text-right">Nights</th>
                      <th className="px-3 py-2.5">Client</th>
                      <th className="px-3 py-2.5 text-right">avgNight</th>
                      <th className="px-3 py-2.5 text-right">Income Net</th>
                      <th className="px-3 py-2.5 text-right">Income IGIC</th>
                      <th className="px-3 py-2.5 text-right">Income Gross</th>
                      <th className="px-3 py-2.5">Booking ID</th>
                      <th className="px-3 py-2.5 text-right">Total People</th>
                      <th className="px-3 py-2.5 text-right">Adults</th>
                      <th className="px-3 py-2.5 text-right">Children</th>
                      <th className="px-3 py-2.5 text-right">Babies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rentalRows.length === 0 ? (
                      <tr><td colSpan={14} className="px-3 py-6 text-center text-gray-400">No rental stays match the current filters.</td></tr>
                    ) : rentalRows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap">{r.property}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.startDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.endDate)}</td>
                        <td className="px-3 py-2 text-right">{r.nights}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.client}</td>
                        <td className="px-3 py-2 text-right">{fmtEur(r.avgNight)}</td>
                        <td className="px-3 py-2 text-right">{fmtEur(r.incomeNet)}</td>
                        <td className="px-3 py-2 text-right">{fmtEur(r.incomeIgic)}</td>
                        <td className="px-3 py-2 text-right">{fmtEur(r.incomeGross)}</td>
                        <td className="px-3 py-2 text-gray-500">{r.bookingId || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.totalPeople || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.adults || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.children || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.babies || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {rentalRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                        <td className="px-3 py-2.5" colSpan={3}>Total</td>
                        <td className="px-3 py-2.5 text-right">{rentalTotals.nights}</td>
                        <td></td>
                        <td></td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(rentalTotals.incomeNet)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(rentalTotals.incomeIgic)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtEur(rentalTotals.incomeGross)}</td>
                        <td></td>
                        <td className="px-3 py-2.5 text-right">{rentalTotals.totalPeople}</td>
                        <td className="px-3 py-2.5 text-right">{rentalTotals.adults}</td>
                        <td className="px-3 py-2.5 text-right">{rentalTotals.children}</td>
                        <td className="px-3 py-2.5 text-right">{rentalTotals.babies}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* ── (6) Tax Report ── */}
          {tab === 'tax' && (
            <div>
              <div className="flex flex-wrap gap-2 items-center mb-5">
                <select
                  value={taxYear} onChange={e => setTaxYear(Number(e.target.value))}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {taxYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={filterPropId} onChange={e => setFilterPropId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All properties</option>
                  {properties.map(p => (
                    <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Suppliers whose net expenses exceeded € {TAX_THRESHOLD.toLocaleString('de-DE')} in {taxYear}.
              </p>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Supplier</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Q1</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Q2</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Q3</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Q4</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxRows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No suppliers above the € {TAX_THRESHOLD.toLocaleString('de-DE')} threshold for {taxYear}.</td></tr>
                    ) : taxRows.map(r => (
                      <tr key={r.name} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{r.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtEur(r.q1)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtEur(r.q2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtEur(r.q3)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">{fmtEur(r.q4)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmtEur(r.total)}</td>
                      </tr>
                    ))}
                    {taxRows.length > 0 && (
                      <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                        <td className="px-4 py-2.5 text-gray-800">Total</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(taxTotal.q1)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(taxTotal.q2)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(taxTotal.q3)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(taxTotal.q4)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(taxTotal.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
