-- =============================================================================
-- PropTrack V2 — Indexes (DESIGN ONLY, STEP 2, NOT EXECUTED)
-- =============================================================================
-- Depends on: 001_schema.sql
-- PKs and UNIQUE constraints already create their own indexes automatically;
-- this file covers additional indexes for FK columns (Postgres does not
-- auto-index FK columns) and the columns the app actually filters/sorts by
-- per docs/screens-overview.md and migration.md §9.

SET search_path = proptrack;

-- Foreign-key lookups (every *_id column not already covered by a UNIQUE
-- constraint gets a plain btree index — standard practice so ON DELETE
-- RESTRICT/CASCADE/SET NULL checks and join queries don't seq-scan).
CREATE INDEX idx_contacts_default_category_id        ON contacts (default_category_id);

CREATE INDEX idx_supplier_contracts_contact_id        ON supplier_contracts (contact_id);
CREATE INDEX idx_supplier_contracts_property_id       ON supplier_contracts (property_id);
CREATE INDEX idx_supplier_contracts_category_id       ON supplier_contracts (default_category_id);

CREATE INDEX idx_invoices_property_id                 ON invoices (property_id);
CREATE INDEX idx_invoices_contact_id                  ON invoices (contact_id);
CREATE INDEX idx_invoices_category_id                 ON invoices (category_id);
CREATE INDEX idx_invoices_internal_id                 ON invoices (internal_id); -- non-unique, see 001_schema.sql comment
CREATE INDEX idx_invoices_year_type                   ON invoices (year, type);   -- Invoices list filters by type/date range
CREATE INDEX idx_invoices_date                        ON invoices (invoice_date);
CREATE INDEX idx_invoices_property_year_seq            ON invoices (property_id, year, global_sequence); -- next-sequence-number lookup (order by desc, top 1)

CREATE INDEX idx_invoice_comments_invoice_id          ON invoice_comments (invoice_id);

CREATE INDEX idx_invoice_templates_category_id        ON invoice_templates (category_id);

CREATE INDEX idx_attachments_invoice_id               ON attachments (invoice_id);
CREATE INDEX idx_attachments_property_id              ON attachments (property_id);
CREATE INDEX idx_attachments_property_id_invoice      ON attachments (property_id_invoice);
CREATE INDEX idx_attachments_contact_id               ON attachments (contact_id);
CREATE INDEX idx_attachments_attach_type_id           ON attachments (attach_type_id);

CREATE INDEX idx_forecast_flows_category_id           ON forecast_flows (category_id);
CREATE INDEX idx_forecast_flows_contact_id            ON forecast_flows (contact_id);
CREATE INDEX idx_forecast_flows_parent_flow_id        ON forecast_flows (parent_flow_id);

CREATE INDEX idx_forecast_flow_properties_flow_id     ON forecast_flow_properties (forecast_flow_id);
CREATE INDEX idx_forecast_flow_properties_property_id ON forecast_flow_properties (property_id);

CREATE INDEX idx_forecast_scenarios_property_id       ON forecast_scenarios (property_id);

CREATE INDEX idx_forecast_flow_components_source      ON forecast_flow_components (source_flow_id);
CREATE INDEX idx_forecast_flow_components_target      ON forecast_flow_components (target_flow_id);

CREATE INDEX idx_owner_occupancies_property_id        ON owner_occupancies (property_id);
CREATE INDEX idx_owner_occupancies_date_range         ON owner_occupancies (property_id, from_date, to_date); -- overlap-warning queries

-- Activity Log: filterable by action/table/date range per §9.
CREATE INDEX idx_activity_logs_table_action           ON activity_logs (table_name, action);
CREATE INDEX idx_activity_logs_occurred_at            ON activity_logs (occurred_at);

-- Global Search touches name/short-id/tax-id/description columns across
-- Properties/Contacts/Invoices — trigram indexes are the natural fit but are
-- deferred to Step 3 as an implementation-time decision (needs pg_trgm
-- extension approval and is a performance tune, not a correctness
-- requirement for the migration itself).
