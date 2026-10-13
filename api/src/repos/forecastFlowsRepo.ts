import { makeCrudRepo } from './genericRepo.js'

export interface ForecastFlowRow {
  id: string
  name: string
  type: number
  frequency: number
  days_of_week: string | null
  start_date: string
  end_date: string | null
  net_amount: string
  vat_amount: string
  gross_amount: string
  vat_rate: string | null
  vat_is_manual: boolean
  all_properties: boolean
  category_id: string | null
  contact_id: string | null
  parent_flow_id: string | null
  amount_source: number
  percentage: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export const forecastFlowsRepo = makeCrudRepo<ForecastFlowRow>('forecast_flows', [
  'name', 'type', 'frequency', 'days_of_week', 'start_date', 'end_date', 'net_amount',
  'vat_amount', 'gross_amount', 'vat_rate', 'vat_is_manual', 'all_properties', 'category_id',
  'contact_id', 'parent_flow_id', 'amount_source', 'percentage', 'notes',
])
