# Q-01-7 — Delete the D-10 barrel-only orphan rendering files

- **Requester:** lane 15 (T5.4)
- **Owner:** lane 01 (`packages/rendering/src/` blanket prefix)
- **SLA:** 2 working days (CONTRACTS §6.5); requester does not wait
- **Status:** OPEN

## Ask

Delete the D-10 orphan source files under `packages/rendering/src/` that the
T5.3 named-export rewrite removed from the barrel. Lane 15 already stopped
re-exporting them (they were `export *`-only citizens); the file deletion is
yours because ownership sits under `packages/rendering/src/` → 01.

## Per-file safety check (rg -lw across the repo, own barrel/file excluded)

Clean orphans — only their own test or docs/reports hit:

| File | Exported names checked | Live consumers |
|---|---|---|
| `PrimitiveSubmissionAudit.ts` | `PrimitiveSubmissionAudit`, `createPrimitiveSubmissionAudit` | none (docs/api + PRD text only) |
| `UniformBinder.ts` | `UniformBinder` | none |
| `RendererVisualPipelineReport.ts` | `RendererVisualPipelineReport`, `createRendererVisualPipelineReport` | `tests/unit/rendering/renderer-visual-pipeline-report.test.ts` (its own test) |
| `performance/ResourceBudget.ts` | `ResourceBudget`, `createResourceBudget` | none |
| `VoxelWorld.ts` | `VoxelWorld`, `createVoxelWorld` | `tests/unit/rendering/procedural-texture-fixtures.test.ts` + `archive/examples/large-world-streaming-rejected/` |

Entangled — not safe to delete blindly:

| File | Entanglement |
|---|---|
| `ReflectionSurfaces.ts` | Backs the live `reflection-surfaces.ts` kebab-case module (re-exports `createReflectionSurface`, types) consumed by `tests/browser/reflection-surfaces-b4-*` |
| `ScreenSpaceReflectionPass.ts` | Re-exported by `reflection-surfaces.ts` (`ScreenSpaceReflectionPass`, `invertSsrProjection`, SSR types) |
| `performance/Octree.ts` | `StaticSpatialBounds`/`OctreeNode` shared with `SceneOptimization.ts` and `performance/BVH.ts` |
| `performance/RendererStats.ts` | `createRendererStats` consumed by `tests/performance/external-parity-performance-baselines.ts` |

Suggested handling for the entangled four: move `StaticSpatialBounds`/
`OctreeNode` into `performance/BVH.ts` (or a shared spatial types file),
fold the reflection types into `reflection-surfaces.ts` (lowercase), and
either keep `performance/RendererStats.ts` (11-adjacent perf harness) or
relocate it next to the baseline harness before deleting the orphan.

## Why lane 15 cannot do it

T5.4 authorizes lane-15 deletion only for files whose `QR_OWNERSHIP.json`
owner is 15; `node tools/qr-ownership/check.mjs` reports **01** for all of
these (the `packages/rendering/src/` prefix rule).

## Done when

The five clean orphans are deleted (with their tests), and each entangled
file is either deleted after disentangling or explicitly kept with a reason
recorded in `docs/architecture/` notes.
