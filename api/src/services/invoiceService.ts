import { withTransaction } from '../db.js'
import { invoicesRepo, type NewInvoiceRow, type InvoiceRow } from '../repos/invoicesRepo.js'
import { activityLogsRepo } from '../repos/activityLogsRepo.js'
import { propertiesRepo } from '../repos/propertiesRepo.js'

const ACTIVITY_TABLE_INVOICE = 233100000 // ActivityTable.Invoice, src/domain/types.ts
const ACTION_CREATED = 233100000
const ACTION_UPDATED = 233100001

function buildInternalId(shortId: string, seq: number, year: number): string {
  return `${shortId}${String(seq).padStart(3, '0')}/${year}`
}

export interface CreateInvoiceInput {
  invoice: Omit<NewInvoiceRow, 'internal_id' | 'global_sequence'>
  /** Skippable exactly like today's "No/Auto Internal ID" option (migration.md §Business Rule
   * Placement) — when true, internal_id/global_sequence are left null. */
  skipInternalId?: boolean
  userName?: string
}

/**
 * Create an invoice with ID sequencing + Activity Log write in one transaction
 * (migration.md §Business Rule Placement "Invoice internal-ID sequencing" and
 * "Activity Log creation"). Never issues a hard-delete anywhere in this module — invoices are
 * only ever soft-cancelled via invoicesRepo.cancel.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<InvoiceRow> {
  return withTransaction(async (client) => {
    let internalId: string | null = null
    let globalSequence: number | null = null

    if (!input.skipInternalId) {
      const seq = await invoicesRepo.nextSequence(input.invoice.year, client)
      let shortId = 'All'
      if (!input.invoice.all_properties && input.invoice.property_id) {
        const property = await propertiesRepo.get(input.invoice.property_id, client)
        shortId = property?.short_id ?? 'UNK'
      }
      internalId = buildInternalId(shortId, seq, input.invoice.year)
      globalSequence = seq
    }

    const created = await invoicesRepo.create(
      { ...input.invoice, internal_id: internalId, global_sequence: globalSequence },
      client,
    )

    await activityLogsRepo.record(
      {
        action: ACTION_CREATED,
        tableName: ACTIVITY_TABLE_INVOICE,
        recordName: internalId ?? '(no internal ID)',
        userName: input.userName,
      },
      client,
    )

    return created
  })
}

export async function updateInvoice(
  id: string,
  patch: Partial<NewInvoiceRow>,
  userName: string | undefined,
  changedFieldsSummary?: string,
): Promise<InvoiceRow | null> {
  return withTransaction(async (client) => {
    const updated = await invoicesRepo.update(id, patch, client)
    if (!updated) return null
    await activityLogsRepo.record(
      {
        action: ACTION_UPDATED,
        tableName: ACTIVITY_TABLE_INVOICE,
        recordName: updated.internal_id ?? '(no internal ID)',
        details: changedFieldsSummary,
        userName,
      },
      client,
    )
    return updated
  })
}

/** Soft-delete (cancel) + Activity Log, one transaction. Never a hard DELETE. */
export async function cancelInvoice(id: string, userName?: string): Promise<InvoiceRow | null> {
  return withTransaction(async (client) => {
    const cancelled = await invoicesRepo.cancel(id, client)
    if (!cancelled) return null
    await activityLogsRepo.record(
      {
        action: ACTION_UPDATED,
        tableName: ACTIVITY_TABLE_INVOICE,
        recordName: cancelled.internal_id ?? '(no internal ID)',
        details: 'Cancelled (soft delete)',
        userName,
      },
      client,
    )
    return cancelled
  })
}
