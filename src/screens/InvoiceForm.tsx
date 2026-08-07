import { useEffect, useRef, useState } from 'react'
import { Cr9b5_pt_invoicesService } from '../generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_attachmentsService } from '../generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_referencesService } from '../generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_contactsService } from '../generated/services/Cr9b5_pt_contactsService'
import { Svm_pt_invoicetemplatesService } from '../generated/services/Svm_pt_invoicetemplatesService'
import { Svm_pt_invoicecommentsService } from '../generated/services/Svm_pt_invoicecommentsService'
import type { Cr9b5_pt_invoices } from '../generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '../generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '../generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_attachments } from '../generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_references } from '../generated/models/Cr9b5_pt_referencesModel'
import type { Svm_pt_invoicetemplates } from '../generated/models/Svm_pt_invoicetemplatesModel'
import type { Svm_pt_invoicecomments } from '../generated/models/Svm_pt_invoicecommentsModel'
import { uploadFile, deleteFile, getOrCreateFolder, invoiceFolderPath, isAuthorized, authorizeWithPopup } from '../services/googledrive'
import { logActivity } from '../services/activitylog'
import { fmtEur } from '../utils/formatters'

const TYPE_INCOMING = 233100000
const TYPE_OUTGOING = 233100001
const REF_INCOMING = 233100003
const REF_OUTGOING = 233100004
const REF_CAT_INCOME  = 233100005
const REF_CAT_EXPENSE = 233100006
const ROLE_CLIENT = 233100001
const ROLE_SUPPLIER = 233100000
const TEMPLATE_TYPE_INCOME  = 925060000
const TEMPLATE_TYPE_EXPENSE = 925060001

export interface InvoiceFormProps {
  invoice: Cr9b5_pt_invoices | null  // null = new
  properties: Cr9b5_pt_properties[]
  contacts: Cr9b5_pt_contacts[]      // initial list; form manages its own copy
  // Receives the saved/created record when available so the caller can patch
  // it into local state directly instead of reloading everything.
  onSaved: (record?: Cr9b5_pt_invoices) => void
  onClose: () => void
  readOnly?: boolean
}

// ---------- helpers ----------

function parseAmount(raw: string): number {
  let s = raw.replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) {
    // European: 1.234,56 — dots are thousands separators
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    // Comma-only: treat as decimal (1234,56)
    s = s.replace(',', '.')
  } else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) {
    // Single dot with 3 trailing digits: thousands separator (1.234)
    s = s.replace('.', '')
  }
  return parseFloat(s) || 0
}

function calcTax(baseAmount: string): string {
  const base = parseAmount(baseAmount)
  if (!base || base <= 0) return ''
  return String(Math.round(base * 0.07 * 100) / 100)
}

function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  ))
}

function toFormDate(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

function toIso(date: string): string {
  if (!date) return ''
  // Interpret as local noon to avoid UTC day-shift issues
  return new Date(`${date}T12:00:00`).toISOString()
}

async function getNextSequence(year: number): Promise<number> {
  const res = await Cr9b5_pt_invoicesService.getAll({
    filter: `cr9b5_year eq ${year}`,
    select: ['cr9b5_globalsequence'],
    orderBy: ['cr9b5_globalsequence desc'],
    top: 1,
  })
  const records = res.data ?? []
  if (records.length === 0) return 1
  return (records[0].cr9b5_globalsequence ?? 0) + 1
}

function buildInternalId(shortId: string, seq: number, year: number): string {
  return `${shortId}${String(seq).padStart(3, '0')}/${year}`
}

// ---------- form state ----------

interface InvoiceFormState {
  type: number
  propertyId: string
  allProperties: boolean
  categoryId: string
  contactId: string
  date: string
  description: string
  baseAmount: string
  taxRate: string
  taxAmount: string
  taxIsManual: boolean
  bookingRef: string
  checkIn: string
  checkOut: string
  adults: string
  children: string
  babies: string
}

function emptyForm(): InvoiceFormState {
  return {
    type: TYPE_INCOMING,
    propertyId: '',
    allProperties: false,
    categoryId: '',
    contactId: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
    baseAmount: '',
    taxRate: '7',
    taxAmount: '',
    taxIsManual: false,
    bookingRef: '',
    checkIn: '',
    checkOut: '',
    adults: '',
    children: '',
    babies: '',
  }
}

function invoiceToFormState(inv: Cr9b5_pt_invoices): InvoiceFormState {
  const raw = inv as unknown as Record<string, unknown>
  return {
    type: (inv.cr9b5_type as number) ?? TYPE_INCOMING,
    propertyId: (raw['_cr9b5_property_value'] as string) ?? '',
    allProperties: inv.cr9b5_allproperties ?? false,
    categoryId: (raw['_cr9b5_categoryid_value'] as string) ?? '',
    contactId: (raw['_cr9b5_contact_value'] as string) ?? '',
    date: toFormDate(inv.cr9b5_date),
    description: inv.cr9b5_description ?? '',
    baseAmount: inv.cr9b5_baseamount?.toString() ?? '',
    taxRate: inv.cr9b5_taxrate ?? '7',
    taxAmount: inv.cr9b5_taxamount?.toString() ?? '',
    taxIsManual: inv.cr9b5_taxismanual ?? false,
    bookingRef: inv.cr9b5_bookingreference ?? '',
    checkIn: toFormDate(inv.cr9b5_checkin),
    checkOut: toFormDate(inv.cr9b5_checkout),
    adults: inv.cr9b5_adults?.toString() ?? '',
    children: inv.cr9b5_children?.toString() ?? '',
    babies: inv.cr9b5_babies?.toString() ?? '',
  }
}

// ---------- inline new-contact form state ----------

interface NewContactState {
  name: string
  email: string
  taxid: string
  role: number
  defaultdesc: string
}

const EMPTY_NEW_CONTACT: NewContactState = {
  name: '', email: '', taxid: '', role: ROLE_CLIENT, defaultdesc: '',
}

// ---------- attachment state ----------

interface AttachState {
  typeRefId: string
  fileName: string
  file: File | null
  uploading: boolean
  driveId: string
  driveUrl: string
}

const EMPTY_ATTACH: AttachState = { typeRefId: '', fileName: '', file: null, uploading: false, driveId: '', driveUrl: '' }

// ---------- component ----------

export default function InvoiceForm({ invoice, properties, contacts: contactsProp, onSaved, onClose, readOnly = false }: InvoiceFormProps) {
  const isEdit = invoice !== null

  const [form, setForm] = useState<InvoiceFormState>(
    () => invoice ? invoiceToFormState(invoice) : emptyForm()
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormState | '_form', string>>>({})

  // Contacts — own copy so inline-create can extend it
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>(contactsProp)

  // Inline new-contact panel
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newContact, setNewContact] = useState<NewContactState>(EMPTY_NEW_CONTACT)
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [newContactError, setNewContactError] = useState<string | null>(null)

  // Categories
  const [categories, setCategories] = useState<Cr9b5_pt_references[]>([])

  useEffect(() => {
    const refType = form.type === TYPE_OUTGOING ? REF_CAT_INCOME : REF_CAT_EXPENSE
    Cr9b5_pt_referencesService.getAll({
      filter: `cr9b5_referencetype eq ${refType}`,
      orderBy: ['cr9b5_sortorder asc'],
    }).then(res => setCategories(res.data ?? []))
  }, [form.type])

  // Invoice templates — quick-fill for new invoices only
  const [templates, setTemplates] = useState<Svm_pt_invoicetemplates[]>([])
  const [templateId, setTemplateId] = useState('')

  useEffect(() => {
    if (isEdit || readOnly) return
    const templateType = form.type === TYPE_OUTGOING ? TEMPLATE_TYPE_INCOME : TEMPLATE_TYPE_EXPENSE
    Svm_pt_invoicetemplatesService.getAll({
      filter: `svm_pt_type eq ${templateType}`,
      orderBy: ['svm_pt_name asc'],
    }).then(res => setTemplates(res.data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, isEdit, readOnly])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find(t => t.svm_pt_invoicetemplateid === id)
    if (!t) return
    setForm(f => {
      const next = {
        ...f,
        categoryId: t._svm_category_value ?? f.categoryId,
        description: t.svm_pt_description ?? f.description,
      }
      if (t.svm_pt_defaultamount != null) {
        next.baseAmount = String(t.svm_pt_defaultamount)
        if (!next.taxIsManual) next.taxAmount = calcTax(next.baseAmount)
      }
      return next
    })
  }

  // Invoice comments — only meaningful once the invoice exists
  const [comments, setComments] = useState<Svm_pt_invoicecomments[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  async function loadComments(invoiceId: string) {
    setCommentsLoading(true)
    const res = await Svm_pt_invoicecommentsService.getAll({
      filter: `_svm_invoice_value eq '${invoiceId}'`,
      orderBy: ['createdon desc'],
    })
    setComments(res.data ?? [])
    setCommentsLoading(false)
  }

  async function addComment() {
    if (!activeInvoice || !newComment.trim()) return
    setCommentSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Svm_pt_invoicecommentsService.create({
        svm_pt_comment: newComment.trim(),
        'svm_Invoice@odata.bind': `/cr9b5_pt_invoices(${activeInvoice.cr9b5_pt_invoiceid})`,
      } as any)
      if (!res.success) throw (res.error as Error) ?? new Error('Failed to add comment.')
      setNewComment('')
      await loadComments(activeInvoice.cr9b5_pt_invoiceid)
    } finally {
      setCommentSaving(false)
    }
  }

  // Attachments
  const [attachments, setAttachments] = useState<Cr9b5_pt_attachments[]>([])
  const [attachRefTypes, setAttachRefTypes] = useState<Cr9b5_pt_references[]>([])
  const [attachForm, setAttachForm] = useState<AttachState>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [gdConnected, setGdConnected] = useState(isAuthorized())

  // After a new invoice is created we hold the record here so attachments can be added before Done
  const [createdInvoice, setCreatedInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const activeInvoice = createdInvoice ?? invoice  // the record to use for attachments
  const showAttachments = isEdit || createdInvoice !== null

  useEffect(() => {
    if (!isEdit || !invoice) return
    loadAttachments(invoice.cr9b5_pt_invoiceid, form.type)
    loadComments(invoice.cr9b5_pt_invoiceid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  // ---------- computed ----------

  const isOutgoing = form.type === TYPE_OUTGOING
  const nights = calcNights(form.checkIn, form.checkOut)
  const days = nights + 1
  const baseNum = parseAmount(form.baseAmount)
  const taxNum  = parseAmount(form.taxAmount)
  const totalGross = baseNum + taxNum

  // ---------- field helpers ----------

  function setField<K extends keyof InvoiceFormState>(key: K, val: InvoiceFormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }

  function handleBaseAmountChange(val: string) {
    setForm(f => f.taxIsManual
      ? { ...f, baseAmount: val }
      : { ...f, baseAmount: val, taxAmount: calcTax(val) }
    )
    if (errors.baseAmount) setErrors(e => ({ ...e, baseAmount: undefined }))
  }

  function handleTaxAmountChange(val: string) {
    setForm(f => ({ ...f, taxAmount: val, taxIsManual: true, taxRate: 'n/a' }))
  }

  function resetTax() {
    setForm(f => ({ ...f, taxIsManual: false, taxRate: '7', taxAmount: calcTax(f.baseAmount) }))
  }

  function handleContactChange(contactId: string) {
    const contact = contacts.find(c => c.cr9b5_pt_contactid === contactId)
    setForm(f => ({
      ...f,
      contactId,
      description: contact?.cr9b5_defaultdescription ?? f.description,
    }))
    if (errors.contactId) setErrors(e => ({ ...e, contactId: undefined }))
  }

  // ---------- validation ----------

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.allProperties && !form.propertyId) e.propertyId = 'Property is required.'
    if (!form.contactId)  e.contactId  = 'Contact is required.'
    if (!form.date)       e.date       = 'Date is required.'
    if (!form.baseAmount || !parseAmount(form.baseAmount)) e.baseAmount = 'Base amount is required.'
    if (isOutgoing) {
      if (!form.checkIn)  e.checkIn  = 'Check-in is required for outgoing invoices.'
      if (!form.checkOut) e.checkOut = 'Check-out is required for outgoing invoices.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ---------- save invoice ----------

  async function save() {
    if (!validate()) return

    setSaving(true)
    setErrors({})

    try {
      const invoiceYear = new Date(form.date).getFullYear()
      const property = properties.find(p => p.cr9b5_pt_propertyid === form.propertyId)

      let internalId = invoice?.cr9b5_internalid ?? ''
      let globalSequence = invoice?.cr9b5_globalsequence ?? 0

      if (!isEdit) {
        globalSequence = await getNextSequence(invoiceYear)
        if (form.allProperties) {
          internalId = buildInternalId('All', globalSequence, invoiceYear)
        } else {
          if (!property) throw new Error('Property not found.')
          internalId = buildInternalId(property.cr9b5_shortid, globalSequence, invoiceYear)
        }
      }

      // Build payload — OData bind fields for lookups are included via the plain object
      // The service cast handles the type mismatch; bind fields are passed through as-is
      const payload: Record<string, unknown> = {
        cr9b5_internalid: internalId,
        cr9b5_globalsequence: globalSequence,
        cr9b5_year: invoiceYear,
        cr9b5_type: form.type,
        cr9b5_date: toIso(form.date),
        cr9b5_description: form.description.trim() || undefined,
        cr9b5_baseamount: baseNum,
        cr9b5_taxrate: form.taxIsManual ? 'n/a' : form.taxRate,
        cr9b5_taxamount: taxNum,
        cr9b5_taxismanual: form.taxIsManual,
        cr9b5_totalgross: totalGross,
        cr9b5_allproperties: form.allProperties,
        'cr9b5_Contact@odata.bind': `/cr9b5_pt_contacts(${form.contactId})`,
      }

      if (!form.allProperties && form.propertyId) {
        payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${form.propertyId})`
      }
      if (form.categoryId) {
        payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${form.categoryId})`
      }

      if (isOutgoing) {
        payload.cr9b5_bookingreference = form.bookingRef.trim() || undefined
        payload.cr9b5_checkin  = toIso(form.checkIn)
        payload.cr9b5_checkout = toIso(form.checkOut)
        payload.cr9b5_nights   = nights
        payload.cr9b5_days     = days
        payload.cr9b5_adults   = form.adults   !== '' ? parseInt(form.adults)   : undefined
        payload.cr9b5_children = form.children !== '' ? parseInt(form.children) : undefined
        payload.cr9b5_babies   = form.babies   !== '' ? parseInt(form.babies)   : undefined
      }

      // Detect changed fields for update logging
      const changedFields: string[] = []
      if (isEdit && invoice) {
        const orig = invoiceToFormState(invoice)
        const fieldLabels: Array<[keyof InvoiceFormState, string]> = [
          ['type', 'Type'], ['propertyId', 'Property'], ['contactId', 'Contact'],
          ['date', 'Date'], ['description', 'Description'], ['baseAmount', 'Base Amount'],
          ['taxRate', 'Tax Rate'], ['taxAmount', 'Tax Amount'], ['bookingRef', 'Booking Ref'],
          ['checkIn', 'Check-in'], ['checkOut', 'Check-out'],
          ['adults', 'Adults'], ['children', 'Children'], ['babies', 'Babies'],
        ]
        for (const [key, label] of fieldLabels) {
          if (String(orig[key]) !== String(form[key])) changedFields.push(label)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = isEdit && invoice
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await Cr9b5_pt_invoicesService.update(invoice.cr9b5_pt_invoiceid, payload as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await Cr9b5_pt_invoicesService.create(payload as any)

      if (!result.success) {
        const msg = (result.error as Error)?.message ?? 'Save failed. Check all fields and try again.'
        throw new Error(msg)
      }

      if (isEdit) {
        logActivity('Updated', 'Invoice', internalId,
          changedFields.length ? `Fields changed: ${changedFields.join(', ')}` : undefined)
        // Dataverse update calls don't reliably return the full updated record,
        // so build the merged record from what we already know locally —
        // avoids the caller having to reload the whole invoice list.
        const updated = {
          ...(invoice as Cr9b5_pt_invoices),
          ...(payload as Partial<Cr9b5_pt_invoices>),
        } as unknown as Record<string, unknown>
        updated['_cr9b5_contact_value'] = form.contactId
        updated['_cr9b5_property_value'] = form.allProperties ? undefined : form.propertyId
        updated['_cr9b5_categoryid_value'] = form.categoryId || undefined
        onSaved(updated as unknown as Cr9b5_pt_invoices)
      } else {
        // New invoice created — stay open so user can optionally add attachments
        const created = result.data!
        logActivity('Created', 'Invoice', internalId)
        setCreatedInvoice(created)
        await loadAttachments(created.cr9b5_pt_invoiceid, form.type)
      }
    } catch (e: unknown) {
      setErrors({ _form: e instanceof Error ? e.message : 'Save failed.' })
    } finally {
      setSaving(false)
    }
  }

  // ---------- inline new contact ----------

  async function saveNewContact() {
    if (!newContact.name.trim()) {
      setNewContactError('Name is required.')
      return
    }
    setNewContactSaving(true)
    setNewContactError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await Cr9b5_pt_contactsService.create({
        cr9b5_name: newContact.name.trim(),
        cr9b5_role: newContact.role as any,
        cr9b5_email: newContact.email.trim() || undefined,
        cr9b5_taxid: newContact.taxid.trim() || undefined,
        cr9b5_defaultdescription: newContact.defaultdesc.trim() || undefined,
      } as any)

      if (!result.success || !result.data) throw (result.error as Error) ?? new Error('Failed to create contact.')

      // The create call already returns the full new record — insert it
      // directly instead of refetching the entire contact list.
      const created = result.data
      setContacts(cs => [...cs, created].sort((a, b) => a.cr9b5_name.localeCompare(b.cr9b5_name)))
      handleContactChange(created.cr9b5_pt_contactid)

      setNewContact(EMPTY_NEW_CONTACT)
      setNewContactOpen(false)
    } catch (e: unknown) {
      setNewContactError(e instanceof Error ? e.message : 'Failed to create contact.')
    } finally {
      setNewContactSaving(false)
    }
  }

  // ---------- attachments ----------

  async function loadAttachments(invoiceId: string, type: number) {
    setAttachLoading(true)
    const refType = type === TYPE_OUTGOING ? REF_OUTGOING : REF_INCOMING
    const [attachRes, refRes] = await Promise.all([
      Cr9b5_pt_attachmentsService.getAll({
        filter: `_cr9b5_invoiceid_value eq '${invoiceId}'`,
        orderBy: ['cr9b5_uploadedon desc'],
      }),
      Cr9b5_pt_referencesService.getAll({
        filter: `cr9b5_referencetype eq ${refType}`,
        orderBy: ['cr9b5_sortorder asc'],
      }),
    ])
    setAttachments(attachRes.data ?? [])
    setAttachRefTypes(refRes.data ?? [])
    setAttachLoading(false)
  }

  // Cached Drive folder id for this invoice, seeded from the record if it
  // already has one so returning to edit an invoice skips the path walk too.
  const [driveFolderId, setDriveFolderId] = useState<string | undefined>(
    (invoice as unknown as { svm_pt_googledrivefolderid?: string } | null)?.svm_pt_googledrivefolderid
  )

  async function handleFileSelect(file: File) {
    if (!activeInvoice) return
    const prop = properties.find(p => p.cr9b5_pt_propertyid === form.propertyId)
    const internalId = activeInvoice.cr9b5_internalid
    setAttachForm(f => ({ ...f, file, fileName: file.name, uploading: true, driveId: '', driveUrl: '' }))
    setAttachError(null)
    try {
      let folderId = driveFolderId
      if (!folderId) {
        const path = prop
          ? invoiceFolderPath(prop.cr9b5_name, prop.cr9b5_shortid, internalId)
          : ['PropTrack', 'Invoices', internalId.replace(/\//g, '-')]
        folderId = await getOrCreateFolder(path)
        setDriveFolderId(folderId)
        // Persist so the next time this invoice is opened, the cache hits too.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cr9b5_pt_invoicesService.update(activeInvoice.cr9b5_pt_invoiceid, { svm_pt_googledrivefolderid: folderId } as any).catch(() => { /* cache is best-effort */ })
      }
      const { id, webViewLink } = await uploadFile(file, folderId)
      setAttachForm(f => ({ ...f, uploading: false, driveId: id, driveUrl: webViewLink }))
    } catch (e: unknown) {
      setAttachForm(f => ({ ...f, uploading: false, file: null }))
      setAttachError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  async function addAttachment() {
    if (!activeInvoice || !attachForm.fileName.trim()) {
      setAttachError('Choose a file first.')
      return
    }
    if (attachForm.uploading) return
    setAttachSaving(true)
    setAttachError(null)
    try {
      const refType = form.type === TYPE_OUTGOING ? REF_OUTGOING : REF_INCOMING
      const p: Record<string, unknown> = {
        cr9b5_filename: attachForm.fileName.trim(),
        cr9b5_referencetype: refType,
        cr9b5_uploadedon: new Date().toISOString(),
        'cr9b5_InvoiceId@odata.bind': `/cr9b5_pt_invoices(${activeInvoice.cr9b5_pt_invoiceid})`,
      }
      if (attachForm.typeRefId) p['cr9b5_AttachType@odata.bind'] = `/cr9b5_pt_references(${attachForm.typeRefId})`
      if (attachForm.driveId)  p.cr9b5_googledriveid  = attachForm.driveId
      if (attachForm.driveUrl) p.cr9b5_googledriveurl = attachForm.driveUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_attachmentsService.create(p as any)
      if (!res.success) throw (res.error as Error) ?? new Error('Failed to add attachment.')
      logActivity('Created', 'Attachment', attachForm.fileName.trim(),
        `Uploaded to: ${activeInvoice.cr9b5_internalid}`)
      setAttachForm(EMPTY_ATTACH)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadAttachments(activeInvoice.cr9b5_pt_invoiceid, form.type)
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to add attachment.')
    } finally {
      setAttachSaving(false)
    }
  }

  async function deleteAttachment(a: Cr9b5_pt_attachments) {
    if (!activeInvoice || !confirm('Delete this attachment?')) return
    if (a.cr9b5_googledriveid) {
      try { await deleteFile(a.cr9b5_googledriveid) } catch { /* ignore if already gone */ }
    }
    await Cr9b5_pt_attachmentsService.delete(a.cr9b5_pt_attachmentid)
    logActivity('Deleted', 'Attachment', a.cr9b5_filename)
    await loadAttachments(activeInvoice.cr9b5_pt_invoiceid, form.type)
  }

  // ---------- shared input class helpers ----------

  function cls(hasError: boolean) {
    return [
      'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
      hasError
        ? 'border-red-400 focus:ring-red-400'
        : 'border-gray-300 focus:ring-indigo-500',
    ].join(' ')
  }

  // ---------- render ----------

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 py-6 px-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {readOnly ? `Invoice — ${invoice!.cr9b5_internalid}` : isEdit ? `Edit Invoice — ${invoice!.cr9b5_internalid}` : 'New Invoice'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type *</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              {[{ val: TYPE_INCOMING, label: 'Expense' }, { val: TYPE_OUTGOING, label: 'Income' }].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => {
                    if (isEdit || readOnly) return
                    setForm(f => ({ ...f, type: opt.val, categoryId: '' }))
                    if (errors.type) setErrors(e => ({ ...e, type: undefined }))
                  }}
                  disabled={isEdit || readOnly}
                  className={[
                    'px-5 py-2 text-sm font-medium transition-colors',
                    form.type === opt.val ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                    isEdit ? 'opacity-60 cursor-default' : '',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template quick-fill (new invoices only) */}
          {!isEdit && !readOnly && templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Use Template</label>
              <select
                value={templateId}
                onChange={e => applyTemplate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">No template — fill in manually</option>
                {templates.map(t => (
                  <option key={t.svm_pt_invoicetemplateid} value={t.svm_pt_invoicetemplateid}>{t.svm_pt_name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Pre-fills category, description and default amount below.</p>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.categoryId}
              onChange={e => setField('categoryId', e.target.value)}
              disabled={readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">Select category…</option>
              {categories.map(c => (
                <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>
              ))}
            </select>
          </div>

          {/* Property + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
              <select
                value={form.allProperties ? '' : form.propertyId}
                onChange={e => setField('propertyId', e.target.value)}
                disabled={readOnly || form.allProperties}
                className={cls(!!errors.propertyId)}
              >
                {form.allProperties
                  ? <option value="">All Properties</option>
                  : <>
                    <option value="">Select property…</option>
                    {properties.map(p => (
                      <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>
                    ))}
                  </>
                }
              </select>
              {errors.propertyId && <p className="mt-1 text-xs text-red-600">{errors.propertyId}</p>}
              {!readOnly && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={form.allProperties}
                    onChange={e => setForm(f => ({ ...f, allProperties: e.target.checked, propertyId: '' }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-600">All Properties</span>
                </label>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setField('date', e.target.value)}
                disabled={readOnly}
                className={cls(!!errors.date)}
              />
              {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
            </div>
          </div>

          {/* Contact + inline new-contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact *</label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <select
                  value={form.contactId}
                  onChange={e => handleContactChange(e.target.value)}
                  disabled={readOnly}
                  className={cls(!!errors.contactId)}
                >
                  <option value="">Select contact…</option>
                  {contacts.map(c => (
                    <option key={c.cr9b5_pt_contactid} value={c.cr9b5_pt_contactid}>{c.cr9b5_name}</option>
                  ))}
                </select>
                {errors.contactId && <p className="mt-1 text-xs text-red-600">{errors.contactId}</p>}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => { setNewContactOpen(o => !o); setNewContactError(null) }}
                  title="Create new contact"
                  className="shrink-0 mt-0.5 w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors text-lg font-light"
                >
                  +
                </button>
              )}
            </div>

            {/* Inline new-contact panel */}
            {newContactOpen && !readOnly && (
              <div className="mt-3 border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">New Contact</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                    <input
                      type="text"
                      value={newContact.name}
                      onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Full name or company"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select
                      value={newContact.role}
                      onChange={e => setNewContact(c => ({ ...c, role: Number(e.target.value) }))}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value={ROLE_CLIENT}>Client</option>
                      <option value={ROLE_SUPPLIER}>Supplier</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                    <input
                      type="email"
                      value={newContact.email}
                      onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tax ID</label>
                    <input
                      type="text"
                      value={newContact.taxid}
                      onChange={e => setNewContact(c => ({ ...c, taxid: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Default Description</label>
                  <input
                    type="text"
                    value={newContact.defaultdesc}
                    onChange={e => setNewContact(c => ({ ...c, defaultdesc: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Pre-fills invoice description (optional)"
                  />
                </div>

                {newContactError && <p className="text-xs text-red-600">{newContactError}</p>}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setNewContactOpen(false); setNewContact(EMPTY_NEW_CONTACT) }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNewContact}
                    disabled={newContactSaving}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {newContactSaving ? 'Saving…' : 'Create Contact'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              rows={2}
              disabled={readOnly}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Pre-filled from contact's default description"
            />
          </div>

          {/* Outgoing: Stay Details */}
          {isOutgoing && (
            <div className="space-y-4 border border-indigo-100 bg-indigo-50/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Stay Details</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Booking Reference</label>
                <input
                  type="text"
                  value={form.bookingRef}
                  onChange={e => setField('bookingRef', e.target.value)}
                  disabled={readOnly}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Airbnb HMXYZ123"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in *</label>
                  <input
                    type="date"
                    value={form.checkIn}
                    onChange={e => setField('checkIn', e.target.value)}
                    disabled={readOnly}
                    className={cls(!!errors.checkIn)}
                  />
                  {errors.checkIn && <p className="mt-1 text-xs text-red-600">{errors.checkIn}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out *</label>
                  <input
                    type="date"
                    value={form.checkOut}
                    onChange={e => setField('checkOut', e.target.value)}
                    disabled={readOnly}
                    className={cls(!!errors.checkOut)}
                  />
                  {errors.checkOut && <p className="mt-1 text-xs text-red-600">{errors.checkOut}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nights</label>
                  <input readOnly value={form.checkIn && form.checkOut ? nights : ''}
                    className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-default" placeholder="auto" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
                  <input readOnly value={form.checkIn && form.checkOut ? days : ''}
                    className="w-full border border-gray-200 bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-default" placeholder="auto" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {(['adults', 'children', 'babies'] as const).map(key => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key}</label>
                    <input
                      type="number" min="0"
                      value={form[key]}
                      onChange={e => setField(key, e.target.value)}
                      disabled={readOnly}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Amounts */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Amounts (EUR)</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Amount *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.baseAmount}
                  onChange={e => handleBaseAmountChange(e.target.value)}
                  disabled={readOnly}
                  className={cls(!!errors.baseAmount)}
                  placeholder="0.00"
                />
                {errors.baseAmount && <p className="mt-1 text-xs text-red-600">{errors.baseAmount}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  Tax Amount
                  {form.taxIsManual && (
                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">manual</span>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={resetTax} title="Reset to 7%"
                      className="text-gray-400 hover:text-indigo-600 text-base leading-none ml-auto">↺</button>
                  )}
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.taxAmount}
                  onChange={e => handleTaxAmountChange(e.target.value)}
                  disabled={readOnly}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Rate: {form.taxIsManual ? 'n/a (manual)' : `${form.taxRate}%`}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
              <span className="text-sm font-medium text-gray-700">Total Gross</span>
              <span className="text-lg font-semibold text-gray-900">
                {baseNum > 0 || taxNum > 0 ? fmtEur(totalGross) : '—'}
              </span>
            </div>
          </div>

          {/* Attachments */}
          {showAttachments && activeInvoice && (
            <div className="space-y-3 border-t border-gray-200 pt-5">
              {createdInvoice && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span>✓ Invoice <strong>{createdInvoice.cr9b5_internalid}</strong> created. Add attachments below or click Done.</span>
                </div>
              )}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachments</p>
              {!readOnly && (
                <div className="space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
                  <input ref={fileInputRef} type="file" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                  {!gdConnected ? (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await authorizeWithPopup()
                          setGdConnected(true)
                        } catch (e) {
                          setAttachError(e instanceof Error ? e.message : 'Google Drive sign-in failed.')
                        }
                      }}
                      className="w-full border border-dashed border-indigo-300 rounded-lg px-2.5 py-2 text-sm text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
                    >
                      🔗 Connect Google Drive to attach files
                    </button>
                  ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={attachForm.typeRefId}
                      onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    >
                      <option value="">Type (optional)…</option>
                      {attachRefTypes.map(r => (
                        <option key={r.cr9b5_pt_referenceid} value={r.cr9b5_pt_referenceid}>{r.cr9b5_value}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors text-left truncate"
                    >
                      {attachForm.uploading ? '⏳ Uploading…' : attachForm.driveId ? `✓ ${attachForm.fileName}` : '📎 Choose file…'}
                    </button>
                  </div>
                  )}
                  {attachError && <p className="text-xs text-red-600">{attachError}</p>}
                  {gdConnected && (
                    <button onClick={addAttachment}
                      disabled={attachSaving || attachForm.uploading || !attachForm.driveId}
                      className="w-full py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {attachSaving ? 'Adding…' : '+ Add Attachment'}
                    </button>
                  )}
                </div>
              )}
              {attachLoading ? (
                <p className="text-sm text-gray-400">Loading attachments…</p>
              ) : attachments.length === 0 ? (
                <p className="text-sm text-gray-400">No attachments yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
                  {attachments.map(a => (
                    <li key={a.cr9b5_pt_attachmentid} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        {a.cr9b5_googledriveurl
                          ? <a href={a.cr9b5_googledriveurl} target="_blank" rel="noreferrer"
                              className="text-sm text-indigo-600 hover:underline truncate block">{a.cr9b5_filename}</a>
                          : <span className="text-sm text-gray-800 truncate block">{a.cr9b5_filename}</span>
                        }
                        {a.cr9b5_attachtypename && <span className="text-xs text-gray-400">{a.cr9b5_attachtypename}</span>}
                      </div>
                      {!readOnly && (
                        <button onClick={() => deleteAttachment(a)}
                          className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Comments */}
          {isEdit && invoice && (
            <div className="space-y-3 border-t border-gray-200 pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comments</p>
              {commentsLoading ? (
                <p className="text-sm text-gray-400">Loading comments…</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-gray-400">No comments yet.</p>
              ) : (
                <ul className="space-y-2">
                  {comments.map(c => (
                    <li key={c.svm_pt_invoicecommentid} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.svm_pt_comment}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {c.createdbyname ?? 'Unknown'} · {c.createdon ? new Date(c.createdon).toLocaleString('de-DE') : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="flex gap-2 items-start">
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    rows={2}
                    placeholder="Add a comment…"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    type="button"
                    onClick={addComment}
                    disabled={commentSaving || !newComment.trim()}
                    className="shrink-0 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {commentSaving ? 'Adding…' : 'Add'}
                  </button>
                </div>
              )}
            </div>
          )}

          {errors._form && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {errors._form}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          {readOnly || createdInvoice ? (
            <button
              onClick={() => createdInvoice ? onSaved(createdInvoice) : onClose()}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
