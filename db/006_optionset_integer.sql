-- =============================================================================
-- PropTrack V2 — OptionSet columns: SMALLINT -> INTEGER (Step 5C)
-- =============================================================================
-- NOT YET APPLIED to myplatform/proptrack. Prepared for Eye 2 review.
-- Does not modify 001-005 — additive migration 006, applied after 005.
--
-- ROOT CAUSE: db/001_schema.sql declared every Dataverse Choice/OptionSet
-- column as SMALLINT (range -32,768..32,767). Dataverse's actual custom
-- OptionSet codes are in the 233,100,000 / 925,060,000 range (see
-- migration.md §Choice Mapping) — every one of these columns overflows
-- SMALLINT on virtually any real, non-null value. This was not caught by
-- CREATE TABLE (Step 3, which does not validate data against types) or by
-- this migration's own JS pre-load validation (which checked Choice values
-- for domain membership but never checked whether the value's magnitude
-- fits the declared SQL type) — it surfaced only at actual INSERT time in
-- Step 5B, which failed cleanly with a full transaction rollback (0 rows
-- ever landed in any table).
--
-- FIX: widen exactly the 11 affected columns from SMALLINT to INTEGER
-- (range -2,147,483,648..2,147,483,647, comfortably covering Dataverse's
-- codes). This is a pure storage-capacity widening: the actual numeric
-- OptionSet values are NOT changed, NOT relabeled, NOT reinterpreted — the
-- Choice strategy from migration.md §Choice Mapping (raw numeric code,
-- table-scoped CHECK, no shared/global enum) is unchanged, just given a
-- column type that can actually hold the documented values. SMALLINT ->
-- INTEGER is a lossless, implicit-cast widening in PostgreSQL — no USING
-- clause, no data transformation, and every existing CHECK/FK/index/
-- NOT NULL constraint on these columns is preserved automatically (a plain
-- ALTER COLUMN ... TYPE INTEGER rewrites the column and any dependent index
-- in place; CHECK/FK constraints are re-validated against the same values
-- and still hold, since the values themselves are unchanged).
--
-- COMPLETE VERIFIED LIST (11 columns, 9 tables) — cross-checked against the
-- live schema (`information_schema.columns WHERE data_type='smallint'`,
-- confirms exactly these 11 exist, no others) and against the actual Step 4
-- export data for real overflow evidence where live rows exist:
--
--   table                      column           live data max value    exceeds SMALLINT?
--   activity_logs              action           233100003 (n=139)      yes
--   activity_logs              table_name       233100003 (n=139)      yes
--   attachments                reference_type   0 live rows            documented domain 233100000-233100002 (migration.md §Choice Mapping) — same overflow range, no live value to cite
--   contacts                   role             233100001 (n=219)      yes
--   forecast_flow_components   direction        925060001 (n=3)        yes (n=3, not 4 — the 1 legacy-orphan row has direction=NULL)
--   forecast_flows             amount_source    925060001 (n=9)        yes
--   forecast_flows             frequency        233100003 (n=9)        yes
--   forecast_flows             type             233100001 (n=9)        yes
--   invoice_templates          type             0 live rows            documented domain 925060000/925060001 (migration.md §Choice Mapping) — same overflow range, no live value to cite
--   invoices                   type             233100001 (n=882)      yes
--   reference_data             reference_type   233100006 (n=25)       yes
--
-- No other SMALLINT column in the schema is touched — `supplier_contracts.
-- contract_count`, `invoices.nights/days/adults/children/babies`,
-- `owner_occupancies.adults/children/babies`, `forecast_scenarios`'s
-- percentage fields (NUMERIC, not SMALLINT) etc. hold genuinely small
-- integers/decimals and are left exactly as designed.
-- =============================================================================

SET search_path = proptrack;

ALTER TABLE activity_logs
    ALTER COLUMN action TYPE INTEGER,
    ALTER COLUMN table_name TYPE INTEGER;

ALTER TABLE attachments
    ALTER COLUMN reference_type TYPE INTEGER;

ALTER TABLE contacts
    ALTER COLUMN role TYPE INTEGER;

ALTER TABLE forecast_flow_components
    ALTER COLUMN direction TYPE INTEGER;

ALTER TABLE forecast_flows
    ALTER COLUMN amount_source TYPE INTEGER,
    ALTER COLUMN frequency TYPE INTEGER,
    ALTER COLUMN type TYPE INTEGER;

ALTER TABLE invoice_templates
    ALTER COLUMN type TYPE INTEGER;

ALTER TABLE invoices
    ALTER COLUMN type TYPE INTEGER;

ALTER TABLE reference_data
    ALTER COLUMN reference_type TYPE INTEGER;

-- No CHECK constraint body changes — every existing chk_*_type / chk_*_
-- action / chk_*_direction / chk_*_frequency constraint compares the column
-- against the same documented numeric codes; those codes are unchanged and
-- fit comfortably in INTEGER, so the constraints continue to hold verbatim.
-- No FK touches any of these 11 columns (they are not lookup/FK columns).
-- No index is dropped or recreated by hand — PostgreSQL rebuilds any
-- dependent index (e.g. idx_invoices_year_type, idx_activity_logs_table_
-- action) automatically as part of ALTER COLUMN ... TYPE.
