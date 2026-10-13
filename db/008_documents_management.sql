-- =============================================================================
-- PropTrack V2 — Document Management (Documents tab, Phase 1)
-- =============================================================================
-- Applied after 001-007. Turns proptrack.attachments from an upload-only side
-- feature into a reviewable, categorized, expiry-aware document store.
--
-- Document categories reuse the existing reference_data mechanism (same table
-- that already drives Property/Supplier/Client/Income-Category/Expense-Category
-- lists, managed via the generic Admin > Reference Data screen) rather than a
-- new fixed enum or a new admin screen — reference_type 233100007.
-- =============================================================================

-- Widen reference_data's allowed types to include Document Category.
ALTER TABLE proptrack.reference_data DROP CONSTRAINT chk_reference_data_type;
ALTER TABLE proptrack.reference_data ADD CONSTRAINT chk_reference_data_type CHECK (
    reference_type IN (233100000, 233100001, 233100002, 233100003, 233100004, 233100005, 233100006, 233100007)
    -- 233100000 Property (legacy) / 233100001 Supplier (legacy) / 233100002 Client (legacy)
    -- 233100003 Incoming Invoice / 233100004 Outgoing Invoice
    -- 233100005 Income Category / 233100006 Expense Category
    -- 233100007 Document Category (new — Documents tab)
);

-- Only meaningful when reference_type = 233100007: the folder new uploads in this
-- category default to (still user-editable per upload, not locked). NULL for every
-- other reference_type.
ALTER TABLE proptrack.reference_data ADD COLUMN default_folder_path TEXT;
COMMENT ON COLUMN proptrack.reference_data.default_folder_path IS
  'Document Category rows (reference_type 233100007) only: the destination folder new uploads in this category pre-fill to. NULL for every other reference_type.';

-- Seed a starter set of document categories — freely editable/extendable afterward
-- via Admin > Reference Data, same as any other reference_data list.
INSERT INTO proptrack.reference_data (value, reference_type, sort_order, default_folder_path) VALUES
    ('Contract',          233100007, 1, 'General/Contracts'),
    ('Invoice/Receipt',   233100007, 2, 'General/Invoices'),
    ('License/Permit',    233100007, 3, 'General/Licenses'),
    ('Tax Report',        233100007, 4, 'General/Tax Reports'),
    ('Insurance',         233100007, 5, 'General/Insurance'),
    ('Correspondence',    233100007, 6, 'General/Correspondence'),
    ('Photo',             233100007, 7, 'General/Photos'),
    ('Other',             233100007, 8, 'General');

-- attachments: category, dates, description/tags, and a Supplier Contract link
-- (alongside the existing property/invoice/contact ones).
ALTER TABLE proptrack.attachments
    ADD COLUMN category_id          UUID REFERENCES proptrack.reference_data(id) ON DELETE RESTRICT,
    ADD COLUMN valid_from_date      DATE,
    ADD COLUMN expiry_date          DATE,
    ADD COLUMN description          TEXT,
    ADD COLUMN tags                 TEXT[],
    ADD COLUMN period_year          INTEGER,
    ADD COLUMN supplier_contract_id UUID REFERENCES proptrack.supplier_contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN proptrack.attachments.category_id IS
  'FK to reference_data (reference_type 233100007, "Document Category"). Mandatory for new NAS-native uploads going forward; NULL on pre-existing rows.';
COMMENT ON COLUMN proptrack.attachments.valid_from_date IS
  'Mandatory (app-enforced) on new uploads — the document''s effective date. Also drives the yyyymmdd_ prefix on the stored filename.';
COMMENT ON COLUMN proptrack.attachments.expiry_date IS
  'Optional — renewal/expiry tracking for licenses, permits, insurance policies. Surfaced in the Documents tab and (Phase 2) AlertsBell.';
COMMENT ON COLUMN proptrack.attachments.period_year IS
  'Optional — filing/tax year for period-based documents (tax reports etc.), independent of valid_from_date.';

-- Not NOT NULL at the DB level: pre-existing (Google-Drive-era and Step-6/7-test)
-- rows have neither a category nor a valid_from_date and must not be broken by this
-- migration. Enforced as mandatory in the application layer for new uploads only.
