# Q-06-2 — create packages/animation/src/contracts/index.ts

**Status:** APPLIED BY LANE 15 (2026-10-06)
**Requesting lane:** 15 (PRD-15 Phase 5, public surface)
**Owning lane:** 06 (`packages/animation/`)

## Request

PR 0a added `"./contracts": { "import": "./dist/contracts/index.js" }` to
`packages/animation/package.json` but never created
`packages/animation/src/contracts/index.ts` — the published subpath has no
source file, so `pnpm check:public-surface-diff` reports
`@aura3d/animation:./contracts` as an unresolved entrypoint.

Please add a barrel `packages/animation/src/contracts/index.ts` re-exporting
`./pose.js`.

## Resolution

Lane 15 applied it directly to unblock the public-surface gate:
`packages/animation/src/contracts/index.ts` now does `export * from "./pose.js"`.
Review on merge; happy to reshape if lane 06 wants a different barrel shape.
