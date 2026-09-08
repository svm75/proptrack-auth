import { Router } from 'express'
import { propertiesRepo } from '../repos/propertiesRepo.js'
import { checkPropertyDeletable } from '../services/deletionService.js'
import { makeCrudRoutes } from './crudRoutes.js'
import { asyncRoute } from './helpers.js'
import { NotFoundError } from '../errors.js'

export const propertiesRouter = Router()

propertiesRouter.use('/', makeCrudRoutes(propertiesRepo))

// GET /properties/:id/deletable — friendly pre-check, migration.md §Business Rule Placement.
propertiesRouter.get('/:id/deletable', asyncRoute(async (req, res) => {
  const property = await propertiesRepo.get(req.params.id)
  if (!property) throw new NotFoundError()
  res.json(await checkPropertyDeletable(req.params.id))
}))
