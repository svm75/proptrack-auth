import type { QueryResultRow } from 'pg'
import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'

/** Generic parameterized SELECT/DELETE helpers shared by the per-table repos. All SQL text
 * here is static; every value is passed as a `$n` placeholder — never string-interpolated. */

export async function findAll<T extends QueryResultRow>(table: string, orderBy = 'created_at ASC', exec: Executor = pool): Promise<T[]> {
  return withPgErrorTranslation(async () => {
    const res = await exec.query<T>(`SELECT * FROM proptrack.${table} ORDER BY ${orderBy}`)
    return res.rows
  })
}

export async function findById<T extends QueryResultRow>(table: string, id: string, exec: Executor = pool): Promise<T | null> {
  return withPgErrorTranslation(async () => {
    const res = await exec.query<T>(`SELECT * FROM proptrack.${table} WHERE id = $1`, [id])
    return res.rows[0] ?? null
  })
}

export async function removeById(table: string, id: string, exec: Executor = pool): Promise<void> {
  return withPgErrorTranslation(async () => {
    await exec.query(`DELETE FROM proptrack.${table} WHERE id = $1`, [id])
  })
}

/** Builds `col1, col2, ...` / `$1, $2, ...` / `col1 = $1, col2 = $2` fragments for a row object,
 * used by the per-table insert/update helpers below so no repo hand-writes column lists twice. */
export function buildInsert(cols: string[]) {
  const columns = cols.join(', ')
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  return { columns, placeholders }
}

export function buildUpdateSet(cols: string[], startAt = 1) {
  return cols.map((c, i) => `${c} = $${i + startAt}`).join(', ')
}
