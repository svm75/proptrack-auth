import { dataverseRepositories } from '../../legacy/powerplatform/data/dataverse/dataverseRepositories'
import { postgresRepositories } from './postgres/postgresRepositories'
import type { Repositories } from './repositories'

// This file is used by the Dataverse/legacy build (`npm run build`, `pac code run`/`pac code
// push`) and local dev. The standalone NAS build (`npm run build:nas`, root Dockerfile) never
// loads this file at all — `vite.config.ts`'s `nasDataBackendPlugin` redirects every resolved
// `@/data` import to `./index.postgres.ts` instead, a file with zero reference to
// `dataverseRepositories`. See that file's own doc-comment for why: this file's ternary below is
// a real, unconditional static import that Rollup can't dead-code-eliminate and that `tsc` must
// still resolve for the NAS build even with `src/generated`/`src/data/dataverse` excluded from
// its project (an `exclude` only blocks a file's *initial* inclusion, not a still-included file's
// transitive imports).
//
// No mock-data mode: PropTrack is a live production app backed by real Dataverse tables —
// a mock/live toggle would risk silently running on fake data if an env var were ever unset
// at build time. There is exactly one implementation of `Repositories` used in production.
//
// Step 6 (migration.md) added a second, PostgreSQL-backed implementation
// (`./postgres/postgresRepositories`) behind an explicit opt-in env var, `VITE_DATA_BACKEND`.
// Its default — when the var is unset, which is every build today — is `dataverse`, so
// production behavior is unchanged. This switch exists only so the new backend is reachable
// for manual verification; no screen or build config sets `VITE_DATA_BACKEND=postgres` today.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const backend = (import.meta as any).env?.VITE_DATA_BACKEND

export const repositories: Repositories = backend === 'postgres' ? postgresRepositories : dataverseRepositories

export type { Repositories, CrudOps } from './repositories'
