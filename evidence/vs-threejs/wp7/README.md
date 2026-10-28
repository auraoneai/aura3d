# PRD-2 WP-7: skinned character and game loop frame structure (G3, G4, G5)

Branch `beat3js2/wp7-skinned-gameloop-fixes` (on top of `beat3js2/wp7-skinned-gameloop`). Method: `tests/browser/wp7-frame-structure.spec.ts` through `tools/bench-vs-threejs/harness/run-wp7.sh` on the remote ACR runner (software WebGL2, SwiftShader, 640x360, workspace-source build, one container per run). It records every draw, clear and blit of one steady frame with its framebuffer, viewport, program identity and defines, plus 3 x 60 steady frames (median CPU in `frame()` and total after `readPixels`) and a matched frame capture per arm.

## Which runs back which claim

| Run | Code | What it holds |
| --- | --- | --- |
| `base2/` | `beat3js2/integration` `packages/` (before WP-7), harness from this branch, `WP7_RECORD=1` | Draw and program counts, timing, `jpegMd5` and `lumaSha256` per arm. Source of `tests/browser/wp7-production-baseline.json`. |
| `final/` | this branch, spec assertions on | Same fields, plus `vsProduction` (luma difference of `aura-auto` against `aura-production`, computed in the spec from the planes). The run passed its assertions (`1 passed`). |
| `base1/`, `a1/`, `a3/`, `stack1/`, `prof1/` | earlier runs by the implementer | Structure and timing only. They carry no md5, sha256 or `vsProduction` field, so they back the counts and the program-creation stacks (`stack1`) and nothing about pixels. |
| `a2/` | experimental code that is not on any branch (see "Measured opportunity") | Structure and timing only. |

The luma planes are stripped from every committed JSON (300 KB each) and the matched-frame JPEGs are not committed (`*.jpg` is ignored). The pixel claims below rest on the hashes and difference statistics stored in `base2/wp7.json` and `final/wp7.json`, which `node tools/bench-vs-threejs/harness/wp7-compare.mjs <wp7.json>` prints. Earlier versions of this file quoted JPEG md5s and difference statistics for `base1`, `a1`, `a2` and `a3` that no committed artifact contained; those quotes are removed. The same md5s did appear again in `base2` and `final` (below), measured in new containers.

Software-rasteriser numbers. Container-to-container variance is large (the unchanged three.js arm took 28.9 / 23.8 / 25.6 ms for the game loop across `base1` / `a1` / `a3`, and 32.8 / 24.5 ms across `base2` / `final`), so compare arms inside one run, not across runs.

## Result against the acceptance list

| Item | Before (`base2`) | After (`final`) | Status |
| --- | --- | --- | --- |
| Game loop draws, `aura-auto` (<= 25) | 38 | 20 | met |
| Game loop programs, `aura-auto` (<= 4) | 6 | 4 | met |
| Skinned character programs, `aura-auto` (<= 5) | 8 | 4 | met |
| Skinned character draws | 6 (three.js 5) | 6 | unchanged, the extra draw is the HDR output pass |
| `quality: "production"` pixels | luma sha256 `e24b880a...` (game loop), `25bb05aa...` (skinned) | identical sha256 in `final` | byte-identical for these two frames; asserted by the spec against `tests/browser/wp7-production-baseline.json` |
| `auto` vs `production` frames | mean 0.000, max 0 | mean 0.000, max 0, interior max 0 on both scenes | met (identical) |
| Game loop total frame, `aura-auto` | 206.8 ms | 178.0 ms | not comparable across containers, see below |
| Skinned total frame, `aura-auto` | 306.6 ms | 275.2 ms | not comparable across containers, see below |
| Game loop auto / three-msaa | 6.30x | 7.27x | no improvement |
| Skinned auto / three-msaa | 3.49x | 3.87x | no improvement |
| CPU in `frame()` | game loop 6.0 ms, skinned 5.5 ms | 5.5 / 5.1 ms | within noise |

Frame-25 JPEG md5s (same in `base2` and `final`): `aura-auto` and `aura-production` game loop `4977204e85c138d012ecdfcbb5c3df2a`, skinned `3ab3d7ce9d275e982f37d5880fb6ea43`; three-msaa game loop `ff932fb106fdd0164635a21d1564f6ad`.

Scope of the pixel claims: one matched frame (frame 25 after load) of two scenes. In both scenes every item selects the same single cascade, so this evidence says nothing about boundary-straddling scenes. That case is covered at unit level instead (see "Cascade skip safety").

**Frame time did not improve.** Inside `final` the game loop `aura-auto` arm (20 draws) took 178.0 ms and the `production` arm (38 draws) 171.1 ms; inside `base2` they took 206.8 and 201.6 ms. Fewer draws did not make the frame faster. Both scenes are fill-bound in the 640x360 4x-MSAA rgba16f forward pass plus the resolve and tone-map pass. The 18 removed shadow draws are 2 cascades x 9 casters (8 coins and the player) into a depth map. The target stays as written; the measured value and cause are recorded here.

## What was in the frame (`base2`)

Game loop, `aura-auto` and `aura-production` identical, 38 draws: 3 shadow cascades x 9 casters = 27, 10 forward draws (ground, player, 8 coins), 1 output draw after one MSAA resolve blit. three.js draws 9 + 10 = 19. Programs created: 6, of which 2 are never drawn.

Skinned character, 6 draws: 2 shadow draws (one cascade), 3 forward, 1 output. Programs created: 8, of which 4 are never drawn.

Cause of the never-drawn programs (`stack1`): `Renderer.warmGeneratedProgramsSync` ran at the top of every frame, before the renderer-owned shadow map existed, so it warmed forward variants with no shadow bits (`shadows.cascades: 0`) that no draw uses, and a generated `pass: "depth"` variant per material that nothing draws (shadow casters render through the PRD-02 depth shaders). For the skinned scene that doubled to a skinned pair plus the ground pair.

Cause of the extra shadow draws: `Prd02ShadowSystem.renderCascades` redraws every caster into every cascade. The game-loop camera sees view depths 14.7 to 27.8 and the splits are 13.96 / 32.7 / 100, so every item picks cascade 1; cascades 0 and 2 are never sampled.

## What changed

1. `Renderer.warmGeneratedProgramsSync` runs after the shadow step in `render()` and is keyed on the shadow map the frame draws with; the warm input no longer asks for generated depth variants (`includeDepth: false`). Programs 6 -> 4 and 8 -> 4 for both arms (production keeps its draws and pixels; only never-drawn programs disappear). `renderAsync` is unchanged from `beat3js2/integration`: it has only its async warm, as before (an earlier revision of this branch added the new sync warm there too; that was removed because it was not needed for the measured path and added a mid-frame compile site).
2. `shadows/CascadeUse.ts` (new) and `Prd02ShadowBridge` / `ShadowSystem`: a cascade that no visible item selects is allocated but not cleared or drawn. The skip set is computed by evaluating the forward path's own selection per receiver: `forward/Lighting.ts` now exports `forwardCascadeSelectionDepth`, which `selectForwardShadowMap` calls and `CascadeUse` calls with the same item centre (`renderItemWorldCenter`), the same `resolvedCamera.viewMatrix` and the same `cameraPosition` the renderer hands the forward pass (`shadowFrameCamera(vp, eye, viewMatrix)`). An earlier revision recomputed the depth from the frame view-projection's clip w and widened it to a range; the current code has no parallel formula to drift. Fallbacks that draw every cascade: fewer than two cascades, no receivers, neither a view matrix nor an eye, a non-finite depth, a receiver on the PRD-02 lookup chunk. Gated by `device.skipUnusedShadowCascades`, set in `compiler/renderer.ts` by the same `quality: "auto" | "cinematic"` switch that gates bloom fusion; `production` still draws every cascade.
3. `tests/browser/wp7-frame-structure.spec.ts` and `tools/bench-vs-threejs/harness/{run-wp7.sh,wp7-*.mjs}`: the structure/timing/profile harness. The spec now asserts the acceptance numbers (see "Gate").

Cross-lane hunks, all minimal: `Renderer.ts` (warm call site, `receivers` and view matrix pass-through), `renderer/ShadowOrchestration.ts` (`receivers` option), `forward/Lighting.ts` (extract the depth expression into `forwardCascadeSelectionDepth`, same arithmetic), `engine/.../compiler/renderer.ts` (one flag line). No edit to the WP-1 bloom files, WP-5 device/state-cache/frameLoop files or WP-9 instancing files.

## Cascade skip safety

The forward path samples the cascade `selectForwardShadowMap` returns for each item, so a draw samples a skipped (uncleared) cascade only if `CascadeUse` and `selectForwardShadowMap` disagree. `tests/unit/rendering/shadow-cascade-skip.test.ts` (10 tests):

- 400 random trials (six camera rigs: rotated, off-axis, top-down, behind the scene; view matrix only, eye only, or both) check `unusedCascadeIndices` against the real `selectForwardShadowMap`: no reported cascade is picked by any item, and the reported set equals the unpicked set exactly.
- Items 1e-3 either side of a split boundary pick both neighbouring cascades.
- A side-offset item shows the view-matrix depth and the eye distance picking different cascades, and the function follows whichever the forward path uses.
- 24 full `Renderer` frames on the mock device (concrete `Camera` and structural `CameraLike`, rotated and off-axis, random receiver sets) plus an auto-frame frame with no camera: the shadow texture each forward draw binds is identical to the every-cascade frame's, and that cascade's target was cleared in the skipping frame. At least four of the frames skip a cascade.
- Mutating `CascadeUse` to ignore the view matrix fails three of these tests (checked by hand).

Not covered: a pixel comparison of a boundary-straddling scene against `production` in the browser. The two bench scenes select a single cascade.

## Program warm

`tests/unit/rendering/wp7-program-warm.test.ts` (2 tests): a shadowed one-material scene creates exactly one program (forward, `shadows.cascades: 2`) and compiles nothing after the first frame; `precompile`, `renderAsync` and `render` create no `pass: "depth"` program. Both tests fail on `beat3js2/integration` and fail when `includeDepth` is flipped back to `true`.

`includeDepth: false` sits in `collectWarmupInput`, shared by the sync warm and the async warm (`precompile`, `app.ready`, `renderAsync`). That is safe because the only generated-program acquire in `packages/` is `ForwardPass` (`pass: "forward"`); `Prd06ShaderWarmup` is a separate warm and still expands its own set. If a path later draws a generated depth program, it would compile mid-frame; the test above would not catch that (it pins what is warmed, not what is acquired), so the grep result is the only guard.

Known limit: the async warm (`precompile`, `app.ready`, `renderAsync`) still runs before the shadow map exists, so it keys on the explicit shadow map only (none for renderer-owned shadows) and falls back to the tier's shadow settings. That behaviour predates WP-7 and is unchanged; the 6 -> 4 and 8 -> 4 program reductions were measured on the sync `render()` path the bench uses. The only WP-7 effect on the async path is that it no longer warms depth variants.

## Gate

The remote spec fails when: game-loop `aura-auto` has more than 25 draws or more than 4 programs; skinned `aura-auto` has more than 5 programs; `aura-auto` differs from `aura-production` by more than 2/255 in mean or interior max; `aura-production`'s luma plane differs from `tests/browser/wp7-production-baseline.json` (the pre-WP-7 pixels, from `base2`). Run with `WP7_RECORD=1` to skip the assertions and only record (how `base2` was captured). The baseline hashes depend on the Chromium and SwiftShader build in the ACR image; regenerate them with a record run on the pre-change code when that image changes. The spec runs a 900 s build, so it is a remote check, not part of the unit suite.

## Unit test status

`tests/unit/rendering`, `tests/unit/contracts` and `tests/unit/perf-frame-cost`, run in this worktree for both states:

- `beat3js2/integration` `packages/` and `tests/unit/`: 16 failing files, 54 failing tests. Eight of those tests are the two new files above (they fail on the old code, as intended).
- This branch: 14 failing files, 46 failing tests. Every failing file here also fails on integration, with the same test names, except `contracts/impl/prd02-envcache-bytes.test.ts`, which hit its 5 s test timeout once in the full run and passed alone (1.6 s). `contracts/impl/prd03-lane-adapter-flags.test.ts` failed on integration in the full run and on this branch when run alone, again on the 5 s timeout. The remaining failures are the WebGPU tests (no GPU), tests needing ignored fixtures or LFS GLBs that this worktree does not have (`primitive-submission-audit`, `tsukuba-arch-opacity`), and the older `renderer` / `shader-library` / texture failures present on integration.
- `pnpm exec tsc -p tsconfig.build.json --noEmit` and `eslint` on the changed files: no output. `tsc -p tsconfig.check.json` reports no error in the changed or new files after fixing two in the new tests.

Registry: after both runs, `az-auraone-gurbaksh acr repository show-tags --repository aura3d-playwright` lists no tag containing `wp7` (both runs used `KEEP_IMAGE=0`).

## CPU (G4), profile of 120 steady frames (`prof1`, unminified, profiler on, so inflated)

Skinned: `frameRaw` 7.0 ms per frame = render 5.8 (forward pass 2.0, of which `drawItem` 1.8; output/post chain 1.7; scene update 1.1) + animation `advance` 1.2. Game loop: 5.7 ms = render 5.0 (forward 2.2, post chain 1.6). Findings, not changed here:

- The output pass (`WebGL2LegacyPostPipeline.prepareFullscreenPresentation`) saves and restores GL state with `getParameter` / `isEnabled` on every frame: 18 `getParameter` calls per frame, 0.66 ms (game loop) to 1.12 ms (skinned) of synchronous GL calls. That file belongs to the post/device lanes and replacing the reads with a cache is exactly the cross-frame state caching that was removed for stale-binding bugs, so it is left for WP-5 with the invalidation rules in front of it.
- Program-key work per draw (`programFeaturesFor`, `stableSerialize`, `programKey`, `physicalFeatureSet`) is about 0.3 to 0.4 ms per frame on 6 to 10 draws; a per-pass memo keyed on material revision and item attribute mask would remove most of it.
- `getError` sampling is 0.5 ms per frame on both scenes.

## Not done, and why

The task also asked to find mergeable draws (static geometry sharing a material, the sky folded into the first pass, non-caster shadow draws) and shareable programs (skinned vs unskinned depth variants). This branch removes only the dead warm programs and the unused cascades. The game loop remains at 20 draws and 4 programs against three.js 19 and 2, and the frame time did not improve. Merging the 8 coins needs instanced or batched submission, which is WP-9's lane, and the remaining programs are the forward variants the draws use plus the output pass.

## Measured opportunity not shipped: direct path for `output: { toneMapping: "aces" }`

Both bench scenes author `output: { toneMapping: "aces" }`, which `renderPathBlockers` treats as authored output and sends to the HDR chain although it equals the default (ACES filmic, exposure 1) and the direct path's in-shader encode. Run `a2` (experimental code, not on any branch, not reproducible from this repository) let exactly that value through. Its committed JSON (structure and timing only) shows game loop 19 draws, 3 programs, 121.0 ms against 177.9 ms for `production` in the same run, and skinned 5 draws, 3 programs, 207.2 ms against 261.6 ms. The frame difference figures quoted for that run in an earlier revision of this file (game loop mean 0.03, interior max 3; skinned mean 1.43, interior max 6, sky luma 177 vs 183) are not backed by a committed artifact (no luma planes, no hashes) and should be treated as unverified. It was not shipped because nine examples and apps author the same output line (`examples/*-port`, `apps/product-configurator`, `apps/aura-clash-showcase`, `apps/asset-lookdev`, ...), so the change would move their pixels under "never change game art", and it needs an owner decision, a visual-regression pass over those games, and a fresh measurement with the hash fields.

## Reproduce

```
tools/bench-vs-threejs/harness/run-wp7.sh <run-id> [out-dir]          # remote; WP7_NOMINIFY=1 adds creation stacks, GL-call time, V8 profile; WP7_RECORD=1 records without asserting
node tools/bench-vs-threejs/harness/wp7-compare.mjs <wp7.json>...      # draws, programs, timing, hashes, stored luma difference (computes diffs itself when a file still has luma planes)
node tools/bench-vs-threejs/harness/wp7-summary.mjs <wp7.json> [arm]   # per-pass draw list
node tools/bench-vs-threejs/harness/wp7-profile.mjs <wp7.json>         # CPU profile of an unminified run
```
