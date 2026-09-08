import { makeCrudRepo } from './genericRepo.js'

export interface ForecastFlowPropertyRow {
  id: string
  name: string | null
  forecast_flow_id: string
  property_id: string
  created_at: string
  updated_at: string
}

export const forecastFlowPropertiesRepo = makeCrudRepo<ForecastFlowPropertyRow>(
  'forecast_flow_properties',
  ['name', 'forecast_flow_id', 'property_id'],
)
