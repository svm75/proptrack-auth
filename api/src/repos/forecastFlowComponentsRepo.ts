import type { Executor } from '../db.js'
import { pool } from '../db.js'
import { withPgErrorTranslation } from '../errors.js'
import { makeCrudRepo } from './genericRepo.js'

export interface ForecastFlowComponentRow {
  id: string
  name: string | null
  source_flow_id: string
  target_flow_id: string
  direction: number
  created_at: string
  updated_at: string
}

const base = makeCrudRepo<ForecastFlowComponentRow>('forecast_flow_components', [
  'name', 'source_flow_id', 'target_flow_id', 'direction',
])

/** All components where `flowId` is the source — used by the forecast resolution service to
 * walk the amount graph (migration.md §Business Rule Placement "Forecast calculated-flow logic"). */
async function listBySourceFlow(flowId: string, exec: Executor = pool): Promise<ForecastFlowComponentRow[]> {
  return withPgErrorTranslation(async () => {
    const res = await exec.query<ForecastFlowComponentRow>(
      `SELECT * FROM proptrack.forecast_flow_components WHERE source_flow_id = $1`,
      [flowId],
    )
    return res.rows
  })
}

export const forecastFlowComponentsRepo = { ...base, listBySourceFlow }
