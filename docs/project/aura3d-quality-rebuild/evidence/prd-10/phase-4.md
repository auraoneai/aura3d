# PRD-10 Phase 4 evidence — water (T4.1–T4.7)

PR: stacked on `qr/prd10-vegetation` (PR #176). Branch `qr/prd10-water`.
Flag: `A3D_QR_WORLD` + sub-flag `A3D_QR_WORLD_WATER` on the C-36 water handler.

## Task ledger

| Task | Status | Evidence |
|---|---|---|
| T4.1 `world/water/GerstnerWaves.ts` + OceanSurface re-export | done | `packages/rendering/src/world/water/GerstnerWaves.ts`; `OceanSurface.ts` re-exports `evaluateWaves`/`oceanPresetWaves`/`waveCompression`; CPU↔GPU-order agreement test ≤1e-3 m over 10 s × 100 points in `prd10-water.test.ts` |
| T4.2 `WaterMaterial.ts` §8.6 | done | `packages/rendering/src/world/water/WaterMaterial.ts` — Gerstner vertex displacement (`v_crest`), `a3d_prd10_water` fragment (dual normals, Fresnel, depth-gated refraction, Beer-Lambert, foam) + `a3d_prd10_world_light_fallback` (`a3dWorldEnvSpecular`, `a3dDirectSpecularGGX`, `a3dSunShadowAt`, `a3dApplyFog`); `HAS_SCENE=0` Low path = `u_deepColor`/`u_shallowColor` × `a3dSkyIrradiance` over `a_shore` baked attr; underwater back-face variant with Snell window (sin²T > 1 → TIR) |
| T4.3 `SceneCopyFallback.ts` | done | `packages/rendering/src/world/water/SceneCopyFallback.ts` — `after-opaque` pass `prd10.sceneCopy`; prefers `FRAME_RESOURCES.sceneColorCopy/sceneDepthCopy` blackboard entries, else fullscreen-draws rgba8 copies (depth linearized → RGBA8 packed — no blit API on RenderDevice); publishes `prd10.scene.{color,depth}.copy` |
| T4.4 `ReflectionViewPass.ts` §9.1 step 2 | done | `packages/rendering/src/world/water/ReflectionViewPass.ts` — C-08 `computePlanarMirrorCamera` + oblique near-clip, half-res rgba16f target, <2% coverage skip; publishes `prd10.water.reflection`; `WaterRuntime` re-draws `terrain` reflection layer via `drawTerrainsForReflection` |
| T4.5 `UnderwaterState.ts` + caustics | done | `packages/rendering/src/world/water/UnderwaterState.ts` — `isUnderwaterPoint`, `prd10.caustics` ShaderFeature (`A3D_PRD10_CAUSTICS`, hook `fragment:lights`, chunk `a3d_prd10_caustics`), `prd10.underwaterDistortion` post pass in `linear-hdr` enabled by blackboard `prd10.water.underwater`; C-21 absorption-fog ask filed as qr-request #187 (stub maps to linear fog) |
| T4.6 `agent-api/world/water.ts` + `nodes/water.ts` | done | `worldWater(options)` (§7.1.6 full option set, validation, auto-id), `WaterRecord`/`waterRecordFor`/`waterRecordIds`, `AuraWaterHandle` (`heightAt`/`normalAt`/`isUnderwater` through `gerstnerEvaluate`); `water.surface` emits `world.water({kind:"lake"})` + deprecation warn under `A3D_QR_WORLD` (env-read at builder time — app-level `qualityRebuild.flags` are invisible to builders; documented in `world/flags.ts`); `app.world.water(id)` real path in `world/runtime.ts` |
| T4.7 delete capture path | partial (per spec) | `rg` shows live importers outside PRD-10 (`rendering/index.ts`, `agent-api` water fixture, owner-15 tests) → kept `@deprecated` on `WaterReflectionRefractionCapture` + `WaterSurface.ts`; importer list + tracking under qr-request #188 (Q-14-1) |
| C-36 `water` handler | done | `agent-api/compiler/world.ts` — `kind:"water"` handler under `A3D_QR_WORLD_WATER`, `out.feature("world.water")`, `prd10.waters` render source, builderless JSON nodes resolve records |
| `WaterRuntime.ts` Path S draws | done | `production-runtime/world/WaterRuntime.ts` — 64×64 shore-annotated grid per shape, tier-resolved reflection/refraction, transparent-phase surface draw (blend on, depth write on), underwater back-face draw; `WorldFramePasses` wires `background` (reflections + terrain) → `after-opaque` (scene copy) → `transparent` (water) |

## §9.1 pass order (Path S)

shadows → `prd10.reflection.*` (background, mirror re-draw of `reflectionLayers`) → world opaque (`prd10.terrain`) → sky → `prd10.sceneCopy` (after-opaque) → `prd10.water` (transparent) → transparents → post (`prd10.underwaterDistortion` when submerged).

## Gates run

- `npx tsc -p tsconfig.build.json --noEmit` — clean for all Phase-4 paths (repo-wide run; pre-existing apps/ noise excluded).
- `npx eslint <all Phase-4 paths>` — clean.
- `npx vitest run tests/unit/contracts/impl/` — 6 files / 72 tests green (13 new prd10-water tests; prd10-terrain's `water()` Phase-4 stub expectation updated to the real error message).
- `node tools/qr-ownership/check.mjs <Phase-4 paths>` — all → owner 10.

## qr-request issues

- #187 — Q-07-3: real C-21 `setFog({mode:"absorption"})` for underwater (PRD 07 owns fog).
- #188 — Q-14-1: deprecated water capture retained while owner-01/15 importers exist (importer list in issue).

## Open risks / known gaps

- `a_position`/`a_shore` grid per node: circle/infinite/polygon shapes covered; `spline` shape degrades to `width*8` extent until `world.spline` lands (Phase 5).
- Detail normal/foam/caustics textures are deterministic procedural stand-ins; real atlases land with T5.7 content-bake.
- Planar reflection re-draw currently covers the `terrain` layer; `kit`/`hero` item producers join as their Path S passes land.
- `buildGrid` CPU cost is per-node at first draw (64×64 ≈ 4k verts); acceptable for Phase 4, revisit if node counts grow.

## NOT RUN

- Browser/GPU runs (WebGL draws, planar reflection pixels, refraction pixels) — no local GPU; the `qr-prd10-world.yml` macos-14 lane job covers them on push.
- `WaterReflectionRefractionCapture` pixel-comparison retirement — importers still live (see #188).
