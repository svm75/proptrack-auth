import { makeCrudRepo } from './genericRepo.js'

export interface SupplierContractRow {
  id: string
  contact_id: string
  property_id: string | null
  all_properties: boolean
  contract_count: number
  default_category_id: string | null
  default_description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export const supplierContractsRepo = makeCrudRepo<SupplierContractRow>('supplier_contracts', [
  'contact_id', 'property_id', 'all_properties', 'contract_count', 'default_category_id', 'default_description', 'active',
])
