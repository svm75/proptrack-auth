import { Router } from 'express'
import { referenceDataRepo } from '../repos/referenceDataRepo.js'
import { checkReferenceDataUsage } from '../services/deletionService.js'
import { makeCrudRoutes } from './crudRoutes.js'
import { asyncRoute } from './helpers.js'
import { NotFoundError } from '../errors.js'

export const referenceDataRouter = Router()

referenceDataRouter.use('/', makeCrudRoutes(referenceDataRepo))

// GET /reference-data/:id/usage-count — migration.md §Business Rule Placement
// "Reference-data deletion protection".
referenceDataRouter.get('/:id/usage-count', asyncRoute(async (req, res) => {
  const row = await referenceDataRepo.get(req.params.id)
  if (!row) throw new NotFoundError()
  res.json(await checkReferenceDataUsage(req.params.id))
}))
