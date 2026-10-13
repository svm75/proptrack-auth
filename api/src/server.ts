import 'dotenv/config'
import { createApp } from './app.js'
import { pool } from './db.js'
import { ensureDocumentsRoot, DOCUMENTS_ROOT } from './documents/paths.js'

if (!process.env.API_AUTH_TOKEN) {
  console.warn('[api] WARNING: API_AUTH_TOKEN is not set — the API is running with no auth check. Set it in api/.env before exposing this beyond localhost.')
}

await ensureDocumentsRoot()
console.log(`[api] Documents root: ${DOCUMENTS_ROOT}`)

const port = process.env.API_PORT ? Number(process.env.API_PORT) : 8787
const app = createApp()
const server = app.listen(port, () => {
  console.log(`[api] PropTrack PostgreSQL API listening on :${port}`)
})

// Graceful shutdown: stop accepting new connections, then close the DB pool, so a container
// restart/stop (SIGTERM from Docker/Compose) or a local Ctrl-C (SIGINT) doesn't leak connections
// or cut off in-flight requests mid-response.
function shutdown(signal: string) {
  console.log(`[api] received ${signal}, shutting down…`)
  server.close(() => {
    pool.end().finally(() => process.exit(0))
  })
  // Safety net in case something never finishes (e.g. a stuck connection).
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
