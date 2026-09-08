-- =============================================================================
-- PropTrack V2 — least-privilege application role (DESIGN ONLY, STEP 2, NOT EXECUTED)
-- =============================================================================
-- Depends on: 001_schema.sql .. 003_audit_trigger.sql
-- Matches TripOrganiser migration 026's precedent: a dedicated NOLOGIN-free
-- but non-superuser role, no DDL rights, row data access only. Password is
-- deliberately not set here — set out-of-band on the NAS and stored only in
-- its secret store / a git-ignored .env consumed by the future API service.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'proptrack_app') THEN
        CREATE ROLE proptrack_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA proptrack TO proptrack_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA proptrack TO proptrack_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA proptrack
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO proptrack_app;

-- No sequence/DDL/function-execute privileges are granted: all primary keys
-- are application/migration-generated UUIDs (no serial/identity sequences),
-- and the updated_at trigger function's definer-context execution does not
-- require an explicit EXECUTE grant for ordinary DML to fire it.
--
-- Set the password immediately after, as a separate step whose output is
-- not logged/committed:
--   ALTER ROLE proptrack_app WITH PASSWORD '<generated-secret>';
