# PRD-10 phase 2 evidence — PR C (terrain data layer)

Branch `qr/prd10-terrain` (stacked on `qr/prd10-world-api`, PR #134).
Local gates on the Devin VM (linux x64, node v24, headless — no GPU, so
browser specs are NOT RUN here; they produce real numbers on the
`qr-prd10-world.yml` macos-14 job).

## Local gate results (this machine)

| Gate | Result |
|---|---|
| `tsc -p tsconfig.build.json --noEmit` | clean (0 errors) |
| `eslint` on all touched paths | clean |
| `vitest run tests/unit/contracts tests/unit/contracts/impl` | 44 files / 96 tests pass (incl. `prd10-terrain.test.ts` 19 tests) |
| `tools/qr-ownership/check.mjs` | 17 files → owner 10; `tsconfig.base.json` + `vitest.config.ts` → owner 15 (1-line alias each, qr-request #155) |

## T2.x status vs PRD

| Task | Status | Note |
|---|---|---|
| T2.1 height texture + CPU twin | DONE | `terrainHeightBilinear` bit-compatible with `a3dTerrainHeightBilinear`; `terrainGpuHeightReadback` test-only §15.2 |
| T2.2 CDLOD | DONE | per-node min/max, AABB frustum, `range_l=range_0·2^l`, `range_0=patchWorldSize·1.5`, C-27 lodBias |
| T2.3 patch geometry | DONE | shared `(N+1)²`, Uint16/Uint32 indices, §17 tier table |
| T2.4 material program | PARTIAL | `terrain.{vert,frag}.glsl.ts` composes both chunks per §8.1; `terrain.wgsl.ts` is a structural placeholder pending Path G wiring |
| T2.5 splat bake | PARTIAL | CPU `evalSplatRules` bakes RGBA8 maps sharing the GPU formula (±1/255); the GPU SplatBake compute/draw pass is still open (lands with PR D) |
| T2.6 builder + handle | DONE | `world.terrain` + `AuraTerrainHandle` (heightAt/normalAt/slopeDegAt/layerWeightsAt/raycast), holes, collider spec, procedural sources, asset source plumbed |
| T2.7 node handler + frame pass | DONE | C-36 `kind:"terrain"` handler registered; Path S instanced pass in `background` phase (heights packed RGBA32F — no `r32f` in `TextureFormat`, divergence documented); safe-basic mesh when `A3D_QR_CORE` off |
| T2.8 deprecate | DONE | `resolveTerrainSlopeBlend` `@deprecated`, export kept |

## Divergences recorded

- **RGBA32F height packing**: `TextureFormat` has no `r32f`; Path S packs heights
  into `rgba32f` and `texelFetch().r` semantics match the §8.1 R32F contract.
- **GPU splat bake**: CPU bake used on Path S for now — same formula ±1/255.
  Honest: no GPU bake pass exists yet.
- **Asset height sources**: resolve to `null` grid at handle-build time; decoded
  in the C-36 compile when `ctx.assets` is real (not yet runnable — no compile
  impl bound repo-wide, C-36 handlers are dormant until PR 0b/lane-15).
- **`i11` bilinear bug found by the tests**: row index was missing `* columns`
  in `terrainHeightBilinear` — caught by the corner/interior asserts, fixed.

## NOT RUN (needs macos-14 lane job)

- `terrain-gpu-cpu` readback ≤1e-4 (§15.2)
- `terrain-cracks` border-pixel spec
- S1.x terrain acceptance renders (G-PANEL checkpoint with I1–I7)
