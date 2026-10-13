import { Router } from 'express'
import type { Executor } from '../db.js'
import { NotFoundError } from '../errors.js'
import { asyncRoute } from './helpers.js'

interface Crud<Row> {
  list: (exec?: Executor) => Promise<Row[]>
  get: (id: string, exec?: Executor) => Promise<Row | null>
  create: (row: Partial<Row>, exec?: Executor) => Promise<Row>
  update: (id: string, row: Partial<Row>, exec?: Executor) => Promise<Row | null>
  remove: (id: string, exec?: Executor) => Promise<void>
}

/** Builds standard list/get/create/update/delete routes for a simple table repo. Used for the
 * tables with no bespoke business logic beyond CRUD (migration.md §API Architecture: "standard
 * CRUD per table"). */
export function makeCrudRoutes<Row>(repo: Crud<Row>, { allowDelete = true }: { allowDelete?: boolean } = {}) {
  const router = Router()

  router.get('/', asyncRoute(async (_req, res) => {
    res.json(await repo.list())
  }))

  router.get('/:id', asyncRoute(async (req, res) => {
    const row = await repo.get(req.params.id)
    if (!row) throw new NotFoundError()
    res.json(row)
  }))

  router.post('/', asyncRoute(async (req, res) => {
    const row = await repo.create(req.body ?? {})
    res.status(201).json(row)
  }))

  router.put('/:id', asyncRoute(async (req, res) => {
    const row = await repo.update(req.params.id, req.body ?? {})
    if (!row) throw new NotFoundError()
    res.json(row)
  }))

  if (allowDelete) {
    router.delete('/:id', asyncRoute(async (req, res) => {
      await repo.remove(req.params.id)
      res.status(204).end()
    }))
  }

  return router
}
