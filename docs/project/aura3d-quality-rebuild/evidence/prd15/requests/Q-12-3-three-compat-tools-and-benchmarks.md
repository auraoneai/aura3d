# Q-12-3 — three-compat tool dirs + benchmarks (lane 12)

**Filed by:** Lane 15 (PRD-15 T6.2/T6.4)
**Status:** request — lane 12 decides delete-vs-keep per PRD line 1448/1025
**PRD refs:** §6.8 (line 909: "`tools/three-compat-*` (30 dirs) and `benchmarks/three-compat/` (owner 12) → request Q-12-3"), request row Q-12-3 (line 1448: delete dirs `script-prune --report` marks unreferenced; decide whether the frozen r185 `head-to-head` inputs stay).

## What lane 15 already did (compile breakers — APPLIED BY LANE 15)

`tsconfig.build.json` compiles `tools/**/*.ts`, so anything importing the deleted
`packages/three-compat` package broke the build the moment it was removed:

**Deleted (imported symbols that no longer exist):**
- `tools/three-compat-loader-readiness/` — `GLTFLoaderCompat`, `OBJLoaderCompat`, `ThreeCompatTextureLoader`
- `tools/three-compat-core-compat-readiness/` — package barrel symbols
- `tools/three-compat-compatibility-matrix/` — `ThreeCompatibilityMatrix` type
- `tools/three-compat-controls-readiness/` — package barrel symbols
- `tools/three-compat-material-geometry-compat-readiness/` — package barrel symbols
- `tools/three-compat-threejs-inventory/` — `buildThreeApiInventory`, `REQUIRED_THREE_API_CATEGORIES`, `buildInitialCompatibilityMatrix`
- `tools/packed-migration-consumer/` (owner 15) — imported `@aura3d/three-compat/{controls,loaders}`

**Repointed (import `migrateThreeToA3D`, which survived — moved to the CLI):**
- `tools/three-compat-migrate-three/index.ts` — now imports `../../packages/aura3d-cli/src/migrate-three/ThreeToA3DAdapter`
- `tools/three-compat-migration-readiness/index.ts` — same repoint; its `requiredFiles` list rewritten to the new CLI paths + `tests/unit/aura3d-cli/migrate-three.test.ts`

## Remaining 12-owned dirs (runtime-broken, compile-clean)

These reference `packages/three-compat/**` only in `requiredFiles`/`readFileSync`
lists or scan roots — they typecheck but fail their existence checks if invoked.
All 20 `three-compat:*` root scripts that invoked them are deleted (T6.4), so
nothing calls them anymore:

`three-compat-truth`, `three-compat-progress`, `three-compat-legacy-prune-readiness`,
`three-compat-claim-registry`, `three-compat-environment-readiness`,
`three-compat-material-readiness`, `three-compat-asset-readiness`,
`three-compat-animation-readiness`, `three-compat-docs-readiness`,
`three-compat-package-surface-readiness`, `three-compat-app-suite-readiness`,
`three-compat-template-readiness`, `three-compat-package-smoke`,
`three-compat-external-consumer`, `three-compat-external-vite-build`,
`three-compat-static-preview-smoke`, `three-compat-broad-replacement-readiness`,
`three-compat-release-readiness`, `three-compat-completion-audit`,
`three-compat-threejs-visual-parity`, `three-compat-threejs-runtime-parity`,
`three-compat-visual-quality` (shared `visualStats` helper — keep if other tools use it)

Also with stale `packages/three-compat` rows (scan lists, not requiredFiles):
`threejs-parity-threejs-inventory` (J-scan bucket), `threejs-parity-api-surface-audit`,
`threejs-parity-migration-audit` (requiredFiles), `threejs-parity-runtime-import-audit`
(allowedThreeUsage text).

## Benchmarks

`benchmarks/three-compat/` (incl. `shared/scenes` imported by the parity tools) —
per PRD line 1448, lane 12 decides whether the frozen r185 `head-to-head` inputs stay.

## Why

The package they measured no longer exists; a "compat readiness" gate for deleted
code is exactly the dishonest surface PRD-15 removes.
