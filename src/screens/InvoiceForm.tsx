import { useMemo, useRef, useState } from 'react'
import {
  makeStyles, tokens, Button, Input, Textarea, Field, Select, Checkbox, Text,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from '@fluentui/react-components'
import {
  useCategories, useReferenceData, useInvoiceTemplates, useAttachments, useInvoiceComments,
  useSaveContact, useCreateInvoice, useUpdateInvoice, useNextInvoiceSequence,
  useDeleteAttachment, useAddInvoiceComment,
  useInvoices, useOwnerOccupancies,
} from '@/hooks/data'
import type { Invoice, NewInvoice, Property, Contact, Attachment } from '@/domain/types'
import { InvoiceType, ContactRole, CategoryType } from '@/domain/types'
import { isPostgresBackend } from '@/data/backend'
import { uploadDocument, deleteDocument, documentDownloadUrl } from '@/services/documents'
import { logActivity } from '@/services/activitylog'
import { formatMoney } from '@/domain/money'
import { nightsOverlap } from '@/domain/dateRanges'

const REF_INCOMING = 233100003
const REF_OUTGOING = 233100004
const ROLE_CLIENT = ContactRole.Client
const ROLE_SUPPLIER = ContactRole.Supplier
// The svm_pt_invoicetemplates.svm_pt_type option set uses its own numbering (925060000/1),
// unrelated to CategoryType's 233100005/6 despite InvoiceTemplate['type'] being typed as
// CategoryType in the domain model — compare against these raw values, cast as needed.
const TEMPLATE_TYPE_INCOME  = 925060000
const TEMPLATE_TYPE_EXPENSE = 925060001

export interface InvoiceFormProps {
  invoice: Invoice | null
  properties: Property[]
  contacts: Contact[]
  onSaved: (record?: Invoice) => void
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

function buildInternalId(shortId: string, seq: number, year: number): string { return `${shortId}${String(seq).padStart(3, '0')}/${year}` }

interface InvoiceFormState {
  type: number; propertyId: string; allProperties: boolean; categoryId: string; contactId: string
  date: string; description: string; baseAmount: string; taxRate: string; taxAmount: string; taxIsManual: boolean
  bookingRef: string; checkIn: string; checkOut: string; adults: string; children: string; babies: string
  skipInternalId: boolean
}

function emptyForm(): InvoiceFormState {
  return { type: InvoiceType.Expense, propertyId: '', allProperties: false, categoryId: '', contactId: '', date: new Date().toISOString().slice(0, 10), description: '', baseAmount: '', taxRate: '7', taxAmount: '', taxIsManual: false, bookingRef: '', checkIn: '', checkOut: '', adults: '', children: '', babies: '', skipInternalId: false }
}
function invoiceToFormState(inv: Invoice): InvoiceFormState {
  return {
    type: inv.type ?? InvoiceType.Expense,
    propertyId: inv.propertyId ?? '',
    allProperties: inv.allProperties ?? false,
    categoryId: inv.categoryId ?? '',
    contactId: inv.contactId ?? '',
    date: toFormDate(inv.date),
    description: inv.description ?? '',
    baseAmount: inv.baseAmount?.toString() ?? '',
    taxRate: inv.taxRate ?? '7',
    taxAmount: inv.taxAmount?.toString() ?? '',
    taxIsManual: inv.taxIsManual ?? false,
    bookingRef: inv.bookingReference ?? '',
    checkIn: toFormDate(inv.checkIn),
    checkOut: toFormDate(inv.checkOut),
    adults: inv.adults?.toString() ?? '',
    children: inv.children?.toString() ?? '',
    babies: inv.babies?.toString() ?? '',
    skipInternalId: !inv.internalId,
  }
}

interface NewContactState { name: string; email: string; taxid: string; role: number; defaultdesc: string }
const EMPTY_NEW_CONTACT: NewContactState = { name: '', email: '', taxid: '', role: ROLE_CLIENT, defaultdesc: '' }

// NAS-native document storage (final migration addendum) — replaces Google Drive as the
// upload target for NEW invoice attachments. Existing Drive-linked rows remain viewable.
interface AttachState { typeRefId: string; file: File | null }
const EMPTY_ATTACH: AttachState = { typeRefId: '', file: null }

export default function InvoiceForm({ invoice, properties, contacts: contactsProp, onSaved, onClose, readOnly = false }: InvoiceFormProps) {
  const s = useStyles()
  const isEdit = invoice !== null

  const [form, setForm] = useState<InvoiceFormState>(() => invoice ? invoiceToFormState(invoice) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceFormState | '_form', string>>>({})
  const [contacts, setContacts] = useState<Contact[]>(contactsProp)

  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newContact, setNewContact] = useState<NewContactState>(EMPTY_NEW_CONTACT)
  const [newContactSaving, setNewContactSaving] = useState(false)
  const [newContactError, setNewContactError] = useState<string | null>(null)

  const isOutgoing = form.type === InvoiceType.Income

  const { data: allCategories = [] } = useCategories()
  const categories = useMemo(
    () => allCategories.filter(c => c.type === (isOutgoing ? CategoryType.Income : CategoryType.Expense)),
    [allCategories, isOutgoing],
  )

  const { data: allTemplates = [] } = useInvoiceTemplates()
  const [templateId, setTemplateId] = useState('')
  const templates = useMemo(() => {
    if (isEdit || readOnly) return []
    const templateType = isOutgoing ? TEMPLATE_TYPE_INCOME : TEMPLATE_TYPE_EXPENSE
    return allTemplates.filter(t => (t.type as unknown as number) === templateType)
  }, [allTemplates, isOutgoing, isEdit, readOnly])

  function applyTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find(t => t.id === id)
    if (!t) return
    setForm(f => {
      const next = { ...f, categoryId: t.categoryId ?? f.categoryId, description: t.description ?? f.description }
      if (t.defaultAmount != null) {
        next.baseAmount = String(t.defaultAmount)
        if (!next.taxIsManual) next.taxAmount = calcTax(next.baseAmount)
      }
      return next
    })
  }

  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null)
  const activeInvoice = createdInvoice ?? invoice
  const showAttachments = isEdit || createdInvoice !== null

  const { data: comments = [], isLoading: commentsLoading } = useInvoiceComments(activeInvoice?.id ?? null)
  const [newComment, setNewComment] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const addInvoiceComment = useAddInvoiceComment()

  async function addComment() {
    if (!activeInvoice || !newComment.trim()) return
    setCommentSaving(true)
    try {
      await addInvoiceComment.mutateAsync({ invoiceId: activeInvoice.id, comment: newComment.trim() })
      setNewComment('')
    } finally {
      setCommentSaving(false)
    }
  }

  const { data: allReferenceData = [] } = useReferenceData()
  const attachRefTypes = useMemo(() => {
    const refType = isOutgoing ? REF_OUTGOING : REF_INCOMING
    return allReferenceData.filter(r => r.referenceType === refType)
  }, [allReferenceData, isOutgoing])

  const { data: allAttachments = [] } = useAttachments()
  const attachments = useMemo(
    () => activeInvoice ? allAttachments.filter(a => a.invoiceId === activeInvoice.id) : [],
    [allAttachments, activeInvoice],
  )
  const [attachForm, setAttachForm] = useState<AttachState>(EMPTY_ATTACH)
  const [attachSaving, setAttachSaving] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const saveContact = useSaveContact()
  const createInvoice = useCreateInvoice()
  const updateInvoice = useUpdateInvoice()
  const nextInvoiceSequence = useNextInvoiceSequence()
  const deleteAttachmentMutation = useDeleteAttachment()

  const nights = calcNights(form.checkIn, form.checkOut)
  const days = nights + 1
  const baseNum = parseAmount(form.baseAmount)
  const taxNum = parseAmount(form.taxAmount)
  const totalGross = baseNum + taxNum

  // Non-blocking conflict check: does this stay overlap another guest
  // booking or an owner-occupancy block on the same property?
  const { data: allInvoices = [] } = useInvoices()
  const { data: allOwnerOccupancy = [] } = useOwnerOccupancies()
  const conflictWarnings = useMemo<string[]>(() => {
    if (readOnly || !isOutgoing || form.allProperties || !form.propertyId || !form.checkIn || !form.checkOut) return []
    const found: string[] = []
    for (const other of allInvoices) {
      if (invoice && other.id === invoice.id) continue
      if (other.propertyId !== form.propertyId) continue
      if (other.type !== InvoiceType.Income) continue
      if (other.cancelled) continue
      if (!other.checkIn || !other.checkOut) continue
      if (nightsOverlap(form.checkIn, form.checkOut, other.checkIn, other.checkOut)) {
        found.push(`Overlaps guest booking ${other.internalId || '(no internal ID)'}`)
      }
    }
    for (const occ of allOwnerOccupancy) {
      if (occ.propertyId !== form.propertyId) continue
      if (!occ.fromDate || !occ.toDate) continue
      if (nightsOverlap(form.checkIn, form.checkOut, occ.fromDate, occ.toDate)) {
        found.push(`Overlaps owner occupancy block (${occ.fromDate.slice(0, 10)} – ${occ.toDate.slice(0, 10)})`)
      }
    }
    return found
  }, [readOnly, isOutgoing, form.allProperties, form.propertyId, form.checkIn, form.checkOut, invoice, allInvoices, allOwnerOccupancy])

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
    const contact = contacts.find(c => c.id === contactId)
    setForm(f => ({ ...f, contactId, description: contact?.defaultDescription ?? f.description }))
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
      const property = properties.find(p => p.id === form.propertyId)
      let internalId = invoice?.internalId ?? ''
      let globalSequence = invoice?.globalSequence ?? 0
      if (!isEdit && !form.skipInternalId) {
        globalSequence = await nextInvoiceSequence.mutateAsync(invoiceYear)
        if (form.allProperties) internalId = buildInternalId('All', globalSequence, invoiceYear)
        else {
          if (!property) throw new Error('Property not found.')
          internalId = buildInternalId(property.shortId, globalSequence, invoiceYear)
        }
      }
      const payload: NewInvoice = {
        internalId, globalSequence, year: invoiceYear, type: form.type as Invoice['type'],
        date: toIso(form.date), description: form.description.trim() || undefined, baseAmount: baseNum,
        taxRate: form.taxIsManual ? 'n/a' : form.taxRate, taxAmount: taxNum, taxIsManual: form.taxIsManual,
        totalGross, allProperties: form.allProperties,
        contactId: form.contactId,
        propertyId: !form.allProperties && form.propertyId ? form.propertyId : undefined,
        categoryId: form.categoryId || undefined,
      }
      if (isOutgoing) {
        payload.bookingReference = form.bookingRef.trim() || undefined
        payload.checkIn = toIso(form.checkIn)
        payload.checkOut = toIso(form.checkOut)
        payload.nights = nights
        payload.days = days
        payload.adults = form.adults !== '' ? parseInt(form.adults) : undefined
        payload.children = form.children !== '' ? parseInt(form.children) : undefined
        payload.babies = form.babies !== '' ? parseInt(form.babies) : undefined
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
      if (isEdit && invoice) {
        const updated = await updateInvoice.mutateAsync({ id: invoice.id, patch: payload })
        logActivity('Updated', 'Invoice', internalId, changedFields.length ? `Fields changed: ${changedFields.join(', ')}` : undefined)
        onSaved(updated)
      } else {
        const created = await createInvoice.mutateAsync(payload)
        logActivity('Created', 'Invoice', internalId || '(no internal ID)')
        setCreatedInvoice(created)
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
      const created = await saveContact.mutateAsync({
        name: newContact.name.trim(), role: newContact.role as Contact['role'],
        email: newContact.email.trim() || undefined, taxId: newContact.taxid.trim() || undefined,
        defaultDescription: newContact.defaultdesc.trim() || undefined,
      })
      setContacts(cs => [...cs, created].sort((a, b) => a.name.localeCompare(b.name)))
      handleContactChange(created.id)
      setNewContact(EMPTY_NEW_CONTACT)
      setNewContactOpen(false)
    } catch (e: unknown) {
      setNewContactError(e instanceof Error ? e.message : 'Failed to create contact.')
    } finally {
      setNewContactSaving(false)
    }
  }

  function handleFileSelect(file: File) {
    setAttachForm(f => ({ ...f, file }))
    setAttachError(null)
  }

  async function addAttachment() {
    if (!activeInvoice || !attachForm.file) { setAttachError('Choose a file first.'); return }
    setAttachSaving(true)
    setAttachError(null)
    try {
      const prop = properties.find(p => p.id === form.propertyId)
      const internalId = (activeInvoice.internalId || activeInvoice.id).replace(/\//g, '-')
      const path = prop ? `Properties/${prop.name}/Invoices/${internalId}` : `General/Invoices/${internalId}`
      const row = await uploadDocument(attachForm.file, {
        path,
        invoiceId: activeInvoice.id,
        attachTypeId: attachForm.typeRefId || undefined,
      })
      logActivity('Created', 'Attachment', row.original_filename ?? row.file_name, `Uploaded to: ${activeInvoice.internalId}`)
      setAttachForm(EMPTY_ATTACH)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: unknown) {
      setAttachError(e instanceof Error ? e.message : 'Failed to upload document.')
    } finally {
      setAttachSaving(false)
    }
  }

  async function deleteAttachment(a: Attachment) {
    if (!activeInvoice || !confirm('Delete this attachment?')) return
    if (a.storagePath) {
      try {
        const result = await deleteDocument(a.id)
        if (result.warning) console.warn('[documents] delete warning:', result.warning)
      } catch (e: unknown) {
        setAttachError(e instanceof Error ? e.message : 'Failed to delete document.')
        return
      }
    } else {
      // Pre-dates NAS document storage. Google Drive integration has been removed entirely.
      await deleteAttachmentMutation.mutateAsync(a.id)
    }
    logActivity('Deleted', 'Attachment', a.fileName)
  }

  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface style={{ maxWidth: '640px' }}>
        <DialogBody>
          <DialogTitle>{readOnly ? `Invoice — ${invoice!.internalId}` : isEdit ? `Edit Invoice — ${invoice!.internalId}` : 'New Invoice'}</DialogTitle>
          <DialogContent style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>

            <div className={s.section}>
              <Text weight="medium" size={300}>Type *</Text>
              <div className={s.segment}>
                {[{ val: InvoiceType.Expense, label: 'Expense' }, { val: InvoiceType.Income, label: 'Income' }].map(opt => (
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

            {!isEdit && !readOnly && (
              <Checkbox
                label="No Internal ID (skip auto-generated sequence number)"
                checked={form.skipInternalId}
                onChange={(_, d) => setForm(f => ({ ...f, skipInternalId: !!d.checked }))}
              />
            )}

            {!isEdit && !readOnly && templates.length > 0 && (
              <Field label="Use Template" hint="Pre-fills category, description and default amount below.">
                <Select value={templateId} onChange={e => applyTemplate(e.target.value)}>
                  <option value="">No template — fill in manually</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            )}

            <Field label="Category">
              <Select value={form.categoryId} disabled={readOnly} onChange={e => setField('categoryId', e.target.value)}>
                <option value="">Select category…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.value}</option>)}
              </Select>
            </Field>

            <div className={s.grid2}>
              <Field label="Property" required validationMessage={errors.propertyId}>
                <Select value={form.allProperties ? '' : form.propertyId} disabled={readOnly || form.allProperties} onChange={e => setField('propertyId', e.target.value)}>
                  {form.allProperties ? <option value="">All Properties</option> : (
                    <>
                      <option value="">Select property…</option>
                      {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                {conflictWarnings.length > 0 && (
                  <div style={{ backgroundColor: tokens.colorPaletteMarigoldBackground1, border: `1px solid ${tokens.colorPaletteMarigoldBorder1}`, borderRadius: tokens.borderRadiusMedium, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Text weight="semibold" size={200} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>⚠ Possible conflicts (not blocking):</Text>
                    {conflictWarnings.map((w, i) => <Text key={i} size={200} style={{ color: tokens.colorPaletteMarigoldForeground1 }}>{w}</Text>)}
                  </div>
                )}
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
                    ✓ Invoice {createdInvoice.internalId ? <>&nbsp;<strong>{createdInvoice.internalId}</strong>&nbsp;</> : ' (no internal ID) '}created. Add attachments below or click Done.
                  </div>
                )}
                <Text size={200} weight="semibold" style={{ textTransform: 'uppercase', color: tokens.colorNeutralForeground3 }}>Attachments</Text>
                {!readOnly && !isPostgresBackend && (
                  <Text style={{ color: tokens.colorPaletteRedForeground1 }}>
                    Document upload is disabled in the legacy Power Platform version. Please use the NAS-hosted version.
                  </Text>
                )}
                {!readOnly && isPostgresBackend && (
                  <div className={s.attachBox}>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                    <div className={s.grid2}>
                      <Select value={attachForm.typeRefId} onChange={e => setAttachForm(f => ({ ...f, typeRefId: e.target.value }))}>
                        <option value="">Type (optional)…</option>
                        {attachRefTypes.map(r => <option key={r.id} value={r.id}>{r.value}</option>)}
                      </Select>
                      <Button appearance="outline" onClick={() => fileInputRef.current?.click()}>
                        {attachForm.file ? `✓ ${attachForm.file.name}` : '📎 Choose file…'}
                      </Button>
                    </div>
                    {attachError && <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{attachError}</Text>}
                    <Button appearance="primary" disabled={attachSaving || !attachForm.file} onClick={addAttachment}>
                      {attachSaving ? 'Uploading…' : '+ Upload to NAS'}
                    </Button>
                  </div>
                )}
                {attachments.length === 0 ? (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No attachments yet.</Text>
                ) : (
                  <div style={{ border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden' }}>
                    {attachments.map(a => {
                      const attachTypeName = a.attachTypeId ? allReferenceData.find(r => r.id === a.attachTypeId)?.value : undefined
                      return (
                        <div key={a.id} className={s.attachItem}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {a.storagePath ? (
                              <a href={documentDownloadUrl(a.id)} target="_blank" rel="noreferrer" style={{ color: tokens.colorBrandForegroundLink, fontSize: '14px' }}>{a.fileName}</a>
                            ) : <Text>{a.fileName}</Text>}
                            {attachTypeName && <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block' }}>{attachTypeName}</Text>}
                          </div>
                          {!readOnly && <Button appearance="transparent" size="small" onClick={() => deleteAttachment(a)}>✕</Button>}
                        </div>
                      )
                    })}
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
                      <div key={c.id} className={s.commentItem}>
                        <Text style={{ whiteSpace: 'pre-wrap' }}>{c.comment}</Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground4, display: 'block', marginTop: 4 }}>
                          {c.createdByName ?? 'Unknown'} · {c.createdOn ? new Date(c.createdOn).toLocaleString('de-DE') : ''}
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
