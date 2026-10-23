# Strange Orbit on Aura3D: porting notes

Aura3D port of the Crayon game "Strange Orbit" (PRD §7.2 Phase A, task R-20).
Source: the captured, de-minified game logic in
`tests/fixtures/crayon/strange-orbit/` (see its `PROVENANCE.md`; untrusted data,
read as text only, never executed).

## Layout

| File | Role |
| --- | --- |
| `race.ts` | The simulation. Pure and deterministic, no engine imports. `createRace`, `stepRace(state, input, dt)`, `raceOrder`, `autopilot`, `runFixed`. |
| `course.ts`, `track.ts`, `reentry.ts`, `vec3.ts` | Course topology, track geometry, zero-G re-entry surface, mutable `Vec3` (same in-place semantics as three's `Vector3`, tested against three 0.185.1). |
| `world.ts`, `meshes.ts`, `shaders.ts`, `palette.ts`, `orient.ts` | Rendering on the public `@aura3d/engine` surface only. |
| `main.ts`, `index.html` | Boot, fixed-step loop, input, HUD, capture hooks. |

Run it: open `/examples/strange-orbit-port/` on the example dev server. Query
parameters are listed at the top of `main.ts`.

## Simulation parity

The step function keeps the original's input → state semantics and evaluation
order, ported from `src/race.js`, `gravity.js`, `skate-loop.js`, `jump.js`,
`race-order.js`, `course.js`, `track.js` and `reentry.js`:

- fixed 1/60 s step, `dt` clamped to 0..0.05 s, countdown 3.2 s;
- player physics (pedal/brake/boost/draft/surge), steering as a heading rate with
  the world heading preserved across track curvature, edge grace, lane clamp under
  gravity lock;
- routes (split upper/lower, opal bypass/islands), jumps, ramps, kickflips, island
  tile sweep collision, zero-G drift and sling, re-entry, skate loops;
- five rivals driven by per-rival seeds and `Math.sin` (no randomness), rubber
  banding via corner speed, slipstream, contact;
- laps, five checkpoints per lap, resonance crystals, moon rocks, stardust, medals.

The simulation contains **no randomness**, so the "seedable RNG" in the task
brief is unnecessary: identical inputs reproduce the same race exactly (unit
tests pin a full 7-lap autopilot race at 14,627 fixed steps, 4:03.78). The
original's decorative randomness (star field, exhaust jitter) uses seeded
generators here (`lehmer`).

### Course layout helpers recovered from the raw bundle

The derived fixture `game-logic.demangled.js` omits ~140 lines of course layout
(split/opal sections, island tiles, gates, lane offset functions) because the
bundler emitted them inside the `three.module.js` region. They were read from the
hash-pinned raw bundle (`7d99cfed…`, 864,545 bytes) and ported into `course.ts`.
Without them the original race logic does not resolve.

## Documented divergences

| Area | Original | Port |
| --- | --- | --- |
| Assets | Remote GLB models (riders, planet, gates, opal platforms, meteors, cave minerals) and `impasto.png` | Procedural: capsule/cylinder/sphere riders, sphere planet with banded shader, slab islands, icosahedron rocks, procedural brush texture in the track shader |
| Lighting | three hemisphere + 2 directional lights, PCF shadows, ACES, exposure 1.2 | Same light model evaluated inline in each custom shader (custom materials are unlit); ACES tone mapping in the app output; **no shadow maps** |
| Track shading | `MeshStandardMaterial.onBeforeCompile` pigment patch | `material.custom` with the same pigment mixing code (`shaders.ts`), author attributes `pigmentBase/Vein/Chalk`, `paintOriginal` (R-23) |
| Particles | three `Points` + sprites | `geometry.dynamic({ topology: "points" })` with `size`/`tint`/`fade` attributes |
| Decorative rings, minerals in the cave, fractured opal escarpment, ghost rider, trail ribbons | Present | Not ported (cosmetic) |
| Skate/bike kinematic poses | Rigged GLB animation | Rigid parts positioned per frame; no walk/pedal animation |
| Career, championship, garage, suits, settings, ghosts persisted in `localStorage`, gamepad, touch controls, audio | Present | Not ported. Keyboard with the original default bindings only. Time-trial ghost *recording* works (`recording`), playback and persistence do not |
| Menu | Animated observatory scene | Static overlay; the camera frames the riders at s = 35 |
| Camera | Slerped rig quaternion | Exponentially blended forward/up vectors re-orthonormalised each frame (same 12 s⁻¹ rate) |
| Quality levels | pixel ratio and shadow toggle | Row spacing (1.3 vs 2.1 m) and star count |

## Hooks (deterministic capture)

`window.__orbit` mirrors the original's `?qa` hooks (`state`, `begin`, `menu`,
`set`, `pose`, `advance(seconds, input)`) so one capture driver can run both
builds. `window.__AURA_STRANGE_ORBIT__` adds `stepFrames(n, input?)`,
`runToFinish()`, `applyInput`, `setScript`, `setAutopilot`, `frame()`,
`pixels()` and `routeHealth()`. The Phase A fields (`lap`, `checkpointOrder`,
`elapsedMs`, `finished`) come from `status()` / `state()`. With `?manual=1` the
simulation advances only through these hooks.

## Engine features exercised (route-health `parityIds`)

`SG-03` (cone, cylinder, capsule, sphere, polyhedron, ring primitives),
`SG-05` + `R-23` (`geometry.dynamic` with custom attributes, point topology,
`updateAttribute`), `SH-02` (`material.custom`, `setUniform`).

## Verification

| Check | Where | Result |
| --- | --- | --- |
| Replay of the original's recorded 17,214-step race (`evidence/crayon-capture/strange-orbit-reference.json`) | `tests/unit/strange-orbit-port/reference-replay.test.ts` (Node) | Finish step, finish time (283.683333333404 s, bit-identical), all 7 lap times, all 35 checkpoints on the same steps, 21 route announcements, hits 5, near misses 20, dust 175, score 50,625, place 2, silver medal, full standings. Unfinished rivals differ by <1e-6 m (Node vs Chrome `Math.*` last-bit differences) |
| The same replay inside the live page | `tests/browser/strange-orbit-port.spec.ts` (Chrome 147 on the ACR runner) | Same results with every rider's final distance differing from the reference by exactly 0 |
| 7-lap autopilot race, twice | same spec | 243,783 ms both times, 35 checkpoints in order |
| Rendering | same spec | Menu, race-start, race-6s and finish frames: track, planet, stars, six riders, gate veils and pillars, rocks, stardust; pixel statistics asserted |
| GLSL | `tests/unit/strange-orbit-port/shaders-compile.test.ts` | Every program baked through the engine prelude and linked with `glslangValidator` |

`reference-replay.json` in `tests/browser/data/` is the evidence capture's script and
result (the ACR build context copies `tests/browser/` but not `tests/fixtures/`, and
`tests/browser/fixtures/` is gitignored). A unit test pins it to the evidence file.

## Engine findings

None blocked the port. Three things worth fixing in the engine:

1. **`primitives.sphere/cylinder/capsule` ignore `params`.** Only `size` (a scale on a unit
   shape) applies; `params` takes effect for cone, ring, polyhedron and the other SG-03
   kinds. A rider built with `params: { radius: 0.15 }` rendered at unit size with no
   error.
2. **`material.custom` accepts uniform names that lower into reserved ones.** An authored
   uniform called `time` lowers to `u_time`, which the generated prelude already declares,
   so validation passes and the program then fails to compile (`'u_time' : redefinition`).
   The reserved-name list checks the authored name, not the lowered one. The port names
   them `veilTime` and `veilPulse`.
3. **A shader compile failure's message omits the GLSL info log.** The log is on
   `error.details` (`{ label, log, stage }`); `main.ts` prints it. The port's compile test
   exists so these never reach a GPU run.

Also: `instances.mesh` and `lines.*` are unused because their flags are still `dev` (R-17),
and custom materials are unlit, so shadows would need a dedicated shadow pass.
