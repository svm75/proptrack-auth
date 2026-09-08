// Shared helpers for the Step 5 transform layer. Deterministic, no I/O.

/** Dataverse text/lookup fields are `null` when absent — pass through untouched. */
export function str(v) {
  return v === null || v === undefined ? null : String(v);
}

export function bool(v, fallback = null) {
  if (v === null || v === undefined) return fallback;
  return Boolean(v);
}

/** Preserve numeric decimal fields as-is; only substitute the schema's own
 * documented DEFAULT when the schema declares the column NOT NULL and the
 * source value is null (never invents a value the schema doesn't already
 * define as the default). */
export function decimalOrDefault(v, def) {
  return v === null || v === undefined ? def : v;
}

export function decimal(v) {
  return v === null || v === undefined ? null : v;
}

export function int(v) {
  return v === null || v === undefined ? null : v;
}

/** Dataverse DateTime -> Postgres TIMESTAMPTZ: pass the ISO-8601 string through unchanged. */
export function timestamp(v) {
  return v === null || v === undefined ? null : v;
}

/** Dataverse date-only fields are returned as full DateTime strings
 * ("2026-09-01T00:00:00Z"); extract just the date portion for a Postgres
 * DATE column. Required by the target schema's datatype (DATE vs TIMESTAMPTZ),
 * not a value alteration. */
export function dateOnly(v) {
  if (v === null || v === undefined) return null;
  return String(v).slice(0, 10);
}

export function uuid(v) {
  return v === null || v === undefined ? null : v;
}
