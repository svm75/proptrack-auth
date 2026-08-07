import { Fragment, useMemo, useState } from 'react'
import { makeStyles, tokens, mergeClasses, Select, Button } from '@fluentui/react-components'
import type { Cr9b5_pt_invoices }   from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_contacts }   from '../generated/models/Cr9b5_pt_contactsModel'
import { formatMoney } from '@/domain/money'

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
  return n === 0 ? '—' : formatMoney(Math.round(n * 100) / 100)
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

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: '16px' },
  filterRow: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  tableWrap: { overflowX: 'auto', borderRadius: tokens.borderRadiusLarge, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  table: { fontSize: '14px', borderCollapse: 'collapse', width: '100%' },
  theadRow: { backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  thLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground3, minWidth: '240px', zIndex: 1 },
  th: { padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 500, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  thTotal: { padding: '8px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground2, borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  sectionHeader: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  sectionHeaderCell: { position: 'sticky', left: 0, padding: '8px 12px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', zIndex: 1 },
  incomeBg: { backgroundColor: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground1 },
  expenseBg: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1 },
  spacerRow: { backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  spacerCell: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '2px', zIndex: 1 },
  totalRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2 },
  totalLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '6px 12px', fontSize: '14px', fontWeight: 700, color: tokens.colorNeutralForeground1, zIndex: 1, whiteSpace: 'nowrap' },
  totalCell: { padding: '6px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap' },
  totalCellEnd: { padding: '6px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  catRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer' },
  catLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground1, padding: '6px 12px 6px 24px', fontSize: '14px', fontWeight: 600, color: tokens.colorNeutralForeground1, zIndex: 1, whiteSpace: 'nowrap' },
  caret: { marginRight: '6px', color: tokens.colorNeutralForeground4, fontSize: '12px' },
  cellNum: { padding: '6px 8px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap' },
  cellTotal: { padding: '6px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground1, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  contactRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground2 },
  contactLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '6px 12px 6px 40px', zIndex: 1, whiteSpace: 'nowrap' },
  contactName: { fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground2 },
  contactCell: { padding: '6px 8px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  contactCellTotal: { padding: '6px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  invRow: { borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  invLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorBrandBackground2, padding: '4px 12px 4px 64px', zIndex: 1, whiteSpace: 'nowrap' },
  invId: { fontSize: '12px', fontWeight: 500, color: tokens.colorNeutralForeground2 },
  invDate: { fontSize: '12px', color: tokens.colorNeutralForeground4, marginLeft: '8px' },
  invCell: { padding: '4px 8px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  invCellTotal: { padding: '4px 12px', textAlign: 'right', fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  netProfitRow: { backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  netProfitLabel: { position: 'sticky', left: 0, backgroundColor: tokens.colorNeutralBackground2, padding: '8px 12px', fontSize: '14px', fontWeight: 700, color: tokens.colorNeutralForeground1, zIndex: 1, whiteSpace: 'nowrap' },
  netProfitCell: { padding: '8px 8px', textAlign: 'right', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' },
  netProfitCellEnd: { padding: '8px 12px', textAlign: 'right', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  pos: { color: tokens.colorPaletteGreenForeground1 },
  neg: { color: tokens.colorPaletteRedForeground1 },
  expandBtn: { color: '#0F766E', fontWeight: 500 },
})

export default function CategoryPnL({ invoices, properties, references, contacts }: Props) {
  const s = useStyles()
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
      <tr key={label} className={s.sectionHeader}>
        <td className={mergeClasses(s.sectionHeaderCell, cls)} colSpan={15}>{label}</td>
      </tr>
    )
  }

  function renderSpacer(key: string) {
    return (
      <tr key={key} className={s.spacerRow}>
        <td className={s.spacerCell} colSpan={15} />
      </tr>
    )
  }

  function renderTotalRow(label: string, invs: Cr9b5_pt_invoices[]) {
    return (
      <tr key={label} className={s.totalRow}>
        <td className={s.totalLabel}>{label}</td>
        {MONTHS.map((_, m) => (
          <td key={m} className={s.totalCell}>{fmtCell(sumNet(invs, m))}</td>
        ))}
        <td className={s.totalCellEnd}>{fmtCell(sumNet(invs, null))}</td>
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
        <Fragment key={catKey}>
          <tr className={s.catRow} onClick={() => toggleExpand(catKey)}>
            <td className={s.catLabel}>
              <span className={s.caret}>{isCatOpen ? '▾' : '▸'}</span>
              {row.label}
            </td>
            {MONTHS.map((_, m) => (
              <td key={m} className={s.cellNum}>{fmtCell(sumNet(row.invs, m))}</td>
            ))}
            <td className={s.cellTotal}>{fmtCell(sumNet(row.invs, null))}</td>
          </tr>

          {isCatOpen && contactGroups.map(cg => {
            const isContactOpen = expanded.has(cg.contactKey)
            return (
              <Fragment key={cg.contactKey}>
                <tr className={s.contactRow} onClick={() => toggleExpand(cg.contactKey)}>
                  <td className={s.contactLabel}>
                    <span className={s.caret}>{isContactOpen ? '▾' : '▸'}</span>
                    <span className={s.contactName}>{cg.contactName}</span>
                  </td>
                  {MONTHS.map((_, m) => (
                    <td key={m} className={s.contactCell}>{fmtCell(sumNet(cg.invs, m))}</td>
                  ))}
                  <td className={s.contactCellTotal}>{fmtCell(sumNet(cg.invs, null))}</td>
                </tr>

                {isContactOpen && cg.invs
                  .slice()
                  .sort((a, b) => (a.cr9b5_date ?? '') > (b.cr9b5_date ?? '') ? 1 : -1)
                  .map(inv => {
                    const m = invMonth(inv)
                    return (
                      <tr key={inv.cr9b5_pt_invoiceid} className={s.invRow}>
                        <td className={s.invLabel}>
                          <span className={s.invId}>{inv.cr9b5_internalid}</span>
                          <span className={s.invDate}>{fmtDate(inv.cr9b5_date)}</span>
                        </td>
                        {MONTHS.map((_, mi) => (
                          <td key={mi} className={s.invCell}>
                            {mi === m ? (
                              <span title={`Net: ${formatMoney(inv.cr9b5_baseamount??0)} · VAT: ${formatMoney(inv.cr9b5_taxamount??0)} · Gross: ${formatMoney(inv.cr9b5_totalgross??0)}`}>
                                {fmtCell(inv.cr9b5_baseamount ?? 0)}
                              </span>
                            ) : null}
                          </td>
                        ))}
                        <td className={s.invCellTotal}>{fmtCell(inv.cr9b5_baseamount ?? 0)}</td>
                      </tr>
                    )
                  })}
              </Fragment>
            )
          })}
        </Fragment>
      )
    })
  }

  const netProfitMonths = MONTHS.map((_, m) => sumNet(incomeInvs, m) - sumNet(expenseInvs, m))
  const netProfitTotal  = sumNet(incomeInvs, null) - sumNet(expenseInvs, null)

  return (
    <div className={s.root}>
      {/* Filters */}
      <div className={s.filterRow}>
        <Select value={String(year)} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <Select value={propId} onChange={e => setPropId(e.target.value)}>
          <option value="">All properties</option>
          {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
        </Select>
      </div>

      {/* Table */}
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr className={s.theadRow}>
              <th className={s.thLabel}>
                <Button appearance="transparent" size="small" onClick={toggleAll} className={s.expandBtn}>
                  {allExpanded ? '− Collapse All' : '+ Expand All'}
                </Button>
              </th>
              {MONTHS.map(mn => <th key={mn} className={s.th}>{mn}</th>)}
              <th className={s.thTotal}>{year} Total</th>
            </tr>
          </thead>
          <tbody>
            {renderSectionHeader('INCOME', s.incomeBg)}
            {renderCategories(incomeInvs, incomeCats, 'inc')}
            {renderTotalRow('TOTAL INCOME', incomeInvs)}
            {renderSpacer('spacer-1')}

            {renderSectionHeader('EXPENSES', s.expenseBg)}
            {renderCategories(expenseInvs, expenseCats, 'exp')}
            {renderTotalRow('TOTAL EXPENSES', expenseInvs)}
            {renderSpacer('spacer-2')}

            <tr className={s.netProfitRow}>
              <td className={s.netProfitLabel}>NET PROFIT</td>
              {netProfitMonths.map((v, m) => (
                <td key={m} className={mergeClasses(s.netProfitCell, v >= 0 ? s.pos : s.neg)}>
                  {fmtCell(Math.round(v * 100) / 100)}
                </td>
              ))}
              <td className={mergeClasses(s.netProfitCellEnd, netProfitTotal >= 0 ? s.pos : s.neg)}>
                {fmtCell(Math.round(netProfitTotal * 100) / 100)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
