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

## The physical world (chapter 0 is the original's, as data and formulas)

`world-ch0.ts` and `collide.ts` port the original's chapter-0 physics from the re-captured bundle (`Tt`, `rs`, `Mo`, `_i`, `km`,
`Bm`, `Um`, `rv`, `sv`, `w0`/`T0`, `hS`, `uS`, `ss`, `Bx`): canal trench along `x = 82 + sin(z * 0.006) * 8` (25 m half-width, 3 m deep),
the 0.6 plain with its gentle rise, the cistern bridge arch at z = -180, cliff terraces, ramps and pads, the deep-chapter
bridges, and the 1400 measured colliders (round and box, `colliders-ch0.ts`), resolved with the original's sub-stepped push-out
and its impact rule (cooldown 0.7 s, speed x 0.82). `world-ch0.test.ts` checks the floor against the 14 floors the original
reported at its objective points (to 9 decimals) and the collision maths; the three parity rides (0:1, 0:2, 0:3) still replay
exactly with the world active. Chapter 6 shares the terrain function; chapters 1 to 5 have their own ground functions in the
original that were not captured, so they keep the 0.6 plain and no colliders.

## Art (this port's own, CC0 sources)

- **Terrain, road, banks, props**: lit PBR (`material.pbr` with ambientCG colour, normal and roughness maps), a cascaded 4096 sun, a
  hemisphere fill with the original chapter-0 rig numbers (key 2.2, sky/ground 1.05, exp2 fog 0.0009), fog, bloom and a light grade.
  Chapters 0 and 6 use the original's canal trench; chapters 1 to 5 use generated hills (`terrain.ts`) because their ground
  functions were not captured. Chapter 0 places every measured object: 51 houses, ~480 trees and shrubs, aqueduct piers, brass masts,
  lamps and the 783 box colliders as cliff terraces, aqueduct walls and building masses (instanced boxes: rock, brick, plaster).
- **Rider**: the Aura3D animation-starter hero (rigged node animation, 27 clips) on a Kenney skateboard, driven by an
  `AnimationController` (idle, drive, interact-right while holding, emote-yes on ring or objective).
- **Look**: output tone mapping `none` at exposure 0.65 (the original renders with no tone mapping; 0.65 brings this PBR rig's mean luma near the original's frames), and a cel pass (`effects.shaderPass`, `TOON_FRAGMENT`: 5-step luma banding mixed 75% plus a Sobel outline) over the final image, `?toon=0` turns it off. This approximates the original's `MeshToonMaterial` 4-step look in screen space; materials stay PBR. Chapter 0's sky and fog use colours measured from the original's frames (dusk plaza), not the palette's day blues.
- **Rings**: additive emissive torus with a pulsing rim; bloom gives the glow.
- **Sky dome** is a faithful port of the original's shader; **canal water** is a flowing custom shader (fresnel, glint, foam).
- Models and textures are CC0 (`assets/ATTRIBUTION.md`); nothing from the original's art, audio or text is reused. Chapter names,
  objective titles and scene captions are written for this port (`copy.ts`).
- 14 of the original's `ShaderMaterial`s are not ported (foliage wind, trails, outlines, fog volumes, painted sky variants). Three
  programs exist in the port (`allProgramSpecs`: sky, water, ring), each compiled in `shaders-compile.test.ts`.

## Features

Title screen with chapter select, pause (Esc / Start), scene cards between objectives, results screen, a compass to the next ring,
toasts, mute; keyboard, mouse/touch (hold to fly, drag to steer and climb, second finger boosts) and gamepad (sticks, A / triggers,
B, X, Start); procedural Web Audio (chapter pad, speed-reactive hum and wind, ring/objective chimes). QA and autopilot URLs
(`objective`, `autopilot`, `manual`, `start`) skip every screen.

## Not ported (engine gaps and capture gaps are named, not hidden)

- Colliders and ground for chapters 1 to 5 (and chapter 6's colliders): the reference world was recorded for chapter 0 only. The
  recorded "limit ride" (chapter 1, objective 0: 13 impacts, minimum altitude 1.41) therefore cannot be replayed; it needs the chapter-1 world.
- Tapered colliders (`profile` in the original's `hS`) and the original's creature colliders: not in the recorded data, so every collider is round or box.
- Creature and exploration ticks (echoes, wind trials, herd), the chapter-1 spillway recovery (`E0`), voiced scene audio, save games,
  and the arcade "Free ride & racing" mode.
- The original's look is per-material toon shading (`MeshToonMaterial`, 4-step gradient) with painted clouds, NPC sprites and a minimap; the port
  approximates the shading with a screen-space cel pass over PBR and has none of those three.
- `time` (TSL) is not used; sky, water and rings are `material.custom` GLSL programs.

## Engine surface used

`createAuraApp`, `scene`, `camera.perspective`, `environments.neutral`, `lights.{hemisphere, directional}` (cascaded shadow),
`effects.{fog, bloom, colorGrade}`, `material.{pbr, custom}`, `geometry.{custom, dynamic}`, `instances.{model, cylinder, box}`,
`model`, `defineAuraAssets` (hashed, site-relative refs), `createAnimationController`, `primitives.{sphere, torus}`, runtime handles
(`setPosition`, `setRotation`, `setUniform`), `app.camera.setPose`, `createAuraRouteHealthSnapshot` with `parityIds`. No
`@aura3d/rendering` internals, no `TODO(a3d-migrate)`.

## Hooks

`window.__AURA_SILT__`: `ready`, `reset(chapter, objective)`, `stepFrames(n, input)`, `replay(segments)` (returns the same
13-column trace rows as the reference), `applyInput(input)`, `setAutopilot(on)`, `state()`, `row()`, `render()`, `overview(on)`, `pose(p)`,
`mode()`, `setMode(m)`, `info()`.
Query: `?chapter=0..6&objective=N&autopilot=1&manual=1&start=1`.
