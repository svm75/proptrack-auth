# NAS Development & Production Standard

## Purpose

This document defines the standard development, testing, database,
Git, deployment and rollback process for applications running on the
Synology NAS — **and, from this revision, the fleet-wide application
architecture standard** (technology stack, UI/UX, API, and authentication
conventions) that governs how new and existing applications are built.

This standard applies to all applications hosted on the NAS, including:

- PropTrack
- Wealth Ledger
- TripOrganiser
- OmniHub
- future applications

This file is the **single canonical home** for the fleet-wide standard.
No competing or duplicate standards document exists elsewhere; earlier
drafts produced while designing OmniHub (`OmniHub/docs/
NAS-Application-Architecture-Standard.md` and `OmniHub/docs/adr/
0001-standardize-principles-not-code.md`) fed into this revision and
should now be treated as historical working notes, not a second source
of truth.

GitHub is the source of truth for application source code and database
migration history.

Production is the currently deployed, known-good application.

Development and testing must never compromise production.

### How to read this standard

Every requirement below falls into one of four tiers. Where a section
doesn't say otherwise, treat process/workflow sections (environment
model, Git, secrets, rollback, etc.) as **Fleet-wide mandatory** — that
was already true before this revision and is unchanged.

| Tier | Meaning |
|---|---|
| **Fleet-wide mandatory** | Applies to every application, present and future, with no exceptions. |
| **Recommended convention** | The default choice for new work; existing apps are not rewritten to adopt it retroactively. |
| **Accepted application-specific exception** | A named, permanent deviation for a named app. Not technical debt, not scheduled for reconciliation. |
| **Opportunistic technical improvement** | Worth doing, but only when the affected app is already being opened for unrelated work — never a standalone project. |

The overriding principle behind this tiering, carried forward from the
OmniHub architecture review (see §29): **standardize principles, not
code. An existing, working application is never rewritten merely to
match this document.**

---

# 1. Environment Model

*(Fleet-wide mandatory)*

Every application has three logical stages:

    DEVELOPMENT
         ↓
       TEST
         ↓
    PRODUCTION

### DEVELOPMENT

Purpose:

- implement new functionality
- modify application code
- develop database migrations
- run local tests

Development must never modify production.

### TEST

Purpose:

- run the application against a separate test database
- test new functionality
- test database migrations
- perform regression testing
- verify deployment configuration

The test environment may be changed or reset when required.

The test environment must never use the production database.

### PRODUCTION

Purpose:

- run the approved, stable application
- serve real production data
- provide the production service

Production changes require explicit authorization.

---

# 2. Production Protection

*(Fleet-wide mandatory)*

Production is protected by default.

Claude or any developer MUST NOT:

- modify production code during normal development
- experiment against production
- use the production database for testing
- reset production data
- truncate production tables
- delete production records to make tests pass
- modify production schema experimentally
- recreate the production database
- replace production persistent storage
- change production configuration unnecessarily
- restart unrelated applications

If a production problem is discovered during development or testing:

STOP and diagnose it before making changes.

---

# 3. NAS Directory Standard

*(Fleet-wide mandatory)*

Production application code lives under:

    /volume1/docker/<application>/

Example:

    /volume1/docker/proptracker/
    /volume1/docker/wealth-ledger/
    /volume1/docker/trip-organizer/
    /volume1/docker/omnihub/

Test applications use a separate directory:

    /volume1/docker/<application>-test/

Example:

    /volume1/docker/proptracker-test/

Production and test application directories must never be confused.

### Port convention

Test deployments publish on production port + 1000, so the two can run side by side on the same
NAS without colliding, and the relationship between a production and test port is always obvious
at a glance:

    PropTrack:      8083 (prod)  →  9083 (test)
    TripOrganiser:  8080 (prod)  →  9080 (test, when one exists)
    wealth-ledger:  8081 (prod)  →  9081 (test, when one exists)
    OmniHub:        8084 (prod, proposed)  →  9084 (test, proposed)

---

# 4. Persistent Application Data

*(Fleet-wide mandatory)*

Application data must be separated from application source/deployment files.

Where an application requires persistent files, use:

    /volume1/App/<ApplicationName>/

Examples:

    /volume1/App/PropTracker/Documents/
    /volume1/App/WealthLedger/
    /volume1/App/TripOrganiser/
    /volume1/App/OmniHub/Documents/   (referenced, never written to — see §26)

The exact structure is application-specific.

Do not store persistent production documents inside Docker build
directories unless explicitly required by the application's architecture.

---

# 5. PostgreSQL Standard

*(Fleet-wide mandatory)*

The NAS may use a shared PostgreSQL server.

The existing shared PostgreSQL container is:

    my-platform-postgres

Application databases must remain logically separated.

Each application must have separate production and test databases.

Conceptually:

    PostgreSQL
    │
    ├── application_prod
    ├── application_test
    │
    ├── another_application_prod
    └── another_application_test

The exact existing production database names must not be changed
without explicit authorization.

Each application gets its own **schema** and its own **least-privilege
role** (`<app>_app`), scoped to that schema only, with no DDL grants, plus
a separate `<app>_test` database/role for testing.

### Absolute rule

TEST must NEVER connect to a production application database.

DEVELOPMENT must NEVER connect to a production application database.

### Disposable local development databases

*(Opportunistic technical improvement)*

TripOrganiser and OmniHub each run a fully disposable local Postgres
container for development (own Docker volume, own port, freely reset),
so development never touches the shared instance at all. PropTrack and
Wealth Ledger do not yet have this. Adding it to either is worthwhile but
**not a standalone project** — do it the next time that application's
codebase is already open for unrelated feature work.

---

# 6. Database Schema Changes

*(Fleet-wide mandatory)*

All schema changes must be represented by version-controlled
database migrations.

Never rely on undocumented manual SQL changes.

Example:

    migrations/
        001_initial_schema
        002_add_x
        003_add_y
        004_new_feature

A migration must be:

1. created in the development branch
2. applied to the test database
3. tested
4. reviewed/approved
5. applied to production only as part of an authorized release

Do not make experimental schema changes directly in production.

### Migration conventions

*(Recommended convention)*

- Plain numbered SQL files: `db/NNN_description.sql` (or the app's
  established equivalent — e.g. Wealth Ledger's `migrations/`, see §27),
  applied forward-only, never edited after being applied to any real
  environment.
- UUID primary keys via `pgcrypto`'s `gen_random_uuid()`.
- Every table carries `created_at` / `updated_at TIMESTAMPTZ NOT NULL
  DEFAULT now()`, kept current by a shared `set_updated_at()` trigger.
- Enum-like columns use `SMALLINT` + a table-scoped `CHECK` constraint,
  not Postgres enum types and not a lookup table, unless the value set is
  genuinely open-ended.
- snake_case identifiers throughout.
- No ORM — parameterized SQL via the `pg` driver only.

---

# 7. Destructive Database Changes

*(Fleet-wide mandatory)*

Extra caution is required for:

- dropping columns
- dropping tables
- changing data types
- deleting data
- changing constraints
- changing foreign keys
- irreversible migrations

Before an authorized production destructive migration:

1. create/verify a production database backup
2. verify the migration has been tested
3. verify the rollback/recovery procedure
4. apply the migration
5. verify application health
6. retain the backup until the release is confirmed stable

If a destructive migration cannot be safely rolled back, this must be
explicitly identified before production deployment.

---

# 8. Git Standard

*(Fleet-wide mandatory)*

Each application has its own GitHub repository.

The normal branch structure is:

    main
      │
      ├── feature/...
      ├── fix/...
      └── maintenance/...

### main

`main` represents the production-ready code.

Do not develop experimental functionality directly on `main`.

### Feature branches

New functionality should normally be developed on:

    feature/<short-description>

Example:

    feature/invoice-approval

Bug fixes may use:

    fix/<short-description>

---

# 9. Commits

*(Fleet-wide mandatory)*

Commits should represent meaningful, coherent changes.

Do not commit:

- passwords
- API keys
- tokens
- OAuth credentials
- private keys
- certificates containing secrets
- .env files containing secrets
- node_modules
- build artefacts
- temporary files
- machine-specific files

Before committing, inspect:

    git status

and the exact staged file list.

Never blindly use:

    git add .

when there is a possibility of unrelated or sensitive files being
present.

---

# 10. Production Tags

*(Fleet-wide mandatory)*

Every production release must have a Git tag.

Example:

    v2.0.0-nas
    v2.1.0-nas
    v2.2.0-nas

The tag must point to the exact commit deployed to production.

Production tags must never be overwritten or force-updated.

A production tag is a rollback point.

This requirement applies to every application in the fleet, including
those that have not yet made a first tagged release (Wealth Ledger,
TripOrganiser, OmniHub) — their first production deployment must be
tagged from that point forward.

---

# 11. Rollback

*(Fleet-wide mandatory)*

Application rollback is performed by deploying a previously approved
Git commit/tag.

Example:

    v2.0.0-nas

The rollback procedure must identify:

1. application version
2. Docker image/version if applicable
3. database migration state
4. database recovery procedure if schema changes are involved

Application rollback and database rollback are separate concerns.

Do not assume that reverting application code automatically reverts
the database schema.

### Rebuilding an existing deployment (picking up new code, no rollback)

The containers already exist; this replaces their images and recreates only what changed —
volumes (Postgres data lives outside this compose stack entirely; the documents bind-mount is a
host directory, not a Docker volume) and the shared `myplatform` instance are untouched either
way.

**If you deployed via the command line** (`docker compose up -d --build`, as PropTrack's
production and test stacks currently are):

    ssh SV_ADMIN@<nas-tailscale-hostname>
    sudo /usr/local/bin/docker compose -f /volume1/docker/<app>/deploy/docker-compose.yml up -d --build

For PropTrack specifically:

    # production
    sudo /usr/local/bin/docker compose -f /volume1/docker/proptracker/deploy/docker-compose.yml up -d --build

    # test
    sudo /usr/local/bin/docker compose -f /volume1/docker/proptracker-test/deploy/docker-compose.yml up -d --build

This rebuilds only images whose build context actually changed (Docker's own layer cache skips
unchanged steps — a pure documentation change, for instance, still triggers a rebuild of the
`COPY . .` layer onward but reuses the cached `npm install` layer), and only recreates containers
whose image or config actually differs from what's running — an unaffected container (a sibling
app, or even a service within the same stack that didn't change) is left alone. Get the new code
onto the NAS first (the same `tar`-over-SSH transfer used for the initial deployment, or `rsync`
if that works on your NAS's SSH setup — it didn't on this one) before running this.

**If you deployed via Container Manager's Project wizard**: open the project → **Action** →
**Build** (or **Recreate**, depending on DSM version) — same effect, driven from the GUI instead.

**Either way, verify afterward** — don't assume a clean exit code means it actually works:

    curl -s http://127.0.0.1:<port>/api/health
    curl -s http://127.0.0.1:<port>/api/health/db

and check sibling containers' uptimes are unaffected (`docker ps` — a rebuild of one app's stack
must never restart another app's containers).

---

# 12. Development Workflow

*(Fleet-wide mandatory)*

For a new feature:

    1. Create feature branch
    2. Inspect existing architecture
    3. Implement required changes
    4. Create database migration if required
    5. Run local tests
    6. Deploy branch/version to TEST
    7. Apply migration to TEST database
    8. Test functionality
    9. Test regression scenarios
    10. Review changes
    11. Merge to main
    12. Create production release/tag
    13. Obtain explicit production deployment authorization
    14. Backup production database if required
    15. Deploy to production
    16. Apply required production migration
    17. Verify production
    18. Record release/tag

---

# 13. Claude Development Rules

*(Fleet-wide mandatory)*

Claude must distinguish between:

    DEVELOPMENT
    TEST
    PRODUCTION

Before making changes, Claude must establish which environment it
is operating against.

### During development

Claude may:

- modify code
- create migrations
- modify tests
- create feature branches
- deploy to TEST

Claude must NOT:

- modify production
- run experimental SQL against production
- change production configuration

### During testing

Claude may:

- deploy the application to TEST
- modify TEST configuration
- reset TEST data when required
- apply/test migrations against TEST

Claude must NOT:

- modify production
- apply unapproved migrations to production

### During production deployment

Claude may perform only the explicitly authorized production
deployment steps.

Claude must not introduce unrelated code changes during deployment.

If a deployment problem occurs:

1. diagnose the problem
2. determine whether it is code, configuration, infrastructure,
   networking, permissions or database related
3. fix only what is strictly required
4. do not turn deployment into an unplanned development cycle

---

# 14. No Nice-to-Haves

*(Fleet-wide mandatory)*

For all development and deployment tasks:

ONLY perform steps that are required for the requested objective.

Do not:

- refactor unrelated code
- redesign working architecture
- perform cosmetic cleanup
- introduce unnecessary infrastructure
- add optional features
- change working configuration without reason
- upgrade dependencies without a requirement
- change unrelated applications

If something is a possible improvement but is not required:

leave it unchanged and report it separately.

This is the same principle behind §29's "standardize principles, not
code" — a working application is never changed merely to make it look
more like this standard.

---

# 15. Production Deployment Rule

*(Fleet-wide mandatory)*

Production deployment must always be explicit.

A normal development request does NOT authorize production deployment.

For example:

    "Develop feature X"

means:

    DEVELOPMENT / TEST ONLY

Whereas:

    "Deploy the approved feature X to production"

explicitly authorizes production deployment.

Never infer production authorization from a development request.

---

# 16. Shared NAS Infrastructure

*(Fleet-wide mandatory)*

The NAS may host multiple independent applications.

A deployment must not affect unrelated applications.

Before changing shared infrastructure, verify:

- which applications depend on it
- whether the change is actually required
- whether the change could affect production applications

Do not stop, recreate, remove or reconfigure unrelated containers.

Do not create duplicate infrastructure when the existing shared
infrastructure is suitable.

---

# 17. PostgreSQL Shared Infrastructure

*(Fleet-wide mandatory)*

If an existing shared PostgreSQL instance is available, applications
should normally use it rather than creating unnecessary additional
PostgreSQL servers.

However:

- databases must remain separated
- application roles must remain separated
- TEST must remain separated from PROD
- application-specific migrations must affect only the intended
  database

Never modify the shared PostgreSQL persistent storage directly.

---

# 18. Secrets

*(Fleet-wide mandatory)*

Secrets belong in environment/configuration mechanisms appropriate
for the deployment environment.

Secrets must never be committed to GitHub.

Examples of secrets include:

- database passwords
- API tokens
- OAuth secrets
- encryption keys
- private keys
- credentials

Test and production credentials must always be distinct — a test secret
is never reused in production or vice versa.

If a secret is accidentally discovered in the repository:

STOP.

Do not commit it.

Do not print it.

Report the issue and resolve it before proceeding.

---

# 19. Deployment Verification

*(Fleet-wide mandatory)*

Every production deployment must verify, where applicable:

- containers running
- application health
- API health
- database connectivity
- frontend availability
- critical application functionality
- document/file storage
- database migration success
- unrelated NAS applications remain operational

Verification should be targeted.

Do not perform unnecessary testing or infrastructure changes.

---

# 20. Source of Truth

*(Fleet-wide mandatory)*

The authoritative sources are:

### Application code

GitHub repository.

### Database evolution

Version-controlled migrations in GitHub.

### Production state

The Git tag corresponding to the deployed release.

### Persistent production data

The production PostgreSQL database and application-specific
persistent storage on the NAS.

### Fleet-wide architecture standard

This document (`PropTrack/docs/NAS-Development-Standards.md`).

The NAS runtime is NOT the source of truth for application source code.

---

# 21. Standard Release Model

*(Fleet-wide mandatory)*

The standard release chain is:

    Git feature branch
          ↓
    DEVELOPMENT
          ↓
       TEST
          ↓
    Review / approval
          ↓
       main
          ↓
    Production tag
          ↓
    Production backup
          ↓
    NAS PRODUCTION
          ↓
     Verification

A production release is complete only when the deployed version,
database state and Git tag are known and documented.

---

# 22. Current PropTrack Baseline

PropTrack's current known-good production baseline is:

    v2.0.0-nas

This represents the frozen NAS production version.

Future PropTrack development must start from this production baseline
or from the subsequently approved production release.

Do not modify this tag.

---

# 23. Backup Standard

*(Fleet-wide mandatory — new in this revision)*

Every application's production database must have automated backup
coverage. TripOrganiser's existing pattern is the fleet template:

- a dedicated, read-only backup role (never the application's own
  least-privilege `<app>_app` role)
- a scheduled `pg_dump` script writing to durable NAS storage
- documented restore procedure alongside the backup script

PropTrack and Wealth Ledger currently have **no backup automation** —
this is the single highest-priority gap identified in the fleet
architecture review and must be closed for each, though not necessarily
in the same session as other work (see §14, no nice-to-haves — closing
this gap is itself the required objective when scheduled, not an add-on
to unrelated work). OmniHub must have backup automation in place before
its first production deployment, not after.

Backups must never be implemented by connecting as an application's own
`<app>_app` role, and backup automation must never be scheduled or
executed against production without the same explicit authorization
required for any other production change (§15).

---

# 24. Fleet-Wide Technology Stack

*(Recommended convention, unless marked otherwise)*

- **Frontend**: Vite + React 19 + TypeScript, Fluent UI v9, React Router
  v6, TanStack Query v5.
- **Backend**: Node 20 + TypeScript, REST API, layered `routes/ →
  services/ → repos/`, `pg` driver, parameterized SQL, no ORM.
- **Database**: PostgreSQL, the shared `myplatform` instance (§5), one
  schema + one least-privilege role per app.
- **Infra**: Docker / Docker Compose, Synology Container Manager, Caddy,
  Tailscale.

**Accepted application-specific exception:** TripOrganiser's backend is
**Fastify**, not Express. This is permanent, not a migration target — see
§27.

---

# 25. Fleet-Wide API Conventions

*(Recommended convention)*

- REST, one router per resource, a generic CRUD repo/route pattern for
  plain tables, bespoke services for composite/aggregation logic (e.g. a
  dashboard or "Today" endpoint).
- A shared `ApiError` type with Postgres error-code translation
  (`23503`→409, `23514`/`23502`→400, `23505`→409, etc.).
- Standard HTTP status codes: `201` create, `204` delete, `400`
  validation, `401` unauthorized, `404` not found, `409` conflict.
- All input validated server-side; frontend validation is a UX
  convenience only, never the sole guard.

---

# 26. Fleet-Wide UI/UX Conventions

*(Recommended convention)*

- Brand identity: anthracite `#2F3538` primary, royal-blue `#2563EB`
  link/informational accent, off-white `#F8F9FA` page background, white
  cards.
- Fixed dark left navigation rail (~224px), flat list with indentation for
  sub-items, active item highlighted in the accent color.
- Top utility bar: global search, quick-add, alerts, light/dark toggle.
- Fluent UI `Dialog*` primitives for forms; synchronous validation before
  submit, async warnings shown separately from hard errors.
- Tables are bespoke per screen — no shared generic table component is
  required.
- Errors surface two ways: a dismissible `QueryErrorBanner` for failed
  queries/mutations, and an `AppErrorBoundary` for render-time exceptions
  with a reload affordance.
- Desktop/tablet-first; full responsive parity is not mandated (Wealth
  Ledger's separate `mobile/` treatment is an accepted pattern, not a
  requirement for every app).

An application that references files it does not own and did not create
(for example OmniHub's NAS document model) must expose only a validated
relative path, never an absolute filesystem path, and must reject
absolute paths or `..` traversal segments server-side before a path is
stored or used.

---

# 27. Accepted Application-Specific Exceptions

*(Accepted application-specific exception — permanent, not scheduled for
reconciliation)*

- **TripOrganiser uses Fastify** instead of Express. It also has its own
  disposable dev-DB tooling and a real vitest+`.inject()` test suite that
  are, if anything, ahead of the fleet standard. No migration to Express
  is planned or desirable.
- **Wealth Ledger's folder layout** (`nas-server/` instead of `api/`,
  `migrations/` instead of `db/`, root-level governance docs instead of a
  `docs/` folder) is an accepted legacy convention. It is aligned to the
  `api/`/`db/`/`docs/` naming only if that codebase is opened for other,
  unrelated work — never as a standalone renaming project.
- **OmniHub uses per-user session-cookie authentication** instead of the
  shared bearer-token model used elsewhere in the fleet. This is
  intentional, not an inconsistency — see §28.
- **PropTrack's ad hoc test script** (`api/test/run.ts`) instead of a
  vitest suite is tolerated as-is; PropTrack is stable production
  software and a full suite is not currently justified by any defect
  history.

---

# 28. Authentication and Authorization Principles

*(Fleet-wide mandatory principle; the specific pattern chosen per app is
a recommended convention)*

Two authentication patterns coexist across the fleet by deliberate
design, chosen per application based on its actual data-sharing model —
this is not drift and is not scheduled to converge:

- **Shared bearer-token behind Tailscale** — the default for any
  single-implicit-user application. PropTrack, Wealth Ledger, and
  TripOrganiser use this. Tailscale network membership is the real access
  boundary; the token is a lightweight secondary gate. Single-user
  applications may continue using this model indefinitely; it is not
  considered weaker or provisional.
- **Per-user session-cookie authentication** — used only where an
  application's data model genuinely represents more than one person's
  separate-but-overlapping data. **OmniHub uses this because its
  `owner_user_id` + `visibility` model needs to know *which* of two
  people owns or is sharing an item** — a shared token cannot express
  that distinction.

Neither pattern is migrated toward the other:

- PropTrack, Wealth Ledger, and TripOrganiser are **not** moved to
  per-user auth — they have no multi-user data model to protect, and
  doing so would touch production systems for no user-facing benefit.
- OmniHub is **not** moved down to the shared-token model — that would
  discard the one property (real per-user identity) its ownership model
  depends on.

For authorization:

- Single-implicit-user apps: authorization is effectively "on the
  Tailscale network or not" — no finer-grained model is required.
- Multi-user apps (currently only OmniHub): authorization is
  `owner_user_id` + a `visibility` flag (private/shared) per record,
  enforced at the API layer on every read/write, not only in the UI.

Future applications choose whichever pattern matches their actual data
model at design time, using this section as the deciding rule, rather
than defaulting to whatever the previous application used.

---

# 29. Standardization Philosophy (Architecture Decision Record)

*(Fleet-wide mandatory principle)*

**Decision:** Where an application already works and a difference from
this standard does not represent a real risk (data loss, a security gap,
or a genuine mismatch between an app's data model and its access-control
model), this standard documents and accepts the difference rather than
requiring code changes to remove it. Standardization targets the
*principles* — how a new application should be built, which gaps are
real and must close, which patterns are intentional — not a mandate that
every existing application's code converge to look identical.

**Rationale:**

1. Rewriting working software to satisfy a style guide is pure risk.
   PropTrack is in production; Wealth Ledger and TripOrganiser are
   stable. Surface-level inconsistencies (framework choice, folder names)
   cause no defect, security gap, or user-facing harm. Changing them buys
   uniformity and nothing else, at real risk to systems this standard
   explicitly protects (§2).
2. Not all differences are the same kind of thing. A framework choice is
   a taste/legacy difference. A missing backup (§23) is an operational
   risk. A mismatched auth model (§28) is either a bug or a deliberate
   design choice depending on whether the app's data actually needs
   per-user distinction. Classifying each deviation — mandatory,
   recommended, accepted exception, or opportunistic — lets effort go
   where the risk actually is, instead of either fixing everything or
   ignoring everything uniformly.
3. Opportunistic improvement (§14, §5) compounds without ever requiring a
   dedicated "align app X to the standard" project.
4. A standard that only future applications must follow in full, while
   past applications are grandfathered on anything non-critical, stays
   credible. Demanding retroactive uniformity on cosmetic points is the
   kind of rule that erodes over time because it is expensive and
   low-value; a standard that only bites where it matters (backups,
   secrets, release traceability, auth matching data model) is one
   that's actually worth enforcing next time.

**Consequences:**

- New applications are built to the full standard from the start.
- Existing applications are only required to close identified real gaps
  (currently: backup automation, §23; release tagging, §10) —
  everything else is opportunistic (§5, §27) or explicitly grandfathered
  (§27).
- This document, not any single app's code, is the fleet's source of
  truth for "how do we do things here." An app diverges from it only by
  being listed as a named accepted exception (§27), never silently.
- This decision should be revisited if an accepted exception starts
  causing real problems (e.g. Fastify vs. Express becomes a genuine
  context-switching cost, or Wealth Ledger's layout actively confuses
  future work) — at that point re-evaluate it rather than assuming it is
  permanent forever.

**Explicitly deferred, not decided:**

- Whether to adopt structured/leveled logging fleet-wide (currently bare
  `console.*` everywhere) — not urgent at today's scale; revisit if
  request volume grows or alerting becomes a need.
- Whether a shared internal npm package (e.g. an API-helper or UI-kit
  package) is ever worthwhile — not recommended at the current fleet size
  of four applications; revisit only if a fifth or sixth application
  appears and the coordination overhead starts to pay for itself.

---

# 30. Final Principle

*(Fleet-wide mandatory)*

The most important rule is:

    DEVELOPMENT MAY BREAK TEST.

    TEST MUST NEVER BREAK PRODUCTION.

    PRODUCTION MUST ONLY CHANGE THROUGH AN EXPLICITLY
    AUTHORIZED RELEASE.

GitHub provides the history.

Migrations provide the database history.

Production tags provide rollback points.

The NAS provides the runtime.

This standard's own tiering (§0, "How to read this standard") provides
the architecture history: what every app must do, what new apps should
do by default, what is permanently and deliberately different, and what
is worth improving only when the opportunity already exists.
