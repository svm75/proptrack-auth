/**
 * Activity Log write helper. Rewired in Step 8 (migration.md) to route through
 * `src/data/index.ts`'s `repositories` — previously called `Cr9b5_pt_activitylogsService`
 * (Dataverse) directly and unconditionally, bypassing `VITE_DATA_BACKEND` entirely. Call sites
 * (InvoiceForm.tsx, Invoices.tsx, Reports.tsx, ForecastFlows.tsx, ClientOccupancy.tsx,
 * OwnerOccupancyFormDialog.tsx) are unchanged — same signature, same string labels — only the
 * data path changed.
 *
 * `repositories.activityLog.record()` already existed (used by `hooks/data.ts`'s
 * `useRecordActivity`) and is implemented for both backends:
 *  - dataverseRepositories: writes `cr9b5_pt_activitylogs` directly (identical behavior to what
 *    this file used to do inline).
 *  - postgresRepositories: a documented no-op — Postgres-mode Activity Log rows for invoices are
 *    written server-side in `api/src/services/invoiceService.ts`, in the same transaction as the
 *    mutation. Note (carried forward, not fixed here — out of this step's scope): that server-side
 *    write only covers the invoices bespoke routes; the plain-CRUD Postgres endpoints these other
 *    call sites exercise (owner-occupancies, forecast-flows, attachments) do not yet write
 *    activity_logs server-side, so in Postgres mode those specific actions are not logged. This
 *    is a pre-existing Step 6 gap (the no-op assumption), not introduced by this rewire, and is
 *    unrelated to the "no silent Dataverse fallback" requirement — no data is fetched from
 *    Dataverse in Postgres mode, it's just not yet mirrored into `activity_logs` for these tables.
 */
import { repositories } from '@/data'
import { ActivityAction, ActivityTable } from '@/domain/types'
import type { ActivityAction as ActivityActionType, ActivityTable as ActivityTableType } from '@/domain/types'

const ACTION_MAP: Record<'Created' | 'Updated' | 'Deleted' | 'Exported', ActivityActionType> = {
  Created: ActivityAction.Created,
  Updated: ActivityAction.Updated,
  Deleted: ActivityAction.Deleted,
  Exported: ActivityAction.Exported,
}

const TABLE_MAP: Record<'Invoice' | 'Contact' | 'Property' | 'Attachment' | 'Forecast Flow', ActivityTableType> = {
  Invoice: ActivityTable.Invoice,
  Contact: ActivityTable.Contact,
  Property: ActivityTable.Property,
  Attachment: ActivityTable.Attachment,
  'Forecast Flow': ActivityTable.ForecastFlow,
}

export async function logActivity(
  action: 'Created' | 'Updated' | 'Deleted' | 'Exported',
  table: 'Invoice' | 'Contact' | 'Property' | 'Attachment' | 'Forecast Flow',
  recordName: string,
  details?: string,
): Promise<void> {
  try {
    await repositories.activityLog.record(ACTION_MAP[action], TABLE_MAP[table], recordName, details)
  } catch {
    // log failure must never break the app
  }
}
