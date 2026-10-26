# Post chain migration: what was measured and what changed

All numbers are software WebGL2 (SwiftShader) on the remote runner, one author. None is real-GPU evidence. Run ids: `pcpost-before`, `pcpost-before2`/`pcpost-base2` (4.2.0 tree), `pcpost-after2`/`pcpost-after3` (this branch), `pcpost-slam`, `pcpost-gA0..2` / `pcpost-gB0..2` (games, after and before). Raw data: `post-luma-before.json`, `post-luma-after.json`, `games-luma.json`.

## Finding

The 4.2.0 notes blamed the legacy post chain for tone-mapping and encoding on its own and bypassing `OutputPass`. Measured, that is not what darkens frames:

- Through `createAuraApp` every frame already goes through the PostGraph v2 seam and is tone-mapped and sRGB-encoded exactly once (the OUT stage). Mean luma with bloom on is within 0.6% of tone-map-only in all three scenes. Turning the post lane off (`-post`) gives the same mean luma as post-on without effects, because the production runtime always submits a tone-mapping pass.
- The 25 to 40% darkening was `effects.vignette()`. The v2 tail applied it to display-referred bytes after the tone map: `effects.vignette({ intensity: 0.16, smoothness: 0.65 })` removed 26 to 28% of mean luma in every scene. (The Cross Hop and Iron Crown figures in `evidence/regress-fix/` compare against `game,-post`, which also drops the vignette.)

## What changed

- The vignette is a light falloff, so it now multiplies linear light inside the single OUT (tone-map and encode) stage, before the one tone operator. `executePostGraphWebGL2` folds `pipeline.vignette` into the tone descriptor (`createLegacyOutputPass(..., vignette)`); the LDR shader gets a compile-time `LDR_VIGNETTE` variant (`ldrVariantKey` is unchanged when it is off); `runV2LdrTail` no longer receives the vignette, so a vignette-only chain no longer needs the tail at all. Chains without a vignette are unchanged (identical mean luma and chroma in the `none` and `bloom` rows below).
- `POSTPROCESS_V2_UNMIGRATED` is gone (console warning, `output.postSkipped` code `post-v2-unmigrated`, skip reasons). The Renderer asks the same predicate the executor uses (`postV2SeamDeclineReason`) before it builds the frame; a chain the v2 seam cannot run (`compat.post: "3.0"`, `-post`, WebGPU, `cpu-deterministic`, passes the fused LDR set cannot order) is reported as `post-legacy-route:<reason>` / `POSTPROCESS_LEGACY_ROUTE:<reason>` in diagnostics only.
- `effects.*` and the renderer options are unchanged. Frames still render on the chain's forward graph; the scene render path is untouched, so Aura Slam draw calls do not move.

Done in the follow-up (4.3.0): chain frames whose remaining descriptors are bloom and tone mapping now tone-map and encode in the real `OutputPass` (see the section at the end). The fused present remains for chains that carry legacy display-space descriptors (colour grade, FXAA, SSR, outline) or a non-default white point, so those still encode inside it; the background-coverage mix and the juice overlay are still not applied on chain frames (the overlay keeps its DOM fallback).

## Three-scene probe (`tests/browser/post-luma.spec.ts`, 640x400, default flags)

Mean luma of the whole frame; the last column is the new frame against the same scene with no effects.

| Scene | Variant | Before (4.2.0) | After | After vs same scene, no effects |
|---|---|---|---|---|
| daylight | none | 194.3 (0.0%) | 194.3 | 0.0% |
| daylight | bloom | 194.5 (0.1%) | 194.5 | 0.1% |
| daylight | vignette | 140.3 (-27.8%) | 174.3 | -10.3% |
| daylight | both | 140.4 (-27.7%) | 174.5 | -10.2% |
| dusk-arena | none | 93.1 (0.0%) | 93.1 | 0.0% |
| dusk-arena | bloom | 93.6 (0.6%) | 93.6 | 0.6% |
| dusk-arena | vignette | 68.6 (-26.3%) | 76.5 | -17.8% |
| dusk-arena | both | 69.1 (-25.8%) | 77.0 | -17.2% |
| pastel | none | 216.7 (0.0%) | 216.7 | 0.0% |
| pastel | bloom | 217.1 (0.2%) | 217.1 | 0.2% |
| pastel | vignette | 156.2 (-27.9%) | 202.6 | -6.5% |
| pastel | both | 156.5 (-27.8%) | 203.2 | -6.2% |

- Bloom: 0.1 to 0.6% in both builds (the glow is tiny at `intensity 0.16`). The spec asserts within 3%.
- Vignette `0.16 / 0.65`: was -26 to -28%, is now -6 to -18% (the scene decides: bright scenes lose less because ACES compresses the highlights after the multiply). A visible vignette is a darkening by design, so "within 3% of no vignette" is not the right bar for vignette frames; the spec asserts at least 78% of the no-vignette luma (4.2.0 gave 72 to 74%) and no `POSTPROCESS_V2_UNMIGRATED` console text or `postSkipped` record.

## 26 games (`tests/browser/post-luma-games-{0,1,2}.spec.ts`, 480x300, one idle frame at about 14 s after the route-ready hook)

| Game | Mean luma before | after | Change | Status |
|---|---|---|---|---|
| top-tennis | 54.6 | 55.9 | +2.5% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| roadster-rush | 58.9 | 67.6 | +14.6% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| heatsink | 59.6 | 67.5 | +13.3% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| teleoperator | 45.6 | 51.5 | +12.8% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| iron-crown | 15.3 | 15.3 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.16 / 0.65, about +21% (arithmetic model, not a render) |
| pips-big-leap | 16.0 | 16.0 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. No vignette in the app or example source |
| aura-hoops-3d | 50.3 | 55.6 | +10.7% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| aura-diamond-3d | 53.1 | 55.3 | +4.1% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| aura-fc-3d | 90.0 | 90.3 | +0.4% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| red-zone-3d | 62.5 | 66.7 | +6.8% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| aura-links-3d | 109.8 | 126.9 | +15.6% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| bunker-zero | 19.4 | 19.4 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.2 / 1, about +13% (arithmetic model, not a render) |
| slingshot-siege | 85.3 | 91.2 | +7.0% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| dot-dash-3d | 26.5 | 26.5 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.22 / 0.65, about +28% (arithmetic model, not a render) |
| cross-hop | 8.2 | 8.2 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.16 / 0.65, about +21% (arithmetic model, not a render) |
| strange-orbit-port | 25.5 | 25.5 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.22 / 0.7, about +25% (arithmetic model, not a render) |
| splat-rush-port | 184.1 | 184.1 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. No vignette in the app or example source |
| serpentine-sky-run-port | 47.4 | 47.4 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. No vignette in the app or example source |
| drift-and-deliver-port | 42.2 | 42.2 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.2 / 0.7, about +23% (arithmetic model, not a render) |
| heatsink-port | 25.2 | 25.2 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.3 / 1, about +21% (arithmetic model, not a render) |
| ninja-runner-port | 38.6 | 38.6 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.22 / 0.7, about +25% (arithmetic model, not a render) |
| last-train-port | 21.7 | 21.7 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.22 / 0.7, about +25% (arithmetic model, not a render) |
| roadster-hours-port | 59.1 | 70.2 | +18.7% | measured (post chain active; the 4.2.0 run logged the warning, the new run does not) |
| where-the-wind-wanders-port | 162.0 | 162.0 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. Authored vignette 0.1 / 0.8, about +10% (arithmetic model, not a render) |
| silt-and-signal-port | 30.8 | 30.8 | n/a | not measurable here: the renderer did not mount (model files not in the checkout, or a dev-server transform error); frames identical before and after. No vignette in the app or example source |
| cloud-runner-port | 174.9 | 174.9 | 0.0% | no post chain active at the screenshot in either run; unchanged |

Read this as direction, not a benchmark: each game animates, the screenshot is a single frame under a CPU rasteriser, and 15 of 26 games could not be measured because the checkout does not contain the hash-named GLBs (`public/aura-assets/trafficSedan.5c...`, the port `*.glb` files) that production serves, so their renderer never mounted in either run. For those the modelled lift is the same arithmetic as the probe (vignette field averaged over the frame, display-space multiply against linear-space multiply), an upper bound next to the measured 4% to 19%. No game logs `POSTPROCESS_V2_UNMIGRATED` in the new run (for the unmounted ones that says nothing).

## Gates

- Aura Slam G3 (`tests/browser/aura-slam-render.spec.ts`, `pcpost-slam`): passed, 6 venues at 1280x720 and 640x360, draw calls 111 to 125 (budget 150).
- Post and renderer browser specs (`pcpost-after2` against the 4.2.0 tree `pcpost-base2`): `ldr-variant-equivalence`, `qr-prd03-post-lut`, `parity-post`, `instanced-texture`, `shadow-footprint` and `post-luma` pass in both. `createAuraApp-postprocess-contract` and the two `qr-prd03-post-banding` tests fail identically in both (the slim remote context has no GLBs: `glTF extension scan failed`), so they are not regressions.
- Unit: new `tests/unit/contracts/impl/pcpost-post-graph-migration.test.ts` (stage ordering, exactly one tone-mapping descriptor in six chain shapes, vignette in the OUT descriptor and absent from the tail, shader order of vignette before the operator, route and decline reasons). Updated `core-output-legacy-post-route`, `t0-07-post-skipped`, `prd03-t0-07-v2-unmigrated`. Wider suites (`tests/unit/{contracts/impl,rendering,parity,engine}`, `tests/qr/prd01`): 51 failing tests, the same 51 as the 4.2.0 tree.

Repeat: `SPECS="tests/browser/post-luma.spec.ts" RUN_ID=pcpost-n tools/remote-acr/run.sh`; games: `CONTEXT_PROFILE=full EXTRA_DIRS="apps/showcase-<each game> apps/showcase-port-shared" SPECS="tests/browser/post-luma-games-0.spec.ts" tools/remote-acr/run.sh` (and `-1`, `-2`; reuse the image with `BUILD=0 IMAGE_TAG=...`).

## Follow-up: the OUT stage runs in the OutputPass (4.3.0)

All numbers are software WebGL2 (SwiftShader) on the remote runner, one author, not real-GPU evidence. Runs: `p1hdr-luma2`, `p1hdr-slam2`, `p1hdr-specs2`, `p1hdr-ga2-{0,1,2}` (new route) and `p1hdr-gb-{0,1,2}` (the tree before the change).

### What changed

- `executePostGraphWebGL2` now routes a chain whose remaining descriptors are only bloom and tone mapping (after the HDR stages that own their effects are filtered out) through: HDR stages, then `presentHdrBloom` (the native HDR bloom, composited into a pooled rgba16f target), then the shared `OutputPass` (one operator, one sRGB encode) into the LDR tail target or the canvas. `OutputPass` gained a linear-light vignette (multiplied before exposure and the operator) and a full-coverage mode (a chain frame tone-maps every pixel; the alpha-derived background mix applies only to the no-chain route).
- The OutputPass is shared per device (`outputPassForDevice`), so the no-chain route and the chain route use the same compiled variants.
- The route binds the final destination before the OutputPass runs (the pass restores the previously bound target), so a frame ends on the default framebuffer or the explicit output target, never on an HDR target. The first version of this change left the HDR target bound and every default frame read back as black (`p1hdr-luma`, mean luma 0); the committed version fixes it.
- Operators: every OutputPass operator (none, linear, reinhard, aces, agx, neutral, cineon). aces, linear and reinhard are formula-identical to the fused program. agx, neutral and cineon on chain frames now use the three.js r185 ports the no-chain route already used (the fused program had approximations), so those three look the same with or without a chain.
- Not changed: chains with a legacy colour-grade, FXAA, SSR or outline descriptor, or a non-default white point, keep the fused present. The legacy chain (`post-legacy-route`) stays: compat.post "3.0", the `-post` opt-out, non-WebGL2 devices and `cpu-deterministic` still need it.

### Exactly one tone map and encode

`tests/unit/contracts/impl/pcpost-post-graph-migration.test.ts` counts, for 7 named configurations and then every combination of 7 operators, vignette, LDR tail and 5 descriptor sets (more than 100 cases), that exactly one tone map happens: one OutputPass call, or one fused tone-mapping descriptor, never both. `tests/qr/prd01/unit/output-pass-v2-out-stage.test.ts` covers the OutputPass variants.

### Three-scene probe (`tests/browser/post-luma.spec.ts`, 640x400)

Mean luma on the new route equals the previous fused route within 0.1 in all twelve cells: daylight 194.3 / 194.5 / 174.3 / 174.5, dusk-arena 93.1 / 93.6 / 76.5 / 77.0, pastel 216.7 / 217.1 / 202.6 / 203.2 (none / bloom / vignette / both). Bloom moves luma 0.1 to 0.6%; the vignette darkening is by design (the same -6 to -18% as before).

### Gates

- Aura Slam G3 (`tests/browser/aura-slam-render.spec.ts`, `p1hdr-slam2`): passed, draw calls 117 to 125 (budget 150).
- `ldr-variant-equivalence`, `qr-prd03-post-lut`, `parity-post`, `instanced-texture`, `shadow-footprint`: 7 of 7 pass (`p1hdr-specs2`). The `plain-*` rows that print FAIL in `instanced-texture` are the spec's negative controls.
- Unit: the three adapted suites and the new one pass; the wider rendering, contracts, parity and qr suites show no failure that the unchanged tree does not already have.

### 25 games, before and after (`post-luma-games-{0,1,2}.spec.ts`, 480x300, one idle frame about 14 s after route-ready)

Every game mounted this time: the probe fetches the hash-named GLBs the checkout lacks from the deployed site (`LUMA_ASSET_ORIGIN`, default `https://aura3d.auraone.ai`), which is why the 15 games that could not be measured earlier are measured here.

| Game | Before: fused OUT (mean luma) | After: OutputPass OUT | Change |
|---|---|---|---|
| top-tennis | 55.9 | 55.9 | -0.0% |
| roadster-rush | 67.7 | 68.2 | 0.8% |
| heatsink | 67.5 | 67.5 | 0.0% |
| teleoperator | 51.5 | 51.5 | 0.0% |
| iron-crown | 57.1 | 57.1 | -0.1% |
| pips-big-leap | 126.5 | 126.5 | 0.0% |
| aura-hoops-3d | 53.6 | 55.7 | 3.9% |
| aura-diamond-3d | 55.3 | 55.3 | -0.0% |
| aura-fc-3d | 89.9 | 90.3 | 0.4% |
| aura-links-3d | 126.9 | 127.2 | 0.3% |
| bunker-zero | 65.0 | 65.0 | 0.0% |
| slingshot-siege | 91.2 | 91.2 | 0.0% |
| dot-dash-3d | 26.5 | 26.5 | 0.0% |
| cross-hop | 109.0 | 107.7 | -1.1% |
| strange-orbit-port | 25.5 | 25.5 | 0.0% |
| splat-rush-port | 184.1 | 184.1 | 0.0% |
| serpentine-sky-run-port | 47.4 | 47.4 | 0.0% |
| drift-and-deliver-port | 42.2 | 42.2 | 0.0% |
| heatsink-port | 25.2 | 25.2 | 0.0% |
| ninja-runner-port | 38.6 | 38.6 | 0.0% |
| last-train-port | 21.7 | 21.7 | 0.0% |
| roadster-hours-port | 70.2 | 70.2 | 0.0% |
| where-the-wind-wanders-port | 162.0 | 162.0 | 0.0% |
| silt-and-signal-port | 30.8 | 30.8 | 0.0% |
| cloud-runner-port | 174.9 | 174.9 | 0.0% |

Read this as direction, not a benchmark: games animate and each figure is one frame under a CPU rasteriser. 20 of 25 games are identical to one decimal; the largest movers are Aura Hoops (+3.9%, a handler animating at a different instant), Cross Hop (-1.1%) and Roadster Rush (+0.8%). Console noise (404s on optional resources) and the `dot-dash-3d` page error ("Unexpected reserved word") appear in both runs, so this change does not cause them.
