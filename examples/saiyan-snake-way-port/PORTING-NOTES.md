# Saiyan through the Snake way! on Aura3D: porting notes

Aura3D port of the Crayon game "Saiyan through the Snake way!" (PRD Phase C / R-25 capture work).
Source: the captured game module in `tests/fixtures/crayon/saiyan-snake-way/` (see its
`PROVENANCE.md`; untrusted data, read as text only, never executed). three r184 comes from the
page's importmap, so the module is one 513,393-byte file of game code with minified names.

## Layout

| File | Role |
| --- | --- |
| `sim.ts` | The simulation. Pure and deterministic, no engine imports. `createRun`, `stepRun(state, input, dt)`, `runScript`, `expandScript`, `snapshot`. |
| `road.ts` | The snake's path (the original's `XA`/`ZA`/`At` frame integration) and the ribbon mesh. |
| `world.ts`, `materials.ts`, `shaders.ts` | Rendering on the public `@aura3d/engine` surface only. |
| `main.ts`, `index.html` | Boot, fixed-step loop, input, HUD, capture hooks (`window.__AURA_SAIYAN_SNAKE_WAY__`). |

Run it: open `/examples/saiyan-snake-way-port/` on the example dev server. Query parameters:
`autostart=1`, `manual=1` (the sim only advances through `stepFrames` / `runSegments`).

## Simulation parity

`stepRun` is a port of the original's `qB(dt)` run branch (`ca` aura/ki/strain, `Na` movement and
flight, `aa` milestones, `Po`/`Wo` spawning, `Sa` entities and collisions) over the same state
fields, in the same evaluation order. The original has no randomness (spawns hash the road
position) and its simulation never reads a clock, so identical inputs reproduce the same run.

The reference (`evidence/crayon-capture/saiyan-snake-way-reference.json`, recorded by
`tools/crayon-capture/saiyan-snake-way.ts` on serverless ACR) is a full outbound run driven by a
closed-loop autopilot against the real game at a fixed 1/60 s step: 5,433 steps (90.55 s), all eight
stages, 36 Kaio-ken rung changes, one hit, 47 key taps. Two further fresh browser sessions replayed
the recorded script and matched the policy run bit for bit (8,967 fields each, 0 mismatches), so
the original is repeatable to 0. The port replays the same script and matches every recorded
snapshot field (183 snapshots, 46 fields each, including the live entity count) within 1e-6; the
unit test `tests/unit/saiyan-snake-way-port/reference-replay.test.ts` pins it, and the browser spec
runs the same replay inside the live page.

How the original was driven: a pre-boot hook sets `window.__HARNESS` (the page's inline script
otherwise stubs `window.__TEST` to a no-op), freezes `requestAnimationFrame`, and the tool steps
`__TEST.sim` / `__TEST.tap` at exactly 1/60 s while reading the raw state from `window.__PROBE.S`.

## Scope

Ported: the outbound leg of the "full" route as Son Goku, from the check-in line to the end of the
road: lane changes, jump, slide, Kaio-ken (power-up, rungs, ki, strain, lockout), flight (Nimbus
and the E key), the eight stages with their gaps, roll sections, wind and drowse, every road
entity (ki orbs, souls, barriers, ribs, oni, sweepers, power-ups, feast), days and score.

Not ported (the simulation stops with the phase set where the original hands over):

- the fall phase and Hell (`phase === "fall"` after a missed gap or an edge; the hell run, ogre and
  portal);
- the leap to King Kai's world, the planet training, Kami's Lookout, Yemma's office and the road home;
- the menu flows, character select (Vegeta and Piccolo change hazards, the oni set and the power
  name), saved runs, touch controls and audio.

## Documented divergences

| Area | Original | Port |
| --- | --- | --- |
| Assets | GLB avatars (Goku, ogres, saibaman) animated with `SkeletonUtils` | Primitive figures (capsules, spheres, cone); no skeletal animation |
| Sky | Ray-marched height-field cloud deck in a full-screen shader | Ten-step gradient bands (the original's `skyAt`) plus a noise cloud deck on a sky dome |
| Aura | Two `ShaderMaterial` shells | The same blade-tier fragment maths on two cylinders; uniform `time` is `auraTime` (a uniform named `time` lowers to the engine's reserved `u_time`) |
| Road | Toon-shaded scale texture | Ring ribbon with a procedural scale/joint pattern; a missing plate leaves a hole one sample wider than the original's `gap` window |
| Lighting | `MeshToonMaterial` + directional/hemisphere/point lights | The same three-band toon ramp evaluated inline (custom materials are unlit) |
| Post | Speed-line streak pass | Not ported |
| Cloud sprites, ink outlines, particles, camera shake | Present | Not ported (cosmetic) |

## Engine findings

None blocking. Authoring `material.custom` shaders required renaming the aura's `time` uniform (see
above); the engine now rejects such names at authoring time with a named error.
