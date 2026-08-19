import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { makeStyles, tokens, Button, Text, Badge, ProgressBar } from '@fluentui/react-components'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import { formatMoney } from '@/domain/money'

const TYPE_INCOMING   = 233100000
const TYPE_OUTGOING   = 233100001
const ROLE_CLIENT     = 233100001
const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006

type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate-no-change' | 'duplicate-update' | 'skipped-new'

interface ExistingRecord {
  id: string; type: number; date: string; baseAmount: number; taxAmount: number; totalGross: number
  taxRate: string; taxIsManual: boolean; globalSequence: number; year: number
  checkIn: string; checkOut: string; nights: number; days: number; adults: number; children: number; babies: number
  bookingRef: string; propertyId: string; contactId: string
}

interface ImportRow {
  index: number; status: RowStatus; statusNote: string; checked: boolean; existingId: string | null
  date: string; internalId: string; autoId: boolean; propertyId: string | null; propertyName: string
  contactId: string | null; contactName: string; contactTaxId: string; contactRole: number; isNewContact: boolean
  type: number; baseAmount: number; taxAmount: number; totalGross: number; taxRate: string; taxIsManual: boolean
  globalSequence: number; year: number; checkIn: string; checkOut: string; nights: number; days: number
  adults: number; children: number; babies: number; bookingRef: string; allProperties: boolean
  categoryId: string; categoryName: string
}

async function getNextSequence(year: number): Promise<number> {
  const res = await Cr9b5_pt_invoicesService.getAll({ filter: `cr9b5_year eq ${year}`, select: ['cr9b5_globalsequence'], orderBy: ['cr9b5_globalsequence desc'], top: 1 })
  const records = res.data ?? []
  return records.length === 0 ? 1 : (records[0].cr9b5_globalsequence ?? 0) + 1
}
function buildInternalId(shortId: string, seq: number, year: number): string { return `${shortId}${String(seq).padStart(3, '0')}/${year}` }

function toIsoDate(y: number, mo: number, d: number): string {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() + 1 !== mo || date.getDate() !== d) return ''
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function parseFlexDate(raw: unknown): string {
  if (!raw && raw !== 0) return ''
  if (raw instanceof Date) return toIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate())
  if (typeof raw === 'number') { const d = XLSX.SSF.parse_date_code(raw); return d ? toIsoDate(d.y, d.m, d.d) : '' }
  const s = String(raw).trim()
  let m: RegExpMatchArray | null
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (m) return toIsoDate(+m[3], +m[2], +m[1])
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return toIsoDate(+m[3], +m[2], +m[1])
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return toIsoDate(+m[1], +m[2], +m[3])
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return toIsoDate(+m[3], +m[1], +m[2])
  return ''
}
const parseDDMMYYYY = parseFlexDate

function stripCurrency(raw: unknown): number {
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw
  let s = String(raw).replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) s = s.replace('.', '')
  return parseFloat(s) || 0
}
function parseTaxRate(raw: unknown): string {
  if (!raw) return '0'
  const n = parseFloat(String(raw).trim().replace('%','').trim())
  return isNaN(n) ? '0' : String(Math.round(n))
}
function parseInt2(raw: unknown): number { return raw == null || raw === '' ? 0 : (parseInt(String(raw), 10) || 0) }
function fmtDate(iso: string): string { return iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—' }
function round2(n: number): number { return Math.round((n ?? 0) * 100) / 100 }
function datePrefix(iso: string | undefined): string { return iso ? iso.slice(0, 10) : '' }

function detectChanges(row: ImportRow, ex: ExistingRecord): boolean {
  if (row.type !== ex.type) return true
  if (row.date !== datePrefix(ex.date)) return true
  if (round2(row.baseAmount) !== round2(ex.baseAmount)) return true
  if (round2(row.taxAmount) !== round2(ex.taxAmount)) return true
  if (round2(row.totalGross) !== round2(ex.totalGross)) return true
  if (row.taxRate !== ex.taxRate) return true
  if (row.taxIsManual !== ex.taxIsManual) return true
  if ((row.globalSequence || 0) !== (ex.globalSequence || 0)) return true
  if ((row.year || 0) !== (ex.year || 0)) return true
  if (row.checkIn !== datePrefix(ex.checkIn)) return true
  if (row.checkOut !== datePrefix(ex.checkOut)) return true
  if ((row.nights || 0) !== (ex.nights || 0)) return true
  if ((row.days || 0) !== (ex.days || 0)) return true
  if ((row.adults || 0) !== (ex.adults || 0)) return true
  if ((row.children || 0) !== (ex.children || 0)) return true
  if ((row.babies || 0) !== (ex.babies || 0)) return true
  if ((row.bookingRef || '') !== (ex.bookingRef || '')) return true
  if (row.propertyId && row.propertyId !== ex.propertyId) return true
  if (row.contactId && row.contactId !== ex.contactId) return true
  return false
}

type ColMap = Record<string, number>
const HEADER_ALIASES: Record<string, string> = {
  'internal id': 'internalId', 'auto internal id': 'autoId', 'type': 'type', 'category': 'category', 'property': 'property',
  'all properties': 'allProperties', 'contact': 'contact', 'date': 'date', 'description': 'description',
  'booking ref': 'bookingNumber', 'check-in': 'rentStart', 'check-out': 'rentEnd', 'nights': 'nights', 'days': 'days',
  'adults': 'adults', 'children': 'children', 'babies': 'babies', 'base amount': 'baseNet', 'tax rate': 'taxRate',
  'tax amount': 'baseIgic', 'total gross': 'baseGross',
}
const FULL_COLS = ['internalId', 'type', 'property', 'contact', 'date', 'baseNet', 'taxRate', 'baseGross']

// Column order + human labels for the downloadable blank template — kept in
// sync with HEADER_ALIASES so a filled-in template round-trips cleanly.
const TEMPLATE_COLUMNS: [string, string][] = [
  ['Internal ID', 'internalId'], ['Auto Internal ID', 'autoId'], ['Type', 'type'], ['Category', 'category'],
  ['Property', 'property'], ['All Properties', 'allProperties'], ['Contact', 'contact'], ['Date', 'date'],
  ['Description', 'description'], ['Booking Ref', 'bookingNumber'], ['Check-in', 'rentStart'], ['Check-out', 'rentEnd'],
  ['Nights', 'nights'], ['Days', 'days'], ['Adults', 'adults'], ['Children', 'children'], ['Babies', 'babies'],
  ['Base Amount', 'baseNet'], ['Tax Rate', 'taxRate'], ['Tax Amount', 'baseIgic'], ['Total Gross', 'baseGross'],
]

function buildColMap(headerRow: unknown[]): { col: ColMap; isPartial: boolean } {
  const map: ColMap = {}
  headerRow.forEach((cell, i) => { const key = HEADER_ALIASES[String(cell ?? '').trim().toLowerCase()]; if (key) map[key] = i })
  if (!('internalId' in map) && !('autoId' in map)) throw new Error('Missing required column: Internal ID (or Auto Internal ID)')
  return { col: map, isPartial: FULL_COLS.some(k => !(k in map)) }
}

function downloadTemplate() {
  const headers = TEMPLATE_COLUMNS.map(([label]) => label)
  const example = ['', 'Yes', 'Income', 'Cleaning Fee', 'Sunset Villa', 'No', 'Jane Doe', '15.03.2026', 'Example row — delete me', 'ABC123', '15.03.2026', '18.03.2026', '3', '4', '2', '1', '0', '250.00', '7', '17.50', '267.50']
  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length, 14) + 2 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
  XLSX.writeFile(wb, 'proptrack-invoice-import-template.xlsx')
}

const useStyles = makeStyles({
  root: { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', backgroundColor: tokens.colorNeutralBackground1 },
  header: { height: '48px', backgroundColor: tokens.colorBrandBackground, display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between', flexShrink: 0 },
  steps: { padding: '12px 24px', backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', gap: '24px', fontSize: '14px', flexShrink: 0 },
  stepBadge: { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', border: '2px solid' },
  content: { flex: 1, overflow: 'auto' },
  dropzone: { border: `2px dashed ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusLarge, padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' },
  summaryBar: { padding: '10px 24px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' },
  table: { width: '100%', fontSize: '12px', minWidth: '1200px', borderCollapse: 'collapse' },
  th: { position: 'sticky', top: 0, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: tokens.colorNeutralForeground3, textTransform: 'uppercase' },
  td: { padding: '6px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  cell: { cursor: 'pointer', borderRadius: '4px', padding: '2px 4px', display: 'block' },
  editInput: { width: '100%', border: `1px solid ${tokens.colorBrandStroke1}`, borderRadius: '4px', padding: '2px 4px', fontSize: '12px' },
  resultCard: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderRadius: tokens.borderRadiusLarge, border: '1px solid' },
})

const STATUS_COLORS: Record<RowStatus, 'success' | 'warning' | 'danger' | 'informative' | 'subtle'> = {
  ready: 'success', warning: 'warning', error: 'danger', 'duplicate-update': 'warning', 'duplicate-no-change': 'informative', 'skipped-new': 'subtle',
}
const STATUS_LABELS: Record<RowStatus, string> = {
  ready: 'Ready', warning: 'Warning', error: 'Error', 'duplicate-update': 'Duplicate — will update', 'duplicate-no-change': 'Duplicate — no changes', 'skipped-new': 'New — skipped',
}

export interface InvoiceImportProps { onClose: () => void; onImported: () => void }

export default function InvoiceImport({ onClose, onImported }: InvoiceImportProps) {
  const s = useStyles()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [fileName, setFileName] = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')

  const [rows, setRows] = useState<ImportRow[]>([])
  const [editCell, setEditCell] = useState<{ rowIdx: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>([])
  const [colMap, setColMap] = useState<ColMap>({})
  const [isPartial, setIsPartial] = useState(false)

  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [results, setResults] = useState<{ created: number; updated: number; skippedNoChange: number; failed: number } | null>(null)

  async function handleFile(file: File) {
    setParsing(true); setParseError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const { col, isPartial: partial } = buildColMap(raw[0] ?? [])
      const dataRows = raw.filter((_, i) => i > 0).filter(r => r.some(c => c !== ''))
      if (dataRows.length === 0) throw new Error('No data rows found in file.')
      setFileName(file.name); setTotalRows(dataRows.length); setColMap(col); setIsPartial(partial)
      const dates = dataRows.map(r => col.date !== undefined ? parseDDMMYYYY(r[col.date]) : '').filter(Boolean)
      if (dates.length) { dates.sort(); setDateRange({ from: dates[0], to: dates[dates.length - 1] }) }

      const [propRes, conRes, invRes, catIncRes, catExpRes] = await Promise.all([
        Cr9b5_pt_propertiesService.getAll({ select: ['cr9b5_pt_propertyid', 'cr9b5_name', 'cr9b5_shortid'], orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ select: ['cr9b5_pt_contactid', 'cr9b5_name', 'cr9b5_taxid', 'cr9b5_role'], orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_invoicesService.getAll({
          select: ['cr9b5_pt_invoiceid', 'cr9b5_internalid', 'cr9b5_type', 'cr9b5_date', 'cr9b5_baseamount', 'cr9b5_taxamount', 'cr9b5_totalgross', 'cr9b5_taxrate', 'cr9b5_taxismanual', 'cr9b5_globalsequence', 'cr9b5_year', 'cr9b5_checkin', 'cr9b5_checkout', 'cr9b5_nights', 'cr9b5_days', 'cr9b5_adults', 'cr9b5_children', 'cr9b5_babies', 'cr9b5_bookingreference'],
          maxPageSize: 5000,
        }),
        Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_INCOME}`, select: ['cr9b5_pt_referenceid', 'cr9b5_value'], maxPageSize: 500 }),
        Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_EXPENSE}`, select: ['cr9b5_pt_referenceid', 'cr9b5_value'], maxPageSize: 500 }),
      ])
      const props = propRes.data ?? []
      const cons = conRes.data ?? []
      const cats = [...(catIncRes.data ?? []), ...(catExpRes.data ?? [])]

      const existingMap = new Map<string, ExistingRecord>()
      for (const inv of invRes.data ?? []) {
        if (!inv.cr9b5_internalid) continue
        const raw2 = inv as unknown as Record<string, unknown>
        existingMap.set(inv.cr9b5_internalid.toLowerCase(), {
          id: inv.cr9b5_pt_invoiceid, type: (inv.cr9b5_type as unknown as number) ?? 0, date: inv.cr9b5_date ?? '',
          baseAmount: inv.cr9b5_baseamount ?? 0, taxAmount: inv.cr9b5_taxamount ?? 0, totalGross: inv.cr9b5_totalgross ?? 0,
          taxRate: inv.cr9b5_taxrate ?? '', taxIsManual: inv.cr9b5_taxismanual ?? false, globalSequence: inv.cr9b5_globalsequence ?? 0,
          year: inv.cr9b5_year ?? 0, checkIn: inv.cr9b5_checkin ?? '', checkOut: inv.cr9b5_checkout ?? '', nights: inv.cr9b5_nights ?? 0,
          days: inv.cr9b5_days ?? 0, adults: inv.cr9b5_adults ?? 0, children: inv.cr9b5_children ?? 0, babies: inv.cr9b5_babies ?? 0,
          bookingRef: inv.cr9b5_bookingreference ?? '', propertyId: (raw2['_cr9b5_property_value'] as string) ?? '', contactId: (raw2['_cr9b5_contact_value'] as string) ?? '',
        })
      }
      setProperties(props); setContacts(cons)
      setRows(dataRows.map((r, idx) => mapRow(r, idx, col, props, cons, cats, existingMap, partial)))
      setStep(2)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse file.')
    } finally {
      setParsing(false)
    }
  }

  function mapRow(r: unknown[], idx: number, col: ColMap, props: Cr9b5_pt_properties[], cons: Cr9b5_pt_contacts[], cats: Cr9b5_pt_references[], existingMap: Map<string, ExistingRecord>, partial = false): ImportRow {
    const errors: string[] = []; const warnings: string[] = []
    const rawInternalId = String(r[col.internalId] ?? '').trim()
    const rawAutoIdStr = String(r[col.autoId] ?? '').trim().toLowerCase()
    const autoId = rawAutoIdStr === 'yes' || rawAutoIdStr === 'true' || rawAutoIdStr === '1'
    const rawDate = r[col.date]
    const rawName = String(r[col.contact] ?? '').trim()
    const rawType = String(r[col.type] ?? '').trim()
    const rawProperty = String(r[col.property] ?? '').trim()
    const rawBaseNet = r[col.baseNet], rawBaseIgic = r[col.baseIgic], rawBaseGross = r[col.baseGross], rawTaxRate = r[col.taxRate]
    const rawRentStart = r[col.rentStart], rawRentEnd = r[col.rentEnd]
    const rawBooking = String(r[col.bookingNumber] ?? '').trim()
    const rawNights = r[col.nights], rawDays = r[col.days], rawAdults = r[col.adults], rawChildren = r[col.children], rawBabies = r[col.babies]
    const rawAllProps = String(r[col.allProperties] ?? '').trim().toLowerCase()
    const rawCategory = String(r[col.category] ?? '').trim()

    const date = parseDDMMYYYY(rawDate)
    if (!date) errors.push(rawDate ? `Invalid date format: ${rawDate}` : 'Missing date')
    const allProperties = rawAllProps === 'yes' || rawAllProps === 'true' || rawAllProps === '1'
    const property = props.find(p => p.cr9b5_name.toLowerCase() === rawProperty.toLowerCase())
    if (!property && !allProperties) errors.push(`Property not found: ${rawProperty}`)
    const category = cats.find(c => c.cr9b5_value?.toLowerCase() === rawCategory.toLowerCase())
    if (rawCategory && !category) warnings.push(`New category will be created: ${rawCategory}`)
    const contact = cons.find(c => c.cr9b5_name.toLowerCase() === rawName.toLowerCase())
    let isNewContact = false
    if (!contact && rawName) { isNewContact = true; warnings.push(`New contact will be created: ${rawName}`) }
    else if (!rawName) errors.push('Missing contact name')
    const typeStr = rawType.toLowerCase()
    const typeVal = (typeStr.includes('outgoing') || typeStr.includes('income')) ? TYPE_OUTGOING : TYPE_INCOMING
    const isOut = typeVal === TYPE_OUTGOING
    const baseAmount = stripCurrency(rawBaseNet), taxAmount = stripCurrency(rawBaseIgic), totalGross = stripCurrency(rawBaseGross)
    if (isNaN(baseAmount)) errors.push('Invalid base amount')
    const taxIsManual = taxAmount === 0
    const taxRate = parseTaxRate(rawTaxRate)
    const checkIn = isOut ? parseDDMMYYYY(rawRentStart) : ''
    const checkOut = isOut ? parseDDMMYYYY(rawRentEnd) : ''
    if (!rawBooking && isOut) warnings.push('Missing booking reference')

    const baseStatus: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ready'
    const partialRow: ImportRow = {
      index: idx, status: baseStatus, statusNote: [...errors, ...warnings].join('; '), checked: baseStatus !== 'error', existingId: null,
      date, internalId: rawInternalId, autoId, propertyId: property?.cr9b5_pt_propertyid ?? null, propertyName: property?.cr9b5_name ?? rawProperty,
      contactId: contact?.cr9b5_pt_contactid ?? null, contactName: rawName, contactTaxId: '', contactRole: ROLE_CLIENT, isNewContact,
      type: typeVal, baseAmount, taxAmount, totalGross, taxRate, taxIsManual, globalSequence: 0, year: 0, checkIn, checkOut,
      nights: parseInt2(rawNights), days: parseInt2(rawDays), adults: parseInt2(rawAdults), children: parseInt2(rawChildren), babies: parseInt2(rawBabies),
      bookingRef: rawBooking, allProperties, categoryId: category?.cr9b5_pt_referenceid ?? '', categoryName: category?.cr9b5_value ?? rawCategory,
    }
    if (rawInternalId && !autoId && baseStatus !== 'error') {
      const existing = existingMap.get(rawInternalId.toLowerCase())
      if (existing) {
        const changed = detectChanges(partialRow, existing)
        return { ...partialRow, status: changed ? 'duplicate-update' : 'duplicate-no-change', statusNote: changed ? 'Record exists — differences found, will update' : 'Record exists — no changes, will be skipped', checked: changed, existingId: existing.id }
      }
    }
    if (partial && !partialRow.existingId) return { ...partialRow, status: 'skipped-new', statusNote: 'Partial import — new rows are not created', checked: false }
    return partialRow
  }

  function commitEdit() {
    if (!editCell) return
    const { rowIdx, field } = editCell
    setRows(prev => prev.map((row, i) => i !== rowIdx ? row : revalidateRow(applyEdit(row, field, editValue))))
    setEditCell(null)
  }
  function applyEdit(row: ImportRow, field: string, val: string): ImportRow {
    switch (field) {
      case 'date': return { ...row, date: val || row.date }
      case 'internalId': return { ...row, internalId: val }
      case 'propertyId': { const prop = properties.find(p => p.cr9b5_pt_propertyid === val); return { ...row, propertyId: val || null, propertyName: prop?.cr9b5_name ?? row.propertyName } }
      case 'contactName': { const con = contacts.find(c => c.cr9b5_name.toLowerCase() === val.toLowerCase()); return { ...row, contactName: val, contactId: con?.cr9b5_pt_contactid ?? null, isNewContact: !con && !!val } }
      case 'type': return { ...row, type: val === 'outgoing' ? TYPE_OUTGOING : TYPE_INCOMING }
      case 'baseAmount': return { ...row, baseAmount: stripCurrency(val) }
      case 'taxAmount': return { ...row, taxAmount: stripCurrency(val) }
      case 'totalGross': return { ...row, totalGross: stripCurrency(val) }
      case 'nights': return { ...row, nights: parseInt(val, 10) || 0 }
      case 'days': return { ...row, days: parseInt(val, 10) || 0 }
      case 'adults': return { ...row, adults: parseInt(val, 10) || 0 }
      case 'children': return { ...row, children: parseInt(val, 10) || 0 }
      case 'babies': return { ...row, babies: parseInt(val, 10) || 0 }
      case 'checkIn': return { ...row, checkIn: val }
      case 'checkOut': return { ...row, checkOut: val }
      case 'bookingRef': return { ...row, bookingRef: val }
      default: return row
    }
  }
  function revalidateRow(row: ImportRow): ImportRow {
    if (row.status === 'duplicate-no-change' || row.status === 'duplicate-update') return row
    const errors: string[] = []; const warnings: string[] = []
    if (!row.date) errors.push('Invalid or missing date')
    if (!row.propertyId && !row.allProperties) errors.push(`Property not found: ${row.propertyName}`)
    if (!row.contactName) errors.push('Missing contact name')
    if (row.isNewContact) warnings.push(`New contact will be created: ${row.contactName}`)
    if (!row.bookingRef && row.type === TYPE_OUTGOING) warnings.push('Missing booking reference')
    const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ready'
    return { ...row, status, statusNote: [...errors, ...warnings].join('; '), checked: status !== 'error' }
  }

  function toggleRow(idx: number) { setRows(rs => rs.map((r, i) => i === idx && r.status !== 'error' ? { ...r, checked: !r.checked } : r)) }
  function toggleAutoId(idx: number) { setRows(rs => rs.map((r, i) => i === idx ? { ...r, autoId: !r.autoId, internalId: !r.autoId ? '' : r.internalId } : r)) }
  const nonErrorRows = rows.filter(r => r.status !== 'error' && r.status !== 'skipped-new')
  const allChecked = nonErrorRows.length > 0 && nonErrorRows.every(r => r.checked)
  function toggleSelectAll() { const next = !allChecked; setRows(rs => rs.map(r => r.status === 'error' ? r : { ...r, checked: next })) }

  async function runImport() {
    const processable = rows.filter(r => r.checked && r.status !== 'error')
    setImporting(true); setImportTotal(processable.length); setImportProgress(0)
    let created = 0, updated = 0, failed = 0

    const newCatNames = new Map<string, { name: string; type: number }>()
    for (const row of processable) {
      if (row.categoryName && !row.categoryId) { const key = row.categoryName.toLowerCase(); if (!newCatNames.has(key)) newCatNames.set(key, { name: row.categoryName, type: row.type }) }
    }
    const createdCategoryIds = new Map<string, string>()
    const namesByRefType = new Map<number, string[]>()
    for (const { name, type } of newCatNames.values()) {
      const refType = type === TYPE_OUTGOING ? REF_CAT_INCOME : REF_CAT_EXPENSE
      const list = namesByRefType.get(refType) ?? []; list.push(name); namesByRefType.set(refType, list)
    }
    for (const [refType, names] of namesByRefType) {
      const orFilter = names.map(n => `cr9b5_value eq '${n.replace(/'/g, "''")}'`).join(' or ')
      let existingByName = new Map<string, string>()
      try {
        const existing = await Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${refType} and (${orFilter})`, select: ['cr9b5_pt_referenceid', 'cr9b5_value'], maxPageSize: 500 })
        existingByName = new Map((existing.data ?? []).map(r => [r.cr9b5_value.toLowerCase(), r.cr9b5_pt_referenceid]))
      } catch { /* fall through */ }
      for (const name of names) { const key = name.toLowerCase(); const existingId = existingByName.get(key); if (existingId) createdCategoryIds.set(key, existingId) }
      const missing = names.filter(n => !createdCategoryIds.has(n.toLowerCase()))
      await Promise.all(missing.map(async name => {
        try {
          const res = await Cr9b5_pt_referencesService.create({ cr9b5_value: name, cr9b5_referencetype: refType as never } as never)
          if (res.data?.cr9b5_pt_referenceid) createdCategoryIds.set(name.toLowerCase(), res.data.cr9b5_pt_referenceid)
        } catch { /* imported without category */ }
      }))
    }

    const newContactNames = new Map<string, ImportRow>()
    for (const row of processable) if (row.isNewContact && !newContactNames.has(row.contactName.toLowerCase())) newContactNames.set(row.contactName.toLowerCase(), row)
    const createdContactIds = new Map<string, string>()
    await Promise.all([...newContactNames].map(async ([key, row]) => {
      try {
        const res = await Cr9b5_pt_contactsService.create({ cr9b5_name: row.contactName, cr9b5_taxid: row.contactTaxId || undefined, cr9b5_role: row.contactRole as never } as never)
        if (res.data?.cr9b5_pt_contactid) createdContactIds.set(key, res.data.cr9b5_pt_contactid)
      } catch { /* invoices for this contact will fail too */ }
    }))

    // Reserve sequence numbers up front for rows using "Auto Internal ID", so
    // concurrent creates below never collide on the same sequence number.
    const resolvedAutoIds = new Map<number, { internalId: string; seq: number }>()
    const autoIdRows = processable.filter(r => r.autoId && r.date)
    if (autoIdRows.length > 0) {
      const years = [...new Set(autoIdRows.map(r => new Date(r.date).getFullYear()))]
      const seqCounters: Record<number, number> = {}
      await Promise.all(years.map(async y => { seqCounters[y] = await getNextSequence(y) }))
      for (const row of autoIdRows) {
        const year = new Date(row.date).getFullYear()
        const seq = seqCounters[year]++
        const property = properties.find(p => p.cr9b5_pt_propertyid === row.propertyId)
        const shortId = row.allProperties ? 'All' : (property?.cr9b5_shortid ?? '')
        resolvedAutoIds.set(row.index, { internalId: buildInternalId(shortId, seq, year), seq })
      }
    }

    const has = (key: string) => key in colMap
    async function processRow(row: ImportRow) {
      try {
        const contactId = row.contactId ?? createdContactIds.get(row.contactName.toLowerCase())
        const toIso = (d: string) => d ? new Date(`${d}T12:00:00`).toISOString() : undefined
        const resolved = resolvedAutoIds.get(row.index)
        const payload: Record<string, unknown> = { cr9b5_internalid: resolved?.internalId ?? row.internalId }
        if (resolved) payload.cr9b5_globalsequence = resolved.seq
        if (has('type')) payload.cr9b5_type = row.type
        if (has('date')) { payload.cr9b5_date = toIso(row.date); if (row.date) payload.cr9b5_year = new Date(row.date).getFullYear() }
        if (has('baseNet')) payload.cr9b5_baseamount = row.baseAmount
        if (has('taxRate')) payload.cr9b5_taxrate = row.taxIsManual ? 'n/a' : row.taxRate
        if (has('baseIgic')) { payload.cr9b5_taxamount = row.taxAmount; payload.cr9b5_taxismanual = row.taxIsManual }
        if (has('baseGross')) payload.cr9b5_totalgross = row.totalGross
        if (has('nights')) payload.cr9b5_nights = row.nights
        if (has('days')) payload.cr9b5_days = row.days
        if (has('adults')) payload.cr9b5_adults = row.adults
        if (has('children')) payload.cr9b5_children = row.children
        if (has('babies')) payload.cr9b5_babies = row.babies
        if (has('allProperties')) payload.cr9b5_allproperties = row.allProperties
        if (has('category')) { const categoryId = row.categoryId || createdCategoryIds.get(row.categoryName.toLowerCase()); if (categoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${categoryId})` }
        if (has('property') && row.propertyId && !row.allProperties) payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${row.propertyId})`
        if (has('contact') && contactId) payload['cr9b5_Contact@odata.bind'] = `/cr9b5_pt_contacts(${contactId})`
        if (has('rentStart') && row.checkIn) payload.cr9b5_checkin = toIso(row.checkIn)
        if (has('rentEnd') && row.checkOut) payload.cr9b5_checkout = toIso(row.checkOut)
        if (has('bookingNumber') && row.bookingRef) payload.cr9b5_bookingreference = row.bookingRef
        if (row.existingId) { await Cr9b5_pt_invoicesService.update(row.existingId, payload as never); updated++ }
        else { await Cr9b5_pt_invoicesService.create(payload as never); created++ }
      } catch {
        failed++
      }
      setImportProgress(p => p + 1)
    }
    const CONCURRENCY = 8
    for (let i = 0; i < processable.length; i += CONCURRENCY) await Promise.all(processable.slice(i, i + CONCURRENCY).map(processRow))

    const skippedNoChange = rows.filter(r => !r.checked && r.status === 'duplicate-no-change').length
    setResults({ created, updated, skippedNoChange, failed })
    setStep(3); setImporting(false)
    if (created > 0 || updated > 0) onImported()
  }

  const counts = {
    ready: rows.filter(r => r.status === 'ready').length,
    warning: rows.filter(r => r.status === 'warning').length,
    error: rows.filter(r => r.status === 'error').length,
    duplicateUpdate: rows.filter(r => r.status === 'duplicate-update').length,
    duplicateNoChange: rows.filter(r => r.status === 'duplicate-no-change').length,
    skippedNew: rows.filter(r => r.status === 'skipped-new').length,
  }
  const checkedCount = rows.filter(r => r.checked).length

  function startEditRow(row: ImportRow, field: string) {
    let val = ''
    switch (field) {
      case 'date': val = row.date ?? ''; break
      case 'internalId': val = row.internalId; break
      case 'propertyId': val = row.propertyId ?? ''; break
      case 'contactName': val = row.contactName; break
      case 'type': val = row.type === TYPE_OUTGOING ? 'outgoing' : 'incoming'; break
      case 'baseAmount': val = String(row.baseAmount); break
      case 'taxAmount': val = String(row.taxAmount); break
      case 'totalGross': val = String(row.totalGross); break
      case 'nights': val = String(row.nights); break
      case 'days': val = String(row.days); break
      case 'adults': val = String(row.adults); break
      case 'children': val = String(row.children); break
      case 'babies': val = String(row.babies); break
      case 'checkIn': val = row.checkIn ?? ''; break
      case 'checkOut': val = row.checkOut ?? ''; break
      case 'bookingRef': val = row.bookingRef; break
    }
    setEditCell({ rowIdx: row.index, field }); setEditValue(val)
  }

  function cellProps(row: ImportRow, field: string, display: string, inputType = 'text') {
    const isEditing = editCell?.rowIdx === row.index && editCell?.field === field
    if (isEditing) {
      if (field === 'propertyId') {
        return (
          <select autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} className={s.editInput}>
            <option value="">— select —</option>
            {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
          </select>
        )
      }
      if (field === 'type') {
        return (
          <select autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit} className={s.editInput}>
            <option value="incoming">Expense</option>
            <option value="outgoing">Income</option>
          </select>
        )
      }
      return (
        <input autoFocus type={inputType} value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null) }} className={s.editInput} />
      )
    }
    return <span onClick={() => startEditRow(row, field)} className={s.cell} title={`Click to edit: ${display || '—'}`}>{display || '—'}</span>
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <Text weight="bold" style={{ color: 'white' }}>Import Invoices from Excel</Text>
        <Button appearance="transparent" style={{ color: 'white' }} onClick={onClose}>✕ Close</Button>
      </div>

      <div className={s.steps}>
        {([[1, 'Upload File'], [2, 'Validate & Edit'], [3, 'Results']] as [number, string][]).map(([n, label]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, color: step === n ? tokens.colorBrandForeground1 : step > n ? tokens.colorNeutralForeground2 : tokens.colorNeutralForeground4 }}>
            <span className={s.stepBadge} style={{ borderColor: step >= n ? tokens.colorBrandBackground : tokens.colorNeutralStroke1, backgroundColor: step >= n ? tokens.colorBrandBackground : 'transparent', color: step >= n ? 'white' : tokens.colorNeutralForeground4 }}>{n}</span>
            {label}
          </div>
        ))}
      </div>

      <div className={s.content}>
        {step === 1 && (
          <div style={{ padding: '32px', maxWidth: '520px', margin: '0 auto' }}>
            <Text size={500} weight="semibold" style={{ display: 'block', marginBottom: 4 }}>Select Excel File</Text>
            <Text style={{ color: tokens.colorNeutralForeground3, display: 'block', marginBottom: 12 }}>Upload an .xlsx file with the standard import format.</Text>
            <Button appearance="outline" onClick={downloadTemplate} style={{ marginBottom: 24 }}>↓ Download blank template</Button>
            <div className={s.dropzone} onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
              <span style={{ fontSize: '36px' }}>📂</span>
              <Text weight="medium">Click or drag &amp; drop an Excel file here</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>.xlsx files only</Text>
              <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            {parsing && <div style={{ marginTop: 24, display: 'flex', gap: 8, alignItems: 'center' }}><Text>⏳ Parsing file and loading reference data…</Text></div>}
            {parseError && <div style={{ marginTop: 24, padding: 16, backgroundColor: tokens.colorPaletteRedBackground1, border: `1px solid ${tokens.colorPaletteRedBorder1}`, borderRadius: tokens.borderRadiusMedium, color: tokens.colorPaletteRedForeground1 }}>{parseError}</div>}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {isPartial && (
              <div style={{ padding: '8px 24px', backgroundColor: tokens.colorPaletteMarigoldBackground1, borderBottom: `1px solid ${tokens.colorPaletteMarigoldBorder1}`, fontSize: '14px', color: tokens.colorPaletteMarigoldForeground1 }}>
                <strong>Partial import mode</strong> — only existing records will be updated for the columns present in this file. New rows are skipped.
              </div>
            )}
            <div className={s.summaryBar}>
              <Text><strong>{fileName}</strong> — {totalRows} rows{dateRange ? `, ${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}` : ''}</Text>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                {counts.ready > 0 && <Badge appearance="tint" color="success">✓ {counts.ready} ready</Badge>}
                {counts.warning > 0 && <Badge appearance="tint" color="warning">⚠ {counts.warning} warning</Badge>}
                {counts.duplicateUpdate > 0 && <Badge appearance="tint" color="warning">↑ {counts.duplicateUpdate} will update</Badge>}
                {counts.duplicateNoChange > 0 && <Badge appearance="tint" color="informative">⊘ {counts.duplicateNoChange} no changes</Badge>}
                {counts.skippedNew > 0 && <Badge appearance="tint" color="subtle">⊘ {counts.skippedNew} new skipped</Badge>}
                {counts.error > 0 && <Badge appearance="tint" color="danger">✕ {counts.error} error</Badge>}
                <Button appearance="primary" disabled={checkedCount === 0 || importing} onClick={runImport}>
                  {importing ? `Importing… (${importProgress}/${importTotal})` : `Import ${checkedCount} Checked Row${checkedCount !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
            {importing && <ProgressBar value={importTotal > 0 ? importProgress / importTotal : 0} thickness="medium" />}

            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.th}>
                      <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} title={allChecked ? 'Deselect all' : 'Select all'} />
                    </th>
                    <th className={s.th}>Status</th>
                    <th className={s.th}>Internal ID</th>
                    <th className={s.th}>Auto ID</th>
                    <th className={s.th}>Date</th>
                    <th className={s.th}>Property</th>
                    <th className={s.th}>Contact</th>
                    <th className={s.th}>Type</th>
                    <th className={s.th}>Category</th>
                    <th className={s.th}>All Prop</th>
                    <th className={s.th}>Base Net</th>
                    <th className={s.th}>Tax</th>
                    <th className={s.th}>Gross</th>
                    <th className={s.th}>Nights</th>
                    <th className={s.th}>Days</th>
                    <th className={s.th}>Adults</th>
                    <th className={s.th}>Children</th>
                    <th className={s.th}>Babies</th>
                    <th className={s.th}>Check-in</th>
                    <th className={s.th}>Check-out</th>
                    <th className={s.th}>Booking Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => {
                    const isOut = row.type === TYPE_OUTGOING
                    const isDisabled = row.status === 'error' || row.status === 'skipped-new'
                    return (
                      <tr key={row.index} style={{ opacity: isDisabled ? 0.5 : 1, backgroundColor: !row.checked && !isDisabled ? tokens.colorNeutralBackground2 : undefined }}>
                        <td className={s.td}><input type="checkbox" checked={row.checked} disabled={isDisabled} onChange={() => toggleRow(rowIdx)} /></td>
                        <td className={s.td}>
                          <Badge appearance="tint" color={STATUS_COLORS[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                          {row.statusNote && row.status !== 'duplicate-update' && row.status !== 'duplicate-no-change' && (
                            <div style={{ color: tokens.colorNeutralForeground4, fontSize: '11px', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.statusNote}>{row.statusNote}</div>
                          )}
                        </td>
                        <td className={s.td} style={{ fontFamily: 'monospace' }}>{row.autoId ? <Text size={200} style={{ color: tokens.colorNeutralForeground4, fontStyle: 'italic' }}>auto</Text> : cellProps(row, 'internalId', row.internalId)}</td>
                        <td className={s.td} style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={row.autoId} onChange={() => toggleAutoId(rowIdx)} title="Auto-generate a sequenced Internal ID on import" />
                        </td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{cellProps(row, 'date', fmtDate(row.date), 'date')}</td>
                        <td className={s.td}>{cellProps(row, 'propertyId', row.propertyName)}</td>
                        <td className={s.td}>
                          {cellProps(row, 'contactName', row.contactName)}
                          {row.isNewContact && <Text size={100} style={{ color: tokens.colorPaletteMarigoldForeground1, display: 'block' }}>new</Text>}
                        </td>
                        <td className={s.td}>{cellProps(row, 'type', isOut ? 'Income' : 'Expense')}</td>
                        <td className={s.td}>{row.categoryName || '—'}</td>
                        <td className={s.td} style={{ textAlign: 'center' }}>{row.allProperties ? '✓' : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{cellProps(row, 'baseAmount', formatMoney(row.baseAmount), 'number')}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{cellProps(row, 'taxAmount', formatMoney(row.taxAmount), 'number')}</td>
                        <td className={s.td} style={{ textAlign: 'right', fontWeight: 600 }}>{cellProps(row, 'totalGross', formatMoney(row.totalGross), 'number')}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{isOut ? cellProps(row, 'nights', String(row.nights), 'number') : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{isOut ? cellProps(row, 'days', String(row.days), 'number') : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{isOut ? cellProps(row, 'adults', String(row.adults), 'number') : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{isOut ? cellProps(row, 'children', String(row.children), 'number') : '—'}</td>
                        <td className={s.td} style={{ textAlign: 'right' }}>{isOut ? cellProps(row, 'babies', String(row.babies), 'number') : '—'}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{isOut ? cellProps(row, 'checkIn', fmtDate(row.checkIn), 'date') : '—'}</td>
                        <td className={s.td} style={{ whiteSpace: 'nowrap' }}>{isOut ? cellProps(row, 'checkOut', fmtDate(row.checkOut), 'date') : '—'}</td>
                        <td className={s.td}>{cellProps(row, 'bookingRef', row.bookingRef)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 3 && results && (
          <div style={{ padding: '32px', maxWidth: '420px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: '48px', marginBottom: 12 }}>{results.failed === 0 ? '✅' : '⚠️'}</div>
              <Text size={600} weight="semibold">Import Complete</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: 32 }}>
              {results.created > 0 && <div className={s.resultCard} style={{ backgroundColor: tokens.colorPaletteGreenBackground1, borderColor: tokens.colorPaletteGreenBorder1 }}><Text weight="medium" style={{ color: tokens.colorPaletteGreenForeground1 }}>Created</Text><Text size={500} weight="bold" style={{ color: tokens.colorPaletteGreenForeground1 }}>{results.created}</Text></div>}
              {results.updated > 0 && <div className={s.resultCard} style={{ backgroundColor: tokens.colorBrandBackground2, borderColor: tokens.colorBrandStroke2 }}><Text weight="medium">Updated</Text><Text size={500} weight="bold">{results.updated}</Text></div>}
              {results.skippedNoChange > 0 && <div className={s.resultCard} style={{ backgroundColor: tokens.colorPaletteBlueBackground2, borderColor: tokens.colorPaletteBlueBorderActive }}><Text weight="medium">Skipped (no changes)</Text><Text size={500} weight="bold">{results.skippedNoChange}</Text></div>}
              {results.failed > 0 && <div className={s.resultCard} style={{ backgroundColor: tokens.colorPaletteRedBackground1, borderColor: tokens.colorPaletteRedBorder1 }}><Text weight="medium" style={{ color: tokens.colorPaletteRedForeground1 }}>Failed</Text><Text size={500} weight="bold" style={{ color: tokens.colorPaletteRedForeground1 }}>{results.failed}</Text></div>}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button appearance="primary" style={{ flex: 1 }} onClick={onClose}>Back to Invoices</Button>
              <Button appearance="secondary" style={{ flex: 1 }} onClick={() => { setStep(1); setRows([]); setFileName(''); setTotalRows(0); setDateRange(null); setResults(null) }}>Import Another File</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
