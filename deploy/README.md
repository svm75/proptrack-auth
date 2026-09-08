# Deploying PropTrack V2 to the Synology NAS (frontend + API + Caddy)

This is the deployment package for PropTrack V2 (frontend + API + Caddy, same-origin), following
the `wealth-ledger`/`TripOrganiser` pattern: one Caddy container proxies `/api/*` to the `api`
container and everything else to the `frontend` container. (This superseded an earlier, API-only
package built during Step 9, when the frontend was still Power-Apps-hosted and needed to be
reached cross-origin; that package — `api/deploy/` — has since been removed, now that this one
fully replaces it.)

## NAS directory convention

Matches `wealth-ledger` (`/volume1/docker/wealth-ledger/`) and TripOrganiser
(`/volume1/docker/trip-organizer/`) exactly:

- **Application/deployment directory**: `/volume1/docker/proptracker/` — this repo's checkout (or
  at minimum this `deploy/` directory, the root `Dockerfile`, and `api/`, since the `frontend`/`api`
  services build from those paths via `context: ..`/`context: ../api`) lives here. Application
  source, both Dockerfiles, `node_modules`, and all build artifacts (`dist/`) belong under this
  path — never under `/App/PropTracker/`.
- **Docker engine's own volume storage**: the two named volumes below (`caddy_data`,
  `caddy_config`) are unqualified Docker named volumes, exactly like both sibling apps' Caddy
  volumes — Docker/Synology Container Manager stores their actual data under its own internal
  volume path (commonly referred to as `/volume1/Docker_Data` or `/volume1/@docker` in this NAS's
  Hyper Backup coverage, per `TripOrganiser/deploy/postgresql-backup/SETUP.md`), not somewhere
  this compose file names explicitly. This project introduces no database container of its own
  (see below), so there is no PostgreSQL data file to place anywhere in this convention at all.
- **`/App/PropTracker/Documents/`**: reserved *exclusively* for uploaded document/attachment
  bytes (the one bind-mount into the `api` container, §2a below). Nothing else — no source code,
  no Docker files, no `node_modules`, no build output, no database files — belongs under this
  path. The compose file below bind-mounts only this one directory into `api`; nothing else in
  this package references `/App/PropTracker/` at all.
- **No PostgreSQL container/data of PropTrack's own**: exactly like both sibling apps, this
  package defines no `postgres` service — it connects over the network to the NAS's existing
  shared `myplatform` instance as the least-privilege `proptrack_app` role. Wherever that
  instance's own data files live on the NAS (managed independently of this deployment, presumably
  already under the NAS's standard Docker data-volume convention) is out of scope for this
  package and untouched by it.

## Why this can't be executed from this environment

This session has confirmed Tailscale connectivity to `mfa-ds925.tailc096cf.ts.net` but has **no
SSH credential** for it (host key accepted, key-based/password auth rejected — confirmed
directly, not assumed). `~/Projects/TripOrganiser/deploy/DEPLOYMENT_LOG.md` records that even
that app's own deployment needed an interactive `sudo` password prompt on this NAS — this has
never been a fully unattended deployment target for any app on it. Everything below is prepared
and ready; none of it has been run against the real NAS.

`docker build` for both images (`Dockerfile` at the repo root, `api/Dockerfile`) was **also not
exercised locally** in this pass — Docker Desktop's daemon is not running in this environment
(`docker info` fails). This is an environment limitation, not a defect in either Dockerfile;
`npm run build` (root) and `cd api && npm run build` — the same steps each image's build stage
runs — both succeed cleanly outside Docker.

## 1. Access model (read before deploying)

No new login system was built. PropTrack now follows the same access model as
`wealth-ledger`/`TripOrganiser`: **Tailscale-network-level access control**, no separate
app-level user login. The API additionally keeps its existing shared-bearer-token gate
(`API_AUTH_TOKEN`, `api/src/auth.ts`) as a second layer — this predates the final phase and was
not removed. Whether to expose this via `tailscale serve` (tailnet-only) or `tailscale funnel`
(public internet) is unchanged from Step 9's own analysis: now that the frontend is also NAS
hosted, `tailscale serve` is almost certainly the right choice (matching both sibling apps
exactly) — `funnel` is no longer forced by a Power-Apps-hosted frontend needing to reach a
NAS-only API across origins, since both now live behind the same tailnet-only proxy. Confirm with
the user before choosing either.

## 2. Provision secrets

Create `deploy/.env` on the NAS (copy `deploy/.env.example`, fill in for real, never commit):

```
PGHOST=mfa-ds925.tailc096cf.ts.net   # or the Docker-internal host/alias if the container can't resolve this
PGPORT=5433                          # confirm the myplatform container's actual internally-reachable port on the NAS
PGDATABASE=myplatform
PGSCHEMA=proptrack
PGUSER=proptrack_app
PGPASSWORD=<the proptrack_app role's password — copy from api/.env, never re-type into shell history>
API_AUTH_TOKEN=<generate fresh: openssl rand -base64 32 — must match what the frontend build embeds>
ALLOWED_ORIGIN=<this deployment's actual https:// origin once known — comma-separated if more than one>
DOCUMENTS_HOST_PATH=/App/PropTracker/Documents   # NAS host path bind-mounted into the api container — see §2a below
```

Google Drive/OAuth has been fully removed from PropTrack — there is nothing to provision for it.
Production data has zero attachment rows that ever referenced Google Drive, so no legacy-link
handling is needed either.

## 2a. Document storage setup (NAS-native)

All document uploads (Property/Invoice attachments) are stored directly on the NAS filesystem.
Before `docker compose up`, on the NAS itself (requires the
SSH/sudo access this environment does not have — see "Why this can't be executed" above):

```sh
sudo mkdir -p /App/PropTracker/Documents
# Match the ownership the api container's process runs as (the Dockerfile does not set a
# non-root USER, so this is root inside the container by default, matching every other
# PropTrack/wealth-ledger/TripOrganiser container on this NAS) — confirm with `docker compose exec
# api id` after first startup and adjust ownership/permissions if the container user differs.
sudo chown -R <container-runtime-uid>:<container-runtime-gid> /App/PropTracker/Documents
sudo chmod 750 /App/PropTracker/Documents
```

`deploy/docker-compose.yml` bind-mounts exactly this one directory into the `api` container at
`/app/data/documents` (`DOCUMENTS_ROOT` inside the container) — nothing broader is exposed. The
API is the only component with filesystem access to it; every path the API resolves under this
root is validated to stay strictly inside it (traversal, absolute paths, and symlink escapes are
all rejected — see `api/src/documents/paths.ts`). See `docs/PRODUCTION_RUNBOOK.md` "Document
Storage" for the backup and recovery procedure — a database backup alone does NOT back up the
physical files.

## 3. Build and run

```sh
cd /volume1/docker/proptracker/deploy   # repo checked out under /volume1/docker/proptracker/ — see "NAS directory convention" above
docker compose up -d --build
docker compose logs -f frontend api   # confirm both start clean, then Ctrl-C
curl http://127.0.0.1:8083/api/health       # via Caddy → api, from the NAS itself (note: /api prefix — Caddy only proxies /api/* to the api container, confirmed live during this pass's local Docker Compose test)
curl http://127.0.0.1:8083/                 # via Caddy → frontend, from the NAS itself
```

## 4. Expose via Tailscale

```sh
tailscale serve --bg --https=443 http://127.0.0.1:8083
# or, only if the user explicitly wants public-internet reachability:
# tailscale funnel --bg --https=443 http://127.0.0.1:8083
```

Then `tailscale serve status` for the exact HTTPS URL. That URL is what real users open in a
browser — no separate `VITE_API_BASE_URL` rebuild is needed, since the frontend calls `/api/*`
on its own origin (same-origin, per `deploy/Caddyfile`).

## 5. Post-deployment smoke test (once reachable)

- Open the URL in a browser; confirm every screen listed in migration.md's Final Phase loads.
- Exercise one NAS document upload (Property or Invoice attachment): browse/create a folder,
  upload a small test file, confirm it downloads back correctly, then delete it and confirm the
  file is gone from `/App/PropTracker/Documents/` on the NAS — this exercises the
  filesystem-mediated document storage end to end for the first time outside this session's own
  local-scratch-directory testing (see migration.md's NAS-native document storage addendum §6).
- Confirm `curl <url>/health` and `<url>/health/db` both report healthy.
- Hand the working URL back for `docs/PRODUCTION_RUNBOOK.md`'s "Application URL" field.

## 6. Decommissioning Power Platform (only after the above is confirmed working)

Do not run `pac code push` again, and do not delete the Power Platform app or its Dataverse
tables — disable/archive only, per migration.md's hard safety rules, keeping it as a rollback
path until the NAS-hosted app has been proven stable in real use.
