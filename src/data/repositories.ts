import type {
  Property, Contact, Category, Invoice, NewInvoice, SupplierContract,
  InvoiceTemplate, InvoiceComment, Attachment, ForecastFlow, ForecastFlowProperty,
  ActivityLogEntry, ActivityAction, ActivityTable,
} from '@/domain/types'

/** Generic create/update/delete + list for a simple id-keyed collection. */
export interface CrudOps<T extends { id: string }> {
  list(): Promise<T[]>
  /** Insert (no id) or update (with id). Returns the saved row. */
  save(record: T | Omit<T, 'id'>): Promise<T>
  remove(id: string): Promise<void>
}

/** The contract the UI codes against — implemented by `mock/` or `dataverse/`. */
export interface Repositories {
  properties: CrudOps<Property>
  contacts: CrudOps<Contact>
  supplierContracts: CrudOps<SupplierContract>
  categories: CrudOps<Category>
  invoiceTemplates: CrudOps<InvoiceTemplate>
  attachments: CrudOps<Attachment>
  forecastFlows: CrudOps<ForecastFlow>
  forecastFlowProperties: CrudOps<ForecastFlowProperty>

  invoices: {
    list(): Promise<Invoice[]>
    get(id: string): Promise<Invoice | null>
    /** Next free `cr9b5_globalsequence` value for a given year — used to build the internal ID. */
    nextSequence(year: number): Promise<number>
    create(inv: NewInvoice): Promise<Invoice>
    update(id: string, patch: Partial<NewInvoice>): Promise<Invoice>
    /** Soft-delete (sets inactive) — invoices are never hard-deleted, history is kept. */
    cancel(id: string): Promise<void>
  }

  invoiceComments: {
    listForInvoice(invoiceId: string): Promise<InvoiceComment[]>
    add(invoiceId: string, comment: string): Promise<InvoiceComment>
  }

  activityLog: {
    list(): Promise<ActivityLogEntry[]>
    record(action: ActivityAction, table: ActivityTable, recordName: string, details?: string): Promise<void>
  }
}
