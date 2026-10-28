# PRD-2 WP-7: skinned character and game loop frame structure (G3, G4, G5)

Branch `beat3js2/wp7-skinned-gameloop`. Method: `tests/browser/wp7-frame-structure.spec.ts` through `tools/bench-vs-threejs/harness/run-wp7.sh` on the remote ACR runner (software WebGL2, SwiftShader, 640x360, workspace-source build, one container per run). It records every draw, clear and blit of one steady frame with its framebuffer, viewport, program identity and defines, plus 3 x 60 steady frames (median CPU in `frame()` and total after `readPixels`) and a matched frame capture per arm. Raw results: `base1/` (code as inherited from `beat3js2/integration`), `a1/` and `a3/` (this branch, final code), `stack1/` (program creation stacks, unminified build), `prof1/` (V8 profile and GL-call time, unminified build). Luma planes are stripped from the committed JSON and the matched-frame JPEGs are not committed (`*.jpg` is ignored); the md5 of each frame-25 JPEG is quoted below instead.

Software-rasteriser numbers. Container-to-container variance is large (the unchanged three.js arm moved 28.9 / 23.8 / 25.6 ms for the game loop across `base1` / `a1` / `a3`), so compare arms inside one run, not across runs.

## Result against the acceptance list

| Item | Before (`base1`) | After (`a1`, `a3`) | Status |
| --- | --- | --- | --- |
| Game loop draws, `aura-auto` (<= 25) | 38 | 20 | met |
| Game loop programs (<= 4) | 6 | 4 | met |
| Skinned character programs (<= 5) | 8 | 4 | met |
| Skinned character draws | 6 (three.js 5) | 6 | unchanged, the extra draw is the HDR output pass |
| `quality: "production"` pixels | frame 25 JPEG md5 `4977204e...` (game loop), `3ab3d7ce...` (skinned) | identical md5 in `a1`, `a2`, `a3` | byte-identical |
| `auto` vs `production` frames | 0 / 0 | mean 0.000, max 0 on both scenes (`a1`, `a3`) | met (identical) |
| Game loop total frame, `aura-auto` | 189.4 ms | 166.4 ms (`a1`), 174.9 ms (`a3`) | see below |
| Skinned total frame, `aura-auto` | 297.7 ms | 275.3 ms (`a1`), 259.2 ms (`a3`) | see below |
| Game loop auto / three-msaa | 6.55x | 6.99x (`a1`), 6.83x (`a3`) | no change |
| Skinned auto / three-msaa | 3.69x | 3.70x (`a1`), 3.64x (`a3`) | no change |
| CPU in `frame()` | game loop 5.0 ms, skinned 4.7 ms | 5.0 / 5.1 and 4.8 / 5.1 ms | no change |

**Frame-25 JPEG md5s.** `aura-production`, game loop: `4977204e85c138d012ecdfcbb5c3df2a` in `base1`, `a1`, `a2`; skinned: `3ab3d7ce9d275e982f37d5880fb6ea43` in all three. `aura-auto` on this branch (`a1`) has the same two md5s as `production`; three-msaa game loop is `ff932fb106fdd0164635a21d1564f6ad`.

**Frame time did not move beyond run-to-run variance.** Inside `a1` the game loop `auto` arm (20 draws) took 166.4 ms and the `production` arm (38 draws, same programs) 174.9 ms; inside `a3` 174.9 vs 175.7 ms. Both scenes are fill-bound in the 640x360 4x-MSAA rgba16f forward pass plus the resolve and tone-map pass; the removed cascade passes drew eight small coins into a depth map. The `production` arm also fell from 189 to 175 ms with its draw count unchanged, which shows the container variance is as large as the whole effect. The target stays as written; the cause is recorded here.

## What was in the frame (`base1`)

Game loop, `aura-auto` and `aura-production` identical, 38 draws: 3 shadow cascades x 9 casters = 27, 10 forward draws (ground, player, 8 coins), 1 output draw after one MSAA resolve blit. three.js draws 9 + 10 = 19. Programs created: 6, of which 2 are never drawn.

Skinned character, 6 draws: 2 shadow draws (one cascade), 3 forward, 1 output. Programs created: 8, of which 4 are never drawn.

Cause of the never-drawn programs (`stack1`): `Renderer.warmGeneratedProgramsSync` ran at the top of every frame, before the renderer-owned shadow map existed, so it warmed forward variants with no shadow bits (`shadows.cascades: 0`) that no draw uses, and a generated `pass: "depth"` variant per material that nothing draws (shadow casters render through the PRD-02 depth shaders). For the skinned scene that doubled to a skinned pair plus the ground pair.

Cause of the extra shadow draws: `Prd02ShadowSystem.renderCascades` redraws every caster into every cascade. The game-loop camera sees view depths 14.7 to 27.8 and the splits are 13.96 / 32.7 / 100, so every item picks cascade 1; cascades 0 and 2 are never sampled.

## What changed

1. `Renderer.warmGeneratedProgramsSync` runs after the shadow step and is keyed on the shadow map the frame draws with; the warm input no longer asks for generated depth variants (`includeDepth: false`). Programs 6 -> 4 and 8 -> 4 for both arms (production keeps its draws and pixels; only never-drawn programs disappear).
2. `shadows/CascadeUse.ts` (new) and `Prd02ShadowBridge` / `ShadowSystem`: a cascade that no visible item can select is allocated but not cleared or drawn. The legacy forward path picks one cascade per item from its centre depth (`selectForwardShadowMap`), so an unselected cascade is never sampled and no pixel changes. Used set = every cascade between the one the view depth selects and the one the eye distance selects, per item (conservative for either depth definition). Fallbacks that draw every cascade: fewer than two cascades, no receivers, non-perspective matrix, non-finite centres, a receiver on the PRD-02 lookup chunk, no eye. Gated by `device.skipUnusedShadowCascades`, set in `compiler/renderer.ts` by the same `quality: "auto" | "cinematic"` switch that gates bloom fusion; `production` still draws every cascade. Game loop draws 38 -> 20.
3. `tests/browser/wp7-frame-structure.spec.ts` and `tools/bench-vs-threejs/harness/{run-wp7.sh,wp7-*.mjs}`: the structure/timing/profile harness behind these numbers.

Cross-lane hunks, all minimal: `Renderer.ts` (warm call site, `receivers` pass-through), `renderer/ShadowOrchestration.ts` (`receivers` option), `engine/.../compiler/renderer.ts` (one flag line). No edit to the WP-1 bloom files, WP-5 device/state-cache/frameLoop files or WP-9 instancing files.

## Tests

`tests/unit/rendering/shadow-cascade-skip.test.ts` (6 tests): the unused-set maths, the unsafe fallbacks, bridge draw counts with and without the flag, map layout unchanged. `rendering`, `contracts` and `perf-frame-cost` suites: 16 failing files on this branch; the same files on a clean `beat3js2/integration` worktree fail the same tests, plus 6 `primitive-submission-audit` tests that only fail here because this worktree holds 129-byte Git LFS pointers for `tests/fixtures/gltf-multipart/*.glb` ("Invalid GLB magic"). `npx tsc -p tsconfig.build.json --noEmit` passes.

## CPU (G4), profile of 120 steady frames (`prof1`, unminified, profiler on, so inflated)

Skinned: `frameRaw` 7.0 ms per frame = render 5.8 (forward pass 2.0, of which `drawItem` 1.8; output/post chain 1.7; scene update 1.1) + animation `advance` 1.2. Game loop: 5.7 ms = render 5.0 (forward 2.2, post chain 1.6). Findings, not changed here:

- The output pass (`WebGL2LegacyPostPipeline.prepareFullscreenPresentation`) saves and restores GL state with `getParameter` / `isEnabled` on every frame: 18 `getParameter` calls per frame, 0.66 ms (game loop) to 1.12 ms (skinned) of synchronous GL calls. That file belongs to the post/device lanes and replacing the reads with a cache is exactly the cross-frame state caching that was removed for stale-binding bugs, so it is left for WP-5 with the invalidation rules in front of it.
- Program-key work per draw (`programFeaturesFor`, `stableSerialize`, `programKey`, `physicalFeatureSet`) is about 0.3 to 0.4 ms per frame on 6 to 10 draws; a per-pass memo keyed on material revision and item attribute mask would remove most of it.
- `getError` sampling is 0.5 ms per frame on both scenes.

## Measured opportunity not shipped: direct path for `output: { toneMapping: "aces" }`

Both bench scenes author `output: { toneMapping: "aces" }`, which `renderPathBlockers` treats as authored output and sends to the HDR chain although it equals the default (ACES filmic, exposure 1) and the direct path's in-shader encode. Letting exactly that value through (run `a2`, code not on this branch) gave game loop 19 draws, 3 programs, 121.0 ms (production 177.9 ms in the same run) and skinned 5 draws, 3 programs, 207.2 ms (production 261.6 ms): -32% and -21% against `production` in the same container. Frames against `production`: game loop mean 0.03, interior max 3; skinned mean 1.43, interior mean 1.42, interior max 6, and the whole skinned difference is the sky: the direct path writes the authored `#9db4c8` background as luma 177 (three.js 177) while the HDR path's inverse-ACES clear gives 183. It was not shipped because nine examples and apps author the same output line (`examples/*-port`, `apps/product-configurator`, `apps/aura-clash-showcase`, `apps/asset-lookdev`, ...), so the change would move their pixels (up to 6/255 on bright backgrounds, tolerance in `direct-path-parity.json` is interior max 6) under "never change game art". It needs an owner decision and a visual-regression pass over those games.

## Reproduce

```
tools/bench-vs-threejs/harness/run-wp7.sh <run-id> [out-dir]          # remote; WP7_NOMINIFY=1 adds creation stacks, GL-call time, V8 profile
node tools/bench-vs-threejs/harness/wp7-compare.mjs <wp7.json>...      # draws, programs, timing, luma diffs (needs luma planes, i.e. an unstripped file)
node tools/bench-vs-threejs/harness/wp7-summary.mjs <wp7.json> [arm]   # per-pass draw list
node tools/bench-vs-threejs/harness/wp7-profile.mjs <wp7.json>         # CPU profile of an unminified run
```
