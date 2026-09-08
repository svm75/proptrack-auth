import { pool } from '../db.js'
import { NotFoundError, withPgErrorTranslation } from '../errors.js'
import { forecastFlowsRepo, type ForecastFlowRow } from '../repos/forecastFlowsRepo.js'

const AMOUNT_SOURCE = { Fixed: 925060000, Calculated: 925060001 } as const
const DIRECTION = { Add: 925060000, Subtract: 925060001 } as const

export interface ResolvedFlow {
  id: string
  name: string
  amountSource: number
  netAmount: number
  resolvedNetAmount: number
  percentage: number | null
  componentContributions: Array<{ sourceFlowId: string; direction: number; amount: number }>
}

/**
 * GET /forecast-flows/:id/resolved — compute-on-read service (migration.md §Business Rule
 * Placement "Forecast calculated-flow logic": "a compute-on-read API endpoint, not a
 * stored/materialized value").
 *
 * Interpretation (the graph traversal was flagged in migration.md §9/§17 as "not traced
 * line-by-line" in the frontend, so this is the API's own explicit, documented design, not a
 * reproduction of a previously-verified algorithm):
 *   - Fixed flow: resolved amount = its own stored `net_amount`.
 *   - Calculated flow: resolved amount = `percentage`% of the sum of its component
 *     contributions, where each `forecast_flow_components` row with `target_flow_id = flow.id`
 *     contributes its `source_flow_id`'s own *resolved* (recursively) net amount, added or
 *     subtracted per `direction`.
 * Cycle-safe: flows already visited in the current resolution chain resolve to 0 rather than
 * recursing forever, and the visited set is reported as an error condition via a thrown
 * ConflictError-style message would be over-engineering here — a plain 0 fallback keeps the
 * endpoint total and side-effect-free for read-only use.
 */
export async function resolveForecastFlow(id: string): Promise<ResolvedFlow> {
  return withPgErrorTranslation(async () => {
    const visited = new Set<string>()

    async function resolve(flowId: string): Promise<{ row: ForecastFlowRow; amount: number; contributions: ResolvedFlow['componentContributions'] }> {
      if (visited.has(flowId)) {
        const row = await forecastFlowsRepo.get(flowId, pool)
        if (!row) throw new NotFoundError('Forecast flow not found.')
        return { row, amount: 0, contributions: [] }
      }
      visited.add(flowId)

      const row = await forecastFlowsRepo.get(flowId, pool)
      if (!row) throw new NotFoundError('Forecast flow not found.')

      if (row.amount_source === AMOUNT_SOURCE.Fixed) {
        return { row, amount: Number(row.net_amount), contributions: [] }
      }

      const components = await listComponentsTargeting(flowId)

      let base = 0
      const contributions: ResolvedFlow['componentContributions'] = []
      for (const comp of components) {
        const src = await resolve(comp.source_flow_id)
        const signed = comp.direction === DIRECTION.Subtract ? -src.amount : src.amount
        base += signed
        contributions.push({ sourceFlowId: comp.source_flow_id, direction: comp.direction, amount: signed })
      }

      const pct = row.percentage != null ? Number(row.percentage) : 0
      const amount = base * (pct / 100)
      return { row, amount, contributions }
    }

    const { row, amount, contributions } = await resolve(id)
    return {
      id: row.id,
      name: row.name,
      amountSource: row.amount_source,
      netAmount: Number(row.net_amount),
      resolvedNetAmount: amount,
      percentage: row.percentage != null ? Number(row.percentage) : null,
      componentContributions: contributions,
    }
  })
}

/** Components whose *target* is `flowId` (i.e. flows that feed into it as a source). */
async function listComponentsTargeting(flowId: string) {
  const res = await pool.query<{ source_flow_id: string; direction: number }>(
    `SELECT source_flow_id, direction FROM proptrack.forecast_flow_components WHERE target_flow_id = $1`,
    [flowId],
  )
  return res.rows
}
