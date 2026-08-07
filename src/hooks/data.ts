import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { repositories as repo } from '@/data'
import type {
  Property, Contact, SupplierContract, InvoiceTemplate, Attachment, ForecastFlow, ForecastFlowProperty,
  NewInvoice, ActivityAction, ActivityTable,
} from '@/domain/types'

// ---------- simple CrudOps-backed entities ----------

export const useProperties = () => useQuery({ queryKey: ['properties'], queryFn: () => repo.properties.list() })
export const useContacts = () => useQuery({ queryKey: ['contacts'], queryFn: () => repo.contacts.list() })
export const useSupplierContracts = () => useQuery({ queryKey: ['supplierContracts'], queryFn: () => repo.supplierContracts.list() })
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => repo.categories.list() })
export const useInvoiceTemplates = () => useQuery({ queryKey: ['invoiceTemplates'], queryFn: () => repo.invoiceTemplates.list() })
export const useAttachments = () => useQuery({ queryKey: ['attachments'], queryFn: () => repo.attachments.list() })
export const useForecastFlows = () => useQuery({ queryKey: ['forecastFlows'], queryFn: () => repo.forecastFlows.list() })
export const useForecastFlowProperties = () => useQuery({ queryKey: ['forecastFlowProperties'], queryFn: () => repo.forecastFlowProperties.list() })

export function useSaveProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Property | Omit<Property, 'id'>) => repo.properties.save(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  })
}
export function useDeleteProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.properties.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['properties'] }),
  })
}

export function useSaveContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: Contact | Omit<Contact, 'id'>) => repo.contacts.save(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}
export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.contacts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

export function useSaveSupplierContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: SupplierContract | Omit<SupplierContract, 'id'>) => repo.supplierContracts.save(c),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplierContracts'] }),
  })
}
export function useDeleteSupplierContract() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.supplierContracts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplierContracts'] }),
  })
}

export function useSaveInvoiceTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (t: InvoiceTemplate | Omit<InvoiceTemplate, 'id'>) => repo.invoiceTemplates.save(t),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoiceTemplates'] }),
  })
}
export function useDeleteInvoiceTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.invoiceTemplates.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoiceTemplates'] }),
  })
}

export function useSaveAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Attachment | Omit<Attachment, 'id'>) => repo.attachments.save(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments'] }),
  })
}
export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.attachments.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments'] }),
  })
}

export function useSaveForecastFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (f: ForecastFlow | Omit<ForecastFlow, 'id'>) => repo.forecastFlows.save(f),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecastFlows'] }),
  })
}
export function useDeleteForecastFlow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.forecastFlows.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecastFlows'] }),
  })
}

export function useSaveForecastFlowProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fp: ForecastFlowProperty | Omit<ForecastFlowProperty, 'id'>) => repo.forecastFlowProperties.save(fp),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecastFlowProperties'] }),
  })
}
export function useDeleteForecastFlowProperty() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.forecastFlowProperties.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecastFlowProperties'] }),
  })
}

// ---------- invoices ----------

export const useInvoices = () => useQuery({ queryKey: ['invoices'], queryFn: () => repo.invoices.list() })
export const useInvoice = (id: string | null) =>
  useQuery({ queryKey: ['invoices', id], queryFn: () => repo.invoices.get(id!), enabled: !!id })

export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (inv: NewInvoice) => repo.invoices.create(inv),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<NewInvoice> }) => repo.invoices.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.invoices.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
export function useNextInvoiceSequence() {
  return useMutation({ mutationFn: (year: number) => repo.invoices.nextSequence(year) })
}

// ---------- invoice comments ----------

export const useInvoiceComments = (invoiceId: string | null) =>
  useQuery({ queryKey: ['invoiceComments', invoiceId], queryFn: () => repo.invoiceComments.listForInvoice(invoiceId!), enabled: !!invoiceId })

export function useAddInvoiceComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, comment }: { invoiceId: string; comment: string }) => repo.invoiceComments.add(invoiceId, comment),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['invoiceComments', vars.invoiceId] }),
  })
}

// ---------- activity log ----------

export const useActivityLog = () => useQuery({ queryKey: ['activityLog'], queryFn: () => repo.activityLog.list() })

export function useRecordActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, table, recordName, details }: { action: ActivityAction; table: ActivityTable; recordName: string; details?: string }) =>
      repo.activityLog.record(action, table, recordName, details),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activityLog'] }),
  })
}
