/**
 * PostgreSQL-backed implementation of the `Repositories` contract (src/data/repositories.ts),
 * talking to the new `api/` REST service via `fetch` (migration.md §Frontend adapter). Mirrors
 * `src/data/dataverse/dataverseRepositories.ts` at the call-site level so screens *could* be
 * pointed at this instead — but nothing in the app is wired to it by default (see
 * src/data/index.ts). Only Postgres/API JSON shapes are known here and in ./mappers.ts.
 */
import type { Repositories } from '@/data/repositories'
import type {
  Property, Contact, SupplierContract, InvoiceTemplate, Attachment, ForecastFlow, ForecastFlowProperty,
  OwnerOccupancy, ForecastScenario, ForecastFlowComponent, ReferenceData,
} from '@/domain/types'
import { apiClient } from './client'
import {
  propertyFromRow, propertyToRow, type PropertyRow,
  contactFromRow, contactToRow, type ContactRow,
  categoryFromRow, referenceDataFromRow, referenceDataToRow, type ReferenceDataRow,
  invoiceFromRow, invoiceToRow, type InvoiceRow,
  supplierContractFromRow, supplierContractToRow, type SupplierContractRow,
  invoiceTemplateFromRow, invoiceTemplateToRow, type InvoiceTemplateRow,
  invoiceCommentFromRow, type InvoiceCommentRow,
  attachmentFromRow, type AttachmentRow,
  forecastFlowFromRow, type ForecastFlowRow,
  forecastFlowPropertyFromRow, type ForecastFlowPropertyRow,
  activityLogFromRow, type ActivityLogRow,
  ownerOccupancyFromRow, ownerOccupancyToRow, type OwnerOccupancyRow,
  forecastScenarioFromRow, forecastScenarioToRow, type ForecastScenarioRow,
  forecastFlowComponentFromRow, forecastFlowComponentToRow, type ForecastFlowComponentRow,
} from './mappers'

// The Income/Expense Category rows live in reference_data — same filter-on-read approach the
// Dataverse repo uses (CATEGORY_FILTER there; a query param here).
const CATEGORY_TYPES = [233100005, 233100006]

export const postgresRepositories: Repositories = {
  properties: {
    async list() {
      const rows = await apiClient.get<PropertyRow[]>('/properties')
      return rows.map(propertyFromRow)
    },
    async save(p: Property | Omit<Property, 'id'>) {
      const row = propertyToRow(p)
      if ('id' in p && p.id) return propertyFromRow(await apiClient.put<PropertyRow>(`/properties/${p.id}`, row))
      return propertyFromRow(await apiClient.post<PropertyRow>('/properties', row))
    },
    async remove(id) {
      await apiClient.del(`/properties/${id}`)
    },
    async deletable(id) {
      return apiClient.get(`/properties/${id}/deletable`)
    },
  },

  contacts: {
    async list() {
      const rows = await apiClient.get<ContactRow[]>('/contacts')
      return rows.map(contactFromRow)
    },
    async save(c: Contact | Omit<Contact, 'id'>) {
      const row = contactToRow(c)
      if ('id' in c && c.id) return contactFromRow(await apiClient.put<ContactRow>(`/contacts/${c.id}`, row))
      return contactFromRow(await apiClient.post<ContactRow>('/contacts', row))
    },
    async remove(id) {
      await apiClient.del(`/contacts/${id}`)
    },
  },

  supplierContracts: {
    async list() {
      const rows = await apiClient.get<SupplierContractRow[]>('/supplier-contracts')
      return rows.map(supplierContractFromRow)
    },
    async save(c: SupplierContract | Omit<SupplierContract, 'id'>) {
      const row = supplierContractToRow(c)
      if ('id' in c && c.id) return supplierContractFromRow(await apiClient.put<SupplierContractRow>(`/supplier-contracts/${c.id}`, row))
      return supplierContractFromRow(await apiClient.post<SupplierContractRow>('/supplier-contracts', row))
    },
    async remove(id) {
      await apiClient.del(`/supplier-contracts/${id}`)
    },
  },

  categories: {
    async list() {
      const rows = await apiClient.get<ReferenceDataRow[]>('/reference-data')
      return rows.filter((r) => CATEGORY_TYPES.includes(r.reference_type)).map(categoryFromRow)
    },
    async save() {
      throw new Error('Categories are managed as Reference Data in Admin, not via this repository.')
    },
    async remove() {
      throw new Error('Categories are managed as Reference Data in Admin, not via this repository.')
    },
  },

  referenceData: {
    async list() {
      const rows = await apiClient.get<ReferenceDataRow[]>('/reference-data')
      return rows.map(referenceDataFromRow)
    },
    async save(r: ReferenceData | Omit<ReferenceData, 'id'>) {
      const row = referenceDataToRow(r)
      if ('id' in r && r.id) return referenceDataFromRow(await apiClient.put<ReferenceDataRow>(`/reference-data/${r.id}`, row))
      return referenceDataFromRow(await apiClient.post<ReferenceDataRow>('/reference-data', row))
    },
    async remove(id) {
      await apiClient.del(`/reference-data/${id}`)
    },
    async usageCount(id) {
      return apiClient.get(`/reference-data/${id}/usage-count`)
    },
  },

  invoiceTemplates: {
    async list() {
      const rows = await apiClient.get<InvoiceTemplateRow[]>('/invoice-templates')
      return rows.map(invoiceTemplateFromRow)
    },
    async save(t: InvoiceTemplate | Omit<InvoiceTemplate, 'id'>) {
      const row = invoiceTemplateToRow(t)
      if ('id' in t && t.id) return invoiceTemplateFromRow(await apiClient.put<InvoiceTemplateRow>(`/invoice-templates/${t.id}`, row))
      return invoiceTemplateFromRow(await apiClient.post<InvoiceTemplateRow>('/invoice-templates', row))
    },
    async remove(id) {
      await apiClient.del(`/invoice-templates/${id}`)
    },
  },

  attachments: {
    async list() {
      const rows = await apiClient.get<AttachmentRow[]>('/attachments')
      return rows.map(attachmentFromRow)
    },
    async save(a: Attachment | Omit<Attachment, 'id'>) {
      const row: Record<string, unknown> = {
        file_name: a.fileName,
        google_drive_id: a.googleDriveId ?? null,
        google_drive_url: a.googleDriveUrl ?? null,
        invoice_id: a.invoiceId ?? null,
        property_id: a.propertyId ?? null,
        contact_id: a.contactId ?? null,
        attach_type_id: a.attachTypeId ?? null,
        uploaded_on: a.uploadedOn ?? new Date().toISOString(),
      }
      if ('id' in a && a.id) return attachmentFromRow(await apiClient.put<AttachmentRow>(`/attachments/${a.id}`, row))
      return attachmentFromRow(await apiClient.post<AttachmentRow>('/attachments', row))
    },
    async remove(id) {
      await apiClient.del(`/attachments/${id}`)
    },
  },

  forecastFlows: {
    async list() {
      const rows = await apiClient.get<ForecastFlowRow[]>('/forecast-flows')
      return rows.map(forecastFlowFromRow)
    },
    async save(f: ForecastFlow | Omit<ForecastFlow, 'id'>) {
      const row: Record<string, unknown> = {
        name: f.name, type: f.type, frequency: f.frequency, days_of_week: f.daysOfWeek,
        start_date: f.startDate, end_date: f.endDate ?? null, net_amount: f.netAmount,
        vat_amount: f.vatAmount, gross_amount: f.grossAmount, vat_rate: f.vatRate,
        vat_is_manual: f.vatIsManual, all_properties: f.allProperties,
        category_id: f.categoryId ?? null, contact_id: f.contactId ?? null,
        parent_flow_id: f.parentFlowId ?? null, notes: f.notes ?? null,
        amount_source: f.amountSource, percentage: f.percentage ?? null,
      }
      if ('id' in f && f.id) return forecastFlowFromRow(await apiClient.put<ForecastFlowRow>(`/forecast-flows/${f.id}`, row))
      return forecastFlowFromRow(await apiClient.post<ForecastFlowRow>('/forecast-flows', row))
    },
    async remove(id) {
      await apiClient.del(`/forecast-flows/${id}`)
    },
  },

  forecastFlowProperties: {
    async list() {
      const rows = await apiClient.get<ForecastFlowPropertyRow[]>('/forecast-flow-properties')
      return rows.map(forecastFlowPropertyFromRow)
    },
    async save(fp: ForecastFlowProperty | Omit<ForecastFlowProperty, 'id'>) {
      const row = { forecast_flow_id: fp.forecastFlowId, property_id: fp.propertyId }
      if ('id' in fp && fp.id) return forecastFlowPropertyFromRow(await apiClient.put<ForecastFlowPropertyRow>(`/forecast-flow-properties/${fp.id}`, row))
      return forecastFlowPropertyFromRow(await apiClient.post<ForecastFlowPropertyRow>('/forecast-flow-properties', row))
    },
    async remove(id) {
      await apiClient.del(`/forecast-flow-properties/${id}`)
    },
  },

  ownerOccupancies: {
    async list() {
      const rows = await apiClient.get<OwnerOccupancyRow[]>('/owner-occupancies')
      return rows.map(ownerOccupancyFromRow)
    },
    async save(o: OwnerOccupancy | Omit<OwnerOccupancy, 'id'>) {
      const row = ownerOccupancyToRow(o)
      if ('id' in o && o.id) return ownerOccupancyFromRow(await apiClient.put<OwnerOccupancyRow>(`/owner-occupancies/${o.id}`, row))
      return ownerOccupancyFromRow(await apiClient.post<OwnerOccupancyRow>('/owner-occupancies', row))
    },
    async remove(id) {
      await apiClient.del(`/owner-occupancies/${id}`)
    },
  },

  forecastScenarios: {
    async list() {
      const rows = await apiClient.get<ForecastScenarioRow[]>('/forecast-scenarios')
      return rows.map(forecastScenarioFromRow)
    },
    async save(s: ForecastScenario | Omit<ForecastScenario, 'id'>) {
      const row = forecastScenarioToRow(s)
      if ('id' in s && s.id) return forecastScenarioFromRow(await apiClient.put<ForecastScenarioRow>(`/forecast-scenarios/${s.id}`, row))
      return forecastScenarioFromRow(await apiClient.post<ForecastScenarioRow>('/forecast-scenarios', row))
    },
    async remove(id) {
      await apiClient.del(`/forecast-scenarios/${id}`)
    },
  },

  forecastFlowComponents: {
    async list() {
      const rows = await apiClient.get<ForecastFlowComponentRow[]>('/forecast-flow-components')
      return rows.map(forecastFlowComponentFromRow)
    },
    async listBySourceFlow(flowId) {
      // No dedicated filtered endpoint (migration.md §Frontend adapter philosophy: filter
      // client-side over the full list at this data volume — ~4 rows total, see Step 6/7).
      const rows = await apiClient.get<ForecastFlowComponentRow[]>('/forecast-flow-components')
      return rows.filter((r) => r.source_flow_id === flowId).map(forecastFlowComponentFromRow)
    },
    async save(c: ForecastFlowComponent | Omit<ForecastFlowComponent, 'id'>) {
      const row = forecastFlowComponentToRow(c)
      if ('id' in c && c.id) return forecastFlowComponentFromRow(await apiClient.put<ForecastFlowComponentRow>(`/forecast-flow-components/${c.id}`, row))
      return forecastFlowComponentFromRow(await apiClient.post<ForecastFlowComponentRow>('/forecast-flow-components', row))
    },
    async remove(id) {
      await apiClient.del(`/forecast-flow-components/${id}`)
    },
  },

  invoices: {
    async list() {
      const rows = await apiClient.get<InvoiceRow[]>('/invoices')
      return rows.map(invoiceFromRow)
    },
    async get(id) {
      try {
        return invoiceFromRow(await apiClient.get<InvoiceRow>(`/invoices/${id}`))
      } catch {
        return null
      }
    },
    async nextSequence(year) {
      const res = await apiClient.get<{ nextSequence: number }>(`/invoices/next-internal-id?year=${year}`)
      return res.nextSequence
    },
    async create(inv) {
      const row = invoiceToRow(inv)
      return invoiceFromRow(await apiClient.post<InvoiceRow>('/invoices', row))
    },
    async update(id, patch) {
      const row = invoiceToRow(patch)
      return invoiceFromRow(await apiClient.put<InvoiceRow>(`/invoices/${id}`, row))
    },
    async cancel(id) {
      await apiClient.post(`/invoices/${id}/cancel`)
    },
  },

  invoiceComments: {
    async listForInvoice(invoiceId) {
      const rows = await apiClient.get<InvoiceCommentRow[]>(`/invoice-comments?invoiceId=${invoiceId}`)
      return rows.map(invoiceCommentFromRow)
    },
    async add(invoiceId, comment) {
      return invoiceCommentFromRow(await apiClient.post<InvoiceCommentRow>('/invoice-comments', { invoiceId, comment }))
    },
  },

  activityLog: {
    async list() {
      const rows = await apiClient.get<ActivityLogRow[]>('/activity-logs')
      return rows.map(activityLogFromRow)
    },
    async record() {
      // No-op by design: with the Postgres backend, Activity Log rows are written server-side,
      // in the same transaction as each mutation (migration.md §Business Rule Placement
      // "Activity Log creation") — the frontend no longer calls this explicitly per-screen.
    },
  },
}
