import { postgresRepositories } from './postgres/postgresRepositories'
import type { Repositories } from './repositories'

/**
 * NAS/PostgreSQL production build's `@/data` module — resolved in PLACE of `./index.ts` for the
 * NAS build only, via a build-time module-id redirect (`vite.config.ts`'s
 * `nasDataBackendPlugin`, active when `VITE_DATA_BACKEND=postgres`, matched by
 * `tsconfig.app.nas.json`'s `paths` override for type-checking). See `./index.ts` for why this
 * exists: that file's runtime `backend === 'postgres' ? … : …` ternary is a real, unconditional
 * static import of `dataverseRepositories` that Rollup can't prove dead (so it survives in the
 * bundle) and that `tsc` must resolve regardless of any `exclude` (excludes only prevent a file's
 * initial inclusion, not its transitive resolution once something included imports it) — pulling
 * in `src/generated/services/*.ts`, which import `@microsoft/power-apps/data`, a package this
 * project's `package.json` never declares (Power Platform's own `pac`/`power-apps` tooling
 * resolves it outside npm's dependency tree at `pac code push` time). This file has zero
 * reference to `dataverseRepositories`/`src/generated`/`src/data/dataverse` at all, so the NAS
 * build's module graph and `tsc` pass never reach any of it — a real fix, not a suppressed error.
 */
export const repositories: Repositories = postgresRepositories

export type { Repositories, CrudOps } from './repositories'
