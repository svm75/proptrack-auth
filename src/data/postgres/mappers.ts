/**
 * API JSON (snake_case Postgres rows, as returned by `api/`) ⇄ domain type mappers. Mirrors
 * `src/data/dataverse/mappers.ts` one-for-one — the domain type shapes in `src/domain/types.ts`
 * do not change, only what populates them (migration.md §API Architecture).
 */
import type {
  Property, Contact, Category, Invoice, NewInvoice, SupplierContract,
  InvoiceTemplate, InvoiceComment, Attachment, ForecastFlow, ForecastFlowProperty, ActivityLogEntry,
  OwnerOccupancy, ForecastScenario, ForecastFlowComponent, ReferenceData,
} from '@/domain/types'

// ---------- Property ----------

export interface PropertyRow {
  id: string; name: string; short_id: string; address: string | null; notes: string | null
  google_drive_folder_id: string | null
}

export function propertyFromRow(r: PropertyRow): Property {
  return {
    id: r.id,
    name: r.name,
    shortId: r.short_id,
    address: r.address ?? '',
    notes: r.notes ?? undefined,
    googleDriveFolderId: r.google_drive_folder_id ?? undefined,
  }
}

export function propertyToRow(p: Partial<Property>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (p.name !== undefined) row.name = p.name
  if (p.shortId !== undefined) row.short_id = p.shortId
  if (p.address !== undefined) row.address = p.address
  if (p.notes !== undefined) row.notes = p.notes || null
  if (p.googleDriveFolderId !== undefined) row.google_drive_folder_id = p.googleDriveFolderId
  return row
}

// ---------- Contact ----------

export interface ContactRow {
  id: string; name: string; role: number; email: string | null; tax_id: string | null
  default_description: string | null; regular_supplier: boolean; default_category_id: string | null
}

export function contactFromRow(r: ContactRow): Contact {
  return {
    id: r.id,
    name: r.name,
    role: r.role as Contact['role'],
    email: r.email ?? undefined,
    taxId: r.tax_id ?? undefined,
    defaultDescription: r.default_description ?? undefined,
    defaultCategoryId: r.default_category_id ?? undefined,
    regularSupplier: r.regular_supplier,
  }
}

export function contactToRow(c: Partial<Contact>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (c.name !== undefined) row.name = c.name
  if (c.role !== undefined) row.role = c.role
  if (c.email !== undefined) row.email = c.email || null
  if (c.taxId !== undefined) row.tax_id = c.taxId || null
  if (c.defaultDescription !== undefined) row.default_description = c.defaultDescription || null
  if (c.regularSupplier !== undefined) row.regular_supplier = c.regularSupplier
  if (c.defaultCategoryId !== undefined) row.default_category_id = c.defaultCategoryId || null
  return row
}

// ---------- Category (reference_data rows filtered to Income/Expense Category) ----------

export interface ReferenceDataRow {
  id: string; value: string; reference_type: number; sort_order: number | null
}

export function categoryFromRow(r: ReferenceDataRow): Category {
  return { id: r.id, value: r.value, type: r.reference_type as Category['type'], sortOrder: r.sort_order ?? undefined }
}

// ---------- ReferenceData (unfiltered reference_data rows) — added Step 8 ----------

export function referenceDataFromRow(r: ReferenceDataRow): ReferenceData {
  return { id: r.id, value: r.value, referenceType: r.reference_type, sortOrder: r.sort_order ?? undefined }
}

export function referenceDataToRow(r: ReferenceData | Omit<ReferenceData, 'id'>): Record<string, unknown> {
  return { value: r.value, reference_type: r.referenceType, sort_order: r.sortOrder ?? null }
}

// ---------- Invoice ----------

export interface InvoiceRow {
  id: string; internal_id: string | null; global_sequence: number | null; year: number; type: number
  invoice_date: string; description: string | null; property_id: string | null; all_properties: boolean
  contact_id: string | null; category_id: string | null; base_amount: string; tax_amount: string
  total_gross: string; tax_rate: string | null; tax_is_manual: boolean; booking_reference: string | null
  check_in: string | null; check_out: string | null; nights: number | null; days: number | null
  adults: number | null; children: number | null; babies: number | null
  google_drive_folder_id: string | null; is_cancelled: boolean
}

export function invoiceFromRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    internalId: r.internal_id ?? '',
    globalSequence: r.global_sequence ?? 0,
    year: r.year,
    type: r.type as Invoice['type'],
    date: r.invoice_date,
    description: r.description ?? undefined,
    propertyId: r.property_id ?? undefined,
    allProperties: r.all_properties,
    contactId: r.contact_id ?? undefined,
    categoryId: r.category_id ?? undefined,
    baseAmount: Number(r.base_amount),
    taxAmount: Number(r.tax_amount),
    totalGross: Number(r.total_gross),
    taxRate: r.tax_rate ?? '',
    taxIsManual: r.tax_is_manual,
    bookingReference: r.booking_reference ?? undefined,
    checkIn: r.check_in ?? undefined,
    checkOut: r.check_out ?? undefined,
    nights: r.nights ?? undefined,
    days: r.days ?? undefined,
    adults: r.adults ?? undefined,
    children: r.children ?? undefined,
    babies: r.babies ?? undefined,
    googleDriveFolderId: r.google_drive_folder_id ?? undefined,
    cancelled: r.is_cancelled,
  }
}

export function invoiceToRow(inv: Partial<NewInvoice>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (inv.year !== undefined) row.year = inv.year
  if (inv.type !== undefined) row.type = inv.type
  if (inv.date !== undefined) row.invoice_date = inv.date
  if (inv.description !== undefined) row.description = inv.description || null
  if (inv.propertyId !== undefined) row.property_id = inv.allProperties ? null : inv.propertyId || null
  if (inv.allProperties !== undefined) row.all_properties = inv.allProperties
  if (inv.contactId !== undefined) row.contact_id = inv.contactId || null
  if (inv.categoryId !== undefined) row.category_id = inv.categoryId || null
  if (inv.baseAmount !== undefined) row.base_amount = inv.baseAmount
  if (inv.taxAmount !== undefined) row.tax_amount = inv.taxAmount
  if (inv.totalGross !== undefined) row.total_gross = inv.totalGross
  if (inv.taxRate !== undefined) row.tax_rate = inv.taxRate
  if (inv.taxIsManual !== undefined) row.tax_is_manual = inv.taxIsManual
  if (inv.bookingReference !== undefined) row.booking_reference = inv.bookingReference || null
  if (inv.checkIn !== undefined) row.check_in = inv.checkIn || null
  if (inv.checkOut !== undefined) row.check_out = inv.checkOut || null
  if (inv.nights !== undefined) row.nights = inv.nights
  if (inv.days !== undefined) row.days = inv.days
  if (inv.adults !== undefined) row.adults = inv.adults
  if (inv.children !== undefined) row.children = inv.children
  if (inv.babies !== undefined) row.babies = inv.babies
  return row
}

// ---------- SupplierContract ----------

export interface SupplierContractRow {
  id: string; contact_id: string; property_id: string | null; all_properties: boolean
  contract_count: number; default_category_id: string | null; default_description: string | null; active: boolean
}

export function supplierContractFromRow(r: SupplierContractRow): SupplierContract {
  return {
    id: r.id,
    contactId: r.contact_id,
    propertyId: r.property_id ?? undefined,
    allProperties: r.all_properties,
    contractCount: r.contract_count > 0 ? r.contract_count : 1,
    defaultCategoryId: r.default_category_id ?? undefined,
    defaultDescription: r.default_description ?? undefined,
    active: r.active,
  }
}

export function supplierContractToRow(c: Partial<SupplierContract>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (c.contactId !== undefined) row.contact_id = c.contactId
  if (c.propertyId !== undefined) row.property_id = c.allProperties ? null : c.propertyId || null
  if (c.allProperties !== undefined) row.all_properties = c.allProperties
  if (c.contractCount !== undefined) row.contract_count = c.contractCount > 0 ? c.contractCount : 1
  if (c.defaultCategoryId !== undefined) row.default_category_id = c.defaultCategoryId || null
  if (c.defaultDescription !== undefined) row.default_description = c.defaultDescription || null
  if (c.active !== undefined) row.active = c.active
  return row
}

// ---------- InvoiceTemplate ----------

export interface InvoiceTemplateRow {
  id: string; name: string; type: number; category_id: string | null; description: string | null
  default_amount: string | null
}

export function invoiceTemplateFromRow(r: InvoiceTemplateRow): InvoiceTemplate {
  return {
    id: r.id,
    name: r.name,
    type: r.type as InvoiceTemplate['type'],
    categoryId: r.category_id ?? undefined,
    description: r.description ?? undefined,
    defaultAmount: r.default_amount != null ? Number(r.default_amount) : undefined,
  }
}

export function invoiceTemplateToRow(t: Partial<InvoiceTemplate>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (t.name !== undefined) row.name = t.name
  if (t.type !== undefined) row.type = t.type
  if (t.categoryId !== undefined) row.category_id = t.categoryId || null
  if (t.description !== undefined) row.description = t.description || null
  if (t.defaultAmount !== undefined) row.default_amount = t.defaultAmount
  return row
}

// ---------- InvoiceComment ----------

export interface InvoiceCommentRow {
  id: string; invoice_id: string; comment: string; created_by: string | null; created_at: string
}

export function invoiceCommentFromRow(r: InvoiceCommentRow): InvoiceComment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    comment: r.comment,
    createdByName: r.created_by ?? undefined,
    createdOn: r.created_at ?? undefined,
  }
}

// ---------- Attachment ----------

export interface AttachmentRow {
  id: string; file_name: string; google_drive_id: string | null; google_drive_url: string | null
  invoice_id: string | null; property_id: string | null; contact_id: string | null
  attach_type_id: string | null; uploaded_on: string | null
  // NAS-native document storage (final migration addendum) — undefined/null for legacy rows.
  storage_path?: string | null; original_filename?: string | null; mime_type?: string | null
  file_size?: string | null
}

export function attachmentFromRow(r: AttachmentRow): Attachment {
  return {
    id: r.id,
    fileName: r.file_name,
    googleDriveId: r.google_drive_id ?? undefined,
    googleDriveUrl: r.google_drive_url ?? undefined,
    invoiceId: r.invoice_id ?? undefined,
    propertyId: r.property_id ?? undefined,
    contactId: r.contact_id ?? undefined,
    attachTypeId: r.attach_type_id ?? undefined,
    uploadedOn: r.uploaded_on ?? undefined,
    storagePath: r.storage_path ?? undefined,
    originalFilename: r.original_filename ?? undefined,
    mimeType: r.mime_type ?? undefined,
    fileSize: r.file_size ? Number(r.file_size) : undefined,
  }
}

// ---------- ForecastFlow ----------

export interface ForecastFlowRow {
  id: string; name: string; type: number; frequency: number; days_of_week: string | null
  start_date: string; end_date: string | null; net_amount: string; vat_amount: string
  gross_amount: string; vat_rate: string | null; vat_is_manual: boolean; all_properties: boolean
  category_id: string | null; contact_id: string | null; parent_flow_id: string | null
  amount_source: number; percentage: string | null; notes: string | null
}

export function forecastFlowFromRow(r: ForecastFlowRow): ForecastFlow {
  return {
    id: r.id,
    name: r.name,
    type: r.type as ForecastFlow['type'],
    frequency: r.frequency as ForecastFlow['frequency'],
    daysOfWeek: r.days_of_week ?? undefined,
    startDate: r.start_date,
    endDate: r.end_date ?? undefined,
    netAmount: Number(r.net_amount),
    vatAmount: Number(r.vat_amount),
    grossAmount: Number(r.gross_amount),
    vatRate: r.vat_rate ?? '',
    vatIsManual: r.vat_is_manual,
    allProperties: r.all_properties,
    categoryId: r.category_id ?? undefined,
    contactId: r.contact_id ?? undefined,
    parentFlowId: r.parent_flow_id ?? undefined,
    notes: r.notes ?? undefined,
    amountSource: r.amount_source as ForecastFlow['amountSource'],
    percentage: r.percentage !== null ? Number(r.percentage) : undefined,
  }
}

// ---------- ForecastFlowProperty ----------

export interface ForecastFlowPropertyRow {
  id: string; forecast_flow_id: string; property_id: string
}

export function forecastFlowPropertyFromRow(r: ForecastFlowPropertyRow): ForecastFlowProperty {
  return { id: r.id, forecastFlowId: r.forecast_flow_id, propertyId: r.property_id }
}

// ---------- OwnerOccupancy ----------

export interface OwnerOccupancyRow {
  id: string; name: string | null; property_id: string; from_date: string; to_date: string
  adults: number | null; children: number | null; babies: number | null
}

export function ownerOccupancyFromRow(r: OwnerOccupancyRow): OwnerOccupancy {
  return {
    id: r.id,
    name: r.name ?? undefined,
    propertyId: r.property_id,
    fromDate: r.from_date,
    toDate: r.to_date,
    adults: r.adults ?? undefined,
    children: r.children ?? undefined,
    babies: r.babies ?? undefined,
  }
}

export function ownerOccupancyToRow(o: Partial<OwnerOccupancy>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (o.name !== undefined) row.name = o.name || null
  if (o.propertyId !== undefined) row.property_id = o.propertyId
  if (o.fromDate !== undefined) row.from_date = o.fromDate
  if (o.toDate !== undefined) row.to_date = o.toDate
  if (o.adults !== undefined) row.adults = o.adults
  if (o.children !== undefined) row.children = o.children
  if (o.babies !== undefined) row.babies = o.babies
  return row
}

// ---------- ForecastScenario ----------

export interface ForecastScenarioRow {
  id: string; name: string; property_id: string | null
  income_adjustment_pct: string; expense_adjustment_pct: string; notes: string | null
}

export function forecastScenarioFromRow(r: ForecastScenarioRow): ForecastScenario {
  return {
    id: r.id,
    name: r.name,
    propertyId: r.property_id ?? undefined,
    incomeAdjustmentPct: Number(r.income_adjustment_pct),
    expenseAdjustmentPct: Number(r.expense_adjustment_pct),
    notes: r.notes ?? undefined,
  }
}

export function forecastScenarioToRow(s: Partial<ForecastScenario>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (s.name !== undefined) row.name = s.name
  if (s.propertyId !== undefined) row.property_id = s.propertyId || null
  if (s.incomeAdjustmentPct !== undefined) row.income_adjustment_pct = s.incomeAdjustmentPct
  if (s.expenseAdjustmentPct !== undefined) row.expense_adjustment_pct = s.expenseAdjustmentPct
  if (s.notes !== undefined) row.notes = s.notes || null
  return row
}

// ---------- ForecastFlowComponent ----------

export interface ForecastFlowComponentRow {
  id: string; name: string | null; source_flow_id: string; target_flow_id: string; direction: number
}

export function forecastFlowComponentFromRow(r: ForecastFlowComponentRow): ForecastFlowComponent {
  return {
    id: r.id,
    name: r.name ?? undefined,
    sourceFlowId: r.source_flow_id,
    targetFlowId: r.target_flow_id,
    direction: r.direction as ForecastFlowComponent['direction'],
  }
}

export function forecastFlowComponentToRow(c: Partial<ForecastFlowComponent>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (c.name !== undefined) row.name = c.name || null
  if (c.sourceFlowId !== undefined) row.source_flow_id = c.sourceFlowId
  if (c.targetFlowId !== undefined) row.target_flow_id = c.targetFlowId
  if (c.direction !== undefined) row.direction = c.direction
  return row
}

// ---------- ActivityLogEntry ----------

export interface ActivityLogRow {
  id: string; action: number; table_name: number; record_name: string | null; details: string | null
  occurred_at: string; user_name: string | null
}

export function activityLogFromRow(r: ActivityLogRow): ActivityLogEntry {
  return {
    id: r.id,
    action: r.action as ActivityLogEntry['action'],
    table: r.table_name as ActivityLogEntry['table'],
    recordName: r.record_name ?? '',
    details: r.details ?? undefined,
    timestamp: r.occurred_at,
    user: r.user_name ?? '',
  }
}
