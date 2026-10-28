# Exposure parity with three.js r185 (lane L-Q, WP-Q.1)

Measured on software WebGL2 (SwiftShader) on the remote runner (`tools/remote-acr/run.sh`, spec `tests/browser/exposure-calibration.spec.ts`), 320x200 centre crop of a flat roughness-1 plane lit head-on, `output.exposure = 1`, 4.3.7 sources. Software GL only; not a real-GPU claim.

## Direction correction

The PRD text says "skinned character mean luma 144 (Aura3D) vs 192 (three.js)". The raw record says the opposite: `evidence/vs-threejs/results.json` has `meanLuma.three = [143.96, 145.33]` and `meanLuma.aura = [192.45, 192.39]`, and `RESULTS.md` section 9 lists "mean luma three / Aura (f25)" as `144.0 / 192.5`. Aura3D was the brighter one, so the calibration darkens Aura3D (removes an implicit fill), it does not brighten it.

## Cause

A scene that authored lights and no environment was still lit by the scene category's implicit studio/daylight environment (`compiler/environment.ts`, `categoryLighting`), on top of the authored lights. The authored light units were already correct (`A * I / PI`).

## Linear output vs three (ratio of measured / `A*I/PI` + the roughness-1 dielectric lobe)

| Case | 4.3.7 before | after |
| --- | --- | --- |
| directional 1, #808080 | 6.32 | 1.005 |
| directional 2.2 warm, #cc8844 | 2.37 / 3.66 / 4.78 | 0.997 / 0.998 / 1.006 |
| directional 3, white | 1.05 (clipped) | 1.000 |
| directional 0.5, #4488cc | 12.99 / 11.50 / 10.41 | 1.016 / 1.004 / 0.999 |
| directional 2, #6f8a5a | 3.72 / 3.65 / 3.84 | 0.995 / 1.001 / 1.011 |
| ambient 1, #808080 | 0.997 | 0.997 |
| ambient 0.5 + sun 2 | not run | 0.999 |
| hemisphere 1.3 (sky = ground) | 0 (light dropped; fill came from the category environment) | 1.014 / 1.003 / 1.011 |
| hemisphere 1.3 + sun 2 | not run | 1.004 / 1.000 / 1.001 |
| no lights at all (#808080) | linear 0.361 | unchanged on purpose (three renders black; Aura3D keeps the category environment so an unlit scene still shows) |

ACES display luma (default operator, exposure 1) for directional 1 on #808080: 188.9 before, 67.0 after, three.js reference 67.3.

## Known approximation

A hemisphere light enters as the mean of its sky and ground colours (three's value on a horizontal normal). Up- and down-facing surfaces differ from three by half the sky/ground gap. The calibration case uses sky = ground so it is exact. The skinned-character bench scene (`#dce8f2` over `#4d6358`) was not re-run in this lane.

## Baselines

No visual baseline was refreshed in this lane. Scenes affected: those with authored lights and no `environments.*` node and no light probe; they get darker (to the three numbers above). `environments.studio()` (or any `environments.*`) restores the old fill. `tests/browser/post-luma.spec.ts` fails at `daylight vignette` (0.722 against a 0.78 floor) both on the 4.3.7 sources and with this change, so it is not caused by it. `tests/browser/agent-api-visual-smoke.spec.ts` cannot bundle `@aura3d/engine/devtools` in the container (pre-existing).

## Affected scenes, before/after (WP-Q.1 / PRD section 6)

Rule: a `createAuraApp` scene that authors lights and no `environments.*` node (and no light probe) is lit by those lights only. Enumerated by source scan (`apps/`, `examples/`, `packages/create-aura3d/templates`, `packages/aura3d-cli/templates`) and by the engine's own report (`app.diagnostics()` carries `preset: "authored-lights"`), then rendered before (4.3.7 behaviour toggled back on) and after on the remote runner (`tests/browser/exposure-scenes-*.spec.ts`, 320x200, software WebGL2, 9 s boot, whole-frame mean luma 0 to 255). Frames: `frames/before/<slug>.jpg`, `frames/after/<slug>.jpg`; raw rows: `frames/scenes.json`, `frames/looks.json`.

Scan result: 24 of 65 scene units author lights without an environment; none is a template. All 26 showcase games, and all templates, bring an environment (`looks.*`, `environments.*`, sky/city kits) and their luma moves by 0%.

| Scene | before | after | change |
| --- | --- | --- | --- |
| examples/compute-lab | 35.5 | 14.0 | -60% (a WebGPU compute test page; the frame is mostly its status text, not lit art) |
| examples/post-order-lab | 7.9 | 6.9 | -12% (its only light is a deliberate 0.25 "dim key") |
| examples/heatsink-port, strange-orbit-port | 25.7, 55.6 | 25.1, 54.4 | -2% |
| examples/aura-slam | 60.9 | 61.4 | +1% |
| apps/camera-path, context-loss-recovery, hello-world-typed-asset, material-lighting, postprocessing-bloom, postprocessing-custom, examples/custom-shader-lab, parity-runtime-lab, shader-failure-lab, saiyan-snake-way-port | | | 0% |
| examples/parity-texture-lab, selfheal-lab, splat-rush-port | n/a (no baseline frame) | 65.9, 6.5, 190.3 | not comparable |
| examples/shadow-lab, xr-lab | 30.5, 9.1 | n/a (no frame after) | not comparable (lab pages that need a feature the container lacks) |

Their luma barely moves because these scenes are mostly background at this size; the calibration table above is the per-pixel evidence.

### Look presets

Ten of the fifteen `looks.preset(id)` expand with an HDRI environment and render identically (0.00 change). Five had `hdri: null` and relied on the implicit fill; rendered in one fixed scene (grey ground and three grey solids), mean luma before / after the calibration alone / after the retune:

| Look | before | calibration alone | retuned |
| --- | --- | --- | --- |
| night-city | 95.0 | 1.5 (black) | 95.3 (`fill: night 1.0`) |
| polar-night | 109.6 | 4.4 (black) | 109.9 (`fill: night 1.0`) |
| neon-arcade | 130.6 | 1.8 (black) | 130.9 (`fill: night 1.0`) |
| space | 156.5 | 94.7 | 148.8 (`fill: studio 0.75`, -5%) |
| underwater | 25.2 | 18.9 | 25.2 (`fill: studio 1.0`) |

`AuraLookV0Expansion.fill` is new: `v0Children` emits `environments.nightCinematic` or `environments.studio` at that intensity when `hdri` is null. `tests/unit/rendering/look-presets-environment.test.ts` keeps every preset on an environment. No game art was touched and no visual-regression golden needed a refresh (every changed preset is within 5% of its old luma).

## Skinned character (Q1) and console (Q2)

`tests/browser/exposure-skinned.spec.ts` mounts the bench scene unmodified against the workspace engine: Aura3D mean luma 136.2 against three.js 144.0 at frame 25 (ratio 0.946, within the 10% gate; 4.3.7 was 192.5). The console is empty. The only warning on the five bench scenes in `RESULTS-4.3.7.md` was `WEIGHTS_0 normalized: 52 rescaled` on the Soldier, whose FLOAT weights are up to 2% off 1 on 52 vertices (checked on the GLB). The debug-level tolerance is therefore 5%, not the PRD's 1e-3; zero, negative or badly scaled weights still warn.

## post-luma `daylight vignette` (0.722 against a 0.78 floor)

Not caused by this change: the identical 140.3 / 194.3 = 0.722 (pastel 156.2 / 216.7, dusk-arena 68.6 / 93.1) is what the 4.3.7 sources give. It is also not a stale test: `evidence/post-graph-migration/README.md` records 174.3 (-10.3%) for the linear-light vignette, and commit `3405d2082` made that the opt-in (`__A3D_LINEAR_VIGNETTE__` / `?linearvig=1`), putting the 4.2.0 display-space vignette (-26 to -28%) back as the default. The spec now pins both routes: default >= 0.70, opt-in linear >= 0.78.

## Open: the direct render path does not encode to sRGB

Found by the default-route check in `exposure-calibration.spec.ts` and confirmed by `post-luma.spec.ts`: with the probe left on `quality: "auto"`, the no-effects frame of the daylight scene reads 79.1 while the identical scene with an effect, or pinned to `quality: "production"` (`none` = `bloom` = 128.4), reads 128.4. With no `output` option, a scene without post takes the `quality: "auto"` direct path (`A3D_QR_CORE_OUTPUT` pinned off). Its mean luma is 18 for a case that reads 67 on the HDR path (and three.js reads 67): the generated forward program writes linear colour and nothing encodes it, so every no-post frame is about 3.7x too dark (linear 0.072 shows as byte 18). `dir-1-grey+hdrpath` (an inert bloom forcing the HDR path) matches three exactly. This is outside lane Q (`packages/rendering/src/quality/DirectPath.ts`, `ProgramGenerator.ts`), so it is recorded, not patched.
