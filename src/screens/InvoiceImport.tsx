import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_propertiesService } from '../generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001
const ROLE_SUPPLIER = 233100000
const ROLE_CLIENT   = 233100001

type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate-no-change' | 'duplicate-update'

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
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseDDMMYYYY(raw: unknown): string {
  if (!raw) return ''
  if (raw instanceof Date) {
    const y  = raw.getFullYear()
    const mo = String(raw.getMonth() + 1).padStart(2, '0')
    const d  = String(raw.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return ''
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
}

function stripCurrency(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const s = String(raw).replace(/[€\s']/g, '').replace(',', '.')
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

// ── column indices ────────────────────────────────────────────────────────────
const COL = {
  date:          0,
  glSequence:    1,
  no:            2,
  internalId:    3,
  house:         4,
  property:      5,
  number:        6,
  year:          7,
  id:            8,
  counterpart:   9,
  name:          10,
  taxId:         11,
  supCl:         12,
  type:          13,
  baseNet:       14,
  baseIgic:      15,
  baseGross:     16,
  taxRate:       17,
  standard:      18,
  rentStart:     19,
  rentEnd:       20,
  bookingNumber: 21,
  nights:        22,
  days:          23,
  adults:        24,
  children:      25,
  babies:        26,
} as const

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

      const dataRows = raw.filter((_, i) => i > 0).filter(r => r.some(c => c !== ''))
      if (dataRows.length === 0) throw new Error('No data rows found in file.')

      setFileName(file.name)
      setTotalRows(dataRows.length)

      const dates = dataRows.map(r => parseDDMMYYYY(r[COL.date])).filter(Boolean)
      if (dates.length) {
        dates.sort()
        setDateRange({ from: dates[0], to: dates[dates.length - 1] })
      }

      const [propRes, conRes, invRes] = await Promise.all([
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
      ])

      const props = propRes.data ?? []
      const cons  = conRes.data ?? []

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
        mapRow(r, idx, props, cons, existingMap)
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
    props: Cr9b5_pt_properties[],
    cons: Cr9b5_pt_contacts[],
    existingMap: Map<string, ExistingRecord>,
  ): ImportRow {
    const errors: string[] = []
    const warnings: string[] = []

    const rawInternalId = String(r[COL.id] ?? '').trim()
    const rawDate       = r[COL.date]
    const rawName       = String(r[COL.name] ?? '').trim()
    const rawTaxId      = String(r[COL.taxId] ?? '').trim()
    const rawSupCl      = String(r[COL.supCl] ?? '').trim()
    const rawType       = String(r[COL.type] ?? '').trim()
    const rawProperty   = String(r[COL.property] ?? '').trim()
    const rawHouse      = String(r[COL.house] ?? '').trim()
    const rawBaseNet    = r[COL.baseNet]
    const rawBaseIgic   = r[COL.baseIgic]
    const rawBaseGross  = r[COL.baseGross]
    const rawTaxRate    = r[COL.taxRate]
    const rawRentStart  = r[COL.rentStart]
    const rawRentEnd    = r[COL.rentEnd]
    const rawBooking    = String(r[COL.bookingNumber] ?? '').trim()
    const rawNights     = r[COL.nights]
    const rawDays       = r[COL.days]
    const rawAdults     = r[COL.adults]
    const rawChildren   = r[COL.children]
    const rawBabies     = r[COL.babies]
    const rawGlSeq      = r[COL.glSequence]
    const rawYear       = r[COL.year]

    // Date
    const date = parseDDMMYYYY(rawDate)
    if (!date) errors.push('Invalid or missing date')

    // Property
    const propNameLower = rawProperty.toLowerCase()
    const houseLower    = rawHouse.toLowerCase()
    let property = props.find(p => p.cr9b5_name.toLowerCase() === propNameLower)
    if (!property && houseLower) {
      property = props.find(p => p.cr9b5_shortid?.toLowerCase() === houseLower)
    }
    if (!property) errors.push(`Property not found: ${rawProperty || rawHouse}`)

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
    const typeVal = typeStr.includes('outgoing') ? TYPE_OUTGOING : TYPE_INCOMING
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
      contactTaxId:   rawTaxId,
      contactRole:    rawSupCl.toLowerCase().includes('supplier') ? ROLE_SUPPLIER : ROLE_CLIENT,
      isNewContact,
      type:           typeVal,
      baseAmount,
      taxAmount,
      totalGross,
      taxRate,
      taxIsManual,
      globalSequence: parseInt2(rawGlSeq),
      year:           parseInt2(rawYear),
      checkIn,
      checkOut,
      nights:   parseInt2(rawNights),
      days:     parseInt2(rawDays),
      adults:   parseInt2(rawAdults),
      children: parseInt2(rawChildren),
      babies:   parseInt2(rawBabies),
      bookingRef: rawBooking,
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
          checked:    changed,   // update rows checked by default, no-change rows unchecked
          existingId: existing.id,
        }
      }
    }

    return partialRow
  }

  function buildRow(
    idx: number,
    status: RowStatus,
    note: string,
    existingId: string | null,
    r: unknown[],
    props: Cr9b5_pt_properties[],
    cons: Cr9b5_pt_contacts[],
  ): ImportRow {
    const rawType  = String(r[COL.type] ?? '').toLowerCase()
    const typeVal  = rawType.includes('outgoing') ? TYPE_OUTGOING : TYPE_INCOMING
    const isOut    = typeVal === TYPE_OUTGOING
    const rawName  = String(r[COL.name] ?? '').trim()
    const contact  = cons.find(c => c.cr9b5_name.toLowerCase() === rawName.toLowerCase())
    const rawProp  = String(r[COL.property] ?? '').trim()
    const rawHouse = String(r[COL.house] ?? '').trim()
    let property   = props.find(p => p.cr9b5_name.toLowerCase() === rawProp.toLowerCase())
    if (!property) property = props.find(p => p.cr9b5_shortid?.toLowerCase() === rawHouse.toLowerCase())
    return {
      index:         idx,
      status,
      statusNote:    note,
      checked:       status === 'duplicate-update',
      existingId,
      date:          parseDDMMYYYY(r[COL.date]),
      internalId:    String(r[COL.id] ?? '').trim(),
      propertyId:    property?.cr9b5_pt_propertyid ?? null,
      propertyName:  property?.cr9b5_name ?? rawProp,
      contactId:     contact?.cr9b5_pt_contactid ?? null,
      contactName:   rawName,
      contactTaxId:  String(r[COL.taxId] ?? '').trim(),
      contactRole:   String(r[COL.supCl] ?? '').toLowerCase().includes('supplier') ? ROLE_SUPPLIER : ROLE_CLIENT,
      isNewContact:  false,
      type:          typeVal,
      baseAmount:    stripCurrency(r[COL.baseNet]),
      taxAmount:     stripCurrency(r[COL.baseIgic]),
      totalGross:    stripCurrency(r[COL.baseGross]),
      taxRate:       parseTaxRate(r[COL.taxRate]),
      taxIsManual:   stripCurrency(r[COL.baseIgic]) === 0,
      globalSequence: parseInt2(r[COL.glSequence]),
      year:          parseInt2(r[COL.year]),
      checkIn:       isOut ? parseDDMMYYYY(r[COL.rentStart]) : '',
      checkOut:      isOut ? parseDDMMYYYY(r[COL.rentEnd])   : '',
      nights:        parseInt2(r[COL.nights]),
      days:          parseInt2(r[COL.days]),
      adults:        parseInt2(r[COL.adults]),
      children:      parseInt2(r[COL.children]),
      babies:        parseInt2(r[COL.babies]),
      bookingRef:    String(r[COL.bookingNumber] ?? '').trim(),
    }
  }

  // Keep buildRow in scope to avoid unused warning — used for future re-parse flows
  void buildRow

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
      case 'baseAmount': return { ...row, baseAmount: parseFloat(val) || 0 }
      case 'taxAmount':  return { ...row, taxAmount:  parseFloat(val) || 0 }
      case 'totalGross': return { ...row, totalGross: parseFloat(val) || 0 }
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

    if (!row.date)        errors.push('Invalid or missing date')
    if (!row.propertyId)  errors.push(`Property not found: ${row.propertyName}`)
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

  const nonErrorRows = rows.filter(r => r.status !== 'error')
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

    // Deduplicate new contacts by name
    const newContactNames = new Map<string, ImportRow>()
    for (const row of processable) {
      if (row.isNewContact && !newContactNames.has(row.contactName.toLowerCase())) {
        newContactNames.set(row.contactName.toLowerCase(), row)
      }
    }

    const createdContactIds = new Map<string, string>()
    for (const [, row] of newContactNames) {
      try {
        const res = await Cr9b5_pt_contactsService.create({
          cr9b5_name:  row.contactName,
          cr9b5_taxid: row.contactTaxId || undefined,
          cr9b5_role:  row.contactRole as never,
        } as never)
        if (res.data?.cr9b5_pt_contactid) {
          createdContactIds.set(row.contactName.toLowerCase(), res.data.cr9b5_pt_contactid)
        }
      } catch {
        // contact creation failed; invoices for this contact will fail too
      }
    }

    for (const row of processable) {
      try {
        const contactId = row.contactId ?? createdContactIds.get(row.contactName.toLowerCase())
        const toIso = (d: string) => d ? new Date(`${d}T12:00:00`).toISOString() : undefined

        const payload: Record<string, unknown> = {
          cr9b5_internalid:     row.internalId,
          cr9b5_globalsequence: row.globalSequence || undefined,
          cr9b5_year:           row.year || undefined,
          cr9b5_type:           row.type,
          cr9b5_date:           toIso(row.date),
          cr9b5_baseamount:     row.baseAmount,
          cr9b5_taxrate:        row.taxIsManual ? 'n/a' : row.taxRate,
          cr9b5_taxamount:      row.taxAmount,
          cr9b5_taxismanual:    row.taxIsManual,
          cr9b5_totalgross:     row.totalGross,
          cr9b5_nights:         row.nights,
          cr9b5_days:           row.days,
          cr9b5_adults:         row.adults,
          cr9b5_children:       row.children,
          cr9b5_babies:         row.babies,
        }

        if (row.propertyId) {
          payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${row.propertyId})`
        }
        if (contactId) {
          payload['cr9b5_Contact@odata.bind'] = `/cr9b5_pt_contacts(${contactId})`
        }
        if (row.type === TYPE_OUTGOING) {
          if (row.checkIn)    payload.cr9b5_checkin          = toIso(row.checkIn)
          if (row.checkOut)   payload.cr9b5_checkout         = toIso(row.checkOut)
          if (row.bookingRef) payload.cr9b5_bookingreference = row.bookingRef
        }

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
  }
  const statusLabels: Record<RowStatus, string> = {
    ready:               'Ready',
    warning:             'Warning',
    error:               'Error',
    'duplicate-update':  'Duplicate — will update',
    'duplicate-no-change': 'Duplicate — no changes',
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
                    const isDisabled = row.status === 'error'
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
