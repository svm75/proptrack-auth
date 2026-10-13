-- =============================================================================
-- PropTrack V2 — updated_at trigger (DESIGN ONLY, STEP 2, NOT EXECUTED)
-- =============================================================================
-- Depends on: 001_schema.sql
-- One shared trigger function, attached to every application table that
-- carries an updated_at column, stamping it on every UPDATE. Matches
-- TripOrganiser migration 025's precedent exactly (one function, one
-- trigger per table). activity_logs and invoice_comments are append-only
-- (no updated_at column, see 001_schema.sql) and are excluded.

SET search_path = proptrack;

CREATE FUNCTION proptrack.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.properties
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.reference_data
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.contacts
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.supplier_contracts
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.invoices
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.invoice_templates
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.attachments
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.forecast_flows
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.forecast_flow_properties
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.forecast_scenarios
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.forecast_flow_components
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON proptrack.owner_occupancies
    FOR EACH ROW EXECUTE FUNCTION proptrack.set_updated_at();
