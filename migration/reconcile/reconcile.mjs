#!/usr/bin/env node
// PropTrack V2 — Step 5E complete post-load reconciliation.
// Compares the live Postgres dump (/tmp/dump_<table>.json, produced by a
// read-only `jsonb_agg` query, no writes) against the Step 5/5A-approved
// transformed dataset (migration/transform/data/<table>.json) that was
// actually loaded. Row-level, field-by-field — not just counts.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOREIGN_KEYS, CHOICE_DOMAINS } from '../transform/schema-rules.mjs';
import { LEGACY_ORPHAN_IDS } from '../transform/legacy-orphans.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSFORM_DIR = path.join(__dirname, '..', 'transform', 'data');
const REPORT_PATH = path.join(__dirname, '..', 'reports', 'step5e-reconciliation.json');

const TABLES = [
  'properties', 'reference_data', 'contacts', 'supplier_contracts', 'invoices',
  'invoice_comments', 'invoice_templates', 'attachments', 'forecast_flows',
  'forecast_flow_properties', 'forecast_scenarios', 'forecast_flow_components',
  'owner_occupancies', 'activity_logs',
];

function normalize(v) {
  // Postgres returns numeric/timestamptz/date as strings in JSON; the
  // transform layer's values are JS numbers/ISO strings. Normalize both
  // sides to comparable primitives without altering meaning.
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // numeric-looking string -> number for fair comparison (NUMERIC columns)
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v;
  }
  return v;
}

function timestampsEqual(a, b) {
  if (a === null || b === null) return a === b;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return ta === tb;
}

async function loadJSON(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

async function main() {
  const problems = [];
  const perTable = [];
  const liveByTable = {};

  for (const table of TABLES) {
    const transformed = (await loadJSON(path.join(TRANSFORM_DIR, `${table}.json`))).rows;
    const live = await loadJSON(`/tmp/dump_${table}.json`);
    liveByTable[table] = live;

    const sourceCount = transformed.length;
    const targetCount = live.length;
    const diff = targetCount - sourceCount;
    perTable.push({ table, sourceCount, targetCount, diff });
    if (diff !== 0) problems.push({ type: 'count-mismatch', table, detail: `source=${sourceCount} target=${targetCount}` });

    const liveById = new Map(live.map((r) => [r.id, r]));
    const transformedById = new Map(transformed.map((r) => [r.id, r]));

    // duplicate GUIDs in target
    const idCounts = {};
    for (const r of live) idCounts[r.id] = (idCounts[r.id] || 0) + 1;
    for (const [id, n] of Object.entries(idCounts)) {
      if (n > 1) problems.push({ type: 'duplicate-target-guid', table, detail: `id=${id} appears ${n} times` });
    }

    // missing records (in source, not in target)
    for (const [id] of transformedById) {
      if (!liveById.has(id)) problems.push({ type: 'missing-record', table, detail: `id=${id} in source but not in target` });
    }
    // unexpected records (in target, not in source)
    for (const [id] of liveById) {
      if (!transformedById.has(id)) problems.push({ type: 'unexpected-record', table, detail: `id=${id} in target but not in source` });
    }

    // field-by-field comparison for every row present in both
    for (const [id, srcRow] of transformedById) {
      const liveRow = liveById.get(id);
      if (!liveRow) continue;
      const timestampCols = ['invoice_date', 'check_in', 'check_out', 'uploaded_on', 'occurred_at', 'created_at'];
      const dateCols = ['start_date', 'end_date', 'from_date', 'to_date'];
      for (const col of Object.keys(srcRow)) {
        if (col === 'id') continue;
        const sv = srcRow[col];
        const lv = liveRow[col];
        if (timestampCols.includes(col)) {
          if (!timestampsEqual(sv, lv)) problems.push({ type: 'field-diff-timestamp', table, detail: `id=${id} ${col}: source=${sv} target=${lv}` });
          continue;
        }
        if (dateCols.includes(col)) {
          const sd = sv === null ? null : String(sv).slice(0, 10);
          const ld = lv === null ? null : String(lv).slice(0, 10);
          if (sd !== ld) problems.push({ type: 'field-diff-date', table, detail: `id=${id} ${col}: source=${sd} target=${ld}` });
          continue;
        }
        const ns = normalize(sv);
        const nl = normalize(lv);
        if (ns !== nl) {
          problems.push({ type: 'field-diff', table, detail: `id=${id} ${col}: source=${JSON.stringify(sv)} target=${JSON.stringify(lv)}` });
        }
      }
    }
  }

  // FK integrity — all 23, run against the live dumps (already-loaded data)
  const idSetByTable = {};
  for (const table of TABLES) idSetByTable[table] = new Set(liveByTable[table].map((r) => r.id));
  for (const fk of FOREIGN_KEYS) {
    const rows = liveByTable[fk.table] || [];
    const targetIds = idSetByTable[fk.target];
    for (const row of rows) {
      const v = row[fk.column];
      if (v === null || v === undefined) continue;
      if (!targetIds.has(v)) {
        problems.push({ type: 'fk-orphan', table: fk.table, detail: `${fk.column}=${v} on id=${row.id} does not resolve to ${fk.target}` });
      }
    }
  }

  // Choice/check domain validation against live data
  for (const [key, domain] of Object.entries(CHOICE_DOMAINS)) {
    const [table, col] = key.split('.');
    for (const row of liveByTable[table] || []) {
      const v = row[col];
      if (v !== null && v !== undefined && !domain.includes(Number(v))) {
        problems.push({ type: 'choice-domain-violation', table, detail: `${col}=${v} on id=${row.id} not in approved domain` });
      }
    }
  }

  // Legacy-orphan validation: exactly the approved 11, no others
  let legacyOrphanTotal = 0;
  const legacyOrphanByTable = {};
  for (const table of ['supplier_contracts', 'invoice_comments', 'forecast_flow_components']) {
    const flagged = (liveByTable[table] || []).filter((r) => r.is_legacy_orphan === true);
    legacyOrphanByTable[table] = flagged.length;
    legacyOrphanTotal += flagged.length;
    const approvedIds = LEGACY_ORPHAN_IDS[table];
    for (const r of flagged) {
      if (!approvedIds.has(r.id)) problems.push({ type: 'unapproved-legacy-orphan-flag', table, detail: `id=${r.id} flagged is_legacy_orphan=true but is not in the approved list` });
    }
    for (const id of approvedIds) {
      const row = (liveByTable[table] || []).find((r) => r.id === id);
      if (!row || row.is_legacy_orphan !== true) problems.push({ type: 'missing-legacy-orphan-flag', table, detail: `approved id=${id} does not have is_legacy_orphan=true` });
    }
  }
  if (legacyOrphanTotal !== 11) problems.push({ type: 'legacy-orphan-total-mismatch', detail: `expected 11, found ${legacyOrphanTotal}` });

  // 1962 anomaly validation
  const invoices = liveByTable.invoices || [];
  const flaggedAnomalies = invoices.filter((r) => r.is_flagged_anomaly === true);
  if (flaggedAnomalies.length !== 2) {
    problems.push({ type: 'anomaly-count-mismatch', detail: `expected 2 is_flagged_anomaly=true, found ${flaggedAnomalies.length}` });
  }
  for (const r of flaggedAnomalies) {
    const year = new Date(r.invoice_date).getUTCFullYear();
    if (year !== 1962) problems.push({ type: 'anomaly-year-mismatch', detail: `id=${r.id} invoice_date=${r.invoice_date} year=${year}` });
  }
  const unflagged1962 = invoices.filter((r) => !r.is_flagged_anomaly && new Date(r.invoice_date).getUTCFullYear() === 1962);
  for (const r of unflagged1962) problems.push({ type: 'anomaly-not-flagged', detail: `id=${r.id} is year 1962 but is_flagged_anomaly=false` });

  const totalSource = perTable.reduce((s, t) => s + t.sourceCount, 0);
  const totalTarget = perTable.reduce((s, t) => s + t.targetCount, 0);

  const report = {
    generatedAt: new Date().toISOString(),
    totalSource,
    totalTarget,
    perTable,
    fkChecksRun: FOREIGN_KEYS.length,
    legacyOrphan: { total: legacyOrphanTotal, byTable: legacyOrphanByTable },
    anomalyFlagged: flaggedAnomalies.length,
    problemCount: problems.length,
    problems,
    result: problems.length === 0 ? 'PASS' : 'FAIL',
  };
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Source total: ${totalSource}  Target total: ${totalTarget}`);
  console.log(`FK checks run: ${FOREIGN_KEYS.length}`);
  console.log(`Legacy orphans: ${legacyOrphanTotal} (${JSON.stringify(legacyOrphanByTable)})`);
  console.log(`1962 anomalies flagged: ${flaggedAnomalies.length}`);
  console.log(`Problems: ${problems.length}`);
  console.log(`Result: ${report.result}`);
  if (problems.length > 0) {
    console.error('\n--- PROBLEMS ---');
    for (const p of problems.slice(0, 50)) console.error(`[${p.type}] ${p.table ?? ''} ${p.detail}`);
    if (problems.length > 50) console.error(`... and ${problems.length - 50} more (see report)`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exitCode = 1;
});
