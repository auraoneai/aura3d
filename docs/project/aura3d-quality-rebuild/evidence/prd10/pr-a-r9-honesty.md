# PRD-10 PR A — R9 honesty evidence

Scope: T1.1–T1.5 (day-0 honesty fixes). No behaviour change behind `A3D_QR_WORLD`;
the bilinear sampler is a declared unflagged correctness fix (PRD-10 §11).
Claim label: **repo-internal evidence only** — nothing here asserts rendered quality.

## Landed

| Task | Change |
| --- | --- |
| T1.1 | `TerrainHeightfield.sampleTerrainHeightfield` now bilinear (4-texel blend); added `toHeightTexture` R32F payload. Test: `tests/unit/contracts/impl/prd10-terrain-bilinear.test.ts` (4 cases, incl. midpoint-of-ramp = mean ±1e-6). |
| T1.2 | `TerrainTiles.ts` header rewritten to "budget and query utilities only"; tile-LOD planner deleted; `createTerrainTileGrid` kept as `@deprecated` throwing stub (`removed-world-planner`). `TerrainTileKey`/`TerrainTilePlan`/`TerrainTileGridOptions` kept as `@deprecated` types — deleting them breaks `packages/rendering/src/index.ts` (lane-01), tracked via qr-request. |
| T1.3 | `VegetationScatter.ts` claim boundary now names `world.scatter` as the runtime and this module as the offline placement helper. |
| T1.4 | `EnvironmentPreset.createNamedEnvironmentPreset` deleted → `@deprecated` throwing stub (`removed-world-planner`). `NAMED_ENVIRONMENT_PRESETS`, `listNamedEnvironmentPresets`, `createEnvironmentPresetReport` unchanged. |
| T1.5 | Manifest: deleted the 3 alias presets. Verified by sha256: `industrial-sunset-puresky` == `autumn-field-puresky` (e60470d3), `spruit-sunrise` == `kloppenheim-puresky` (206c67e3), `venice-sunset` == `studio-small-08` (f6a989f8). `flagshipBindings` repointed to canonical ids (renders identical bytes as before). `requirements` corrected: `minimumPresets` 12→9, `minimumRealHdriSources` 6→3 — the corpus only ever had 3 distinct real HDRIs. |

## Caller fallout (lane-15/01 files, cannot edit — qr-request filed)

- `tests/unit/rendering/terrain-sprites-d2d4.test.ts` — 2 `it` blocks call `createTerrainTileGrid`; now throw. NOT RUN in any PR gate (CI runs `test:packages`; `test:unit` is not gated).
- `tests/unit/rendering/environment-lighting-reflection-platform.test.ts` — calls `createNamedEnvironmentPreset`; now throws. Same gate status.
- `tests/unit/environments/three-compat-environments.test.ts` — hardcodes `presetCount>=12`/`realHdriCount>=6`; needs `>=9`/`>=3` (or assert against `manifest.requirements`).
- HDRI alias ids referenced by `apps/wow-*/src/main.ts` (~9 apps), `packages/environments/src/threejs-example-parity/index.ts`, `packages/materials/src/{GameReadyMaterialLibrary,MaterialPreviewScene}.ts`, `archive/`, `tests/browser/current-routes-flagship-viewer.spec.ts`, `tests/unit/rendering/production-runtime-pbr-hdr-pipeline.test.ts`. Owners must migrate to canonical ids.
- `benchmarks/`: zero hits for the alias ids → Q-12-1 not filed (PRD condition "with any hit" not met).

## Verified locally

- `vitest run tests/unit/contracts/impl/prd10-terrain-bilinear.test.ts` — 4/4 pass.
- `vitest run tests/unit/rendering/procedural-texture-fixtures.test.ts` — pass (bilinear keeps height/biome assertions).
- `vitest run tests/unit/contracts` — pending CI.
- `pnpm typecheck:raw`, `pnpm lint` — pending CI.

## NOT RUN

- Browser/capture suites — PR A touches no rendering path; per CI-ROUTING the macOS conformance job still runs on this PR.
- `pnpm test:unit` full suite — the 3 lane-15 files above will fail until the qr-request is serviced.
