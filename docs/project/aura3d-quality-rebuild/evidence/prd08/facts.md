# Lane 08 facts (C-40 handoff)

Facts PRD 13 writes skills/templates/recipes from. Mirrors CONTRACTS Appendix B rows F-08-*.
Everything below is behind `A3D_QR_CAMERA` (and sub-flags); flag-off behaviour is unchanged.

## F-08-1 — Rig-by-genre table (PRD-08 §6.4)

| Rig | Use (games) | Key behaviour |
|---|---|---|
| `chase` | turbo, courier, pulse-tunnel, deep-recovery, siege-golf flight | arm-space damping (yaw/dist springed, not eye); velocity look-ahead `clamp(v·seconds, max)`; speed-aware distance/FOV; collision; framing solver; reads `subject.telemetry.vLong`/`lateralG` when a vehicle handle provides them |
| `flight` | patrol-wing | full-orientation follow; bank = subject roll × `bankGain` (0.6) springed; `horizonLock` 0..1 |
| `follow2d` | skyline-runner, platformer kit | side-scroll dead zone, platform-snap Y, forward lead; platformer kit default, `framing.subjectHeightFraction: 0.28` |
| `fighting` | aura-clash, mech-hangar | side-on midpoint; solves both fighters inside left/right safe band; distance-zoom only; stays on fight plane |
| `shoulder` | character-controller | `createShoulderCamera` parity (1e-6) + collision |
| `orbit` | viewers, bank-shot aim | yaw/pitch springs, pitch limits, `bindOrbitPointer` |
| `topDown` | neon-swarm, orbital-defense, blockfall | fixed pitch, centroid dead zone, arena-edge clamp |
| `altitude` | aurora-lander | altitude → distance/FOV bisection fit; goal lead; subject 8–12 % frame height |
| `rail` | cinematics, results, flyovers | arc-length Catmull-Rom position + look-at (node/point/spline) + FOV tracks, ease curve |
| `static` | vault-breakers, overviews | fixed pose; still receives layers |

Framing solver shared by chase/fighting/altitude/topDown/follow2d:
`d = h / (2·tan(f/2)·p)`. Defaults: chase `p=0.22`, fighting `p=0.5`, altitude `p=0.10`, follow2d `p=0.28`.

API: `app.camera.use("chase", {...})` / `app.camera.addLayer(...)` / `rig:setPose/setFov/setRoll` (C-22).
Evidence: `tests/qr/prd08/unit/camera-rigs-view.test.ts`, `camera-fromspec-parity.test.ts`.

## F-08-2 — Feel presets (PRD-08 §14 / F-3)

`app.feel.preset("racing" | "platformer" | "fighting")` defines the preset event table:

- racing: `boost` (punch fov −3/dolly 0.22, haptics 0.4/0.2/60), `drift`, `collision`, `lap`, `spinout`
- platformer: `jump`, `land` (strength = impactVelocity / terminal), `collect`, `hurt`, `checkpoint`
- fighting: `hit-light`, `hit-heavy`, `ko`, `block`, `whiff`

Combat moves map via `emitCombatFeel` (`agent-api/feel/combatFeel.ts`):
`whiff → "whiff"`, `blocked → "block"`, `ko → "ko"`, else `strength < 0.5 → "hit-light"`, `≥ 0.5 → "hit-heavy"`.
The fighting kit (lane-05 `game-kits/fighting.ts`) calls this from hit resolution when a feel bus is bound.

`app.feel.emit(name, { position, actors, strength })` routes channels:
`shake`/`punch` → camera, `hitStop` → `app.time`, `haptics` → navigator.vibrate/gamepad actuators
(opt out: `haptics: false` on the feel extension), `audio` → bound `GameSound.play`
(`rate ∈ 1 ± pitchJitter`, position passthrough), `vfx` → effects, `screen` → §8.3 uniforms.

API: `app.feel` (C-23). Evidence: `feel-bus.test.ts` (**does not exist — status: claimed**, P-52, tracked in 08-SPEC),
`feel-audio-dispatch.test.ts`, `camera-feel.test.ts`.

## F-08-3 — `app.time` usage

`app.time` is the fixed-step time controller (C-23): `advance(dt)` drives the game loop,
`hitStop(seconds, { scope })` freezes gameplay time while render keeps ticking,
`timeScale(channel)` for named channels. Use `app.time` for gameplay dt; never `performance.now()`
inside fixed steps. Render-side interpolation alpha lives on `controller`/frame loop — visual poses
come from `presented()` poses, not raw physics state.

API: `app.time` (C-23). Evidence: `time-controller.test.ts`, `frame-loop.test.ts`.

## F-08-4 — Touch kit usage

`createGameInput` registers a `touch` virtual device (`input.touch.press/release/setAxis`).
`mountTouchControls(app, input, layout, options?)` mounts a DOM overlay sibling of the canvas:
one element per `GameTouchControlRegion` (≥ 48 CSS px, `aria-label`, `env(safe-area-inset-*)`,
pointer capture; sticks drive `VirtualTouchJoystick` → `move:x`/`move:y` axes).
`autoHide` (default true): shows on first `touchstart`, hides on keydown/gamepad.
`input.activeDevice()` → `"keyboard" | "pointer" | "touch" | "gamepad"`;
`input.prompt("jump")` → `Space` / `A` / `Jump` style labels for HUD.
Per-action `bufferMs` (record or number) + `input.consume(action)`; defaults jump 130 / attack 150 / other 120 ms.

API: `createGameInput`, `mountTouchControls`, `createGameTouchControlLayout`.
Evidence: `touch-controls-mount.test.ts`.

## F-08-5 — Screen-feel reference behaviour (for PRD 03's C-13 pass)

The feel extension registers frameGraph contributor `prd08.screenFeel` (collect phase) which writes
`blackboard.set("prd08.screenFeel", AuraScreenFeelUniforms)` under `A3D_QR_CAMERA`.
A consumer post pass reads it and MUST set `blackboard.set("prd08.screenFeel.consumed", true)` on frames
it applied; Low tier applies flash + vignette only (chroma/radialBlur count 0).
When no consumer exists, `screenFallback: "dom"` renders flash/vignette as DOM overlay.

API: `AuraScreenFeelUniforms` = `{ flash, chroma, radialBlur, vignette }` + `kind "aura-screen-feel-uniforms"`.
Evidence: `feel-screenspace.test.ts` (**does not exist — status: claimed**, P-52, tracked in 08-SPEC); the
camera-feel unit suite covers the blackboard write + DOM fallback. Reference in PRD-08 §8.3.

## F-08-6 — Forbidden pattern: evidence-only feel

Never write shake/punch/director output to *evidence only*. Any value returned by `.update(`/`.follow(`/`.snap(`)
on an object created by `camera.shake`, `camera.punchIn`, `game.cameraRig`, `game.cameraDirector` or
`gameFeel.create` must reach the presented view (rig/layer/pose) — counting it in `effectsSpawned`-style
counters without rendering it is the "evidence-only feel" anti-pattern and is linted (F-7 rule `feel/evidence-only`).
Also forbidden inside lane code: `Math.random()` (use deterministic `hashString` jitter), writing to
`agent-api/index.ts` (lane-15), and importing lane barrel values across the engine→rendering boundary.
