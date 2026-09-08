import { Router } from 'express'
import { invoiceCommentsRepo } from '../repos/invoiceCommentsRepo.js'
import { asyncRoute, userNameFrom } from './helpers.js'
import { ValidationError } from '../errors.js'

export const invoiceCommentsRouter = Router()

invoiceCommentsRouter.get('/', asyncRoute(async (req, res) => {
  const invoiceId = req.query.invoiceId
  if (typeof invoiceId !== 'string') throw new ValidationError('invoiceId query parameter is required.')
  res.json(await invoiceCommentsRepo.listForInvoice(invoiceId))
}))

invoiceCommentsRouter.post('/', asyncRoute(async (req, res) => {
  const { invoiceId, comment } = req.body ?? {}
  if (!invoiceId || !comment) throw new ValidationError('invoiceId and comment are required.')
  const row = await invoiceCommentsRepo.add(invoiceId, comment, userNameFrom(req) ?? null)
  res.status(201).json(row)
}))
