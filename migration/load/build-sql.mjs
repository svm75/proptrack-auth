#!/usr/bin/env node
// PropTrack V2 — Step 5B load-SQL generator.
// Reads migration/transform/data/<table>.json (the Step 5/5A-validated,
// deterministic transform output) and writes one combined SQL file,
// migration/load/generated/load-all.sql (gitignored — real data), with an
// INSERT per row in the approved dependency order, plus the forecast_flows
// two-pass UPDATE for self-references. Does not connect to PostgreSQL —
// load.mjs applies the generated file separately, inside one transaction.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSFORM_DIR = path.join(__dirname, '..', 'transform', 'data');
const OUT_DIR = path.join(__dirname, 'generated');
const OUT_FILE = path.join(OUT_DIR, 'load-all.sql');

// Column order per table, matching db/001_schema.sql + db/005 additions
// exactly. created_at/updated_at are intentionally omitted — the schema's
// own DEFAULT now() populates them at insert time.
const COLUMNS = {
  properties: ['id', 'name', 'short_id', 'address', 'notes', 'google_drive_folder_id'],
  contacts: ['id', 'name', 'role', 'email', 'tax_id', 'default_description', 'regular_supplier', 'default_category_id'],
  reference_data: ['id', 'value', 'reference_type', 'sort_order'],
  supplier_contracts: ['id', 'contact_id', 'property_id', 'all_properties', 'contract_count', 'default_category_id', 'default_description', 'active', 'is_legacy_orphan'],
  invoices: ['id', 'internal_id', 'global_sequence', 'year', 'type', 'invoice_date', 'description', 'property_id', 'all_properties', 'contact_id', 'category_id', 'base_amount', 'tax_amount', 'total_gross', 'tax_rate', 'tax_is_manual', 'booking_reference', 'check_in', 'check_out', 'nights', 'days', 'adults', 'children', 'babies', 'google_drive_folder_id', 'is_cancelled', 'is_flagged_anomaly'],
  invoice_comments: ['id', 'invoice_id', 'name', 'comment', 'created_by', 'created_at', 'is_legacy_orphan'],
  invoice_templates: ['id', 'name', 'type', 'category_id', 'description', 'default_amount'],
  attachments: ['id', 'file_name', 'google_drive_id', 'google_drive_url', 'invoice_id', 'property_id', 'property_id_invoice', 'contact_id', 'attach_type_id', 'reference_type', 'uploaded_on'],
  // forecast_flows: parent_flow_id deliberately excluded from pass-1 insert columns — set in pass 2.
  forecast_flows: ['id', 'name', 'type', 'frequency', 'days_of_week', 'start_date', 'end_date', 'net_amount', 'vat_amount', 'gross_amount', 'vat_rate', 'vat_is_manual', 'all_properties', 'category_id', 'contact_id', 'amount_source', 'percentage', 'notes'],
  forecast_flow_properties: ['id', 'name', 'forecast_flow_id', 'property_id'],
  forecast_scenarios: ['id', 'name', 'property_id', 'income_adjustment_pct', 'expense_adjustment_pct', 'notes'],
  forecast_flow_components: ['id', 'name', 'source_flow_id', 'target_flow_id', 'direction', 'is_legacy_orphan'],
  owner_occupancies: ['id', 'name', 'property_id', 'from_date', 'to_date', 'adults', 'children', 'babies'],
  activity_logs: ['id', 'log_id', 'action', 'table_name', 'record_name', 'details', 'occurred_at', 'user_name', 'created_at'],
};

// Corrected dependency order (Step 5E). The original §8/§Migration Load
// Order documentation placed `contacts` before `reference_data`, but
// contacts.default_category_id is a real FK to reference_data — this order
// was independently re-derived by topologically sorting the live FK graph
// queried from information_schema (23 edges, Step 5E Part A) rather than
// trusting the manually-written list a second time. `reference_data` now
// loads before `contacts`; every other table's position is unchanged since
// no other table's FKs required reordering.
const LOAD_ORDER = [
  'properties', 'reference_data', 'contacts', 'supplier_contracts', 'invoices',
  'invoice_comments', 'invoice_templates', 'attachments', 'forecast_flows',
  'forecast_flow_properties', 'forecast_scenarios', 'forecast_flow_components',
  'owner_occupancies', 'activity_logs',
];

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Non-finite number: ${v}`);
    return String(v);
  }
  // string (UUID, text, ISO date/timestamp) — standard '' escaping.
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertStatement(table, columns, row) {
  const values = columns.map((c) => sqlLiteral(row[c]));
  return `INSERT INTO proptrack.${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const lines = [
    '-- PropTrack V2 — Step 5B generated load SQL. Machine-generated from',
    '-- migration/transform/data/*.json — do not hand-edit; regenerate via',
    '-- migration/load/build-sql.mjs. Applied inside a single transaction by',
    '-- migration/load/load.mjs.',
    'SET search_path = proptrack;',
    '',
  ];
  let totalRows = 0;
  const perTable = {};

  for (const table of LOAD_ORDER) {
    const raw = await readFile(path.join(TRANSFORM_DIR, `${table}.json`), 'utf8');
    const { rows } = JSON.parse(raw);
    const columns = COLUMNS[table];
    if (!columns) throw new Error(`No column list defined for table ${table}`);

    lines.push(`-- ${table}: ${rows.length} rows`);
    for (const row of rows) {
      lines.push(insertStatement(table, columns, row));
    }
    lines.push('');
    perTable[table] = rows.length;
    totalRows += rows.length;

    if (table === 'forecast_flows') {
      lines.push('-- forecast_flows pass 2: resolve self-referencing parent_flow_id now that all rows exist.');
      for (const row of rows) {
        if (row.parent_flow_id !== null) {
          lines.push(`UPDATE proptrack.forecast_flows SET parent_flow_id = ${sqlLiteral(row.parent_flow_id)} WHERE id = ${sqlLiteral(row.id)};`);
        }
      }
      lines.push('');
    }
  }

  await writeFile(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`Generated ${totalRows} INSERT statements across ${LOAD_ORDER.length} tables.`);
  console.log(JSON.stringify(perTable, null, 2));
  console.log(`Written to: ${path.relative(process.cwd(), OUT_FILE)}`);
}

main().catch((err) => {
  console.error('build-sql failed:', err);
  process.exitCode = 1;
});
