import { Cr9b5_pt_propertiesService } from '@/generated/services/Cr9b5_pt_propertiesService'
import { Cr9b5_pt_contactsService } from '@/generated/services/Cr9b5_pt_contactsService'
import { Cr9b5_pt_referencesService } from '@/generated/services/Cr9b5_pt_referencesService'
import { Cr9b5_pt_invoicesService } from '@/generated/services/Cr9b5_pt_invoicesService'
import { Svm_pt_suppliercontractsService } from '@/generated/services/Svm_pt_suppliercontractsService'
import { Svm_pt_invoicetemplatesService } from '@/generated/services/Svm_pt_invoicetemplatesService'
import { Svm_pt_invoicecommentsService } from '@/generated/services/Svm_pt_invoicecommentsService'
import { Cr9b5_pt_attachmentsService } from '@/generated/services/Cr9b5_pt_attachmentsService'
import { Cr9b5_pt_forecastflowsService } from '@/generated/services/Cr9b5_pt_forecastflowsService'
import { Cr9b5_forecastpropertiesService } from '@/generated/services/Cr9b5_forecastpropertiesService'
import { Cr9b5_pt_activitylogsService } from '@/generated/services/Cr9b5_pt_activitylogsService'
import {
  propertyFromRecord, propertyToRecord,
  contactFromRecord, contactToRecord,
  categoryFromRecord,
  invoiceFromRecord, invoiceToRecord,
  supplierContractFromRecord, supplierContractToRecord,
  invoiceTemplateFromRecord, invoiceTemplateToRecord,
  invoiceCommentFromRecord,
  attachmentFromRecord,
  forecastFlowFromRecord,
  forecastFlowPropertyFromRecord,
  activityLogFromRecord,
} from './mappers'
import type { Repositories } from '@/data/repositories'
import type { Property, Contact, SupplierContract, InvoiceTemplate, Attachment, ForecastFlow, ForecastFlowProperty } from '@/domain/types'

const CATEGORY_FILTER = 'cr9b5_referencetype eq 233100005 or cr9b5_referencetype eq 233100006'

function getCurrentUser(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const xrm = win.Xrm ?? win.parent?.Xrm
    return xrm?.Utility?.getGlobalContext?.()?.getUserName?.() || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

export const dataverseRepositories: Repositories = {
  properties: {
    async list() {
      const res = await Cr9b5_pt_propertiesService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 })
      return (res.data ?? []).map(propertyFromRecord)
    },
    async save(p: Property | Omit<Property, 'id'>) {
      const rec = propertyToRecord(p)
      if ('id' in p && p.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Cr9b5_pt_propertiesService.update(p.id, rec as any)
        return propertyFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_propertiesService.create(rec as any)
      return propertyFromRecord(res.data!)
    },
    async remove(id) {
      await Cr9b5_pt_propertiesService.delete(id)
    },
  },

  contacts: {
    async list() {
      const res = await Cr9b5_pt_contactsService.getAll({ orderBy: ['cr9b5_name asc'], maxPageSize: 5000 })
      return (res.data ?? []).map(contactFromRecord)
    },
    async save(c: Contact | Omit<Contact, 'id'>) {
      const rec = contactToRecord(c)
      if ('id' in c && c.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Cr9b5_pt_contactsService.update(c.id, rec as any)
        return contactFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_contactsService.create(rec as any)
      return contactFromRecord(res.data!)
    },
    async remove(id) {
      await Cr9b5_pt_contactsService.delete(id)
    },
  },

  supplierContracts: {
    async list() {
      const res = await Svm_pt_suppliercontractsService.getAll({ maxPageSize: 5000 })
      return (res.data ?? []).map(supplierContractFromRecord)
    },
    async save(c: SupplierContract | Omit<SupplierContract, 'id'>) {
      const rec = supplierContractToRecord(c)
      if ('id' in c && c.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Svm_pt_suppliercontractsService.update(c.id, rec as any)
        return supplierContractFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Svm_pt_suppliercontractsService.create(rec as any)
      return supplierContractFromRecord(res.data!)
    },
    async remove(id) {
      await Svm_pt_suppliercontractsService.delete(id)
    },
  },

  categories: {
    async list() {
      const res = await Cr9b5_pt_referencesService.getAll({
        filter: CATEGORY_FILTER, orderBy: ['cr9b5_sortorder asc'], maxPageSize: 5000,
      })
      return (res.data ?? []).map(categoryFromRecord)
    },
    async save() {
      throw new Error('Categories are managed as Reference Data in Admin, not via this repository.')
    },
    async remove() {
      throw new Error('Categories are managed as Reference Data in Admin, not via this repository.')
    },
  },

  invoiceTemplates: {
    async list() {
      const res = await Svm_pt_invoicetemplatesService.getAll({ orderBy: ['svm_pt_name asc'], maxPageSize: 5000 })
      return (res.data ?? []).map(invoiceTemplateFromRecord)
    },
    async save(t: InvoiceTemplate | Omit<InvoiceTemplate, 'id'>) {
      const rec = invoiceTemplateToRecord(t)
      if ('id' in t && t.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Svm_pt_invoicetemplatesService.update(t.id, rec as any)
        return invoiceTemplateFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Svm_pt_invoicetemplatesService.create(rec as any)
      return invoiceTemplateFromRecord(res.data!)
    },
    async remove(id) {
      await Svm_pt_invoicetemplatesService.delete(id)
    },
  },

  attachments: {
    async list() {
      const res = await Cr9b5_pt_attachmentsService.getAll({ maxPageSize: 5000 })
      return (res.data ?? []).map(attachmentFromRecord)
    },
    async save(a: Attachment | Omit<Attachment, 'id'>) {
      const rec: Record<string, unknown> = {
        cr9b5_filename: a.fileName,
        cr9b5_googledriveid: a.googleDriveId,
        cr9b5_googledriveurl: a.googleDriveUrl,
        cr9b5_uploadedon: a.uploadedOn ?? new Date().toISOString(),
      }
      if (a.invoiceId) rec['cr9b5_InvoiceId@odata.bind'] = `/cr9b5_pt_invoices(${a.invoiceId})`
      if (a.propertyId) rec['cr9b5_PropertyId@odata.bind'] = `/cr9b5_pt_properties(${a.propertyId})`
      if (a.contactId) rec['cr9b5_ContactId@odata.bind'] = `/cr9b5_pt_contacts(${a.contactId})`
      if (a.attachTypeId) rec['cr9b5_AttachType@odata.bind'] = `/cr9b5_pt_references(${a.attachTypeId})`
      if ('id' in a && a.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Cr9b5_pt_attachmentsService.update(a.id, rec as any)
        return attachmentFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_attachmentsService.create(rec as any)
      return attachmentFromRecord(res.data!)
    },
    async remove(id) {
      await Cr9b5_pt_attachmentsService.delete(id)
    },
  },

  forecastFlows: {
    async list() {
      const res = await Cr9b5_pt_forecastflowsService.getAll({ maxPageSize: 5000 })
      return (res.data ?? []).map(forecastFlowFromRecord)
    },
    async save(f: ForecastFlow | Omit<ForecastFlow, 'id'>) {
      const rec: Record<string, unknown> = {
        cr9b5_name: f.name,
        cr9b5_type: f.type,
        cr9b5_frequency: f.frequency,
        cr9b5_daysofweek: f.daysOfWeek,
        cr9b5_startdate: f.startDate,
        cr9b5_enddate: f.endDate,
        cr9b5_netamount: f.netAmount,
        cr9b5_vatamount: f.vatAmount,
        cr9b5_grossamount: f.grossAmount,
        cr9b5_vatrate: f.vatRate,
        cr9b5_vatismanual: f.vatIsManual,
        cr9b5_allproperties: f.allProperties,
        cr9b5_notes: f.notes,
      }
      if (f.categoryId) rec['cr9b5_CategoryId@odata.bind'] = `/cr9b5_pt_references(${f.categoryId})`
      if (f.contactId) rec['cr9b5_ContactId@odata.bind'] = `/cr9b5_pt_contacts(${f.contactId})`
      if (f.parentFlowId) rec['cr9b5_ParentFlowId@odata.bind'] = `/cr9b5_pt_forecastflows(${f.parentFlowId})`
      if ('id' in f && f.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Cr9b5_pt_forecastflowsService.update(f.id, rec as any)
        return forecastFlowFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_forecastflowsService.create(rec as any)
      return forecastFlowFromRecord(res.data!)
    },
    async remove(id) {
      await Cr9b5_pt_forecastflowsService.delete(id)
    },
  },

  forecastFlowProperties: {
    async list() {
      const res = await Cr9b5_forecastpropertiesService.getAll({ maxPageSize: 5000 })
      return (res.data ?? []).map(forecastFlowPropertyFromRecord)
    },
    async save(fp: ForecastFlowProperty | Omit<ForecastFlowProperty, 'id'>) {
      const rec: Record<string, unknown> = {
        'cr9b5_ForecastFlowId@odata.bind': `/cr9b5_pt_forecastflows(${fp.forecastFlowId})`,
        'cr9b5_PropertyId@odata.bind': `/cr9b5_pt_properties(${fp.propertyId})`,
      }
      if ('id' in fp && fp.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await Cr9b5_forecastpropertiesService.update(fp.id, rec as any)
        return forecastFlowPropertyFromRecord(res.data!)
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_forecastpropertiesService.create(rec as any)
      return forecastFlowPropertyFromRecord(res.data!)
    },
    async remove(id) {
      await Cr9b5_forecastpropertiesService.delete(id)
    },
  },

  invoices: {
    async list() {
      const res = await Cr9b5_pt_invoicesService.getAll({ orderBy: ['cr9b5_date desc'], maxPageSize: 5000 })
      return (res.data ?? []).map(invoiceFromRecord)
    },
    async get(id) {
      const res = await Cr9b5_pt_invoicesService.get(id)
      return res.data ? invoiceFromRecord(res.data) : null
    },
    async nextSequence(year) {
      const res = await Cr9b5_pt_invoicesService.getAll({
        filter: `cr9b5_year eq ${year}`,
        select: ['cr9b5_globalsequence'],
        orderBy: ['cr9b5_globalsequence desc'],
        top: 1,
      })
      const records = res.data ?? []
      return records.length === 0 ? 1 : (records[0].cr9b5_globalsequence ?? 0) + 1
    },
    async create(inv) {
      const rec = invoiceToRecord(inv)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_invoicesService.create(rec as any)
      if (!res.success || !res.data) throw (res.error as Error) ?? new Error('Failed to create invoice.')
      return invoiceFromRecord(res.data)
    },
    async update(id, patch) {
      const rec = invoiceToRecord(patch)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Cr9b5_pt_invoicesService.update(id, rec as any)
      if (!res.success) throw (res.error as Error) ?? new Error('Failed to update invoice.')
      // Dataverse update calls don't reliably return the full record — refetch.
      const fresh = await Cr9b5_pt_invoicesService.get(id)
      return invoiceFromRecord(fresh.data!)
    },
    async cancel(id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Cr9b5_pt_invoicesService.update(id, { statecode: 1 as any, statuscode: 2 as any })
    },
  },

  invoiceComments: {
    async listForInvoice(invoiceId) {
      const res = await Svm_pt_invoicecommentsService.getAll({
        filter: `_svm_invoice_value eq '${invoiceId}'`,
        orderBy: ['createdon desc'],
      })
      return (res.data ?? []).map(invoiceCommentFromRecord)
    },
    async add(invoiceId, comment) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await Svm_pt_invoicecommentsService.create({
        svm_pt_comment: comment,
        'svm_Invoice@odata.bind': `/cr9b5_pt_invoices(${invoiceId})`,
      } as any)
      if (!res.success || !res.data) throw (res.error as Error) ?? new Error('Failed to add comment.')
      return invoiceCommentFromRecord(res.data)
    },
  },

  activityLog: {
    async list() {
      const res = await Cr9b5_pt_activitylogsService.getAll({ orderBy: ['cr9b5_timestamp desc'], maxPageSize: 5000 })
      return (res.data ?? []).map(activityLogFromRecord)
    },
    async record(action, table, recordName, details) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await Cr9b5_pt_activitylogsService.create({
          cr9b5_action: action as any,
          cr9b5_tablemame: table as any,
          cr9b5_timestamp: new Date().toISOString(),
          cr9b5_user: getCurrentUser(),
          cr9b5_recordname: recordName,
          cr9b5_details: details,
        } as any)
      } catch {
        // log failure must never break the app
      }
    },
  },
}
