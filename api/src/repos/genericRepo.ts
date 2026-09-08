import type { QueryResultRow } from 'pg'
import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'
import { findAll, findById, removeById } from './base.js'

/**
 * Generic parameterized CRUD builder for the simpler tables (no bespoke queries beyond
 * list/get/create/update/remove). Column names are fixed, code-controlled string literals
 * (never derived from request input) — only row *values* are passed as `$n` placeholders, so
 * this stays within the "no string interpolation of values" constraint.
 */
export function makeCrudRepo<Row extends QueryResultRow & { id: string }>(table: string, columns: string[], orderBy = 'created_at ASC') {
  return {
    list: (exec?: Executor) => findAll<Row>(table, orderBy, exec),
    get: (id: string, exec?: Executor) => findById<Row>(table, id, exec),
    remove: (id: string, exec?: Executor) => removeById(table, id, exec),

    create(row: Partial<Row>, exec: Executor = pool) {
      return withPgErrorTranslation(async () => {
        const values = columns.map((c) => (row as Record<string, unknown>)[c] ?? null)
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
        const res = await exec.query<Row>(
          `INSERT INTO proptrack.${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
          values,
        )
        return res.rows[0]
      })
    },

    update(id: string, row: Partial<Row>, exec: Executor = pool) {
      return withPgErrorTranslation(async () => {
        const presentCols = columns.filter((c) => Object.prototype.hasOwnProperty.call(row, c))
        if (presentCols.length === 0) {
          const res = await exec.query<Row>(`SELECT * FROM proptrack.${table} WHERE id = $1`, [id])
          return res.rows[0] ?? null
        }
        const setClause = presentCols.map((c, i) => `${c} = $${i + 2}`).join(', ')
        const values = presentCols.map((c) => (row as Record<string, unknown>)[c] ?? null)
        const res = await exec.query<Row>(
          `UPDATE proptrack.${table} SET ${setClause}, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, ...values],
        )
        return res.rows[0] ?? null
      })
    },
  }
}
