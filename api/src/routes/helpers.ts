import type { Request, Response, NextFunction, RequestHandler } from 'express'

/** Wraps an async route handler so a thrown/rejected error reaches Express's error middleware
 * instead of crashing the process or hanging the request. */
export function asyncRoute(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next) }
}

export function userNameFrom(req: Request): string | undefined {
  const header = req.header('x-user-name')
  return header || undefined
}
