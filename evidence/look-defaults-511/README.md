# 5.1 look defaults (lane 511), revision 3

All frames are real GPU: headless Chrome on Apple Metal (ANGLE), loopback CDP, a virtual clock (`tools/shim.js`: rAF, `performance.now`, `Date.now` driven by the capture script), `tools/cap.mjs` to capture, `tools/diff.mjs` for mean absolute RGB difference (0-255). Revision 3 note: revision 2 claimed every frame had been viewed and was a game or scene frame. That was false: `games2/showcase-heatsink-base2.png` was an Aura Slam loading screen, and its 53.5 "noise" number was an artifact of comparing two different games. Cause: the old `cap.mjs` picked a random DevTools port from 9700-9949, a range other capture lanes running at the same time also used. A run could attach to another lane's Chrome and screenshot that lane's page. A later attempt in this pass hit the same problem: it attached to a Chrome showing another lane's `/apps/showcase-slingshot-siege/` page. `cap.mjs` now lets Chrome choose a free port (`--remote-debugging-port=0`, read from `DevToolsActivePort` in a fresh profile). It also refuses to write a frame unless `location.pathname` is the requested route. That check caught a dead static server (`chrome-error://`) during this pass, and nothing was written for that run. In revision 3, every frame in `games2/`, `trial/frames/`, `judge-after-default/` and `judge-rerun-516/` was opened and checked by eye. Each one shows the intended game or scene.

## What changed

`withColdStartLook` (`packages/engine/src/agent-api/looks/coldStartLook.ts`, called from `createAuraAppCore` at mount and `setScene`): a scene that authors NO light, environment, effect (fog, bloom, ...), look preset, sky/background image or scene kit gets the hero stage appended: studio IBL, warm key / cool fill / rim sized to the scene's bounding sphere, and a floor at the lowest geometry that fades into the scene background through extent-sized fog. A scene that already brings a flat ground gets the IBL and lights only (no second floor). Any other scene (any authored light/environment/effect/look, any node kind the module does not know) gets the very same snapshot object back, tested in `tests/unit/looks/cold-start-look-511.test.ts` (6 authored variants, nested light, empty scene). Off switch: `?a3d-cold-start-look=0` or `A3D_COLD_START_LOOK=0`. Exposure and tone mapping defaults were NOT changed (setting `output` forces the HDR render path for every scene; the hero lights were sized for the existing exposure instead).

Cost to know about: the default pulls `/aura-environments/studio.*` like `environments.studio()` does; where those files are not served the engine falls back to the neutral room with its existing "environment probe not ready" warning. Where the default applies (revision 3): only plain WebGL2 forward apps in a real browser (`coldStartLookApplies`). It is skipped entirely, and the snapshot is returned unchanged, in these cases:
- no `WebGL2RenderingContext` class exists (node unit tests, benchmark harnesses with an injected renderer);
- `renderer.backend` is anything other than `webgl2` (`webgpu`, `auto`);
- `renderer.qualityProfile: "experimental-webgpu"`;
- any `renderer.drawingPath` (deferred, meshlet, visibility, or forward) or `renderer.textureResidency` is set;
- `renderer.mode: "safe-basic"`, `renderer.fallback` or `requiredFeatures` is set;
- `worker` or `frameMode: "async"` is set.

Revision 2 applied the default everywhere, which broke bare-scene mounts on the native WebGPU and deferred paths (`native-drawing-root-selection`, `native-compute-interop`, `native-benchmark-frame` and `native-specialized-objects-webgpu` failed). With the gate they pass. The five texture-lifecycle tests are back to their origin/main versions, without the `A3D_COLD_START_LOOK=0` lines. Test run on this revision, one file set at a time with `--maxWorkers=1`:
- all 109 vitest files under tests/unit, tests/integration, tests/game-runtime and tests/qr that call `createAuraApp(` pass (the other 51 matches are harness, fixture or corpus files, not tests);
- 13 more test files that mount through those harnesses or failed in an earlier sweep also pass;
- `tsc -p tsconfig.check.json` is clean.

## Six-game identity proof (replaces the invalid first proof): `games2/`, `games2/results.json`

Each route was built twice with `AURA3D_ONLY_ROUTE=<route> node marketing/scripts/build-showcase-routes.mjs`: from origin/main (`base`) and from this branch (`branch`), each served from its own dist root on 127.0.0.1 and opened at `/apps/<route>/?start=1`. `base2` is a second capture of the base build (noise floor). 1280x720, 500 paced + 60 virtual frames.

| game | route | base vs base2 (noise) | base vs branch | mean luminance base / branch |
|---|---|---|---|---|
| Aura Slam tennis | showcase-top-tennis | 0.37 | 0.38 | 84.42 / 84.41 |
| Apex Overdrive | showcase-roadster-rush | 0.20 | 0.20 | 42.96 / 42.95 |
| Thermal Drift | showcase-heatsink | 0.00 | 0.69 | 23.41 / 23.41 |
| St Auroras Links | showcase-aura-links-3d | 0.38 | 0.38 | 85.18 / 85.18 |
| Bellkeeper's Walk | showcase-where-the-wind-wanders-port | 0.00 | 3.76 | 127.65 / 127.61 |
| Duneglide | showcase-silt-and-signal-port | 2.77 | 2.21 | 114.76 / 115.38 |

Thermal Drift `base`, `base2` and `branch` were recaptured in revision 3 from fresh origin/main and branch builds, using the fixed `cap.mjs`. All three show the Thermal Drift start card over the Megacity track. The other five games' frames were captured earlier in this pass and checked again by eye; the numbers above were recomputed from them.

What the numbers show:
- Tennis, Apex Overdrive, Links and Duneglide: base vs branch is at the base-vs-base noise level.
- Thermal Drift and Bellkeeper's Walk: the two base captures are pixel-identical (0.00), so these two have no measured noise floor. Branch differs from base by 0.69 and 3.76. In both pairs the frames look the same by eye. Bellkeeper's Walk has wind-driven grass and water. This is a small difference, not an identity.
- None of the six games is a cold-start scene, so the default is not applied to them.
- This is one frame per game per build, not a motion proof.

## Trial scenes without helpers: `trial/`

`trial/app/t{1,2,9}-authored` are the original docs503 r1 scenes (they author lights and an environment). `trial/app/t{1,2,9}-bare` are the same scenes with every `environments.*`, `lights.*`, `effects.fog`, `effects.bloom` line removed: the geometry-only first draft. No `looks.*` helper is called anywhere. `trial/frames/<scene>-<variant>-{off,default}.png`: `off` is `?a3d-cold-start-look=0`, `default` is the new behaviour, same build, 960x540, Vite dev server on this branch.

| scene | bare off vs default | authored off vs default | authored off vs off2 (noise, off2 is the revision 2 capture) |
|---|---|---|---|
| t1 cube | 59.8 (lum 50.2 -> 104.4) | 2.85 | 4.20 |
| t2 forest | 22.3 (lum 158.6 -> 150.5) | 1.32 | 4.58 |
| t9 robot | 17.6 (lum 73.9 -> 60.1) | 0.60 | 2.14 |

The t1 cube rotates, and the captures do not land on the same rotation, so the t1 numbers include some cube motion.

Authored scenes: the default changes nothing beyond capture noise. Bare scenes, honestly: the robot gains form shading, a contact shadow and a lit torso (clear improvement). The forest keeps its own ground plane, so it only gets IBL and lights and stays a modest, slightly warmer/less blown out change; its ground edge still shows. The cube becomes lighter and gets a floor, but it is a pale grey cube on a mid-grey floor that fills the frame, with a weak contact shadow: brighter, not a hero shot. The original cube trial result (explicit lights) is unchanged by this lane.

## Blind judge after the default (`judge-after-default/`)

`tools/agent-eval/judge-visual.mjs` from origin/exp/turn-gap-504, one call per task (1, 2, 9), claude-sonnet-5.5 via Prism, same seed, Aura3D frame = the bare scene (no helpers) resized to 640x360, against the original three.js r1 frame from lane/503-trial. Same three calls with the default off (`bare-off-*`):

| task | default off (aura / three) | default on (aura / three) |
|---|---|---|
| 1 cube | 13 / 18, three | 14 / 19, three |
| 2 forest | 14 / 16, three (one call failed to parse and was repeated once) | 16 / 16, tie |
| 9 robot | 13 / 21, three | 14 / 21, three |

Aura3D scores +1, +2, +1 with the default on; three.js still wins or ties all three. n=1 per task: direction only, within judge noise. This does not close the gap to three.js.

The table above is the revision 2 run (n=1 per task), kept for history.

## Blind judge rerun, 3 calls per pair (`judge-rerun-516/`)

Setup:
- Judge: the same `judge-visual.mjs` from origin/exp/turn-gap-504, claude-sonnet-5.5 via Prism, seed 20261106.
- Calls: 3 per pair, with the A/B order randomised by the judge.
- Aura3D frames: the revision 3 bare-scene frames resized to 640x360. `off-*` is the default off and `on-*` is the default on. Each was checked to be a resize of the matching `trial/frames/*-bare-{off,default}.png` (mean diff under 0.6, against 17-60 for the other variant).
- three.js frames: the original r1 frames (`three-*.png`).
- Raw output: `default-off.json` and `default-on.json`.

| task | default off: aura / three (mean of 3) | default on: aura / three (mean of 3) | wins with default on |
|---|---|---|---|
| 1 cube | 12.0 / 20.0 | 13.7 / 19.0 | three 3/3 |
| 2 forest | 15.0 / 16.7 | 14.3 / 16.3 | three 2/3, aura 1/3 (a 16/16 tie the judge gave to Aura3D) |
| 9 robot | 12.0 / 19.0 | 13.3 / 21.3 | three 3/3 |

Result:
- With the default on, Aura3D's mean score goes up on the cube (+1.7) and the robot (+1.3) and goes down slightly on the forest (-0.7, within the spread of 12-16 across its three calls).
- three.js wins 9 of 9 calls with the default off and 8 of 9 with it on.
- The default improves the bare cube and robot a little. It does not close the gap to three.js on any task.
