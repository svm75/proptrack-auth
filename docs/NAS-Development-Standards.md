# NAS Development & Production Standard

## Purpose

This document defines the standard development, testing, database,
Git, deployment and rollback process for applications running on the
Synology NAS.

This standard applies to all applications hosted on the NAS, including:

- PropTrack
- Wealth Ledger
- TripOrganiser
- future applications

GitHub is the source of truth for application source code and database
migration history.

Production is the currently deployed, known-good application.

Development and testing must never compromise production.

---

# 1. Environment Model

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

Production application code lives under:

    /volume1/docker/<application>/

Example:

    /volume1/docker/proptracker/
    /volume1/docker/wealth-ledger/
    /volume1/docker/trip-organizer/

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

---

# 4. Persistent Application Data

Application data must be separated from application source/deployment files.

Where an application requires persistent files, use:

    /volume1/App/<ApplicationName>/

Examples:

    /volume1/App/PropTracker/Documents/
    /volume1/App/WealthLedger/
    /volume1/App/TripOrganiser/

The exact structure is application-specific.

Do not store persistent production documents inside Docker build
directories unless explicitly required by the application's architecture.

---

# 5. PostgreSQL Standard

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

### Absolute rule

TEST must NEVER connect to a production application database.

DEVELOPMENT must NEVER connect to a production application database.

---

# 6. Database Schema Changes

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

---

# 7. Destructive Database Changes

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

Every production release must have a Git tag.

Example:

    v2.0.0-nas
    v2.1.0-nas
    v2.2.0-nas

The tag must point to the exact commit deployed to production.

Production tags must never be overwritten or force-updated.

A production tag is a rollback point.

---

# 11. Rollback

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

---

# 12. Development Workflow

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

---

# 15. Production Deployment Rule

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

If a secret is accidentally discovered in the repository:

STOP.

Do not commit it.

Do not print it.

Report the issue and resolve it before proceeding.

---

# 19. Deployment Verification

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

The NAS runtime is NOT the source of truth for application source code.

---

# 21. Standard Release Model

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

# 23. Final Principle

The most important rule is:

    DEVELOPMENT MAY BREAK TEST.

    TEST MUST NEVER BREAK PRODUCTION.

    PRODUCTION MUST ONLY CHANGE THROUGH AN EXPLICITLY
    AUTHORIZED RELEASE.

GitHub provides the history.

Migrations provide the database history.

Production tags provide rollback points.

The NAS provides the runtime.