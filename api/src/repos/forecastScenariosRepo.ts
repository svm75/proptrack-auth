import { makeCrudRepo } from './genericRepo.js'

export interface ForecastScenarioRow {
  id: string
  name: string
  property_id: string | null
  income_adjustment_pct: string
  expense_adjustment_pct: string
  notes: string | null
  created_at: string
  updated_at: string
}

export const forecastScenariosRepo = makeCrudRepo<ForecastScenarioRow>('forecast_scenarios', [
  'name', 'property_id', 'income_adjustment_pct', 'expense_adjustment_pct', 'notes',
])
