/**
 * Upserts one user row — the deliberate way to get real credentials into `proptrack.users`
 * without ever committing a password hash to git (see db/010_users_auth.sql's own comment on
 * why the migration itself seeds no rows). Run once per environment, with that environment's own
 * DATABASE_URL and real arguments — the arguments themselves are never written to a file this
 * repo tracks. Mirrors the sibling wealth-ledger app's nas-server/scripts/seed-user.ts exactly.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/seed-user.ts <email> <displayName> <password> [--admin] [--protected] [--weak-password]
 *
 * `--weak-password` bypasses the normal 8-character minimum (auth.ts's MIN_PASSWORD_LENGTH) —
 * for a throwaway TEST-environment password ("test") only; never pass it for a real account.
 *
 * Idempotent: re-running with the same email updates that row rather than creating a duplicate.
 */
import { Client } from 'pg'
import bcrypt from 'bcryptjs'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const [, , email, displayName, password, ...flags] = process.argv
if (!email || !displayName || !password) {
  console.error('Usage: DATABASE_URL=... npx tsx scripts/seed-user.ts <email> <displayName> <password> [--admin] [--protected] [--weak-password]')
  process.exit(1)
}
if (password.length < 8 && !flags.includes('--weak-password')) {
  console.error('Password must be at least 8 characters (pass --weak-password to override for a TEST-only throwaway value).')
  process.exit(1)
}

const isAdmin = flags.includes('--admin')
const isProtected = flags.includes('--protected')

const client = new Client({ connectionString: DATABASE_URL })
await client.connect()
try {
  const hash = await bcrypt.hash(password, 10)
  const result = await client.query(
    `INSERT INTO proptrack.users (email, password_hash, display_name, is_admin, is_protected)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       is_admin = EXCLUDED.is_admin,
       is_protected = EXCLUDED.is_protected
     RETURNING id, email, display_name, is_admin, is_protected`,
    [email.trim().toLowerCase(), hash, displayName, isAdmin, isProtected],
  )
  console.log('Upserted:', result.rows[0])
} finally {
  await client.end()
}
