#!/usr/bin/env node
// PropTrack V2 — Step 4 Dataverse export.
//
// Authenticates via the Azure CLI's already-signed-in context (same user
// identity `pac` uses for this project — see migration.md §3) to obtain a
// short-lived Dataverse-scoped access token, then reads every row of all
// 14 in-scope tables from the Dataverse Web API (OData v9.2, GET only) and
// writes each to migration/export/data/<table>.json.
//
// Read-only: issues no POST/PATCH/DELETE against Dataverse. The access
// token lives only in memory for the duration of this process — it is
// never logged, printed, or written to any file.

import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, DATAVERSE_ORG_URL } from './tables.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PAGE_SIZE = 500;

async function getAccessToken() {
  const { stdout } = await execFileAsync('az', [
    'account', 'get-access-token',
    '--resource', DATAVERSE_ORG_URL,
    '--query', 'accessToken',
    '-o', 'tsv',
  ]);
  const token = stdout.trim();
  if (!token) throw new Error('az account get-access-token returned an empty token');
  return token;
}

async function fetchAllRecords(entitySet, token) {
  const records = [];
  let url = `${DATAVERSE_ORG_URL}/api/data/v9.2/${entitySet}`;
  let page = 0;
  while (url) {
    page += 1;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: `odata.maxpagesize=${PAGE_SIZE}`,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable body>');
      throw new Error(
        `Dataverse GET failed for ${entitySet} (page ${page}): HTTP ${res.status} ${res.statusText}\n${body}`
      );
    }
    const json = await res.json();
    if (!Array.isArray(json.value)) {
      throw new Error(`Dataverse response for ${entitySet} (page ${page}) had no 'value' array`);
    }
    records.push(...json.value);
    url = json['@odata.nextLink'] ?? null;
  }
  return { records, pages: page };
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const exportTimestamp = new Date().toISOString();
  const summary = [];
  const errors = [];

  console.log(`Acquiring Dataverse-scoped token via az CLI for ${DATAVERSE_ORG_URL} ...`);
  const token = await getAccessToken();
  console.log('Token acquired (not displayed). Starting export of 14 tables...\n');

  for (const table of TABLES) {
    try {
      const { records, pages } = await fetchAllRecords(table.entitySet, token);
      const outFile = path.join(DATA_DIR, `${table.key}.json`);
      const payload = {
        _meta: {
          sourceTable: table.entitySet,
          logicalName: table.logicalName,
          exportTimestamp,
          recordCount: records.length,
          pagesRetrieved: pages,
        },
        records,
      };
      await writeFile(outFile, JSON.stringify(payload, null, 2), 'utf8');
      summary.push({ key: table.key, entitySet: table.entitySet, recordCount: records.length, pages, ok: true });
      console.log(`  ${table.key.padEnd(24)} ${String(records.length).padStart(5)} records  (${pages} page${pages === 1 ? '' : 's'})  -> ${path.relative(process.cwd(), outFile)}`);
    } catch (err) {
      summary.push({ key: table.key, entitySet: table.entitySet, recordCount: null, pages: null, ok: false, error: String(err.message || err) });
      errors.push({ key: table.key, error: String(err.message || err) });
      console.error(`  ${table.key.padEnd(24)} FAILED: ${err.message || err}`);
    }
  }

  const totalRecords = summary.filter((s) => s.ok).reduce((sum, s) => sum + s.recordCount, 0);
  const reportPath = path.join(__dirname, '..', 'reports', 'step4-export-summary.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify({ exportTimestamp, dataverseOrgUrl: DATAVERSE_ORG_URL, tables: summary, totalRecords, errors }, null, 2),
    'utf8'
  );

  console.log(`\nTotal records exported: ${totalRecords}`);
  console.log(`Summary written to: ${path.relative(process.cwd(), reportPath)}`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} table(s) FAILED — see errors above and in the summary report.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exitCode = 1;
});
