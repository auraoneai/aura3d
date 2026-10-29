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
original that were not captured. Since the 2026-10-29 audit (C3, C6) chapters 1 to 6 use this port's own physical world
(`terrainPhysics` in `terrain.ts`): the floor is the rendered terrain (`max(0.6, heightAt)`), so the rider and the chase camera stay
above the hills, and every scattered prop the chapter draws (houses, trees, rocks, lamps, piers) has a round or box collider sized
from its model bounds. A push out of a collider re-applies the floor clamp, and the world-edge clamp now runs before the floor test.

## Art (this port's own, CC0 sources)

- **Terrain, road, banks, props**: lit PBR (`material.pbr` with ambientCG colour, normal and roughness maps), a cascaded 4096 sun, a
  hemisphere fill with the original chapter-0 rig numbers (key 2.2, sky/ground 1.05, exp2 fog 0.0009), fog, bloom and a light grade.
  Chapters 0 and 6 use the original's canal trench; chapters 1 to 5 use generated hills (`terrain.ts`) because their ground
  functions were not captured. Chapter 0 places every measured object: 51 houses, ~480 trees and shrubs, aqueduct piers, brass masts,
  lamps and the 783 box colliders as cliff terraces, aqueduct walls and building masses (instanced boxes: rock, brick, plaster).
  All 55 chapter-0 lamps are drawn (the first 18 used to be, so 37 were solid but invisible). Plaster walls carry ambientCG
  PaintedPlaster017 colour, normal and roughness maps under their per-wall tint.
- **Rider**: the Aura3D animation-starter hero (rigged node animation, 27 clips) on a Kenney skateboard, driven by an
  `AnimationController` (idle, drive, interact-right while holding, emote-yes on ring or objective).
- **Look**: output tone mapping `none` at exposure 0.65 (the original renders with no tone mapping; 0.65 brings this PBR rig's mean luma near the original's frames), and a cel pass (`effects.toon`: 5-step luma banding mixed 75% plus a Sobel outline) over the final image, `?toon=0` turns it off. This approximates the original's `MeshToonMaterial` 4-step look in screen space; materials stay PBR. Chapter 0's sky and fog use colours measured from the original's frames (dusk plaza), not the palette's day blues.
- **Rings**: the active ring is the library objective marker (cyan; red while a timed gate is shut); waiting rings are one
  instanced pool of Meshy stone rings. Bloom (threshold 1.0) gives the emissive parts their glow.
- **Sky dome** is a faithful port of the original's shader; **canal water** is a flowing custom shader (fresnel, glint, foam).
- Models and textures are CC0 (`assets/ATTRIBUTION.md`); nothing from the original's art, audio or text is reused. Chapter names,
  objective titles and scene captions are written for this port (`copy.ts`).
- 14 of the original's `ShaderMaterial`s are not ported (foliage wind, trails, outlines, fog volumes, painted sky variants). Three
  programs exist in the port (`allProgramSpecs`: sky, water, ring), each compiled in `shaders-compile.test.ts`.

## Features

Title screen with chapter select, pause (Esc / Start / the touch Pause button), scene cards between objectives, a results screen
that sums the whole journey (time, lamps restored, chapters flown, impacts; per-chapter numbers ride in sessionStorage across the
chapter reloads), a compass to the next ring, toasts, mute and text size (both kept in sessionStorage); keyboard, mouse/touch (hold
to fly, drag to steer and climb, second finger boosts), on-screen touch buttons (Hold = interact + brake, Boost, Pause; shown on
coarse pointers or after the first touch) and gamepad (sticks, A / triggers, B, X, Start); a hint line under the objective (which
control to hold, timed-gate countdown, stealth and wake limits); impacts give a thud, a short capped camera shake and a toast; a tow
objective drags a shell. `prefers-reduced-motion` turns off the boost FOV kick, the thruster flicker and the shake. Procedural Web
Audio (chapter pad, speed-reactive hum and wind, ring/objective chimes) starts on the first key, pad button or press.
QA URLs (`objective`, `autopilot`, `manual`) skip every screen and never pause; `start=1` alone skips the title and is player
mode, which is how chapter changes reload. The loading screen stays up until the textured materials have swapped in (20 s cap).
Coarse-pointer screens use a 2048 sun shadow map instead of 4096.

## Not ported (engine gaps and capture gaps are named, not hidden)

- The original's own colliders and ground for chapters 1 to 5 (and chapter 6's colliders): the reference world was recorded for
  chapter 0 only, so chapters 1 to 6 use this port's terrain and props instead. The recorded "limit ride" (chapter 1, objective 0:
  13 impacts, minimum altitude 1.41) therefore cannot be replayed; it needs the original's chapter-1 world.
- Tapered colliders (`profile` in the original's `hS`) and the original's creature colliders: not in the recorded data, so every collider is round or box.
- Creature and exploration ticks (echoes, wind trials, herd), the chapter-1 spillway recovery (`E0`), voiced scene audio, save games,
  and the arcade "Free ride & racing" mode. Without exploration there are no field notes, so the field-note perks (reserve energy,
  stronger lift) and the results cell were removed; the two herd objectives are titled as the ring routes they are.
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

`window.__AURA_SILT__`: `ready`, `reset(chapter, objective, start?)`, `stepFrames(n, input?)` (no input: the live controls), `replay(segments)` (returns the same
13-column trace rows as the reference), `applyInput(input)`, `setAutopilot(on)`, `state()`, `row()`, `render()`, `overview(on)`, `pose(p)`,
`mode()`, `setMode(m)`, `info()`.
Query: `?chapter=0..6&objective=N&autopilot=1&manual=1&start=1`.

## Meshy art pass (2026-10-23)

Generated through Kiro Prism from original text prompts (no image-to-3D, no original names); credits spent for this game: **453** (ledger tag `silt`, cap 800). Rights basis and task ids: `assets/ATTRIBUTION.md` and `assets/provenance/*.rights.json`. Admitted in an isolated temp project (`assets import-meshy` + `validate --require-license`, `failures: []`), then hard-simplified (meshopt simplify, 1024 px textures) so the whole port stays under 20 MB.

| Model | Role | Prompt gist |
| --- | --- | --- |
| courier.glb | rider: remesh 12k, rig, library idle (action 0), rig walk/run merged into one GLB; clips idle/walk/run | young sky courier, sand flight suit, A-pose |
| hoverboard.glb | board under the rider | sleek sand-white deck, copper trim, teal thruster strips |
| ringclean.glb | the eight waiting signal rings (scale 25.5) | thick carved sandstone ring with glowing rune lines |
| gatehouse.glb | landmark at the first objective | sandstone gatehouse, two towers, wooden gate |
| aqueduct.glb | two distant aqueduct segments | ruined sandstone aqueduct, three arches |
| ringgate.glb | canyon-gate landmark beyond the last objective | stone ring between two towers |
| watchtower.glb | two outposts on the road | ruined sandstone watchtower |
| pillar.glb | six canyon pillars | wind-carved sandstone pillar |
| canyonrocks.glb | the 48 largest boulders (the rest stay cheap instanced icosahedra) | eroded red-sandstone boulder cluster |
| lantern.glb | every street lamp | iron post with bronze lantern |
| banner.glb | eight route banners | tall pole, tattered teal and ochre banner |
| stall.glb | two plaza market stalls | canvas-roofed stall with crates and jars |

Rings: the waiting rings are lit stone models; the active ring gets a thin emissive torus and a thin emissive beam (solid lit meshes, no alpha blending or custom shader), because the owner reported on a real GPU that the previous additive-shader rings did not appear. Thrusters are emissive spheres for the same reason. Rejected/unused: a first ring-gate prompt that produced towers (kept only as the canyon-gate landmark), a cactus (60k triangles after simplify), a footbridge (Prism returned quota_exhausted). Not done: rigged villagers (static A-pose NPCs looked wrong), chapters 1-6 landmarks (landmarks are chapter 0 only).
