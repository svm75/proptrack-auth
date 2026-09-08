import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'

export interface ActivityLogRow {
  id: string
  log_id: string | null
  action: number
  table_name: number
  record_name: string | null
  details: string | null
  occurred_at: string
  user_name: string | null
  created_at: string
}

export const activityLogsRepo = {
  list(filters: { action?: number; tableName?: number; from?: string; to?: string } = {}, exec: Executor = pool) {
    return withPgErrorTranslation(async () => {
      const clauses: string[] = []
      const values: unknown[] = []
      if (filters.action != null) { values.push(filters.action); clauses.push(`action = $${values.length}`) }
      if (filters.tableName != null) { values.push(filters.tableName); clauses.push(`table_name = $${values.length}`) }
      if (filters.from) { values.push(filters.from); clauses.push(`occurred_at >= $${values.length}`) }
      if (filters.to) { values.push(filters.to); clauses.push(`occurred_at <= $${values.length}`) }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const res = await exec.query<ActivityLogRow>(
        `SELECT * FROM proptrack.activity_logs ${where} ORDER BY occurred_at DESC`,
        values,
      )
      return res.rows
    })
  },

  /** Write-on-mutation Activity Log helper (migration.md §Business Rule Placement) — called
   * explicitly at each mutation's call site, inside the same transaction as the mutation, never
   * a DB trigger. Must be passed the transaction's client (`exec`) to actually be atomic with
   * the mutation it's logging. */
  record(
    entry: { action: number; tableName: number; recordName: string; details?: string; userName?: string },
    exec: Executor = pool,
  ) {
    return withPgErrorTranslation(async () => {
      const res = await exec.query<ActivityLogRow>(
        `INSERT INTO proptrack.activity_logs (action, table_name, record_name, details, occurred_at, user_name)
         VALUES ($1, $2, $3, $4, now(), $5) RETURNING *`,
        [entry.action, entry.tableName, entry.recordName, entry.details ?? null, entry.userName ?? 'Unknown'],
      )
      return res.rows[0]
    })
  },
}
