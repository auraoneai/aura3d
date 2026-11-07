# 5.1 look defaults (lane 511), revision 2

All frames are real GPU: headless Chrome on Apple Metal (ANGLE), loopback CDP, a virtual clock (`tools/shim.js`: rAF, `performance.now`, `Date.now` driven by the capture script), `tools/cap.mjs` to capture, `tools/diff.mjs` for mean absolute RGB difference (0-255). Every frame listed below was viewed and is a game or scene frame (not the marketing page, not black).

## What changed

`withColdStartLook` (`packages/engine/src/agent-api/looks/coldStartLook.ts`, called from `createAuraAppCore` at mount and `setScene`): a scene that authors NO light, environment, effect (fog, bloom, ...), look preset, sky/background image or scene kit gets the hero stage appended: studio IBL, warm key / cool fill / rim sized to the scene's bounding sphere, and a floor at the lowest geometry that fades into the scene background through extent-sized fog. A scene that already brings a flat ground gets the IBL and lights only (no second floor). Any other scene (any authored light/environment/effect/look, any node kind the module does not know) gets the very same snapshot object back, tested in `tests/unit/looks/cold-start-look-511.test.ts` (6 authored variants, nested light, empty scene). Off switch: `?a3d-cold-start-look=0` or `A3D_COLD_START_LOOK=0`. Exposure and tone mapping defaults were NOT changed (setting `output` forces the HDR render path for every scene; the hero lights were sized for the existing exposure instead).

Cost to know about: the default pulls `/aura-environments/studio.*` like `environments.studio()` does; where those files are not served the engine falls back to the neutral room with its existing "environment probe not ready" warning. Five existing tests that count texture/fetch calls on bare scenes now set `A3D_COLD_START_LOOK=0`.

## Six-game identity proof (replaces the invalid first proof): `games2/`, `games2/results.json`

Each route was built twice with `AURA3D_ONLY_ROUTE=<route> node marketing/scripts/build-showcase-routes.mjs`: from origin/main (`base`) and from this branch (`branch`), each served from its own dist root on 127.0.0.1 and opened at `/apps/<route>/?start=1`. `base2` is a second capture of the base build (noise floor). 1280x720, 500 paced + 60 virtual frames.

| game | route | base vs base2 (noise) | base vs branch | mean luminance base / branch |
|---|---|---|---|---|
| Aura Slam tennis | showcase-top-tennis | 0.37 | 0.0001 | 84.42 / 84.42 |
| Apex Overdrive | showcase-roadster-rush | 0.20 | 0.20 | 42.95 / 42.95 |
| Thermal Drift | showcase-heatsink | 53.55 (base2 luminance 66.8 vs 23.4: a different state, not inspected) | 0.70 | 23.40 / 23.41 |
| St Auroras Links | showcase-aura-links-3d | 0.38 | 0.38 | 85.18 / 85.18 |
| Bellkeeper's Walk | showcase-where-the-wind-wanders-port | 8.99 | 6.84 | 127.83 / 127.67 |
| Duneglide | showcase-silt-and-signal-port | 1.79 | 1.79 | 114.76 / 114.77 |

Reading: branch differences are at or below base-vs-base noise for every game (heatsink: branch matches the first base frame to 0.70 while the second base frame is itself in a different state; Bellkeeper's Walk animates grass and water, so its noise is 9). None of the six games is a cold-start scene, so none changes, as designed. This is one frame per game per build, not a motion proof.

## Trial scenes without helpers: `trial/`

`trial/app/t{1,2,9}-authored` are the original docs503 r1 scenes (they author lights and an environment). `trial/app/t{1,2,9}-bare` are the same scenes with every `environments.*`, `lights.*`, `effects.fog`, `effects.bloom` line removed: the geometry-only first draft. No `looks.*` helper is called anywhere. `trial/frames/<scene>-<variant>-{off,default}.png`: `off` is `?a3d-cold-start-look=0`, `default` is the new behaviour, same build, 960x540, Vite dev server on this branch.

| scene | bare off vs default | authored off vs default | authored off vs off (noise) |
|---|---|---|---|
| t1 cube | 58.3 (lum 48.7 -> 105.6) | 1.26 | 2.99 |
| t2 forest | 28.8 (lum 158.6 -> 149.9) | 4.70 | 3.89 |
| t9 robot | 17.7 (lum 73.5 -> 60.0) | 0.00 | 0.00 |

Authored scenes: the default changes nothing beyond capture noise. Bare scenes, honestly: the robot gains form shading, a contact shadow and a lit torso (clear improvement). The forest keeps its own ground plane, so it only gets IBL and lights and stays a modest, slightly warmer/less blown out change; its ground edge still shows. The cube becomes lighter and gets a floor, but it is a pale grey cube on a mid-grey floor that fills the frame, with a weak contact shadow: brighter, not a hero shot. The original cube trial result (explicit lights) is unchanged by this lane.

## Blind judge after the default (`judge-after-default/`)

`tools/agent-eval/judge-visual.mjs` from origin/exp/turn-gap-504, one call per task (1, 2, 9), claude-sonnet-5.5 via Prism, same seed, Aura3D frame = the bare scene (no helpers) resized to 640x360, against the original three.js r1 frame from lane/503-trial. Same three calls with the default off (`bare-off-*`):

| task | default off (aura / three) | default on (aura / three) |
|---|---|---|
| 1 cube | 13 / 18, three | 14 / 19, three |
| 2 forest | 14 / 16, three (one call failed to parse and was repeated once) | 16 / 16, tie |
| 9 robot | 13 / 21, three | 14 / 21, three |

Aura3D scores +1, +2, +1 with the default on; three.js still wins or ties all three. n=1 per task: direction only, within judge noise. This does not close the gap to three.js.
