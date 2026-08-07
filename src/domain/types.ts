/**
 * Domain models — decoupled from Dataverse attribute names/casing. The data layer
 * (`src/data/dataverse/mappers.ts`) is the only place that translates between these and the
 * generated `cr9b5_*`/`svm_*` service records; screens and hooks only ever see these types.
 *
 * Enum numeric values are the live Dataverse option-set codes (see `docs/schema.md` for the
 * full picklist reference and the cross-table numbering quirks called out there — e.g.
 * `InvoiceType` and `ForecastFlowType` use opposite codes for Income/Expense). Modelled as
 * `as const` objects rather than TS `enum` — this project's tsconfig runs with
 * `erasableSyntaxOnly`, which real enums violate (they compile to runtime code, not just types).
 */

export const ContactRole = {
  Supplier: 233100000,
  Client: 233100001,
} as const
export type ContactRole = (typeof ContactRole)[keyof typeof ContactRole]

export const InvoiceType = {
  Expense: 233100000,
  Income: 233100001,
} as const
export type InvoiceType = (typeof InvoiceType)[keyof typeof InvoiceType]

export const ForecastFlowType = {
  Income: 233100000,
  Expense: 233100001,
} as const
export type ForecastFlowType = (typeof ForecastFlowType)[keyof typeof ForecastFlowType]

export const ForecastFrequency = {
  OneOff: 233100000,
  Daily: 233100001,
  Weekly: 233100002,
  Monthly: 233100003,
  Quarterly: 233100004,
  SemiAnnually: 233100005,
  Annually: 233100006,
} as const
export type ForecastFrequency = (typeof ForecastFrequency)[keyof typeof ForecastFrequency]

export const CategoryType = {
  Income: 233100005,
  Expense: 233100006,
} as const
export type CategoryType = (typeof CategoryType)[keyof typeof CategoryType]

export const ActivityAction = {
  Created: 233100000,
  Updated: 233100001,
  Deleted: 233100002,
  Exported: 233100003,
} as const
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction]

export const ActivityTable = {
  Invoice: 233100000,
  Contact: 233100001,
  Property: 233100002,
  Attachment: 233100003,
  // Live picklist value beyond what docs/schema.md's extraction turned up — same "the
  // deployed option set has more values than the schema file declares" pattern as Category.
  ForecastFlow: 233100004,
} as const
export type ActivityTable = (typeof ActivityTable)[keyof typeof ActivityTable]

export interface Property {
  id: string
  name: string
  shortId: string
  address: string
  notes?: string
  googleDriveFolderId?: string
  invoiceCount?: number // convenience aggregate, not a Dataverse column
}

export interface Contact {
  id: string
  name: string
  role: ContactRole
  email?: string
  taxId?: string
  defaultDescription?: string
  defaultCategoryId?: string
  regularSupplier?: boolean // kept in sync from SupplierContract rows, see docs/schema.md
}

export interface SupplierContract {
  id: string
  contactId: string
  propertyId?: string
  allProperties: boolean
  contractCount: number
  defaultCategoryId?: string
  defaultDescription?: string
  active: boolean
}

export interface Category {
  id: string
  value: string
  type: CategoryType
  sortOrder?: number
}

export interface Invoice {
  id: string
  internalId: string
  globalSequence: number
  year: number
  type: InvoiceType
  date: string // ISO datetime
  description?: string
  propertyId?: string
  allProperties: boolean
  contactId?: string
  categoryId?: string
  baseAmount: number
  taxAmount: number
  totalGross: number
  taxRate: string // stored as text, e.g. "7" or "n/a"
  taxIsManual: boolean
  bookingReference?: string
  checkIn?: string
  checkOut?: string
  nights?: number
  days?: number
  adults?: number
  children?: number
  babies?: number
  googleDriveFolderId?: string
  cancelled: boolean
}

export type NewInvoice = Omit<Invoice, 'id' | 'cancelled'>

export interface InvoiceTemplate {
  id: string
  name: string
  type: CategoryType // Income/Expense, same numbering as Category
  categoryId?: string
  description?: string
  defaultAmount?: number
}

export interface InvoiceComment {
  id: string
  invoiceId: string
  comment: string
  createdByName?: string
  createdOn?: string
}

export interface Attachment {
  id: string
  fileName: string
  googleDriveId?: string
  googleDriveUrl?: string
  invoiceId?: string
  propertyId?: string
  contactId?: string
  attachTypeId?: string
  uploadedOn?: string
}

export interface ForecastFlow {
  id: string
  name: string
  type: ForecastFlowType
  frequency: ForecastFrequency
  daysOfWeek?: string
  startDate: string
  endDate?: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  vatRate: string
  vatIsManual: boolean
  allProperties: boolean
  categoryId?: string
  contactId?: string
  parentFlowId?: string
  notes?: string
}

export interface ForecastFlowProperty {
  id: string
  forecastFlowId: string
  propertyId: string
}

export interface ActivityLogEntry {
  id: string
  action: ActivityAction
  table: ActivityTable
  recordName: string
  details?: string
  timestamp: string
  user: string
}
