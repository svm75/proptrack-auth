# PropTrack V2 — Final Architecture

This document describes the system as of the final application-migration phase (see
`migration.md`'s closing section). Power Platform is retired from the **production** path; it is
retained, untouched, only as a historical rollback option.

## System diagram

```
                         Browser (Tailscale-tailnet device, or public
                         internet if `tailscale funnel` was chosen)
                                        │
                                        │ HTTPS (Tailscale-terminated TLS)
                                        ▼
                         ┌─────────────────────────────┐
                         │   Caddy (reverse proxy)      │
                         │   :80 inside container,       │
                         │   published 127.0.0.1:8083    │
                         └───────────────┬───────────────┘
                          /api/*  │               │  everything else
                                  ▼               ▼
                  ┌───────────────────┐   ┌──────────────────────┐
                  │  api container     │   │  frontend container   │
                  │  Express + node    │   │  Caddy static file    │
                  │  (api/Dockerfile)  │   │  server + SPA fallback │
                  │  :8787             │   │  (root Dockerfile)     │
                  └─────┬───────┬──────┘   └──────────────────────┘
        proptrack_app   │       │  bind mount, DOCUMENTS_ROOT
        role (network)  │       │  /app/data/documents
                         ▼       ▼
        ┌─────────────────────┐   ┌───────────────────────────┐
        │  PostgreSQL —        │   │  NAS filesystem —          │
        │  existing shared     │   │  /App/PropTracker/         │
        │  `myplatform`        │   │  Documents/                │
        │  instance, schema    │   │  (bind-mounted, not a      │
        │  proptrack (metadata │   │  container volume — real   │
        │  only: attachments   │   │  files: PDFs, images,      │
        │  rows point at files │   │  spreadsheets, docs)       │
        │  here via storage_   │   │                             │
        │  path)                │   │                             │
        └─────────────────────┘   └───────────────────────────┘
```

Two independent downstream dependencies from the `api` container: PostgreSQL holds all
structured/metadata records (including each attachment's `storage_path`), and the NAS
filesystem — reached only via the `DOCUMENTS_ROOT` bind mount, never a browser-supplied path —
holds the actual document bytes. Neither is a substitute backup for the other: see
`docs/PRODUCTION_RUNBOOK.md` "Document Storage" for why both must be backed up.

Same-origin: the browser only ever talks to the one Caddy origin. `/api/*` is proxied to the
`api` container; everything else is served by the `frontend` container's own static build. This
is why cross-origin CORS is no longer the primary access control (`ALLOWED_ORIGIN` in
`api/src/app.ts` remains as a safety-net allowlist, not the load-bearing mechanism it was in
Step 9 when the frontend was Power-Apps-hosted on a different origin).

**NAS filesystem convention** (matches `wealth-ledger`/`TripOrganiser` exactly): the application
itself — this repo's checkout, both Dockerfiles, `deploy/`, `node_modules`, build artifacts —
lives under `/volume1/docker/proptracker/`, never under `/App/PropTracker/`. That latter path is
reserved exclusively for uploaded document/attachment bytes (see the diagram above); nothing else
is bind-mounted there. PropTrack has no PostgreSQL container/data of its own, exactly like both
sibling apps — it connects over the network to the NAS's existing shared `myplatform` instance,
whose own data files live under whatever Docker-managed volume path already holds them,
unrelated to and untouched by this deployment package.

## Components

- **`frontend` container** (`Dockerfile`, repo root) — the Vite production build of the React 19
  + TypeScript + Fluent UI v9 app (`src/`), built with `VITE_DATA_BACKEND=postgres` baked in, so
  `src/data/index.ts` resolves to `postgresRepositories` and the Dataverse code path is dead-code
  eliminated from the bundle entirely. Served by Caddy's own static file server
  (`deploy/frontend.Caddyfile`) with SPA fallback for `react-router`'s `BrowserRouter`.
- **`api` container** (`api/Dockerfile`, source in `api/src/`) — Express service exposing REST
  endpoints for all 14 PostgreSQL tables plus composite/business-logic routes (invoice
  sequencing, forecast-flow resolution, property-deletion eligibility, reference-data
  usage-counts, activity-log writes, and NAS document storage). Connects to Postgres
  as the least-privilege `proptrack_app` role — never the `myplatform` superuser. Google
  Drive/OAuth has been removed entirely — no `/oauth/google/*` route exists.
- **`caddy` container** (`deploy/Caddyfile`) — the single ingress point; routes `/api/*` to `api`,
  everything else to `frontend`. HTTPS itself is not terminated here — Tailscale (`serve` or
  `funnel`) does that in front of this container, matching the `wealth-ledger`/`TripOrganiser`
  pattern on the same NAS.
- **PostgreSQL** — not a container in this stack. The existing shared `myplatform` instance on
  the NAS, already used by `wealth-ledger` and `TripOrganiser`, holds PropTrack's data in its own
  `proptrack` schema, isolated by role privilege.
- **NAS Documents filesystem** ("NAS-native document storage") — a single bind-mounted host
  directory, `/App/PropTracker/Documents/` on the NAS, mounted into the `api` container at
  `/app/data/documents` (`DOCUMENTS_ROOT`). Holds the actual bytes of every document uploaded
  through the app (Property/Invoice attachments). Only the `api` container has filesystem access
  to it — the browser never receives or sends a filesystem path; every relative path is resolved
  and validated against `DOCUMENTS_ROOT` server-side (`api/src/documents/paths.ts`) before any
  read/write. This is the **only** document-storage mechanism in the production build — Google
  Drive has been removed entirely (see "Google Drive removal" below); production held zero
  attachment rows referencing it.

## Google Drive removal

Google Drive/OAuth was removed from the codebase in a dedicated cleanup pass, not just disabled:
`src/services/googledrive.ts` and `api/src/routes/googleOAuthRoutes.ts` are deleted; the
`googleOAuthRouter` mount in `api/src/app.ts` and the OAuth-popup message-forwarding branch in
`src/main.tsx` are removed; every `GOOGLE_*`/`VITE_GOOGLE_*` variable is gone from
`deploy/docker-compose.yml`, `deploy/.env.example`, `api/.env.example`, `.env`, and the root
`Dockerfile`. This was safe to do unconditionally (in both the NAS/Postgres and the Power
Platform/Dataverse builds) because a read-only check of production confirmed zero `attachments`
rows carry a `google_drive_id`/`google_drive_url` value. The `attachments.google_drive_id`/
`google_drive_url` PostgreSQL columns themselves are **not** dropped — they remain as harmless,
nullable, unreferenced legacy columns; no destructive migration was run. The `Attachment` domain
type (`src/domain/types.ts`) and the Dataverse/Postgres mappers still carry the corresponding
fields (for the underlying Dataverse/DB columns), but no service or UI code reads or writes them
via Google's API any more — a `googleDriveUrl` value, if one ever existed, is simply inert data.

## Module separation: shared vs. Dataverse-only vs. Postgres/NAS-only

This is the boundary the Repository pattern (`src/data/index.ts`) already establishes, made
explicit here so a future physical move of the Dataverse-only files into an archive folder is a
clean, mechanical operation:

- **Shared** (used by both backends, backend-agnostic): almost everything — `src/screens/*`,
  `src/domain/*`, `src/hooks/data.ts`, `src/services/documents.ts`, `src/services/activitylog.ts`,
  `src/app/*`. Screens that render backend-specific UI (the document-upload panels in
  `Properties.tsx`/`InvoiceForm.tsx`) do so behind a single small flag,
  `isPostgresBackend`/`isDataverseBackend` (`src/data/backend.ts`), not scattered inline checks.
- **Dataverse-only** (Power Platform/legacy, untouched by this migration): `src/generated/`
  (autogenerated Dataverse models/services), `src/data/dataverse/*` (repository implementation +
  mappers), `power.config.json`. Never read at runtime when `VITE_DATA_BACKEND=postgres`, and — as
  of the clean-NAS-deployment pass — **genuinely absent from the NAS production bundle**, not just
  dead at runtime. The default `src/data/index.ts` (used by the Dataverse/legacy build) has a
  runtime `if` that Rollup can't prove dead on its own, which previously left
  `dataverseRepositories` and its Dataverse-generated dependencies shipping in the NAS bundle
  anyway. The fix: `npm run build:nas` (the root Dockerfile's build command) type-checks against
  `tsconfig.app.nas.json`, which excludes `src/generated`, `src/data/dataverse`, and
  `src/data/index.ts` itself from the project, and `vite.config.ts`'s `nasDataBackendPlugin`
  (active only when `VITE_DATA_BACKEND=postgres`) redirects every resolved `@/data` import to
  `src/data/index.postgres.ts` — a file with zero reference to `dataverseRepositories`. Confirmed
  via `tsc --listFiles` (zero Dataverse/`@microsoft/power-apps` files in the NAS project) and a
  real `docker build` from a clean checkout (no local `node_modules`/build cache) succeeding, plus
  a bundle grep showing zero `power-apps`/`commondataserviceforapps`/`dataverseRepositories`
  references in the output. This also resolves the real reason the NAS Docker build previously
  failed with `TS2307: Cannot find module '@microsoft/power-apps/data'` — that package is never
  declared in `package.json` (Power Platform's own `pac`/`power-apps` tooling resolves it outside
  npm's dependency tree at `pac code push` time), so a full `tsc -b` genuinely cannot succeed
  against a clean checkout without this exclusion — installing the package into NAS production
  dependencies would have been the wrong fix (masks the architecture, not a real one).
  `src/data/index.ts`/`npm run build` (no `:nas` suffix) is unaffected — it's what the Dataverse
  build and local dev still use, and legitimately needs and includes `dataverseRepositories`.
- **Postgres/NAS-only**: `src/data/postgres/*` (repository implementation + mappers),
  `api/**` (the entire Express API — routes, repos, `documents/` filesystem module), `deploy/**`,
  the root `Dockerfile`. None of this is reachable from the Dataverse-backed build; the Dataverse
  build never imports `api/` and has no NAS-filesystem code path at all.
- **The switch**: `src/data/index.ts` picks `dataverseRepositories` vs. `postgresRepositories`
  based on `VITE_DATA_BACKEND` at build time; `src/data/backend.ts` exposes the same decision as a
  plain boolean for the handful of UI call sites (currently just the two attachment panels) that
  need to branch on it directly rather than through the repository abstraction. No further
  refactor was needed to keep this separation clean — `src/data/dataverse/*` could be moved to an
  archive folder later with no import-path surprises, but that move is deliberately deferred (per
  migration.md) until the NAS deployment is proven stable.

## Data flow

Every read/write from the browser goes: **browser → Caddy → `api` container → PostgreSQL**. The
browser never talks to PostgreSQL directly, and never talks to Dataverse at all — confirmed by
build-output inspection (`migration.md` Steps 6-8, re-confirmed in the Final Phase) showing zero
references to `src/generated/services`, `commondataserviceforapps`, or any `*.dynamics.com` /
`*.powerapps.com` host in the production bundle.

## Authentication / access model

No app-level login. Access is controlled at the network layer — Tailscale tailnet membership (or
deliberate `funnel` exposure) — matching `wealth-ledger`/`TripOrganiser` exactly. The API keeps a
secondary shared-bearer-token check (`API_AUTH_TOKEN`) baked into the frontend build, unchanged
from Step 9, as a front-door gate beneath the network-level control.

## Power Platform's role now

Dataverse and the Power Apps Code App (`power.config.json`, `src/generated/`,
`src/data/dataverse/*`) are **not deleted**. They are:
- Untouched by this migration at every step (re-confirmed in the Final Phase's data checks).
- No longer read from or written to by the production build (dead code at runtime, per the
  bundle scan above).
- Kept on disk and (for Dataverse) live in the Microsoft-hosted environment as a **rollback
  path** — see "Rollback path" below — until the NAS-hosted deployment has been proven stable in
  real use over an agreed period, at which point decommissioning is a product decision for the
  user, not an automatic next step.

## Rollback path

If the NAS-hosted app needs to be abandoned:
1. `cd deploy && docker compose down` stops the new stack; it does not touch PostgreSQL data.
2. Rebuild the frontend without `VITE_DATA_BACKEND=postgres` (or explicitly `dataverse`) and
   `pac code push` — `src/data/dataverse/*` and `src/generated/` are intact and unmodified, so
   this reproduces the pre-migration app exactly, reading/writing live Dataverse data (which was
   never touched, so it is current as of whenever the PropTrack app was last used against it).
3. No PostgreSQL data restoration is needed for this path — Dataverse and PostgreSQL are two
   independent copies of the data (PostgreSQL was loaded from Dataverse once, at migration time;
   the two have since diverged only if both were used in production simultaneously, which the
   migration process was explicitly designed to avoid).

## Backup and recovery

See `docs/PRODUCTION_RUNBOOK.md` §14 for the operational summary. In brief: PropTrack's Postgres
data lives in the same shared `myplatform` instance already covered by the daily `pg_dump`/
`pg_dumpall` logical backup mechanism documented in
`~/Projects/TripOrganiser/deploy/postgresql-backup/POSTGRESQL_BACKUP.md` (backs up the whole
`myplatform` database, including PropTrack's `proptrack` schema and the `proptrack_app` role's
grants, to `/volume1/Backups/PostgreSQL/`, itself covered by the NAS's existing Hyper Backup job
to Google Drive). No new, PropTrack-specific backup mechanism was introduced — the existing
shared one already covers it. Restoring PropTrack specifically means restoring the whole
`myplatform` dump into a fresh instance (or the same one) and re-granting `proptrack_app`'s
role/schema privileges — the dump already contains both the schema and the role definitions
(`pg_dumpall --globals-only` covers roles separately, per that doc's own architecture notes).
Dataverse remains a fully independent rollback path requiring no data restoration at all (see
above).
