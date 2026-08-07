import { useEffect, useRef, useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Textarea, Field, Select, Checkbox, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Cr9b5_pt_attachmentsService } from '@/generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Svm_pt_invoicetemplatesService } from '@/generated/services/Svm_pt_invoicetemplatesService'
import { Svm_pt_invoicecommentsService } from '@/generated/services/Svm_pt_invoicecommentsService'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_attachments } from '@/generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import type { Svm_pt_invoicetemplates } from '@/generated/models/Svm_pt_invoicetemplatesModel'
import type { Svm_pt_invoicecomments } from '@/generated/models/Svm_pt_invoicecommentsModel'
import { uploadFile, deleteFile, getOrCreateFolder, invoiceFolderPath, isAuthorized, authorizeWithPopup } from '@/services/googledrive'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'

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
  invoice: Cr9b5_pt_invoices | null
  properties: Cr9b5_pt_properties[]
  contacts: Cr9b5_pt_contacts[]
  onSaved: (record?: Cr9b5_pt_invoices) => void
  onClose: () => void
  readOnly?: boolean
}

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: '4px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' },
  segment: { display: 'flex', borderRadius: tokens.borderRadiusMedium, overflow: 'hidden', border: `1px solid ${tokens.colorNeutralStroke1}`, width: 'fit-content' },
  segmentBtn: { padding: '8px 20px', fontSize: '14px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: tokens.colorNeutralBackground1 },
  segmentBtnActive: { backgroundColor: tokens.colorBrandBackground, color: 'white' },
  panel: { border: `1px solid ${tokens.colorBrandStroke2}`, backgroundColor: tokens.colorBrandBackground2, borderRadius: tokens.borderRadiusLarge, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' },
  totalRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusMedium, padding: '10px 16px', border: `1px solid ${tokens.colorNeutralStroke2}` },
  errorBanner: { borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorPaletteRedBackground1, border: `1px solid ${tokens.colorPaletteRedBorder1}`, padding: '10px 14px', fontSize: '14px', color: tokens.colorPaletteRedForeground1 },
  attachBox: { backgroundColor: tokens.colorNeutralBackground2, borderRadius: tokens.borderRadiusLarge, padding: '12px', border: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', flexDirection: 'column', gap: '8px' },
  attachItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  commentItem: { backgroundColor: tokens.colorNeutralBackground2, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px' },
})

function parseAmount(raw: string): number {
  let s = raw.replace(/[€\s']/g, '').trim()
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else if (s.includes(',')) s = s.replace(',', '.')
  else if (/\.\d{3}$/.test(s) && (s.match(/\./g) ?? []).length === 1) s = s.replace('.', '')
  return parseFloat(s) || 0
}
function calcTax(baseAmount: string): string {
  const base = parseAmount(baseAmount)
  if (!base || base <= 0) return ''
  return String(Math.round(base * 0.07 * 100) / 100)
}
function calcNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0
  return Math.max(0, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000))
}
function toFormDate(iso: string | undefined): string { return iso ? iso.slice(0, 10) : '' }
function toIso(date: string): string { return date ? new Date(`${date}T12:00:00`).toISOString() : '' }

async function getNextSequence(year: number): Promise<number> {
  const res = await Cr9b5_pt_invoicesService.getAll({ filter: `cr9b5_year eq ${year}`, select: ['cr9b5_globalsequence'], orderBy: ['cr9b5_globalsequence desc'], top: 1 })
  const records = res.data ?? []
  return records.length === 0 ? 1 : (records[0].cr9b5_globalsequence ?? 0) + 1
}
function buildInternalId(shortId: string, seq: number, year: number): string { return `${shortId}${String(seq).padStart(3, '0')}/${year}` }

interface InvoiceFormState {
  type: number; propertyId: string; allProperties: boolean; categoryId: string; contactId: string
  date: string; description: string; baseAmount: string; taxRate: string; taxAmount: string; taxIsManual: boolean
  bookingRef: string; checkIn: string; checkOut: string; adults: string; children: string; babies: string
}

function emptyForm(): InvoiceFormState {
  return { type: TYPE_INCOMING, propertyId: '', allProperties: false, categoryId: '', contactId: '', date: new Date().toISOString().slice(0, 10), description: '', baseAmount: '', taxRate: '7', taxAmount: '', taxIsManual: false, bookingRef: '', checkIn: '', checkOut: '', adults: '', children: '', babies: '' }
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

interface NewContactState { name: string; email: string; taxid: string; role: number; defaultdesc: string }
const EMPTY_NEW_CONTACT: NewContactState = { name: '', email: '', taxid: '', role: ROLE_CLIENT, defaultdesc: '' }

interface AttachState { typeRefId: string; fileName: string; file: File | null; uploading: boolean; driveId: string; driveUrl: string }
const EMPTY_ATTACH: AttachState = { typeRefId: '', fileName: '', file: null, uploading: false, driveId: '', driveUrl: '' }

export default function InvoiceForm({ invoice, properties, contacts: contactsProp, onSaved, onClose, readOnly = false }: InvoiceFormProps) {
  const s = useStyles()
  const isEdit = invoice !== null

  const [form, setForm] = useState<InvoiceFormState>(() => invoice ? invoiceToFormState(invoice) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormState | '_form', string>>>({})
  const [contacts, setContacts] = useState<Cr9b5_pt_contacts[]>(contactsProp)

  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newContact, setNewContact] = useState<NewContactState>(EMPTY_NEW_CONTACT)
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [newContactError, setNewContactError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Cr9b5_pt_references[]>([])
  useEffect(() => {
    const refType = form.type === TYPE_OUTGOING ? REF_CAT_INCOME : REF_CAT_EXPENSE
    Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${refType}`, orderBy: ['cr9b5_sortorder asc'] }).then(res => setCategories(res.data ?? []))
  }, [form.type])

  const [templates, setTemplates] = useState<Svm_pt_invoicetemplates[]>([])
  const [templateId, setTemplateId] = useState('')
  useEffect(() => {
    if (isEdit || readOnly) return
    const templateType = form.type === TYPE_OUTGOING ? TEMPLATE_TYPE_INCOME : TEMPLATE_TYPE_EXPENSE
    Svm_pt_invoicetemplatesService.getAll({ filter: `svm_pt_type eq ${templateType}`, orderBy: ['svm_pt_name asc'] }).then(res => setTemplates(res.data ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, isEdit, readOnly])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find(t => t.svm_pt_invoicetemplateid === id)
    if (!t) return
    setForm(f => {
      const next = { ...f, categoryId: t._svm_category_value ?? f.categoryId, description: t.svm_pt_description ?? f.description }
      if (t.svm_pt_defaultamount != null) {
        next.baseAmount = String(t.svm_pt_defaultamount)
        if (!next.taxIsManual) next.taxAmount = calcTax(next.baseAmount)
      }
      return next
    })
  }

  const [comments, setComments] = useState<Svm_pt_invoicecomments[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)

  async function loadComments(invoiceId: string) {
    setCommentsLoading(true)
    const res = await Svm_pt_invoicecommentsService.getAll({ filter: `_svm_invoice_value eq '${invoiceId}'`, orderBy: ['createdon desc'] })
    setComments(res.data ?? [])
    setCommentsLoading(false)
  }
  async function addComment() {
    if (!activeInvoice || !newComment.trim()) return
    setCommentSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Svm_pt_invoicecommentsService.create({ svm_pt_comment: newComment.trim(), 'svm_Invoice@odata.bind': `/cr9b5_pt_invoices(${activeInvoice.cr9b5_pt_invoiceid})` } as any)
      if (!res.success) throw (res.error as Error) ?? new Error('Failed to add comment.')
      setNewComment('')
      await loadComments(activeInvoice.cr9b5_pt_invoiceid)
    } finally {
      setCommentSaving(false)
    }
  }

  const [attachments, setAttachments] = useState<Cr9b5_pt_attachments[]>([])
  const [attachRefTypes, setAttachRefTypes] = useState<Cr9b5_pt_references[]>([])
  const [attachForm, setAttachForm] = useState<AttachState>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [gdConnected, setGdConnected] = useState(isAuthorized())

  const [createdInvoice, setCreatedInvoice] = useState<Cr9b5_pt_invoices | null>(null)
  const activeInvoice = createdInvoice ?? invoice
  const showAttachments = isEdit || createdInvoice !== null

  useEffect(() => {
    if (!isEdit || !invoice) return
    loadAttachments(invoice.cr9b5_pt_invoiceid, form.type)
    loadComments(invoice.cr9b5_pt_invoiceid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  const isOutgoing = form.type === TYPE_OUTGOING
  const nights = calcNights(form.checkIn, form.checkOut)
  const days = nights + 1
  const baseNum = parseAmount(form.baseAmount)
  const taxNum = parseAmount(form.taxAmount)
  const totalGross = baseNum + taxNum

  function setField<K extends keyof InvoiceFormState>(key: K, val: InvoiceFormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
  }
  function handleBaseAmountChange(val: string) {
    setForm(f => f.taxIsManual ? { ...f, baseAmount: val } : { ...f, baseAmount: val, taxAmount: calcTax(val) })
    if (errors.baseAmount) setErrors(e => ({ ...e, baseAmount: undefined }))
  }
  function handleTaxAmountChange(val: string) { setForm(f => ({ ...f, taxAmount: val, taxIsManual: true, taxRate: 'n/a' })) }
  function resetTax() { setForm(f => ({ ...f, taxIsManual: false, taxRate: '7', taxAmount: calcTax(f.baseAmount) })) }
  function handleContactChange(contactId: string) {
    const contact = contacts.find(c => c.cr9b5_pt_contactid === contactId)
    setForm(f => ({ ...f, contactId, description: contact?.cr9b5_defaultdescription ?? f.description }))
    if (errors.contactId) setErrors(e => ({ ...e, contactId: undefined }))
  }

  function validate(): boolean {
    const e: typeof errors = {}
    if (!form.allProperties && !form.propertyId) e.propertyId = 'Property is required.'
    if (!form.contactId) e.contactId = 'Contact is required.'
    if (!form.date) e.date = 'Date is required.'
    if (!form.baseAmount || !parseAmount(form.baseAmount)) e.baseAmount = 'Base amount is required.'
    if (isOutgoing) {
      if (!form.checkIn) e.checkIn = 'Check-in is required for outgoing invoices.'
      if (!form.checkOut) e.checkOut = 'Check-out is required for outgoing invoices.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

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
        if (form.allProperties) internalId = buildInternalId('All', globalSequence, invoiceYear)
        else {
          if (!property) throw new Error('Property not found.')
          internalId = buildInternalId(property.cr9b5_shortid, globalSequence, invoiceYear)
        }
      }
      const payload: Record<string, unknown> = {
        cr9b5_internalid: internalId, cr9b5_globalsequence: globalSequence, cr9b5_year: invoiceYear, cr9b5_type: form.type,
        cr9b5_date: toIso(form.date), cr9b5_description: form.description.trim() || undefined, cr9b5_baseamount: baseNum,
        cr9b5_taxrate: form.taxIsManual ? 'n/a' : form.taxRate, cr9b5_taxamount: taxNum, cr9b5_taxismanual: form.taxIsManual,
        cr9b5_totalgross: totalGross, cr9b5_allproperties: form.allProperties,
        'cr9b5_Contact@odata.bind': `/cr9b5_pt_contacts(${form.contactId})`,
      }
      if (!form.allProperties && form.propertyId) payload['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${form.propertyId})`
      if (form.categoryId) payload['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${form.categoryId})`
      if (isOutgoing) {
        payload.cr9b5_bookingreference = form.bookingRef.trim() || undefined
        payload.cr9b5_checkin = toIso(form.checkIn)
        payload.cr9b5_checkout = toIso(form.checkOut)
        payload.cr9b5_nights = nights
        payload.cr9b5_days = days
        payload.cr9b5_adults = form.adults !== '' ? parseInt(form.adults) : undefined
        payload.cr9b5_children = form.children !== '' ? parseInt(form.children) : undefined
        payload.cr9b5_babies = form.babies !== '' ? parseInt(form.babies) : undefined
      }
      const changedFields: string[] = []
      if (isEdit && invoice) {
        const orig = invoiceToFormState(invoice)
        const fieldLabels: Array<[keyof InvoiceFormState, string]> = [
          ['type', 'Type'], ['propertyId', 'Property'], ['contactId', 'Contact'], ['date', 'Date'], ['description', 'Description'],
          ['baseAmount', 'Base Amount'], ['taxRate', 'Tax Rate'], ['taxAmount', 'Tax Amount'], ['bookingRef', 'Booking Ref'],
          ['checkIn', 'Check-in'], ['checkOut', 'Check-out'], ['adults', 'Adults'], ['children', 'Children'], ['babies', 'Babies'],
        ]
        for (const [key, label] of fieldLabels) if (String(orig[key]) !== String(form[key])) changedFields.push(label)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = isEdit && invoice
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await Cr9b5_pt_invoicesService.update(invoice.cr9b5_pt_invoiceid, payload as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : await Cr9b5_pt_invoicesService.create(payload as any)
      if (!result.success) throw new Error((result.error as Error)?.message ?? 'Save failed. Check all fields and try again.')
      if (isEdit) {
        logActivity('Updated', 'Invoice', internalId, changedFields.length ? `Fields changed: ${changedFields.join(', ')}` : undefined)
        const updated = { ...(invoice as Cr9b5_pt_invoices), ...(payload as Partial<Cr9b5_pt_invoices>) } as unknown as Record<string, unknown>
        updated['_cr9b5_contact_value'] = form.contactId
        updated['_cr9b5_property_value'] = form.allProperties ? undefined : form.propertyId
        updated['_cr9b5_categoryid_value'] = form.categoryId || undefined
        onSaved(updated as unknown as Cr9b5_pt_invoices)
      } else {
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

  async function saveNewContact() {
    if (!newContact.name.trim()) { setNewContactError('Name is required.'); return }
    setNewContactSaving(true)
    setNewContactError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await Cr9b5_pt_contactsService.create({
        cr9b5_name: newContact.name.trim(), cr9b5_role: newContact.role as any,
        cr9b5_email: newContact.email.trim() || undefined, cr9b5_taxid: newContact.taxid.trim() || undefined,
        cr9b5_defaultdescription: newContact.defaultdesc.trim() || undefined,
      } as any)
      if (!result.success || !result.data) throw (result.error as Error) ?? new Error('Failed to create contact.')
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

  async function loadAttachments(invoiceId: string, type: number) {
    setAttachLoading(true)
    const refType = type === TYPE_OUTGOING ? REF_OUTGOING : REF_INCOMING
    const [attachRes, refRes] = await Promise.all([
      Cr9b5_pt_attachmentsService.getAll({ filter: `_cr9b5_invoiceid_value eq '${invoiceId}'`, orderBy: ['cr9b5_uploadedon desc'] }),
      Cr9b5_pt_referencesService.getAll({ filter: `cr9b5_referencetype eq ${refType}`, orderBy: ['cr9b5_sortorder asc'] }),
    ])
    setAttachments(attachRes.data ?? [])
    setAttachRefTypes(refRes.data ?? [])
    setAttachLoading(false)
  }

  const [driveFolderId, setDriveFolderId] = useState<string | undefined>((invoice as unknown as { svm_pt_googledrivefolderid?: string } | null)?.svm_pt_googledrivefolderid)

  async function handleFileSelect(file: File) {
    if (!activeInvoice) return
    const prop = properties.find(p => p.cr9b5_pt_propertyid === form.propertyId)
    const internalId = activeInvoice.cr9b5_internalid
    setAttachForm(f => ({ ...f, file, fileName: file.name, uploading: true, driveId: '', driveUrl: '' }))
    setAttachError(null)
    try {
      let folderId = driveFolderId
      if (!folderId) {
        const path = prop ? invoiceFolderPath(prop.cr9b5_name, prop.cr9b5_shortid, internalId) : ['PropTrack', 'Invoices', internalId.replace(/\//g, '-')]
        folderId = await getOrCreateFolder(path)
        setDriveFolderId(folderId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Cr9b5_pt_invoicesService.update(activeInvoice.cr9b5_pt_invoiceid, { svm_pt_googledrivefolderid: folderId } as any).catch(() => {})
      }
      const { id, webViewLink } = await uploadFile(file, folderId)
      setAttachForm(f => ({ ...f, uploading: false, driveId: id, driveUrl: webViewLink }))
    } catch (e: unknown) {
      setAttachForm(f => ({ ...f, uploading: false, file: null }))
      setAttachError(e instanceof Error ? e.message : 'Upload failed.')
    }
  }

  async function addAttachment() {
    if (!activeInvoice || !attachForm.fileName.trim()) { setAttachError('Choose a file first.'); return }
    if (attachForm.uploading) return
    setAttachSaving(true)
    setAttachError(null)
    try {
      const refType = form.type === TYPE_OUTGOING ? REF_OUTGOING : REF_INCOMING
      const p: Record<string, unknown> = { cr9b5_filename: attachForm.fileName.trim(), cr9b5_referencetype: refType, cr9b5_uploadedon: new Date().toISOString(), 'cr9b5_InvoiceId@odata.bind': `/cr9b5_pt_invoices(${activeInvoice.cr9b5_pt_invoiceid})` }
      if (attachForm.typeRefId) p['cr9b5_AttachType@odata.bind'] = `/cr9b5_pt_references(${attachForm.typeRefId})`
      if (attachForm.driveId) p.cr9b5_googledriveid = attachForm.driveId
      if (attachForm.driveUrl) p.cr9b5_googledriveurl = attachForm.driveUrl
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_attachmentsService.create(p as any)
      if (!res.success) throw (res.error as Error) ?? new Error('Failed to add attachment.')
      logActivity('Created', 'Attachment', attachForm.fileName.trim(), `Uploaded to: ${activeInvoice.cr9b5_internalid}`)
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
    if (a.cr9b5_googledriveid) { try { await deleteFile(a.cr9b5_googledriveid) } catch { /* ignore */ } }
    await Cr9b5_pt_attachmentsService.delete(a.cr9b5_pt_attachmentid)
    logActivity('Deleted', 'Attachment', a.cr9b5_filename)
    await loadAttachments(activeInvoice.cr9b5_pt_invoiceid, form.type)
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '640px' }}>
        <DialogBody>
          <DialogTitle>{readOnly ? `Invoice — ${invoice!.cr9b5_internalid}` : isEdit ? `Edit Invoice — ${invoice!.cr9b5_internalid}` : 'New Invoice'}</DialogTitle>
          <DialogContent style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <div className={s.section}>
              <Text weight="medium" size={300}>Type *</Text>
              <div className={s.segment}>
                {[{ val: TYPE_INCOMING, label: 'Expense' }, { val: TYPE_OUTGOING, label: 'Income' }].map(opt => (
                  <button
                    key={opt.val}
                    className={`${s.segmentBtn} ${form.type === opt.val ? s.segmentBtnActive : ''}`}
                    disabled={isEdit || readOnly}
                    style={{ opacity: isEdit ? 0.6 : 1, cursor: (isEdit || readOnly) ? 'default' : 'pointer' }}
                    onClick={() => { if (isEdit || readOnly) return; setForm(f => ({ ...f, type: opt.val, categoryId: '' })) }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {!isEdit && !readOnly && templates.length > 0 && (
              <Field label="Use Template" hint="Pre-fills category, description and default amount below.">
                <Select value={templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">No template — fill in manually</option>
                  {templates.map(t => <option key={t.svm_pt_invoicetemplateid} value={t.svm_pt_invoicetemplateid}>{t.svm_pt_name}</option>)}
                </Select>
              </Field>
            )}

            <Field label="Category">
              <Select value={form.categoryId} disabled={readOnly} onChange={e => setField('categoryId', e.target.value)}>
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.cr9b5_pt_referenceid} value={c.cr9b5_pt_referenceid}>{c.cr9b5_value}</option>)}
              </Select>
            </Field>

            <div className={s.grid2}>
              <Field label="Property" required validationMessage={errors.propertyId}>
                <Select value={form.allProperties ? '' : form.propertyId} disabled={readOnly || form.allProperties} onChange={e => setField('propertyId', e.target.value)}>
                  {form.allProperties ? <option value="">All Properties</option> : (
                    <>
                      <option value="">Select property…</option>
                      {properties.map(p => <option key={p.cr9b5_pt_propertyid} value={p.cr9b5_pt_propertyid}>{p.cr9b5_name}</option>)}
                    </>
                  )}
                </Select>
                {!readOnly && (
                  <Checkbox style={{ marginTop: 6 }} label="All Properties" checked={form.allProperties}
                    onChange={(_, d) => setForm(f => ({ ...f, allProperties: !!d.checked, propertyId: '' }))} />
                )}
              </Field>
              <Field label="Date" required validationMessage={errors.date}>
                <Input type="date" value={form.date} disabled={readOnly} onChange={(_, d) => setField('date', d.value)} />
              </Field>
            </div>

            <Field label="Contact" required validationMessage={errors.contactId}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Select style={{ flex: 1 }} value={form.contactId} disabled={readOnly} onChange={e => handleContactChange(e.target.value)}>
                  <option value="">Select contact…</option>
                  {contacts.map(c => <option key={c.cr9b5_pt_contactid} value={c.cr9b5_pt_contactid}>{c.cr9b5_name}</option>)}
                </Select>
                {!readOnly && <Button appearance="outline" onClick={() => { setNewContactOpen(o => !o); setNewContactError(null) }} title="Create new contact">+</Button>}
              </div>
            </Field>

            {newContactOpen && !readOnly && (
              <div className={s.panel}>
                <Text weight="semibold" size={200} style={{ textTransform: 'uppercase', color: tokens.colorBrandForeground1 }}>New Contact</Text>
                <div className={s.grid2}>
                  <Field label="Name" required>
                    <Input value={newContact.name} onChange={(_, d) => setNewContact(c => ({ ...c, name: d.value }))} placeholder="Full name or company" />
                  </Field>
                  <Field label="Role">
                    <Select value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: Number(e.target.value) }))}>
                      <option value={ROLE_CLIENT}>Client</option>
                      <option value={ROLE_SUPPLIER}>Supplier</option>
                    </Select>
                  </Field>
                </div>
                <div className={s.grid2}>
                  <Field label="Email"><Input type="email" value={newContact.email} onChange={(_, d) => setNewContact(c => ({ ...c, email: d.value }))} placeholder="Optional" /></Field>
                  <Field label="Tax ID"><Input value={newContact.taxid} onChange={(_, d) => setNewContact(c => ({ ...c, taxid: d.value }))} placeholder="Optional" /></Field>
                </div>
                <Field label="Default Description">
                  <Input value={newContact.defaultdesc} onChange={(_, d) => setNewContact(c => ({ ...c, defaultdesc: d.value }))} placeholder="Pre-fills invoice description (optional)" />
                </Field>
                {newContactError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{newContactError}</Text>}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button appearance="secondary" size="small" onClick={() => { setNewContactOpen(false); setNewContact(EMPTY_NEW_CONTACT) }}>Cancel</Button>
                  <Button appearance="primary" size="small" disabled={newContactSaving} onClick={saveNewContact}>{newContactSaving ? 'Saving…' : 'Create Contact'}</Button>
                </div>
              </div>
            )}

            <Field label="Description">
              <Textarea value={form.description} disabled={readOnly} onChange={(_, d) => setField('description', d.value)} rows={2} placeholder="Pre-filled from contact's default description" />
            </Field>

            {isOutgoing && (
              <div className={s.panel}>
                <Text weight="semibold" size={200} style={{ textTransform: 'uppercase', color: tokens.colorBrandForeground1 }}>Stay Details</Text>
                <Field label="Booking Reference">
                  <Input value={form.bookingRef} disabled={readOnly} onChange={(_, d) => setField('bookingRef', d.value)} placeholder="e.g. Airbnb HMXYZ123" />
                </Field>
                <div className={s.grid2}>
                  <Field label="Check-in" required validationMessage={errors.checkIn}>
                    <Input type="date" value={form.checkIn} disabled={readOnly} onChange={(_, d) => setField('checkIn', d.value)} />
                  </Field>
                  <Field label="Check-out" required validationMessage={errors.checkOut}>
                    <Input type="date" value={form.checkOut} disabled={readOnly} onChange={(_, d) => setField('checkOut', d.value)} />
                  </Field>
                </div>
                <div className={s.grid2}>
                  <Field label="Nights"><Input readOnly value={form.checkIn && form.checkOut ? String(nights) : ''} placeholder="auto" /></Field>
                  <Field label="Days"><Input readOnly value={form.checkIn && form.checkOut ? String(days) : ''} placeholder="auto" /></Field>
                </div>
                <div className={s.grid3}>
                  {(['adults', 'children', 'babies'] as const).map(key => (
                    <Field key={key} label={key[0].toUpperCase() + key.slice(1)}>
                      <Input type="number" min={0} value={form[key]} disabled={readOnly} onChange={(_, d) => setField(key, d.value)} placeholder="0" />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            <div className={s.section}>
              <Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Amounts (EUR)</Text>
              <div className={s.grid2}>
                <Field label="Base Amount" required validationMessage={errors.baseAmount}>
                  <Input type="number" min={0} step={0.01} value={form.baseAmount} disabled={readOnly} onChange={(_, d) => handleBaseAmountChange(d.value)} placeholder="0.00" />
                </Field>
                <Field label={
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tax Amount
                    {form.taxIsManual && <Text size={100} weight="semibold" style={{ backgroundColor: tokens.colorPaletteMarigoldBackground2, color: tokens.colorPaletteMarigoldForeground1, padding: '1px 6px', borderRadius: 4 }}>manual</Text>}
                    {!readOnly && <Button appearance="transparent" size="small" onClick={resetTax} title="Reset to 7%" style={{ marginLeft: 'auto' }}>↺</Button>}
                  </span>
                }>
                  <Input type="number" min={0} step={0.01} value={form.taxAmount} disabled={readOnly} onChange={(_, d) => handleTaxAmountChange(d.value)} placeholder="0.00" />
                  <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Rate: {form.taxIsManual ? 'n/a (manual)' : `${form.taxRate}%`}</Text>
                </Field>
              </div>
              <div className={s.totalRow}>
                <Text weight="medium">Total Gross</Text>
                <Text size={500} weight="semibold">{baseNum > 0 || taxNum > 0 ? formatMoney(totalGross) : '—'}</Text>
              </div>
            </div>

            {showAttachments && activeInvoice && (
              <div className={s.section} style={{ borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '16px' }}>
                {createdInvoice && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: tokens.colorPaletteGreenForeground1, backgroundColor: tokens.colorPaletteGreenBackground1, border: `1px solid ${tokens.colorPaletteGreenBorder1}`, borderRadius: tokens.borderRadiusMedium, padding: '8px 12px', fontSize: '14px' }}>
                    ✓ Invoice <strong>{createdInvoice.cr9b5_internalid}</strong> created. Add attachments below or click Done.
                  </div>
                )}
                <Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Attachments</Text>
                {!readOnly && (
                  <div className={s.attachBox}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                    {!gdConnected ? (
                      <Button appearance="outline" onClick={async () => { try { await authorizeWithPopup(); setGdConnected(true) } catch (e) { setAttachError(e instanceof Error ? e.message : 'Google Drive sign-in failed.') } }}>
                        🔗 Connect Google Drive to attach files
                      </Button>
                    ) : (
                      <div className={s.grid2}>
                        <Select value={attachForm.typeRefId} onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}>
                          <option value="">Type (optional)…</option>
                          {attachRefTypes.map(r => <option key={r.cr9b5_pt_referenceid} value={r.cr9b5_pt_referenceid}>{r.cr9b5_value}</option>)}
                        </Select>
                        <Button appearance="outline" onClick={() => fileInputRef.current?.click()}>
                          {attachForm.uploading ? '⏳ Uploading…' : attachForm.driveId ? `✓ ${attachForm.fileName}` : '📎 Choose file…'}
                        </Button>
                      </div>
                    )}
                    {attachError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{attachError}</Text>}
                    {gdConnected && (
                      <Button appearance="primary" disabled={attachSaving || attachForm.uploading || !attachForm.driveId} onClick={addAttachment}>
                        {attachSaving ? 'Adding…' : '+ Add Attachment'}
                      </Button>
                    )}
                  </div>
                )}
                {attachLoading ? <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Loading attachments…</Text> : attachments.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No attachments yet.</Text>
                ) : (
                  <div style={{ border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden' }}>
                    {attachments.map(a => (
                      <div key={a.cr9b5_pt_attachmentid} className={s.attachItem}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {a.cr9b5_googledriveurl ? <a href={a.cr9b5_googledriveurl} target="_blank" rel="noreferrer" style={{ color: tokens.colorBrandForegroundLink, fontSize: '14px' }}>{a.cr9b5_filename}</a> : <Text>{a.cr9b5_filename}</Text>}
                          {a.cr9b5_attachtypename && <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block' }}>{a.cr9b5_attachtypename}</Text>}
                        </div>
                        {!readOnly && <Button appearance="transparent" size="small" onClick={() => deleteAttachment(a)}>✕</Button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isEdit && invoice && (
              <div className={s.section} style={{ borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '16px' }}>
                <Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Comments</Text>
                {commentsLoading ? <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Loading comments…</Text> : comments.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No comments yet.</Text>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {comments.map(c => (
                      <div key={c.svm_pt_invoicecommentid} className={s.commentItem}>
                        <Text style={{ whiteSpace: 'pre-wrap' }}>{c.svm_pt_comment}</Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block', marginTop: 4 }}>
                          {c.createdbyname ?? 'Unknown'} · {c.createdon ? new Date(c.createdon).toLocaleString('de-DE') : ''}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Textarea style={{ flex: 1 }} value={newComment} onChange={(_, d) => setNewComment(d.value)} rows={2} placeholder="Add a comment…" />
                    <Button appearance="primary" disabled={commentSaving || !newComment.trim()} onClick={addComment}>{commentSaving ? 'Adding…' : 'Add'}</Button>
                  </div>
                )}
              </div>
            )}

            {errors._form && <div className={s.errorBanner}>{errors._form}</div>}
          </DialogContent>
          <DialogActions>
            {readOnly || createdInvoice ? (
              <Button appearance="primary" onClick={() => createdInvoice ? onSaved(createdInvoice) : onClose()}>Done</Button>
            ) : (
              <>
                <Button appearance="secondary" onClick={onClose}>Cancel</Button>
                <Button appearance="primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Invoice'}</Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
