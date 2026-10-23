# Serpentine Sky Run on Aura3D: porting notes

Aura3D port of the Crayon game "Saiyan through the Snake way!" (PRD Phase C / R-25 capture work), shown publicly as
"Serpentine Sky Run". All on-screen wording goes through `text.ts`; the simulation keeps the original's identifiers and strings
so its replay tests still compare against the recorded reference.
Source: the captured game module in `tests/fixtures/crayon/saiyan-snake-way/` (see its
`PROVENANCE.md`; untrusted data, read as text only, never executed). three r184 comes from the
page's importmap, so the module is one 513,393-byte file of game code with minified names.

## Layout

| File | Role |
| --- | --- |
| `sim.ts` | The simulation. Pure and deterministic, no engine imports. `createRun`, `stepRun(state, input, dt)`, `runScript`, `expandScript`, `snapshot`. |
| `road.ts` | The snake's path (the original's `XA`/`ZA`/`At` frame integration) and the ribbon mesh. |
| `world.ts`, `materials.ts`, `shaders.ts` | Rendering on the public `@aura3d/engine` surface only: road ribbon, ray-marched cloud deck and starry sky dome, aura shell, rigged runner, multi-part props, post stack, chase camera. |
| `hero.ts` | The procedural runner: a primitive figure posed from run, jump, slide, flight and dive states. It is the fallback when the rigged model cannot load, and its pose also anchors the aura, sparks and bursts. Pure maths, unit tested. |
| `assets/runner.glb`, `models.ts` | The rigged runner and the Meshy props (see the Meshy art pass section below and `assets/ATTRIBUTION.md`), driven through `cloneSkinned` / `TypedGLBActor`. |
| `styles.ts` | Three runner looks for the select card (colours only; the run is identical). |
| `text.ts` | Display wording: swaps the franchise terms the simulation emits for generic ones (`displayText`), with a forbidden-term list the unit test checks against every string the sim can emit. |
| `sfx.ts` | Synthesised one-shot sound effects (Web Audio, no asset files, no continuous bed). |
| `main.ts`, `index.html` | Boot, fixed-step loop, input (keyboard and touch), HUD, title with runner select, countdown, pause, results, best score, capture hooks (`window.__AURA_SAIYAN_SNAKE_WAY__`). |

Run it: open `/examples/saiyan-snake-way-port/` on the example dev server. Query parameters:
`autostart=1` (skip the title and countdown), `manual=1` (the sim only advances through `stepFrames` / `runSegments`).
Keys: A/D or arrows lane, Space/W jump, S slide, Shift surge, E fly (WASD steers), P/Esc pause, M mute, R/Enter run again.
Touch: swipe left/right for lanes, tap or swipe up to jump, swipe down to slide, buttons for surge, fly and slide.

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

Presentation added on top of the simulation (the sim is untouched and the replay still matches to 1e-6): a title screen
with runner select (three colourways; the original's select also changes hazards and the power name, which is not
ported), a 3-2-1 countdown, a pause screen, a results screen with the best score kept in `localStorage`, the
fall presentation (the runner tumbles through the cloud deck) and the leap at the end of the road (a jump arc
off the tail, then the results). The simulation stops when the run leaves `run`, so those two are camera and
pose animation driven by a render-side timer, not extra simulation.

Not ported (the original continues past these):

- the Hell run (ogre and portal) that follows a fall, the planet training, the lookout, the office and the road home;
- the return leg of the route (`leg: "back"`);
- the original's character-select gameplay differences, saved runs and the particle systems the look spec lists
  (rain, splash): bursts and sparks here are this port's own.

## Documented divergences

| Area | Original | Port |
| --- | --- | --- |
| Assets | GLB avatars (hero, ogres, minions) animated with `SkeletonUtils` | The runner is a catalog CC0 humanoid (a different character, tinted per colourway; base-colour tint cannot turn its green outfit orange) with Sprint/Jump/Crouch/Idle/Hit clips and a body pitch for flight and fall; props are built from engine primitives (`ENTITY_PARTS` in `world.ts`) |
| Sky and clouds | Violet gradient with white star points over a ray-marched golden cloud deck | The same idea in this port's own shader: gradient, ~2 px star points, and a 22-step front-to-back march through a lobed height field with a sun-shadow tap, fine grain and a lavender horizon haze. No sun disc, wisps or puffs (the original has none) |
| Aura | Two `ShaderMaterial` shells | The same blade-tier fragment maths on two cylinders; uniform `time` is `auraTime` (a uniform named `time` lowers to the engine's reserved `u_time`); the shell now tilts with the body in flight |
| Road | Toon-shaded scale texture | Ring ribbon with a plate/bevel pattern that fades with screen-space derivatives, faint pearl sheen and lavender feather streaks on the flanks; a missing plate leaves a hole one sample wider than the original's `gap` window |
| Lighting | `MeshToonMaterial` + directional/hemisphere/point lights | Custom materials are unlit: the toon ramp, hemisphere tint, rim light and linear fog (430..1010 to the measured `#f2c6de`) are evaluated inline |
| Post | Speed-line streak pass; the look spec records no composer | A faint bloom and FXAA from `effects.*`; world-fixed streak nodes only while surging or flying |
| Camera | fov 62, pitch about -0.11 rad, close behind the runner | Same fov; chase offset 7 m back and 3.4 m up (was 10 / 4.2), look-ahead 12 m, so the runner fills about 40% of the frame height as in the reference |
| HUD | Portrait card with segmented bars, km progress bar, days and score cards, pause button, stage title in a display face | Same layout with generic art (no portrait, no display face): segmented spark and strain bars, progress bar, days and score cards, pause button, stage banner |
| Audio | Not recorded by the look spec | Synthesised one-shots only (pickup, jump, land, hit, surge, flight, fall, fanfare) |
| Ink outlines, ground-contact shadow | Present | Contact shadow blob only; no outlines |

## Engine findings

None blocking; no engine source was changed for this pass. Notes for authors of `material.custom` shaders:

- A uniform named `time` lowers to the reserved `u_time`; the engine rejects it at authoring time (the aura uses `auraTime`).
- Custom vertex attributes passed to `geometry.dynamic({ attributes })` are declared in the vertex stage as `attribute <type> <name>;`
  (the road's `crossProfile` carries the cross-section so lanes and edge lights are placed in road coordinates).
- `fwidth` is available in the fragment stage and is what keeps the plate pattern from aliasing at distance.
- Transparent materials cannot keep `depthWrite`; a back-face-culled transparent surface needs counter-clockwise winding from outside.
- `TypedGLBActor.setTint` multiplies the model's base colour, so it cannot recolour a green outfit to orange; an emissive wash only approximates it.
- `handle.setScale` takes one number or one `[x, y, z]` array, not three arguments.

## Meshy art pass (2026-10-23)

Generated through Kiro Prism from original text prompts (never from images of the original; no franchise names in prompts), admitted with
`aura3d assets import-meshy` in an isolated temp project (`validate --require-license`: no failures) and shipped under `assets/` (provenance:
`assets/ATTRIBUTION.md`, `assets/provenance/*.rights.json|meta.json`). Loaded in `models.ts` with a same-origin pathname + sha256, the only form the
production bridge accepts.

- **Runner** (`runner.glb`, 4.6 MB, 20k vertices): text-to-3D A-pose, remeshed to 12k triangles (5 credits), rigged (5), plus six animation actions
  (3 each). The rig returns a skeleton of 24 joints with a basic run clip; the other clips are separate GLBs, merged into one file by a small
  gltf-transform script (same joint names, 66 channels each). Clip mapping in `world.ts`: run, idle, jump (`Regular_Jump`), slide (`slide_light`),
  flight (`Leap_of_Faith`; the library has no flying clip, the world's pitch does the rest), dive and hit. It still goes through `cloneSkinned` and
  falls back to the procedural figure.
- **Entities as one model each** (pool sizes shrank to keep draw calls down: arch 8, barrier 16, oni 12, sweeper 6, feast 6): gate, barrier, ogre, cart, feast.
  The simulation never reads pool sizes (a full pool only hides the farthest props).
- **Decor**: ten roadside lantern posts recycled in pairs along the verge and six drifting floating islands.
- Not used: `crystal.glb` (generated, 30 credits, not admitted).
- Meshy facts worth knowing: `make` is 30 credits (20 preview + 10 refine); the rigged GLB is 21 MB raw (1024 px textures bring it to 4.6 MB with
  all clips); text-to-3D output comes back with 0.2-4 M vertices, so every static prop needs `optimize.mjs` (a second pass for the island).
