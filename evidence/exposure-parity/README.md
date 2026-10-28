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

## PRD-2 WP-6: attribution of the cube, PBR viewer and forest gaps

Measured on the remote runner (`tests/browser/exposure-cases.spec.ts`, run `wp6-attr-4`, software WebGL2, 640x360, frame 24, bench glue luma). The spec mounts the bench scene sources as written and with one term changed at a time, for both libraries. Raw rows and frames: `evidence/exposure-parity/wp6/cases.json`, `evidence/exposure-parity/wp6/frames/`. CPU references: `tests/unit/rendering/exposure-cases.test.ts`. The harness reproduces the figures in `evidence/vs-threejs/RESULTS-candidate.md` (cube 12.75 / 2.88, forest 119.6 / 148.1; PBR viewer 89.4 / 55.0 against the recorded 91.1 / 55.0).

**Result: no engine calibration was made.** Every gap traces to the bench sources or to a documented default, not to a light-unit defect in `forward/Lighting.ts`, `app/colorManagement.ts` or `compiler/environment.ts`. Because nothing was calibrated, `look capture` / `look judge` were not re-run (no look preset changed, nothing to compare). When the inputs are matched, all three scenes land within 10% of three.js (table at the end).

### Cube: ambient 1 on #d86a3a (12.8 vs 2.9)

The cube is lit correctly. Face radiance is A * 1 / PI, the three r185 value (unit test), and the neutral room probe adds nothing: the authored-lights knob is zero, so the bind zeroes the room.

| Config | Aura3D | three.js |
| --- | --- | --- |
| bench as written | 12.75 | 2.88 |
| Aura3D background black (default ACES) | 2.52 | 2.52 (three with `ACESFilmicToneMapping` switched on) |
| Aura3D background black, `output.toneMapping: "none"` | 2.91 | 2.88 (+1.0%) |

Causes: (1) `scene()` clears to `#070b12` (luma 10.7) where the three bench clears to black. Over the 96% of the frame the cube does not cover, that is 10.2 of the 12.75. (2) The three bench source leaves tone mapping at its default (none); Aura3D's default is ACES (r185 operator, `ProgramGenerator.OUTPUT_SRGB_CHUNK_GLSL`). On the face pixel ACES reads (132, 47, 20) against three's unmapped (128, 60, 31), 0.87x in luma. Decision: both are intentional defaults; the bench baseline should set the same background and operator in both sources. Not an engine bug.

Unrelated observation, not investigated: with `output.toneMapping: "none"` and the default `#070b12` background the frame reads luma 29.3 (background pixels (21, 28, 38) against the authored (7, 11, 18)).

### PBR viewer: HDRI + sun 2.5 (91.1 vs 55.0)

Three separate causes, in order of size.

1. **The bench Aura source never loads its HDRI.** It passes a bare `{ type, format, url }` object cast with `as never`. The engine reads only an `aura-asset-ref` (`defineAuraAssets`); without one `explicitEnvironmentResolution` returns `undefined`, the node falls through to the neutral room, and `hdriStatus` is `"none"`, `iblPixelBacked` false. The room binds at intensity 1 whatever the authored intensity is: environment 0.7 and 1 give identical frames (73.29 and 73.29 with the sun off). This is the intentional neutral room probe, reached by accident. It stays out of every claim; the only trace is a runtime warning in diagnostics, not the console. With a real asset ref the same scene reads 68.90 (`hdriStatus: ready`).
2. **The nominal lights differ.** The Aura source authors sun 2.5 and environment 1, the three source sun 1.1 and `environmentIntensity` 0.7. The model predicts 1.73x on the ground (diffuse only); the ground strip measures 57.1 vs 36.4 (1.57x). With identical nominal lights (sun 1.1, environment 0.7, asset ref) the frame reads 51.22 against 55.03 (-6.9%) and the ground strip 34.4 against 36.4 (-5.5%).
3. **Background and bloom.** The three bench draws through `EffectComposer` + `OutputPass`, which tone maps the `#1a1d24` background down to luma 11; Aura3D shows the authored colour (luma 29). Without bloom the frame is +17.6% for Aura3D, and the top strip (29 vs 11) accounts for it. Bloom then adds 12.0 luma in three (43.1 to 55.0) and 0.6 in Aura3D (50.7 to 51.2) at the authored `threshold` (1.0 in three, 0.85 here), `strength` / `intensity` 0.35 and `radius` 0.6. The bloom pass belongs to WP-1; no change here.

Terms with the HDRI loaded (ground strip / centre, no bloom):

| Term | Aura3D | three.js |
| --- | --- | --- |
| sun only (environment 0, sun 1.1) | 9.3 / 55.6 | 9.3 / 55.2 |
| environment only (sun 0, 0.7) | 22.6 / 115.7 | 20.3 / 112.8 |
| uniform environment (radiance 0.5, sun 0, 0.7) | 20.3 / 88.6 | 20.3 / 88.3 |
| environment only, ground roughness 1 | 22.3 / 115.5 | 22.0 / 113.4 |
| environment only, ground roughness 0.5 | 36.2 / 121.5 | 32.8 / 119.2 |

The sun and shadow term, the environment unit and the SH9 irradiance (within 2.5% of a brute-force cosine integral of the same HDR, unit test) agree. The ground is up to 11% brighter in Aura3D under the HDRI at roughness 0.5 to 0.9; that is inside the tolerance and has no single cause here (specular lobe filtering is the candidate).

### Forest: hemisphere 1.1 + sun 2.4 (119.6 vs 148.2)

The lights are identical in both sources. The gap is the canopy and rock colours. The Aura source writes CSS `hsl(97..126 45% 20..32%)`, read as sRGB. The three source calls `tint.setHSL(h, s, l)` with no colour space, which reads the same numbers in three's linear working space, an albedo 3x or more brighter (unit test: luma ratio above 3 for the canopy, above 2.5 for the rocks). The 4.3.7 implicit fill had hidden this; removing it exposed it.

| Colour reading | Aura3D | three.js |
| --- | --- | --- |
| as written (sRGB in Aura3D, linear in three) | 119.60 | 148.11 (-19.2%) |
| linear in both | 159.97 | 148.11 (+8.0%) |
| sRGB in both | 119.60 | 110.33 (+8.4%) |
| linear, shadows off | 160.75 | 150.61 (+6.7%) |
| linear, fog off | 153.86 | 143.32 (+7.4%) |

Shadows and fog move both libraries by similar amounts (fog -6.1 / -4.8, shadows +0.8 / +2.5), so they are not the +8% residual, and it is not attributed. The hemisphere fold would push the other way: Aura3D lights a hemisphere light as the uniform mean of sky and ground, which is exact for horizontal normals and gives an up-facing normal 0.55x of three's ambient and a down-facing one 3.9x (pinned in the unit test). Real fix would be binding the `u_hemiSky` / `u_hemiGround` uniforms the IBL chunk already has; that needs `ForwardPass.ts` and `renderer/Background.ts`, both owned by other lanes, so it is recorded and not made.

### Decisions and what stays out of claims

- No change to `forward/Lighting.ts`, `app/colorManagement.ts` or `compiler/environment.ts`.
- Bench-source follow-ups for the bench lane (not edited here, they change the published comparison): set the same background and operator in the baseline; give the PBR viewer's Aura source a real `defineAuraAssets` texture ref and the three source's nominal lights (or the reverse); read the forest colours the same way in both.
- Claim boundary: the Q1 statement stays limited to the skinned character. The bench figures for the cube, PBR viewer and forest "as written" are not exposure claims, and neither is the neutral room probe. Matched-input figures are within 10%:

| Scene | Matched input | Aura3D | three.js | Delta |
| --- | --- | --- | --- | --- |
| cube | black background, operator none | 2.91 | 2.88 | +1.0% |
| PBR viewer | asset ref, sun 1.1, environment 0.7, bloom as authored | 51.22 | 55.03 | -6.9% |
| forest | linear colour reading in both | 159.97 | 148.11 | +8.0% |

Regression check on the unchanged engine (run `wp6-q1-1`, `exposure-calibration.spec.ts` and `exposure-skinned.spec.ts`, both passed): skinned character 136.2 against 144.0 (0.946, Q1 holds), console empty.
