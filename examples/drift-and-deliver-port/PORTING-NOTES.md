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
| headlight beam (the only ShaderMaterial) | **NOT VISIBLE IN THE ENGINE (open gap)**: geometry equals three's pipeline and the shaders link with the reference compiler, but remote pixel diffs (lamp on vs off, and lamp initially on) show zero change; frustum culling off, world-space attribute updates and a lit-from-start page did not fix it. Day-only in the original's default state | `headlights.test.ts` |
| post-processing | original: runtime `EffectComposer` = RenderPass, UnrealBloomPass(0.35, 0.35, 1.05), SMAAPass, OutputPass (Neutral, exposure 1.34). Port: `effects.bloom` + `effects.antiAlias(fxaa)` + `output: { toneMapping: "neutral", exposure: 1.34 }` | not pixel-compared |

## What is not ported (all of it is visible in the original)

- The story, missions, police/wanted level and the BUSTED flow; getting in and out of cars on foot; the map overlay.
- 456 pedestrians; ~11,000 prop and building placements from 520 GLB prototypes (517k triangles). The port has one box
  per building slot (1,688 buildings, used as the collision solids), 360 trees and 84 traffic boxes.
- Voiced story, audio, shadows, IBL, the water and sky shaders, the skyline, hills and clouds. The sky is a canvas
  gradient texture; fog is not applied.
- The original's assets are not available to the port, so everything is procedural and says so.

## Engine surface used (no `@aura3d/rendering` imports, no `TODO(a3d-migrate)`)

`instances.mesh` (blocks, buildings, trees, traffic, pickups), `geometry.custom` + `geometry.dynamic` (beam),
`material.custom` (beam), `material.pbr` / `material.emissive`, `primitives.*` (car, ground, water), `texture.canvas`
(sky), `lights.*`, `effects.bloom` / `effects.antiAlias`, runtime node handles, `app.camera.setPose`.

## Hooks

`window.__AURA_DRIFT_AND_DELIVER__` (`state`, `stepFrames`, `applyInput`, `teleport`, `reset`, `headlights`, `pickups`,
`counts`, `pixels`, `frame`, `routeHealth`) and the original's QA surface (`__sim`, `__tp`, `__game`, `__gameEntities`,
`__dbg.nearSolids`, `__diag`) so the same capture runner that recorded the original drives the port. `?manual=1` makes
the sim advance only through those hooks. `L` toggles the headlights.
