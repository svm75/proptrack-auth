import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING   = 233100000
const TYPE_OUTGOING   = 233100001
const ROLE_CLIENT     = 233100001
const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006

type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate-no-change' | 'duplicate-update' | 'skipped-new'

interface ExistingRecord {
  id: string
  type: number
  date: string
  baseAmount: number
  taxAmount: number
  totalGross: number
  taxRate: string
  taxIsManual: boolean
  globalSequence: number
  year: number
  checkIn: string
  checkOut: string
  nights: number
  days: number
  adults: number
  children: number
  babies: number
  bookingRef: string
  propertyId: string
  contactId: string
}

interface ImportRow {
  index: number
  status: RowStatus
  statusNote: string
  checked: boolean
  existingId: string | null
  date: string
  internalId: string
  propertyId: string | null
  propertyName: string
  contactId: string | null
  contactName: string
  contactTaxId: string
  contactRole: number
  isNewContact: boolean
  type: number
  baseAmount: number
  taxAmount: number
  totalGross: number
  taxRate: string
  taxIsManual: boolean
  globalSequence: number
  year: number
  checkIn: string
  checkOut: string
  nights: number
  days: number
  adults: number
  children: number
  babies: number
  bookingRef: string
  allProperties: boolean
  categoryId: string
  categoryName: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function toIsoDate(y: number, mo: number, d: number): string {
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() + 1 !== mo || date.getDate() !== d) return ''
  return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

function parseFlexDate(raw: unknown): string {
  if (!raw && raw !== 0) return ''
  // JavaScript Date (SheetJS cellDates:true)
  if (raw instanceof Date) {
    return toIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate())
  }
  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d) return toIsoDate(d.y, d.m, d.d)
    return ''
  }
  const s = String(raw).trim()
  let m: RegExpMatchArray | null
  // DD.MM.YYYY or D.M.YYYY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return toIsoDate(+m[3], +m[2], +m[1])
  // DD/MM/YYYY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return toIsoDate(+m[3], +m[2], +m[1])
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return toIsoDate(+m[1], +m[2], +m[3])
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return toIsoDate(+m[3], +m[1], +m[2])
  return ''
}

// Keep old name as alias so all call sites work unchanged
const parseDDMMYYYY = parseFlexDate

function stripCurrency(raw: unknown): number {
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw
  let s = String(raw).replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) {
    // European format: 1.234,56 — dots are thousands separators
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    // Comma-only: treat as decimal separator (e.g. 1234,56)
    s = s.replace(',', '.')
  } else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) {
    // Single dot followed by exactly 3 digits: European thousands separator (e.g. 1.234)
    s = s.replace('.', '')
  }
  // else: standard decimal dot (e.g. 1234.56) — use as-is
  return parseFloat(s) || 0
}

function parseTaxRate(raw: unknown): string {
  if (!raw) return '0'
  const s = String(raw).trim().replace('%','').trim()
  const n = parseFloat(s)
  return isNaN(n) ? '0' : String(Math.round(n))
}

function parseInt2(raw: unknown): number {
  if (raw == null || raw === '') return 0
  return parseInt(String(raw), 10) || 0
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function round2(n: number): number { return Math.round((n ?? 0) * 100) / 100 }
function datePrefix(iso: string | undefined): string { return iso ? iso.slice(0, 10) : '' }

function detectChanges(row: ImportRow, ex: ExistingRecord): boolean {
  if (row.type !== ex.type) return true
  if (row.date !== datePrefix(ex.date)) return true
  if (round2(row.baseAmount) !== round2(ex.baseAmount)) return true
  if (round2(row.taxAmount)  !== round2(ex.taxAmount))  return true
  if (round2(row.totalGross) !== round2(ex.totalGross)) return true
  if (row.taxRate     !== ex.taxRate)     return true
  if (row.taxIsManual !== ex.taxIsManual) return true
  if ((row.globalSequence || 0) !== (ex.globalSequence || 0)) return true
  if ((row.year || 0)           !== (ex.year || 0))           return true
  if (row.checkIn  !== datePrefix(ex.checkIn))  return true
  if (row.checkOut !== datePrefix(ex.checkOut)) return true
  if ((row.nights   || 0) !== (ex.nights   || 0)) return true
  if ((row.days     || 0) !== (ex.days     || 0)) return true
  if ((row.adults   || 0) !== (ex.adults   || 0)) return true
  if ((row.children || 0) !== (ex.children || 0)) return true
  if ((row.babies   || 0) !== (ex.babies   || 0)) return true
  if ((row.bookingRef || '') !== (ex.bookingRef || '')) return true
  if (row.propertyId && row.propertyId !== ex.propertyId) return true
  if (row.contactId  && row.contactId  !== ex.contactId)  return true
  return false
}

// ── column map ────────────────────────────────────────────────────────────────

type ColMap = Record<string, number>

const HEADER_ALIASES: Record<string, string> = {
  'internal id':  'internalId',
  'type':         'type',
  'category':     'category',
  'property':     'property',
  'all properties': 'allProperties',
  'contact':      'contact',
  'date':         'date',
  'description':  'description',
  'booking ref':  'bookingNumber',
  'check-in':     'rentStart',
  'check-out':    'rentEnd',
  'nights':       'nights',
  'days':         'days',
  'adults':       'adults',
  'children':     'children',
  'babies':       'babies',
  'base amount':  'baseNet',
  'tax rate':     'taxRate',
  'tax amount':   'baseIgic',
  'total gross':  'baseGross',
}

const FULL_COLS = ['internalId', 'type', 'property', 'contact', 'date', 'baseNet', 'taxRate', 'baseGross']

function buildColMap(headerRow: unknown[]): { col: ColMap; isPartial: boolean } {
  const map: ColMap = {}
  headerRow.forEach((cell, i) => {
    const key = HEADER_ALIASES[String(cell ?? '').trim().toLowerCase()]
    if (key) map[key] = i
  })
  if (!('internalId' in map)) throw new Error('Missing required column: Internal ID')
  const isPartial = FULL_COLS.some(k => !(k in map))
  return { col: map, isPartial }
}

// ── main component ────────────────────────────────────────────────────────────

export interface InvoiceImportProps {
  onClose: () => void
  onImported: () => void
}

export default function InvoiceImport({ onClose, onImported }: InvoiceImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [fileName, setFileName]   = useState('')
  const [totalRows, setTotalRows] = useState(0)
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null)
  const [parsing, setParsing]     = useState(false)
  const [parseError, setParseError] = useState('')

  // Step 2
  const [rows, setRows]           = useState<ImportRow[]>([])
  const [editCell, setEditCell]   = useState<{ rowIdx: number; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Reference data (loaded during parse)
  const [properties, setProperties] = useState<Cr9b5_pt_properties[]>([])
  const [contacts, setContacts]     = useState<Cr9b5_pt_contacts[]>([])
  const [colMap,    setColMap]       = useState<ColMap>({})
  const [isPartial, setIsPartial]    = useState(false)

  // Step 3
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal]       = useState(0)
  const [results, setResults] = useState<{
    created: number; updated: number; skippedNoChange: number; failed: number
  } | null>(null)

  // ── parse ──────────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setParsing(true)
    setParseError('')
    try {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      const { col, isPartial: partial } = buildColMap(raw[0] ?? [])

      const dataRows = raw.filter((_, i) => i > 0).filter(r => r.some(c => c !== ''))
      if (dataRows.length === 0) throw new Error('No data rows found in file.')

      setFileName(file.name)
      setTotalRows(dataRows.length)
      setColMap(col)
      setIsPartial(partial)

      const dates = dataRows.map(r => col.date !== undefined ? parseDDMMYYYY(r[col.date]) : '').filter(Boolean)
      if (dates.length) {
        dates.sort()
        setDateRange({ from: dates[0], to: dates[dates.length - 1] })
      }

      const [propRes, conRes, invRes, catIncRes, catExpRes] = await Promise.all([
        Cr9b5_pt_propertiesService.getAll({ select: ['cr9b5_pt_propertyid', 'cr9b5_name', 'cr9b5_shortid'], orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_contactsService.getAll({ select: ['cr9b5_pt_contactid', 'cr9b5_name', 'cr9b5_taxid', 'cr9b5_role'], orderBy: ['cr9b5_name asc'], maxPageSize: 5000 }),
        Cr9b5_pt_invoicesService.getAll({
          select: [
            'cr9b5_pt_invoiceid', 'cr9b5_internalid', 'cr9b5_type', 'cr9b5_date',
            'cr9b5_baseamount', 'cr9b5_taxamount', 'cr9b5_totalgross', 'cr9b5_taxrate',
            'cr9b5_taxismanual', 'cr9b5_globalsequence', 'cr9b5_year',
            'cr9b5_checkin', 'cr9b5_checkout', 'cr9b5_nights', 'cr9b5_days',
            'cr9b5_adults', 'cr9b5_children', 'cr9b5_babies', 'cr9b5_bookingreference',
          ],
          maxPageSize: 5000,
        }),
        Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_INCOME}`,  select: ['cr9b5_pt_referenceid', 'cr9b5_value'], maxPageSize: 500 }),
        Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${REF_CAT_EXPENSE}`, select: ['cr9b5_pt_referenceid', 'cr9b5_value'], maxPageSize: 500 }),
      ])

      const props = propRes.data ?? []
      const cons  = conRes.data ?? []
      const cats  = [...(catIncRes.data ?? []), ...(catExpRes.data ?? [])]

      // Build existing record map: internalId (lower) → ExistingRecord
      const existingMap = new Map<string, ExistingRecord>()
      for (const inv of invRes.data ?? []) {
        if (!inv.cr9b5_internalid) continue
        const raw2 = inv as unknown as Record<string, unknown>
        existingMap.set(inv.cr9b5_internalid.toLowerCase(), {
          id:             inv.cr9b5_pt_invoiceid,
          type:           (inv.cr9b5_type as unknown as number) ?? 0,
          date:           inv.cr9b5_date ?? '',
          baseAmount:     inv.cr9b5_baseamount ?? 0,
          taxAmount:      inv.cr9b5_taxamount ?? 0,
          totalGross:     inv.cr9b5_totalgross ?? 0,
          taxRate:        inv.cr9b5_taxrate ?? '',
          taxIsManual:    inv.cr9b5_taxismanual ?? false,
          globalSequence: inv.cr9b5_globalsequence ?? 0,
          year:           inv.cr9b5_year ?? 0,
          checkIn:        inv.cr9b5_checkin ?? '',
          checkOut:       inv.cr9b5_checkout ?? '',
          nights:         inv.cr9b5_nights ?? 0,
          days:           inv.cr9b5_days ?? 0,
          adults:         inv.cr9b5_adults ?? 0,
          children:       inv.cr9b5_children ?? 0,
          babies:         inv.cr9b5_babies ?? 0,
          bookingRef:     inv.cr9b5_bookingreference ?? '',
          propertyId:     (raw2['_cr9b5_property_value'] as string) ?? '',
          contactId:      (raw2['_cr9b5_contact_value'] as string) ?? '',
        })
      }

      setProperties(props)
      setContacts(cons)

      const parsed: ImportRow[] = dataRows.map((r, idx) =>
        mapRow(r, idx, col, props, cons, cats, existingMap, partial)
      )

      setRows(parsed)
      setStep(2)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse file.')
    } finally {
      setParsing(false)
    }
  }

  function mapRow(
    r: unknown[],
    idx: number,
    col: ColMap,
    props: Cr9b5_pt_properties[],
    cons: Cr9b5_pt_contacts[],
    cats: Cr9b5_pt_references[],
    existingMap: Map<string, ExistingRecord>,
    partial = false,
  ): ImportRow {
    const errors: string[] = []
    const warnings: string[] = []

    const rawInternalId = String(r[col.internalId] ?? '').trim()
    const rawDate       = r[col.date]
    const rawName       = String(r[col.contact] ?? '').trim()
    const rawType       = String(r[col.type] ?? '').trim()
    const rawProperty   = String(r[col.property] ?? '').trim()
    const rawBaseNet    = r[col.baseNet]
    const rawBaseIgic   = r[col.baseIgic]
    const rawBaseGross  = r[col.baseGross]
    const rawTaxRate    = r[col.taxRate]
    const rawRentStart  = r[col.rentStart]
    const rawRentEnd    = r[col.rentEnd]
    const rawBooking    = String(r[col.bookingNumber] ?? '').trim()
    const rawNights      = r[col.nights]
    const rawDays        = r[col.days]
    const rawAdults      = r[col.adults]
    const rawChildren    = r[col.children]
    const rawBabies      = r[col.babies]
    const rawAllProps    = String(r[col.allProperties] ?? '').trim().toLowerCase()
    const rawCategory    = String(r[col.category] ?? '').trim()

    // Date
    const date = parseDDMMYYYY(rawDate)
    if (!date) errors.push(rawDate ? `Invalid date format: ${rawDate}` : 'Missing date')

    // All Properties flag
    const allProperties = rawAllProps === 'yes' || rawAllProps === 'true' || rawAllProps === '1'

    // Property (not required when allProperties is set)
    const propNameLower = rawProperty.toLowerCase()
    let property = props.find(p => p.cr9b5_name.toLowerCase() === propNameLower)
    if (!property && !allProperties) errors.push(`Property not found: ${rawProperty}`)

    // Category
    const catNameLower = rawCategory.toLowerCase()
    const category = cats.find(c => c.cr9b5_value?.toLowerCase() === catNameLower)
    if (rawCategory && !category) warnings.push(`New category will be created: ${rawCategory}`)

    // Contact
    let contact = cons.find(c => c.cr9b5_name.toLowerCase() === rawName.toLowerCase())
    let isNewContact = false
    if (!contact && rawName) {
      isNewContact = true
      warnings.push(`New contact will be created: ${rawName}`)
    } else if (!rawName) {
      errors.push('Missing contact name')
    }

    // Type
    const typeStr = rawType.toLowerCase()
    const typeVal = (typeStr.includes('outgoing') || typeStr.includes('income')) ? TYPE_OUTGOING : TYPE_INCOMING
    const isOut   = typeVal === TYPE_OUTGOING

    // Amounts
    const baseAmount = stripCurrency(rawBaseNet)
    const taxAmount  = stripCurrency(rawBaseIgic)
    const totalGross = stripCurrency(rawBaseGross)
    if (isNaN(baseAmount)) errors.push('Invalid base amount')

    const taxIsManual = taxAmount === 0
    const taxRate     = parseTaxRate(rawTaxRate)

    const checkIn  = isOut ? parseDDMMYYYY(rawRentStart) : ''
    const checkOut = isOut ? parseDDMMYYYY(rawRentEnd)   : ''

    if (!rawBooking && isOut) warnings.push('Missing booking reference')

    const baseStatus: RowStatus =
      errors.length > 0   ? 'error' :
      warnings.length > 0 ? 'warning' :
      'ready'
    const note = [...errors, ...warnings].join('; ')

    const partialRow: ImportRow = {
      index:          idx,
      status:         baseStatus,
      statusNote:     note,
      checked:        baseStatus !== 'error',
      existingId:     null,
      date,
      internalId:     rawInternalId,
      propertyId:     property?.cr9b5_pt_propertyid ?? null,
      propertyName:   property?.cr9b5_name ?? rawProperty,
      contactId:      contact?.cr9b5_pt_contactid ?? null,
      contactName:    rawName,
      contactTaxId:   '',
      contactRole:    ROLE_CLIENT,
      isNewContact,
      type:           typeVal,
      baseAmount,
      taxAmount,
      totalGross,
      taxRate,
      taxIsManual,
      globalSequence: 0,
      year:           0,
      checkIn,
      checkOut,
      nights:        parseInt2(rawNights),
      days:          parseInt2(rawDays),
      adults:        parseInt2(rawAdults),
      children:      parseInt2(rawChildren),
      babies:        parseInt2(rawBabies),
      bookingRef:    rawBooking,
      allProperties,
      categoryId:    category?.cr9b5_pt_referenceid ?? '',
      categoryName:  category?.cr9b5_value ?? rawCategory,
    }

    // Duplicate check — only if no hard errors (we need property/contact resolved)
    if (rawInternalId && baseStatus !== 'error') {
      const existing = existingMap.get(rawInternalId.toLowerCase())
      if (existing) {
        const changed = detectChanges(partialRow, existing)
        return {
          ...partialRow,
          status:     changed ? 'duplicate-update' : 'duplicate-no-change',
          statusNote: changed ? 'Record exists — differences found, will update' : 'Record exists — no changes, will be skipped',
          checked:    changed,
          existingId: existing.id,
        }
      }
    }

    // In partial mode, new rows are not allowed
    if (partial && !partialRow.existingId) {
      return {
        ...partialRow,
        status:     'skipped-new',
        statusNote: 'Partial import — new rows are not created',
        checked:    false,
      }
    }

    return partialRow
  }

  // ── inline editing ─────────────────────────────────────────────────────────

  function commitEdit() {
    if (!editCell) return
    const { rowIdx, field } = editCell
    setRows(prev => prev.map((row, i) => {
      if (i !== rowIdx) return row
      const updated = applyEdit(row, field, editValue)
      return revalidateRow(updated)
    }))
    setEditCell(null)
  }

  function applyEdit(row: ImportRow, field: string, val: string): ImportRow {
    switch (field) {
      case 'date':        return { ...row, date: val || row.date }
      case 'internalId':  return { ...row, internalId: val }
      case 'propertyId': {
        const prop = properties.find(p => p.cr9b5_pt_propertyid === val)
        return { ...row, propertyId: val || null, propertyName: prop?.cr9b5_name ?? row.propertyName }
      }
      case 'contactName': {
        const con = contacts.find(c => c.cr9b5_name.toLowerCase() === val.toLowerCase())
        return { ...row, contactName: val, contactId: con?.cr9b5_pt_contactid ?? null, isNewContact: !con && !!val }
      }
      case 'type': return { ...row, type: val === 'outgoing' ? TYPE_OUTGOING : TYPE_INCOMING }
      case 'baseAmount': return { ...row, baseAmount: stripCurrency(val) }
      case 'taxAmount':  return { ...row, taxAmount:  stripCurrency(val) }
      case 'totalGross': return { ...row, totalGross: stripCurrency(val) }
      case 'nights':    return { ...row, nights:   parseInt(val, 10) || 0 }
      case 'days':      return { ...row, days:     parseInt(val, 10) || 0 }
      case 'adults':    return { ...row, adults:   parseInt(val, 10) || 0 }
      case 'children':  return { ...row, children: parseInt(val, 10) || 0 }
      case 'babies':    return { ...row, babies:   parseInt(val, 10) || 0 }
      case 'checkIn':    return { ...row, checkIn:  val }
      case 'checkOut':   return { ...row, checkOut: val }
      case 'bookingRef': return { ...row, bookingRef: val }
      default: return row
    }
  }

  function revalidateRow(row: ImportRow): ImportRow {
    // Preserve duplicate statuses through inline edits
    if (row.status === 'duplicate-no-change' || row.status === 'duplicate-update') return row

    const errors: string[]   = []
    const warnings: string[] = []

    if (!row.date)                            errors.push('Invalid or missing date')
    if (!row.propertyId && !row.allProperties) errors.push(`Property not found: ${row.propertyName}`)
    if (!row.contactName) errors.push('Missing contact name')
    if (row.isNewContact) warnings.push(`New contact will be created: ${row.contactName}`)
    if (!row.bookingRef && row.type === TYPE_OUTGOING) warnings.push('Missing booking reference')

    const status: RowStatus =
      errors.length > 0   ? 'error' :
      warnings.length > 0 ? 'warning' :
      'ready'

    return { ...row, status, statusNote: [...errors, ...warnings].join('; '), checked: status !== 'error' }
  }

  // ── checkbox management ────────────────────────────────────────────────────

  function toggleRow(idx: number) {
    setRows(rs => rs.map((r, i) =>
      i === idx && r.status !== 'error' ? { ...r, checked: !r.checked } : r
    ))
  }

  const nonErrorRows = rows.filter(r => r.status !== 'error' && r.status !== 'skipped-new')
  const allChecked   = nonErrorRows.length > 0 && nonErrorRows.every(r => r.checked)

  function toggleSelectAll() {
    const next = !allChecked
    setRows(rs => rs.map(r => r.status === 'error' ? r : { ...r, checked: next }))
  }

  // ── import ─────────────────────────────────────────────────────────────────

  async function runImport() {
    const processable = rows.filter(r => r.checked && r.status !== 'error')
    setImporting(true)
    setImportTotal(processable.length)
    setImportProgress(0)

    let created = 0
    let updated = 0
    let failed  = 0

    // Create missing categories (deduplicated by lowercase name)
    const newCatNames = new Map<string, { name: string; type: number }>()
    for (const row of processable) {
      if (row.categoryName && !row.categoryId) {
        const key = row.categoryName.toLowerCase()
        if (!newCatNames.has(key)) newCatNames.set(key, { name: row.categoryName, type: row.type })
      }
    }
    const createdCategoryIds = new Map<string, string>()

    // Group the deduplicated names by reference type so existence can be
    // checked with one query per type (an `or`-chain over all names) instead
    // of one round trip per individual category name.
    const namesByRefType = new Map<number, string[]>()
    for (const { name, type } of newCatNames.values()) {
      const refType = type === TYPE_OUTGOING ? REF_CAT_INCOME : REF_CAT_EXPENSE
      const list = namesByRefType.get(refType) ?? []
      list.push(name)
      namesByRefType.set(refType, list)
    }
    for (const [refType, names] of namesByRefType) {
      const orFilter = names.map(n => `cr9b5_value eq '${n.replace(/'/g, "''")}'`).join(' or ')
      let existingByName = new Map<string, string>()
      try {
        const existing = await Cr9b5_pt_referencesService.getAll({
          filter: `cr9b5_referencetype eq ${refType} and (${orFilter})`,
          select: ['cr9b5_pt_referenceid', 'cr9b5_value'],
          maxPageSize: 500,
        })
        existingByName = new Map((existing.data ?? []).map(r => [r.cr9b5_value.toLowerCase(), r.cr9b5_pt_referenceid]))
      } catch {
        // if the batched lookup fails, fall through and try to create all of them
      }
      for (const name of names) {
        const key = name.toLowerCase()
        const existingId = existingByName.get(key)
        if (existingId) createdCategoryIds.set(key, existingId)
      }
      // Missing ones are independent creates — safe to run concurrently.
      const missing = names.filter(n => !createdCategoryIds.has(n.toLowerCase()))
      await Promise.all(missing.map(async name => {
        try {
          const res = await Cr9b5_pt_referencesService.create({
            cr9b5_value: name,
            cr9b5_referencetype: refType as never,
          } as never)
          if (res.data?.cr9b5_pt_referenceid) {
            createdCategoryIds.set(name.toLowerCase(), res.data.cr9b5_pt_referenceid)
          }
        } catch {
          // category creation failed; invoice will be imported without category
        }
      }))
    }

    // Deduplicate new contacts by name
    const newContactNames = new Map<string, ImportRow>()
    for (const row of processable) {
      if (row.isNewContact && !newContactNames.has(row.contactName.toLowerCase())) {
        newContactNames.set(row.contactName.toLowerCase(), row)
      }
    }

    // Independent creates — run concurrently instead of one at a time.
    const createdContactIds = new Map<string, string>()
    await Promise.all([...newContactNames].map(async ([key, row]) => {
      try {
        const res = await Cr9b5_pt_contactsService.create({
          cr9b5_name:  row.contactName,
          cr9b5_taxid: row.contactTaxId || undefined,
          cr9b5_role:  row.contactRole as never,
        } as never)
        if (res.data?.cr9b5_pt_contactid) {
          createdContactIds.set(key, res.data.cr9b5_pt_contactid)
        }
      } catch {
        // contact creation failed; invoices for this contact will fail too
      }
    }))

    const has = (key: string) => key in colMap

    async function processRow(row: ImportRow) {
      try {
        const contactId = row.contactId ?? createdContactIds.get(row.contactName.toLowerCase())
        const toIso = (d: string) => d ? new Date(`${d}T12:00:00`).toISOString() : undefined

        const payload: Record<string, unknown> = {
          cr9b5_internalid: row.internalId,
        }

        if (has('type'))        payload.cr9b5_type           = row.type
        if (has('date'))        payload.cr9b5_date           = toIso(row.date)
        if (has('baseNet'))     payload.cr9b5_baseamount     = row.baseAmount
        if (has('taxRate'))     payload.cr9b5_taxrate        = row.taxIsManual ? 'n/a' : row.taxRate
        if (has('baseIgic'))    { payload.cr9b5_taxamount    = row.taxAmount; payload.cr9b5_taxismanual = row.taxIsManual }
        if (has('baseGross'))   payload.cr9b5_totalgross     = row.totalGross
        if (has('nights'))      payload.cr9b5_nights         = row.nights
        if (has('days'))        payload.cr9b5_days           = row.days
        if (has('adults'))      payload.cr9b5_adults         = row.adults
        if (has('children'))    payload.cr9b5_children       = row.children
        if (has('babies'))      payload.cr9b5_babies         = row.babies
        if (has('allProperties')) payload.cr9b5_allproperties = row.allProperties

        if (has('category')) {
          const categoryId = row.categoryId || createdCategoryIds.get(row.categoryName.toLowerCase())
          if (categoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${categoryId})`
        }
        if (has('property') && row.propertyId && !row.allProperties) {
          payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${row.propertyId})`
        }
        if (has('contact') && contactId) {
          payload['cr9b5_Contact@odata.bind'] = `/cr9b5_pt_contacts(${contactId})`
        }
        if (has('rentStart') && row.checkIn)    payload.cr9b5_checkin          = toIso(row.checkIn)
        if (has('rentEnd')   && row.checkOut)   payload.cr9b5_checkout         = toIso(row.checkOut)
        if (has('bookingNumber') && row.bookingRef) payload.cr9b5_bookingreference = row.bookingRef

        if (row.existingId) {
          await Cr9b5_pt_invoicesService.update(row.existingId, payload as never)
          updated++
        } else {
          await Cr9b5_pt_invoicesService.create(payload as never)
          created++
        }
      } catch {
        failed++
      }
      setImportProgress(p => p + 1)
    }

    // Rows are independent — save them in bounded-concurrency batches instead
    // of one sequential network round trip per row (a 500-row import used to
    // mean 500+ serial awaits).
    const CONCURRENCY = 8
    for (let i = 0; i < processable.length; i += CONCURRENCY) {
      await Promise.all(processable.slice(i, i + CONCURRENCY).map(processRow))
    }

    // Unchecked no-change duplicates count as skipped
    const skippedNoChange = rows.filter(r => !r.checked && r.status === 'duplicate-no-change').length

    setResults({ created, updated, skippedNoChange, failed })
    setStep(3)
    setImporting(false)
    if (created > 0 || updated > 0) onImported()
  }

  // ── counts ─────────────────────────────────────────────────────────────────

  const counts = {
    ready:            rows.filter(r => r.status === 'ready').length,
    warning:          rows.filter(r => r.status === 'warning').length,
    error:            rows.filter(r => r.status === 'error').length,
    duplicateUpdate:  rows.filter(r => r.status === 'duplicate-update').length,
    duplicateNoChange:rows.filter(r => r.status === 'duplicate-no-change').length,
    skippedNew:       rows.filter(r => r.status === 'skipped-new').length,
  }

  const checkedCount = rows.filter(r => r.checked).length

  function startEditRow(row: ImportRow, field: string) {
    let val = ''
    switch (field) {
      case 'date':        val = row.date ?? ''; break
      case 'internalId':  val = row.internalId; break
      case 'propertyId':  val = row.propertyId ?? ''; break
      case 'contactName': val = row.contactName; break
      case 'type':        val = row.type === TYPE_OUTGOING ? 'outgoing' : 'incoming'; break
      case 'baseAmount':  val = String(row.baseAmount); break
      case 'taxAmount':   val = String(row.taxAmount); break
      case 'totalGross':  val = String(row.totalGross); break
      case 'nights':    val = String(row.nights);   break
      case 'days':      val = String(row.days);     break
      case 'adults':    val = String(row.adults);   break
      case 'children':  val = String(row.children); break
      case 'babies':    val = String(row.babies);   break
      case 'checkIn':     val = row.checkIn ?? ''; break
      case 'checkOut':    val = row.checkOut ?? ''; break
      case 'bookingRef':  val = row.bookingRef; break
    }
    setEditCell({ rowIdx: row.index, field })
    setEditValue(val)
  }

  function cellProps(row: ImportRow, field: string, display: string, inputType = 'text') {
    const isEditing = editCell?.rowIdx === row.index && editCell?.field === field
    if (isEditing) {
      if (field === 'propertyId') {
        return (
          <select
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            className="w-full border border-indigo-400 rounded px-1 py-0.5 text-xs"
          >
            <option value="">— select —</option>
            {properties.map(p => (
              <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
            ))}
          </select>
        )
      }
      if (field === 'type') {
        return (
          <select
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            className="w-full border border-indigo-400 rounded px-1 py-0.5 text-xs"
          >
            <option value="incoming">Expense</option>
            <option value="outgoing">Income</option>
          </select>
        )
      }
      return (
        <input
          autoFocus
          type={inputType}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null) }}
          className="w-full border border-indigo-400 rounded px-1 py-0.5 text-xs min-w-[6rem]"
        />
      )
    }
    return (
      <span
        onClick={() => startEditRow(row, field)}
        className="cursor-pointer hover:bg-indigo-50 rounded px-0.5 block truncate"
        title={`Click to edit: ${display || '—'}`}
      >
        {display || <span className="text-gray-300 text-xs">—</span>}
      </span>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const statusStyles: Record<RowStatus, string> = {
    ready:               'bg-green-50  text-green-700  border-green-200',
    warning:             'bg-amber-50  text-amber-700  border-amber-200',
    error:               'bg-red-50    text-red-700    border-red-200',
    'duplicate-update':  'bg-amber-50  text-amber-700  border-amber-200',
    'duplicate-no-change': 'bg-blue-50 text-blue-700   border-blue-200',
    'skipped-new':       'bg-gray-100  text-gray-400   border-gray-200',
  }
  const statusLabels: Record<RowStatus, string> = {
    ready:               'Ready',
    warning:             'Warning',
    error:               'Error',
    'duplicate-update':  'Duplicate — will update',
    'duplicate-no-change': 'Duplicate — no changes',
    'skipped-new':       'New — skipped',
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="h-12 bg-teal-700 flex items-center px-6 shrink-0 justify-between">
        <span className="text-white font-bold text-base">Import Invoices from Excel</span>
        <button onClick={onClose} className="text-teal-200 hover:text-white text-sm">✕ Close</button>
      </div>

      {/* Step indicator */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex gap-6 text-sm">
        {([
          [1, 'Upload File'],
          [2, 'Validate & Edit'],
          [3, 'Results'],
        ] as [number, string][]).map(([n, label]) => (
          <div key={n} className={['flex items-center gap-2 font-medium',
            step === n ? 'text-teal-700' : step > n ? 'text-gray-500' : 'text-gray-300'
          ].join(' ')}>
            <span className={['w-6 h-6 rounded-full flex items-center justify-center text-xs border-2',
              step === n ? 'border-teal-600 bg-teal-600 text-white' :
              step > n  ? 'border-gray-400 bg-gray-400 text-white' :
              'border-gray-300 text-gray-300'
            ].join(' ')}>{n}</span>
            {label}
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">

        {/* ── Step 1: File upload ── */}
        {step === 1 && (
          <div className="p-8 max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Select Excel File</h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload an .xlsx file with the standard import format.
            </p>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <span className="text-4xl">📂</span>
              <span className="text-sm text-gray-600 font-medium">Click or drag &amp; drop an Excel file here</span>
              <span className="text-xs text-gray-400">.xlsx files only</span>
              <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
            {parsing && (
              <div className="mt-6 flex items-center gap-3 text-sm text-gray-600">
                <span className="animate-spin text-lg">⏳</span> Parsing file and loading reference data…
              </div>
            )}
            {parseError && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {parseError}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Validation table ── */}
        {step === 2 && (
          <div className="flex flex-col h-full">
            {/* Partial mode banner */}
            {isPartial && (
              <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2 text-sm text-amber-800">
                <span className="font-semibold">Partial import mode</span>
                <span className="text-amber-600">— only existing records will be updated for the columns present in this file. New rows are skipped.</span>
              </div>
            )}
            {/* Summary bar */}
            <div className="px-6 py-3 border-b border-gray-200 bg-white flex flex-wrap items-center gap-4">
              <span className="text-sm text-gray-600">
                <strong className="text-gray-900">{fileName}</strong> — {totalRows} rows{dateRange ? `, ${fmtDate(dateRange.from)} – ${fmtDate(dateRange.to)}` : ''}
              </span>
              <div className="flex gap-2 ml-auto items-center flex-wrap">
                {counts.ready > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    ✓ {counts.ready} ready
                  </span>
                )}
                {counts.warning > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    ⚠ {counts.warning} warning
                  </span>
                )}
                {counts.duplicateUpdate > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    ↑ {counts.duplicateUpdate} will update
                  </span>
                )}
                {counts.duplicateNoChange > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    ⊘ {counts.duplicateNoChange} no changes
                  </span>
                )}
                {counts.skippedNew > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                    ⊘ {counts.skippedNew} new skipped
                  </span>
                )}
                {counts.error > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    ✕ {counts.error} error
                  </span>
                )}
                <button
                  onClick={runImport}
                  disabled={checkedCount === 0 || importing}
                  className="ml-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-40 transition-colors"
                >
                  {importing
                    ? `Importing… (${importProgress}/${importTotal})`
                    : `Import ${checkedCount} Checked Row${checkedCount !== 1 ? 's' : ''}`
                  }
                </button>
              </div>
            </div>

            {/* Progress bar */}
            {importing && (
              <div className="w-full bg-gray-200 h-1">
                <div
                  className="bg-teal-600 h-1 transition-all"
                  style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
                />
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs min-w-[1200px]">
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr className="text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    <th className="px-3 py-2 w-10 text-center">
                      <button
                        onClick={toggleSelectAll}
                        title={allChecked ? 'Deselect all' : 'Select all'}
                        className="w-4 h-4 border-2 rounded flex items-center justify-center shrink-0 mx-auto transition-colors
                          border-gray-400 hover:border-teal-500 bg-white"
                      >
                        {allChecked
                          ? <span className="text-teal-600 text-[10px] leading-none font-bold">✓</span>
                          : nonErrorRows.some(r => r.checked)
                            ? <span className="text-gray-400 text-[10px] leading-none font-bold">—</span>
                            : null
                        }
                      </button>
                    </th>
                    <th className="px-3 py-2 w-36">Status</th>
                    <th className="px-3 py-2">Internal ID</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 min-w-[120px]">Property</th>
                    <th className="px-3 py-2 min-w-[120px]">Contact</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-center">All Prop</th>
                    <th className="px-3 py-2 text-right">Base Net</th>
                    <th className="px-3 py-2 text-right">Tax</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Nights</th>
                    <th className="px-3 py-2 text-right">Days</th>
                    <th className="px-3 py-2 text-right">Adults</th>
                    <th className="px-3 py-2 text-right">Children</th>
                    <th className="px-3 py-2 text-right">Babies</th>
                    <th className="px-3 py-2">Check-in</th>
                    <th className="px-3 py-2">Check-out</th>
                    <th className="px-3 py-2">Booking Ref</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((row, rowIdx) => {
                    const isOut      = row.type === TYPE_OUTGOING
                    const isDisabled = row.status === 'error' || row.status === 'skipped-new'
                    return (
                      <tr key={row.index} className={['transition-colors',
                        isDisabled ? 'opacity-50' : 'hover:bg-gray-50',
                        !row.checked && !isDisabled ? 'bg-gray-50/60' : '',
                      ].join(' ')}>
                        {/* Checkbox */}
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.checked}
                            disabled={isDisabled}
                            onChange={() => toggleRow(rowIdx)}
                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </td>
                        {/* Status */}
                        <td className="px-3 py-2">
                          <div>
                            <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap', statusStyles[row.status]].join(' ')}>
                              {statusLabels[row.status]}
                            </span>
                            {row.statusNote && row.status !== 'duplicate-update' && row.status !== 'duplicate-no-change' && (
                              <div className="text-gray-400 text-xs mt-0.5 max-w-[180px] truncate" title={row.statusNote}>
                                {row.statusNote}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{cellProps(row, 'internalId', row.internalId)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{cellProps(row, 'date', fmtDate(row.date), 'date')}</td>
                        <td className="px-3 py-2">{cellProps(row, 'propertyId', row.propertyName)}</td>
                        <td className="px-3 py-2">
                          {cellProps(row, 'contactName', row.contactName)}
                          {row.isNewContact && <span className="text-xs text-amber-600 block">new</span>}
                        </td>
                        <td className="px-3 py-2">
                          {cellProps(row, 'type', isOut ? 'Income' : 'Expense')}
                        </td>
                        <td className="px-3 py-2">{row.categoryName || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-center">{row.allProperties ? '✓' : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right">{cellProps(row, 'baseAmount', fmtEur(row.baseAmount), 'number')}</td>
                        <td className="px-3 py-2 text-right">{cellProps(row, 'taxAmount', fmtEur(row.taxAmount), 'number')}</td>
                        <td className="px-3 py-2 text-right font-semibold">{cellProps(row, 'totalGross', fmtEur(row.totalGross), 'number')}</td>
                        <td className="px-3 py-2 text-right">{isOut ? cellProps(row, 'nights',   String(row.nights),   'number') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right">{isOut ? cellProps(row, 'days',     String(row.days),     'number') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right">{isOut ? cellProps(row, 'adults',   String(row.adults),   'number') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right">{isOut ? cellProps(row, 'children', String(row.children), 'number') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right">{isOut ? cellProps(row, 'babies',   String(row.babies),   'number') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{isOut ? cellProps(row, 'checkIn',  fmtDate(row.checkIn),  'date') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{isOut ? cellProps(row, 'checkOut', fmtDate(row.checkOut), 'date') : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2">{cellProps(row, 'bookingRef', row.bookingRef)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 3 && results && (
          <div className="p-8 max-w-md mx-auto">
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">{results.failed === 0 ? '✅' : '⚠️'}</div>
              <h2 className="text-xl font-semibold text-gray-900">Import Complete</h2>
            </div>
            <div className="space-y-3 mb-8">
              {results.created > 0 && (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                  <span className="text-sm font-medium text-green-700">Created</span>
                  <span className="text-lg font-bold text-green-700">{results.created}</span>
                </div>
              )}
              {results.updated > 0 && (
                <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <span className="text-sm font-medium text-indigo-700">Updated</span>
                  <span className="text-lg font-bold text-indigo-700">{results.updated}</span>
                </div>
              )}
              {results.skippedNoChange > 0 && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-blue-700">Skipped (no changes)</span>
                  <span className="text-lg font-bold text-blue-700">{results.skippedNoChange}</span>
                </div>
              )}
              {results.failed > 0 && (
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-200">
                  <span className="text-sm font-medium text-red-700">Failed</span>
                  <span className="text-lg font-bold text-red-700">{results.failed}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
              >
                Back to Invoices
              </button>
              <button
                onClick={() => { setStep(1); setRows([]); setFileName(''); setTotalRows(0); setDateRange(null); setResults(null) }}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
