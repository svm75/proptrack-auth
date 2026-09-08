/** Typed API errors, translated from Postgres error codes at the repository boundary
 * (migration.md §API Architecture "Error handling"). Wording matches the current app's
 * existing inline validation messages where found in src/screens/*.tsx. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Record not found.') {
    super(404, message, 'NOT_FOUND')
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR')
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT')
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized.') {
    super(401, message, 'UNAUTHORIZED')
  }
}

interface PgError {
  code?: string
  constraint?: string
  detail?: string
  table?: string
}

/** Table -> friendly "in use" message, matching current app wording (src/screens/Properties.tsx,
 * src/screens/Admin.tsx) as closely as a generic FK violation allows. */
const RESTRICT_MESSAGES: Record<string, string> = {
  'invoices_property_id_fkey': 'Cannot delete — this property has invoices.',
  'supplier_contracts_property_id_fkey': 'Cannot delete — this property has supplier contracts.',
  'invoices_contact_id_fkey': 'Cannot delete — this contact has invoices.',
  'supplier_contracts_contact_id_fkey': 'Cannot delete — this contact has supplier contracts.',
  'invoices_category_id_fkey': 'In use — cannot delete.',
}

/** Translate a raw Postgres error (thrown by `pg`) into a typed ApiError. Anything not
 * recognized as a Postgres error code passes through unchanged for the caller to rethrow. */
export function translatePgError(err: unknown): ApiError | null {
  const pgErr = err as PgError
  if (!pgErr || typeof pgErr !== 'object' || !pgErr.code) return null

  if (pgErr.code === '23503') {
    // foreign_key_violation
    const msg = (pgErr.constraint && RESTRICT_MESSAGES[pgErr.constraint]) || 'Cannot delete or save — related records exist.'
    return new ConflictError(msg)
  }
  if (pgErr.code === '23514') {
    // check_violation
    return new ValidationError(`Invalid value${pgErr.constraint ? ` (${pgErr.constraint})` : ''}.`)
  }
  if (pgErr.code === '23505') {
    // unique_violation
    return new ConflictError(`Duplicate value${pgErr.constraint ? ` (${pgErr.constraint})` : ''}.`)
  }
  if (pgErr.code === '23502') {
    // not_null_violation
    return new ValidationError('A required field is missing.')
  }
  return null
}

/** Run a repository action, translating any Postgres error into a typed ApiError. */
export async function withPgErrorTranslation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const translated = translatePgError(err)
    if (translated) throw translated
    throw err
  }
}
