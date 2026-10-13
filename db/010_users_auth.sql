-- =============================================================================
-- PropTrack — real per-user login
-- =============================================================================
-- Depends on: 001_schema.sql .. 009_documents_comment.sql
--
-- Mirrors the sibling wealth-ledger app's migration 022_users_auth.sql and OmniHub's
-- db/001_schema.sql/016_user_admin_flag.sql exactly — same table shape, same bcrypt +
-- signed-cookie-session model (api/src/auth.ts). Replaces "reachability via Tailscale is the
-- access control" with real login; the existing API_AUTH_TOKEN shared-secret gate (api/src/auth.ts's
-- requireToken) stays as a second layer, not replaced by this.
--
-- Deliberately NO seed rows — a users row's whole reason to exist is a secret (password_hash)
-- that differs per environment (TEST's throwaway "test" vs PROD's real one); baking either into
-- a migration file would sit in git history forever. Seed with api/scripts/seed-user.ts instead.

SET search_path = proptrack;

CREATE TABLE IF NOT EXISTS proptrack.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  -- Can add/remove other users and reset anyone's password (api/src/auth.ts). Grants no other
  -- capability — every other authorization chokepoint in this app is unaffected.
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  -- Sven and Nadine's two accounts — see api/src/routes/usersRoutes.ts's delete guard.
  is_protected  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE proptrack.users IS 'Real per-user login (see api/src/auth.ts). Two protected accounts (is_protected) cannot be deleted; is_admin can manage other users.';

-- Reuses the shared function 003_audit_trigger.sql already defined. Deliberately NOT audited
-- (no equivalent trigger exists for this table anyway — audit_trigger.sql only ever covered
-- `properties` before this) since a before/after row snapshot would put password_hash values in
-- a second, differently-access-controlled place.
DROP TRIGGER IF EXISTS trg_set_updated_at ON proptrack.users;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.users
  FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();

-- Belt-and-braces alongside 004's ALTER DEFAULT PRIVILEGES (which should already cover a new
-- table automatically) — explicit, matching wealth-ledger's own migrations' convention of never
-- assuming a grant took effect. Substitute the role name for TEST (proptrack_test_app) if
-- applying there instead of PROD's proptrack_app.
GRANT SELECT, INSERT, UPDATE, DELETE ON proptrack.users TO proptrack_app;
