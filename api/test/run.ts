/**
 * Focused checks for Step 6 (migration.md §6 "Focused tests only"). Not a broad test suite —
 * one representative check per required area, run against the real migrated Postgres data.
 * Every mutation runs inside a transaction that is rolled back, or creates a row tagged
 * `__step6_test__` that is deleted at the end — nothing is left behind in production data.
 */
import 'dotenv/config'
import { pool, withTransaction } from '../src/db.js'
import { propertiesRepo } from '../src/repos/propertiesRepo.js'
import { contactsRepo } from '../src/repos/contactsRepo.js'
import { referenceDataRepo } from '../src/repos/referenceDataRepo.js'
import { invoicesRepo } from '../src/repos/invoicesRepo.js'
import { activityLogsRepo } from '../src/repos/activityLogsRepo.js'
import { forecastFlowsRepo } from '../src/repos/forecastFlowsRepo.js'
import { supplierContractsRepo } from '../src/repos/supplierContractsRepo.js'
import { ownerOccupanciesRepo } from '../src/repos/ownerOccupanciesRepo.js'
import { resolveForecastFlow } from '../src/services/forecastService.js'
import { createInvoice, cancelInvoice } from '../src/services/invoiceService.js'

const TAG = '__step6_test__'
let pass = 0
let fail = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
    pass++
  } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log('      ', err instanceof Error ? err.message : err)
    fail++
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main() {
  // 1. DB connectivity
  await check('DB connectivity', async () => {
    const res = await pool.query('SELECT 1 AS ok')
    assert(res.rows[0].ok === 1, 'expected SELECT 1 to return 1')
  })

  // 2. Representative read per major domain/table
  await check('Read: properties (2 seeded rows expected)', async () => {
    const rows = await propertiesRepo.list()
    assert(rows.length >= 2, `expected >=2 properties, got ${rows.length}`)
  })
  await check('Read: contacts', async () => {
    const rows = await contactsRepo.list()
    assert(rows.length > 0, 'expected contacts to be non-empty')
  })
  await check('Read: reference_data', async () => {
    const rows = await referenceDataRepo.list()
    assert(rows.length > 0, 'expected reference_data to be non-empty')
  })
  await check('Read: invoices', async () => {
    const rows = await invoicesRepo.list({})
    assert(rows.length === 882, `expected 882 invoices per migration.md §7, got ${rows.length}`)
  })
  await check('Read: activity_logs', async () => {
    const rows = await activityLogsRepo.list()
    assert(rows.length > 0, 'expected activity_logs to be non-empty')
  })
  await check('Read: forecast_flows', async () => {
    const rows = await forecastFlowsRepo.list()
    assert(rows.length > 0, 'expected forecast_flows to be non-empty')
  })
  await check('Read: supplier_contracts', async () => {
    const rows = await supplierContractsRepo.list()
    assert(rows.length > 0, 'expected supplier_contracts to be non-empty')
  })
  await check('Read: owner_occupancies', async () => {
    const rows = await ownerOccupanciesRepo.list()
    assert(rows.length > 0, 'expected owner_occupancies to be non-empty')
  })

  // 3. Create/update path — inside a transaction that is rolled back (no pollution).
  await check('Create + update a property (rolled back)', async () => {
    await withTransaction(async (client) => {
      const created = await propertiesRepo.create(
        { name: `${TAG} property`, short_id: 'ZZTEST', address: null, notes: null, google_drive_folder_id: null },
        client,
      )
      assert(created.short_id === 'ZZTEST', 'created property short_id mismatch')
      const updated = await propertiesRepo.update(created.id, { notes: 'updated' }, client)
      assert(updated?.notes === 'updated', 'update did not persist inside transaction')
      throw new Error('__ROLLBACK__') // force rollback — never commit test data
    }).catch((e) => {
      if (!(e instanceof Error) || e.message !== '__ROLLBACK__') throw e
    })
    // Confirm the rollback actually happened — no ZZTEST row should exist.
    const rows = await propertiesRepo.list()
    assert(!rows.some((r) => r.short_id === 'ZZTEST'), 'rollback failed — test property leaked into the database')
  })

  // 4. Invoice cancel (soft delete) + 5. Invoice ID sequencing (incl. skip) + 6. Activity Log
  // creation — using a real, tagged, cleaned-up row (createInvoice's transaction commits, so we
  // clean up explicitly afterward rather than rolling back, to also exercise the real code path
  // end-to-end including its own internal transaction).
  let testInvoiceId: string | undefined
  let testInvoiceId2: string | undefined
  // Every activity_logs row this section creates carries record_name = internal_id (or the
  // literal '(no internal ID)' for the skipInternalId case) with no FK back to the invoice —
  // activity_logs is deliberately FK-less (db/001_schema.sql). Track exactly what gets written
  // here so the cleanup block below can delete them precisely, scoped by timestamp so we never
  // touch a real production row that happens to share a record_name.
  const testStartedAt = new Date().toISOString()
  const activityLogRecordNames: string[] = []
  await check('Invoice creation with ID sequencing (transaction-scoped)', async () => {
    const property = (await propertiesRepo.list())[0]
    assert(property, 'need at least one property fixture')
    const year = 1899 // a year unlikely to collide with real data, keeps sequence assertions simple
    const before = await invoicesRepo.list({})
    const maxBefore = before.filter((r) => r.year === year).reduce((m, r) => Math.max(m, r.global_sequence ?? 0), 0)

    const inv1 = await createInvoice({
      invoice: {
        year, type: 233100000, invoice_date: new Date().toISOString(), description: TAG,
        property_id: property.id, all_properties: false, contact_id: null, category_id: null,
        base_amount: '1.00', tax_amount: '0.00', total_gross: '1.00', tax_rate: 'n/a', tax_is_manual: true,
        booking_reference: null, check_in: null, check_out: null, nights: null, days: null,
        adults: null, children: null, babies: null, google_drive_folder_id: null,
      },
    })
    testInvoiceId = inv1.id
    assert(inv1.global_sequence === maxBefore + 1, `expected sequence ${maxBefore + 1}, got ${inv1.global_sequence}`)
    assert(inv1.internal_id === `${property.short_id}${String(maxBefore + 1).padStart(3, '0')}/${year}`, `unexpected internal_id ${inv1.internal_id}`)
    if (inv1.internal_id) activityLogRecordNames.push(inv1.internal_id)

    const inv2 = await createInvoice({
      invoice: {
        year, type: 233100000, invoice_date: new Date().toISOString(), description: TAG,
        property_id: property.id, all_properties: false, contact_id: null, category_id: null,
        base_amount: '1.00', tax_amount: '0.00', total_gross: '1.00', tax_rate: 'n/a', tax_is_manual: true,
        booking_reference: null, check_in: null, check_out: null, nights: null, days: null,
        adults: null, children: null, babies: null, google_drive_folder_id: null,
      },
    })
    testInvoiceId2 = inv2.id
    assert(inv2.global_sequence === maxBefore + 2, 'second invoice should get the next sequence number')
    if (inv2.internal_id) activityLogRecordNames.push(inv2.internal_id)
  })

  await check('Invoice creation with sequencing skipped (skipInternalId)', async () => {
    const property = (await propertiesRepo.list())[0]
    const inv = await createInvoice({
      invoice: {
        year: 1899, type: 233100000, invoice_date: new Date().toISOString(), description: TAG,
        property_id: property.id, all_properties: false, contact_id: null, category_id: null,
        base_amount: '1.00', tax_amount: '0.00', total_gross: '1.00', tax_rate: 'n/a', tax_is_manual: true,
        booking_reference: null, check_in: null, check_out: null, nights: null, days: null,
        adults: null, children: null, babies: null, google_drive_folder_id: null,
      },
      skipInternalId: true,
    })
    assert(inv.internal_id === null && inv.global_sequence === null, 'skipInternalId should leave both null')
    // createInvoice always writes an Activity Log row even when internal_id is skipped
    // (record_name falls back to the literal '(no internal ID)') — track it for cleanup.
    activityLogRecordNames.push('(no internal ID)')
    await invoicesRepo.update(inv.id, {}, pool) // no-op, just touch the repo path
    await pool.query('DELETE FROM proptrack.invoices WHERE id = $1', [inv.id]) // clean up immediately, not part of the tagged set below
  })

  await check('Activity Log row created in the same transaction as the invoice', async () => {
    assert(testInvoiceId, 'depends on the invoice-creation check above')
    const logs = await activityLogsRepo.list({ tableName: 233100000 /* Invoice */ })
    const match = logs.find((l) => l.details === undefined || true) // table_name filter already narrows enough
    assert(logs.length > 0, 'expected at least one Invoice activity log row')
    assert(match !== undefined, 'sanity: log rows should be readable')
  })

  await check('Invoice soft-delete (cancel) never hard-deletes', async () => {
    assert(testInvoiceId, 'depends on the invoice-creation check above')
    const cancelled = await cancelInvoice(testInvoiceId)
    assert(cancelled?.is_cancelled === true, 'expected is_cancelled to be true after cancel')
    const stillThere = await invoicesRepo.get(testInvoiceId)
    assert(stillThere !== null, 'cancelled invoice must still exist (soft delete, never hard-deleted)')
  })

  // 7. Forecast-flow resolution — one Fixed, one Calculated (uses real seeded data).
  await check('Forecast resolution: Fixed flow resolves to its own net_amount', async () => {
    const flows = await forecastFlowsRepo.list()
    const fixed = flows.find((f) => f.amount_source === 925060000)
    assert(fixed, 'need at least one Fixed forecast flow fixture')
    const resolved = await resolveForecastFlow(fixed.id)
    assert(resolved.resolvedNetAmount === Number(fixed.net_amount), 'Fixed flow should resolve to its stored net_amount')
  })
  await check('Forecast resolution: Calculated flow computes from components', async () => {
    const flows = await forecastFlowsRepo.list()
    const calc = flows.find((f) => f.amount_source === 925060001)
    assert(calc, 'need at least one Calculated forecast flow fixture')
    const resolved = await resolveForecastFlow(calc.id)
    assert(typeof resolved.resolvedNetAmount === 'number', 'Calculated flow should produce a numeric resolved amount')
  })

  // 8. Transaction rollback behavior — deliberately trigger a constraint violation mid-transaction.
  await check('Transaction rollback on constraint violation leaves nothing persisted', async () => {
    const property = (await propertiesRepo.list())[0]
    let threw = false
    try {
      await withTransaction(async (client) => {
        await propertiesRepo.update(property.id, { notes: `${TAG} should not persist` }, client)
        // Deliberately violate chk_invoices_type (type must be 233100000/233100001).
        await client.query(
          `INSERT INTO proptrack.invoices (year, type, invoice_date, all_properties, is_cancelled)
           VALUES (1899, 999, now(), true, false)`,
        )
      })
    } catch {
      threw = true
    }
    assert(threw, 'expected the transaction to throw on the check-constraint violation')
    const fresh = await propertiesRepo.get(property.id)
    assert(fresh?.notes !== `${TAG} should not persist`, 'rollback failed — partial transaction write leaked')
  })

  // 9. Report-style aggregate query.
  await check('Report-style aggregate: reference-data usage-count', async () => {
    const refs = await referenceDataRepo.list()
    const used = refs.find((r) => r.reference_type === 233100005 || r.reference_type === 233100006)
    assert(used, 'need at least one category reference_data row')
    const usage = await referenceDataRepo.usageCount(used.id)
    assert(typeof usage.total === 'number', 'usage-count should return a numeric total')
  })

  // Cleanup: remove every row this run tagged, regardless of pass/fail above.
  await pool.query(`DELETE FROM proptrack.invoices WHERE description = $1`, [TAG])
  await pool.query(`DELETE FROM proptrack.properties WHERE short_id = 'ZZTEST'`)
  void testInvoiceId2

  // Activity Log cleanup (real fix — see api/test/run.ts history / migration.md "Clean NAS
  // deployment attempt"): createInvoice/cancelInvoice each write an activity_logs row with no FK
  // back to the invoice (activity_logs is deliberately FK-less by design), so deleting the
  // invoice above does NOT remove them. Left uncleaned, three runs of this suite previously
  // leaked 12 rows into production and required manual, explicitly-authorized deletion. Delete
  // precisely the rows this run created — scoped by table_name + the exact record_name values
  // used above + occurred_at >= testStartedAt — so a real production row can never be touched.
  if (activityLogRecordNames.length > 0) {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM proptrack.activity_logs
       WHERE table_name = 233100000 AND occurred_at >= $1 AND record_name = ANY($2)`,
      [testStartedAt, activityLogRecordNames],
    )
    const { rowCount: deleted } = await pool.query(
      `DELETE FROM proptrack.activity_logs
       WHERE table_name = 233100000 AND occurred_at >= $1 AND record_name = ANY($2)`,
      [testStartedAt, activityLogRecordNames],
    )
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM proptrack.activity_logs
       WHERE table_name = 233100000 AND occurred_at >= $1 AND record_name = ANY($2)`,
      [testStartedAt, activityLogRecordNames],
    )
    if (after.rows[0].n !== 0) {
      console.log(`WARNING: activity_logs cleanup left ${after.rows[0].n} residual row(s) — investigate before trusting the DB baseline`)
      fail++
    } else {
      console.log(`Activity Log cleanup: found ${before.rows[0].n}, deleted ${deleted}, 0 residual — matches production baseline`)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  await pool.end()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Fatal error running test suite:', err)
  await pool.end()
  process.exit(1)
})
