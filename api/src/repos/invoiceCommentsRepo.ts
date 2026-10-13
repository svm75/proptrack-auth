import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'

export interface InvoiceCommentRow {
  id: string
  invoice_id: string
  name: string | null
  comment: string
  created_by: string | null
  created_at: string
}

export const invoiceCommentsRepo = {
  listForInvoice(invoiceId: string, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<InvoiceCommentRow>(
        `SELECT * FROM proptrack.invoice_comments WHERE invoice_id = $1 ORDER BY created_at DESC`,
        [invoiceId],
      )
      return res.rows
    })
  },

  add(invoiceId: string, comment: string, createdBy: string | null, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<InvoiceCommentRow>(
        `INSERT INTO proptrack.invoice_comments (invoice_id, comment, created_by) VALUES ($1, $2, $3) RETURNING *`,
        [invoiceId, comment, createdBy],
      )
      return res.rows[0]
    })
  },
}
