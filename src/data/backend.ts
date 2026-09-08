/**
 * Shared backend-selection flag, split out of `src/data/index.ts` so platform-specific UI
 * (e.g. the NAS document-upload panels in Properties.tsx/InvoiceForm.tsx) can branch on it
 * without importing the full repository object. Single source of truth for "which backend is
 * this build wired to" — `src/data/index.ts` uses the same `VITE_DATA_BACKEND` read.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backend = (import.meta as any).env?.VITE_DATA_BACKEND

/** True when this build talks to the PostgreSQL/NAS API (the production target). */
export const isPostgresBackend = backend === 'postgres'

/** True when this build runs against Dataverse via the Power Apps Code App host (legacy/rollback). */
export const isDataverseBackend = !isPostgresBackend
