# PRD-10 Phase 3 evidence — scatter, wind, foliage, impostors, grass

Branch `qr/prd10-vegetation` (PR E), stacked on `qr/prd10-terrain` (PR #154).

## What shipped (T3.1–T3.8)

| Task | Deliverable | Evidence |
| --- | --- | --- |
| T3.1 | `rendering/world/vegetation/InstanceChunkGrid.ts` — 32 m cells, compact32 + matrix48 layouts, `byteOffset = rangeStart*stride`, per-cell AABB incl. `localHeight*scale + maxWindSway`, positive-vertex frustum cull, lazy vertex buffer | unit tests `prd10-scatter.test.ts` "InstanceChunkGrid" (5) |
| T3.2 | `engine/agent-api/world/scatter.ts` — `scatterHash(seed,layer,cx,cz)` → per-cell `scatterRng` Bridson k=30, `onLayers`/slope/height/mask/exclude rules, `planScatterInstances`, `enforceFrameBudget`, `scatterChecksum` = SHA-256 sorted placements | unit tests "scatter planner" (6) |
| T3.3 | `rendering/world/vegetation/WindField.ts` — §8.2 A3DWind UBO `[dirX,dirZ,strength,time,gust,1/gustScale,0,0]`, 64² RG8 gust noise (`wind-gust-64.rg8` committed asset = byte-twin of `gustNoiseData`), `registerPrd10WindFeatures()` → `prd10.wind` `vertex:deform` + `registerDepthVariantFeature` (depth/distance) | unit tests "wind UBO/noise/asset-twin" (3) |
| T3.4 | `FoliageMaterial.ts` — §8.3 compact32 VS (yaw unorm16, f16 scale as GL floats), `a3dFoliageTranslucency` material lobe, alpha test always; A2C gated on real C-04/C-15 + MSAA | unit tests + lobe registration in `lanes/prd10.ts` |
| T3.5 | `ImpostorMaterial.ts` — §8.4 hemi-octa atlas VS (`a3dOctaCell`, quad triangulation, 3-sample blend + parallax), dithered crossfade over 4 m, optional `gl_FragDepth` | shader-source unit coverage (path G) |
| T3.6 | `tools/impostor-bake/` — CLI plan mode (pure `impostorBakePlan`, `impostorViewGrid`, `impostorManifestEntry`), `--execute` lazy-imports Playwright `bake-page.mjs` (`--use-angle=metal`, macos-14 only); C-39 `assets bake-impostor` registered | `runImpostorBake` plan tests; remote-runner bake NOT RUN locally |
| T3.7 | `GrassField.ts` (8 m ring, sorted cells, blade/card geometry, strip→triangles) + `production-runtime/world/GrassRuntime.ts` (rgba32f height tex, lazy programs, per-chunk draws, tiered radius/density, cards on Low) | unit tests "chunkRing invariants"; GPU path NOT RUN locally |
| T3.8 | `agent-api/nodes/instances.ts` — `static/chunkSize/shadowLod/wind/impostor` options stamp `placements` (`matrices` row-major mat3x4, `colors` rgba); default `chunkSize=32` at >256 instances; C-36 scatter handler promotes under `A3D_QR_WORLD` | unit tests "T3.8 placements" (3) |

## Contract/ownership touches

- `AuraScatterNode`/`AuraGrassNode` + options `id` fields — matches `AuraTerrainNode` precedent (auto `scatter-N`/`grass-N`).
- `AuraModelNode` (owner 15) NOT touched: placements attach via structural extension on emitted JSON.
- `packages/engine/assets/world/` — CONTRACTS.md assigns owner 10 but `.github/QR_OWNERSHIP.json` resolves it to owner 15 → manifest writes flagged in PR body + qr-request issue.
- `lanes/prd10.ts` now registers `registerPrd10WindFeatures` + `registerPrd10FoliageLobe` (flag-gated inside registries).

## Gates

- `npx tsc -p tsconfig.build.json --noEmit` — clean (pre-existing apps/ noise filtered)
- `npx eslint <all touched>` — clean
- `npx vitest run tests/unit/contracts/impl/` — 5 files / 59 tests green
- `node tools/qr-ownership/check.mjs` — all owner 10 except `packages/engine/assets/world/` (owner-15 gap, flagged)

## NOT RUN (deferred to lane CI / remote runner)

- Browser specs (scatter determinism under GPU cull, foliage alpha-test render, grass tier budget, impostor crossfade) — macos-14 lane job + this lane's browser spec file pending
- `bake-page.mjs` actual Playwright GLB bake — remote runner only
- C-26 real conformance run — G-PANEL checkpoint at Phase 7
