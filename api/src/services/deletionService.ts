import { propertiesRepo } from '../repos/propertiesRepo.js'
import { referenceDataRepo } from '../repos/referenceDataRepo.js'

export interface DeletableResult {
  deletable: boolean
  reason?: string
  invoiceCount: number
  supplierContractCount: number
}

/** GET /properties/:id/deletable — friendly pre-check ahead of the real
 * `invoices.property_id … ON DELETE RESTRICT` FK (migration.md §Business Rule Placement
 * "Property deletion protection"), matching src/screens/Properties.tsx's existing wording:
 * `Cannot delete — "<name>" has <n> invoice(s).` */
export async function checkPropertyDeletable(propertyId: string): Promise<DeletableResult> {
  const [invoiceCount, supplierContractCount] = await Promise.all([
    propertiesRepo.invoiceCount(propertyId),
    propertiesRepo.supplierContractCount(propertyId),
  ])
  if (invoiceCount > 0) {
    return { deletable: false, reason: `Cannot delete — this property has ${invoiceCount} invoice(s).`, invoiceCount, supplierContractCount }
  }
  if (supplierContractCount > 0) {
    return { deletable: false, reason: `Cannot delete — this property has ${supplierContractCount} supplier contract(s).`, invoiceCount, supplierContractCount }
  }
  return { deletable: true, invoiceCount, supplierContractCount }
}

export interface UsageResult {
  inUse: boolean
  total: number
  byTable: Record<string, number>
}

/** GET /reference-data/:id/usage-count — matches src/screens/Admin.tsx's "In use — cannot
 * delete" badge/disable behavior. */
export async function checkReferenceDataUsage(referenceDataId: string): Promise<UsageResult> {
  const { total, byTable } = await referenceDataRepo.usageCount(referenceDataId)
  return { inUse: total > 0, total, byTable }
}
