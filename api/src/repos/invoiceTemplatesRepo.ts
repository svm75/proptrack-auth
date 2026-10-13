import { makeCrudRepo } from './genericRepo.js'

export interface InvoiceTemplateRow {
  id: string
  name: string
  type: number
  category_id: string | null
  description: string | null
  default_amount: string | null
  created_at: string
  updated_at: string
}

export const invoiceTemplatesRepo = makeCrudRepo<InvoiceTemplateRow>(
  'invoice_templates',
  ['name', 'type', 'category_id', 'description', 'default_amount'],
  'name ASC',
)
