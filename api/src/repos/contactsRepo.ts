import { makeCrudRepo } from './genericRepo.js'

export interface ContactRow {
  id: string
  name: string
  role: number
  email: string | null
  tax_id: string | null
  default_description: string | null
  regular_supplier: boolean
  default_category_id: string | null
  created_at: string
  updated_at: string
}

export const contactsRepo = makeCrudRepo<ContactRow>(
  'contacts',
  ['name', 'role', 'email', 'tax_id', 'default_description', 'regular_supplier', 'default_category_id'],
  'name ASC',
)
