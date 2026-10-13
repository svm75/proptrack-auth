import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { sign, unsign } from 'cookie-signature'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { Pool } from 'pg'
import { UnauthorizedError, ValidationError } from './errors.js'
import { asyncRoute } from './routes/helpers.js'

/**
 * Minimal shared-token check (unchanged) — a second layer in front of (not instead of) the real
 * single sign-on this file adds below: skips enforcement only if API_AUTH_TOKEN is unset (local
 * dev convenience).
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

/**
 * Real single sign-on across every app on this NAS (Wealth Ledger, PropTrack, OmniHub, and
 * anything added later) — mirrors the sibling wealth-ledger app's nas-server/src/auth.ts exactly.
 * Identity lives in ONE shared Postgres database (`identity`/`identity_test`), not in
 * proptrack.users (migration 010) at all any more — that table is retired, kept only because
 * nothing is ever dropped. Managing users (add/remove/reset someone else's password) is
 * centralized in Control Deck now, not here.
 *
 * The cookie itself is what makes this real SSO with zero redirect flow: every app on this NAS
 * shares the same hostname, just a different port, and cookies are never port-scoped — a
 * host-only cookie set here is sent to every other app's port automatically. Same cookie NAME,
 * same signing secret, same session table across every app turns "sent automatically" into
 * "actually recognized" everywhere.
 */
const identityPool = new Pool({ connectionString: process.env.IDENTITY_DATABASE_URL })

const COOKIE_NAME = 'nas_sso'

function secret(): string {
  const s = process.env.SSO_SESSION_SECRET
  if (!s) throw new Error('SSO_SESSION_SECRET is not set.')
  return s
}

function setSessionCookie(res: Response, sessionId: string): void {
  const signed = sign(sessionId, secret())
  res.cookie(COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  })
}

function readSignedSessionId(req: Request): string | null {
  const raw = req.cookies?.[COOKIE_NAME]
  if (!raw) return null
  return unsign(raw, secret()) || null
}

async function readSessionUserId(req: Request): Promise<string | null> {
  const sessionId = readSignedSessionId(req)
  if (!sessionId) return null
  const result = await identityPool.query<{ user_id: string }>(
    'SELECT user_id FROM identity.sessions WHERE id = $1 AND expires_at > now()',
    [sessionId],
  )
  return result.rows[0]?.user_id ?? null
}

export interface AuthedRequest extends Request {
  userId?: string
}

/** Requires a valid shared session cookie; attaches req.userId on success. Mounted globally in
 *  app.ts, same boundary as requireToken above — both must pass, this one on top. */
export function requireSession(req: AuthedRequest, _res: Response, next: NextFunction): void {
  readSessionUserId(req)
    .then((userId) => {
      if (!userId) return next(new UnauthorizedError('Not signed in.'))
      req.userId = userId
      next()
    })
    .catch(next)
}

export const authRouter = Router()

authRouter.post('/login', asyncRoute(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email || !password) throw new ValidationError('Email and password are required.')

  const result = await identityPool.query<{ id: string; password_hash: string; display_name: string; email: string; is_admin: boolean }>(
    'SELECT id, password_hash, display_name, email, is_admin FROM identity.users WHERE email = $1',
    [email],
  )
  const user = result.rows[0]
  if (!user) throw new UnauthorizedError('Invalid email or password.')

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) throw new UnauthorizedError('Invalid email or password.')

  const session = await identityPool.query<{ id: string }>(
    "INSERT INTO identity.sessions (user_id, expires_at) VALUES ($1, now() + interval '30 days') RETURNING id",
    [user.id],
  )
  setSessionCookie(res, session.rows[0].id)

  res.json({ id: user.id, email: user.email, displayName: user.display_name, isAdmin: user.is_admin })
}))

authRouter.get('/me', asyncRoute(async (req, res) => {
  const userId = await readSessionUserId(req)
  if (!userId) throw new UnauthorizedError('Not signed in.')

  const result = await identityPool.query<{ id: string; email: string; display_name: string; is_admin: boolean }>(
    'SELECT id, email, display_name, is_admin FROM identity.users WHERE id = $1',
    [userId],
  )
  const user = result.rows[0]
  if (!user) throw new UnauthorizedError('Not signed in.')
  res.json({ id: user.id, email: user.email, displayName: user.display_name, isAdmin: user.is_admin })
}))

const MIN_PASSWORD_LENGTH = 8

/** POST /auth/change-password — self-service, own account only, works the same from any app
 *  since it's the one shared identity. Requires the caller's current password. */
authRouter.post('/change-password', asyncRoute(async (req, res) => {
  const userId = await readSessionUserId(req)
  if (!userId) throw new UnauthorizedError('Not signed in.')

  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : ''
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
  if (!currentPassword || !newPassword) throw new ValidationError('Current and new password are required.')
  if (newPassword.length < MIN_PASSWORD_LENGTH) throw new ValidationError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`)

  const result = await identityPool.query<{ password_hash: string }>('SELECT password_hash FROM identity.users WHERE id = $1', [userId])
  const user = result.rows[0]
  if (!user) throw new UnauthorizedError('Not signed in.')

  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) throw new UnauthorizedError('Current password is incorrect.')

  const hash = await bcrypt.hash(newPassword, 10)
  await identityPool.query('UPDATE identity.users SET password_hash = $1 WHERE id = $2', [hash, userId])
  res.status(204).end()
}))

authRouter.post('/logout', asyncRoute(async (req, res) => {
  const sessionId = readSignedSessionId(req)
  if (sessionId) await identityPool.query('DELETE FROM identity.sessions WHERE id = $1', [sessionId])
  res.clearCookie(COOKIE_NAME)
  res.status(204).end()
}))
