import { dataverseRepositories } from './dataverse/dataverseRepositories'
import type { Repositories } from './repositories'

// No mock-data mode: PropTrack is a live production app backed by real Dataverse tables —
// a mock/live toggle would risk silently running on fake data if an env var were ever unset
// at build time. There is exactly one implementation of `Repositories`.
export const repositories: Repositories = dataverseRepositories

export type { Repositories, CrudOps } from './repositories'
