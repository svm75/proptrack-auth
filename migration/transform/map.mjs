// PropTrack V2 — Step 5 deterministic Dataverse -> PostgreSQL row mapping.
// One function per target table, columns in the exact order/names of
// db/001_schema.sql. Identical input always produces identical output
// (no randomness, no wall-clock reads except created_at/updated_at, which
// the target schema itself defaults via now() at INSERT time — this layer
// never fabricates those, it only sets business columns).
//
// Every coalesce below is documented and limited to cases the approved
// schema requires (a NOT NULL column whose own DEFAULT the schema already
// declares) — never an invented value.

import { str, bool, decimalOrDefault, decimal, timestamp, dateOnly, uuid } from './lib.mjs';
import { LEGACY_ORPHAN_IDS } from './legacy-orphans.mjs';

export function mapProperties(r) {
  return {
    id: uuid(r.cr9b5_pt_propertyid),
    name: str(r.cr9b5_name),
    short_id: str(r.cr9b5_shortid),
    address: str(r.cr9b5_address),
    notes: str(r.cr9b5_notes),
    google_drive_folder_id: str(r.svm_pt_googledrivefolderid),
  };
}

export function mapContacts(r) {
  return {
    id: uuid(r.cr9b5_pt_contactid),
    name: str(r.cr9b5_name),
    role: r.cr9b5_role,
    email: str(r.cr9b5_email),
    tax_id: str(r.cr9b5_taxid),
    default_description: str(r.cr9b5_defaultdescription),
    // regular_supplier BOOLEAN NOT NULL DEFAULT false — schema's own default applied when source is null.
    regular_supplier: bool(r.cr9b5_regularsupplier, false),
    default_category_id: uuid(r._svm_defaultcategory_value),
  };
}

export function mapReferenceData(r) {
  return {
    id: uuid(r.cr9b5_pt_referenceid),
    value: str(r.cr9b5_value),
    reference_type: r.cr9b5_referencetype,
    sort_order: r.cr9b5_sortorder,
  };
}

export function mapSupplierContracts(r) {
  return {
    id: uuid(r.svm_pt_suppliercontractid),
    contact_id: uuid(r._svm_pt_contact_value),
    property_id: uuid(r._svm_property_value),
    all_properties: bool(r.svm_pt_allproperties, false),
    contract_count: r.svm_pt_contractcount ?? 1,
    default_category_id: uuid(r._svm_defaultcategory_value),
    default_description: str(r.svm_pt_defaultdescription),
    active: bool(r.svm_pt_active, true),
    // Step 5A: exactly the 5 GUIDs Eye 2 approved as preserved legacy
    // exceptions (missing contact_id at source) — see legacy-orphans.mjs.
    is_legacy_orphan: LEGACY_ORPHAN_IDS.supplier_contracts.has(r.svm_pt_suppliercontractid),
  };
}

export function mapInvoices(r) {
  const isAnomaly = r.cr9b5_year === 1962;
  return {
    id: uuid(r.cr9b5_pt_invoiceid),
    internal_id: str(r.cr9b5_internalid),
    global_sequence: r.cr9b5_globalsequence,
    year: r.cr9b5_year,
    type: r.cr9b5_type,
    invoice_date: timestamp(r.cr9b5_date),
    description: str(r.cr9b5_description),
    property_id: uuid(r._cr9b5_property_value),
    all_properties: bool(r.cr9b5_allproperties, false),
    contact_id: uuid(r._cr9b5_contact_value),
    category_id: uuid(r._cr9b5_categoryid_value),
    base_amount: decimalOrDefault(r.cr9b5_baseamount, 0),
    tax_amount: decimalOrDefault(r.cr9b5_taxamount, 0),
    total_gross: decimalOrDefault(r.cr9b5_totalgross, 0),
    tax_rate: str(r.cr9b5_taxrate),
    tax_is_manual: bool(r.cr9b5_taxismanual, false),
    booking_reference: str(r.cr9b5_bookingreference),
    check_in: timestamp(r.cr9b5_checkin),
    check_out: timestamp(r.cr9b5_checkout),
    nights: r.cr9b5_nights,
    days: r.cr9b5_days,
    adults: r.cr9b5_adults,
    children: r.cr9b5_children,
    babies: r.cr9b5_babies,
    google_drive_folder_id: str(r.svm_pt_googledrivefolderid),
    // statecode: 0 = Active, 1 = Inactive (Dataverse convention) -> is_cancelled boolean.
    is_cancelled: r.statecode === 1,
    is_flagged_anomaly: isAnomaly,
  };
}

export function mapInvoiceComments(r) {
  return {
    id: uuid(r.svm_pt_invoicecommentid),
    invoice_id: uuid(r._svm_invoice_value),
    name: str(r.svm_pt_name),
    comment: str(r.svm_pt_comment),
    // No display-name annotation was requested from the Web API (raw values
    // only, per export design) — _createdby_value is the Dataverse system
    // user's GUID. Preserved as-is rather than fabricating a friendly name
    // we don't have.
    created_by: str(r._createdby_value),
    created_at: timestamp(r.createdon),
    // Step 5A: exactly the 5 GUIDs Eye 2 approved as preserved legacy
    // exceptions (missing invoice_id at source — 100% of this table).
    is_legacy_orphan: LEGACY_ORPHAN_IDS.invoice_comments.has(r.svm_pt_invoicecommentid),
  };
}

export function mapInvoiceTemplates(r) {
  return {
    id: uuid(r.svm_pt_invoicetemplateid),
    name: str(r.svm_pt_name),
    type: r.svm_pt_type,
    category_id: uuid(r._svm_category_value),
    description: str(r.svm_pt_description),
    default_amount: decimal(r.svm_pt_defaultamount),
  };
}

export function mapAttachments(r) {
  return {
    id: uuid(r.cr9b5_pt_attachmentid),
    file_name: str(r.cr9b5_filename),
    google_drive_id: str(r.cr9b5_googledriveid),
    google_drive_url: str(r.cr9b5_googledriveurl),
    invoice_id: uuid(r._cr9b5_invoiceid_value),
    property_id: uuid(r._cr9b5_propertyid_value),
    property_id_invoice: uuid(r._cr9b5_propertyidinvoice_value),
    contact_id: uuid(r._cr9b5_contactid_value),
    attach_type_id: uuid(r._cr9b5_attachtype_value),
    reference_type: r.cr9b5_referencetype,
    uploaded_on: timestamp(r.cr9b5_uploadedon),
  };
}

export function mapForecastFlows(r) {
  return {
    id: uuid(r.cr9b5_pt_forecastflowid),
    name: str(r.cr9b5_name),
    type: r.cr9b5_type,
    frequency: r.cr9b5_frequency,
    days_of_week: str(r.cr9b5_daysofweek),
    start_date: dateOnly(r.cr9b5_startdate),
    end_date: dateOnly(r.cr9b5_enddate),
    // net/vat/gross NUMERIC NOT NULL DEFAULT 0 — schema's own default applied
    // when amount_source = Calculated (925060001) leaves these null at source.
    net_amount: decimalOrDefault(r.cr9b5_netamount, 0),
    vat_amount: decimalOrDefault(r.cr9b5_vatamount, 0),
    gross_amount: decimalOrDefault(r.cr9b5_grossamount, 0),
    vat_rate: str(r.cr9b5_vatrate),
    vat_is_manual: bool(r.cr9b5_vatismanual, false),
    all_properties: bool(r.cr9b5_allproperties, false),
    category_id: uuid(r._cr9b5_categoryid_value),
    contact_id: uuid(r._cr9b5_contactid_value),
    parent_flow_id: uuid(r._cr9b5_parentflowid_value), // resolved in load pass 2
    amount_source: r.svm_amountsource ?? 925060000, // Fixed is the schema's implicit default
    percentage: decimal(r.svm_percentage),
    notes: str(r.cr9b5_notes),
  };
}

export function mapForecastFlowProperties(r) {
  return {
    id: uuid(r.cr9b5_forecastpropertyid),
    name: str(r.cr9b5_name),
    forecast_flow_id: uuid(r._cr9b5_forecastflowid_value),
    property_id: uuid(r._cr9b5_propertyid_value),
  };
}

export function mapForecastScenarios(r) {
  return {
    id: uuid(r.svm_forecastscenarioid),
    name: str(r.svm_forecastscenario1),
    property_id: uuid(r._svm_property_value),
    income_adjustment_pct: decimal(r.svm_incomeadjustmentpct),
    expense_adjustment_pct: decimal(r.svm_expenseadjustmentpct),
    notes: str(r.svm_notes),
  };
}

export function mapForecastFlowComponents(r) {
  return {
    id: uuid(r.svm_forecastflowcomponentid),
    name: str(r.svm_name),
    source_flow_id: uuid(r._svm_sourceflow_value),
    target_flow_id: uuid(r._svm_targetflcow_value),
    direction: r.svm_direction,
    // Step 5A: the 1 GUID Eye 2 approved as a preserved legacy exception
    // (source/target/direction all NULL at source — an entirely empty row).
    is_legacy_orphan: LEGACY_ORPHAN_IDS.forecast_flow_components.has(r.svm_forecastflowcomponentid),
  };
}

export function mapOwnerOccupancies(r) {
  return {
    id: uuid(r.svm_pt_owneroccupancyid),
    name: str(r.svm_pt_name),
    property_id: uuid(r._svm_pt_property_value),
    from_date: dateOnly(r.svm_pt_fromdate),
    to_date: dateOnly(r.svm_pt_todate),
    adults: r.svm_pt_adults,
    children: r.svm_pt_children,
    babies: r.svm_pt_babies,
  };
}

export function mapActivityLogs(r) {
  return {
    id: uuid(r.cr9b5_pt_activitylogid),
    log_id: str(r.cr9b5_logid),
    action: r.cr9b5_action,
    table_name: r.cr9b5_tablemame,
    record_name: str(r.cr9b5_recordname),
    details: str(r.cr9b5_details),
    occurred_at: timestamp(r.cr9b5_timestamp),
    user_name: str(r.cr9b5_user),
    created_at: timestamp(r.createdon),
  };
}
