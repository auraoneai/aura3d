# Splat Rush on Aura3D: porting notes

Port of the Crayon game "Splat Rush" (three.js r184, one 43 KB inline module, no separate bundle) onto the public
`@aura3d/engine` API. Source of truth: `tests/fixtures/crayon/splat-rush/game-module.formatted.js` (captured, untrusted data;
see its `PROVENANCE.md`). Reference: `evidence/crayon-capture/splat-rush-reference.json` and `...-death.json`.

## What is exact

`sim.ts` is a literal port of the original's per-frame function, with no DOM, three.js or engine imports. Replaying the recorded
input of the original through it reproduces **every field of every step** of the captured run (score, distance, speed, lives,
combo, multiplier, lane offset, colour, ball scale, timers, milestone, player and camera position, entity counts) **and the
random-draw count**, which is the strongest evidence that the draw order matches:
`tests/unit/splat-rush-port/reference-replay.test.ts`.

How the port stays in lock-step with a game that mixes gameplay and visual randomness in one `Math.random` stream:

- The capture hook splits `Math.random` into a **game stream** (calls made from the game's own module: gate colours, power-up type
  and lane, particles, camera shake, cloud and rain-streak seeds, canvas textures) and a **library stream** (three.js draws four
  numbers per object UUID; the boot runtime). `sim.ts` consumes the game stream in the original's order, including the 1,210 init draws.
- Object pools skip spawns, and therefore skip draws, when exhausted, exactly as the original does: 20 splatters, 30 gates, 10
  power-ups, 90 particles, 220 road segments.
- Time is three's `Clock` under the harness's virtual `performance.now()`: the module-eval frame has dt 0 and frame n uses
  `(virtualNow(n) - virtualNow(n-1)) / 1000`.
- Input is the original's pointer model: `pointerdown` on the splash starts the run (no drag), later `pointerdown` begins a drag,
  `pointermove` moves the steering target by `0.012 * dx * (STEER_SPEED / 6)` clamped to the lane, `pointerup` ends it.

Position and camera floats differ from the original by at most about 1e-15 across CPU architectures (the reference was recorded on
x86-64 Linux; V8's `Math.sin` can differ in the last place on ARM), so the test compares them at 1e-9 and everything else exactly.

## How original constructs map to the engine

| Original (three.js) | Port |
| --- | --- |
| `WebGLRenderer`, `Scene`, `PerspectiveCamera`, `Clock` (via `playlabs-boot`) | `createAuraApp` + `scene()` + `camera.perspective` + `app.camera.setPose`; the clock is emulated in `sim.ts` |
| `MeshToonMaterial` (all surfaces) under `HemisphereLight` + two `DirectionalLight`s | one `material.custom` toon program (`shaders.ts`): three's default two-step ramp and the same three lights, in GLSL 300 es |
| `SphereGeometry`, `CapsuleGeometry`, `ConeGeometry`, `CylinderGeometry`, `BoxGeometry` | exact-dimension generators in `meshes.ts` -> `geometry.dynamic` (a unit test pins each dimension) |
| `ExtrudeGeometry` splatter blob | flat bezier-sampled blob + the two small discs (no bevel) |
| `CanvasTexture` ball and ramp | `texture.canvas`, painted from the **values the simulation drew** (`sim.paint`), so the canvases are the original's |
| `InstancedMesh` road (deck, rails, lane marks) | three `geometry.dynamic` batches whose `position`/`normal` are rewritten in place each frame (`handle.updateAttribute`) |
| `InstancedMesh` clouds (merged 5-sphere puff) | 56 nodes sharing one merged puff mesh |
| `MeshBasicMaterial` sky sphere (gradient canvas) | `material.custom` sky shader evaluating the same 4-stop gradient per view direction |
| pooled `Group.clone()` gates, power-ups, splatters, particles | pooled runtime nodes (`app.nodes.require(id)`) with `setPosition/setScale/setVisible/setUniform` |
| DOM HUD, splash and game-over cards | the same DOM structure and styling (`index.html`, `main.ts`) |

## Honest differences (none affect the simulation)

- **Audio is not ported.** The original synthesises music and effects with Web Audio; the capture removes `AudioContext` because its
  noise-buffer fill draws a sample-rate-dependent number of random values. The port has no sound.
- **Look**: the toon ramp, lights, colours and geometry dimensions match, but this is not pixel parity: screen-space flash and vignette overlays (DOM `mix-blend-mode`) and the bevel on the
  splatter blob are not reproduced. There are no shadows to reproduce: the key light is set to cast them, but no mesh in the game
  sets `castShadow` or `receiveShadow`.
- **Platform SDKs** (`AstroSDK`, `CrazyPort`, leaderboard, saved best score) are absent; the game-over card shows the score only.
- The rendered frame is verified for content (sky, deck, gates, ball) on a software-WebGL2 remote runner, not compared pixel by pixel.

## Engine surface used

`material.custom` (GLSL), `geometry.dynamic` + `updateAttribute`, `texture.canvas`, runtime node handles, `app.camera.setPose`,
`createAuraRouteHealthSnapshot` (parity IDs `SH-02 SG-05 SG-01 ST-01 ST-02 R-23`). No imports from `@aura3d/rendering`, no
`TODO(a3d-migrate)`.

## Running

- Unit tests (local): `pnpm vitest run tests/unit/splat-rush-port tests/unit/tooling/crayon-capture-splat-rush.test.ts`
- Browser spec (remote only): `SPECS=tests/browser/splat-rush-port.spec.ts tools/remote-acr/run.sh`
- Lab: `/examples/splat-rush-port/?autostart=1&autopilot=1` (add `manual=1` for stepping through `window.__AURA_SPLAT_RUSH__`).
- Re-record the reference: `evidence/crayon-capture/README.md` (Splat Rush section).

## Art and presentation pass (2026-10-23)

Simulation untouched (reference replay still exact). Added, all presentation-only:

- `audio.ts`: Web Audio synth on the shared `AudioContextManager` (132 BPM arpeggio + bass, one cue per event); events come from `diffSounds(prev, next)` over observed state, never from the sim. M or the corner button mutes (persisted).
- `fx.ts`: DOM screen effects: colour flash, circular burst reveal, combo-driven vignette.
- Results card: 800 ms score count-up, persisted best score, solid ball-colour backdrop, gold play-again button; keyboard play (Space/Enter, arrows or A/D).
- `world.ts`: hard-edged contact shadow offset away from the key light (the original's shadow map), deck base colour fixed to white (it was squaring the cream map), so the road reads as white like the original.
- HUD: glossy lives, GT Walsheim Bold (`assets/GT-Walsheim-Bold.woff2`, licensed font library) for HUD, popups and cards; popups now lay out in a column (cannot overlap), expire via CSS animation; title and cards scale to short viewports.
- No 3D outlines: the measured original has none.

Frame comparison and blind judge: `tools/crayon-capture/splat-rush-frames.ts` (original, remote), `tests/browser/splat-rush-frames.spec.ts` (port, remote), `tools/crayon-capture/splat-rush-judge.ts`; results in `evidence/splat-rush-port/`.
