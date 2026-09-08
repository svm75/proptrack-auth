#!/usr/bin/env node
// PropTrack V2 — Step 5 transform + pre-load validation.
//
// Reads migration/export/data/*.json (the completed, Eye-2-approved Step 4
// export), applies the deterministic mapping in map.mjs, writes one
// transformed-rows JSON file per table to migration/transform/data/, and
// runs the pre-load validation required by Step 5 §2 against the schema
// rules in schema-rules.mjs.
//
// Never connects to Dataverse or PostgreSQL. Never invents a value the
// approved schema doesn't already declare as a DEFAULT. If validation
// finds any real constraint violation, it is reported in full and the
// process exits non-zero — load.mjs refuses to run against a failed report.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mapProperties, mapContacts, mapReferenceData, mapSupplierContracts,
  mapInvoices, mapInvoiceComments, mapInvoiceTemplates, mapAttachments,
  mapForecastFlows, mapForecastFlowProperties, mapForecastScenarios,
  mapForecastFlowComponents, mapOwnerOccupancies, mapActivityLogs,
} from './map.mjs';
import { REQUIRED, CHOICE_DOMAINS, FOREIGN_KEYS, extraChecks, checkColumnTypeRange } from './schema-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, '..', 'export', 'data');
const OUT_DIR = path.join(__dirname, 'data');
const REPORT_PATH = path.join(__dirname, '..', 'reports', 'step5-transform-validation.json');

// exportKey: filename under migration/export/data/. table: target Postgres
// table. idField: the exact Dataverse primary-key attribute name (never
// guessed — Dataverse's own naming convention is logicalName + "id", but
// system columns like "ownerid" also end in "id", so this must be explicit).
const TABLE_PLAN = [
  { exportKey: 'properties', table: 'properties', idField: 'cr9b5_pt_propertyid', map: mapProperties },
  { exportKey: 'contacts', table: 'contacts', idField: 'cr9b5_pt_contactid', map: mapContacts },
  { exportKey: 'references', table: 'reference_data', idField: 'cr9b5_pt_referenceid', map: mapReferenceData },
  { exportKey: 'suppliercontracts', table: 'supplier_contracts', idField: 'svm_pt_suppliercontractid', map: mapSupplierContracts },
  { exportKey: 'invoices', table: 'invoices', idField: 'cr9b5_pt_invoiceid', map: mapInvoices },
  { exportKey: 'invoicecomments', table: 'invoice_comments', idField: 'svm_pt_invoicecommentid', map: mapInvoiceComments },
  { exportKey: 'invoicetemplates', table: 'invoice_templates', idField: 'svm_pt_invoicetemplateid', map: mapInvoiceTemplates },
  { exportKey: 'attachments', table: 'attachments', idField: 'cr9b5_pt_attachmentid', map: mapAttachments },
  { exportKey: 'forecastflows', table: 'forecast_flows', idField: 'cr9b5_pt_forecastflowid', map: mapForecastFlows },
  { exportKey: 'forecastflowproperties', table: 'forecast_flow_properties', idField: 'cr9b5_forecastpropertyid', map: mapForecastFlowProperties },
  { exportKey: 'forecastscenarios', table: 'forecast_scenarios', idField: 'svm_forecastscenarioid', map: mapForecastScenarios },
  { exportKey: 'forecastflowcomponents', table: 'forecast_flow_components', idField: 'svm_forecastflowcomponentid', map: mapForecastFlowComponents },
  { exportKey: 'owneroccupancies', table: 'owner_occupancies', idField: 'svm_pt_owneroccupancyid', map: mapOwnerOccupancies },
  { exportKey: 'activitylogs', table: 'activity_logs', idField: 'cr9b5_pt_activitylogid', map: mapActivityLogs },
];

async function loadExport(exportKey) {
  const raw = await readFile(path.join(EXPORT_DIR, `${exportKey}.json`), 'utf8');
  return JSON.parse(raw);
}

function validateTable(table, sourceRecords, sourceIdField, rows, allIdSets) {
  const problems = [];

  // 1. source count == transformed count
  if (sourceRecords.length !== rows.length) {
    problems.push({ type: 'count-mismatch', detail: `source ${sourceRecords.length} vs transformed ${rows.length}` });
  }

  // 2. no source GUID lost, no duplicate transformed GUIDs
  const sourceIds = new Set(sourceRecords.map((r) => r[sourceIdField]));
  const transformedIds = rows.map((r) => r.id);
  const transformedIdSet = new Set(transformedIds);
  if (transformedIdSet.size !== transformedIds.length) {
    problems.push({ type: 'duplicate-guid', detail: `${transformedIds.length - transformedIdSet.size} duplicate id(s) in transformed output` });
  }
  for (const id of sourceIds) {
    if (!transformedIdSet.has(id)) problems.push({ type: 'lost-guid', detail: `source id ${id} missing from transformed output` });
  }

  // 3. required fields present
  const required = REQUIRED[table] || [];
  for (const row of rows) {
    for (const col of required) {
      if (row[col] === null || row[col] === undefined) {
        problems.push({ type: 'required-field-null', detail: `${table}.${col} is null on row id=${row.id}` });
      }
    }
  }

  // 4. choice domains
  for (const row of rows) {
    for (const [key, domain] of Object.entries(CHOICE_DOMAINS)) {
      const [t, col] = key.split('.');
      if (t !== table) continue;
      const v = row[col];
      if (v !== null && v !== undefined && !domain.includes(v)) {
        problems.push({ type: 'choice-domain-violation', detail: `${table}.${col}=${v} not in approved domain on row id=${row.id}` });
      }
    }
  }

  // 4b. numeric column-type range (Step 5C: the exact check missing before
  // Step 5B — domain membership alone doesn't catch a value that's a valid
  // Choice code but too large for the column's declared SQL type).
  for (const row of rows) {
    for (const [key] of Object.entries(CHOICE_DOMAINS)) {
      const [t, col] = key.split('.');
      if (t !== table) continue;
      const msg = checkColumnTypeRange(table, col, row[col]);
      if (msg) problems.push({ type: 'column-type-range-violation', detail: `${msg} (row id=${row.id})` });
    }
  }

  // 5. extra CHECK constraints (all_properties/property_id, self-refs, date ranges, etc.)
  for (const row of rows) {
    for (const msg of extraChecks(table, row)) {
      problems.push({ type: 'check-constraint-violation', detail: `row id=${row.id}: ${msg}` });
    }
  }

  return problems;
}

function validateForeignKeys(rowsByTable) {
  const problems = [];
  for (const fk of FOREIGN_KEYS) {
    const rows = rowsByTable[fk.table] || [];
    const targetIds = new Set((rowsByTable[fk.target] || []).map((r) => r.id));
    for (const row of rows) {
      const v = row[fk.column];
      if (v === null || v === undefined) {
        if (!fk.nullable) problems.push({ type: 'fk-null-not-nullable', detail: `${fk.table}.${fk.column} is null on row id=${row.id}, but the FK is NOT NULL` });
        continue;
      }
      if (!targetIds.has(v)) {
        problems.push({ type: 'fk-unresolved', detail: `${fk.table}.${fk.column}=${v} on row id=${row.id} does not resolve to any exported ${fk.target} record` });
      }
    }
  }
  return problems;
}

function validateLegacyOrphanCount(rowsByTable) {
  const problems = [];
  let total = 0;
  const byTable = {};
  for (const table of ['supplier_contracts', 'invoice_comments', 'forecast_flow_components']) {
    const count = (rowsByTable[table] || []).filter((r) => r.is_legacy_orphan === true).length;
    byTable[table] = count;
    total += count;
  }
  const expected = { supplier_contracts: 5, invoice_comments: 5, forecast_flow_components: 1 };
  for (const [table, exp] of Object.entries(expected)) {
    if (byTable[table] !== exp) {
      problems.push({ type: 'legacy-orphan-count-mismatch', detail: `${table}: expected ${exp} rows flagged is_legacy_orphan, found ${byTable[table]}` });
    }
  }
  if (total !== 11) {
    problems.push({ type: 'legacy-orphan-total-mismatch', detail: `expected exactly 11 legacy-orphan rows total (per Step 5A's approved exception list), found ${total}` });
  }
  return { problems, total, byTable };
}

function validateAnomaly(rowsByTable) {
  const problems = [];
  const invoices = rowsByTable.invoices || [];
  const flagged = invoices.filter((r) => r.is_flagged_anomaly === true);
  if (flagged.length !== 2) {
    problems.push({ type: 'anomaly-count-mismatch', detail: `expected exactly 2 invoices with is_flagged_anomaly=true, found ${flagged.length}` });
  }
  for (const r of flagged) {
    const year = new Date(r.invoice_date).getUTCFullYear();
    if (year !== 1962) {
      problems.push({ type: 'anomaly-year-mismatch', detail: `flagged invoice id=${r.id} has invoice_date=${r.invoice_date} (year ${year}), expected 1962` });
    }
  }
  const unflagged1962 = invoices.filter((r) => !r.is_flagged_anomaly && new Date(r.invoice_date).getUTCFullYear() === 1962);
  for (const r of unflagged1962) {
    problems.push({ type: 'anomaly-not-flagged', detail: `invoice id=${r.id} has year 1962 but is_flagged_anomaly=false` });
  }
  return problems;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const rowsByTable = {};
  const perTableSummary = [];
  const allProblems = [];

  for (const plan of TABLE_PLAN) {
    const exportData = await loadExport(plan.exportKey);
    const sourceRecords = exportData.records;
    const sourceIdField = plan.idField;
    const rows = sourceRecords.map(plan.map);
    rowsByTable[plan.table] = rows;

    const outFile = path.join(OUT_DIR, `${plan.table}.json`);
    await writeFile(outFile, JSON.stringify({ _meta: { table: plan.table, sourceTable: exportData._meta.sourceTable, transformedCount: rows.length }, rows }, null, 2), 'utf8');

    const tableProblems = validateTable(plan.table, sourceRecords, sourceIdField, rows, rowsByTable);
    allProblems.push(...tableProblems.map((p) => ({ table: plan.table, ...p })));
    perTableSummary.push({ table: plan.table, sourceCount: sourceRecords.length, transformedCount: rows.length, problems: tableProblems.length });
  }

  const fkProblems = validateForeignKeys(rowsByTable);
  const anomalyProblems = validateAnomaly(rowsByTable);
  const legacyOrphan = validateLegacyOrphanCount(rowsByTable);
  allProblems.push(...fkProblems.map((p) => ({ table: p.table ?? null, ...p })));
  allProblems.push(...anomalyProblems.map((p) => ({ table: 'invoices', ...p })));
  allProblems.push(...legacyOrphan.problems.map((p) => ({ table: null, ...p })));

  const totalSource = perTableSummary.reduce((s, t) => s + t.sourceCount, 0);
  const totalTransformed = perTableSummary.reduce((s, t) => s + t.transformedCount, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    totalSourceRecords: totalSource,
    totalTransformedRecords: totalTransformed,
    perTable: perTableSummary,
    foreignKeyChecksRun: FOREIGN_KEYS.length,
    knownLegacyOrphanExceptions: { total: legacyOrphan.total, byTable: legacyOrphan.byTable },
    problemCount: allProblems.length,
    problems: allProblems,
    result: allProblems.length === 0 ? 'PASS' : 'FAIL',
  };

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Total source records:      ${totalSource}`);
  console.log(`Total transformed records: ${totalTransformed}`);
  console.log(`Foreign key checks run:    ${FOREIGN_KEYS.length}`);
  console.log(`Known legacy exceptions:   ${legacyOrphan.total} (${JSON.stringify(legacyOrphan.byTable)})`);
  console.log(`Problems found:            ${allProblems.length}`);
  console.log(`Result: ${report.result}`);
  console.log(`Report written to: ${path.relative(process.cwd(), REPORT_PATH)}`);

  if (allProblems.length > 0) {
    console.error('\n--- VALIDATION FAILED — problems by table ---');
    const byTable = {};
    for (const p of allProblems) {
      const t = p.table ?? '(cross-table)';
      byTable[t] = byTable[t] || [];
      byTable[t].push(p);
    }
    for (const [table, probs] of Object.entries(byTable)) {
      console.error(`\n${table}: ${probs.length} problem(s)`);
      for (const p of probs.slice(0, 10)) console.error(`  [${p.type}] ${p.detail}`);
      if (probs.length > 10) console.error(`  ... and ${probs.length - 10} more (see report file)`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Transform failed:', err);
  process.exitCode = 1;
});
