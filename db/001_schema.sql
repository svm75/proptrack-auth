-- =============================================================================
-- PropTrack V2 — Target PostgreSQL schema (DESIGN ONLY, STEP 2)
-- =============================================================================
-- NOT EXECUTED. NOT APPLIED to any database. For Eye 2 (ChatGPT) review only.
-- Written against the migration.md §Target PostgreSQL Schema design produced
-- in Step 2 of the Dataverse → PostgreSQL migration. Step 3 will actually
-- run (a reviewed version of) files like this against the Synology instance.
--
-- Conventions (matching the ~/Projects/TripOrganiser/db/ sibling-repo
-- precedent, chosen by the user as the target convention over the
-- wealth-ledger JSONB "records" store):
--   * One dedicated schema, one normalized table per Dataverse entity.
--   * snake_case identifiers; Dataverse's cr9b5_/svm_ prefixes and
--     publisher noise dropped entirely.
--   * Dataverse GUID primary keys preserved 1:1 as PostgreSQL UUID PKs
--     (Dataverse GUIDs already print in standard UUID text form).
--   * Dataverse Choice/OptionSet columns preserved as their RAW numeric
--     source code (SMALLINT + a table-scoped CHECK constraint), never
--     relabeled or merged into a shared/global enum. This is deliberate:
--     Invoices.type, ForecastFlows.type and InvoiceTemplates.type use
--     three mutually incompatible numeric ranges for "Income"/"Expense"
--     (see docs/schema.md quirk #2/#3) — keeping each column's own raw
--     code, scoped to its own table-specific CHECK, is what makes the
--     migration deterministic and trivially reversible (identity mapping,
--     no relabeling step to get wrong or to invert). Human-readable labels
--     are documented in migration.md §Choice Mapping and belong at the
--     API/domain layer (mirrring src/domain/types.ts's `as const` maps),
--     not baked into the column values.
--   * Dataverse statecode/statuscode replaced by explicit, purpose-named
--     booleans (is_cancelled on invoices, active on supplier_contracts) —
--     matching TripOrganiser migration 014's "replace Dataverse
--     state_code/status_code with an idiomatic flag" precedent, but named
--     per-table rather than a single generic is_active, because Invoice
--     cancellation and SupplierContract activity are different concepts.
--   * created_at/updated_at audit columns on every table (TripOrganiser
--     migrations 009/025 precedent); updated_at is trigger-maintained,
--     see 003_audit_trigger.sql.
--   * No ON DELETE CASCADE on any table carrying historical financial
--     data (Invoices, and anything invoices point at). See inline
--     comments per FK and migration.md §Foreign Keys and Constraints.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() for future app-generated rows

CREATE SCHEMA IF NOT EXISTS proptrack;
SET search_path = proptrack;

-- -----------------------------------------------------------------------------
-- properties  (Dataverse: cr9b5_pt_property / cr9b5_pt_properties)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.properties (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_propertyid
    name                     TEXT NOT NULL,                              -- cr9b5_name
    short_id                 TEXT NOT NULL,                              -- cr9b5_shortid (alt key svm_shortid)
    address                  TEXT,                                       -- cr9b5_address
    notes                    TEXT,                                       -- cr9b5_notes
    google_drive_folder_id   TEXT,                                       -- svm_pt_googledrivefolderid
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_properties_short_id UNIQUE (short_id)                  -- mirrors Dataverse alternate key svm_shortid
);
COMMENT ON TABLE proptrack.properties IS 'Dataverse: cr9b5_pt_property. Register of managed properties.';

-- -----------------------------------------------------------------------------
-- reference_data  (Dataverse: cr9b5_pt_reference / cr9b5_pt_references)
-- Renamed from "References" — a reserved SQL keyword and a poor table name
-- given the table's real role (generic picklist rows discriminated by type).
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.reference_data (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- cr9b5_pt_referenceid
    value            TEXT NOT NULL,                               -- cr9b5_value
    reference_type   SMALLINT NOT NULL,                           -- cr9b5_referencetype
    sort_order       INTEGER,                                     -- cr9b5_sortorder
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_reference_data_type CHECK (
        reference_type IN (233100000, 233100001, 233100002, 233100003, 233100004, 233100005, 233100006)
        -- 233100000 Property (legacy) / 233100001 Supplier (legacy) / 233100002 Client (legacy)
        -- 233100003 Incoming Invoice / 233100004 Outgoing Invoice
        -- 233100005 Income Category / 233100006 Expense Category
        -- (233100005/233100006 are the live-but-previously-undocumented values,
        -- see docs/schema.md "known schema quirks" #4)
    )
);
COMMENT ON TABLE proptrack.reference_data IS 'Dataverse: cr9b5_pt_reference. "Category" throughout the app = a row here with reference_type 233100005/233100006.';

-- -----------------------------------------------------------------------------
-- contacts  (Dataverse: cr9b5_pt_contact / cr9b5_pt_contacts)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.contacts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_contactid
    name                  TEXT NOT NULL,                              -- cr9b5_name
    role                  SMALLINT NOT NULL,                          -- cr9b5_role
    email                 TEXT,                                       -- cr9b5_email
    tax_id                TEXT,                                       -- cr9b5_taxid
    default_description   TEXT,                                       -- cr9b5_defaultdescription
    regular_supplier      BOOLEAN NOT NULL DEFAULT false,              -- cr9b5_regularsupplier (app keeps this in sync from supplier_contracts)
    default_category_id   UUID REFERENCES proptrack.reference_data(id) ON DELETE SET NULL, -- svm_defaultcategory
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_contacts_role CHECK (role IN (233100000, 233100001)) -- Supplier / Client
);
COMMENT ON TABLE proptrack.contacts IS 'Dataverse: cr9b5_pt_contact. Suppliers and clients share this table, distinguished by role.';

-- -----------------------------------------------------------------------------
-- supplier_contracts  (Dataverse: svm_pt_suppliercontract / svm_pt_suppliercontracts)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.supplier_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- svm_pt_suppliercontractid
    contact_id            UUID NOT NULL REFERENCES proptrack.contacts(id) ON DELETE RESTRICT,   -- svm_pt_contact
    property_id           UUID REFERENCES proptrack.properties(id) ON DELETE RESTRICT,          -- svm_property
    all_properties        BOOLEAN NOT NULL DEFAULT false,             -- svm_pt_allproperties
    contract_count        INTEGER NOT NULL DEFAULT 1,                 -- svm_pt_contractcount
    default_category_id   UUID REFERENCES proptrack.reference_data(id) ON DELETE SET NULL, -- svm_defaultcategory
    default_description   TEXT,                                       -- svm_pt_defaultdescription (also primary name)
    active                BOOLEAN NOT NULL DEFAULT true,               -- svm_pt_active
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_supplier_contracts_property CHECK (all_properties OR property_id IS NOT NULL),
    CONSTRAINT chk_supplier_contracts_count CHECK (contract_count >= 1)
);
COMMENT ON TABLE proptrack.supplier_contracts IS 'Dataverse: svm_pt_suppliercontract. Supplier↔property billing relationship, drives Regular Invoices.';

-- -----------------------------------------------------------------------------
-- invoices  (Dataverse: cr9b5_pt_invoice / cr9b5_pt_invoices)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.invoices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_invoiceid
    internal_id              TEXT,                                      -- cr9b5_internalid (nullable — "No/Auto Internal ID")
    global_sequence          INTEGER,                                   -- cr9b5_globalsequence
    year                     INTEGER NOT NULL,                          -- cr9b5_year
    type                     SMALLINT NOT NULL,                         -- cr9b5_type (Expense=233100000/Income=233100001 — OPPOSITE of forecast_flows.type)
    invoice_date             TIMESTAMPTZ NOT NULL,                      -- cr9b5_date
    description              TEXT,                                      -- cr9b5_description
    property_id              UUID REFERENCES proptrack.properties(id) ON DELETE RESTRICT, -- cr9b5_property
    all_properties            BOOLEAN NOT NULL DEFAULT false,           -- cr9b5_allproperties
    contact_id                UUID REFERENCES proptrack.contacts(id) ON DELETE RESTRICT,  -- cr9b5_contact
    category_id                UUID REFERENCES proptrack.reference_data(id) ON DELETE RESTRICT, -- cr9b5_categoryid
    base_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,          -- cr9b5_baseamount
    tax_amount                NUMERIC(14,2) NOT NULL DEFAULT 0,          -- cr9b5_taxamount
    total_gross                NUMERIC(14,2) NOT NULL DEFAULT 0,         -- cr9b5_totalgross
    tax_rate                  TEXT,                                     -- cr9b5_taxrate (kept as source text, e.g. "7" or "n/a")
    tax_is_manual              BOOLEAN NOT NULL DEFAULT false,           -- cr9b5_taxismanual
    booking_reference           TEXT,                                   -- cr9b5_bookingreference
    check_in                   TIMESTAMPTZ,                             -- cr9b5_checkin
    check_out                  TIMESTAMPTZ,                             -- cr9b5_checkout
    nights                     INTEGER,                                 -- cr9b5_nights
    days                       INTEGER,                                 -- cr9b5_days
    adults                     INTEGER,                                 -- cr9b5_adults
    children                   INTEGER,                                 -- cr9b5_children
    babies                     INTEGER,                                 -- cr9b5_babies
    google_drive_folder_id      TEXT,                                   -- svm_pt_googledrivefolderid
    is_cancelled                BOOLEAN NOT NULL DEFAULT false,         -- statecode=Inactive -> true (soft delete, never hard-deleted)
    is_flagged_anomaly           BOOLEAN NOT NULL DEFAULT false,        -- migration-set flag for known bad data (e.g. the 2 year-1962 records) — see migration.md
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoices_type CHECK (type IN (233100000, 233100001)),
    CONSTRAINT chk_invoices_property CHECK (all_properties OR property_id IS NOT NULL)
);
COMMENT ON TABLE proptrack.invoices IS 'Dataverse: cr9b5_pt_invoice. Core transaction ledger (income and expense). type: Expense=233100000/Income=233100001.';
COMMENT ON COLUMN proptrack.invoices.internal_id IS 'No DB-level UNIQUE constraint: source system never enforced this server-side either (docs/schema.md quirk #7) — enforcing it now would be a behavior change on migrated data that may already contain duplicates. Revisit only as a deliberate, separately-reviewed decision.';

-- -----------------------------------------------------------------------------
-- invoice_comments  (Dataverse: svm_pt_invoicecomment / svm_pt_invoicecomments)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.invoice_comments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- svm_pt_invoicecommentid
    invoice_id    UUID NOT NULL REFERENCES proptrack.invoices(id) ON DELETE CASCADE, -- svm_invoice
    name          TEXT,                                       -- svm_pt_name (primary name, not surfaced in UI)
    comment       TEXT NOT NULL,                               -- svm_pt_comment
    created_by    TEXT,                                        -- Dataverse createdby (system column, no dedicated field)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()            -- Dataverse createdon
);
COMMENT ON TABLE proptrack.invoice_comments IS 'Dataverse: svm_pt_invoicecomment. Comment thread on an invoice. ON DELETE CASCADE: comments have no meaning detached from their invoice, and invoices are never hard-deleted in practice (soft delete via is_cancelled).';

-- -----------------------------------------------------------------------------
-- invoice_templates  (Dataverse: svm_pt_invoicetemplate / svm_pt_invoicetemplates)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.invoice_templates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- svm_pt_invoicetemplateid
    name              TEXT NOT NULL,                              -- svm_pt_name
    type              SMALLINT NOT NULL,                          -- svm_pt_type (Income=925060000/Expense=925060001 — a THIRD, unrelated numeric range)
    category_id       UUID REFERENCES proptrack.reference_data(id) ON DELETE SET NULL, -- svm_category
    description       TEXT,                                       -- svm_pt_description
    default_amount    NUMERIC(14,2),                              -- svm_pt_defaultamount
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_invoice_templates_type CHECK (type IN (925060000, 925060001))
);
COMMENT ON TABLE proptrack.invoice_templates IS 'Dataverse: svm_pt_invoicetemplate. 0 live records at Step 1 discovery; table still designed in full per instructions.';

-- -----------------------------------------------------------------------------
-- attachments  (Dataverse: cr9b5_pt_attachment / cr9b5_pt_attachments)
-- No binary storage — Google Drive ID/URL only, per user decision (§G).
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.attachments (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_attachmentid
    file_name              TEXT NOT NULL,                              -- cr9b5_filename
    google_drive_id        TEXT,                                       -- cr9b5_googledriveid
    google_drive_url       TEXT,                                       -- cr9b5_googledriveurl
    invoice_id             UUID REFERENCES proptrack.invoices(id) ON DELETE CASCADE,   -- cr9b5_invoiceid
    property_id            UUID REFERENCES proptrack.properties(id) ON DELETE CASCADE, -- cr9b5_propertyid
    property_id_invoice    UUID REFERENCES proptrack.properties(id) ON DELETE SET NULL, -- cr9b5_propertyidinvoice (present, unused by app code — preserved per "do not lose fields")
    contact_id             UUID REFERENCES proptrack.contacts(id) ON DELETE SET NULL,   -- cr9b5_contactid
    attach_type_id         UUID REFERENCES proptrack.reference_data(id) ON DELETE SET NULL, -- cr9b5_attachtype
    reference_type         SMALLINT,                                    -- cr9b5_referencetype (independent picklist, NOT reference_data.reference_type)
    uploaded_on             TIMESTAMPTZ,                                -- cr9b5_uploadedon
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_attachments_reference_type CHECK (reference_type IS NULL OR reference_type IN (233100000, 233100001, 233100002))
);
COMMENT ON TABLE proptrack.attachments IS 'Dataverse: cr9b5_pt_attachment. 0 live records at Step 1 discovery. Google Drive ID/URL model only, no binary storage — matches user decision to not redesign this feature.';

-- -----------------------------------------------------------------------------
-- forecast_flows  (Dataverse: cr9b5_pt_forecastflow / cr9b5_pt_forecastflows)
-- Self-referencing (parent_flow_id) for the version-history chain.
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.forecast_flows (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_forecastflowid
    name              TEXT NOT NULL,                              -- cr9b5_name
    type              SMALLINT NOT NULL,                          -- cr9b5_type (Income=233100000/Expense=233100001 — OPPOSITE of invoices.type)
    frequency         SMALLINT NOT NULL,                          -- cr9b5_frequency
    days_of_week      TEXT,                                       -- cr9b5_daysofweek
    start_date        DATE NOT NULL,                              -- cr9b5_startdate
    end_date          DATE,                                       -- cr9b5_enddate
    net_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,           -- cr9b5_netamount
    vat_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,           -- cr9b5_vatamount
    gross_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,           -- cr9b5_grossamount
    vat_rate          TEXT,                                       -- cr9b5_vatrate
    vat_is_manual     BOOLEAN NOT NULL DEFAULT false,              -- cr9b5_vatismanual
    all_properties    BOOLEAN NOT NULL DEFAULT false,              -- cr9b5_allproperties
    category_id       UUID REFERENCES proptrack.reference_data(id) ON DELETE SET NULL, -- cr9b5_categoryid
    contact_id        UUID REFERENCES proptrack.contacts(id) ON DELETE SET NULL,       -- cr9b5_contactid
    parent_flow_id    UUID REFERENCES proptrack.forecast_flows(id) ON DELETE SET NULL, -- cr9b5_parentflowid (self)
    amount_source     SMALLINT NOT NULL DEFAULT 925060000,        -- svm_amountsource (Fixed=925060000/Calculated=925060001)
    percentage        NUMERIC(7,4),                                -- svm_percentage
    notes             TEXT,                                        -- cr9b5_notes
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_forecast_flows_type CHECK (type IN (233100000, 233100001)),
    CONSTRAINT chk_forecast_flows_frequency CHECK (frequency IN (233100000,233100001,233100002,233100003,233100004,233100005,233100006)),
    CONSTRAINT chk_forecast_flows_amount_source CHECK (amount_source IN (925060000, 925060001)),
    CONSTRAINT chk_forecast_flows_no_self_parent CHECK (parent_flow_id IS DISTINCT FROM id)
);
COMMENT ON TABLE proptrack.forecast_flows IS 'Dataverse: cr9b5_pt_forecastflow. Planned/expected cash flows. type numbering is the REVERSE of invoices.type — see migration.md §Choice Mapping.';

-- -----------------------------------------------------------------------------
-- forecast_flow_properties  (Dataverse: cr9b5_forecastproperty / cr9b5_forecastproperties)
-- Pure junction table: Properties <-> ForecastFlows.
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.forecast_flow_properties (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_forecastpropertyid
    name               TEXT,                                       -- cr9b5_name
    forecast_flow_id   UUID NOT NULL REFERENCES proptrack.forecast_flows(id) ON DELETE CASCADE, -- cr9b5_forecastflowid
    property_id        UUID NOT NULL REFERENCES proptrack.properties(id) ON DELETE CASCADE,     -- cr9b5_propertyid
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_forecast_flow_properties UNIQUE (forecast_flow_id, property_id)
);
COMMENT ON TABLE proptrack.forecast_flow_properties IS 'Dataverse: cr9b5_forecastproperty. Junction (many-to-many via two N:1 lookups in Dataverse). ON DELETE CASCADE both sides: a junction row is meaningless once either side is gone.';

-- -----------------------------------------------------------------------------
-- forecast_scenarios  (Dataverse: svm_forecastscenario / svm_forecastscenarios)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.forecast_scenarios (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- svm_forecastscenarioid
    name                        TEXT NOT NULL,                              -- svm_forecastscenario1
    property_id                 UUID REFERENCES proptrack.properties(id) ON DELETE CASCADE, -- svm_property (optional — portfolio-wide when NULL)
    income_adjustment_pct       NUMERIC(7,4) NOT NULL,                      -- svm_incomeadjustmentpct
    expense_adjustment_pct      NUMERIC(7,4) NOT NULL,                      -- svm_expenseadjustmentpct
    notes                       TEXT,                                      -- svm_notes
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE proptrack.forecast_scenarios IS 'Dataverse: svm_forecastscenario. Newly documented in this Step (was missing from docs/schema.md, see migration.md §15 item 2).';

-- -----------------------------------------------------------------------------
-- forecast_flow_components  (Dataverse: svm_forecastflowcomponent / svm_forecastflowcomponents)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.forecast_flow_components (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- svm_forecastflowcomponentid
    name              TEXT,                                       -- svm_name
    source_flow_id    UUID NOT NULL REFERENCES proptrack.forecast_flows(id) ON DELETE CASCADE, -- svm_sourceflow
    target_flow_id    UUID NOT NULL REFERENCES proptrack.forecast_flows(id) ON DELETE CASCADE, -- svm_targetflcow (sic — Dataverse logical-name typo, permanent upstream)
    direction         SMALLINT NOT NULL,                          -- svm_direction (Add=925060000/Subtract=925060001)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_forecast_flow_components_direction CHECK (direction IN (925060000, 925060001)),
    CONSTRAINT chk_forecast_flow_components_distinct CHECK (source_flow_id <> target_flow_id)
);
COMMENT ON TABLE proptrack.forecast_flow_components IS 'Dataverse: svm_forecastflowcomponent. Newly documented in this Step. Column name target_flow_id corrects the source svm_targetflcow typo at the Postgres layer only — the Dataverse-side name is preserved in the mapping table, not reproduced here.';

-- -----------------------------------------------------------------------------
-- owner_occupancies  (Dataverse: svm_pt_owneroccupancy / svm_pt_owneroccupancies)
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.owner_occupancies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- svm_pt_owneroccupancyid
    name          TEXT,                                       -- svm_pt_name (auto-built "{property} {from}–{to}")
    property_id   UUID NOT NULL REFERENCES proptrack.properties(id) ON DELETE CASCADE, -- svm_pt_property
    from_date     DATE NOT NULL,                               -- svm_pt_fromdate
    to_date       DATE NOT NULL,                                -- svm_pt_todate
    adults        INTEGER,                                     -- svm_pt_adults
    children      INTEGER,                                     -- svm_pt_children
    babies        INTEGER,                                     -- svm_pt_babies
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_owner_occupancies_dates CHECK (to_date > from_date)
    -- No overlap EXCLUDE constraint: current app behavior is a client-side,
    -- non-blocking warning only (docs/schema.md quirk #9/#10) — deliberately
    -- not promoted to a DB constraint in this step; see migration.md §Business
    -- Rule Placement, "booking/occupancy overlap warning".
);
COMMENT ON TABLE proptrack.owner_occupancies IS 'Dataverse: svm_pt_owneroccupancy. Owner-blocked date ranges per property.';

-- -----------------------------------------------------------------------------
-- activity_logs  (Dataverse: cr9b5_pt_activitylog / cr9b5_pt_activitylogs)
-- Append-only audit trail. Deliberately NO foreign keys — mirrors the
-- Dataverse design ("free-standing facts", survives the underlying record
-- being deleted). See docs/schema.md.
-- -----------------------------------------------------------------------------
CREATE TABLE proptrack.activity_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- cr9b5_pt_activitylogid
    log_id         TEXT,                                       -- cr9b5_logid (primary name)
    action         SMALLINT NOT NULL,                          -- cr9b5_action
    table_name     SMALLINT NOT NULL,                          -- cr9b5_tablemame (sic, source typo)
    record_name    TEXT,                                       -- cr9b5_recordname
    details        TEXT,                                       -- cr9b5_details
    occurred_at    TIMESTAMPTZ NOT NULL,                        -- cr9b5_timestamp
    user_name      TEXT,                                       -- cr9b5_user (plain text, not a system-user lookup)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_activity_logs_action CHECK (action IN (233100000, 233100001, 233100002, 233100003)),
    CONSTRAINT chk_activity_logs_table CHECK (table_name IN (233100000, 233100001, 233100002, 233100003, 233100004, 233100005))
);
COMMENT ON TABLE proptrack.activity_logs IS 'Dataverse: cr9b5_pt_activitylog. Append-only, no FKs by design (see docs/schema.md). table_name 233100005 exists in the source picklist but is unused (Owner Occupancy activity is logged under Property).';
