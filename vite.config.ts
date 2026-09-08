import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const sharedDataDir = path.resolve(__dirname, 'src/data') // the directory itself, e.g. via `@/data` -> `.../src/data`
const sharedDataIndex = path.resolve(__dirname, 'src/data/index.ts')
const sharedDataIndexNoExt = path.resolve(__dirname, 'src/data/index')
const nasDataIndex = path.resolve(__dirname, 'src/data/index.postgres.ts')

// NAS/PostgreSQL production build only (VITE_DATA_BACKEND=postgres, root Dockerfile's
// `npm run build:nas`): every resolved import of `src/data/index.ts` (the `@/data` module, used
// by all four call sites via that alias) is redirected to `src/data/index.postgres.ts`, which has
// zero reference to `dataverseRepositories`/`src/generated`/`src/data/dataverse`. See
// `src/data/index.postgres.ts`'s doc-comment for the full "why": a runtime ternary in the shared
// file is a real static import Rollup can't tree-shake and `tsc` can't skip via a directory
// `exclude` alone (excludes only stop *initial* inclusion, not a still-reachable file's
// transitive imports) — this redirect makes the Dataverse module genuinely unreachable from this
// build's graph, not just unreachable at runtime.
//
// Note: Vite's own built-in `resolve.alias` (`@` -> `src`) expands `@/data` to an absolute path
// BEFORE any plugin's `resolveId` sees it, even with `enforce: 'pre'` — so `source` here already
// arrives as an absolute path with no extension (e.g. `.../src/data`, not the literal `'@/data'`
// string), which is why this matches against the resolved directory/index forms, not the alias
// text itself (confirmed by tracing actual `resolveId` calls during a real build).
function nasDataBackendPlugin(): Plugin {
  return {
    name: 'proptrack-nas-data-backend-redirect',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null
      const isSharedData =
        source === sharedDataDir ||
        source === sharedDataIndex ||
        source === sharedDataIndexNoExt ||
        (source.startsWith('.') &&
          (path.resolve(path.dirname(importer), source) === sharedDataIndex ||
            path.resolve(path.dirname(importer), source) === sharedDataIndexNoExt ||
            path.resolve(path.dirname(importer), source) === sharedDataDir))
      return isSharedData ? nasDataIndex : null
    },
  }
}

export default defineConfig({
  plugins: [react(), ...(process.env.VITE_DATA_BACKEND === 'postgres' ? [nasDataBackendPlugin()] : [])],
  base: './',
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
