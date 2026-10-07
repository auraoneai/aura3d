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

---

## Addendum (Phase 7 T7.5 sweep, `qr/prd15-process-pruning`)

The full unreferenced sweep found **79 additional lane-12-owned dirs** with zero
in-repo references beyond the three-compat set above. Same mechanism: owner
deletes or declares the live reference.

- `tools/three-compat-claim-registry`
- `tools/head-to-head-skinned-morph-animation`
- `tools/external-parity-app-suite-readiness`
- `tools/external-parity-external-vite-build`
- `tools/superiority-developer-workflow`
- `tools/three-compat-app-suite-readiness`
- `tools/external-parity-api-readiness`
- `tools/threejs-parity-visual-review`
- `tools/three-compat-package-surface-readiness`
- `tools/threejs-parity-claim-registry`
- `tools/three-compat-completion-audit`
- `tools/threejs-parity-package-smoke`
- `tools/three-compat-threejs-runtime-parity`
- `tools/threejs-parity-api-surface-audit`
- `tools/superiority-physics-fidelity`
- `tools/superiority-performance`
- `tools/external-parity-static-preview-smoke`
- `tools/head-to-head-digital-twin-data`
- `tools/head-to-head-primitive`
- `tools/head-to-head-smart-city`
- `tools/three-compat-broad-replacement-readiness`
- `tools/three-compat-truth`
- `tools/three-compat-package-smoke`
- `tools/external-parity-fixture-readiness`
- `tools/threejs-parity-external-consumer`
- `tools/head-to-head-resource-lifecycle`
- `tools/three-compat-release-readiness`
- `tools/three-compat-environment-readiness`
- `tools/external-parity-scene-readiness`
- `tools/head-to-head-navigation-crowd`
- `tools/superiority-resource-lifecycle`
- `tools/threejs-parity-same-scene-render`
- `tools/three-compat-migration-readiness`
- `tools/head-to-head-physical-character`
- `tools/superiority-memory-lifecycle`
- `tools/threejs-parity-route-health`
- `tools/threejs-parity-completion-audit`
- `tools/three-compat-progress`
- `tools/head-to-head-gltf-product-viewer`
- `tools/superiority-common`
- `tools/three-compat-asset-readiness`
- `tools/external-parity-template-readiness`
- `tools/three-compat-threejs-visual-parity`
- `tools/external-parity-progress`
- `tools/head-to-head-physical-vehicle`
- `tools/head-to-head-cinematic-architecture`
- `tools/three-compat-template-readiness`
- `tools/superiority-visual-quality`
- `tools/external-parity-truth`
- `tools/three-compat-material-readiness`
- `tools/external-parity-asset-studio-readiness`
- `tools/external-parity-postprocess-readiness`
- `tools/superiority-feature-parity`
- `tools/head-to-head-scaffold-to-deploy`
- `tools/three-compat-visual-quality`
- `tools/head-to-head-instancing-lod`
- `tools/threejs-parity-runtime-import-audit`
- `tools/head-to-head-xr-interaction`
- `tools/external-parity-interactive-readiness`
- `tools/superiority-audit`
- `tools/head-to-head-postprocessed-scene`
- `tools/superiority-animation-fidelity`
- `tools/three-compat-external-vite-build`
- `tools/external-parity-shadow-readiness`
- `tools/threejs-parity-performance`
- `tools/external-parity-character-readiness`
- `tools/three-compat-animation-readiness`
- `tools/head-to-head-webgpu-tsl`
- `tools/head-to-head-custom-material-shader`
- `tools/external-parity-material-studio-readiness`
- `tools/external-parity-material-readiness`
- `tools/head-to-head-product-configurator`
- `tools/external-parity-product-readiness`
- `tools/superiority-claim-defense`
- `tools/external-parity-gltf-corpus-readiness`
- `tools/three-compat-legacy-prune-readiness`
- `tools/external-parity-roadmap-visual-quality`
- `tools/three-compat-docs-readiness`
- `tools/head-to-head-material-laboratory`
