# Silt & Signal on Aura3D: porting notes

Source of truth: the captured bundle under `tests/fixtures/crayon/silt-and-signal/` (`PROVENANCE.md`; the logic
excerpts in `logic-extract.js`, the chapter data in `chapters.json`). The captured code is untrusted third-party
data: it is parsed, never executed, by `extract.mjs`. The reference capture (`evidence/crayon-capture/silt-and-signal-reference.json`)
was recorded remotely from the live original (`tools/crayon-capture/silt-and-signal.ts`).

## What the port reproduces exactly

`sim.ts` is a port of the gameplay core, equation for equation:

| Original | Port | Notes |
| --- | --- | --- |
| `Eo()` | `createFlight()` | flight state: speed, turn, bank, vertical, energy, boost lock |
| `e0(Z, rn, input, dt, world)` | `flightStep` | throttle/steer/lift, boost (76 vs 42, energy drain, lockout below 0.18), brake, yaw/bank/vertical dynamics, floor + ceiling + x/z clamps |
| `Mx` + `$T` + `zn` + `zi` + `_o` | `progressStep`, `completeObjective`, `objectiveOf`, `targetOf`, `gateOpen` | reach-the-point (radius + altitude band), hold kinds (care, resonate, relay, lift, tow, portal), timed gates, stealth ceiling, wake speed |
| `Mt` (seven chapters) | `chapters-data.ts` | generated from `chapters.json`; 34 objectives |
| `qa.chapter(i, e)` | `createSim(chapter, objective)` | rider starts 40 m behind the objective's first point |
| frame order in `qv` | `stepSim` | clock, elapsed, flight, then progression |

The replay test (`tests/unit/silt-and-signal-port/reference-replay.test.ts`) feeds the reference run's recorded
per-step inputs to `stepSim` and compares the trace with the original's, step by step, within the tolerance the
capture's own session-to-session variance supports.

## What is a stand-in

- **Sky dome**: a faithful port of the original's sky shader (day gradient, aurora band, stars, `night` mix) with the
  original's per-chapter colours (`world.ts` `skyColors`).
- **Ground, canal water, objective rings, bike**: written for this port. The original builds terrain and structures from a
  generator plus GLB models (six blobs of 1.5 to 8 MB seen in the capture) and 22 images (20 WebP, 2 JPEG), whose bytes the capture did not read; the port draws a flat
  stone road on the original's road curve `x = 82 + sin(z * 0.006) * 8`, an animated canal, torus rings at each objective point
  and a box-and-cone bike.
- 14 of the original's `ShaderMaterial`s are not ported (foliage wind, trails, outlines, fog volumes, painted sky variants).
  Five programs exist in the port (`allProgramSpecs`), each compiled in `shaders-compile.test.ts`.

## Not ported (engine gaps are named, not hidden)

- **Terrain floor and colliders** (`St.floor`, `Bx`): the simulation takes an injected `floor(x, z, y)` (default 0.6, the road
  baseline). The reference rides at cruise altitude in open space, where the clamp is not engaged and `impacts` stays 0.
- Creature and exploration ticks (echoes, wind trials, herd), the chapter-1 spillway recovery (`E0`), scenes with voiced lines,
  music and effects, the pause/map UI, save games, pointer/gamepad continuous axes, and the arcade "Free ride & racing" mode.
- `time` (TSL) is not used; every surface is a `material.custom` GLSL program.

## Engine surface used

`createAuraApp`, `scene`, `camera.perspective`, `primitives.{sphere, plane, torus, box, cone}`, `material.custom`
(uniforms, `side`, `transparent`, `blending`), runtime handles (`setPosition`, `setRotation`, `setUniform`),
`app.camera.setPose`, `createAuraRouteHealthSnapshot` with `parityIds`. No `@aura3d/rendering` internals, no
`TODO(a3d-migrate)`.

## Hooks

`window.__AURA_SILT__`: `ready`, `reset(chapter, objective)`, `stepFrames(n, input)`, `replay(segments)` (returns the same
13-column trace rows as the reference), `applyInput(input)`, `setAutopilot(on)`, `state()`, `row()`, `render()`, `info()`.
Query: `?chapter=0..6&objective=N&autopilot=1&manual=1`.
