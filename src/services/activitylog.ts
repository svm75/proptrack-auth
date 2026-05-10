import { Cr9b5_pt_activitylogsService } from '../generated/services/Cr9b5_pt_activitylogsService'

const ACTION_MAP = {
  Created:  233100000,
  Updated:  233100001,
  Deleted:  233100002,
  Exported: 233100003,
} as const

const TABLE_MAP = {
  Invoice:    233100000,
  Contact:    233100001,
  Property:   233100002,
  Attachment: 233100003,
} as const

function getCurrentUser(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const xrm = win.Xrm ?? win.parent?.Xrm
    return xrm?.Utility?.getGlobalContext?.()?.getUserName?.() || 'Unknown'
  } catch {
    return 'Unknown'
  }
}

export async function logActivity(
  action: 'Created' | 'Updated' | 'Deleted' | 'Exported',
  table: 'Invoice' | 'Contact' | 'Property' | 'Attachment',
  recordName: string,
  details?: string,
): Promise<void> {
  try {
    // ownerid / owneridtype / statecode are injected by the platform at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Cr9b5_pt_activitylogsService.create({
      cr9b5_action:     ACTION_MAP[action] as any,
      cr9b5_tablemame:  TABLE_MAP[table] as any,
      cr9b5_timestamp:  new Date().toISOString(),
      cr9b5_user:       getCurrentUser(),
      cr9b5_recordname: recordName,
      cr9b5_details:    details,
    } as any)
  } catch {
    // log failure must never break the app
  }
}
