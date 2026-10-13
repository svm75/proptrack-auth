import { Router } from 'express'
import { invoicesRepo } from '../repos/invoicesRepo.js'
import { createInvoice, updateInvoice, cancelInvoice } from '../services/invoiceService.js'
import { asyncRoute, userNameFrom } from './helpers.js'
import { NotFoundError, ValidationError } from '../errors.js'

export const invoicesRouter = Router()

invoicesRouter.get('/', asyncRoute(async (req, res) => {
  const { propertyId, type, from, to } = req.query
  const rows = await invoicesRepo.list({
    propertyId: typeof propertyId === 'string' ? propertyId : undefined,
    type: typeof type === 'string' ? Number(type) : undefined,
    from: typeof from === 'string' ? from : undefined,
    to: typeof to === 'string' ? to : undefined,
  })
  res.json(rows)
}))

// GET /invoices/next-internal-id?propertyId=&year= — read-only preview, does not consume the
// sequence (the real allocation happens transactionally inside createInvoice).
invoicesRouter.get('/next-internal-id', asyncRoute(async (req, res) => {
  const year = Number(req.query.year)
  if (!year) throw new ValidationError('year query parameter is required.')
  const rows = await invoicesRepo.list({})
  const maxSeq = rows.filter((r) => r.year === year).reduce((m, r) => Math.max(m, r.global_sequence ?? 0), 0)
  res.json({ nextSequence: maxSeq + 1 })
}))

invoicesRouter.get('/:id', asyncRoute(async (req, res) => {
  const row = await invoicesRepo.get(req.params.id)
  if (!row) throw new NotFoundError()
  res.json(row)
}))

invoicesRouter.post('/', asyncRoute(async (req, res) => {
  const { skipInternalId, ...invoice } = req.body ?? {}
  const created = await createInvoice({ invoice, skipInternalId: !!skipInternalId, userName: userNameFrom(req) })
  res.status(201).json(created)
}))

invoicesRouter.put('/:id', asyncRoute(async (req, res) => {
  const { changedFieldsSummary, ...patch } = req.body ?? {}
  const updated = await updateInvoice(req.params.id, patch, userNameFrom(req), changedFieldsSummary)
  if (!updated) throw new NotFoundError()
  res.json(updated)
}))

// Soft-delete only — there is deliberately no DELETE /invoices/:id route (migration.md
// §Business Rule Placement "Invoice soft-delete": "the API must never expose a hard-delete
// route for invoices, only an update route that flips is_cancelled").
invoicesRouter.post('/:id/cancel', asyncRoute(async (req, res) => {
  const cancelled = await cancelInvoice(req.params.id, userNameFrom(req))
  if (!cancelled) throw new NotFoundError()
  res.json(cancelled)
}))
