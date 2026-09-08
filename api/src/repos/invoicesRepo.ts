import type { Executor } from '../db.js'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'

export interface InvoiceRow {
  id: string
  internal_id: string | null
  global_sequence: number | null
  year: number
  type: number
  invoice_date: string
  description: string | null
  property_id: string | null
  all_properties: boolean
  contact_id: string | null
  category_id: string | null
  base_amount: string
  tax_amount: string
  total_gross: string
  tax_rate: string | null
  tax_is_manual: boolean
  booking_reference: string | null
  check_in: string | null
  check_out: string | null
  nights: number | null
  days: number | null
  adults: number | null
  children: number | null
  babies: number | null
  google_drive_folder_id: string | null
  is_cancelled: boolean
  is_flagged_anomaly: boolean
  created_at: string
  updated_at: string
}

export type NewInvoiceRow = Omit<InvoiceRow, 'id' | 'is_cancelled' | 'is_flagged_anomaly' | 'created_at' | 'updated_at'>

const INSERT_COLS = [
  'internal_id', 'global_sequence', 'year', 'type', 'invoice_date', 'description', 'property_id',
  'all_properties', 'contact_id', 'category_id', 'base_amount', 'tax_amount', 'total_gross',
  'tax_rate', 'tax_is_manual', 'booking_reference', 'check_in', 'check_out', 'nights', 'days',
  'adults', 'children', 'babies', 'google_drive_folder_id',
] as const

export const invoicesRepo = {
  list(filters: { propertyId?: string; type?: number; from?: string; to?: string } = {}, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const clauses: string[] = []
      const values: unknown[] = []
      if (filters.propertyId) { values.push(filters.propertyId); clauses.push(`property_id = $${values.length}`) }
      if (filters.type != null) { values.push(filters.type); clauses.push(`type = $${values.length}`) }
      if (filters.from) { values.push(filters.from); clauses.push(`invoice_date >= $${values.length}`) }
      if (filters.to) { values.push(filters.to); clauses.push(`invoice_date <= $${values.length}`) }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const res = await exec.query<InvoiceRow>(`SELECT * FROM proptrack.invoices ${where} ORDER BY invoice_date DESC`, values)
      return res.rows
    })
  },

  get(id: string, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<InvoiceRow>(`SELECT * FROM proptrack.invoices WHERE id = $1`, [id])
      return res.rows[0] ?? null
    })
  },

  /**
   * Next free `global_sequence` for a year, transaction-scoped with a row lock so two
   * concurrent invoice creations can't race to the same number (migration.md §Business Rule
   * Placement "Invoice internal-ID sequencing"). Must be called with a client already inside a
   * transaction (`withTransaction`) — takes an advisory lock keyed on the year so the
   * read-then-insert is atomic even though `global_sequence` has no DB sequence object backing
   * it (the compound "ABC001/2026" format is built at the API layer, not by a DB sequence).
   */
  async nextSequence(year: number, client: PoolClient): Promise<number> {
    return withPgErrorTranslation(async () => {
      // Advisory lock scoped to (table, year) — released automatically at COMMIT/ROLLBACK.
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [hashTag('invoice_sequence'), year])
      const res = await client.query<{ max_seq: number | null }>(
        `SELECT max(global_sequence) AS max_seq FROM proptrack.invoices WHERE year = $1`,
        [year],
      )
      return (res.rows[0]?.max_seq ?? 0) + 1
    })
  },

  create(row: NewInvoiceRow, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const values = INSERT_COLS.map((c) => (row as Record<string, unknown>)[c] ?? null)
      const placeholders = INSERT_COLS.map((_, i) => `$${i + 1}`).join(', ')
      const res = await exec.query<InvoiceRow>(
        `INSERT INTO proptrack.invoices (${INSERT_COLS.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values,
      )
      return res.rows[0]
    })
  },

  update(id: string, row: Partial<NewInvoiceRow>, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const presentCols = INSERT_COLS.filter((c) => Object.prototype.hasOwnProperty.call(row, c))
      if (presentCols.length === 0) {
        const res = await exec.query<InvoiceRow>(`SELECT * FROM proptrack.invoices WHERE id = $1`, [id])
        return res.rows[0] ?? null
      }
      const setClause = presentCols.map((c, i) => `${c} = $${i + 2}`).join(', ')
      const values = presentCols.map((c) => (row as Record<string, unknown>)[c] ?? null)
      const res = await exec.query<InvoiceRow>(
        `UPDATE proptrack.invoices SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
        [id, ...values],
      )
      return res.rows[0] ?? null
    })
  },

  /** Soft-delete only. There is deliberately no `remove`/hard-delete method on this repo — the
   * API must never expose a hard-delete route for invoices (migration.md §Business Rule
   * Placement "Invoice soft-delete"). */
  cancel(id: string, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<InvoiceRow>(
        `UPDATE proptrack.invoices SET is_cancelled = true, updated_at = now() WHERE id = $1 RETURNING *`,
        [id],
      )
      return res.rows[0] ?? null
    })
  },
}

/** Deterministic 32-bit tag for pg_advisory_xact_lock's first key, from a fixed string. */
function hashTag(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
