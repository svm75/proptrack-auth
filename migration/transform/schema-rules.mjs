// Mirrors db/001_schema.sql exactly (NOT NULL columns, CHECK domains, FKs).
// Used only for pre-load validation — never to alter data, only to detect
// where transformed rows would violate the approved, already-applied schema.

// Step 5A (db/005_legacy_orphan_exceptions.sql, not yet applied): three
// columns across three tables were relaxed from NOT NULL to nullable to
// preserve 11 pre-existing Dataverse rows Eye 2 approved as documented
// legacy exceptions — supplier_contracts.contact_id, invoice_comments.
// invoice_id, and forecast_flow_components.source_flow_id/target_flow_id/
// direction. Every other required-field rule is unchanged from Step 5.
export const REQUIRED = {
  properties: ['id', 'name', 'short_id'],
  contacts: ['id', 'name', 'role', 'regular_supplier'],
  reference_data: ['id', 'value', 'reference_type'],
  supplier_contracts: ['id', 'all_properties', 'contract_count', 'active', 'is_legacy_orphan'], // contact_id relaxed, Step 5A
  invoices: ['id', 'year', 'type', 'invoice_date', 'all_properties', 'base_amount', 'tax_amount', 'total_gross', 'tax_is_manual', 'is_cancelled', 'is_flagged_anomaly'],
  invoice_comments: ['id', 'comment', 'is_legacy_orphan'], // invoice_id relaxed, Step 5A
  invoice_templates: ['id', 'name', 'type'],
  attachments: ['id', 'file_name'],
  forecast_flows: ['id', 'name', 'type', 'frequency', 'start_date', 'net_amount', 'vat_amount', 'gross_amount', 'vat_is_manual', 'all_properties', 'amount_source'],
  forecast_flow_properties: ['id', 'forecast_flow_id', 'property_id'],
  forecast_scenarios: ['id', 'name', 'income_adjustment_pct', 'expense_adjustment_pct'],
  forecast_flow_components: ['id', 'is_legacy_orphan'], // source_flow_id/target_flow_id/direction relaxed, Step 5A
  owner_occupancies: ['id', 'property_id', 'from_date', 'to_date'],
  activity_logs: ['id', 'action', 'table_name', 'occurred_at'],
};

// Step 5C: db/006_optionset_integer.sql widens these 11 columns from
// SMALLINT to INTEGER (root cause of the Step 5B load failure — Dataverse's
// OptionSet codes, 233,100,000+/925,060,000+, overflow SMALLINT's ±32,767
// range). This map lets pre-load validation actually check a value's
// magnitude against its column's declared SQL type range — the exact check
// that was missing before Step 5B (domain-membership was checked, magnitude
// never was) — so a future regression is caught here, not at INSERT time.
const SQL_TYPE_RANGE = {
  SMALLINT: [-32768, 32767],
  INTEGER: [-2147483648, 2147483647],
};

// table.column -> SQL type, for every column CHOICE_DOMAINS covers. All 11
// Step 5C columns are INTEGER post-006; nothing else in the schema needs
// this check (every other numeric column is NUMERIC or already INTEGER-
// range business data, not a Dataverse OptionSet code).
const COLUMN_SQL_TYPE = {
  'contacts.role': 'INTEGER',
  'reference_data.reference_type': 'INTEGER',
  'invoices.type': 'INTEGER',
  'attachments.reference_type': 'INTEGER',
  'forecast_flows.type': 'INTEGER',
  'forecast_flows.frequency': 'INTEGER',
  'forecast_flows.amount_source': 'INTEGER',
  'forecast_flow_components.direction': 'INTEGER',
  'invoice_templates.type': 'INTEGER',
  'activity_logs.action': 'INTEGER',
  'activity_logs.table_name': 'INTEGER',
};

export function checkColumnTypeRange(table, column, value) {
  if (value === null || value === undefined) return null;
  const key = `${table}.${column}`;
  const sqlType = COLUMN_SQL_TYPE[key];
  if (!sqlType) return null; // not a tracked numeric column — nothing to check
  const [min, max] = SQL_TYPE_RANGE[sqlType];
  if (value < min || value > max) {
    return `${key}=${value} exceeds ${sqlType} range (${min}..${max}) — would fail at INSERT time`;
  }
  return null;
}

export const CHOICE_DOMAINS = {
  'contacts.role': [233100000, 233100001],
  'reference_data.reference_type': [233100000, 233100001, 233100002, 233100003, 233100004, 233100005, 233100006],
  'invoices.type': [233100000, 233100001],
  'attachments.reference_type': [233100000, 233100001, 233100002], // nullable
  'invoice_templates.type': [925060000, 925060001],
  'forecast_flows.type': [233100000, 233100001],
  'forecast_flows.frequency': [233100000, 233100001, 233100002, 233100003, 233100004, 233100005, 233100006],
  'forecast_flows.amount_source': [925060000, 925060001],
  'forecast_flow_components.direction': [925060000, 925060001],
  'activity_logs.action': [233100000, 233100001, 233100002, 233100003],
  'activity_logs.table_name': [233100000, 233100001, 233100002, 233100003, 233100004, 233100005],
};

// { table.column: [{ target, nullable }] } — every FK from db/001_schema.sql (23 total).
export const FOREIGN_KEYS = [
  { table: 'contacts', column: 'default_category_id', target: 'reference_data', nullable: true },
  { table: 'supplier_contracts', column: 'contact_id', target: 'contacts', nullable: true }, // relaxed Step 5A, legacy exception only
  { table: 'supplier_contracts', column: 'property_id', target: 'properties', nullable: true },
  { table: 'supplier_contracts', column: 'default_category_id', target: 'reference_data', nullable: true },
  { table: 'invoices', column: 'property_id', target: 'properties', nullable: true },
  { table: 'invoices', column: 'contact_id', target: 'contacts', nullable: true },
  { table: 'invoices', column: 'category_id', target: 'reference_data', nullable: true },
  { table: 'invoice_comments', column: 'invoice_id', target: 'invoices', nullable: true }, // relaxed Step 5A, legacy exception only
  { table: 'invoice_templates', column: 'category_id', target: 'reference_data', nullable: true },
  { table: 'attachments', column: 'invoice_id', target: 'invoices', nullable: true },
  { table: 'attachments', column: 'property_id', target: 'properties', nullable: true },
  { table: 'attachments', column: 'property_id_invoice', target: 'properties', nullable: true },
  { table: 'attachments', column: 'contact_id', target: 'contacts', nullable: true },
  { table: 'attachments', column: 'attach_type_id', target: 'reference_data', nullable: true },
  { table: 'forecast_flows', column: 'category_id', target: 'reference_data', nullable: true },
  { table: 'forecast_flows', column: 'contact_id', target: 'contacts', nullable: true },
  { table: 'forecast_flows', column: 'parent_flow_id', target: 'forecast_flows', nullable: true },
  { table: 'forecast_flow_properties', column: 'forecast_flow_id', target: 'forecast_flows', nullable: false },
  { table: 'forecast_flow_properties', column: 'property_id', target: 'properties', nullable: false },
  { table: 'forecast_scenarios', column: 'property_id', target: 'properties', nullable: true },
  { table: 'forecast_flow_components', column: 'source_flow_id', target: 'forecast_flows', nullable: true }, // relaxed Step 5A, legacy exception only
  { table: 'forecast_flow_components', column: 'target_flow_id', target: 'forecast_flows', nullable: true }, // relaxed Step 5A, legacy exception only
  { table: 'owner_occupancies', column: 'property_id', target: 'properties', nullable: false },
];

// CHECK constraints that aren't simple choice-domain or required-field checks.
export function extraChecks(table, row) {
  const problems = [];

  // Step 5A: the relaxed columns may be null ONLY on the specific rows
  // flagged is_legacy_orphan=true (set exclusively from the authoritative
  // exception list in legacy-orphans.mjs) — any other row with one of these
  // columns null is a genuine, unexpected violation, not a known exception.
  if (table === 'supplier_contracts' && !row.is_legacy_orphan && row.contact_id === null) {
    problems.push('supplier_contracts.contact_id is null on a row NOT flagged is_legacy_orphan — unexpected, not a known Step 5A exception');
  }
  if (table === 'invoice_comments' && !row.is_legacy_orphan && row.invoice_id === null) {
    problems.push('invoice_comments.invoice_id is null on a row NOT flagged is_legacy_orphan — unexpected, not a known Step 5A exception');
  }
  if (table === 'forecast_flow_components' && !row.is_legacy_orphan && (row.source_flow_id === null || row.target_flow_id === null || row.direction === null)) {
    problems.push('forecast_flow_components has a null source_flow_id/target_flow_id/direction on a row NOT flagged is_legacy_orphan — unexpected, not a known Step 5A exception');
  }

  if (table === 'supplier_contracts' && !row.is_legacy_orphan && !(row.all_properties || row.property_id !== null)) {
    problems.push('CHECK chk_supplier_contracts_property violated: all_properties is false and property_id is null');
  }
  if (table === 'supplier_contracts' && !(row.contract_count >= 1)) {
    problems.push(`CHECK chk_supplier_contracts_count violated: contract_count=${row.contract_count}`);
  }
  if (table === 'invoices' && !(row.all_properties || row.property_id !== null)) {
    problems.push('CHECK chk_invoices_property violated: all_properties is false and property_id is null');
  }
  if (table === 'forecast_flows' && row.parent_flow_id !== null && row.parent_flow_id === row.id) {
    problems.push('CHECK chk_forecast_flows_no_self_parent violated: parent_flow_id === id');
  }
  if (table === 'forecast_flow_components' && row.source_flow_id !== null && row.source_flow_id === row.target_flow_id) {
    problems.push('CHECK chk_forecast_flow_components_distinct violated: source_flow_id === target_flow_id');
  }
  if (table === 'owner_occupancies' && row.from_date !== null && row.to_date !== null && !(row.to_date > row.from_date)) {
    problems.push(`CHECK chk_owner_occupancies_dates violated: to_date(${row.to_date}) <= from_date(${row.from_date})`);
  }
  return problems;
}
