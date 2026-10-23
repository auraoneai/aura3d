# Last Train to the Sea on Aura3D: porting notes

Aura3D port of the Crayon game "Last Train to the Sea" (PRD §7.2 Phase D, task R-20).
Source: the captured game module (`tests/fixtures/crayon/last-train/PROVENANCE.md`; untrusted data, read as text only,
never executed outside the capture browser). Only the simulation-core regions the port was written from are stored
(`game-sim.extract.js`); the full 1.39 MB bundle is not.

## Layout

| File | Role |
| --- | --- |
| `sim.ts` | The simulation. Pure and deterministic, no engine imports: `GM` door/depart actions, the `WM` fixed-step update (speed, balance/roll, comfort, tips, driving gates, catches), the dock phase machine, arrival, new service. |
| `replay.ts` | Replays the original's reference through `sim.ts` (closed-loop controller or recorded script). |
| `data/route.json`, `data/tables.json` | Measurements taken from the original's own functions: the six legs sampled every 2 m (position, curvature, grade, vertical curvature, bank), constants, difficulty table, towns and sky palettes, station passenger tables, driving gates. |
| `world.ts`, `townkit.ts`, `shaders.ts`, `materials.ts`, `orient.ts` | Rendering on the public `@aura3d/engine` surface only. `townkit.ts` builds the merged town meshes (metric-UV facades, gable and pyramid roofs, clock tower, stone arch, cobbled plaza) and paints their canvas textures. |
| `audio.ts` | Synthesised sound on the shared `AudioContextManager`: wind and rail rumble that follow speed, wheel clacks at the joint spacing, flange squeal, rain hiss, a slow pad, one cue per event (`diffCues` is pure and unit tested). |
| `assets/` | Two licensed catalog GLBs (windmill, watchtower) and a CC0 sky HDRI, 3.5 MB total, with `ATTRIBUTION.md`. |
| `main.ts`, `index.html` | Boot, fixed-step loop, input, HUD, capture hooks. |

Run it: open `/examples/last-train-port/` on the example dev server. Query parameters are listed at the top of `main.ts`.

## How the reference was made

The game has no QA hooks. `tools/crayon-capture/last-train.ts` runs on a serverless ACR Task and patches the game's module text as
it becomes a `Blob` (`last-train-lib.ts`, `blobPatchSource`) so the module's pure functions become reachable, then steps the original's
own `WM(state, 1/60, input)` / `GM(state, action)` headlessly from a closed-loop controller (PD balance on roll, cruise at the
"brisk" pace, brake on remaining distance) over three full circuits: day, night, day. Two fresh browser sessions were bit-identical
(inputs, events, trace). The result is `evidence/crayon-capture/last-train-reference.json`.

## Simulation parity

The same controller drives the original and the port; the port decides its own dock timings. Measured over 18 legs
(`tests/unit/last-train-port/reference-replay.test.ts`):

| Quantity | Original vs port |
| --- | --- |
| Enroute time per leg (about 5,700 steps) | within 1 step in loop 1, within 5 steps by loop 3 |
| Fares, passengers aboard, lost tips, catches | identical on every leg |
| Tips per station | identical except loop 3, where four stations differ by 1 to 2 |
| Loop 1 score | 4,039, identical |
| Loop 2 / 3 score | 8,078 vs 8,075 and 12,117 vs 12,107 (+0.04%, +0.08%) |
| Grade after a service | Silver, identical |

The slow drift in loops 2 and 3 is the original's garage wear (finish, traction, stabilizer, brakes lose condition per metre and
change the motor, brake and sway multipliers), which the port does not model.

Ported from the original, formula for formula: acceleration with the cruise-pace table and load, brake, approach limit
`sqrt(3.6 * remaining)`, gust and curvature forcing, the roll model (difficulty "low"), critical roll and catches (speed x0.55,
lanterns, tips lost), comfort and harsh braking, the economy (100 per passenger, tip = round(50 x clamp(weight / fare distance, 0, 2.7)),
streak multiplier up to x2, per-trip weights with the four temperaments), three driving gates per leg (25 each), the dock phase
machine (opening 1 s, deploying 1.2 s, alighting, boarding, retracting 1.3 s, closing 1 s), arrival and circuit counting, service
completion and grade, new service, and the day/night toggle.

## Documented divergences

| Area | Original | Port |
| --- | --- | --- |
| Alighting / boarding duration | Derived from walking paths to seats | Fitted to the reference: 7.65 s for one or two alighters, +1.2 s per extra; boarding 9.1 s for four (observed 8.6 to 9.4 s), 0.9 s less per missing boarder (extrapolated) |
| Route | Quintic Bezier legs, curvature from tangents | The original's own route as 2 m samples, linearly interpolated |
| Garage, upgrades, workshop, skins, wing boost, near-save and bold bonuses | Present | Not ported (default garage: motor, brake and sway 1.0, no rear car) |
| Orchard junction, requests (steady / connection / cargo), reaction messages, sleeper jolt rule | Present | Not ported; Gold needs three requests, so the port awards at most Silver |
| Models and textures | Remote GLB models, sprite-sheet crowds, impasto textures | Art pass: terraced townhouses with painted plaster facades (shuttered windows, arched doors, lit windows at night), roof tiles, cobbled plaza, clock tower, stone arch, planters, stalls, townsfolk, trestle viaduct with pylons, sleepers and masts, an open-sided tram with benches and seated passengers (capsule bodies, sphere heads, coloured by temperament). Two catalog landmarks (windmill, watchtower). Not the original's art: no rigged or animated characters |
| Shaders | Six `ShaderMaterial`s (live in the probe) | Three hand-ported: sky dome, cloud sea, weather points. The other three were not identified in the source and are not ported; lit surfaces use the engine's PBR material |
| Weather and sky | Per-town sky palettes, rain at Monsoon Exchange, snow at Drowned Observatory | Same towns and palettes (smoothstep 0.22 to 0.82 of each leg); particles around the camera |
| Day / night | A player toggle (`timeOfDay`) that changes lighting, not physics | Same: a toggle. The compiler ignores light-node visibility and `app.lighting.setEnvironmentIntensity` is a stored no-op, so the lighting rig cannot be re-aimed at runtime: the port builds two scenes with identical node ids (day: HDRI at 0.8, cascaded-shadow sun, haze; night: HDRI at 0.2, moon, dark fog, stronger bloom, lit windows and lamps) and swaps them with `app.setScene`. The sky and clouds blend through `nightMix` |
| Title, results, arrival toasts, audio | Present | Ported (title with controls and best score kept in localStorage, results card with grade and tallies, synthesised audio; `M` mutes). Station camera while docked, chase camera while running |
| Garage screen, level select, countdown, touch, Driver ID | Present | Not ported (the garage needs the wear and upgrade model the sim does not have) |

## Hooks (deterministic capture)

`window.__AURA_LAST_TRAIN__`: `state()`, `memory()` (approximateGpuMemoryBytes, textures, buffers, renderTargets, drawCalls, nodes),
`pixels()`, `frame(w, h, q)` (JPEG base64), `render()`, `doors()`, `depart()`, `setTimeOfDay()`, `newService()`, `stepFrames(n, input?)`,
`runLeg(renderEvery)`, `finishStop(renderEvery)`, `runCircuit(renderEvery)`, `routeHealth()`. With `?manual=1` the simulation advances
only through these hooks.

## Engine features exercised (route-health `parityIds`)

`SH-02` (`material.custom` for sky, clouds, snow points, rain streaks), `SG-05` and `R-23` (`geometry.dynamic` ribbons, points with custom attributes,
`updateAttribute` for weather), `SR-02`. The scene uses PBR materials with canvas textures, an HDRI environment, cascaded-shadow directional lights, fog, AO, bloom, colour grade and vignette (neutral tone mapping, exposure 1.5), instanced primitives, merged static meshes, two catalog models, and the node `runtime` handles to move the tram and passengers. Look-dev switches: `?fx=noao,nofog,nobloom,nograde,novignette,nohdri,skyflat`, `?tm=`, `?ev=`.

## Measured on the remote runner

Run `last-train-h-20261023T065059Z` (`evidence/last-train-port/`): three circuits (day, night, day) with real rendering, 42,343 / 42,332 / 42,332 steps against the reference's 42,302 / 42,310 / 42,321 (within 0.1%), loop score 4,039 on every loop, per-leg fares and passengers aboard identical to the reference, renderer gauges identical across loops (approximateGpuMemoryBytes 20,274,556; 4 textures; 51 buffers; 1 render target; 216 nodes), no console errors.

## Limits

- Simulation parity is exact for the economy and close for timing; it is not pixel parity. The visuals are a stylised rebuild.
- Renderer memory (geometries, textures, GPU bytes) is measured on the port. The original's reference measures JS heap and simulation
  state size only, because its headless stepping never renders; JS heap moves with garbage collection and is recorded, not asserted.
- The remote runner is software WebGL2 (SwiftShader), not a hardware GPU.
