import express from 'express'
import { contactsRepo } from './repos/contactsRepo.js'
import { supplierContractsRepo } from './repos/supplierContractsRepo.js'
import { invoiceTemplatesRepo } from './repos/invoiceTemplatesRepo.js'
import { attachmentsRepo } from './repos/attachmentsRepo.js'
import { ownerOccupanciesRepo } from './repos/ownerOccupanciesRepo.js'
import { forecastFlowPropertiesRepo } from './repos/forecastFlowPropertiesRepo.js'
import { forecastScenariosRepo } from './repos/forecastScenariosRepo.js'
import { forecastFlowComponentsRepo } from './repos/forecastFlowComponentsRepo.js'
import { makeCrudRoutes } from './routes/crudRoutes.js'
import { propertiesRouter } from './routes/propertiesRoutes.js'
import { referenceDataRouter } from './routes/referenceDataRoutes.js'
import { invoicesRouter } from './routes/invoicesRoutes.js'
import { invoiceCommentsRouter } from './routes/invoiceCommentsRoutes.js'
import { activityLogsRouter } from './routes/activityLogsRoutes.js'
import { forecastFlowsRouter } from './routes/forecastFlowsRoutes.js'
import { documentsRouter } from './routes/documentsRoutes.js'
import { requireToken } from './auth.js'
import { ApiError } from './errors.js'
import { ping } from './db.js'

// Step 9 (production cutover): the frontend is hosted by Power Platform, a different origin
// from this API — browsers enforce CORS on that cross-origin fetch, so it must be handled here
// explicitly (this was previously untested, since local dev only ever hit the API same-origin
// via curl). Allowlist, not a wildcard: ALLOWED_ORIGIN is a comma-separated exact-origin list
// (matching the wealth-ledger/TripOrganiser convention), reflected only on a match — never `*`,
// since credentials (the bearer token) are sent on these requests.
function corsMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const allowed = (process.env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.origin
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  next()
}

export function createApp() {
  const app = express()
  app.use(corsMiddleware)
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.get('/health/db', (_req, res, next) => {
    ping().then((ok) => res.json({ db: ok })).catch(next)
  })

  app.use(requireToken)

  // Composite / bespoke-logic resources.
  app.use('/properties', propertiesRouter)
  app.use('/reference-data', referenceDataRouter)
  app.use('/invoices', invoicesRouter)
  app.use('/invoice-comments', invoiceCommentsRouter)
  app.use('/activity-logs', activityLogsRouter)
  app.use('/forecast-flows', forecastFlowsRouter)
  // NAS-native document storage (final migration addendum) — folder browse/create, upload,
  // download, delete. Filesystem access is strictly confined to DOCUMENTS_ROOT; see
  // api/src/documents/paths.ts. Sits behind requireToken like every route above/below it.
  app.use('/documents', documentsRouter)

  // Plain CRUD resources.
  app.use('/contacts', makeCrudRoutes(contactsRepo))
  app.use('/supplier-contracts', makeCrudRoutes(supplierContractsRepo))
  app.use('/invoice-templates', makeCrudRoutes(invoiceTemplatesRepo))
  app.use('/attachments', makeCrudRoutes(attachmentsRepo))
  app.use('/owner-occupancies', makeCrudRoutes(ownerOccupanciesRepo))
  app.use('/forecast-flow-properties', makeCrudRoutes(forecastFlowPropertiesRepo))
  app.use('/forecast-scenarios', makeCrudRoutes(forecastScenariosRepo))
  app.use('/forecast-flow-components', makeCrudRoutes(forecastFlowComponentsRepo))

  // Central error handler — translates ApiError subclasses to the right HTTP status; anything
  // else is a 500 with no internal detail leaked to the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.code, message: err.message })
      return
    }
    console.error('[api] unhandled error:', err)
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Internal server error.' })
  })

  return app
}
