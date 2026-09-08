import type { Request, Response, NextFunction } from 'express'
import { UnauthorizedError } from './errors.js'

/**
 * Minimal shared-token check (migration.md §Authentication / §API Architecture "Authentication
 * assumptions"): the app is single-tenant/single-user today (Power Apps Code App host auth, no
 * Dataverse security roles found). This is intentionally NOT a new multi-user auth system — just
 * a front-door bearer-token gate so the API isn't wide open on the network, matching the
 * proportionate-to-current-risk instruction. Skips enforcement only if API_AUTH_TOKEN is unset
 * (local dev convenience) — a warning is logged once at startup in that case (see server.ts).
 */
export function requireToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.API_AUTH_TOKEN
  if (!expected) return next() // dev-mode: no token configured

  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
  if (token !== expected) {
    return next(new UnauthorizedError('Missing or invalid bearer token.'))
  }
  next()
}
