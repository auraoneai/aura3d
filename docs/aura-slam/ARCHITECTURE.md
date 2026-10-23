# Aura Slam 3D: native Aura3D port, architecture and module contract

Status: 2026-10-23, written by the `slam-architect` lane. Contract code: `examples/aura-slam/contract/` (types plus tiny pure helpers, typechecks standalone; import from `./contract`).

## 1. What we are converting

Live Aura Slam (`apps/showcase-top-tennis`) is a ~3.3 MB pre-existing browser tennis game under `public/toptennis/` with an Aura3D **renderer adapter** (`src/main.ts`, 1,808 lines) bolted on: the adapter builds the scene (PBR boxes/cylinders, 4 lights, bloom/vignette/colour-grade), poses two procedural athletes and projects to the HUD; everything else is the original JS. Goal: a native example `examples/aura-slam/` + wrapper `apps/showcase-aura-slam/` with the same behaviour and look, built on public `@aura3d/engine` and library kits, swapped in for the live route only after parity gates pass.

Key finding that makes this tractable: **the original simulation is already pure.** `match-engine.js` ("No DOM, clocks, network, or rendering dependencies") plus `physics.js`, `strokes.js`, `player-pose.js`, `controls.js`, `mobile-swipe.js` are hand-written UMD modules, deterministic (draws come from `seeded(index)`), with a plain-JSON `state`, `step(dt)`, `applyInput(side, frame)`, `snapshot/restore` and an `onEvent` stream. Porting is transcription to typed TypeScript plus a rendering/UI shell, not reverse engineering. The live page also already exposes QA hooks (`window.render_game_to_text`, `window.advanceTime(ms)`, `window.__TOP_TENNIS_CONTROL__`), which the capture agent uses.

Unit system (see `contract/units.ts`): the sim uses normalised court units (metres per unit x 5.018, y 11.885, z 2.177; gravity 9.81/2.177; drag 0.09; net 0.914 m centre / 1.07 m posts). The renderer uses a different visual scale (5.5 x 8) and the physics file converts at the boundary. Preserve both exactly.

## 2. Source inventory and where each piece goes

| Source (bytes) | Role | Phase | Target module |
| --- | --- | --- | --- |
| physics.js (14.6 KB) | ball flight, bounce, net/tape/boards, serve solver, line calls | 1 | M-PHYSICS |
| strokes.js (5.7 KB) | stroke selection, pace profiles, lob plans | 1 | M-STROKES |
| match-engine.js (147 KB, 2,714 lines) | rules, serve state machine, rally, CPU AI (5 levels), energy/power, swipe shots, snapshot/restore | 1 | M-RULES + M-AI (one factory) |
| controls.js (8.7 KB), mobile-swipe.js (4.7 KB), pollers in game.js | key/gamepad bindings, validation, persistence, gesture classifier | 1 | M-INPUT |
| player-pose.js (10 KB) + athlete rig in main.ts (~450 lines) | procedural IK pose and rig | 1 | M-POSE |
| main.ts scene/venue/lights/post (~1,100 lines) | courts, 6 venues, camera, spectators, post | 1 | M-RENDER |
| tennis-audio.js (6.3 KB) + racket/bounce wavs | impact sounds with surface filtering and pan, tones | 1 | M-AUDIO |
| game.js (92 KB, 1,506 lines) | DOM HUD, scoreboard, serve feedback, speedometer, pause, loop, QA hooks | 1 | M-HUD, M-SHELL (loop/hooks) |
| menu-flow.js (39 KB), match-results.js (3 KB), styles.css (41 KB) | start menu, venue/difficulty pick, results | 1 | M-MENU |
| tour-guest.bundle.js (1.7 MB), tour-client/hub (51 KB), tournament*.js (25 KB), tour-catalog (3 KB), tour-engine-loader | tour and tournament mode | **2** | deferred |
| online-client.js (26 KB), multiplayer-build.js (4 KB) | online play and lobbies | **2** | deferred (needs server) |
| player-roster.js (6.8 KB), player-appearance.js (2 KB), player-characters.js (4 KB), player-select.js | roster, appearance, character select | **2** (sim keeps profile hooks) | deferred UI; data tables ported with M-RULES |
| games-played.js, analytics.js, admin-session.js, pwa.js, seo-home.css | telemetry, PWA, SEO | out of scope | not ported |

Phase 2 boundary: tournament/tour/online/appearance-select screens are separate products on top of the same engine (they call `TennisEngine.create` with `eventId`, `roster`, `appearance`, `online`). They need server endpoints and a 1.7 MB bundle whose source we do not need to match for parity. Phase 1 keeps the engine options (`eventId`, `roster`, `appearance`) in the types so Phase 2 plugs in without touching the sim.

## 3. Module boundaries and file ownership (disjoint)

All native code lives under `examples/aura-slam/`; tests under `tests/unit/aura-slam/`, browser specs under `tests/browser/aura-slam-*.spec.ts`. One agent per module; nobody edits another module's files. Contract files are owned by this lane and changed only by PR to `contract/` (additive).

1. **M-PHYSICS** owns `sim/physics.ts`. Port physics.js function-for-function against `PhysicsKit`; keep every constant and iteration count (the serve solver bisects 36 times; `solveShot` steps 0.025 s up to 140 times). No Math.random.
2. **M-STROKES** owns `sim/strokes.ts`. `StrokeModel`.
3. **M-RULES+M-AI** owns `sim/engine.ts`, `sim/ai.ts`, `sim/serve.ts`, `sim/scoring.ts`, `sim/swipe.ts` (split the one 2,714-line factory by concern; keep a single `createMatchEngine` facade). Scoring: `MATCH_RULES` in contract (4 points by 2, first to 3 games by 2, 3-3 tiebreak to 7 by 2, point result delay 1.65 s). AI per `DIFFICULTY_LEVELS` plus pro/legend tactics, CPU styles, net tactics (offline only). Online-mode branches are dropped (Phase 2) but option stays typed.
4. **M-INPUT** owns `input/mapper.ts`, `input/bindings.ts`, `input/swipe.ts`, `input/gamepad.ts`, `input/keyboard.ts`. Same storage keys and validation rules (reserved KeyP/KeyF, primary + optional alternate key, controller buttons 0-7, 10, 11).
5. **M-POSE** owns `view/pose.ts`, `view/athleteRig.ts`. `AthletePose` pure; rig builder returns scene nodes and handle struct.
6. **M-RENDER** owns `view/scene.ts`, `view/venues.ts`, `view/lighting.ts`, `view/camera.ts`, `view/ball.ts`, `view/spectators.ts`, `main.ts`. Only module importing engine scene nodes. Fixed camera: eye [0, 25.5, 37.1], target [0, 0, 0.7], fov 15. Lights: ambient `#dce8f2` 0.62, hemisphere, directional, point; post: bloom 0.14/0.86/0.45, vignette 0.18/0.65, colour grade 1.05/1.08. Must not use `material.custom` shaders without the NaN-safe `pow` chunk; must produce no empty instance arrays.
7. **M-AUDIO** owns `audio/audio.ts`. Impact sounds from recorded wavs (racket/bounce, three takes each, 240 ms slices, lowpass by surface, stereo pan from x, gain from speed/vertical speed) loaded through the library audio package; tones and fallback via the synth cue kit (`createCueBank`, landed in `packages/audio/src/synth`). Single `AudioContextManager` owner; mute key and first-gesture unlock come from the kit.
8. **M-HUD+M-MENU+M-SHELL** owns `ui/hud.ts`, `ui/scoreboard.ts`, `ui/serveFeedback.ts`, `ui/results.ts`, `ui/menu.ts`, `ui/styles.css`, `shell/loop.ts`, `shell/qa.ts`, `index.html`. The loop accumulates real time into `FIXED_DT`; QA hooks keep the existing names (`QaHooks`).

Dependency rule: sim modules import only `contract/` and each other (`rules -> strokes -> physics`); view/ui/audio import `contract/` and read `MatchState`/`SimEvent`. Nothing in `sim/` imports DOM or `@aura3d/engine`.

## 4. What becomes library, what stays game code

Checked against `packages/engine/src/agent-api/game-kits/racketSports.ts` (248 lines, `game.racketSports()`: `directionToEulerXYZ`, `orientCylinderBetween`, `solveArmElbow`, `localToWorld`, `localDirToWorld`, `stepBallPhysics`), `packages/game` (HUD kit, touch controls, juice, session; private until WP-1 publishes it), `packages/audio` (synth kit landed, `AudioContextManager`), `packages/animation`.

| Candidate | Overlap | Decision |
| --- | --- | --- |
| Ball flight and bounce kit (`physics.js`) | `racketSports.stepBallPhysics` is a different, approximate model (Magnus, restitution 0.75, metre units) | **Extract** as `game.racketSports().ballFlight({ units, gravity, drag, surfaces, net, boards })`: exact event-time integration, serve/shot solver, line calls. Keep `stepBallPhysics` and document it as the simple model; add a deprecation pointer. Tennis port is the proof. |
| Tennis scoring engine | none | **Extract** `game.racketSports().scoring({ pointsToGame, winBy, gamesToMatch, tiebreak })`: pure state machine, serve rotation, tiebreak. |
| Serve/rally state machine | none | **Extract** with scoring as `rallyFlow` only after the port is green; the toss/windup/timing windows are tennis-specific and stay game code. |
| Procedural athlete rig + IK | overlaps `solveArmElbow`, `orientCylinderBetween` (reuse, do not duplicate) | **Extract** `game.racketSports().athleteRig` (hip/knee/foot stride cycle, split step, slide) on top of those helpers; costume/appearance stays game code. |
| Court prefab builder | none (`sceneKits` has no tennis court) | **Extract** `prefabs.tennisCourt({ surface, lines, net, boards })`; venue palettes stay game code. |
| AI opponent framework | none | **Extract** only the interface shape (`AiController`: steer/planShot/planServe, difficulty table, seeded draws) as a documented pattern; tennis tactics stay game code. |
| Input binding store (validate, persist, reserved keys) | `packages/game` session/touch partially | **Extract** to the game kit as `createBindingStore`; swipe classifier stays game code unless a second game needs it. |
| Impact sound bank with surface filtering | synth kit has cues, not recorded-sample slices | **Extend** synth kit with `sampleSlices` (N takes per sprite, no consecutive repeat); content stays game code. |
| HUD scoreboard/serve meter/speedometer | game kit HUD (private) | **Reuse** via WP-1; add `scoreboard` widget there if missing. |
| Menus, venue palettes, copy, rosters, AI tactics | none | stays game code |

Extraction order: only after the module is green against the reference. The native sim imports the library kit once it exists; until then it uses its local copy behind the same interface, so the swap is mechanical.

## 5. Test and parity plan

Reference: `evidence/aura-slam/reference.json` (schema `contract/reference.ts`, produced by the `slam-ref` agent by driving `TennisEngine.create(...).step(1/60)` with a scripted input run per difficulty and venue, plus one in-browser run through `advanceTime` to prove the node and page agree; >= 2 sessions give a data-derived tolerance, expected ~1e-9 because the engine is deterministic). Frames: `evidence/aura-slam/frames-reference.json` (per-venue 1280x720 frames at fixed ticks from the live page; originals stay local/gitignored, metrics are committed).

Gates (all must pass before the swap):
- **G1 sim replay**: `tests/unit/aura-slam/replay.test.ts` replays the script and matches every checkpoint field, event log and final score within tolerance, for all five difficulties and the grass/clay/hard surfaces. Also snapshot/restore round trip and `seeded` bit equality.
- **G2 module parity**: per-module differential tests against the source scripts loaded as data in Node (UMD `module.exports`): `physics.sample/solveShot/serveTrajectory/advance` over a grid of inputs, `strokes.*`, scoring over scripted point sequences incl. tiebreak, `classifyGesture`, `validateBindings`, pose output for a pose-state grid. Tolerance 1e-12 for pure functions.
- **G3 render parity**: remote headed-xvfb run (WebGL2) at fixed ticks per venue; compare against `frames-reference.json` using luma/RGB histogram JSD <= 0.05, edge density ratio 0.9 to 1.1, mean luma delta <= 4 and a pixel-diff gate on the court-line mask (the lines, net and ball must align within 1 px at 1280x720). Same camera, lights and post; the native scene should be near-identical because the adapter is ported, not redesigned.
- **G4 input/UX**: remote spec drives the page with real key events and a synthetic swipe: serve, rally and score a point; asserts HUD updates, pause, rebinding persists, mobile swipe fires a shot.
- **G5 live safety**: `?diag=1` shows no shader failures; black-frame self-heal enabled via the safety net; drawCalls > 0; no console errors; asset URLs return 200; works on a real GPU per the owner's check (software GL cannot prove this).
- **G6 size/perf**: new route JS <= the current route (tour bundle excluded in Phase 1), no `tour-guest.bundle.js`, draw calls <= 150.

Build and merge order (modules can proceed in parallel against the contract, merge in this order): physics, strokes, rules+AI (needs 1 and 2), input, pose, audio, render (needs pose), HUD/menu/shell (needs all), then the wrapper app and live swap behind a route flag. Library extraction follows, one kit per PR, each with the port migrated and the replay tests unchanged.

## 6. Risks

- The sim is large (2,714 lines of dense tactics): transcribe mechanically, test against the original with differential tests before refactoring; do not "clean up" behaviour.
- Real-GPU rendering is unproven from software GL; the safety net and `?diag=1` are mandatory in the wrapper.
- The three.js-era `renderer.bundle.js` and `renderer_custom.js` under `public/toptennis/` appear unused by the entry; confirm and delete in the swap PR.
- Tournament/online code reads engine internals (`eventId`, `online`, `view(snapshot, side)` mirroring); keep `view()` in the engine API surface even though Phase 1 does not use it.
