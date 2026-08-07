import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { makeStyles, tokens, Button, Text, TabList, Tab, type SelectTabData, type SelectTabEvent } from '@fluentui/react-components'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'

const TYPE_INCOMING   = 233100000 // Expense
const TYPE_OUTGOING   = 233100001 // Income
const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006
const TAX_THRESHOLD   = 3000

type ReportTab = 'pnl' | 'igic' | 'rental' | 'tax'

const REPORT_TABS: { id: ReportTab; label: string; title: string }[] = [
  { id: 'pnl',    label: 'P&L',           title: 'Profit & Loss' },
  { id: 'igic',   label: 'IGIC Report',   title: 'IGIC Report' },
  { id: 'rental', label: 'Rental Report', title: 'Rental Report' },
  { id: 'tax',    label: 'Tax Report',    title: 'Tax Report — Suppliers over €3,000' },
]

function isActive(inv: Cr9b5_pt_invoices): boolean {
  return (inv.statecode as unknown as number) !== 1 && (inv.statecodename as unknown as string) !== 'Inactive'
}
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateForFile(iso: string | undefined): string { return iso ? iso.slice(0, 10) : '' }
function round2(n: number | undefined): number { return Math.round((n ?? 0) * 100) / 100 }
function getQuarter(iso: string | undefined): number { return iso ? Math.floor(new Date(iso).getMonth() / 3) + 1 : 0 }

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
  setTimeout(() => { document.title = prev; document.body.classList.remove('reports-print-mode') }, 500)
}

const useStyles = makeStyles({
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' },
  filterBar: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '16px' },
  panel: { backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden' },
  panelHeaderIncome: { padding: '10px 16px', backgroundColor: tokens.colorPaletteGreenBackground1, borderBottom: `1px solid ${tokens.colorPaletteGreenBorder1}` },
  panelHeaderExpense: { padding: '10px 16px', backgroundColor: tokens.colorPaletteRedBackground1, borderBottom: `1px solid ${tokens.colorPaletteRedBorder1}` },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  table: { width: '100%', fontSize: '14px', borderCollapse: 'collapse' },
  tableSm: { width: '100%', fontSize: '12px', minWidth: '1200px', borderCollapse: 'collapse' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase' },
  td: { padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  totalRow: { backgroundColor: tokens.colorNeutralBackground2, fontWeight: 600 },
  netResult: { marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: '16px 20px', maxWidth: '420px' },
  tableWrap: { overflow: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, backgroundColor: tokens.colorNeutralBackground1 },
})

interface FilterBarProps {
  properties: Cr9b5_pt_properties[]; filterFrom: string; filterTo: string; filterPropId: string
  onFrom: (v: string) => void; onTo: (v: string) => void; onProp: (v: string) => void
}
function FilterBar({ properties, filterFrom, filterTo, filterPropId, onFrom, onTo, onProp }: FilterBarProps) {
  const s = useStyles()
  return (
    <div className={s.filterBar}>
      <input type="date" value={filterFrom} onChange={e => onFrom(e.target.value)} title="From date" style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}` }} />
      <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
      <input type="date" value={filterTo} onChange={e => onTo(e.target.value)} title="To date" style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}` }} />
      <select value={filterPropId} onChange={e => onProp(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}` }}>
        <option value="">All properties</option>
        {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
      </select>
      {(filterFrom || filterTo || filterPropId) && (
        <Button appearance="transparent" size="small" onClick={() => { onFrom(''); onTo(''); onProp('') }}>Clear filters</Button>
      )}
    </div>
  )
}

export default function Reports() {
  const s = useStyles()
  const [invoices, setInvoices] = useState<Cr9b5_pt_invoices[]>([])
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ReportTab>('pnl')

  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterPropId, setFilterPropId] = useState('')

  const currentYear = new Date().getFullYear()
  const [taxYear, setTaxYear] = useState(currentYear)

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
        Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_INCOME} or cr9b5_referencetype eq ${REF_CAT_EXPENSE}`, maxPageSize: 5000 }),
      ])
      setInvoices(invRes.data ?? [])
      setProperties(propRes.data ?? [])
      setContacts(conRes.data ?? [])
      const map: Record<string, string> = {}
      for (const ref of catRes.data ?? []) if (ref.cr9b5_pt_referenceid && ref.cr9b5_value) map[ref.cr9b5_pt_referenceid] = ref.cr9b5_value
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
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_contact_value'] as string | undefined
    return (id && contactById.get(id)?.cr9b5_name) ?? '—'
  }
  function categoryName(inv: Cr9b5_pt_invoices): string {
    const id = (inv as unknown as Record<string, unknown>)['_cr9b5_categoryid_value'] as string | undefined
    return (id && categoryMap[id]) || 'Uncategorized'
  }

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

  const pnl = useMemo(() => {
    const incomeByCat = new Map<string, number>(); const expenseByCat = new Map<string, number>()
    let totalIncome = 0, totalExpense = 0, incomeTax = 0, expenseTax = 0
    for (const inv of filtered) {
      const cat = categoryName(inv); const net = inv.cr9b5_baseamount ?? 0; const tax = inv.cr9b5_taxamount ?? 0
      if ((inv.cr9b5_type as unknown as number) === TYPE_OUTGOING) { incomeByCat.set(cat, (incomeByCat.get(cat) ?? 0) + net); totalIncome += net; incomeTax += tax }
      else { expenseByCat.set(cat, (expenseByCat.get(cat) ?? 0) + net); totalExpense += net; expenseTax += tax }
    }
    const toRows = (m: Map<string, number>) => [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    return { incomeRows: toRows(incomeByCat), expenseRows: toRows(expenseByCat), totalIncome, totalExpense, incomeTax, expenseTax, net: totalIncome - totalExpense }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, categoryMap])

  const igicRows = useMemo(() => filtered.map(inv => {
    const isIncome = (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING
    return {
      id: inv.cr9b5_pt_invoiceid, date: inv.cr9b5_date, invoiceNo: inv.cr9b5_internalid, property: propName(inv), counterpart: contactName(inv),
      expenseNet: isIncome ? 0 : (inv.cr9b5_baseamount ?? 0), expenseIgic: isIncome ? 0 : (inv.cr9b5_taxamount ?? 0), expenseGross: isIncome ? 0 : (inv.cr9b5_totalgross ?? 0),
      incomeNet: isIncome ? (inv.cr9b5_baseamount ?? 0) : 0, incomeIgic: isIncome ? (inv.cr9b5_taxamount ?? 0) : 0, incomeGross: isIncome ? (inv.cr9b5_totalgross ?? 0) : 0,
      rentStart: inv.cr9b5_checkin, rentEnd: inv.cr9b5_checkout, reservationId: inv.cr9b5_bookingreference, adults: inv.cr9b5_adults ?? 0, children: inv.cr9b5_children ?? 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, propertyById, contactById])

  const igicTotals = useMemo(() => igicRows.reduce((acc, r) => ({
    expenseNet: acc.expenseNet + r.expenseNet, expenseIgic: acc.expenseIgic + r.expenseIgic, expenseGross: acc.expenseGross + r.expenseGross,
    incomeNet: acc.incomeNet + r.incomeNet, incomeIgic: acc.incomeIgic + r.incomeIgic, incomeGross: acc.incomeGross + r.incomeGross,
  }), { expenseNet: 0, expenseIgic: 0, expenseGross: 0, incomeNet: 0, incomeIgic: 0, incomeGross: 0 }), [igicRows])

  function exportIgicExcel() {
    const rows = igicRows.map(r => ({
      'Date': fmtDate(r.date), 'Invoice No': r.invoiceNo, 'Property': r.property, 'Counterpart': r.counterpart,
      'Expense Net': round2(r.expenseNet), 'Expense IGIC': round2(r.expenseIgic), 'Expense Gross': round2(r.expenseGross),
      'Income Net': round2(r.incomeNet), 'Income IGIC': round2(r.incomeIgic), 'Income Gross': round2(r.incomeGross),
      'Rent Start Date': fmtDate(r.rentStart), 'Rent End Date': fmtDate(r.rentEnd), 'Reservation ID': r.reservationId ?? '', 'Adults': r.adults, 'Children': r.children,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'IGIC Report')
    const filename = `igic-report_${fmtDateForFile(filterFrom) || 'all'}_to_${fmtDateForFile(filterTo) || 'all'}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'IGIC report', filename)
  }

  const rentalRows = useMemo(() => filtered.filter(inv => (inv.cr9b5_type as unknown as number) === TYPE_OUTGOING && inv.cr9b5_checkin).map(inv => {
    const nights = inv.cr9b5_nights ?? 0; const gross = inv.cr9b5_totalgross ?? 0
    const adults = inv.cr9b5_adults ?? 0, children = inv.cr9b5_children ?? 0, babies = inv.cr9b5_babies ?? 0
    return {
      id: inv.cr9b5_pt_invoiceid, property: propName(inv), startDate: inv.cr9b5_checkin, endDate: inv.cr9b5_checkout, nights,
      client: contactName(inv), avgNight: nights > 0 ? gross / nights : 0, incomeNet: inv.cr9b5_baseamount ?? 0, incomeIgic: inv.cr9b5_taxamount ?? 0,
      incomeGross: gross, bookingId: inv.cr9b5_bookingreference, totalPeople: adults + children + babies, adults, children, babies,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, contactById])

  const rentalTotals = useMemo(() => rentalRows.reduce((acc, r) => ({
    nights: acc.nights + r.nights, incomeNet: acc.incomeNet + r.incomeNet, incomeIgic: acc.incomeIgic + r.incomeIgic, incomeGross: acc.incomeGross + r.incomeGross,
    totalPeople: acc.totalPeople + r.totalPeople, adults: acc.adults + r.adults, children: acc.children + r.children, babies: acc.babies + r.babies,
  }), { nights: 0, incomeNet: 0, incomeIgic: 0, incomeGross: 0, totalPeople: 0, adults: 0, children: 0, babies: 0 }), [rentalRows])

  function exportRentalExcel() {
    const rows = rentalRows.map(r => ({
      'Property': r.property, 'Start Date': fmtDate(r.startDate), 'End Date': fmtDate(r.endDate), 'Nights': r.nights, 'Client': r.client,
      'avgNight': round2(r.avgNight), 'Income Net': round2(r.incomeNet), 'Income IGIC': round2(r.incomeIgic), 'Income Gross': round2(r.incomeGross),
      'Booking ID': r.bookingId ?? '', 'Total People': r.totalPeople, 'Adults': r.adults, 'Children': r.children, 'Babies': r.babies,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rental Report')
    const filename = `rental-report_${fmtDateForFile(filterFrom) || 'all'}_to_${fmtDateForFile(filterTo) || 'all'}.xlsx`
    XLSX.writeFile(wb, filename)
    logActivity('Exported', 'Invoice', 'Rental report', filename)
  }

  const taxYears = useMemo(() => {
    const set = new Set<number>()
    invoices.forEach(inv => { if (inv.cr9b5_year) set.add(inv.cr9b5_year) })
    const arr = Array.from(set).sort((a, b) => b - a)
    return arr.length ? arr : [currentYear]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices])

  const taxRows = useMemo(() => {
    const yearStart = `${taxYear}-01-01T00:00:00.000Z`; const yearEnd = `${taxYear}-12-31T23:59:59.999Z`
    const grouped = new Map<string, { q1: number; q2: number; q3: number; q4: number }>()
    for (const inv of invoices) {
      if (!isActive(inv)) continue
      if ((inv.cr9b5_type as unknown as number) !== TYPE_INCOMING) continue
      if (!inv.cr9b5_date || inv.cr9b5_date < yearStart || inv.cr9b5_date > yearEnd) continue
      if (filterPropId) {
        const raw = inv as unknown as Record<string, unknown>
        if (!raw['cr9b5_allproperties'] && raw['_cr9b5_property_value'] !== filterPropId) continue
      }
      const name = contactName(inv); const q = getQuarter(inv.cr9b5_date)
      if (q < 1 || q > 4) continue
      const entry = grouped.get(name) ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
      entry[`q${q}` as 'q1' | 'q2' | 'q3' | 'q4'] += inv.cr9b5_baseamount ?? 0
      grouped.set(name, entry)
    }
    return [...grouped.entries()].map(([name, v]) => ({ name, ...v, total: v.q1 + v.q2 + v.q3 + v.q4 })).filter(r => r.total > TAX_THRESHOLD).sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, taxYear, filterPropId, contactById])

  const taxTotal = useMemo(() => taxRows.reduce((acc, r) => ({ q1: acc.q1 + r.q1, q2: acc.q2 + r.q2, q3: acc.q3 + r.q3, q4: acc.q4 + r.q4, total: acc.total + r.total }), { q1: 0, q2: 0, q3: 0, q4: 0, total: 0 }), [taxRows])

  const activeTab = REPORT_TABS.find(t => t.id === tab)!

  return (
    <div style={{ maxWidth: '1330px' }}>
      <div className={`${s.header} no-print`}>
        <div>
          <Text size={600} weight="semibold" style={{ display: 'block' }}>Reports</Text>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>Standard financial reports across properties.</Text>
        </div>
        <Button appearance="secondary" onClick={() => handlePrint(activeTab.title)}>↓ Export PDF</Button>
      </div>

      <TabList className="no-print" selectedValue={tab} onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as ReportTab)} style={{ margin: '16px 0' }}>
        {REPORT_TABS.map(t => <Tab key={t.id} value={t.id}>{t.label}</Tab>)}
      </TabList>

      {loading ? <Text style={{ color: tokens.colorNeutralForeground3 }}>Loading…</Text> : (
        <div className="reports-print-content">
          <Text size={500} weight="semibold" style={{ display: 'block', marginBottom: 16 }}>{activeTab.title}</Text>

          {tab === 'pnl' && (
            <div>
              <FilterBar properties={properties} filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId} onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId} />
              <div className={s.grid2}>
                <div className={s.panel}>
                  <div className={s.panelHeaderIncome}><Text size={200} weight="semibold" style={{ color: tokens.colorPaletteGreenForeground1, textTransform: 'uppercase' }}>Income</Text></div>
                  <table className={s.table}>
                    <tbody>
                      {pnl.incomeRows.length === 0 && <tr><td className={s.td} style={{ color: tokens.colorNeutralForeground4 }}>No income in this period.</td></tr>}
                      {pnl.incomeRows.map(r => <tr key={r.name}><td className={s.td}>{r.name}</td><td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.amount)}</td></tr>)}
                      <tr className={s.totalRow}><td className={s.td}>Total Income (net)</td><td className={s.td} style={{ textAlign: 'right', color: tokens.colorPaletteGreenForeground1 }}>{formatMoney(pnl.totalIncome)}</td></tr>
                      <tr><td className={s.td} style={{ fontSize: '12px', color: tokens.colorNeutralForeground4 }}>IGIC on income</td><td className={s.td} style={{ textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground4 }}>{formatMoney(pnl.incomeTax)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className={s.panel}>
                  <div className={s.panelHeaderExpense}><Text size={200} weight="semibold" style={{ color: tokens.colorPaletteRedForeground1, textTransform: 'uppercase' }}>Expenses</Text></div>
                  <table className={s.table}>
                    <tbody>
                      {pnl.expenseRows.length === 0 && <tr><td className={s.td} style={{ color: tokens.colorNeutralForeground4 }}>No expenses in this period.</td></tr>}
                      {pnl.expenseRows.map(r => <tr key={r.name}><td className={s.td}>{r.name}</td><td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.amount)}</td></tr>)}
                      <tr className={s.totalRow}><td className={s.td}>Total Expenses (net)</td><td className={s.td} style={{ textAlign: 'right', color: tokens.colorPaletteRedForeground1 }}>{formatMoney(pnl.totalExpense)}</td></tr>
                      <tr><td className={s.td} style={{ fontSize: '12px', color: tokens.colorNeutralForeground4 }}>IGIC on expenses</td><td className={s.td} style={{ textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground4 }}>{formatMoney(pnl.expenseTax)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={s.netResult}>
                <Text weight="semibold">Net Result</Text>
                <Text size={600} weight="bold" style={{ color: pnl.net >= 0 ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>{formatMoney(pnl.net)}</Text>
              </div>
            </div>
          )}

          {tab === 'igic' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <FilterBar properties={properties} filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId} onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId} />
                <Button className="no-print" appearance="secondary" disabled={igicRows.length === 0} onClick={exportIgicExcel} style={{ height: 'fit-content' }}>↓ Export Excel</Button>
              </div>
              <div className={s.tableWrap}>
                <table className={s.tableSm}>
                  <thead><tr>
                    <th className={s.th}>Date</th><th className={s.th}>Invoice No</th><th className={s.th}>Property</th><th className={s.th}>Counterpart</th>
                    <th className={s.th}>Expense Net</th><th className={s.th}>Expense IGIC</th><th className={s.th}>Expense Gross</th>
                    <th className={s.th}>Income Net</th><th className={s.th}>Income IGIC</th><th className={s.th}>Income Gross</th>
                    <th className={s.th}>Rent Start</th><th className={s.th}>Rent End</th><th className={s.th}>Reservation ID</th><th className={s.th}>Adults</th><th className={s.th}>Children</th>
                  </tr></thead>
                  <tbody>
                    {igicRows.length === 0 ? <tr><td className={s.td} colSpan={15} style={{ textAlign: 'center', color: tokens.colorNeutralForeground4 }}>No invoices match the current filters.</td></tr> : igicRows.map(r => (
                      <tr key={r.id}>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                        <td className={s.td} style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.invoiceNo}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{r.property}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{r.counterpart}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.expenseNet ? formatMoney(r.expenseNet) : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.expenseIgic ? formatMoney(r.expenseIgic) : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.expenseGross ? formatMoney(r.expenseGross) : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.incomeNet ? formatMoney(r.incomeNet) : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.incomeIgic ? formatMoney(r.incomeIgic) : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.incomeGross ? formatMoney(r.incomeGross) : '—'}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.rentStart)}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.rentEnd)}</td>
                        <td className={s.td} style={{ color: tokens.colorNeutralForeground4 }}>{r.reservationId || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.adults || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.children || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {igicRows.length > 0 && (
                    <tfoot><tr className={s.totalRow}>
                      <td className={s.td} colSpan={4}>Total</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.expenseNet)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.expenseIgic)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.expenseGross)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.incomeNet)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.incomeIgic)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(igicTotals.incomeGross)}</td>
                      <td className={s.td} colSpan={5} />
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {tab === 'rental' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <FilterBar properties={properties} filterFrom={filterFrom} filterTo={filterTo} filterPropId={filterPropId} onFrom={setFilterFrom} onTo={setFilterTo} onProp={setFilterPropId} />
                <Button className="no-print" appearance="secondary" disabled={rentalRows.length === 0} onClick={exportRentalExcel} style={{ height: 'fit-content' }}>↓ Export Excel</Button>
              </div>
              <div className={s.tableWrap}>
                <table className={s.tableSm}>
                  <thead><tr>
                    <th className={s.th}>Property</th><th className={s.th}>Start Date</th><th className={s.th}>End Date</th><th className={s.th}>Nights</th><th className={s.th}>Client</th>
                    <th className={s.th}>avgNight</th><th className={s.th}>Income Net</th><th className={s.th}>Income IGIC</th><th className={s.th}>Income Gross</th>
                    <th className={s.th}>Booking ID</th><th className={s.th}>Total People</th><th className={s.th}>Adults</th><th className={s.th}>Children</th><th className={s.th}>Babies</th>
                  </tr></thead>
                  <tbody>
                    {rentalRows.length === 0 ? <tr><td className={s.td} colSpan={14} style={{ textAlign: 'center', color: tokens.colorNeutralForeground4 }}>No rental stays match the current filters.</td></tr> : rentalRows.map(r => (
                      <tr key={r.id}>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{r.property}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.startDate)}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.endDate)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.nights}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{r.client}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.avgNight)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.incomeNet)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.incomeIgic)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.incomeGross)}</td>
                        <td className={s.td} style={{ color: tokens.colorNeutralForeground4 }}>{r.bookingId || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.totalPeople || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.adults || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.children || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{r.babies || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {rentalRows.length > 0 && (
                    <tfoot><tr className={s.totalRow}>
                      <td className={s.td} colSpan={3}>Total</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{rentalTotals.nights}</td>
                      <td className={s.td} /><td className={s.td} />
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(rentalTotals.incomeNet)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(rentalTotals.incomeIgic)}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(rentalTotals.incomeGross)}</td>
                      <td className={s.td} />
                      <td className={s.td} style={{ textAlign: 'right' }}>{rentalTotals.totalPeople}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{rentalTotals.adults}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{rentalTotals.children}</td>
                      <td className={s.td} style={{ textAlign: 'right' }}>{rentalTotals.babies}</td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {tab === 'tax' && (
            <div>
              <div className={s.filterBar}>
                <select value={taxYear} onChange={e => setTaxYear(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}` }}>
                  {taxYears.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={filterPropId} onChange={e => setFilterPropId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.colorNeutralStroke1}` }}>
                  <option value="">All properties</option>
                  {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
                </select>
              </div>
              <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block', marginBottom: 12 }}>Suppliers whose net expenses exceeded € {TAX_THRESHOLD.toLocaleString('de-DE')} in {taxYear}.</Text>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr>
                    <th className={s.th}>Supplier</th><th className={s.th}>Q1</th><th className={s.th}>Q2</th><th className={s.th}>Q3</th><th className={s.th}>Q4</th><th className={s.th}>Total Year</th>
                  </tr></thead>
                  <tbody>
                    {taxRows.length === 0 ? (
                      <tr><td className={s.td} colSpan={6} style={{ textAlign: 'center', color: tokens.colorNeutralForeground4 }}>No suppliers above the € {TAX_THRESHOLD.toLocaleString('de-DE')} threshold for {taxYear}.</td></tr>
                    ) : taxRows.map(r => (
                      <tr key={r.name}>
                        <td className={s.td} style={{ fontWeight: 600 }}>{r.name}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.q1)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.q2)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.q3)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(r.q4)}</td>
                        <td className={s.td} style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(r.total)}</td>
                      </tr>
                    ))}
                    {taxRows.length > 0 && (
                      <tr className={s.totalRow}>
                        <td className={s.td}>Total</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(taxTotal.q1)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(taxTotal.q2)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(taxTotal.q3)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(taxTotal.q4)}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{formatMoney(taxTotal.total)}</td>
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
