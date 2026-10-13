import { Router } from 'express'
import { activityLogsRepo } from '../repos/activityLogsRepo.js'
import { asyncRoute } from './helpers.js'

export const activityLogsRouter = Router()

// Read-only — Activity Log is append-only (migration.md §Business Rule Placement); the API
// never exposes update/delete routes for it. Writes happen only as a side effect of other
// mutations' transactions (see services/invoiceService.ts and similar).
activityLogsRouter.get('/', asyncRoute(async (req, res) => {
  const { action, tableName, from, to } = req.query
  const rows = await activityLogsRepo.list({
    action: typeof action === 'string' ? Number(action) : undefined,
    tableName: typeof tableName === 'string' ? Number(tableName) : undefined,
    from: typeof from === 'string' ? from : undefined,
    to: typeof to === 'string' ? to : undefined,
  })
  res.json(rows)
}))
