import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'
import { makeCrudRepo } from './genericRepo.js'

export interface ReferenceDataRow {
  id: string
  value: string
  reference_type: number
  sort_order: number | null
  created_at: string
  updated_at: string
}

const base = makeCrudRepo<ReferenceDataRow>('reference_data', ['value', 'reference_type', 'sort_order'], 'sort_order ASC NULLS LAST, value ASC')

/** GET /reference-data/:id/usage-count — reference_data is referenced from 5 tables with a mix
 * of RESTRICT/SET NULL FKs (migration.md §Business Rule Placement), so "in use" is computed here
 * as an explicit aggregate rather than relying on a single DB constraint. */
async function usageCount(id: string, exec: Executor = pool): Promise<{ total: number; byTable: Record<string, number> }> {
  return withPgErrorTranslation(async () => {
    const queries: Array<[string, string]> = [
      ['invoices', 'category_id'],
      ['supplier_contracts', 'default_category_id'],
      ['contacts', 'default_category_id'],
      ['invoice_templates', 'category_id'],
      ['forecast_flows', 'category_id'],
    ]
    const byTable: Record<string, number> = {}
    let total = 0
    for (const [table, col] of queries) {
      const res = await exec.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM proptrack.${table} WHERE ${col} = $1`,
        [id],
      )
      const n = Number(res.rows[0]?.count ?? '0')
      byTable[table] = n
      total += n
    }
    return { total, byTable }
  })
}

export const referenceDataRepo = { ...base, usageCount }
