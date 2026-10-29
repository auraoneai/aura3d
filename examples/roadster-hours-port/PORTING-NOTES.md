# Roadster Hours on Aura3D: porting notes

Port of the Crayon game *Roadster Hours* (release `20261021-halo-lighting-v11`, game 2.3.1) for the Phase B exit in
`docs/workflows/threejs-parity-gaps.md` (R-20). Source provenance and hashes:
`tests/fixtures/crayon/roadster-hours/PROVENANCE.md`.

## What the original is

A three.js r184 WebGL2 game bundled as four Vite modules: `sim` (16 KB, the driving and flight simulation), `game`
(UI, career, loop), `fx` (effects) and `world` (three.js plus the route builder). The simulation is a **pure function**
`R(state, input, 1/120)` of its input: no clock, no randomness, no GL. The game steps it at a fixed 1/120 s and exposes a
per-step input hook, `window.skybreakDemo.input(state)`, which is what makes a deterministic reference possible.

## What is ported

| Original | Port | Status |
| --- | --- | --- |
| `sim` (`C`, `R`, `D`, `k`, `A`, `j`, `N`, `L`, ...) | `sim.ts`, statement-for-statement, same evaluation order | exact: the recorded original run replays on the same steps |
| `world` route data (`Xu`, `Zu`, `ed`, `td`) | `data.ts`, extracted mechanically from the bundle | exact numbers |
| `world` course functions (`Qu`, `$u`, `od`, `sd`, `cd`, `fd`, `pd`) | `course.ts` | exact |
| road, kickers, shortcut decks, gates, cells, hazards, water, sky | `world.ts` with `geometry.dynamic` + `material.custom`: lit asphalt with filtered markings and cyan edge neon, footprint-filtered ocean, procedural sky dome (clouds, sun, ridge), terrain, guardrails, street lamps, cliff-top town, lighthouse, night skyline, hazard-chevron ramps, GPU point-sprite dust and spark plumes, additive headlight cones (`shaders.ts`, `look.ts`) | procedural look, not pixel parity |
| 68 `BatchedMesh` + 121 `InstancedMesh` for traffic, lineups and scenery | seven `batched.mesh`es: baked CC0 cars (Quaternius sports car, car, taxi; Kenney race car; `tools/bake-cars.mjs`) in one mesh per material group (paint with per-instance colour, trim, glass, head, tail), box rigs detailed with windows, wheels and lamps; 451 instances | functional; scenery instancing is not ported |
| 29 `ShaderMaterial`s | four `material.custom` programs | simplified look |
| `roadster-rocket.glb`, `world-kit.glb`, HDR sky, post, audio, UI | engine bloom, colour grade, vignette, FXAA, IBL preset and fog; synthesised audio (`audio.ts`, engine, wind, music, event cues); title with route picker, HUD, pause and results (DIN Pro from the licensed font gallery); the Roadster is a baked graphite sports car | partial |
| touch controls, camera shake and FOV kicks, coach line, best times | touch buttons (`input.ts`, synthetic `touch:<action>` key codes through `bindGameTouchControls`), event trauma and FOV kicks (`camera.ts`, off under reduced motion), the original's priority coach line (`hud.ts`), best times in `localStorage` | ported (2026-10-29 audit fix) |
| career UI (upgrades, credits), slow motion | not ported | gaps |

## Determinism and the reference

`tools/crayon-capture/roadster-hours.ts` (remote only) clicks the real "Drive" control in the original, then drives it with
the closed-loop `autopilot.ts` through `skybreakDemo.input`, with switchable virtual time so each frame covers a known
amount of game time, and records every step's input (run-length encoded), counter transitions and a 0.5 s state trace.
Two independent sessions must agree. `tests/unit/roadster-hours-port/reference-replay.test.ts` replays that script through
`sim.ts` and requires the same finish step, the same final state, the same transition steps and a trace within the
capture's own measured tolerance.

## Engine surface used

`material.custom` (GLSL 300 es, uniforms, no `time`/`pulse` names), `geometry.dynamic`, `geometry.custom`, `batched.mesh`
(`addGeometry`, `addInstance`, `setMatrixAt`, `setColorAt`), `primitives.*`, `lights.studio`, runtime node handles
(`setPosition`, `setRotation`, `setVisible`), the camera controller (`setPose`), `createAuraRouteHealthSnapshot`.
No `@aura3d/rendering` internals, no `TODO(a3d-migrate)`.

## Gaps and divergences

- Look: the blind judge still tells the port from the original 81% of the time (was 100%): the original's cars are heavier, its scenery denser (trees, buildings, bridge), it has shadows and motion blur; rigs are still boxes with detail parts. Debug switches: `?post=0`, `?env=0`, `?fog=0`.
- `effects.particles` `attachTo` is typed but not implemented in the engine; the plumes are shader-driven point sprites instead.
- The original replaces its built-in vehicle collision table with metadata from `world-kit.glb` at runtime; the port uses
  the built-in table (`ed`). The capture records the original's traffic dimensions and a test compares them.
- Slow motion and the career UI are not ported. Touch controls, camera shake and the coach line were added by the 2026-10-29 audit fix; sun shadows are on (one cascade).
- Verification of rendering is on a software WebGL2 runner (SwiftShader), not a hardware GPU.

## Engine fixes found while verifying the batched path

Running the port on a real WebGL2 context exposed four defects in the multi-draw route; all are fixed and covered by the remote spec:

1. `u_a3dDrawData` was bound as a raw `Texture`, which the uniform binder rejects (`Unsupported uniform value`); it is now one shared `TextureBinding` per draw-data texture (`drawDataBindingFor`).
2. Integer scalar uniforms (`u_drawId`) were uploaded with `uniform1f` (GL_INVALID_OPERATION); the binder now uses `uniform1i`/`uniform1ui` by reflected type.
3. The shader extension was spelled `WEBGL_multi_draw` (unknown to GLSL); it is `GL_ANGLE_multi_draw`, and `WEBGL_multi_draw` is now requested at device creation so it is enabled before programs link.
4. `canMultiDraw` compared per-item `TextureBinding`s by identity, so no real scene ever merged; equal bindings (same texture and sampler state) now compare equal.

## Verification record

- Reference: two independent in-browser sessions of the original's simulation under the same closed-loop policy, 6124 steps, bit-identical (tolerance 0). The unit replay matches the trace to 2e-14.
- Remote browser spec: passes (`evidence/roadster-hours-port/`). One frame's batched vehicles go out as 3 multi-draw calls (several passes) instead of 92 draws.
- Not done: the original's own rendering loop could not be driven to completion under software GL (2.5 to 5 s per frame), so the reference comes from the original's `sim` module driven directly, plus an in-game cross-check (run `cc1f3`: the real Drive button, the game's own loop under virtual time, 1550 steps) that matches the reference prefix exactly and is recorded as `ingameCrossCheck` in the report.

## Generated models (Meshy art pass, 2026-10-23)

The baked CC0 cars and box rigs were replaced by models generated through Meshy (via Kiro Prism, text prompts only: nothing was derived from the original game's art; prompts and task ids are in `assets/ATTRIBUTION.md`). 15 models, 445 credits (program ledger tag `roadster`, cap 800): each is `text-to-3d` preview + PBR refine (30), then a Meshy `remesh` (5) to a game triangle budget; the hero roadster keeps its full refine (about 37k triangles).

| model | kind | triangles | vertices |
| --- | --- | --- | --- |
| roadster | vehicle | 37236 | 33346 |
| sedan | vehicle | 3554 | 6633 |
| hatch | vehicle | 3012 | 6517 |
| suv | vehicle | 3280 | 6796 |
| pickup | vehicle | 3423 | 7084 |
| bus | vehicle | 4287 | 8567 |
| boxtruck | vehicle | 3526 | 8031 |
| lighthouse | prop | 5956 | 10990 |
| townhouse | prop | 2610 | 5913 |
| pine | prop | 3808 | 8672 |
| villa | prop | 3086 | 6371 |
| palm | prop | 4083 | 8239 |
| boulders | prop | 2573 | 5088 |
| semi | vehicle | 5982 | 12873 |
| tanker | vehicle | 5735 | 12517 |

Replaced: the player roadster (a teal open-top two-seater, own design), the passenger cars (sedan, hatchback, SUV, pickup), the bus, the box truck, the articulated semi and the tanker (the tractor-only and car-carrier rigs stay boxes), the lighthouse (instead of stacked cylinders), the cliff-top town (villa and townhouse models instead of plaster cubes) and, new, pines, palms and boulders along the road. If a model fails to load (or with `?meshy=0`) the port falls back to the baked CC0 cars and the procedural scenery.

Pipeline (all under `tools/`): `tools/bake-meshy.mjs` reads the prepared GLBs (`artifacts/meshy/rr-<key>*/model.glb`, local only) listed in `tools/meshy-models.json` and writes a binary geometry file and a 1024 px base-colour JPEG per model into `assets/meshy/` plus the generated `meshy.baked.ts` (metadata, texture asset refs with sha256, bin URLs); `meshy.ts` fetches and decodes the bins at boot (`loadMeshy`). Vehicles are stretched into the unit box with the front at -Z (all generated vehicles needed `flip`), props are scaled to height 1 on y = 0. New assets: 3.0 MB geometry + 3.8 MB textures = 6.9 MB.

**Engine finding (fixed in 4.1.0, `2302b45c6`; the vehicles are back on `batched.mesh` in 4.3.0, see below):** `batched.mesh` and `instances.mesh` could not bind a textured material: the batched/instanced-mesh render path builds its material with `createProductionPrimitiveMaterial` and never runs the post-mount texture upgrade that `geometry.custom` / `instances.custom` nodes get, so the models render white (a probe, `meshy-probe.html` + `tests/browser/roadster-hours-meshy-probe.spec.ts`, rendered one sedan five ways on the remote runner: `geometry.custom` and `instances.custom` textured, `instances.mesh`, batched with a texture and batched with vertex colours white). Textured vehicles therefore are `instances.custom` nodes (one per model, per-frame `setInstances`), and the scenery is static `instances.custom`. Consequence: this port no longer exercises `batched.mesh` multi-draw (only the remaining box rigs stay batched, drawn as one instanced call each), so the browser spec applies its multi-draw bounds only when several batched geometries remain; multi-draw is covered by `tests/unit/rendering/batch-multidraw.test.ts` and the parity instancing tests. The engine also uploads these textures one at a time after mount (no completion signal in the diagnostics), so the page holds its loading screen for a short settle (1.5 s) to avoid an untextured flash.

Measured (software WebGL2, remote): the port spec passes (run `roadster-meshy-8`, replay still exact: 48.325 s, score 26,949), 71 draw calls on route 0 at 640x360 (was 42 with the baked cars; the textured vehicle and scenery nodes add about 29), 0 console errors, `batched` vehicle probe: 68 vehicles, 33 generated instances plus 35 box-rig parts. Frames: `evidence/roadster-hours-port/meshy-before/` (the previous art pass), `meshy-after/`, `meshy-compare/`.

Admission: the optimised GLBs validate (`assets validate` reports no failures for the roadster, a sedan, the bus, the lighthouse, a townhouse and a palm, admitted in an isolated project), but `assets import-meshy --profile vehicle` reports `vehicle-parts: fail` for the vehicles (Meshy bakes the wheels into the body, so there are no separate wheel meshes; nothing here spins wheels) and `vehicle-orientation: unproven`. Provenance JSON for these is under `assets/provenance/`.

Remaining visible differences: cars have no separate wheels or lights (painted into the texture), the generated textures are 1024 px (blurry on the hero car in close-ups), no shadows or motion blur, the tractor-only and car-carrier rigs are still boxes, and the models are a different design from the original's.

## Vehicles back on `batched.mesh` (4.3.0 parity closeout)

Every traffic and lineup vehicle is a `batched.mesh` instance again: one textured batched mesh per generated model (each model has its own texture and a batched mesh has one material), the baked cars per material group, the box rigs in their own meshes. The per-model `instances.custom` nodes, the `InstancePool` class and the per-frame `setInstances` flush are gone. Measured (software WebGL2, remote, `tests/browser/roadster-hours-port.spec.ts`, runs `pcrender-rh-*`): 68 of 68 vehicle slots are batched instances (33 textured); draw calls with every vehicle shown are 65 before and after (the vehicle share is 11 draws, one per pooled geometry, against 3 batched plus 8 instanced nodes before; hidden-vehicle baseline 54 against 62 because the old pools kept drawing zero-scale instances); the GL frame is identical (`de` 147, `dei` 48, `md` 0). Multi-draw does not engage in either build: it needs the engine's batching tier (`A3D_QR_TIERS_BATCHING`), which is off by default, so multi-geometry batched meshes fall back to one instanced draw per geometry. The spec now asserts the multi-draw bounds only when that tier is on, and otherwise bounds the vehicles at one draw per pooled geometry per pass. Replay, colliders and QA hooks are untouched (the sim never reads the vehicle meshes).
