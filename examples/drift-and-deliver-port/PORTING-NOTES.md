# Drift & Deliver port notes

Port of the Crayon game "Drift & Deliver" (three r184, WebGL2) to the public `@aura3d/engine` surface. Evidence and
method: `evidence/crayon-capture/drift-and-deliver.md`. Reference: `evidence/crayon-capture/drift-and-deliver-reference.json`.

## Parity, stated plainly

| area | status | evidence |
| --- | --- | --- |
| car physics (`zr`) | **exact**: every recorded state matches the original's; 3 of 4 scenario hashes bit-equal on arm64, all 4 within 3e-14; exact hash equality on x64 in the browser spec | `tests/unit/drift-and-deliver-port/sim.test.ts`, `tests/browser/drift-and-deliver-port.spec.ts` |
| hidden state carried across `__tp` (steering, lean, stuck, boost) | exact | scenario 4 differs if dropped (test) |
| collision response against solids (`oo` + the `zr` response) | ported line for line; **not** compared with the original (the reference scenarios have zero contacts) | `sim.test.ts` collision cases check behaviour only |
| chase camera (`Dr`, `Cr`) | ported formulas; behavioural tests only | `chase.test.ts` |
| city grid, districts, park rule | the original's constants and rules; census matches (225 blocks, 30 parks) | `world.test.ts` |
| pickups | the original's seeded generator (174: 150 coins, 14 stars, 10 hearts); collection rule (radius sqrt 13, combo to x20, star refill, heart +0.45) from the loop's source; **placements not compared with the original** | `world.test.ts` |
| traffic | 84 cars seeded from the same formulas, simplified: speeds are this port's | `world.test.ts` |
| headlight beam (the only ShaderMaterial) | **draws** (fixed): the shader and geometry were always right. The engine app path gave `material.custom` identity `viewMatrix`/`projectionMatrix` built-ins, so every custom vertex stage drew in NDC and the beam (z = 2..29 in front of the car) was clipped away; fixed in the engine by passing the real camera matrices to custom shaders only. Lamp-on vs lamp-off is asserted by pixel difference in `drift-and-deliver-port.spec.ts`. Day-only in the original's default state | `headlights.test.ts`, `custom-draw-probe.spec.ts` |
| post-processing | original: runtime `EffectComposer` = RenderPass, UnrealBloomPass(0.35, 0.35, 1.05), SMAAPass, OutputPass (Neutral, exposure 1.34). Port: `effects.bloom` + `effects.antiAlias(fxaa)` + `output: { toneMapping: "neutral", exposure: 1.34 }` | not pixel-compared |

## Art pass (this port's own look, not the original's assets)

The original's look (warm peach sky, golden low sun with long shadows, cream stone towers with lit and dark windows,
green and mustard shopfronts with striped awnings, grey-brown asphalt with big yellow and white markings, palms, lamps,
people) is reproduced with code-made art: `textures.ts` paints the road tile (crosswalks, stop lines, yellow box
junctions, arrows, wear), facades (masonry courses, lit and dark panes, balconies; 8 wall colours), shopfronts, parks, plazas,
sky and a hazy skyline (the sky dome and far city are `material.custom` shaders in `sky.ts` that decode authored colours with `#include <colorspace_decode>`; the built-in unlit/emissive paths drew black in this configuration); `city.ts` dresses the unchanged simulation footprints with metric-UV walls, shop bands, awnings,
cornices, tiered crowns, gable roofs, roof clutter and water tanks, and places lamps, traffic lights, street/park trees and
~270 pedestrians (all merged into one static palette-coloured mesh: instanced props were drawn per instance inside every shadow cascade); `vehicles.ts` builds four low-poly car shells with wheels built in (sedan, hatch, van, pickup); `look.ts` assembles the scene
(HDRI image-based light, a warm low sun with 2 cascaded shadows over 150 m, exp2 haze `#f0dcc0` 0.0024, bloom, grade, vignette; AO is opt-in via `?ao=1`; output exposure 2.3, `?exposure=` overrides; diagnostics switches `env/shadow/fog/post/sky=0`); `audio.ts` is
procedural WebAudio (engine note, tyre squeal, nitro rush, pickup chimes, traffic thud). New in the page: a title panel
with the controls, pause (P / Esc), mute (M). Solid colours sample a palette strip because PBR materials ignore
vertex colours; facade wall colours are baked into one texture per colour for the same reason.

Simulation is untouched: `sim.ts`, `world.ts`, `chase.ts` and `headlights.ts` are byte-identical to the verified versions
and the four scenario hashes, 225 blocks, 174 pickups and 84 traffic cars still hold.

## What is still not ported

- The story, missions, police/wanted level and the BUSTED flow; getting in and out of cars on foot; the map overlay;
  garage / results / level-select / intro screens.
- The original's ~11,000 GLB placements (517k triangles) and 456 animated pedestrians: the port has 1,688 dressed
  buildings (also the collision solids), ~270 static pedestrians and 84 traffic cars.
- Shadows of traffic and pedestrians are cast, but vertex-level detail (window recesses, props on facades) is texture-only.
- The original's assets are not available to the port, so everything is procedural and says so.

## Hooks

`window.__AURA_DRIFT_AND_DELIVER__` (`state`, `stepFrames`, `applyInput`, `teleport`, `reset`, `headlights`, `pickups`,
`counts`, `pixels`, `frame`, `routeHealth`) and the original's QA surface (`__sim`, `__tp`, `__game`, `__gameEntities`,
`__dbg.nearSolids`, `__diag`) so the same capture runner that recorded the original drives the port. `?manual=1` makes
the sim advance only through those hooks. `L` toggles the headlights.
