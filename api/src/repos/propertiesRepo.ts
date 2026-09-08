import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'
import { findAll, findById, removeById } from './base.js'

export interface PropertyRow {
  id: string
  name: string
  short_id: string
  address: string | null
  notes: string | null
  google_drive_folder_id: string | null
  created_at: string
  updated_at: string
}

export type NewPropertyRow = Omit<PropertyRow, 'id' | 'created_at' | 'updated_at'>

export const propertiesRepo = {
  list: (exec?: Executor) => findAll<PropertyRow>('properties', 'name ASC', exec),
  get: (id: string, exec?: Executor) => findById<PropertyRow>('properties', id, exec),

  create(row: Partial<PropertyRow>, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<PropertyRow>(
        `INSERT INTO proptrack.properties (name, short_id, address, notes, google_drive_folder_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [row.name, row.short_id, row.address ?? null, row.notes ?? null, row.google_drive_folder_id ?? null],
      )
      return res.rows[0]
    })
  },

  update(id: string, row: Partial<NewPropertyRow>, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<PropertyRow>(
        `UPDATE proptrack.properties SET
           name = COALESCE($2, name),
           short_id = COALESCE($3, short_id),
           address = COALESCE($4, address),
           notes = COALESCE($5, notes),
           google_drive_folder_id = COALESCE($6, google_drive_folder_id),
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, row.name, row.short_id, row.address, row.notes, row.google_drive_folder_id],
      )
      return res.rows[0] ?? null
    })
  },

  remove: (id: string, exec?: Executor) => removeById('properties', id, exec),

  /** Backing query for GET /properties/:id/deletable (migration.md §Business Rule Placement
   * "Property deletion protection … now also a real FK" — this endpoint gives a friendly
   * message before the client even attempts a delete that would otherwise hit 23503). */
  async invoiceCount(id: string, exec: Executor = pool): Promise<number> {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM proptrack.invoices WHERE property_id = $1`,
        [id],
      )
      return Number(res.rows[0]?.count ?? '0')
    })
  },

  async supplierContractCount(id: string, exec: Executor = pool): Promise<number> {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM proptrack.supplier_contracts WHERE property_id = $1`,
        [id],
      )
      return Number(res.rows[0]?.count ?? '0')
    })
  },
}
