/**
 * record ⇄ domain mappers. The only file allowed to know Dataverse attribute names
 * (`cr9b5_*`/`svm_*`) outside the generated services themselves — see docs/schema.md for the
 * full field reference and the cross-table numbering quirks this file has to route around.
 */
import type { Cr9b5_pt_properties } from '@/generated/models/Cr9b5_pt_propertiesModel'
import type { Cr9b5_pt_contacts } from '@/generated/models/Cr9b5_pt_contactsModel'
import type { Cr9b5_pt_references } from '@/generated/models/Cr9b5_pt_referencesModel'
import type { Cr9b5_pt_invoices } from '@/generated/models/Cr9b5_pt_invoicesModel'
import type { Svm_pt_suppliercontracts } from '@/generated/models/Svm_pt_suppliercontractsModel'
import type { Svm_pt_invoicetemplates } from '@/generated/models/Svm_pt_invoicetemplatesModel'
import type { Svm_pt_invoicecomments } from '@/generated/models/Svm_pt_invoicecommentsModel'
import type { Cr9b5_pt_attachments } from '@/generated/models/Cr9b5_pt_attachmentsModel'
import type { Cr9b5_pt_forecastflows } from '@/generated/models/Cr9b5_pt_forecastflowsModel'
import type { Cr9b5_forecastproperties } from '@/generated/models/Cr9b5_forecastpropertiesModel'
import type { Cr9b5_pt_activitylogs } from '@/generated/models/Cr9b5_pt_activitylogsModel'
import type {
  Property, Contact, Category, Invoice, NewInvoice, SupplierContract,
  InvoiceTemplate, InvoiceComment, Attachment, ForecastFlow, ForecastFlowProperty, ActivityLogEntry,
} from '@/domain/types'

// Generated models don't type the raw `_field_value` lookup ids — read them off the record
// as an untyped bag rather than casting the whole record, so real typed fields stay checked.
function lookupValue(record: unknown, field: string): string | undefined {
  return (record as Record<string, unknown>)[field] as string | undefined
}

// ---------- Property ----------

export function propertyFromRecord(r: Cr9b5_pt_properties): Property {
  return {
    id: r.cr9b5_pt_propertyid,
    name: r.cr9b5_name,
    shortId: r.cr9b5_shortid,
    address: r.cr9b5_address,
    notes: r.cr9b5_notes ?? undefined,
    googleDriveFolderId: r.svm_pt_googledrivefolderid ?? undefined,
  }
}

export function propertyToRecord(p: Partial<Property>): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  if (p.name !== undefined) rec.cr9b5_name = p.name
  if (p.shortId !== undefined) rec.cr9b5_shortid = p.shortId
  if (p.address !== undefined) rec.cr9b5_address = p.address
  if (p.notes !== undefined) rec.cr9b5_notes = p.notes || undefined
  if (p.googleDriveFolderId !== undefined) rec.svm_pt_googledrivefolderid = p.googleDriveFolderId
  return rec
}

// ---------- Contact ----------

export function contactFromRecord(r: Cr9b5_pt_contacts): Contact {
  return {
    id: r.cr9b5_pt_contactid,
    name: r.cr9b5_name,
    role: (r.cr9b5_role as unknown as number) as Contact['role'],
    email: r.cr9b5_email ?? undefined,
    taxId: r.cr9b5_taxid ?? undefined,
    defaultDescription: r.cr9b5_defaultdescription ?? undefined,
    defaultCategoryId: lookupValue(r, '_svm_defaultcategory_value'),
    regularSupplier: r.cr9b5_regularsupplier ?? false,
  }
}

export function contactToRecord(c: Partial<Contact>): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  if (c.name !== undefined) rec.cr9b5_name = c.name
  if (c.role !== undefined) rec.cr9b5_role = c.role
  if (c.email !== undefined) rec.cr9b5_email = c.email || undefined
  if (c.taxId !== undefined) rec.cr9b5_taxid = c.taxId || undefined
  if (c.defaultDescription !== undefined) rec.cr9b5_defaultdescription = c.defaultDescription || undefined
  if (c.regularSupplier !== undefined) rec.cr9b5_regularsupplier = c.regularSupplier
  if (c.defaultCategoryId !== undefined) {
    rec['svm_DefaultCategory@odata.bind'] = c.defaultCategoryId ? `/cr9b5_pt_references(${c.defaultCategoryId})` : null
  }
  return rec
}

// ---------- Category (References table, filtered to Income/Expense Category rows) ----------

export function categoryFromRecord(r: Cr9b5_pt_references): Category {
  return {
    id: r.cr9b5_pt_referenceid,
    value: r.cr9b5_value,
    type: (r.cr9b5_referencetype as unknown as number) as Category['type'],
    sortOrder: r.cr9b5_sortorder ?? undefined,
  }
}

// ---------- Invoice ----------

export function invoiceFromRecord(r: Cr9b5_pt_invoices): Invoice {
  return {
    id: r.cr9b5_pt_invoiceid,
    internalId: r.cr9b5_internalid ?? '',
    globalSequence: r.cr9b5_globalsequence ?? 0,
    year: r.cr9b5_year ?? 0,
    type: (r.cr9b5_type as unknown as number) as Invoice['type'],
    date: r.cr9b5_date ?? '',
    description: r.cr9b5_description ?? undefined,
    propertyId: lookupValue(r, '_cr9b5_property_value'),
    allProperties: r.cr9b5_allproperties ?? false,
    contactId: lookupValue(r, '_cr9b5_contact_value'),
    categoryId: lookupValue(r, '_cr9b5_categoryid_value'),
    baseAmount: r.cr9b5_baseamount ?? 0,
    taxAmount: r.cr9b5_taxamount ?? 0,
    totalGross: r.cr9b5_totalgross ?? 0,
    taxRate: r.cr9b5_taxrate ?? '',
    taxIsManual: r.cr9b5_taxismanual ?? false,
    bookingReference: r.cr9b5_bookingreference ?? undefined,
    checkIn: r.cr9b5_checkin ?? undefined,
    checkOut: r.cr9b5_checkout ?? undefined,
    nights: r.cr9b5_nights ?? undefined,
    days: r.cr9b5_days ?? undefined,
    adults: r.cr9b5_adults ?? undefined,
    children: r.cr9b5_children ?? undefined,
    babies: r.cr9b5_babies ?? undefined,
    googleDriveFolderId: r.svm_pt_googledrivefolderid ?? undefined,
    cancelled: (r.statecode as unknown as number) === 1 || (r.statecodename as unknown as string) === 'Inactive',
  }
}

export function invoiceToRecord(inv: Partial<NewInvoice>): Record<string, unknown> {
  const toIso = (d: string | undefined) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toISOString() : undefined)
  const rec: Record<string, unknown> = {}
  if (inv.internalId !== undefined) rec.cr9b5_internalid = inv.internalId
  if (inv.globalSequence !== undefined) rec.cr9b5_globalsequence = inv.globalSequence
  if (inv.year !== undefined) rec.cr9b5_year = inv.year
  if (inv.type !== undefined) rec.cr9b5_type = inv.type
  if (inv.date !== undefined) rec.cr9b5_date = inv.date.length > 10 ? inv.date : toIso(inv.date)
  if (inv.description !== undefined) rec.cr9b5_description = inv.description || undefined
  if (inv.baseAmount !== undefined) rec.cr9b5_baseamount = inv.baseAmount
  if (inv.taxAmount !== undefined) rec.cr9b5_taxamount = inv.taxAmount
  if (inv.totalGross !== undefined) rec.cr9b5_totalgross = inv.totalGross
  if (inv.taxRate !== undefined) rec.cr9b5_taxrate = inv.taxRate
  if (inv.taxIsManual !== undefined) rec.cr9b5_taxismanual = inv.taxIsManual
  if (inv.allProperties !== undefined) rec.cr9b5_allproperties = inv.allProperties
  if (inv.bookingReference !== undefined) rec.cr9b5_bookingreference = inv.bookingReference || undefined
  if (inv.checkIn !== undefined) rec.cr9b5_checkin = toIso(inv.checkIn)
  if (inv.checkOut !== undefined) rec.cr9b5_checkout = toIso(inv.checkOut)
  if (inv.nights !== undefined) rec.cr9b5_nights = inv.nights
  if (inv.days !== undefined) rec.cr9b5_days = inv.days
  if (inv.adults !== undefined) rec.cr9b5_adults = inv.adults
  if (inv.children !== undefined) rec.cr9b5_children = inv.children
  if (inv.babies !== undefined) rec.cr9b5_babies = inv.babies
  if (inv.contactId) rec['cr9b5_Contact@odata.bind'] = `/cr9b5_pt_contacts(${inv.contactId})`
  if (inv.propertyId && !inv.allProperties) rec['cr9b5_Property@odata.bind'] = `/cr9b5_pt_properties(${inv.propertyId})`
  if (inv.categoryId) rec['cr9b5_categoryid@odata.bind'] = `/cr9b5_pt_references(${inv.categoryId})`
  return rec
}

// ---------- SupplierContract ----------

export function supplierContractFromRecord(r: Svm_pt_suppliercontracts): SupplierContract {
  return {
    id: r.svm_pt_suppliercontractid,
    contactId: lookupValue(r, '_svm_pt_contact_value') ?? '',
    propertyId: lookupValue(r, '_svm_property_value'),
    allProperties: r.svm_pt_allproperties ?? false,
    contractCount: r.svm_pt_contractcount && r.svm_pt_contractcount > 0 ? r.svm_pt_contractcount : 1,
    defaultCategoryId: lookupValue(r, '_svm_defaultcategory_value'),
    defaultDescription: r.svm_pt_defaultdescription ?? undefined,
    active: r.svm_pt_active ?? true,
  }
}

export function supplierContractToRecord(c: Partial<SupplierContract>): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  if (c.allProperties !== undefined) rec.svm_pt_allproperties = c.allProperties
  if (c.contractCount !== undefined) rec.svm_pt_contractcount = c.contractCount > 0 ? c.contractCount : 1
  if (c.defaultDescription !== undefined) rec.svm_pt_defaultdescription = c.defaultDescription || undefined
  if (c.active !== undefined) rec.svm_pt_active = c.active
  if (c.contactId) rec['svm_pt_contact@odata.bind'] = `/cr9b5_pt_contacts(${c.contactId})`
  if (c.propertyId && !c.allProperties) rec['svm_Property@odata.bind'] = `/cr9b5_pt_properties(${c.propertyId})`
  if (c.defaultCategoryId) rec['svm_DefaultCategory@odata.bind'] = `/cr9b5_pt_references(${c.defaultCategoryId})`
  return rec
}

// ---------- InvoiceTemplate ----------

export function invoiceTemplateFromRecord(r: Svm_pt_invoicetemplates): InvoiceTemplate {
  return {
    id: r.svm_pt_invoicetemplateid,
    name: r.svm_pt_name ?? '',
    type: (r.svm_pt_type as unknown as number) as InvoiceTemplate['type'],
    categoryId: lookupValue(r, '_svm_category_value'),
    description: r.svm_pt_description ?? undefined,
    defaultAmount: r.svm_pt_defaultamount ?? undefined,
  }
}

export function invoiceTemplateToRecord(t: Partial<InvoiceTemplate>): Record<string, unknown> {
  const rec: Record<string, unknown> = {}
  if (t.name !== undefined) rec.svm_pt_name = t.name
  if (t.type !== undefined) rec.svm_pt_type = t.type
  if (t.description !== undefined) rec.svm_pt_description = t.description || undefined
  if (t.defaultAmount !== undefined) rec.svm_pt_defaultamount = t.defaultAmount
  if (t.categoryId) rec['svm_Category@odata.bind'] = `/cr9b5_pt_references(${t.categoryId})`
  return rec
}

// ---------- InvoiceComment ----------

export function invoiceCommentFromRecord(r: Svm_pt_invoicecomments): InvoiceComment {
  return {
    id: r.svm_pt_invoicecommentid,
    invoiceId: lookupValue(r, '_svm_invoice_value') ?? '',
    comment: r.svm_pt_comment ?? '',
    createdByName: r.createdbyname ?? undefined,
    createdOn: r.createdon ?? undefined,
  }
}

// ---------- Attachment ----------

export function attachmentFromRecord(r: Cr9b5_pt_attachments): Attachment {
  return {
    id: r.cr9b5_pt_attachmentid,
    fileName: r.cr9b5_filename,
    googleDriveId: r.cr9b5_googledriveid ?? undefined,
    googleDriveUrl: r.cr9b5_googledriveurl ?? undefined,
    invoiceId: lookupValue(r, '_cr9b5_invoiceid_value'),
    propertyId: lookupValue(r, '_cr9b5_propertyid_value'),
    contactId: lookupValue(r, '_cr9b5_contactid_value'),
    attachTypeId: lookupValue(r, '_cr9b5_attachtype_value'),
    uploadedOn: r.cr9b5_uploadedon ?? undefined,
  }
}

// ---------- ForecastFlow ----------

export function forecastFlowFromRecord(r: Cr9b5_pt_forecastflows): ForecastFlow {
  return {
    id: r.cr9b5_pt_forecastflowid,
    name: r.cr9b5_name ?? '',
    type: (r.cr9b5_type as unknown as number) as ForecastFlow['type'],
    frequency: (r.cr9b5_frequency as unknown as number) as ForecastFlow['frequency'],
    daysOfWeek: r.cr9b5_daysofweek ?? undefined,
    startDate: r.cr9b5_startdate ?? '',
    endDate: r.cr9b5_enddate ?? undefined,
    netAmount: r.cr9b5_netamount ?? 0,
    vatAmount: r.cr9b5_vatamount ?? 0,
    grossAmount: r.cr9b5_grossamount ?? 0,
    vatRate: r.cr9b5_vatrate ?? '',
    vatIsManual: r.cr9b5_vatismanual ?? false,
    allProperties: r.cr9b5_allproperties ?? false,
    categoryId: lookupValue(r, '_cr9b5_categoryid_value'),
    contactId: lookupValue(r, '_cr9b5_contactid_value'),
    parentFlowId: lookupValue(r, '_cr9b5_parentflowid_value'),
    notes: r.cr9b5_notes ?? undefined,
  }
}

// ---------- ForecastFlowProperty ----------

export function forecastFlowPropertyFromRecord(r: Cr9b5_forecastproperties): ForecastFlowProperty {
  return {
    id: r.cr9b5_forecastpropertyid,
    forecastFlowId: lookupValue(r, '_cr9b5_forecastflowid_value') ?? '',
    propertyId: lookupValue(r, '_cr9b5_propertyid_value') ?? '',
  }
}

// ---------- ActivityLogEntry ----------

export function activityLogFromRecord(r: Cr9b5_pt_activitylogs): ActivityLogEntry {
  return {
    id: r.cr9b5_pt_activitylogid,
    action: (r.cr9b5_action as unknown as number) as ActivityLogEntry['action'],
    table: (r.cr9b5_tablemame as unknown as number) as ActivityLogEntry['table'],
    recordName: r.cr9b5_recordname ?? '',
    details: r.cr9b5_details ?? undefined,
    timestamp: r.cr9b5_timestamp ?? '',
    user: r.cr9b5_user ?? '',
  }
}
