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

- `audio.ts`: Web Audio synth built on the `@aura3d/audio` synth cue kit (shared `AudioContextManager`) (132 BPM arpeggio + bass, one cue per event); events come from `diffSounds(prev, next)` over observed state, never from the sim. M or the corner button mutes (persisted).
- `fx.ts`: DOM screen effects: colour flash, circular burst reveal, combo-driven vignette.
- Results card: 800 ms score count-up, persisted best score, solid ball-colour backdrop, gold play-again button; keyboard play (Space/Enter, arrows or A/D).
- `world.ts`: hard-edged contact shadow offset away from the key light (the original's shadow map), deck base colour fixed to white (it was squaring the cream map), so the road reads as white like the original.
- HUD: glossy lives, GT Walsheim Bold (`assets/GT-Walsheim-Bold.woff2`, licensed font library) for HUD, popups and cards; popups now lay out in a column (cannot overlap), expire via CSS animation; title and cards scale to short viewports.
- No 3D outlines: the measured original has none.

Frame comparison and blind judge: `tools/crayon-capture/splat-rush-frames.ts` (original, remote), `tests/browser/splat-rush-frames.spec.ts` (port, remote), `tools/crayon-capture/splat-rush-judge.ts`; results in `evidence/splat-rush-port/`.

## Meshy model pass (2026-10-23)

Presentation only; `sim.ts` and the reference replay are untouched. Seven Meshy text-to-3D models (prompts, task ids, sizes in
`assets/ATTRIBUTION.md`; rights basis in `assets/provenance/*.rights.json`), generated through Kiro Prism, optimised to ~10-26k
vertices and 1024 px textures, admitted with `assets import-meshy` and wired through same-origin pathnames + sha256 (`models.ts`).

- `backdrop.ts`: 12 floating islands (tree, tower) and hot-air balloons drift past both sides of the road at 0.55x the road's scroll
  speed, follow its curve, and scale in/out at the far/near ends. Placement is a pure function of the sim's `distance` and
  `elapsed`; it never touches the sim or its random stream. A hemisphere + two directional lights light them (the toon surfaces
  carry their own lighting, so the gates, road and ball are unchanged).
- `pickups.ts`: the sphere-and-cone power-ups are replaced by one model per type (rainbow star gem, shield badge, x2 gold coin,
  colour-swap token), pooled 4 per type; the sim still owns type, lane and height. Gates, ball, splatters, road, rails and sky stay
  procedural (the original's gates are colour-coded gameplay objects tinted by uniform).
- Cost: +~6 MB assets (7 GLBs), draw calls 105-201 at 640x360 (was 85-178).

## Audit fixes (2026-10-29, lane G16)

Rows from `docs/audits/sections/game-16-splat-rush-port.md`. Parity notes first: these two change behaviour the original
has, in cases the recorded reference never reaches (`reference-replay.test.ts` still matches every field of every step).

- **C16 gate rows resolve once.** Lanes are 2.3 apart and a gate reaches 1.2, so within 0.05 of a lane boundary the
  original applied a match and an OUCH in the same frame. The port now resolves a row against its nearest gate only.
  Outside the overlap at most one gate is in reach and it is the nearest, so scores and random draws are unchanged.
- **C4 restart re-centres.** `begin()` resets the steering target `ye` and the drag flag. The original kept them, so the
  ball drifted towards the last run's lane after PLAY AGAIN. Runs started from the splash already had both at 0.

Presentation only (the sim and its trace are unchanged):

- **C2** popups carry a monotonic `seq`; the HUD drains by `seq`, so popups (and the PERFECT cue and flash) no longer stop
  once the 64-entry list is full.
- **C6** the milestone plays the original's four-note arpeggio and a gold 0.5 flash.
- **C7** optional colour symbols (C key or the splash toggle): red circle, yellow triangle, blue square, purple cross, on
  each gate and over the ball.
- **C8** reduced motion (follows `prefers-reduced-motion` until changed): flashes capped at 0.1, no vignette, no FOV
  punch, and a chase camera without the shake.
- **C9, C10** gates, splatters, particles, clouds and streaks draw as one batch each. Road entities live in a scrolling
  frame (`sim.scroll`), so their vertices are written once; the HUD touches the DOM only when a value changes.
- **C11** model maps re-encoded at 512 px (backdrop) and 256 px (pickups); geometry is byte-identical.
- **C14** `warmPrograms` runs before the first frame with the pooled pickups and overlays parked in view.
- **C15** the engine sizes the canvas at `min(devicePixelRatio, 2)`; a slow first 90 frames of play drops it to 1.
- **C17** P or Esc pauses; a hidden tab pauses the run and suspends the audio context.
- **C18** a ring marks the matching gate during the first run; the results card adds best combo, perfects and distance
  on a translucent wash; the HUD respects safe-area insets.
- **P-01** the toon shader rolls off above 0.82, so up-facing surfaces keep detail instead of clipping to white.
