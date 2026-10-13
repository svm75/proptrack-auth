import { Router } from 'express'
import { forecastFlowsRepo } from '../repos/forecastFlowsRepo.js'
import { resolveForecastFlow } from '../services/forecastService.js'
import { makeCrudRoutes } from './crudRoutes.js'
import { asyncRoute } from './helpers.js'
import { NotFoundError } from '../errors.js'

export const forecastFlowsRouter = Router()

forecastFlowsRouter.use('/', makeCrudRoutes(forecastFlowsRepo))

// GET /forecast-flows/:id/resolved — compute-on-read (migration.md §Business Rule Placement
// "Forecast calculated-flow logic").
forecastFlowsRouter.get('/:id/resolved', asyncRoute(async (req, res) => {
  const row = await forecastFlowsRepo.get(req.params.id)
  if (!row) throw new NotFoundError()
  res.json(await resolveForecastFlow(req.params.id))
}))
