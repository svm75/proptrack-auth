# PropTrack V2 — Production Runbook

Administrator's guide for operating PropTrack V2 in its final architecture: a standalone Vite
frontend + Express/PostgreSQL API, both containerized and deployed together on the Synology NAS
behind a single Caddy reverse proxy, same-origin. **Power Platform is retired from the production
path** — it is no longer the frontend host, and Dataverse is no longer read from or written to by
the running application. Pairs with `migration.md` (full migration history), `deploy/README.md`
(the detailed deployment walkthrough — cross-referenced below, not duplicated here), and
`docs/ARCHITECTURE.md` (the system diagram).

**Deployment status**: this entire package (Dockerfiles, compose file, Caddy config, docs) is
built and ready. It has **not** been deployed to the physical NAS — that requires an interactive
SSH/sudo session with `mfa-ds925.tailc096cf.ts.net`, which this environment does not have. See
`deploy/README.md` for the exact remaining steps once that access is available.

## 1. Deploying the application

The deployable package lives at the repo root (`Dockerfile`, frontend) plus `api/` (source,
`api/Dockerfile`) and `deploy/` (Docker Compose + Caddy, tying both together). Matching
`wealth-ledger`/`TripOrganiser`'s convention, this repo (or at minimum `deploy/`, the root
`Dockerfile`, and `api/`) lives on the NAS under `/volume1/docker/proptracker/` — application
source, both Dockerfiles, `node_modules`, and build artifacts all belong there, never under
`/App/PropTracker/` (reserved exclusively for uploaded document bytes — see §9a). PropTrack
defines no PostgreSQL container/data of its own, exactly like both sibling apps — it connects
over the network to the NAS's existing shared `myplatform` instance.

```sh
cd /volume1/docker/proptracker/deploy
cp .env.example .env   # fill in real values on the NAS itself — nothing here is pre-filled
docker compose up -d --build
docker compose logs -f frontend api   # confirm clean startup, then Ctrl-C
curl http://127.0.0.1:8083/api/health # via Caddy → api (note: /api prefix required — see deploy/Caddyfile)
curl http://127.0.0.1:8083/           # via Caddy → frontend
```

This builds three containers: `frontend` (the Vite production build, served by Caddy's static
file server with SPA fallback for `react-router`), `api` (the Express/PostgreSQL service), and
`caddy` (the single entry point — `/api/*` → `api`, everything else → `frontend`, published only
on `127.0.0.1:8083`). PostgreSQL itself is **not** part of this compose file — the API connects
outward to the NAS's existing shared `myplatform` instance as the least-privilege `proptrack_app`
role, exactly as it has since Step 6.

## 2. Configuring secrets

Create `deploy/.env` on the deployment host — **never commit this file**. Use
`deploy/.env.example` as the reference for the shape of every value (placeholders only):

- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSCHEMA`, `PGUSER`, `PGPASSWORD` — the database connection
  (see §4).
- `API_AUTH_TOKEN` — the shared bearer token the frontend build embeds and sends on every
  request. Generate a fresh one for production (`openssl rand -base64 32`); do not reuse a value
  from local development or a sibling app on the same NAS. Must match on both the `api` service's
  env and the `frontend` build's `VITE_API_AUTH_TOKEN` build arg (the compose file wires this
  automatically from the one `API_AUTH_TOKEN` value).
- `ALLOWED_ORIGIN` — see §3.
- `DOCUMENTS_HOST_PATH` — NAS host path bind-mounted into the `api` container (§9a). Not a
  secret; has a sensible default.

Google Drive/OAuth has been fully removed from PropTrack — there is nothing to configure for it,
and no `GOOGLE_*` variable exists anywhere in this deployment.

`deploy/docker-compose.yml` requires every one of these via `${VAR:?...}` syntax — the stack
refuses to start with a missing value rather than silently defaulting to something insecure.

## 3. Setting `ALLOWED_ORIGIN`

Now that the frontend and API are served same-origin behind one Caddy instance, the browser never
makes a cross-origin request to the API in normal operation — `ALLOWED_ORIGIN` is kept as a
safety-net allowlist (`api/src/app.ts`), not the primary access control. Set it to this
deployment's actual origin(s), comma-separated if more than one (e.g. a staging and production
Tailscale hostname). **Never set this to `*`** — requests carry the bearer token; a wildcard
origin would let any site read authenticated responses.

## 4. Configuring the database connection

The API connects as `proptrack_app` (least-privilege role — never the `myplatform` superuser) to
the NAS's existing shared PostgreSQL instance, schema `proptrack`. Set `PGHOST`/`PGPORT` to the
address reachable **from inside the Docker network** the `api` container runs in — confirm the
correct internal address/port on the NAS itself before deploying (a Tailscale-forwarded external
port is not necessarily the same as the container-network-internal one). `PGPOOL_MAX` controls
the connection pool ceiling (default 5).

### 4a. Test database (development only — never used in production)

A dedicated `proptrack_test` database exists on the same shared PostgreSQL instance, with its own
least-privilege role `proptrack_test_app` (identical privilege shape to `proptrack_app` — see
`db/004_application_role.sql`'s pattern) and the same schema (`proptrack`) and structure
(`db/001`-`007` applied). It is completely isolated from `myplatform`/`proptrack_app` — separate
database, separate role, zero shared data. Local development and `cd api && npm test` should
point `api/.env` at this database (see `api/.env.example`'s defaults) rather than production, so
day-to-day work and test runs never touch real data. The production deployment
(`deploy/docker-compose.yml`/`deploy/.env`) always points at `myplatform`/`proptrack_app` — the
test database is never referenced by anything deployed to the NAS.

## 5. HTTPS and exposure (Tailscale Serve vs Funnel)

Caddy answers plain HTTP on port 80 internally; HTTPS termination and exposure are handled by
Tailscale in front of it, not by Caddy or any TLS config in this repo.

Because the frontend is now also NAS-hosted (unlike during Step 9, when it was Power-Apps-hosted
and needed public reachability), **`tailscale serve` (tailnet-only) is almost certainly the right
choice** — matching `wealth-ledger`/`TripOrganiser` exactly, and consistent with §Authentication
below (no separate app login; access control is tailnet membership). Confirm with the user before
choosing either; do not default to `funnel`.

```sh
tailscale serve --bg --https=443 http://127.0.0.1:8083
# only if the user explicitly wants public-internet reachability instead:
# tailscale funnel --bg --https=443 http://127.0.0.1:8083
```

`tailscale serve status` (or `funnel status`) shows the exact HTTPS URL produced — that is the
one URL real users open in a browser; the frontend calls `/api/*` on that same origin, so no
separate `VITE_API_BASE_URL` needs to be known in advance or rebuilt per-deployment.

## 6. Verifying health

- `GET /api/health` (via Caddy, proxied to the `api` container's own `/health`) — process is up,
  `{"status":"ok"}`. No auth required. (The plain `/health` path resolves to the frontend's SPA
  instead — Caddy only proxies `/api/*` to `api`, everything else to `frontend` — confirmed live
  in this pass's local Docker Compose test.)
- `GET /api/health/db` — process can reach PostgreSQL, `{"db":true}`. No auth required.
- `GET /` — the frontend's `index.html` loads.

From the NAS itself: `curl http://127.0.0.1:8083/api/health`, `.../api/health/db`, `.../`. Once exposed
via Tailscale, the same paths are reachable at the HTTPS URL from §5.

## 7. Restarting and inspecting logs

```sh
docker compose restart api frontend caddy
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f caddy
```

The API handles `SIGTERM`/`SIGINT` gracefully — restart/stop closes the HTTP server and database
pool cleanly rather than dropping in-flight requests or leaking connections.

## 8. Authentication / access model

No separate application login was built. PropTrack follows the same access model already
established by `wealth-ledger` and `TripOrganiser` on this NAS: **Tailscale-network-level access
control** — only devices on the tailnet (or, if `funnel` was deliberately chosen, anyone with the
URL) can reach the app at all; there is no per-user identity inside the application itself. This
matches the app's actual current usage pattern (single-tenant, no Dataverse security-role-driven
multi-user access was ever found in the Power Platform-hosted version either — see migration.md
§14). The API additionally keeps its pre-existing shared-bearer-token gate
(`API_AUTH_TOKEN`, `api/src/auth.ts`) as a second layer, baked into the frontend build so the
browser sends it automatically — this is not a new identity system, just a front-door check so
the API isn't reachable to anyone who merely reaches the network.

## 9. Google Drive / OAuth — removed

Google Drive and its OAuth integration have been **removed entirely** from the production
codebase: `src/services/googledrive.ts` and `api/src/routes/googleOAuthRoutes.ts` are deleted,
no `/oauth/google/*` route is mounted (`api/src/app.ts`), no `GOOGLE_*`/`VITE_GOOGLE_*` env var
exists anywhere in `deploy/`, `api/`, or the frontend build, and `src/main.tsx` no longer contains
the OAuth-popup message-forwarding branch. This is safe because production data has **zero**
`attachments` rows that ever referenced Google Drive (`google_drive_id`/`google_drive_url` are
both `NULL` on every row — verified read-only via `psql` before this removal). The
`attachments.google_drive_id`/`google_drive_url` columns themselves remain in the schema
(harmless, nullable, unused) — no destructive migration was run to drop them.

## 9a. Document Storage (NAS-native)

All document uploads (Property and Invoice attachments) are stored directly on the NAS
filesystem.

**NAS host setup (one-time, before `docker compose up`)** — requires an operator session with
filesystem access to the NAS, which this environment does not have (see `deploy/README.md` "Why
this can't be executed"):
```sh
sudo mkdir -p /App/PropTracker/Documents
sudo chown -R <container-runtime-uid>:<container-runtime-gid> /App/PropTracker/Documents
sudo chmod 750 /App/PropTracker/Documents
```
The container's runtime user/group can be confirmed after first startup with
`docker compose exec api id`; the `api/Dockerfile` does not set a non-root `USER`, so this is
root inside the container by default, matching every other container in this stack.

**Docker bind-mount**: `deploy/docker-compose.yml` mounts exactly `${DOCUMENTS_HOST_PATH:-/App/PropTracker/Documents}`
(host) to `/app/data/documents` (container), with `DOCUMENTS_ROOT=/app/data/documents` set for
the `api` service — nothing broader than this one directory is exposed to the container.

**Backup requirement — physical files AND metadata, both required**: PostgreSQL's `attachments`
table only stores each document's *metadata* (`storage_path`, `original_filename`, `mime_type`,
`file_size`, and the existing property/invoice/contact FKs) — the §14 database backup below does
**not** back up the document bytes themselves. `/App/PropTracker/Documents/` must be included in
the NAS's Hyper Backup (or equivalent filesystem-level) job as its own item, separate from the
Postgres data-directory coverage §14 already describes. Losing the documents directory without a
separate backup of it means every `storage_path` in the database points at nothing — the
metadata rows survive but are useless without the files.

**Security/path-restriction model**: the API is the only component with filesystem access to
this directory. No browser-supplied path is ever trusted directly — every relative path from a
request (`GET /documents/folders`, `POST /documents/folders`, `POST /documents/upload`,
`GET /documents/:id`, `DELETE /documents/:id`) is resolved and canonicalized against
`DOCUMENTS_ROOT` and checked to stay strictly inside it before any filesystem call
(`api/src/documents/paths.ts`) — traversal (`../`), absolute paths, and symlink escapes
(re-verified via `fs.realpath`) are all rejected with a clean `400`, never reaching the
filesystem. Uploads are further restricted by a MIME/extension allowlist (PDF, JPG/JPEG, PNG,
XLS/XLSX, DOC/DOCX) and a configurable max size (`DOCUMENTS_MAX_UPLOAD_BYTES`, default 25MB);
stored filenames are UUID-based, so two uploads never collide or overwrite regardless of the
original filename.

**Google Drive**: not used. Every attachment row's `storage_path`/`original_filename`/
`stored_filename`/`mime_type`/`file_size` come from NAS document storage; no row in production
references Google Drive (§9).

**Legacy Power Platform note**: on the Dataverse-backed build (`VITE_DATA_BACKEND` unset or
`dataverse`), the document-upload UI is intentionally disabled — it renders visibly but shows
"Document upload is disabled in the legacy Power Platform version. Please use the NAS-hosted
version." instead of an upload control (`src/screens/Properties.tsx`, `src/screens/InvoiceForm.tsx`,
gated on `isPostgresBackend` from `src/data/backend.ts`). This build has no NAS-filesystem code
path at all — it never calls `/documents/*`.

**Recovery procedure**: restore `/App/PropTracker/Documents/` from its filesystem backup to the
same host path, restore the `myplatform` database (§14) if that also needs restoring, then
confirm a sample of `attachments.storage_path` values resolve to existing files
(`docker compose exec api ls /app/data/documents/<a storage_path>`, or the equivalent host path)
before resuming traffic.

## 10. Verifying the Postgres backend is active in production

- The frontend build uses `npm run build:nas` (root `Dockerfile`), which resolves `@/data` to
  `src/data/index.postgres.ts` at build time (`vite.config.ts`'s `nasDataBackendPlugin`) — the
  Dataverse branch (`dataverseRepositories`, `src/generated/`) is genuinely absent from the NAS
  bundle, confirmed by grepping the built output for Dataverse/`power-apps` references (zero
  found) and by a clean-checkout `docker build` succeeding. See `docs/ARCHITECTURE.md`'s
  module-separation section for the full detail on how and why.
- At runtime: open the deployed app and confirm network requests go to `/api/*` on the app's own
  origin — never to any Dataverse/`dynamics.com`/`powerapps.com` host.
- `src/data/index.ts`'s backend selection is a plain, uncatchable ternary — no code path silently
  reverts to Dataverse if Postgres is unreachable; a failed request surfaces as a visible error.

## 11. Rollback

**Data rollback**: not needed. Dataverse was never modified by this migration and remains fully
intact — it is retired from production *operation*, not deleted, and can be pointed back to as a
last resort (see `docs/ARCHITECTURE.md` "Rollback path").

**Application rollback**: if the NAS deployment needs to be pulled back:
```sh
cd /volume1/docker/proptracker/deploy && docker compose down
```
then, only if truly necessary, redeploy the Power Apps Code App build (`src/data/dataverse/*`,
`src/generated/`, both untouched by this migration) via `pac code push` — this is a break-glass
option, not a routine one. Do not run `pac code push` at any other time, and do not delete or
overwrite the existing Power Platform app/Dataverse tables while the NAS deployment is being
proven out; decommissioning Power Platform is a separate, deliberate decision made only after the
NAS-hosted app has run stably in production for an agreed period.

## 12. Common failure diagnostics

| Symptom | Likely cause | Check |
|---|---|---|
| Frontend loads but every data screen shows a network error | API container unhealthy, or Caddy `/api/*` routing broken | `curl http://127.0.0.1:8083/api/health`; `docker compose logs -f api caddy` |
| `/health` OK but `/health/db` fails | Database unreachable from inside the container, or wrong `PGHOST`/`PGPORT` | `docker compose logs -f api`; confirm `PGHOST`/`PGPORT` resolve from inside the Docker network |
| API returns `401 Unauthorized` on every request | `VITE_API_AUTH_TOKEN` baked into the frontend build doesn't match the `api` container's `API_AUTH_TOKEN` | Both come from the same `API_AUTH_TOKEN` value in `deploy/.env` — confirm the frontend image was rebuilt after any token change |
| API container restarts in a loop | Missing required env var (`${VAR:?...}` guards refuse to start) | `docker compose logs api` shows the exact missing variable |
| App unreachable from outside the tailnet | `tailscale serve` (tailnet-only) was used where public reachability was actually wanted, or vice versa | Re-read `deploy/README.md` §1; switch deliberately, don't default |
| React-router deep link / refresh 404s | Frontend's internal Caddy (`deploy/frontend.Caddyfile`) SPA fallback misconfigured | Confirm `try_files {path} /index.html` is present in the image (baked in at `/etc/caddy/Caddyfile` inside the `frontend` container) |
| Document upload/download returns `400 Invalid path` for a legitimate-looking folder | Folder browser path desynced from server state, or a stray `..`/absolute path slipped through client-side | Re-browse from the root (`GET /api/documents/folders?path=`) and rebuild the path; the server-side rejection is correct behavior, not a bug — see §9a |
| Document upload returns `500`/container restarts on upload | `/App/PropTracker/Documents/` not created or wrong ownership/permissions on the NAS host before `docker compose up` | `docker compose exec api ls -la /app/data/documents`; confirm the host directory exists and is writable by the container's runtime user (see §9a) |

## 13. Stopping exposure

```sh
tailscale funnel off     # or:
tailscale serve off
```

Immediately stops routing external traffic without affecting the running containers —
`docker compose ps` still shows them healthy; use this to pull the app offline quickly (e.g. while
investigating a suspected credential compromise) without a full `docker compose down`.

## 14. Backups

See `docs/ARCHITECTURE.md` "Backup and recovery" for what's covered and how to restore
PropTrack's schema/role/data specifically. In short: the shared `myplatform` PostgreSQL instance
on the NAS is covered by the same daily logical (`pg_dump`/`pg_dumpall`) backup mechanism already
documented and running for `wealth-ledger`/`TripOrganiser`
(`~/Projects/TripOrganiser/deploy/postgresql-backup/POSTGRESQL_BACKUP.md`) — PropTrack's
`proptrack` schema and `proptrack_app` role are backed up as part of that same `myplatform`-wide
dump; no separate PropTrack-specific backup job exists or is needed. The NAS's Hyper Backup
filesystem-level job additionally covers the raw Postgres data directory as a whole-volume
disaster-recovery fallback.

**Document storage is a separate backup item** (final migration addendum, §9a above) —
`/App/PropTracker/Documents/` is NOT part of the PostgreSQL dump and must be included in the
NAS's Hyper Backup filesystem-level job in its own right. A database-only backup restores
attachment metadata rows with `storage_path` values pointing at nothing if the documents
directory itself was not also backed up.
