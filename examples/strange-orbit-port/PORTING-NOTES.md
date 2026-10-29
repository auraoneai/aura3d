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
| `audio.ts`, `ui.ts` | Presentation only: synthesized engine/wind/event audio plus a catalog space-ambient loop (`assets/space-ambient.wav`), and an injected stylesheet + title-screen enhancement (difficulty selector, branding, HUD styling) that works for the live wrapper's own HTML copy because it keys on element ids. |

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
| Assets | Remote GLB models (riders, planet, gates, opal platforms, meteors, cave minerals) and `impasto.png` | Moon rocks are the licensed catalog model `diamondRock.af699d5e` (`assets/moon-rock.glb`, 1.1 MB, admitted with `sha256` + `provenance.sourcePath` so the production bridge accepts it). Riders are composed from primitives (slim frame, torus tyres, capsule limbs, glowing hubs/visor/nozzles); planet is a banded shader sphere with a Fresnel atmosphere shell; islands are slabs; procedural brush texture in the track shader |
| Lighting | three hemisphere + 2 directional lights, PCF shadows, ACES, exposure 1.2 | Same light model evaluated inline in each custom shader (custom materials are unlit) plus rim/specular sheen, distance haze toward the nebula blue, ACES tone mapping, bloom (0.5 / threshold 0.78), colour grade and vignette in the app output; the catalog rocks use the scene lights; **no shadow maps** |
| Sky | Dark star field with a distant ringed course | Nebula dome (`NEBULA_*`: object-space fbm clouds, galactic band, dust lanes), two star layers (one bright additive layer), planet atmosphere shell |
| Track look | Terracotta ring with teal mineral strata | Track shader adds teal veining, terracotta grade, glowing edge lines and a screen-space impasto bump (`TRACK_FRAGMENT`) |
| Track shading | `MeshStandardMaterial.onBeforeCompile` pigment patch | `material.custom` with the same pigment mixing code (`shaders.ts`), author attributes `pigmentBase/Vein/Chalk`, `paintOriginal` (R-23) |
| Rivals and medals | Rival pace `rules.ai` 0.86 / 0.96 / 1.0; places 2 and 3 silver, 4 to 6 bronze | Audit 2026-10-29 (SO-2, SO-3): the shipped cup (`balance: "cup"`) uses pace 0.98 / 1.12 / 1.25, gives rivals the crystal landing surge and a catch-up past 120 m of player lead; places 1/2/3 get gold/silver/bronze and 4 to 6 no medal. `balance: "original"` keeps the original rivals and is what the recorded-race replay and the 14,627-step pin use. With the autopilot, Explorer is a win, Racer a win by under 15 s and Expert 3rd (`tests/unit/strange-orbit-port/balance.test.ts`) |
| Input | Keyboard | Keyboard plus touch (`touch.ts`): hold the left side to ride, drag to steer, Boost/Rise/Brake/Gravity buttons; HUD pause and sound buttons; mute saved in `localStorage` |
| Particles | three `Points` + sprites | `geometry.dynamic({ topology: "points" })` with `size`/`tint`/`fade` attributes |
| Decorative rings, minerals in the cave, fractured opal escarpment, ghost rider, trail ribbons | Present | Not ported (cosmetic) |
| Skate/bike kinematic poses | Rigged GLB animation | Rigid parts positioned per frame; no walk/pedal animation |
| Career, championship, garage, suits, settings, ghosts persisted in `localStorage`, gamepad, touch controls | Present | Not ported. Keyboard with the original default bindings only. Time-trial ghost *recording* works (`recording`), playback and persistence do not |
| Audio | Original music and sfx | Own synthesis (Web Audio via `@aura3d/audio` `AudioContextManager`): speed-driven engine hum and wind, boost whoosh, cues for dust/gate/jump/land/hit/lost/launch/lap/finish; catalog ambient loop. Press M to mute. No original audio is used |
| Menu | Animated observatory scene, Explorer/Racer/Expert picker | Overlay over the live scene (camera frames the riders at s = 35) with the original's title, tagline, bike/skate and difficulty selectors (difficulty reloads with `?difficulty=`). Garage/Settings are not ported |
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

## Art pass (2026-10-23)

Debugging note worth keeping: a scene containing a `model()` whose asset URL is http(s) (dev server or live site) is
rejected by the production bridge ("unsafeModelUrl and remote/raw model URLs are blocked") and **draws nothing at all**
(`drawCalls: 0`, black frame, `diagnostics().errors[0]`) unless the `defineAuraAssets` entry carries `sha256`/`hash`
and `metadata.provenance.sourcePath` under `public/aura-assets/` (`createAssetProvenance` in the engine's
`diagnostics.ts`). `?off=lights,bloom,grade,vignette,sky,atmo,stars2,rocks,lintel` switches individual look
upgrades off for bisecting this kind of failure.

Capture: `tests/browser/strange-orbit-port.spec.ts` logs frames as short numbered `STRANGE_ORBIT_FRAMEPART` lines
(long lines are dropped from the remote log) plus two page screenshots (`ui-menu`, `ui-race`).

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

## Meshy art pass (2026-10-23)

The primitive riders, bikes and gate pillars were replaced with Meshy-generated models (text prompts written for this port, in our own words; no image-to-3D, no reference to the original's characters or assets). Generated through Kiro Prism with the shared helper (`/tmp/meshy/meshy.mjs`, ledger tag `strange-orbit`). Rights: the account's Meshy plan terms at generation time (see `assets/provenance/*.rights.json`); not CC0.

| Role | File | Prompt gist | Refine / remesh task | Triangles (verts) | Size |
| --- | --- | --- | --- | --- | --- |
| Player bike + rider (rivals 2, 4 tinted) | `assets/models/bike_rider.glb` | sleek pearl-white and teal hoverbike, crouched astronaut rider, cyan thrusters | `01a169cf-79f4-7069-9035-8d104a1c81af` | 44k verts | 2.3 MB |
| Rival bike + rider (rivals 1, 3, 5) | `assets/models/rival_bike.glb` | angular indigo and gold wedge racer, rider lying low, amber thruster | `01a169e9-f81c-77fd-ab45-de0ef2c90599` | 45k verts | 2.4 MB |
| Skate mode skater | `assets/models/skate_rider.glb` | astronaut on a glowing teal skateboard | `01a169cd-4617-733b-a9e9-80aa4edf1e44` | 30k verts | 1.8 MB |
| Gate pylons (10) | `assets/models/pylon.glb` | tapered terracotta stone column, teal cap, cyan band | `01a169d7-9225-7465-84c7-daf05756300c` | 16k verts | 1.1 MB |
| Rim boulders | `assets/models/boulder_a.glb` | weathered terracotta boulder with teal veins (remeshed to 8k) | refine `01a169cd-a0e4-74a5-a214-0656f611408e`, remesh `01a169d2-ecd1-7261-a858-3702a23a12db` | 8k verts | 1.0 MB |
| Rim spires | `assets/models/boulder_b.glb` | tall angular basalt spire, chalk streaks | `01a169d3-fb24-74c3-8289-ab2ef49341f5` | 28k verts | 1.2 MB |
| Horizon lander | `assets/models/lander.glb` | retro four-legged lander, gold foil | `01a169d2-71c7-755b-8bba-c23ba266d313` | 38k verts | 1.6 MB |
| Horizon observatory (2) | `assets/models/observatory.glb` | white dome, tower, radio dish | `01a169d5-3fee-769b-8e68-ecf096abfa00` | 43k verts | 1.8 MB |

Credits: eight models at 30 (20 preview + 10 refine) plus one remesh at 5 = 245 credits. (The shared ledger records 175 for this game because rate-limited polls marked finished tasks as failed; the task ids above are the real spend.) Optimised with `/tmp/meshy/optimize.mjs` (dedup, weld, simplify, 1024 px textures for riders/pylon, 512 px for the props, meshopt), admitted with `aura3d assets import-meshy` + `assets validate --require-license` in an isolated temp project (`failures: []`), and wired in `models.ts` as same-origin pathname + `sha256` (the production bridge draws nothing for http(s) URLs).

Wiring notes:

- `model()` grounds a model: its origin is the bottom centre of the bounds, so a rider part sits at the rig origin (ground contact) and the node is scaled by `targetMaxDimension` (bike 2.5 m, skater 1.7 m) times the race scale.
- Meshy models face -X, so the rider rig yaws them by pi (bike) or pi/2 (skater) so forward is the rig's +X.
- A rider is now one node (was 19 primitives); the wheel spin, pedal and arm motion of the primitive rig are gone, the rider pose is rigid.
- `?meshy=0` restores the primitive riders and the plain pillars (bisecting a render problem).
- Set dressing: 14 boulders and spires along the rim (deterministic Lehmer seed 48271), a lander at s = 330 and two observatories at s = 790 and 1260.
- Meshy rigging/animation was not used: the riders are single combined meshes (a rider fused to a bike cannot be rigged as a humanoid).

## Solid scenery in zero-G flight (rework)

The original only collided the rider with the drivable strips (`findReentry`) and the moon rocks; the gate pillars and lintels, rim boulders and spires, lander and observatories were visual only, and a rider flying up under a strip passed through it. The port now treats them as solid in drift flight:

- `obstacles.ts` holds the placement of the rim dressing (`dressingPlan()`, used by `world.ts` for the meshes) and the capsule colliders built from the same frames and the GLB bounds (`staticColliders()`); `impactColliders()` feeds the library `createImpactWorld` as sphere chains.
- The drift step moves through that world (restitution 0.4, friction 0.18). A contact above 3 m/s is one impact: it counts in `impacts`, applies the moon-rock penalty once per 1 s cooldown (energy -10, combo reset) and raises a `hit` event with the surface, point, normal and approach speed, which drives the library hit-stop, camera shake and the hit cue. Slower grazes bounce silently.
- `findUndersideBlock` (`reentry.ts`) stops a rider flying up through a strip from below.
- On-track riders and rivals are unchanged (the lane clamp keeps them away from these pieces), so the reference replay and the 7-lap autopilot pin are unchanged. Numbers: `evidence/strange-orbit-port/rework/README.md`.
