import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'

// Connects only as the least-privilege `proptrack_app` role (see migration.md §HARD CONSTRAINTS
// and Step 3 provisioning) — never the `myplatform` superuser. Credentials come from api/.env
// (gitignored), sourced from the repo root's .env.nas.local. Never log this pool's config.
const schema = process.env.PGSCHEMA || 'proptrack'

export const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5433,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 5,
  options: `-c search_path=${schema},public`,
})

pool.on('error', (err: Error & { code?: string }) => {
  // Never log err.message if it could ever include connection strings; pg errors here are
  // runtime (e.g. connection drop), not credential-bearing, but stay conservative.
  console.error('[db] idle client error:', err.code ?? 'unknown')
})

export type Executor = Pool | PoolClient

/** Run `fn` inside a single transaction; commits on success, rolls back on any throw. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function ping(): Promise<boolean> {
  const res = await pool.query('SELECT 1 AS ok')
  return res.rows[0]?.ok === 1
}
