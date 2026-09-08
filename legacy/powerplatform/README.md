# Legacy Power Platform / Dataverse implementation

This directory contains the retained legacy Dataverse repository implementation
(`data/dataverse/`) and generated Power Platform Code App models/services
(`generated/`) that were originally under `src/`.

**It is not used by the NAS production build.** The NAS build (`npm run build:nas`)
resolves `@/data` to `src/data/index.postgres.ts`, which has no reference to
anything in this directory. It is only reachable from the default/legacy build
(`npm run build`, `pac code push`), via `src/data/index.ts`.

A handful of `src/generated/models/*.ts` files remain in `src/generated/` (not
here) because they are still imported — as types only, erased at compile time —
by a few NAS screens (`Dashboard.tsx`, `CategoryPnL.tsx`, `CategoryTrend.tsx`,
`OccupancyTrend.tsx`, `ExpenseBreakdown.tsx`). See `docs/ARCHITECTURE.md` for the
full module-separation breakdown.

Kept for historical rollback per `migration.md`'s hard safety rules — do not
delete until the NAS-hosted application has been proven stable in real use.
