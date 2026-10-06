# PRD 08 — Camera / Controls / Game Feel

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed, parallelized against `CONTRACTS.md` (2026-10-05). Lane: **08**, flag `A3D_QR_CAMERA` (sub-flags
`A3D_QR_CAMERA_LOOP`, `A3D_QR_CAMERA_INTERPOLATION`). Provides contracts **C-22** (CameraRig live API) and **C-23**
(time controller, feel bus, screen-feel uniforms). Owned paths are exactly CONTRACTS §4.1 row 08 (listed in
"Parallel execution" below). Audio (`packages/audio`, `packages/engine/src/game/GameAudio.ts`) is PRD 09's (R17,
C-25); templates and skills are PRD 13's (R20, C-40); game routes are PRD 14's (R21). This PRD reaches them only
through contracts or non-blocking requests (CONTRACTS §6.5), and never waits on another lane.

Evidence base: research `10-camera-controls-gameruntime.md` (primary), `16-route-local-extraction.md` rows 2/3/8/16/17,
`17-games-g1..g5.md`, `18-completeness-critic.md` C12, `19-claim-verification.md`, `20-game-scorecards-code-pixelstats.md`
(non-visual categories: game_feel, controls, physics_feel, sound_audio, performance), `21-game-vision-judgment.md`
(authoritative for camera / composition / polish_juice / mobile_presentation), capture report
`evidence/games/report.slim.json` (GH Actions run 37289688772, macos-14, ANGLE Metal paravirtual GPU, sha `c08d8acb`).

Rule for this PRD: an API that computes a value is not a feature until the value changes the presented frame or the
audio graph. Unit tests, evidence JSON, and "shake fired" counters are not acceptance. Acceptance is the shipped game
looking and feeling competitive in motion, judged by a human or vision model on captured video/frame strips.

---

## 1. Problem statement

Aura3D games read as "early console" in motion and framing, independent of shading quality. Vision judgment of the
18 shipped games (research 21) scores `camera` 2–4.5 and `polish_juice` 0.5–3 in every game; no game reaches 5 in either.
The recurring visual verdicts are: small subjects in static or distant wide shots (Aura Clash fighters 25–33 % of
viewport height, Aurora Lander ~4 % of frame, Bank Shot table ~25 % of mobile width, Vault Breakers ball "effectively
invisible"), static cameras that never react to play (Blockfall, Bank Shot, Gallery Shift, Orbital Defense, Vault
Breakers, Gravity Post, Skyline), chase cameras that lose ground and horizon (Patrol Wing 2 of 3 frames, Aurora Lander,
Deep Recovery), and "frames are interchangeable" — action frames identical to idle frames (Orbital Defense, Vault
Breakers, Mech Hangar, Skyline).

The engine is not short of APIs. It ships more named game-camera and juice APIs than three.js r185 (research 10 §0).
It loses on the last mile:

1. The camera has no live API, so games mutate the frozen scene spec through `as unknown as Mutable…` casts.
2. The only follow filter is one scalar first-order low-pass applied identically to eye and look-at; engine rig
   defaults (`smoothing 0.045`) have τ = 0.36 s, which trails the subject and attenuates shake to 4–9 %.
3. Roll is impossible (fixed up vector); follow ignores subject pitch/roll; FOV is the only juice channel that reaches
   pixels.
4. Hit-stop and time scale are metadata — nothing in the runtime consumes them.
5. The fixed-step loop renders once per substep, never interpolates, and silently runs the simulation in slow motion
   when the frame rate drops below `1 / (fixedDt × maxSubSteps)` (30 fps for the common `{1/60, 2}` config). 16 of 18
   games measured below 30 fps at 1080p on the capture runner.
6. Vehicle physics is a unicycle (velocity ≡ heading, no slip); platformer horizontal velocity is set instantly.
7. Game audio "positional" playback is not spatial; looping cues cannot be pitched (no engine RPM); default cue is a
   176 Hz sine beep.
8. Touch controls exist as layout data only; 2 of 18 games use them, and vision judgment repeatedly flags keyboard
   prompts on touch devices (Aura Clash, Mech Hangar, Gravity Post, Vault Breakers, Orbital Defense has no touch
   controls at all).
9. Templates and the `aura3d-browser-game` skill teach static wide cameras and "feel in evidence only"; agents
   reproduce the gap.

This PRD builds the runtime pieces that make camera, time, controls, and feel reach the presented frame by default.

## 2. Evidence from current code

All paths relative to repo root `/Users/gurbakshchahal/platforms/aura3d`. Line numbers verified against HEAD
`c08d8acb` unless marked (R10) = taken from research 10 at `950b2971` (no package changes between the two commits).
Staff review 2026-10-05 re-checked the cited `path:line` references against `3a51cba3` (no `packages/` or `apps/`
changes since `c08d8acb`) and corrected the ones that had drifted; rows C18–C21 were added by that review.
Parallelization review 2026-10-05 re-checked 24 references at `7992a0dd` (no `packages/` changes since `c08d8acb`):
`index.ts:3163` (`AuraCameraSpec`), `:3215` (`camera` builders), `:3249`, `:7061`, `:7619`, `:7636`, `:7641`, `:8204`,
`:10497`, `:10680`, `:11290`, `:11328`, `:11592` (`step`), `:11582` (`advance`, public), `:12319`, `:12382`, `:12471`,
`:15616`, `:15629`, `:15654`, `:15696`, `:15707`, `:17758`; `FrameLoop.ts:46, 62, 63, 124-149`; `GameAppRuntime.ts:151-153`;
`GameCameraRigs.ts:94, 190, 306, 390, 525`; `GameRuntime.ts:1600, 1668, 2007, 2074, 2541, 2734, 3596, 3617, 4218`;
`GameSceneGeometryBindings.ts:469, 516, 676, 718`; `GameGenreKits.ts:851, 1054`; `ScenePhysicsBridge.ts:69`;
`Raycast.ts:87`; `MathTypes.ts:90`; `VehicleChassis.ts:297`; `ShaderLibrary.ts:206, 719, 1249, 1786, 2413`;
`WebGPUDevice.ts:2230`; `PositionalEmitter.ts:232`. Corrected: C2 (`3163-3194`, was `3160-3193`), C7 (`17758`, was
`17759`), C8 (split into `resolveCameraFrame` vs `createViewProjection` sites). After PR 0b-1 the `index.ts` ranges
named in CONTRACTS §3.2 move verbatim to carved modules; the carved targets are given in brackets where a task uses them.

### 2.1 Camera

| # | Finding | Location |
|---|---|---|
| C1 | `AuraApp` exposes `setScene`, `nodes`, `physics`, `onFrame`, `step`, … and **no camera handle**. | `packages/engine/src/agent-api/index.ts:10680-10769` |
| C2 | `AuraCameraSpec` is a readonly declarative record (`mode`, `position`, `target`, `offset`, `offsetMode: "scene" \| "target-yaw"`, `fov`, `smoothing`, …). No roll, no up, no velocity, no layers. It already has `near`/`far` (defaults 0.05/100) and `orthographicSize`. | `index.ts:3163-3194` |
| C3 | `camera.follow` default `smoothing: 0.18`, `distance: 5`, `fov: 50`. | `index.ts:3249-3264` |
| C4 | `resolveCameraFrame`: one exponential mix with the same `amount` on `target` and `eye`; `responsePerSecond = -ln(1-s)·60`; resets when gap > 250 ms. Only applies to `mode === "follow"`. | `index.ts:15707-15745` |
| C5 | `applyCameraOffset` rotates the offset by `target.rotation[1]` (yaw) only. | `index.ts:15616-15619` |
| C6 | `resolveCameraEye` follow branch prefers `cameraSpec.offset` and only falls back to `distance` when offset is absent; `path`/`flythrough` are `mix3(from, to, eased)` with `phase = (t % seconds)/seconds` (snap at loop end); `dolly` is a cosine ping-pong. | `index.ts:15654-15689` |
| C7 | View matrix: `lookAtMat4([...eye], [...target], [0, 1, 0])` — fixed up vector, no roll. (R10 cited `:15760`; current location below.) | `index.ts:17758-17765` (`createViewProjection`, view at `:17761`; owner 15 after PR 0) |
| C8 | All production-bridge camera consumers go through `resolveCameraFrame`/`createViewProjection` — a single injection point. `resolveCameraFrame(` callers: `:12354, 13602, 13760, 13857, 17760`; `createViewProjection(` callers: `:13809, 13856, 16089, 16187`. Both functions and all callers stay in PRD 15-owned files after PR 0b (`compiler/renderer.ts`, `compiler/renderInput.ts`, `index.ts` default). | `index.ts` lines listed |
| C9 | Projection reads `fov` live from the spec; default clipping near 0.05 / far 100. | `packages/engine/src/agent-api/RootRuntimeSupport.ts:15-28` |
| C10 | Engine rig builders emit low `smoothing` constants: `0.045` (racing chase `GameSceneGeometryBindings.ts:516`, platformer follow `:718`, `createGameRacingPresentationCamera` follow `index.ts:7619`), plus `0.05` (`:488`, `:696`), `0.08` (`:529`), `0.06` (`:731`); `index.ts:7636` sets `0.045` on a `perspective` spec where smoothing is ignored. For 0.045: k = −ln(1−s)·60 = 2.76/s, τ = 0.362 s, half-life 0.251 s; first-order gain at 39.7 rad/s = 1/√(1+(ωτ)²) = 0.069; steady-state lag v·τ = 7.2 u at 20 u/s. | `GameSceneGeometryBindings.ts:488, 516, 529, 696, 718, 731`; `index.ts:7619, 7636` (verified at `c08d8acb`) |
| C11 | `createGameRacingCameraRig` throws unless the caller passes a composition report path string and literal `"pass"` verdicts; the file is never read. | `index.ts:7641-7650` |
| C12 | `createTraumaShake`: 3-sine sum at 39.7/71.3/127.9 rad/s, amplitude `trauma²`, snaps to zero below trauma 0.05, computes `roll`. | `packages/engine/src/agent-api/GameCameraRigs.ts:306-347` |
| C13 | `createGameCameraRig.update` adds `shake.offset` to position and `punch.fovOffset` to fov; **drops `shake.roll` and `punch.distanceOffset`**. | `GameCameraRigs.ts:556-596` |
| C14 | `createCollisionAwareOrbit` exists (rate-limited pull-in, caller-supplied probe); used by 0 games. | `GameCameraRigs.ts:159-279` |
| C15 | `createGameCameraDirector`: "shake" is a decaying unidirectional push (`focus + shake·0.04`), no damping, zoom applied to both distance and fov. | `packages/engine/src/agent-api/GameRuntime.ts:2734-2798` |
| C16 | `CameraChoreographer` advertises `interpolation: "catmull-rom"` but `easing()` maps it to per-segment smoothstep lerp — velocity is zero at every keyframe (stop–start motion). | `packages/engine/src/agent-api/CameraChoreographer.ts:6, 160-180, 234-238` |
| C17 | Seven independent follow implementations; four shake implementations, none composable. | research 10 §2.1; `packages/lean/src/game.ts:79, 140-163`; `packages/input/src/controls/ThirdPersonFollowControls.ts` |
| C18 | `AuraRuntimeNodeHandle` stores `rotation` as an XYZ Euler `AuraVec3`, mutates via positional `setPosition(x, y, z)` / `setRotation(x, y, z)`, and exposes `bounds()`. There is no public quaternion type; `eulerToQuat` (private, `index.ts:5345`) and `@aura3d/math` `Quaternion`/`Euler` (XYZ only) exist. | `index.ts:10497-10530, 5345`; `packages/math/src/Euler.ts:8-11` |
| C19 | `lookAtMat4(eye, target, up)` lives in `packages/scene/src/MathTypes.ts:90` (exported as `@aura3d/scene/math`); it already accepts an arbitrary up vector. There is no `packages/scene/src/math` directory. | `packages/scene/src/MathTypes.ts:90`; `packages/scene/package.json` `exports["./math"]` |
| C20 | Reduced-motion source already exists: `game.accessibility.reducedMotion` → `createGameReducedMotionSource`; camera evidence already has a `reducedMotion` flag. There is no `app.accessibility`. | `GameRuntime.ts:4218`; `index.ts:6942-6948, 8296-8299` |
| C21 | Existing gates assert juice "fired"/"adopted" rather than presented: `tests/browser/gamefeel-camera-rigs.spec.ts`, `tests/browser/route-gamefeel-adoption.spec.ts`, `tests/unit/game-runtime/game-runtime-source-gates.test.ts`, `tests/unit/apps/skyline-player-feel.test.ts`. These must be rewritten, not just kept green. | listed paths |

### 2.2 Game-side consequences (cast-and-mutate pattern)

| # | Finding | Location |
|---|---|---|
| G1 | Two mutation styles. (a) `Object.assign(cam as unknown as Mutable…, …)` casts: courier (1 site), patrol-wing (3), turbo (1), plus non-game `showcase-cinematic-architecture` (`as unknown as Record<string, unknown>`). (b) Direct property writes through a locally-typed mutable parameter (no cast): skyline `cameraSpec.offset/targetOffset/fov = …`, blockfall `cameraSpec.position = …`. A grep for `as unknown as Mutable` finds only (a); (b) is only caught by freezing the spec (X-5). | (a) `apps/showcase-courier-rush/src/main.ts:1394`; `apps/showcase-patrol-wing/src/main.ts:805, 854, 1051`; `apps/showcase-turbo-drift-circuit/src/main.ts:2760`; `apps/showcase-cinematic-architecture/src/main.ts:500`. (b) `apps/showcase-skyline-runner/src/feel.ts:474-480`; `apps/showcase-blockfall-reactor/src/camera-feel.ts:85-91` (verified at `c08d8acb`) |
| G2 | Turbo writes shake/punch/finish blend into `distance`/`height`/`sideOffset`; follow mode reads only the baked `offset[]`; only `fov` changes pixels. Evidence reports the unapplied values. | `apps/showcase-turbo-drift-circuit/src/main.ts:2712-2781`; `GameSceneGeometryBindings.ts:506-518` (R10 §3.3) |
| G3 | Turbo disabled smoothing **for review capture only** after observing both racers "tiny at the horizon". | `apps/showcase-turbo-drift-circuit/src/main.ts:2826-2830` (R10) |
| G4 | Skyline root shake is low-passed to ~7 % by τ = 0.36 s; evidence records the unfiltered magnitude. Skyline framing target: hero at ~1/8 frame height. | `apps/showcase-skyline-runner/src/feel.ts:156, 474-480, 536-551`; `main.ts:1629` (R10) |
| G5 | neon-swarm computes `cameraDirector.update(...)` and discards it (`void cameraState`) — every `impact()` is a no-op. | `apps/showcase-neon-swarm/src/main.ts:1667-1671` (research 16 §4) |
| G6 | Static `camera.perspective` only, no follow: gravity-post, pulse-tunnel (chase but static FOV), vault, rooftop, gallery, bank, orbital. | research 16 row 3 |
| G7 | Siege Golf calls `app.setScene(buildHoleScene(...))` on every camera-phase change (hard cut, full remount). | `apps/showcase-siege-golf/src/main.ts:975-985` (research 17-g3 §2.5) |
| G8 | Blockfall punch decays `strength *= 0.92 + progress·0.08` per frame (frame-rate dependent); lean shake is per-call white hash noise. | `apps/showcase-blockfall-reactor/src/camera-feel.ts:76-91`; `packages/lean/src/game.ts:140-163` |

### 2.3 Time, loop, hit-stop

| # | Finding | Location |
|---|---|---|
| T1 | `FrameLoop.timeScale` is a private readonly field set once in the constructor; no setter. | `packages/engine/src/agent-api/FrameLoop.ts:46, 63` |
| T2 | `FrameLoop.step` emits one callback per substep; when `availableSubsteps > maxSubSteps` the accumulator is clamped to ≤ `fixedDt`, i.e. excess real time is discarded (simulation slow-motion under load). `tick()` passes unclamped rAF dt. `maxSubSteps` default is 5 in three places. | `FrameLoop.ts:62, 124-149, 179-185`; `index.ts:7061` (`createAuraGameRuntime`), `index.ts:8204` (`game.loop`) |
| T3 | `GameAppRuntime` calls `app.step(frame.dt)` per emitted substep; `app.step` = `advance` + `productionController.render` → one GPU submission **per substep**, zero submissions on 0-substep ticks; `frame.alpha` is dropped. `app.advance(dt)` already exists publicly (`index.ts:11582-11591`: runtime frame + physics + actor update, no render), so a driver can call `advance` per substep and render once without new engine API. | `GameAppRuntime.ts:151-153`; `index.ts:11582-11615` |
| T4 | `runtimeAlpha = (dt % fixedDt)/fixedDt` — meaningless for interpolation. | `index.ts:11290-11302` |
| T5 | Non-`createGameApp` render path: `delta = max(1, time - lastTime)` with **no upper clamp**. Same pattern at 12319, 12382. | `index.ts:11328, 12319, 12382` |
| T6 | Kits clamp internally to 0.05 s while the camera smoothing uses the full dt → sim and camera desync below 20 fps. | `GameRuntime.ts:2021`; `GameGenreKits.ts:1499` (R10 §5.2) |
| T7 | `gameFeel.hitStop(durationMs)` and `effectiveDt(dtMs)` take **milliseconds** and only change `timeScale()`/`effectiveDt()`; no game calls `effectiveDt`. Combat events carry `hitStop` in **seconds** (`attack.move.hitStop ?? 0.045` light at `:3596`, `?? 0.06` at `:3617`) that nothing consumes. Unit mismatch must be handled when forwarding (T-8). | `GameFeel.ts:27-30, 83-88, 136-140, 240-243`; `GameRuntime.ts:3596, 3617` |
| T8 | `ScenePhysicsBridge.pullDynamic(world, alpha)` already interpolates `previousPosition/position` and `previousRotation/rotation`; unused by the game path. | `packages/physics/src/ScenePhysicsBridge.ts:68-80` |
| T9 | Three timestep regimes in shipped games: `createGameApp` with `loop: { fixedDt: 1/60, maxSubSteps: 2 }` (bank-shot `main.ts:391`, blockfall `:668`, gallery `:1137`, rooftop `:761`, vault `:410`, siege-golf `:884`), `createGameApp` with other settings (patrol-wing `{FLIGHT_DT=1/60, 4}` `:566`; aura-clash headless `createGameApp(null, {1/60, 3})` `AuraClashArenaApp.ts:711-716`); hand-rolled accumulators (aurora-lander, mech-hangar, skyline, rooftop hoop-sim); raw variable dt (courier, deep-recovery, neon-swarm, turbo, pulse-tunnel — its accumulator is the beat clock, not the sim — gravity-post, orbital-defense via `app.onFrame(({ time }) …)` `main.ts:398`). | app paths listed; research 10 §2 |

Measured consequence (capture report, desktop 1920×1080 rAF fps): aura-clash 11.1, blockfall 9.8, skyline 11.4, turbo 19.7,
siege-golf 7.1, aurora 52.2, neon-swarm 25.8, gravity-post 6.4, courier 7.1, pulse-tunnel 23.5, mech-hangar 9.3, vault 57.4,
rooftop 7.6, gallery 10.1, deep-recovery 0.5, patrol-wing 15.8, bank-shot 14.9, orbital 59.6. With `{fixedDt: 1/60,
maxSubSteps: 2}` (bank-shot, blockfall, gallery, rooftop, vault, siege-golf), a 10 fps tick yields 2 substeps = 33 ms of simulation
per 100 ms of wall time (game runs at ~1/3 speed; siege-golf at 7.1 fps runs at ~1/4.3 speed) **and** submits two GPU frames per tick, doubling GPU cost exactly when
the GPU is the bottleneck. This is derived from T2/T3 + measured fps; it must be confirmed with a frame-pacing trace in
Phase 1 (task L-9). Note: these six games pass `maxSubSteps: 2` explicitly, so changing the engine default (L-2) does
not fix their slow-motion; the explicit value must be removed per game (task L-10).

### 2.4 Motion feel

| # | Finding | Location |
|---|---|---|
| M1 | `createGameArcadeVehicle`: constant-decel drag, heading-integrated position, velocity ≡ heading (no lateral slip); "drift" multiplies steer rate by ≤ 1.55; constant acceleration 16. | `GameRuntime.ts:2007-2045` |
| M2 | `VehicleChassis` (suspension, pitch/roll from load, wheel spin/steer) used only by turbo. | `packages/engine/src/agent-api/VehicleChassis.ts:297-340` |
| M3 | Platformer kit defaults: gravity −22, jump 8.25, coyote 110 ms, buffer 130 ms, `fallGravityMultiplier: 1`, `jumpReleaseScale 0.45`. The kit applies `fallGravityMultiplier` only when `> 1` (`:1054-1057`) and has **no apex-hang** implementation. | `GameGenreKits.ts:851-872, 1054-1057` |
| M4 | `createGameKinematicBody` (`:2074`) `body.move(axis, speed)` sets `velocity.x = axis·speed` instantly (no accel/decel/air control). | `GameRuntime.ts:2181-2186` |
| M5 | `solvePlatformerMotion(platforms, { feel })` derives gravity/jump/moveSpeed **from level geometry**; named feels come from `platformerFeelProfile` (`snappy` fall ×1.9, `responsive` ×1.6 with `apexHangFraction 0.14`, `floaty` ×1.15). Opt-in; only skyline uses it (`apps/showcase-skyline-runner/src/level.ts:199`). | `PlatformerMotion.ts:244, 276-285, 287-290` |
| M6 | Craft (flight, lander, pod, sub) all hand-rolled; no engine analogue. | research 16 row 17 |

### 2.5 Input and controls

| # | Finding | Location |
|---|---|---|
| I1 | `createGameInput`: action maps, axes with 0.18 deadzone, smoothing with snap-on-reversal, gamepad polling, 120 ms press buffer, combos, replay. **Preserve.** | `GameRuntime.ts:1668-1936` |
| I2 | `createGameTouchControlLayout` returns region data (`kind: "aura-game-touch-layout"`), does not mount DOM or pointer handlers. Used by 2 games (blockfall, neon-swarm). | `GameRuntime.ts:518-567, 1600+` |
| I3 | `@aura3d/input` has `VirtualTouchJoystick`, `Haptics`, `GamepadInput`, `GestureRecognizer`; `@aura3d/controls` has Orbit/Fly/etc. **No game or template imports either package.** Haptics are wired to nothing. | `packages/input/src/VirtualTouchControls.ts`, `Haptics.ts`; research 10 §7 |
| I4 | Vision: keyboard prompts ("HOLD SPACE") shown on touch in vault-breakers, mech-hangar, gravity-post, aura-clash; orbital-defense has no touch controls; patrol-wing uses 11 text buttons for flight. | research 21 per-game `mobile_presentation` rows |

### 2.6 Audio feel

| # | Finding | Location |
|---|---|---|
| A1 | `playCue` (`:345-386`) always connects to `bus.node?.input ?? destination`; the `spatial` argument only feeds evidence (`recordPlayingNode`, `:320`, `:380`). `setOcclusion` (`:415-421`) mutates evidence only. | `packages/engine/src/game/GameAudio.ts:320-386, 415-421` |
| A2 | Default cue (`playDefaultCue`): sine at `cue.frequency ?? 176` Hz, 0.12 s, gain 0.025. | `GameAudio.ts:485-503` |
| A3 | `PositionalEmitter.update` assigns the JS property `this.source.playbackRate = lastDoppler`; `AudioSource.play()` copies `playbackRate` into the `AudioBufferSourceNode` only when the node is created → doppler never changes a playing loop. | `packages/audio/src/PositionalEmitter.ts:228-232`; `packages/audio/src/AudioSource.ts:43-51` |
| A4 | No live `setRate`/`setGain` on looping cues; turbo engine loop plays at fixed rate; patrol-wing maps throttle to volume only. | turbo `main.ts:4411-4417`; `wing-audio.ts:8-9,92` (R10 §8.3) |
| A5 | 17 of 18 games' WAVs are offline oscillator/noise synthesis (`scripts/build-sfx.mjs`); only Aura Clash ships sampled audio. Scorecard `sound_audio` 0–4. | research 18 C12; research 20 |

### 2.7 Authoring

| # | Finding | Location |
|---|---|---|
| E1 | `aura3d-browser-game/SKILL.md` mentions the camera once ("a camera that keeps the player visible"); canonical snippet sets no camera (default orbit at `[2.48,2.48,3.12]`). | `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md:34-60, 73`; mirror `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md` |
| E2 | Templates: mini-game static camera, `cameraRig.follow` only inside `publishEvidence`; racing-starter static top-down, no chase; fighting-game director output → HUD text only; character-controller orbit. | `packages/create-aura3d/templates/mini-game/src/main.ts:171-175, 214`; `racing-starter/src/main.ts:217`; `fighting-game/src/main.ts:144, 322, 361` |

## 3. Root cause

1. **Declarative-spec camera with no runtime owner.** three.js developers own a live `PerspectiveCamera` and compose
   rig → damping → noise → projection in their own loop. Aura3D replaced that with a frozen spec read at render time
   (`snapshot.camera`), then added rig helpers whose outputs have nowhere to go except evidence. There is no stage in
   the pipeline where "post-damping additive layers" can exist.
2. **Wrong filter primitive.** A single first-order lag on both eye and target is a position-chaser, not a framing
   rig. It conflates "smooth the arm" with "keep the subject locked", and is applied before juice, so juice is
   filtered out.
3. **Time is not a runtime concept.** `timeScale` is a constructor constant; hit-stop is a field; render cadence is
   coupled to simulation substeps; dt is unclamped on one path and silently truncated on another.
4. **Feel foundations were modelled for evidence, not for players.** The vehicle and platformer bodies satisfy
   "moves / jumps / drifts" probes with 1985-class kinematics; the richer modules (`VehicleChassis`,
   `solvePlatformerMotion`) are opt-in and undocumented in the skill.
5. **Parallel stacks.** `@aura3d/input`, `@aura3d/controls`, `@aura3d/audio` contain the correct building blocks
   (HRTF panner, haptics, virtual joystick) but the game path (`createGameInput`, `createGameAudio`) never composes
   them.
6. **Engineering gates replaced feel review.** Gates check that shake "fired", rig "selected", verdict strings equal
   `"pass"`. No gate looks at motion. This lane fixes it in its own `benchmarks/quality-rebuild/motion/` scenes
   (registered through C-30, captured through C-33 step plugins); panel judging uses C-32.

## 4. Affected packages

- `@aura3d/engine` (`packages/engine`) — camera controller, rigs, loop/time, interpolation, feel bus, genre kits,
  touch mount (all in lane-08 paths). `GameAudio` is PRD 09's; this lane only calls C-25.
- `@aura3d/audio` (`packages/audio`) — **not edited by this lane** (owner 09, R17). The `PositionalEmitter` live-rate
  fix and listener/mixer work are requests Q-09-1…Q-09-4; this lane consumes C-25 `GameSound.setListener/loop/engine`.
- `@aura3d/input` (`packages/input`, owner 08 except `src/TouchLayouts.ts` (09) and `src/controls/` (15)) — haptics +
  virtual joystick reused by the engine touch kit.
- `@aura3d/physics` (`packages/physics/src/{Raycast,ScenePhysicsBridge}.ts`, owner 08) — interpolation helpers reused;
  camera collision probe via existing queries. The rest of `packages/physics` is PRD 15's and is not edited.
- `@aura3d/scene` (`packages/scene/src/MathTypes.ts`, exported as `@aura3d/scene/math`) — `lookAtMat4` already takes an arbitrary up; add `rollUpVector(forward, up, roll)` and `quatFromEulerXYZ`/`eulerXYZFromQuat`/`slerpQuat` tuple helpers over `@aura3d/math` `Quaternion`/`Euler`.
- `@aura3d/lean` (`packages/lean/src/game.ts`, owner 15) — lean camera rig and shake collapse onto the engine
  controller through request Q-15-4; this lane ships the adapter functions in `agent-api/camera/leanAdapters.ts`.
- `@aura3d/controls` (owner 15) — no functional change; README note is request Q-15-5.
- `create-aura3d` templates + skills; `aura3d-cli` skill mirror (owner 13; this lane sends C-40 facts and template
  requests Q-13-1…Q-13-3).
- All 18 games (owner 14; migration executed by PRD 14 from this lane's codemod and per-game tickets, Q-14-1…Q-14-3).

## 5. Affected files / directories

Every path below is tagged with its CONTRACTS §4.1 owner. Only lane-08 paths are edited by this lane. Paths owned by
another lane are reached through the named contract seam or appear as a request in §12.3.

New (all lane 08):

- `packages/engine/src/agent-api/camera/CameraController.ts` — live controller, layer stack, presented-pose evidence.
- `packages/engine/src/agent-api/camera/Spring.ts` — critically damped spring / `smoothDamp` (scalar, vec3, angle, quat).
- `packages/engine/src/agent-api/camera/rigs/{chase,follow2d,orbit,shoulder,topDown,fighting,flight,altitude,rail,static}.ts`.
- `packages/engine/src/agent-api/camera/layers/{trauma,punch,fovKick,lookAt,cinematicBars}.ts`.
- `packages/engine/src/agent-api/camera/Spline.ts` — centripetal Catmull-Rom + arc-length table.
- `packages/engine/src/agent-api/camera/Sequence.ts` — shots, blends, cuts.
- `packages/engine/src/agent-api/camera/Probe.ts` — sphere-cast probe over physics/BVH.
- `packages/engine/src/agent-api/time/TimeController.ts` — time scale, hit-stop, slow-mo, per-actor freeze.
- `packages/engine/src/agent-api/time/Interpolation.ts` — previous/current transform store for runtime handles.
- `packages/engine/src/agent-api/feel/FeelBus.ts` — event → (shake, punch, hit-stop, haptics, audio, VFX request).
- `packages/engine/src/agent-api/feel/Noise.ts` — 1D gradient (Perlin) noise, seeded.
- `packages/engine/src/agent-api/vehicle/BicycleModel.ts` — slip-angle vehicle.
- `packages/engine/src/agent-api/controls/TouchControls.ts` — DOM touch overlay mount over `createGameTouchControlLayout`.
- `packages/engine/src/agent-api/controls/DevicePrompts.ts` — active-device detection and prompt glyph swap.
- `packages/engine/src/agent-api/camera/{framing,fromSpec,leanAdapters,OccluderFade}.ts` — framing solver, legacy-spec
  rig (a verbatim copy of the `resolveCameraTarget/Eye/Frame` math, because the originals stay in PRD 15's `index.ts`),
  lean adapters, occluder fade manager.
- `packages/engine/src/agent-api/camera/extension.ts`, `time/extension.ts`, `feel/extension.ts` — the real C-38 app
  extension factories for `camera`, `time`, `feel`, registered from `packages/engine/src/lanes/prd08.ts`.
- `packages/engine/src/agent-api/time/FixedStepDriver.ts` — render-once-per-tick driver over the public `app.advance` +
  one `app.step(0)` per tick (T3), used by `createAuraApp` opt-in and by the lane harness.
- `packages/engine/src/agent-api/time/InterpolationContributor.ts` — C-01 `collect` contributor `prd08.interpolation`.
- `packages/engine/src/agent-api/feel/lint/{evidenceOnlyFeel.ts,feelSourceScan.ts}` — C-34 rule `look/evidence-only-feel`
  (runtime) and the source AST scan behind the C-39 command.
- `packages/rendering/src/shaders/camera-fade.glsl.ts` — C-02 chunk + `prd08.cameraFade` ShaderFeature.
- `packages/aura3d-cli/src/commands/prd08/{index,cameraCast,feelLint}.ts` — C-39 registrations.
- Lane tests (lane 08, `tests/qr/prd08/`): `unit/{camera-controller,camera-spring,camera-rigs,camera-spline,
  time-controller,render-interpolation,bicycle-vehicle,platformer-accel,feel-bus,feel-audio-dispatch,
  touch-controls-mount,touch-device-prompts,camera-fade-chunk}.test.ts`; `browser/{camera-feel,frame-pacing}.spec.ts`;
  `harness/camera-feel-harness.{html,ts}`; `fixtures/legacy-frames.json` (C-14 golden fixture);
  `playwright.prd08.config.ts` (lane-owned config under `tests/qr/prd08/`, so no edit to PRD 12's root
  `playwright*.config.ts`); `tests/unit/contracts/impl/prd08-{camera,time}.test.ts` (real-impl conformance runs).
- `tools/camera-cast-codemod/index.mjs` + `tools/camera-cast-codemod/fixtures/` (lane 08 per §4.1).
- `benchmarks/quality-rebuild/motion/` (lane 08 per §4.1) — temporal scenes M1–M6 and `review-rubric.md`; registered
  with C-30 as owner `prd08`, captured through C-33 strip/WebM step plugins (§16).
- `.github/workflows/qr-prd08-camera.yml` — lane CI on `macos-14` (§15).

Changed, lane 08 (edited directly):

- `packages/engine/src/agent-api/FrameLoop.ts` — `maxFrameDt`, overload policy, `onTick`, live `timeScale` (R15).
- `packages/engine/src/agent-api/app/frameLoopDefaults.ts` (`DEFAULT_MAX_SUBSTEPS`, carved by PR 0b-1 from
  `index.ts:7061, 8204`) and `app/frameAlpha.ts` (carved from `index.ts:11290-11302`).
- `packages/engine/src/agent-api/nodes/camera.ts` (carved from `index.ts:3215-3395`) — `camera.rigs` namespace, X-1
  warning; `nodes/game/racingCamera.ts` (carved from `index.ts:7605-7650`) — racing rig defaults, gate removal.
- `packages/engine/src/agent-api/GameCameraRigs.ts` (keep math, re-home as rigs/layers, delete aggregator).
- `packages/engine/src/agent-api/GameFeel.ts` (hit-stop → TimeController; effect spawning stays routed to C-20).
- `packages/engine/src/agent-api/GameRuntime.ts` — vehicle (2007-2045), platformer body (2181-2186), director
  (2734-2798), combat `hitStop` events (3596, 3617), `createGameInput` (1668-1936). The effects regions
  (`:1150-1171`, `:2800-2879`, `:3879-3915`) are carved to PRD 07's `vfx/gameEffects.ts` by PR 0b-1 and are not edited.
- `packages/engine/src/agent-api/GameGenreKits.ts` — platformer defaults (851-872), fall gravity (1054-1057), racing kit (1343-1580).
- `packages/engine/src/agent-api/GameSceneGeometryBindings.ts` — rig builders (469-531, 676-733).
- `packages/engine/src/agent-api/{CameraChoreographer,PlatformerMotion,VehicleChassis}.ts`.
- `packages/scene/src/MathTypes.ts` — add `rollUpVector(forward, up, roll)` and quat tuple helpers.
- `packages/input/src/{VirtualTouchControls,Haptics}.ts` (R16).
- `packages/physics/src/{Raycast,ScenePhysicsBridge}.ts` — no API change; probe helpers only.
- Lane-08 existing tests: `tests/unit/engine/{fixed-step-determinism,game-camera-rigs,game-feel,platformer-motion,
  vehicle-chassis}.test.ts` (first `packages/**` import is a lane-08 module, or explicit in §4.1).

Changed by other lanes (never edited here; seam or request):

| Path | Owner | How this lane reaches it |
|---|---|---|
| `agent-api/index.ts` outside the carves: `resolveCameraFrame` (15707-15745), `resolveCameraEye` (15654-15689), `createViewProjection` (17758-17765), consumers (C8) | 15 | standalone: C-22 `setPose` writes the presented pose into the camera node (a `perspective`/`orthographic` spec, which the legacy path renders without smoothing); roll: CCR-08-1 + Q-15-1 |
| `agent-api/app/createAuraApp.ts` (render dt `:11328`, `step`/`advance` `:11582-11615`, `runtimeAlpha` payloads `:11508, :11694`), `index.ts:12319, 12382` | 15 | C-38 extensions; `FixedStepDriver`; Q-15-2 (dt clamp), Q-15-3 (alpha payload) |
| `agent-api/app/runtimeNodes.ts` (`AuraRuntimeNodeRegistry`) | 15 | C-37 extension `prd08.time` (`interpolate`, `timeScale`, `teleport`) |
| `agent-api/GameAppRuntime.ts:151-153` | 09 | Q-09-5 (per-substep `advance`, one render on `onTick`); C-23 delegation |
| `packages/engine/src/game/GameAudio.ts`, `packages/audio/src/{PositionalEmitter,AudioSource}.ts` | 09 | C-25 consumer; Q-09-1…Q-09-4 |
| `packages/rendering/src/ShaderLibrary.ts` (frozen legacy, §3.7) | 01 | C-02 chunk; optional legacy patch Q-01-1 |
| `packages/rendering/src/WebGPUDevice.ts` (`:2230` packed uniforms) | 11 | WGSL twin request Q-11-1 |
| `packages/rendering/src/TemporalHistory.ts` | 03 | C-14 `resetTemporalHistory` / `app.cutCamera()` |
| `packages/lean/src/game.ts`, `packages/input/src/controls/`, `packages/controls` README | 15 | Q-15-4, Q-15-5 |
| Six `apps/showcase-*/src/main.ts` `loop.maxSubSteps: 2` lines (L-10): bank-shot `:391`, blockfall `:668`, gallery `:1137`, rooftop `:761`, vault `:410`, siege-golf `:884`; turbo `:2789-2794` magic strings | 14 | Q-14-1, Q-14-2 (R21) |
| `packages/create-aura3d/templates/{mini-game,racing-starter,fighting-game,character-controller,falling-blocks-starter}/src/main.ts`, both `aura3d-browser-game/SKILL.md` copies, `tests/templates/` | 13 | C-40 facts F-08-*; Q-13-1…Q-13-3 (R20) |
| `packages/aura3d-cli/src/cli.ts` (`doctor`, `:229`) | 05 | C-39 registry (`commands/prd08/`) |
| `tests/browser/{gamefeel-camera-rigs,route-gamefeel-adoption,game-runtime-visual}.spec.ts` + harness, `tests/unit/game-runtime/game-runtime-source-gates.test.ts`, `tests/unit/engine/touch-control-binding.test.ts` | 15 (no lane-08 first import) | replacement gates in `tests/qr/prd08/`; Q-15-6 retires the old assertions |
| `tests/unit/apps/skyline-player-feel.test.ts` | 14 (imports only the skyline route) | Q-14-3 |
| `.github/workflows/browser-matrix.yml` | 12 | not touched; lane workflow `qr-prd08-camera.yml` instead |

## 6. Architecture proposal

### 6.1 Frame pipeline (target)

```
rAF(now)
 └─ realDt = clamp(now - last, 0, maxFrameDt = 0.1 s)                      [L-1]
 └─ simDt  = realDt × time.scale (0 during global hit-stop)                [T-*]
 └─ accumulator += simDt; while (acc ≥ fixedDt && n < maxSubSteps):        [L-2]
        interpolation.capturePrevious(); onFixed(fixedDt); physics.step(); interpolation.captureCurrent()
 └─ alpha = acc / fixedDt
 └─ interpolation.resolve(alpha)  → presented transforms for runtime handles [L-3]
 └─ onUpdate(realDt, alpha)       (variable-rate gameplay / UI; optional)
 └─ camera.update(realDt):                                                  [C-*]
        rig.update(ctx{ dt: realDt, subjects: interpolated, probe })  → RigPose
        damping (per-channel springs inside the rig)
        layers in order: lookAt override → punch/FOV kick → trauma (pos+yaw/pitch/roll) → cinematic bars
        → PresentedPose { position, orientation(quat), fov, near, far }
 └─ audio listener ← PresentedPose via C-25 GameSound.setListener (auto)    [A-3]
 └─ blackboard["prd08.screenFeel"] ← layers (C-23; C-13 post consumes)      [S-3]
 └─ renderer.render(once)   using view from PresentedPose, prevVP (C-14)   [R-*]
 └─ camera.evidence ← exactly the matrix submitted
```

How each stage reaches the frame without editing another lane's file (details in §12):
- realDt/simDt/substeps/alpha: lane-08 `FrameLoop.ts` + `time/FixedStepDriver.ts`, which calls the public
  `app.advance(fixedDt)` per substep and renders once. `createGameApp` adopts it via Q-09-5 (non-blocking).
- Interpolated subject transforms: C-37 `prd08.time` handle extension stores prev/curr; C-01 `collect` contributor
  `prd08.interpolation` rewrites the model matrix of items whose `RenderItem.label` is a runtime-node id.
- Presented pose: C-22 `setPose` writes position/target/fov/near/far into the camera node every frame (works on the
  PR 0a stub and on today's renderer). Roll needs CCR-08-1 (`AuraCameraSpec.up?`/`roll?`) + Q-15-1 (`createViewProjection`
  reads them); until both land, roll is computed and reported but rendered as 0 (integrated criterion).

Invariants:

- Exactly one renderer submission per rAF tick when running (0 only when paused/hidden).
- Camera layers run on **real** dt, not sim dt: shake continues through hit-stop (genre norm) and does not slow in
  slow-mo unless `layer.timeDomain = "sim"`.
- The camera reads **interpolated** subject transforms; reading raw sim transforms reintroduces 60/120/144 Hz judder.
- Evidence is derived from the presented pose/matrix only. Route-supplied numbers are never reported as "applied".

### 6.2 Camera controller

`app.camera` owns: the active rig (or a legacy-spec adapter), a blend state between rigs, an ordered layer stack, the
last presented pose, and the previous view-projection for temporal passes. `scene().camera(spec)` remains valid: the
controller wraps the spec in `LegacySpecRig`, which reproduces today's `resolveCameraEye`/`resolveCameraTarget` output
so existing scenes render unchanged, but layers (shake, punch) now apply after it. Under `A3D_QR_CAMERA` the
controller is the C-38 `camera` extension and presents through `setPose`; the legacy `resolveCameraFrame` path then
receives a non-follow spec and applies no extra smoothing. Retiring `resolveCameraFrame` and pointing the eight
consumers in §2.1 C8 at `controller.presented()` is PRD 15's edit (Q-15-1); it is a cleanup, not a precondition.

Visual benefit: juice becomes visible (shake at 100 % instead of 4–9 %), subject stays framed at speed, roll/bank
possible, smooth rail shots. GPU cost: 0 (CPU matrix). CPU cost: ≤ 0.05 ms/frame for rig + 4 layers (~200 flops plus
one spring per channel). Memory: < 4 KB per controller. Bundle: controller + springs + layers ≈ +4.8 KB min+gz (R1 + R4
in §7.4); each rig adds 0.5–1 KB and is tree-shakable (all ten rigs ≈ +5 KB, R2). Mobile impact: none beyond CPU above. Fallback: `LegacySpecRig` (bit-for-bit current
behaviour when `camera.legacy = true`).

### 6.3 Springs instead of scalar smoothing

Two primitives, both exact (frame-rate independent) and both parameterised by **half-life**:

1. `damp(x, target, halflife, dt)` — first-order, `x' = target + (x − target)·2^(−dt/halflife)`. Closes exactly 50 % of
   the gap per half-life. This is the same filter family as today's `smoothing` and is what `rigs.fromSpec` uses.
2. `spring*` — critically damped second-order spring (Holden parameterisation), carries velocity so motion starts
   and stops without a kink:

```
y = 2·ln2 / halflife
j0 = x - target;  j1 = v + j0·y;  e = exp(-y·dt)
x' = target + (j0 + j1·dt)·e
v' = (v - j1·y·dt)·e
```

   With this parameterisation the "half-life" is nominal: from rest (`v = 0`) the remaining gap at `t = halflife` is
   `(1 + 2·ln2)·e^(−2·ln2) = 0.597`, not 0.5. Tests must assert 0.597 ± 0.01 for springs and 0.5 ± 0.01 for `damp`.
   A critically damped spring tracking a target moving at constant speed `v` lags by `2v/y` in steady state, so springs
   are never applied to the world-space eye of a moving subject (see "arm-space damping" below).

Legacy mapping (first-order, used by `fromSpec` and migration diagnostics): `k = -ln(1-s)·60`, `halflife = ln2 / k`
(0.18 → 0.058 s; 0.12 → 0.090 s; 0.06 → 0.187 s; 0.045 → 0.251 s). `fromSpec` reproduces today's output exactly by
using `damp` with this half-life on eye and target; it does not switch the legacy path to springs. Variants:
`springVec3`, `springAngle` (wraps to shortest arc), `springQuat` (spring on log-map of `q_target · q⁻¹`).

Arm-space damping (chase/flight/shoulder/orbit): the rig damps the **arm parameters** (yaw, pitch, distance, height,
look-ahead) in subject-relative coordinates, then composes `eye = subject.position + arm(yaw, pitch, distance)` using
the undamped interpolated subject position. Constant-speed straight travel therefore produces zero arm lag (the camera
does not fall back and the subject does not shrink toward the horizon); weight comes from yaw/pitch lag on turns and
from the distance spring on acceleration.

Chase defaults (replacing 0.045/0.18): yaw half-life 0.12 s, distance/height half-life 0.10 s, look-at point half-life
0.025 s, FOV half-life 0.20 s. Look-at half-life near zero keeps the subject screen-locked.

### 6.4 Rigs

Each rig is a pure object `{ id, update(ctx) → RigPose, reset(pose?) }`, deterministic for a given dt stream. Built-ins:

| Rig | Use (games) | Key behaviour |
|---|---|---|
| `chase` | turbo, courier, pulse-tunnel, deep-recovery, siege-golf flight | arm behind subject heading; velocity look-ahead `lookAhead = clamp(v·seconds, max)` springed; speed-aware distance/FOV; optional collision; framing solver |
| `flight` | patrol-wing | full-orientation follow: arm in subject local frame incl. pitch; bank = subject roll × `bankGain` (default 0.6) springed; horizon-keep blend `horizonLock` 0..1 |
| `follow2d` | skyline-runner, platformer kit | side-scroll with screen-space dead zone, vertical "platform snap" (only re-target Y on landing or when leaving dead zone), forward lead in facing direction |
| `fighting` | aura-clash, mech-hangar, fighting template | side-on at fighters' midpoint; distance solves both fighters inside `[left,right]` safe band with target height fraction 0.45–0.60; zoom on distance only (not fov+distance); stays on the 2D fight plane (no mid-fight orbit) |
| `shoulder` | character-controller template, gallery-shift (optional) | existing `createShoulderCamera` math + collision |
| `orbit` | viewers, bank-shot aim | yaw/pitch springs, min/max pitch, collision optional |
| `topDown` | neon-swarm, orbital-defense, blockfall (tilted) | fixed pitch, follow centroid with dead zone, bounds clamp so arena edges stay framed |
| `altitude` | aurora-lander | distance/FOV from altitude so terrain + pad stay in frame; lead toward goal; subject 8–12 % frame height |
| `rail` | cinematics, intros, results, siege-golf flyover | centripetal Catmull-Rom position track + look-at track (node or spline) + FOV track, arc-length parameterised, ease curve |
| `static` | vault-breakers, bank-shot overview | fixed pose; still receives layers (shake on tilt/nudge) |

Framing solver (shared by chase/fighting/altitude/topDown): given subject bounds height `h`, vertical FOV `f`, and
target fraction `p`, distance `d = h / (2·tan(f/2)·p)`. Defaults: chase `p = 0.22`, fighting `p = 0.5`, altitude
`p = 0.10`, follow2d `p = 0.28`. These replace "hero at ~1/8 frame height" (skyline `main.ts:1629`) and come from the
vision judge targets (research 21: fighters 45–60 %, lander 8–12 %).

Collision (chase/shoulder/orbit/flight): sphere-cast from look-at point to desired eye with radius 0.2 (default),
via `app.physics` queries when a physics world exists, otherwise an AABB-list sweep over runtime-handle and static node
bounds in this lane's `camera/Probe.ts`. A BVH-backed probe over PRD 11's `performance/BVH.ts` is request Q-11-2 and
replaces the fallback when it lands; nothing waits on it. Pull-in half-life 0.04 s, push-out half-life 0.35 s (asymmetric to avoid
pumping). Occluders between eye and subject that are not collided (thin props) get dither fade (§8.2).

Up-vector degeneracy: `lookAtMat4` produces NaNs when `(target − eye) ∥ up`. `topDown` with `pitchDeg ≥ 89.5`, `orbit`
at its pitch limits, and `flight` during loops must pass `up = subject forward` (topDown) or the previous frame's
camera up (orbit/flight). C-4 asserts finite matrices for a straight-down camera.

### 6.5 Layers

Ordered, additive in camera-local space, applied after rig damping:

- `lookAt` — temporary look target override with weight spring (e.g. look at goal on score).
- `punch` — FOV offset + dolly along view axis (`distanceOffset` now applied), attack/decay envelope (existing
  `createPunchIn` math).
- `fovKick` — continuous FOV channel (boost, speed) with half-life.
- `trauma` — 6-DoF noise: translation (m) + yaw/pitch/roll (deg). Amplitude `trauma²` (existing envelope); noise =
  seeded 1D Perlin per channel at `frequency` Hz (default 18 Hz impacts, 6 Hz rumble) replacing fixed sines. Raw 1D
  gradient noise peaks near ±0.5, so `perlin1` is normalised (×2, clamped to [−1, 1]) so that `maxYaw` etc. are
  reachable. Terminal band uses `smoothstep(0, 0.05, trauma)` fade instead of a hard snap. Defaults: `maxOffset 0.05 m`, `maxYaw 1.5°`,
  `maxPitch 1.5°`, `maxRoll 2.5°`, `decay 1.6/s`. Rotation dominates perceived shake at distance; translation is scaled
  by `min(1, subjectDistance / 6)`.
- `cinematicBars` — letterbox 2.39:1 ease in/out (viewport scissor, no shader).

Reduced motion (`prefers-reduced-motion`, or an attached `game.accessibility.reducedMotion()` source —
`createGameReducedMotionSource`, GameRuntime.ts:4218 — passed as `createAuraApp({ accessibility: { reducedMotion } })`):
trauma × 0.25, roll × 0, punch dolly × 0, FOV kick × 0.5. Routes may not bypass this.

Visual benefit: shake/punch/bank visible as authored. GPU 0. CPU < 0.01 ms/layer. Memory negligible. Bundle +1.5 KB.
Mobile: none. Fallback: `layers.enabled = false` (a C-24 `CaptureContext` with `freezeAt` may freeze layers; the
capture context is read, never written, by this lane).

### 6.6 Time controller

`app.time` replaces the `FrameLoop.timeScale` constant and `gameFeel.effectiveDt` convention:

- `scale` (settable, springable via `time.scaleTo(value, halflife)`).
- `hitStop(seconds, { scope })`: `scope: "global"` sets sim dt to 0; `scope: actor[]` sets per-handle `timeScale = 0`
  for the listed runtime handles (C-37 `prd08.time` extension) while the rest of the sim runs; animation controllers
  freeze because PRD 06 reads `handle.timeScale` (C-23 semantics, C-19 consumer side). Overlapping
  hit-stops take `max(remaining)`, never sum.
- `slowMo(scale, seconds, { easeOut })`.
- Combat world events with `hitStop` in seconds (GameRuntime.ts:3596, 3617) call `time.hitStop(event.hitStop, { scope:
  [attacker, defender] })` by default; opt out with `combat({ autoHitStop: false })`.
- `gameFeel.hitStop(durationMs)` forwards to `app.time.hitStop(durationMs / 1000)` when the feel controller is attached
  to an app (`app.time` is seconds-based; `gameFeel` stays ms-based for back-compat).
- PRD 09's `GameSession.hitStop/slowMo/setTimeScale` delegate to `app.time` (C-24 semantics, R15); this lane provides
  the target, PRD 09 wires the delegation in its own files.

### 6.7 Loop and interpolation

`createGameApp` and `createAuraApp({ autoStart: true })` share one loop implementation (lane-08 `FrameLoop.ts`;
`createAuraApp` opts in through the C-38 `loop` option and the `time` extension, `createGameApp` through Q-09-5):

- `maxFrameDt` default 0.1 s, applied to rAF dt on every path (fixes T5).
- `maxSubSteps` default 6 (changed in lane-08 `FrameLoop.ts:62` and `app/frameLoopDefaults.ts` `DEFAULT_MAX_SUBSTEPS`, which PR 0b-1 carves from `index.ts:7061` and `index.ts:8204`); overload policy `"slow-motion"` (today's behaviour, now explicit: time beyond `maxSubSteps·fixedDt` is discarded) or `"catch-up"` (excess stays in the accumulator, capped at `maxFrameDt`, and is consumed on following ticks so sim time is preserved); overload frames counted in
  `diagnostics().loop.overloadFrames` (C-31 section `loop`; honest telemetry the PRD 11 governor may read through C-31, no request needed). Spiral-of-death guard: if the
  mean CPU time of one substep × `maxSubSteps` exceeds the frame budget for 30 consecutive ticks, the loop lowers its
  effective substep cap by 1 (floor 2) and records `loop.substepCapReduced`; it never raises it above the configured value.
- Render once per tick after all substeps (fixes T3): `time/FixedStepDriver.ts` calls `app.advance(fixedDt)` per
  substep and `app.step(0)` once per tick (advance 0 + one render). No engine API is added for this.
- Interpolation store per runtime handle: previous/current position vec3, rotation as quaternion (converted from the
  handle's XYZ Euler with `@aura3d/math` `Euler`/`Quaternion`, slerped, then converted back to XYZ Euler for the
  existing render path — C18), scale vec3 = 80 bytes. Handles opt out with `handle.interpolate = false`;
  `handle.teleport(x, y, z)` (positional, matching `setPosition`) copies current into previous to avoid smear across
  respawns. Members arrive through C-37 extension `prd08.time`; the presented transform reaches the GPU through the
  C-01 `collect` contributor `prd08.interpolation` (sub-flag `A3D_QR_CAMERA_INTERPOLATION`).
- `onRender(frame: { alpha, realDt, simTime })` (C-23, flattened on `AuraApp` via C-38) for routes that draw HUD or custom effects.
- `ScenePhysicsBridge` interpolation path (physics/src/ScenePhysicsBridge.ts:69-80) is reused for physics-driven nodes so
  the same alpha drives both.

Visual benefit: removes micro-stutter on 120/144 Hz and under load; halves GPU work on 2-substep ticks; sim speed
stays real-time down to ~10 fps **for loops using the new default** (the six games with explicit `maxSubSteps: 2`
need L-10). GPU: −(substeps−1) frames per tick (savings). CPU: interpolation ≈ 0.4 µs per handle
(500 handles ≈ 0.2 ms on mid mobile). Memory 80 B × handles. Bundle +1.5 KB. Mobile: net win. Fallback:
`loop.interpolation = false` renders the current state (still once per tick).

### 6.8 Feel bus

`app.feel` is the single place games declare "what happens on land/hit/collect/boost/explode":

```ts
app.feel.define("hit-heavy", {
  shake: 0.55, punch: { fov: -4, dolly: 0.35 }, hitStop: { seconds: 0.07, scope: "actors" },
  haptics: { strong: 0.8, weak: 0.4, ms: 90 }, audio: { cue: "hit-heavy", pitchJitter: 0.06 },
  vfx: { kind: "hit-spark", count: 18 }, screen: { flash: 0.25, chroma: 0.6, radialBlur: 0.2 }
});
app.feel.emit("hit-heavy", { position, actors: [attacker, defender], strength: 1 });
```

Each channel is optional and dispatches through its owning contract (C-23 semantics): shake/punch → C-22 camera
layers (this lane), hitStop → `app.time` (this lane), haptics → `@aura3d/input` `Haptics` (this lane; gamepad
`vibrationActuator.playEffect("dual-rumble")`, `navigator.vibrate` on touch), audio → C-25 `GameSound.play` (PRD 09;
stub wraps today's `GameAudio`), vfx → C-20 `app.effects` (PRD 07; stub draws nothing), screen → C-23 blackboard
`prd08.screenFeel` read by C-13 post (PRD 03). Reduced-motion/flash policies are applied centrally. Evidence records emitted
events and which channels **executed** (node handle created, layer energy > 0 at presentation), not requested values;
a channel whose provider is still a stub that produced nothing counts 0 (C-23).

### 6.9 Motion models

- **Bicycle vehicle** (`model: "bicycle"` in `createGameArcadeVehicle` and default for `game.racing`): state
  `(x, z, heading, vLong, vLat, yawRate)`; front/rear slip angles `αf = atan2(vLat + a·r, |vLong|) − δ`,
  `αr = atan2(vLat − b·r, |vLong|)`; lateral force `F = −μ·N·sin(C·atan(B·α))` (Pacejka-lite, B 8, C 1.4 defaults);
  handbrake scales rear μ by 0.45; drift = `|αr| > 0.12 rad`; quadratic aero drag `cD·v²` + rolling `cR·v`; torque curve
  table over speed; speed-dependent steering lock `δmax(v) = δ0 / (1 + v/vRef)`; counter-steer assist (0..1).
  Chassis defaults (new options, all overridable): mass 1200, CG-to-front `a = 1.2`, CG-to-rear `b = 1.4`, yaw inertia
  `Iz = mass·a·b`, `μ = 1.0`, `δ0 = 0.6 rad`, `vRef = 18`. Low-speed blend: below `|vLong| < 1.5 u/s` slip angles are
  undefined (atan2 with a near-zero denominator), so the model blends linearly to the kinematic bicycle
  (`r = vLong·tan δ / (a + b)`, `vLat → 0`) between 0.5 and 1.5 u/s. Outputs
  `slipAngle`, `drifting`, `wheelSpin`, `rpm` (for audio §6.10) and `lateralG` (for chase camera bank/roll and
  `VehicleChassis` load). `VehicleChassis` becomes the default presentation inside `game.racing`.
- **Craft** (`game.craft`): thrust/lift/drag/angularDrag/gravity/assist for patrol-wing, aurora-lander, gravity-post,
  deep-recovery, pulse-tunnel; pairs with `flight`/`altitude`/`chase` rigs. Phase 4, minimal (no aero sim).
- **Platformer body**: `move(axis, dt)` integrates `velocity.x` toward `axis·maxSpeed` with `groundAccel 60`,
  `groundDecel 70`, `turnAccel 110` (skid), `airControl 0.65`; kit default feel = `platformerFeelProfile("responsive")`
  (`fallMultiplier 1.6` → `fallGravityMultiplier`, `apexHangFraction 0.14` → new kit apex hang: gravity × 0.5 while
  `|vy| < 0.14·jumpVelocity`) replacing `fallGravityMultiplier: 1`. Only the fall multiplier and apex hang come from the
  profile; gravity/jump/moveSpeed stay as authored (calling `solvePlatformerMotion` by default would re-derive them from
  level geometry and break asset-bound levels). Coyote 110 ms and buffer 130 ms retained. Emits
  `presentation: { squash, stretch, lean, landImpact }` per frame which the kit applies to the runtime node scale/rotation
  (opt-out `presentation: false`) and forwards `landImpact` to `app.feel.emit("land")`.

### 6.10 Controls and audio feel

- Touch kit (R16): lane-08 `agent-api/controls/TouchControls.ts` exports `mountTouchControls(app, input, layout)`, which
  renders the `createGameTouchControlLayout` regions as DOM
  (pointer events, `touch-action: none`, safe-area insets, ≥ 48 CSS px targets, 44 px minimum per WCAG 2.5.5 AAA
  guidance), drives `createGameInput` axes/actions via a virtual device, uses `VirtualTouchJoystick` (floating stick,
  dead zone 0.12). Auto-shows on first touch, hides on keyboard/gamepad input. It is the internal implementation that
  PRD 09's public C-24 `createGame({ touch })` wraps; the `game.touchControls` namespace entry (`index.ts:8250`, carved
  to PRD 09's `nodes/game/index.ts`) is not edited here. Visual benefit: games become playable on phones. GPU 0; CPU ~0;
  memory: ≤ 12 DOM nodes; bundle +3 KB; mobile: primary target; fallback: keyboard-only (current).
- Device prompts: `input.activeDevice()` → `"keyboard" | "gamepad" | "touch"` and `input.prompt(action)` → glyph/text
  for the active device; HUD helpers use it so "HOLD SPACE" never appears on touch.
- Input buffering: keep the 120 ms global buffer; add per-action `bufferMs` and `consume(action)` to prevent double
  fires; jump/attack defaults 130/150 ms.
- Audio (consumer of C-25; PRD 09 owns all audio code, R17). This lane does three things in its own files: (1) the
  camera extension calls `GameSound.setListener({ position, forward, up })` from `presented()` every frame when a
  C-25 slot is bound; (2) the racing kit and `game.craft` drive `GameSound.engine({ cue, rpmRange, pitchRange })`
  `.setRpm(rpm)/.setLoad(throttle)` from the vehicle model's `rpm`; (3) the feel bus `audio` channel calls
  `GameSound.play(cue, { position, rate: 1 ± pitchJitter })`. The playback graph itself (HRTF/equalpower panner by
  tier, live `setRate` via `setTargetAtTime` τ 0.03 s, limiter threshold −6 dB / ratio 12 / knee 6, voice limits,
  the `PositionalEmitter` live-rate fix, removal of the 176 Hz default cue) is specified for PRD 09 in requests
  Q-09-1…Q-09-4 with the numbers above, and is already largely in C-25 semantics. On the C-25 stub, `engine()`
  restarts the voice to change rate, so engine-pitch acceptance is integrated (§16A).

## 7. APIs to add / change / remove

### 7.1 Add

Where this section and CONTRACTS disagree, CONTRACTS wins. The frozen C-22 types live in
`packages/engine/src/contracts/camera.ts` and the C-23 types in `packages/engine/src/contracts/time.ts` (both created
by PR 0a, custodian 15); this lane imports them and implements them in its own modules. Additions that go beyond the
frozen text are optional fields filed as CCRs (CONTRACTS §6.4), and the lane ships them from its own modules with the
contract shape until the CCR merges:
- CCR-08-1: `AuraCameraSpec.up?: AuraVec3`, `AuraCameraSpec.roll?: number` (needed for roll to reach pixels via `setPose`).
- CCR-08-2: `AuraCameraSubject.rotation?: AuraQuat` (contract has `forward` and required `bounds`; the rig reads `forward`
  today and `rotation` when present).
- CCR-08-3: `AuraTraumaLayer.configure` additions `maxYawDeg?`, `maxPitchDeg?`, `maxRollDeg?`, `seed?` (contract has
  `maxAngleDeg`, `maxOffset`, `frequency`, `decayPerSecond`; `maxAngleDeg` sets all three angles when the per-axis
  fields are absent; `decay` below is `decayPerSecond`).
- No CCR needed: `diagnostics().camera` and `diagnostics().loop` are C-31 sections `"camera" | "loop"` already
  reserved for PRD 08; `AuraLoopOptions` (incl. `overload`, `renderPerSubstep`) is already frozen in C-23.
Rig option interfaces (`ChaseRigOptions`, …) are lane-08 types and are additive to the `Record<string, unknown>` option
bags in `AuraCameraRigFactories` (C-22 note), so they need no CCR.

```ts
// packages/engine/src/agent-api/camera/CameraController.ts
/** AuraQuat is the C-06 type (packages/engine/src/contracts/sceneGraph.ts, "shared with C-22"); re-exported, not redeclared. */
import type { AuraQuat } from "../../contracts/sceneGraph";

export interface AuraCameraPose {
  readonly position: AuraVec3;
  readonly target: AuraVec3;          // look-at point
  readonly up: AuraVec3;              // default [0,1,0]
  readonly roll: number;              // radians around view axis, applied after up
  readonly fov: number;               // vertical degrees
  readonly near: number;
  readonly far: number;
  readonly orthographicSize?: number;
}

export interface AuraCameraSubject {
  readonly position: AuraVec3;        // interpolated
  readonly velocity: AuraVec3;        // finite-difference of interpolated position, springed
  readonly forward: AuraVec3;         // C-22 frozen field
  readonly bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }; // from AuraRuntimeNodeHandle.bounds()
  readonly rotation?: AuraQuat;       // CCR-08-2, interpolated
}

export interface AuraCameraProbe {
  sphereCast(from: AuraVec3, to: AuraVec3, radius: number): { readonly hit: boolean; readonly distance: number; readonly node?: string };
  occluders(from: AuraVec3, to: AuraVec3): readonly string[];
}

export interface AuraCameraRigContext {
  readonly dt: number;                // real seconds, clamped
  readonly time: number;
  readonly aspect: number;
  readonly previous: AuraCameraPose;
  subject(ref: string | AuraRuntimeNodeHandle): AuraCameraSubject | undefined;
  readonly probe: AuraCameraProbe;
}

export interface AuraCameraRig {
  readonly id: string;
  update(ctx: AuraCameraRigContext): AuraCameraPose;
  reset?(pose?: AuraCameraPose): void;
}

export interface AuraCameraLayer {
  readonly id: string;
  readonly timeDomain?: "real" | "sim";     // default "real"
  apply(pose: AuraCameraPose, ctx: { readonly dt: number; readonly reducedMotion: boolean }): AuraCameraPose;
  readonly energy?: () => number;            // > 0 while visibly active; feeds evidence
}

export interface AuraCameraEvidence {
  readonly kind: "aura-camera-presented";
  readonly rig: string;
  readonly pose: AuraCameraPose;            // exactly what was submitted
  readonly viewProjection: readonly number[]; // 16
  readonly layers: readonly { readonly id: string; readonly energy: number }[];
  readonly subjectScreenHeightFraction?: number;
  readonly cutThisFrame: boolean;
}

export interface AuraCameraController {
  presented(): AuraCameraPose;
  setPose(pose: Partial<AuraCameraPose>, options?: { readonly cut?: boolean }): void;
  setFov(fov: number, options?: { readonly halflife?: number }): void;
  setRoll(roll: number, options?: { readonly halflife?: number }): void;
  use(rig: AuraCameraRig, options?: { readonly blend?: number; readonly ease?: AuraEaseName }): void; // blend seconds; 0 = cut
  readonly rig: AuraCameraRig;
  addLayer(layer: AuraCameraLayer, order?: number): () => void;
  readonly shake: AuraTraumaLayer;          // built-in, always present
  readonly punch: AuraPunchLayer;           // built-in, always present
  readonly fovKick: AuraFovKickLayer;
  play(sequence: AuraCameraSequence): AuraCameraSequencePlayback;
  cut(): void;                               // resets springs + calls app.cutCamera() → C-14 resetTemporalHistory("camera-cut")
  evidence(): AuraCameraEvidence;
}

export interface AuraTraumaLayer extends AuraCameraLayer {
  add(amount: number): void;                 // clamps trauma to [0,1]
  configure(options: Partial<{ maxOffset: number; maxAngleDeg: number; frequency: number; decayPerSecond: number }> & Partial<{ maxYawDeg: number; maxPitchDeg: number; maxRollDeg: number; seed: number }> /* CCR-08-3 */): void;
}
export interface AuraPunchLayer extends AuraCameraLayer {
  trigger(options?: { readonly fov?: number; readonly dolly?: number; readonly attack?: number; readonly hold?: number; readonly release?: number }): void;
}
export interface AuraFovKickLayer extends AuraCameraLayer {
  set(channel: string, offsetDeg: number, halflife?: number): void;
}

// Rig factories (namespace camera.rigs)
export interface ChaseRigOptions {
  readonly target: string | AuraRuntimeNodeHandle;
  readonly distance?: number | { readonly base: number; readonly perSpeed?: number; readonly max?: number };
  readonly height?: number;
  readonly lookHeight?: number;
  readonly lookAhead?: { readonly seconds: number; readonly max: number; readonly halflife?: number };
  readonly armHalflife?: number;             // default 0.10
  readonly lookHalflife?: number;            // default 0.025
  readonly yawHalflife?: number;             // default 0.12
  readonly fov?: number | { readonly base: number; readonly perSpeed?: number; readonly max?: number; readonly halflife?: number };
  readonly bank?: { readonly gain: number; readonly maxDeg: number; readonly halflife?: number }; // roll from lateral accel
  readonly framing?: { readonly subjectHeightFraction: number };
  readonly collision?: boolean | { readonly radius?: number; readonly pullInHalflife?: number; readonly pushOutHalflife?: number };
}
export declare const rigs: {
  chase(o: ChaseRigOptions): AuraCameraRig;
  flight(o: ChaseRigOptions & { readonly horizonLock?: number; readonly followPitch?: number }): AuraCameraRig;
  follow2d(o: { target: string; deadZone?: { x: number; y: number }; lead?: number; platformSnap?: boolean; distance?: number; fov?: number; framing?: { subjectHeightFraction: number } }): AuraCameraRig;
  fighting(o: { fighters: readonly [string, string]; plane?: "xz-side"; minDistance?: number; maxDistance?: number; framing?: { subjectHeightFraction: number }; fov?: number }): AuraCameraRig;
  shoulder(o: { target: string; side?: 1 | -1; distance?: number; collision?: boolean }): AuraCameraRig;
  orbit(o: { target: AuraVec3 | string; distance: number; yaw?: number; pitch?: number; pitchLimits?: [number, number]; halflife?: number; collision?: boolean }): AuraCameraRig;
  topDown(o: { target: string | readonly string[]; pitchDeg?: number; height?: number; deadZone?: { x: number; y: number }; bounds?: { min: AuraVec3; max: AuraVec3 } }): AuraCameraRig;
  altitude(o: { target: string; ground: AuraVec3 | string; goal?: string; framing?: { subjectHeightFraction: number }; minDistance?: number; maxDistance?: number }): AuraCameraRig;
  rail(o: AuraCameraRailOptions): AuraCameraRig;
  static(pose: Partial<AuraCameraPose>): AuraCameraRig;
  fromSpec(spec: AuraCameraSpec): AuraCameraRig;    // LegacySpecRig
};

export interface AuraCameraRailOptions {
  readonly points: readonly AuraVec3[];             // ≥ 2
  readonly lookAt: string | AuraVec3 | readonly AuraVec3[];
  readonly fov?: number | readonly number[];         // per point
  readonly duration: number;
  readonly ease?: AuraEaseName;
  readonly loop?: "none" | "loop" | "pingpong";      // "loop" closes the spline (no end snap)
  readonly alpha?: number;                           // Catmull-Rom alpha, default 0.5 (centripetal)
}
export interface AuraCameraShot { readonly rig: AuraCameraRig; readonly duration: number; readonly blendIn?: number; readonly bars?: boolean }
export interface AuraCameraSequence { readonly id: string; readonly shots: readonly AuraCameraShot[]; readonly onEnd?: "hold" | "return" }
export interface AuraCameraSequencePlayback { readonly done: Promise<void>; skip(): void; readonly progress: number }

// packages/engine/src/agent-api/time/TimeController.ts
export interface AuraTimeController {
  scale: number;
  scaleTo(value: number, halflife: number): void;
  hitStop(seconds: number, options?: { readonly scope?: "global" | readonly (string | AuraRuntimeNodeHandle)[] }): void;
  slowMo(scale: number, seconds: number, options?: { readonly easeOut?: number }): void;
  readonly simTime: number;
  readonly realTime: number;
  readonly hitStopRemaining: number;
}

// AuraApp additions — pre-declared by PR 0a through C-38 AuraAppExtensionMap (camera, time, feel) and the flattened
// onRender (C-23). This lane registers the REAL factories with registerAppExtension({ member, flag: "A3D_QR_CAMERA" })
// from packages/engine/src/lanes/prd08.ts; it does not edit the AuraApp interface (index.ts:10680, owner 15).
export interface AuraApp {
  readonly camera: AuraCameraController;
  readonly time: AuraTimeController;
  readonly feel: AuraFeelBus;
  onRender(callback: (frame: { readonly alpha: number; readonly realDt: number; readonly simTime: number }) => void): () => void;
}

// Runtime handle additions — C-37 registerNodeHandleExtension("prd08.time") (pre-declared on AuraRuntimeNodeHandle,
// index.ts:10497, by PR 0a; rotation stays XYZ Euler AuraVec3)
export interface AuraRuntimeNodeHandle {
  interpolate: boolean;                      // default true
  timeScale: number;                         // default 1; set by hitStop scope
  teleport(x: number, y: number, z: number, rotation?: AuraVec3): this; // positional like setPosition; rotation Euler XYZ
}

// createAuraApp / createGameApp option addition — `accessibility` is pre-declared on AuraCreateAppOptions (C-38)
export interface AuraAppAccessibilityOptions {
  readonly reducedMotion?: GameAccessibilitySource;   // from game.accessibility.reducedMotion(); default reads matchMedia
}

// Loop options — frozen in C-23 (contracts/time.ts); `loop` is pre-declared on AuraCreateAppOptions (C-38)
export interface AuraLoopOptions {
  readonly fixedDt?: number;                 // default 1/60
  readonly maxSubSteps?: number;             // default 6 (C-23 comment)
  readonly maxFrameDt?: number;              // default 0.1
  readonly overload?: "slow-motion" | "catch-up"; // default "slow-motion"
  readonly interpolation?: boolean;          // default true
  readonly renderPerSubstep?: boolean;       // escape hatch, default false (§22)
}

// Feel bus — frozen in C-23
export interface AuraFeelEventSpec {
  readonly shake?: number;
  readonly punch?: { readonly fov?: number; readonly dolly?: number };
  readonly hitStop?: { readonly seconds: number; readonly scope?: "global" | "actors" };
  readonly haptics?: { readonly strong?: number; readonly weak?: number; readonly ms?: number };
  readonly audio?: { readonly cue: string; readonly pitchJitter?: number; readonly gainJitter?: number; readonly positional?: boolean }; // → C-25
  readonly vfx?: { readonly kind: string; readonly count?: number };   // → C-20 app.effects
  readonly screen?: { readonly flash?: number; readonly chroma?: number; readonly radialBlur?: number; readonly vignette?: number }; // → C-23 blackboard → C-13
}
export interface AuraFeelBus {
  define(event: string, spec: AuraFeelEventSpec): void;
  emit(event: string, at?: { readonly position?: AuraVec3; readonly actors?: readonly string[]; readonly strength?: number }): void; // C-23: string ids
  preset(name: "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm"): void;
  evidence(): { readonly emitted: number; readonly executed: Readonly<Record<string, number>> };
}

// Easing — AuraEaseName is frozen in C-22; the `ease` table and `damp` are lane-08 exports (PRD 09 tweens import them)
export type AuraEaseName = "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic" | "outBack" | "outElastic" | "inOutSine" | "outExpo";
export declare const ease: Record<AuraEaseName, (t: number) => number>;
export declare function damp(current: number, target: number, halflife: number, dt: number): number;

// Vehicle (lane-08 GameRuntime.ts)
export interface GameArcadeVehicleOptions { /* existing fields */ readonly model?: "unicycle" | "bicycle"; readonly mass?: number; readonly cgToFront?: number; readonly cgToRear?: number; readonly yawInertia?: number; readonly maxSteer?: number; readonly steerReferenceSpeed?: number; readonly tyre?: { readonly mu?: number; readonly B?: number; readonly C?: number }; readonly handbrakeRearGrip?: number; readonly dragCoefficient?: number; readonly rollingResistance?: number; readonly torqueCurve?: readonly (readonly [number, number])[]; readonly steerAssist?: number }
export interface GameArcadeVehicleState { /* existing: x, z, heading, speed, drift */ readonly lateralVelocity: number; readonly yawRate: number; readonly slipAngle: number; readonly drifting: boolean; readonly rpm: number; readonly lateralG: number }

// Platformer body / kit (lane-08 GameRuntime.ts, GameGenreKits.ts)
export interface GamePlatformerBodyOptions { readonly groundAccel?: number; readonly groundDecel?: number; readonly turnAccel?: number; readonly airControl?: number; readonly instantVelocity?: boolean; readonly presentation?: boolean }
export interface GamePlatformerLevel { /* existing */ readonly feel?: PlatformerFeel | false; readonly apexHangGravityScale?: number } // feel default "responsive" under A3D_QR_CAMERA; false = today's behaviour

// Controls (lane-08 agent-api/controls/; internal implementation wrapped by PRD 09's C-24 TouchControls, R16)
export interface AuraTouchControlsMount { readonly visible: boolean; show(): void; hide(): void; dispose(): void }
export declare function mountTouchControls(app: AuraApp, input: GameInputController, layout: GameTouchControlLayout, options?: { readonly autoHide?: boolean; readonly opacity?: number }): AuraTouchControlsMount;
export interface GameInputController { /* existing */ activeDevice(): "keyboard" | "gamepad" | "touch"; prompt(action: string): { readonly label: string; readonly glyph?: string }; consume(action: string): boolean }

// Audio: no new audio API in this PRD. Consumed from C-25 (packages/audio/src/contracts/gameSound.ts, PRD 09):
//   GameSound.setListener(pose), GameSound.engine({ cue, rpmRange, pitchRange }) → EngineLoopHandle.setRpm/setLoad,
//   GameSound.play(cue, { position, rate }), LoopHandle.setRate/setGain.
```

### 7.2 Change

All changes are gated by `A3D_QR_CAMERA` (sub-flags noted); with the flag off every row behaves as today (CONTRACTS §6.1).
The "Where" column names the owner; rows owned by another lane are delivered by that lane from a request.

| API | Change | Where |
|---|---|---|
| `scene().camera(spec)` | Still accepted; wrapped by `rigs.fromSpec`; spec object is frozen in dev (`Object.freeze`) when `createAuraApp({ camera: { freezeSpecs: true } })` (C-22, PR 0a option) so cast-mutation throws with a message pointing at `app.camera`. The freeze is applied by the lane-08 camera extension on each new scene snapshot. | 08 (`camera/extension.ts`) |
| `camera.follow({ smoothing })` | `smoothing` deprecated; `fromSpec` keeps the first-order filter with `halflife = ln2 / (-ln(1-s)·60)` (identical output, §6.3), dev warning once with the computed half-life. New options `halflife` (first-order, legacy-compatible) and, on rigs, spring half-lives. Converting a route from `smoothing` to a spring rig is a visible change and is applied per game by PRD 14 (Q-14-1). | 08 (`nodes/camera.ts`) |
| `game.racingCameraRig` / `game.platformerCameraRig` / `createGameRacingPresentationCamera` | Return `AuraCameraRig` (`rigs.chase` / `rigs.follow2d`) with new defaults instead of a spec with `smoothing 0.045`, when the flag is on. Old shape behind `{ legacySpec: true }` and always with the flag off. | 08 (`GameSceneGeometryBindings.ts`, `nodes/game/racingCamera.ts`); the `game.*` namespace keys stay in 09's `nodes/game/index.ts` and point at the same functions (no edit) |
| `createGameRacingCameraRig` | Remove the composition path/verdict-string gate (carved `nodes/game/racingCamera.ts`, from `index.ts:7641-7650`). | 08 |
| `camera.shake` / `camera.punchIn` (GameCameraRigs) | Become constructors for detached layers usable via `app.camera.addLayer`; `roll` and `distanceOffset` applied. | 08 |
| `game.cameraDirector` | Re-implemented as `rigs.fighting` + `app.camera.shake`; old `update()` returns the presented pose; `bind(app)` attaches. | 08 (`GameRuntime.ts`) |
| `FrameLoop` | `timeScale` reads `app.time` (R15); `maxFrameDt`; overload policy; `onTick` once per tick with alpha. | 08 |
| `GameAppRuntime.step` | Advances N substeps via `app.advance`, renders once on `onTick`. | 09 (Q-09-5); lane-08 `FixedStepDriver` gives the same behaviour to `createAuraApp` and the lane harness meanwhile |
| `gameFeel.hitStop` / `effectiveDt` | Forward to `app.time` when attached; `effectiveDt` kept for detached use. | 08 (`GameFeel.ts`) |
| `GameAudio.playPositional` / `setOcclusion`, `PositionalEmitter.update` | Real panner + lowpass; live playback rate on the playing node. | 09 (Q-09-1, Q-09-2) |
| `CameraChoreographer` `"catmull-rom"` | Real centripetal Catmull-Rom via `camera/Spline.ts`. | 08 |
| Platformer kit defaults | `feel: "responsive"` (fall ×1.6 + apex hang), accel/decel/air control on. | 08 (`GameGenreKits.ts`, `GameRuntime.ts`) |
| `game.racing` | `model: "bicycle"` + `VehicleChassis` presentation on by default. | 08 (`GameGenreKits.ts`) |

### 7.3 Remove (after deprecation window; flag removal per CONTRACTS §5.4)

- `createGameCameraRig` aggregator (GameCameraRigs.ts:525-596) — replaced by controller (lane 08).
- lean `createLeanCameraRig` and hash-noise shake (`packages/lean/src/game.ts:79, 140-163`) — become adapters over
  lane-08 `camera/leanAdapters.ts`; the edit to the lean file is Q-15-4.
- `runtimeAlpha` modulo computation (carved `app/frameAlpha.ts`, from `index.ts:11290-11302`; lane 08).
- `resolveCameraFrame` / `smoothedCameraFrames` (`index.ts:15696-15745`) once `fromSpec` owns the math — Q-15-1.
- `GameAudio` sine default cue (`playDefaultCue`, GameAudio.ts:485-503) — PRD 09, already a C-25 semantic
  (synthesized defaults removed under `A3D_QR_GAME`); no request needed beyond Q-09-4 confirmation.
- Evidence fields that report unapplied camera values (turbo/skyline `cameraDistance`, `maxShakeOffset` from inputs) —
  route-side removal by PRD 14 (Q-14-1); engine side (lane 08): `GameCameraEvidence` from `createGameCameraRig` removed.
- `apps/common/src/rapier-physics-proof.ts` from game startup (research 10 §6.3) — PRD 09's file; not requested by
  this lane (listed for traceability only).

### 7.4 Recommendation cost sheet

| Recommendation | Visual / feel benefit | GPU | CPU | Memory | Bundle (min+gz) | Mobile | Fallback |
|---|---|---|---|---|---|---|---|
| R1 Live camera controller + layers | Juice visible; no cast bugs; roll/bank | 0 | ≤ 0.05 ms | < 4 KB | +4 KB | none | `rigs.fromSpec` legacy path |
| R2 Spring rigs + framing solver | Subject locked and large; no horizon shrink at speed | 0 | ≤ 0.02 ms/rig | < 1 KB | +3–5 KB (tree-shaken per rig) | none | `static` rig / legacy |
| R3 Camera collision + occluder fade | No camera inside walls (courier black frames suspected, research 21); thin props fade | dither: +0–2 % fragment on faded draws | 1–3 sphere casts ≈ 0.02–0.1 ms | 0 | +1.5 KB | Low tier: 1 cast, no fade | collision off; near-plane clamp only |
| R4 6-DoF Perlin trauma | Organic shake, roll | 0 | < 0.01 ms | 0 | +0.8 KB | reduced-motion scaling | sine noise (current) |
| R5 Time controller + hit-stop consumed | Impacts land; slow-mo beats | 0 | ~0 | 0 | +1 KB | none | `scale = 1` |
| R6 Render once/tick + interpolation + dt clamp | No stutter at 120/144 Hz; no slow-mo below 30 fps; fewer GPU frames | −50 % on 2-substep ticks | ≤ 0.2 ms @ 500 handles | 80 B/handle | +1.5 KB | net win | `interpolation: false` |
| R7 Rail/sequence shots | Smooth intros, results, replays; no end snap | 0 | ~0 | spline LUT 256×16 B/rail | +2 KB | none | 2-point `path` mode |
| R8 Bicycle vehicle + chassis default | Real drift/slip, weight, body roll | chassis wheel draws (existing) | ≤ 0.02 ms/vehicle | < 1 KB | +2.5 KB | none | `model: "unicycle"` |
| R9 Platformer accel + responsive motion + squash | Weighty start/stop, crisp arcs | 0 | ~0 | 0 | +0.5 KB | none | `feel: false` + `instantVelocity: true` |
| R10 Touch kit + device prompts | Playable on phones; correct prompts | DOM compositing only | ~0 | DOM nodes | +3 KB | primary target | keyboard-only (current) |
| R11 Spatial audio + live loops + limiter (built by PRD 09 under C-25; this lane supplies listener pose + rpm) | Engine pitch, positional cues, no clipping | 0 | WebAudio thread: HRTF ≈ 0.02 ms/voice; equalpower ≈ 0 | panner per voice | +0.3 KB here (listener/rpm glue); graph cost counted by PRD 09 | equalpower, 8 voices | non-spatial (C-25 stub) |
| R12 Feel bus + presets | One declaration → camera/time/haptics/audio/VFX/screen | 0 here; channel GPU cost is the provider's (C-13 screen pass, C-20 particles) | < 0.01 ms/event | < 2 KB | +1.5 KB | haptics via `navigator.vibrate` | per-channel disable; stub providers count `executed` 0 |
| R13 Occluder fade chunk (C-02 `prd08.cameraFade`) | Thin props stop hiding the subject | +0–2 % fragment on faded draws only | per-node spring ≈ 0 | 0 | +0.6 KB (chunk source) | Low tier: off | `RenderItem.cameraFade` unset → no variant |

## 8. Shader changes

Camera, time, and controls are CPU systems; the view matrix (incl. roll) is built on the CPU. Three shader-level
changes are in scope or required as feeds:

### 8.1 View matrix with roll — no shader change

Target: `view = lookAtMat4(eye, target, upRolled)` where `upRolled = rollUpVector(forward, up, roll)` (Rodrigues; new
lane-08 helper in `packages/scene/src/MathTypes.ts`, next to `lookAtMat4` at `:90`). All PBR/WGSL code consumes
`u_viewProjection`/`u_cameraPosition` unchanged. `u_cameraPosition` must be the **presented** (post-shake) eye so
specular/fresnel stays consistent with the view; this holds standalone because `setPose` writes the presented eye
into the camera node, which `resolveCameraFrame(...).eye` (`index.ts:13857`) then reads.
`createViewProjection` (`index.ts:17758-17765`) is PRD 15's; it starts reading `spec.up`/`spec.roll` after CCR-08-1 and
Q-15-1. Until then the presented roll is reported in evidence with `rollApplied: false` and rendered as 0.

### 8.2 Occluder screen-door fade (new C-02 chunk, PBR + unlit)

For draws the probe reports as occluding the eye→subject segment, the lane-08 C-01 `collect` contributor
`prd08.occluderFade` sets the PR 0a pre-declared optional field `RenderItem.cameraFade?: number` (1 = opaque; CONTRACTS
§3.3 renderItem row). The fragment code is a C-02 `ShaderChunk` + `ShaderFeature` with id `prd08.cameraFade`, in the
lane-08 file `packages/rendering/src/shaders/camera-fade.glsl.ts`, inserted as the first statement of `main()` and
guarded by `#ifdef A3D_CAMERA_FADE`. The frozen legacy `ShaderLibrary.ts` (CONTRACTS §3.7, owner 01) is **not**
edited; the variants that would need it (`u_cameraPosition` declared at `:206`, `:719`, `:1249`, `:1786`, `:2413`) are
named in optional request Q-01-1 for an early legacy patch only if PRD 01 chooses to.

```glsl
uniform float u_cameraFade;
uniform vec2 u_cameraFadeOffset;   // per-frame pattern offset in pixels, integer 0..3 (see below)
float a3dBayer4(vec2 p) {
  ivec2 i = ivec2(mod(floor(p), 4.0));
  int idx = i.x + i.y * 4;
  const float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[idx] + 0.5) / 16.0;
}
// first statement in main():
if (u_cameraFade < 0.999 && a3dBayer4(gl_FragCoord.xy + u_cameraFadeOffset) >= u_cameraFade) discard;
```

WGSL twin: the chunk exports a `wgsl` string (C-02 `ShaderChunk.wgsl`) with
`if (u.cameraFade < 0.999 && bayer4(pos.xy + u.cameraFadeOffset) >= u.cameraFade) { discard; }` and `bayer4` as a
`const` array lookup. Wiring it into the packed per-draw buffer of `WebGPUDevice.ts` (`u_cameraPosition` at float
offset 164, `:2230`; append `cameraFade: f32`, `cameraFadeOffset: vec2<f32>` respecting 16-byte alignment) is PRD 11's
edit (Q-11-1). Shadow pass unaffected (occluder still casts; C-11 depth variants do not include the feature). Variant
key bit `cameraFade` so non-faded draws pay nothing (discard disables early-Z only on the faded variant). A static
Bayer pattern does **not** resolve under TAA, so `u_cameraFadeOffset` cycles through `(0,0) (2,2) (2,0) (0,2)` frame by
frame when `FrameContributorContext.frameIndex` is available and a C-13 TAA pass is registered; otherwise the offset
is held at `(0,0)` and the stipple is accepted. Fade target 0.3, spring half-life 0.08 s.

Stub reality: on the PR 0a C-02 stub, `generateProgram` throws `PROGRAM_GENERATOR_PENDING` and the cache wraps
`ShaderLibrary`, so the chunk does not reach production draws until C-02 is real (`A3D_QR_CORE=v2`). Standalone this
lane proves the chunk in `ChunkHarness` (pixel-coverage readback) and keeps the per-node fade state and evidence real;
the in-game fade is integrated acceptance (§16A).

### 8.3 Screen-feel uniforms (provided as C-23 `AuraScreenFeelUniforms`)

This lane publishes `{ flash, chroma, radialBlur, vignette, center }` every frame on the C-01 blackboard under
`SCREEN_FEEL_BLACKBOARD_KEY = "prd08.screenFeel"` (C-23) and in `diagnostics().camera.screenFeel`. PRD 03 owns the
pass that reads them (C-13). `center` is the vec2 NDC of the event, from the feel bus position projected through the
presented VP. Reference behaviour handed to PRD 03 as facts (C-40 `F-08-screenFeel`), not as an edit:
- radial blur: 8 taps along `(uv - center)`, step `0.012 · radialBlur`, weights `1 - i/8`, normalised;
- chroma: sample R at `uv + d·k`, B at `uv - d·k`, `d = (uv - 0.5)`, `k = 0.006 · chroma`;
- vignette pulse: `col *= 1 - vignette · smoothstep(0.35, 0.9, length(uv - 0.5))`;
- flash: `hdr += flash · flashColor` before exposure/tonemap.
All four short-circuit when the value is 0; on Low tier (C-27) only flash + vignette are published non-zero.
Standalone fallback: flash and vignette can be drawn by this lane as a DOM overlay (`feel/ScreenOverlay.ts`, opt-in
`feel.screenFallback: "dom"`), which counts as executed; chroma and radial blur count 0 until a C-13 consumer exists.

### 8.4 Velocity / temporal history (consumer of C-14)

`packages/rendering/src/TemporalHistory.ts:71-93` (PRD 03) builds the velocity pass from camera matrices only and
rejects skinned/morphed/transparent items (`:74`). This lane: (1) on `cut()` calls `app.cutCamera()` (C-38 flattened,
C-14 `resetTemporalHistory("camera-cut")`; stub calls the existing `temporalHistory.reset()` in `Renderer.ts`); (2) its
`prd08.interpolation` collect contributor fills the PR 0a pre-declared `RenderItem.previousModelMatrix` with the
previous *presented* (interpolated) model matrix. Both are inert until PRD 03's real C-14 path consumes them.

## 9. Rendering changes

1. Presented pose reaches the renderer through C-22 `setPose` → camera node (standalone). Retiring
   `resolveCameraFrame`/`smoothedCameraFrames` (`index.ts:15696-15745`) and reading `app.camera.presented()` in the
   C8 consumers is Q-15-1 (cleanup; no behaviour depends on it except roll).
2. Exactly one render per tick: `FixedStepDriver` uses the public `app.advance` (`index.ts:11582`) per substep and one
   `app.step(0)`; `createGameApp` adopts it via Q-09-5.
3. Renderer receives interpolated model matrices for runtime handles through the C-01 `collect` contributor
   `prd08.interpolation` (sub-flag `A3D_QR_CAMERA_INTERPOLATION`).
4. Camera cut → `app.cutCamera()` (C-14); rig blends do not reset history.
5. Projection: FOV, near and far from the presented pose (layers included) via `setPose`; near plane auto-adjust
   `near = clamp(0.02·distanceToSubject, 0.05, 0.5)` for chase/fighting/altitude rigs (depth-precision work itself is
   PRD 01's, C-08).
6. Siege Golf-style per-phase `setScene` remounts are replaced by `app.camera.use(rig, { blend })` (no remount, no blank
   frame) — route change by PRD 14 (Q-14-1).
7. Letterbox bars: DOM overlay in lane-08 `camera/layers/cinematicBars.ts` standalone; a C-13 composite hook is used
   when PRD 03 registers one (no request needed: the layer publishes its rect on the blackboard as `prd08.letterbox`).
8. Diagnostics (C-31 sections `camera` and `loop`, registered by this lane): `diagnostics().camera` =
   `AuraCameraEvidence`; `diagnostics().loop` = `{ realFps, simHz, substepsLast, overloadFrames, clampedFrames,
   renderSubmissionsLastTick }`. `realFps` counts presented frames per real second. The engine-wide fps counter
   honesty fix (research 20: engine reports 60 while harness measures 5–20 fps) is PRD 11's C-28 `FrameStats`; this
   lane's `loop.realFps` is independent and does not wait for it.

## 10. Migration plan

1. Phase 1 lands controller + `rigs.fromSpec` + loop fixes behind `A3D_QR_CAMERA` (flag-off is bit-identical,
   CONTRACTS §6.1). With the flag on and no `app.camera` calls, the only visible change is dt clamp and
   one-render-per-tick (both strict improvements). All 18 games keep working with the flag off and on.
2. Phase 2 ships rigs/layers; engine rig builders (`game.racingCameraRig`, `game.platformerCameraRig`) switch to new
   defaults when the flag is on. Games that call them (turbo, skyline, courier, others per research 10 §2: 7 + 7 call
   sites) visibly change once PRD 14 opts the route into `A3D_QR_CAMERA` (CONTRACTS §5.4); PRD 14 owns per-game retune
   and capture (Q-14-1).
3. Codemod `tools/camera-cast-codemod/index.mjs` (registered as `camera-cast` through C-39) rewrites the known
   `Object.assign(x as unknown as Mutable…, {...})` patterns (§2.2 G1 style a) into `app.camera` calls and prints a
   manual-migration list for style (b) direct writes (skyline `feel.ts:474-480`, blockfall `camera-feel.ts:85-91`) and
   any other write to a value typed as or derived from `AuraCameraSpec`. This lane runs it in **report mode** on
   `apps/` and `packages/create-aura3d/templates/` and commits the report to `evidence/prd08/camera-cast-report.md`;
   PRD 14 (routes) and PRD 13 (templates) apply it in their own files (R20, R21).
4. Templates (mini-game, racing-starter, fighting-game, character-controller, falling-blocks-starter) are rewritten by
   PRD 13 from this lane's C-40 facts F-08-* and the concrete per-template specs in Q-13-1 (rigs, feel bus, time
   controller, touch kit) — they are what agents copy (research 10 §10).
5. Skill update (both `create-aura3d` and `aura3d-cli` copies) adds a "Camera and feel" section and forbids
   evidence-only feel; written by PRD 13 from facts F-08-* (Q-13-2).
6. After the flag is `default-on` for two checkpoints (CONTRACTS §5.4): `freezeSpecs` default-on in dev, remove
   aggregator/lean shake (§7.3), remove the flag-off path.

### 10.1 Per-game impact matrix

What each shipped game gets from this PRD, what changes visibly, and what PRD 14 must do. "Phase 1 auto" = changes
that reach the game with no route edit once the route opts into `A3D_QR_CAMERA` (and, for `createGameApp` routes, once
Q-09-5 lands; until then those routes keep render-per-substep with the flag on). Loop regime from §2.3 T9; current
scores from research 21 (camera / polish_juice / mobile_presentation). The rightmost column is delivered to PRD 14 as
one `qr-request` ticket per row (Q-14-1). "audio.engine"/"panner" items use C-25 (PRD 09); "collision tags on world kit"
uses C-26 `world.ground()` plus a per-node `cameraBlocker` tag this lane reads (no request to PRD 10 needed).
"Phase 1 auto" for `createGameApp` routes means dt clamp and `maxSubSteps` immediately; one render per tick after
Q-09-5.

| Game | Scores now | Loop regime → Phase 1 auto effect | Camera today → target rig | Feel / time | Controls / audio | PRD 14 work items |
|---|---|---|---|---|---|---|
| aura-clash | 3 / 3 / 2 | headless `createGameApp {1/60,3}` → dt clamp; render coupling unchanged until route uses `onRender` | static perspective, orbits mid-fight → `rigs.fighting` (p 0.5) | combat `autoHitStop` (0.045/0.06 s) + `fighting` preset | touch kit replaces "HOLD SPACE"; sampled audio already | remove orbit; bind director; touch layout |
| mech-hangar | 3.5 / 2 / 1.5 | hand-rolled accumulator → none | static → `rigs.fighting` | `fighting` preset, hit-stop | touch kit; device prompts | port accumulator to `createGameApp` |
| turbo-drift-circuit | 3.5 / 2.5 / 3 | raw dt → none | follow spec + cast (`main.ts:2760`), capture-only smoothing bypass (`:2826-2830`) → `rigs.chase` + bank + speed FOV | `racing` preset; drift/boost events | `audio.engine` on rpm; touch steer | delete cast, magic composition strings (`:2789-2794`), `VISUAL_CAPTURE_CAMERA` bypass; bicycle model retune |
| courier-rush | 3 / 2 / 3 | raw dt → none | chase spec + cast (`main.ts:1394`) → `rigs.chase` + collision (suspected inside-geometry frames) | `racing`/`arcade` | touch kit | delete cast; `cameraBlocker` tags on world-kit nodes (route-side, read by this lane's probe) |
| pulse-tunnel | 2 / 2 / 1 | raw dt → none | chase, static FOV → `rigs.chase` with speed FOV + `fovKick` on beat | beat-synced punch | touch kit | wire beat events to `app.feel` |
| patrol-wing | 3 / 3 / 3 | `createGameApp {1/60,4}` → one render/tick, interpolation | chase spec + 3 casts (`main.ts:805, 854, 1051`) → `rigs.flight` (bank 0.6, horizonLock) | `arcade` preset | replace 11 text buttons with touch stick + 2 buttons; throttle → `audio.engine` | delete casts; `game.craft` |
| aurora-lander | 2 / 2 / 4 | hand-rolled → none | far static → `rigs.altitude` (lander 8–12 %) | land impact event | `audio.engine` thrust | port to `game.craft` |
| deep-recovery | 2.5 / 3 / 3 | raw dt (0.5 fps measured) → dt clamp prevents multi-second sim jumps | low/close chase → `rigs.chase` 15–25° pitch + occluder fade | — | positional sonar via panner | fps is PRD 11's (C-27/C-28); camera work proceeds independently |
| skyline-runner | 4 / 2 / 2 | hand-rolled → none | follow spec, direct writes (`feel.ts:474-480`), shake low-passed to ~7 % → `rigs.follow2d` (p 0.28) | `platformer` preset; land/jump events; squash/stretch | touch kit | replace `applyCameraShake` writes; remove unfiltered evidence numbers |
| blockfall-reactor | 2 / 2 / 3 | `createGameApp {1/60,2}` → one render/tick; slow-mo persists until L-10 | static + direct writes + frame-rate-dependent punch (`camera-feel.ts:76-91`) → `rigs.static` tilted + punch layer | `puzzle` preset (hard drop shake, line punch) | touch layout already; device prompts | L-10; delete `camera-feel.ts` punch |
| vault-breakers | 4 / 1 / 3 | `{1/60,2}` → as blockfall | static → `rigs.static` + nudge/tilt shake; ball framing | `arcade` preset | remove "HOLD SPACE" on touch | L-10; ball visibility (PRD 14) |
| bank-shot | 3 / 2 / 2 | `{1/60,2}` → as blockfall | static high 3/4 → `rigs.orbit` aim + `rigs.static` overview, blend between | `calm` preset; pocket punch | touch aim | L-10 |
| gallery-shift | 4 / 2 / 2 | `{1/60,2}` → as blockfall | fixed overview → `rigs.topDown` or `shoulder` (optional) | `calm` | touch kit | L-10 |
| rooftop-buckets | 4 / 3 / 3 | `{1/60,2}` + hoop-sim accumulator → as blockfall | low off-axis static → `rigs.static` + shot `rail` on score | score punch | touch aim | L-10; collapse double accumulator |
| siege-golf | 4.5 / 3 / 3.5 | `{1/60,2}` → as blockfall | per-phase `setScene` remount (`main.ts:975-985`) → `app.camera.use(rig, { blend })` + `rail` flyover | impact shake | touch aim | L-10; delete remount |
| gravity-post | 4 / 2.5 / 2.5 | raw dt → none | static → `rigs.chase`/`topDown` | `arcade` | remove keyboard prompts on touch | — |
| neon-swarm | 4 / 2 / 3 | raw dt → none | director computed and discarded (`main.ts:1667-1671`) → `rigs.topDown` + shake | `arcade`; `impact()` becomes visible | touch layout already | delete `void cameraState` |
| orbital-defense | 2 / 0.5 / 1 | `app.onFrame` time-driven → none | locked flat → `rigs.topDown` tilted + bounds | `arcade` (explode, hit) | add touch controls (none today) | build touch layout |

## 11. Backward compatibility

- With `A3D_QR_CAMERA` off (the default until the flag reaches `integrated-accepted`, CONTRACTS §5.3) nothing in this
  PRD changes a pixel or a timing: the C-22/C-23 stubs from PR 0a stay in effect, the C-01 contributors are not invoked,
  and `FrameLoop` keeps `maxSubSteps ?? 5` and today's clamp. The PR-time flag-off sentinel identity check
  (CONTRACTS §6.1) proves it on every lane PR.
- Scenes using `scene().camera(spec)` with no `app.camera` calls render identically with the flag on (same eye/target
  math via `rigs.fromSpec`, same smoothing via the mapping in §6.3). Verified by golden pose tests (task C-14).
- `smoothing` keeps working with a deprecation warning; behaviour identical.
- Cast-mutation of the spec keeps working until `freezeSpecs` becomes default-on (after flag `default-on`, §10 item 6)
  because `fromSpec` reads the spec object by reference every frame, same as today.
- `createGameApp({ loop })` signature unchanged; added fields optional (C-23 `AuraLoopOptions`). Behavioural change
  with the flag on: dt clamp and `maxSubSteps` default 5 → 6 (only callers that do not pass it) immediately; one render
  per tick once Q-09-5 lands. Routes that relied on render-per-substep for evidence counts (frame counters) must read
  `diagnostics().loop` instead; listed in release notes.
- Interpolation affects only the presented transform; `handle.position`/`handle.rotation` read by gameplay code remain
  the latest simulated values.
- `gameFeel.effectiveDt` kept. `game.cameraDirector().update()` keeps its return type.
- `createGameArcadeVehicle` default stays `"unicycle"` for direct callers; `game.racing` defaults to `"bicycle"` with
  the flag on (kit-level change, documented).
- Platformer kit default motion change is a feel change for kit users with the flag on (skyline unaffected: already
  uses `solvePlatformerMotion`). `feel: false` + `instantVelocity: true` restores old behaviour.
- Lean entry (`@aura3d/lean/game`) keeps its API; implementation delegates once Q-15-4 lands.

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table (with "blocking for Phase 1" and "blocked on 03") is replaced by
contracts. PRD 08 builds against each consumed contract's PR 0a/0b stub and never waits for the provider's real
implementation. What a stub can and cannot show decides whether a criterion is standalone (§16) or integrated (§16A).

### 12.1 Contracts provided

| ID | Name | Consumers | Stub that must keep working (PR 0a, CONTRACTS) | Real (this lane) |
|---|---|---|---|---|
| C-22 | CameraRig live API (`AuraCameraController`, `camera.rigs`, layers, sequences, evidence) | 03 (`cut()` → temporal reset), 09 (shell transitions, scenario `cameraPose`), 12 (M1-M6 evidence gates), 13 (templates, prompt camera mapping), 14 (games) | `presented()` reads the camera spec through the existing resolution; `setPose` writes the camera node; `use(rig)` = per-frame `rig.update` + `setPose`; `rigs.fromSpec`/`static` real, other factories return a static rig at the subject's bounds + spec offset with `capability-degraded`; layers applied (pure math); `cut()` calls C-14 `resetTemporalHistory`. Flag-off path forever until §5.4 removal. | `agent-api/camera/` (controller, rigs, springs, spline, framing, probe, occluder fade), `time/Interpolation.ts`; registered with `slot.provide(real)` + `registerAppExtension({ member: "camera" })` in `packages/engine/src/lanes/prd08.ts` |
| C-23 | Time controller, feel bus, screen-feel uniforms | 03 (screen-feel in post), 06 (per-actor `timeScale`), 07 (feel `vfx` → `app.effects`), 09 (`GameSession` delegates), 14 | `AuraTimeController` is real (pure state) and wired to `FrameLoop` via `setTimeScale` in PR 0b; screen-feel uniforms published, visible only in `diagnostics().camera.screenFeel`; `maxSubSteps ?? 5` unchanged | `agent-api/time/` (TimeController, FixedStepDriver, InterpolationContributor), `agent-api/feel/` (FeelBus, presets, Noise, ScreenOverlay, lint) |

Conformance suites (PRD 15-owned, must pass for `stub` and `real`): `tests/unit/contracts/C-22-camera.test.ts` (layer
order; reduced motion; spline arc-length; evidence equals presented), `tests/browser/contracts/C-22-presented.spec.ts`
(projected subject matches `subjectScreenHeightFraction` within 2 %), `tests/unit/contracts/C-23-time.test.ts` (scoped
hit-stop; slowMo ease; executed counts only real channels). This lane adds
`tests/unit/contracts/impl/prd08-{camera,time}.test.ts` that run the same suites against `real`.

Registry entries this lane provides into other contracts: C-01 contributors `prd08.interpolation`,
`prd08.occluderFade` (phase `collect`); C-02 chunk/feature `prd08.cameraFade`; C-23 blackboard keys
`prd08.screenFeel`, `prd08.letterbox`; C-31 sections `camera`, `loop`; C-34 lookLint rule `look/evidence-only-feel`;
C-37 handle extension `prd08.time`; C-38 app extensions `camera`, `time`, `feel` and option handling for `camera`,
`loop`, `accessibility`; C-39 codemod `camera-cast`, doctor rule `feel/evidence-only`, command `prd08 motion-report`;
C-30 scenes `prd08-motion-{chase-speed,impact-shake,flight-bank,collision,rail-shot,pacing-120}`; C-40 facts `F-08-*`.

### 12.2 Contracts consumed

| ID | Name | Provider | What PRD 08 uses | Day-0 stub behaviour relied on | Effect on acceptance |
|---|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 01 | `collect` contributors, `blackboard`, `frameIndex`, `FrameCamera.previousViewProjectionMatrix` | PR 0b-2: `collect` runs right after `collectRenderItemsWithDiagnostics` (`Renderer.ts:555`); contributors invoked only with their own flag on; `previousViewProjectionMatrix` may be null | interpolation + fade state standalone; previous VP integrated |
| C-02 | ShaderFeature/chunk registry, ProgramCache, ChunkHarness | 01 | `registerShaderChunk/Feature("prd08.cameraFade")` | registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary`; ChunkHarness real | chunk coverage standalone; in-game fade integrated |
| C-06 | Scene graph transforms, `AuraQuat` | 01 | `AuraQuat`, `eulerToQuaternion` for interpolation and rigs | `eulerToQuaternion` delegates to `eulerToQuat` (`index.ts:5345`, ZYX) | standalone (this lane's XYZ conversion uses `@aura3d/math` `Euler`/`Quaternion` and is tested against the stub) |
| C-08 | Frame uniforms, `CameraLike` | 01 | presented pose as `CameraLike` for chunks | `buffer: null`; chunks read legacy `u_cameraPosition`/`u_viewProjection` | standalone |
| C-13 | PostPass registry | 03 | consumer of `prd08.screenFeel`; TAA presence for fade offset cycling | post graph on today's target; no screen-feel consumer | screen channel (chroma/radial blur) integrated; flash/vignette DOM fallback standalone |
| C-14 | Velocity / temporal history | 03 | `resetTemporalHistory("camera-cut")` via `app.cutCamera()`; `RenderItem.previousModelMatrix` | `resetTemporalHistory` calls the existing `temporalHistory.reset()`; fields inert | cut call count standalone; no TAA smear on cuts integrated |
| C-19 | AnimationPlayback API | 06 | per-actor freeze reads `handle.timeScale`; landing/anticipation clip names for feel presets (optional) | `crossFadeTo` → existing `node.play`; `animationState()` real read | scoped hit-stop freezes positions standalone; animation-time freeze integrated |
| C-20 | `app.effects` | 07 | feel `vfx` channel → `app.effects.burst(kind, position, { count })` | primitive-pool bursts through C-37 `add`, reported `pixelBacked` | `vfx` executes standalone (primitive pool); particle-pass look integrated |
| C-24 | GameShell, Session, Touch, CaptureContext | 09 | `CaptureContext` (`freezeAt`, `cameraPose`) read by the controller; `GameSession.reducedMotion` as a reduced-motion source; PRD 09 wraps `mountTouchControls` | `createGame` wraps `createGameApp`; `captureFromUrl` real; `touch` delegates to `game.touchControls` | standalone (this lane only reads) |
| C-25 | Game audio | 09 | `setListener`, `play`, `loop`, `engine().setRpm/setLoad` | engine wraps today's `GameAudio.ts`; `engine()` rate change by restarting the voice; `proof().synthCues` counted | listener/rpm calls standalone (call counts); audible pitch/pan integrated |
| C-26 | World queries | 10 | `world.ground()` for camera ground clamp and altitude rig | `ground()` raycasts the physics world via lane-08 `Raycast.ts`, else plane `y = 0` | standalone |
| C-27 | QualityTier settings | 11 | per-tier probe casts, handle caps, panning model hint passed to C-25, screen-feel tier gating | `QUALITY_TIERS` real; `"auto"` → high desktop / medium coarse pointer | standalone |
| C-28 | Device counters, FrameStats | 11 | `readbacksThisFrame === 0`; render submission count cross-check | probe/counters partial | standalone (lane counts its own submissions) |
| C-30 | Benchmark scene registry | 12 | lane scenes `prd08-motion-*`, `<owner>-<slug>` ids, `strip` spec | registry wraps the 18 scenes + lane indices | standalone |
| C-31 | Diagnostics sections | 12 | sections `camera`, `loop` | each key present with null/empty values; `qrFlags` real | standalone |
| C-32 | VisualReview rubric / judgement | 12 | judging motion strips at checkpoints | schema + `judgeWithPrism` screening | screening only; acceptance only at G-PANEL (§16A) |
| C-33 | Capture harness, step plugins | 12 | `steps/strip.mjs` (12 frames), `steps/webm.mjs` (5 s), `--flags` | today's capture scripts + plugin loading + `--flags` passthrough (PR 0b-3) | standalone captures of lane scenes |
| C-34 | lookLint rule registry | 13 | `registerLookLintRule({ code: "look/evidence-only-feel", owner: "prd08" })` | registry and host real in PR 0b | standalone |
| C-36 | SceneCompiler extension points | 15 | `SceneCompileContext.flags`, `DIAGNOSTIC_ONLY_FIELDS` for CCR-08-1 fields until Q-15-1 | wraps the moved legacy compiler | standalone |
| C-37 | Node-handle extensions | 15 | `prd08.time` (`interpolate`, `timeScale`, `teleport`) | `timeScale` plain field = 1; `teleport` = `setPosition` + `interpolate = false` for one frame | standalone |
| C-38 | App surface extension registry | 15 | real factories for `camera`, `time`, `feel`; options `camera`, `loop`, `accessibility`; flattened `onRender`, `cutCamera` | real in PR 0 (stub factories under owner `prd15`) | standalone |
| C-39 | CLI command / codemod / doctor registry | 15 | `camera-cast` codemod, `feel/evidence-only` doctor rule, `prd08 motion-report` | real in PR 0 | standalone |
| C-40 | Facts handoff | each → 13 | facts F-08-* (rig-by-genre table, framing fractions, feel presets, touch kit usage, forbidden patterns) | n/a | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R15 (this lane owns `AuraTimeController` and
`FrameLoop.ts`; PRD 09's `GameSession` delegates), R16 (touch: PRD 09's C-24 API is public; this lane's
`controls/TouchControls.ts` is the internal implementation), R17 (all audio is PRD 09's; this lane consumes
`setListener`), R20 (templates and skills are PRD 13's), R21 (routes are PRD 14's; this lane ships `camera-cast`).

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 08 never waits: each row says what this lane does in
the meantime; any criterion that depends on the request moves to the first checkpoint after it lands.

| ID | To | File / exact change | Contract | Meanwhile (this lane) |
|---|---|---|---|---|
| Q-01-1 | 01 | Optional: legacy patch adding `#ifdef A3D_CAMERA_FADE` + `u_cameraFade`/`u_cameraFadeOffset` + Bayer-4 discard (§8.2 GLSL) as first statement of `main()` in the PBR fragment variants declaring `u_cameraPosition` (`ShaderLibrary.ts:206, 719, 1249, 1786, 2413`) and the unlit variant. May be declined under §3.7 (legacy frozen). | C-02, §3.7 | fade only on generated programs; fade state + evidence real |
| Q-03-1 | 03 | A C-13 post pass that reads blackboard `prd08.screenFeel` (`AuraScreenFeelUniforms`, reference behaviour in §8.3 / fact F-08-5) and sets `blackboard.set("prd08.screenFeel.consumed", true)` in the frames it applied; Low tier applies flash + vignette only. | C-23, C-13 | DOM fallback for flash/vignette; chroma/radial blur count 0 |
| Q-09-1 | 09 | `GameAudio.ts:345-386` `playCue`: real `PannerNode` when `spatial` (HRTF on high/ultra, equalpower otherwise; `distanceModel "inverse"`, refDistance 1, rolloff 1); `setOcclusion` (`:415-421`) inserts a `BiquadFilterNode` lowpass, cutoff `20000·(1-occ)^2 + 400` Hz, smoothed. | C-25 | listener pose sent each frame; pan acceptance integrated |
| Q-09-2 | 09 | `AudioSource.setPlaybackRate(rate, rampMs)` (already declared in C-25) and `PositionalEmitter.ts:232` calling it instead of assigning the JS field, so doppler and loops change a playing node (`AudioSource.ts:43-51` copies rate only at node creation today). | C-25 | rpm sent via `engine().setRpm`; stub restarts voice |
| Q-09-3 | 09 | Master limiter (threshold −6 dB, ratio 12, knee 6), per-cue pitch/gain jitter, per-cue voice limit 4 oldest-steal; these are the numbers this lane's feel presets assume. | C-25 | feel `audio` channel passes `rate`/`volumeDb` jitter itself |
| Q-09-4 | 09 | Confirm the 176 Hz default cue (`playDefaultCue`, `GameAudio.ts:485-503`) is removed under `A3D_QR_GAME` per C-25 semantics. | C-25 | none needed |
| Q-09-5 | 09 | `GameAppRuntime.ts:151-153`: under `A3D_QR_CAMERA_LOOP`, replace `loop.onFrame(f => app.step(f.dt))` with `loop.onFrame(f => app.advance(f.dt))` plus `loop.onTick(() => app.step(0))` (one render per tick; `onTick` added by this lane to `FrameLoop.ts`); forward `frame.alpha` to `app.onRender` subscribers. | C-23 (R15) | `FixedStepDriver` gives the same behaviour to `createAuraApp` users and the lane harness |
| Q-09-6 | 09 | `createGame` calls lane-08 `bindFeelSound(app, sound)` after creating the C-25 engine, and maps `GameSession.reducedMotion` into `createAuraApp({ accessibility: { reducedMotion } })`. | C-24, C-25 | lane harness binds a fake `GameSound` itself |
| Q-11-1 | 11 | `WebGPUDevice.ts:2230` packed per-draw buffer: append `cameraFade: f32`, `cameraFadeOffset: vec2<f32>` (16-byte aligned, bump size) and splice the `prd08.cameraFade` chunk's `wgsl` twin into the PBR fragment. | C-02, C-29 | WebGL2 only; WebGPU fade integrated |
| Q-11-2 | 11 | Export a sphere-sweep query over `performance/BVH.ts` from the rendering public entry (`sphereSweep(from, to, radius) → { hit, distance, nodeId }`). | C-28 | AABB-list sweep in `camera/Probe.ts` |
| Q-13-1 | 13 | Template rewrites with the exact specs of tasks D-1…D-5 (§14), using `app.camera.use(camera.rigs.*)`, `app.feel.preset`, `app.time`, `mountTouchControls` (through C-24 `createGame({ touch })` where the template is on `createGame`). | C-22, C-23, C-40 (R20) | lane harness and motion scenes carry standalone acceptance |
| Q-13-2 | 13 | Both `aura3d-browser-game/SKILL.md` copies: "Camera and feel" section from facts F-08-1…F-08-6 (rig-by-genre table §6.4, framing fractions, presets §14 F-3, `app.time`, touch kit, "never write shake/punch/director output to evidence only"); canonical snippet sets a rig. | C-40 | facts table committed in `evidence/prd08/facts.md` |
| Q-13-3 | 13 | `tests/templates`: each game template calls `app.camera.use` with a non-static rig (except falling-blocks), defines or presets ≥ 3 feel events, mounts touch controls, and passes doctor rule `feel/evidence-only`. | C-39 | — |
| Q-14-1 | 14 | One ticket per §10.1 row: opt the route into `A3D_QR_CAMERA`, run `aura3d codemod camera-cast --write`, apply the target rig and feel preset, remove explicit `loop.maxSubSteps: 2` (L-10: bank-shot `main.ts:391`, blockfall `:668`, gallery `:1137`, rooftop `:761`, vault `:410`, siege-golf `:884`), replace siege-golf per-phase `setScene` (`:975-985`), delete neon-swarm `void cameraState` (`:1667-1671`). Before/after captures attached. | C-22, C-23 (R21) | game outcomes integrated only |
| Q-14-2 | 14 | Turbo: drop the composition-report strings passed to `createGameRacingCameraRig` (`apps/showcase-turbo-drift-circuit/src/main.ts:2789-2794`) and the capture-only smoothing bypass (`:2826-2830`). | C-22 | the gate removal makes the strings ignored, so nothing breaks before this lands |
| Q-14-3 | 14 | `tests/unit/apps/skyline-player-feel.test.ts`: assert presented shake from `diagnostics().camera.layers` instead of the route's unfiltered numbers. | C-22, C-31 | lane gate `tests/qr/prd08/browser/camera-feel.spec.ts` |
| Q-15-1 | 15 | `index.ts:17758-17765` `createViewProjection`: up = `rollUpVector(forward, spec.up ?? [0,1,0], spec.roll ?? 0)` (helper in lane-08 `MathTypes.ts`); after golden parity (task C-14) delete `resolveCameraFrame`/`smoothedCameraFrames` (`:15696-15745`) and point the C8 consumers at `app.camera.presented()`. Requires CCR-08-1. | C-22, C-36 | roll reported, rendered 0 |
| Q-15-2 | 15 | `createAuraApp` render dt `index.ts:11328` and the twins at `:12319, :12382`: clamp `delta` to `[1, DEFAULT_MAX_FRAME_DT·1000]` ms (constant exported by lane-08 `app/frameLoopDefaults.ts`). | C-23 | `FixedStepDriver` path is clamped |
| Q-15-3 | 15 | Runtime frame payloads at `index.ts:11508, 11694`: take `alpha` from lane-08 `app/frameAlpha.ts` `currentFrameAlpha(app)` instead of the local modulo. | C-23 | `onRender` from `FixedStepDriver` carries alpha |
| Q-15-4 | 15 | `packages/lean/src/game.ts:79, 140-163`: `createLeanCameraRig` and the hash-noise shake delegate to `camera/leanAdapters.ts`. | C-22 | adapters tested in lane |
| Q-15-5 | 15 | `@aura3d/controls` README: "viewer controls; game cameras use `app.camera`". | — | — |
| Q-15-6 | 15 | Retire the "fired/adopted" assertions in `tests/browser/{gamefeel-camera-rigs,route-gamefeel-adoption,game-runtime-visual}.spec.ts` and `tests/unit/game-runtime/game-runtime-source-gates.test.ts` once the lane replacements in `tests/qr/prd08/` are green (record the route each replacement fails on with pre-change code). | — | lane replacements run in `qr-prd08-camera.yml` |
| CCR-08-1 | 15 + consumer 09 | `AuraCameraSpec.up?: AuraVec3`, `roll?: number`; listed in `DIAGNOSTIC_ONLY_FIELDS` until Q-15-1 | C-22, C-36 | roll in evidence only |
| CCR-08-2 | 15 + consumer 14 | `AuraCameraSubject.rotation?: AuraQuat` | C-22 | rigs use `forward` |
| CCR-08-3 | 15 + consumer 14 | `AuraTraumaLayer.configure` per-axis `maxYawDeg?/maxPitchDeg?/maxRollDeg?`, `seed?` | C-22 | `maxAngleDeg` for all axes; seed from layer id hash |

PRD 06, 07 and 10 need no request from this lane: PRD 06 already reads `handle.timeScale` (C-23), PRD 07 auto-mounts
effects from the feel bus through C-20, and PRD 10's `world.ground()` stub already routes to lane-08 `Raycast.ts`.

---

## Parallel execution

### Day-0 start conditions

PRD 08 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`packages/engine/src/contracts/{flags,camera,time,sceneGraph,effects,game,world,diagnostics,looks,compiler,runtimeNodes,app}.ts`
and `stubs/*.ts`; `packages/rendering/src/contracts/{core,frameGraph,program,frameUniforms,velocity,quality,device,renderItem}.ts`
(incl. the pre-declared `RenderItem.cameraFade?` and `previousModelMatrix?`) and `testing/ChunkHarness.ts`;
`packages/audio/src/contracts/gameSound.ts`; `packages/aura3d-cli/src/contracts/commands.ts` and
`commands/prd08/index.ts`; lane barrels `packages/*/src/lanes/prd08.ts`, `agent-api/compiler/diagnosticOnly.prd08.ts`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd08/index.ts`; the C-22/C-23 conformance suites
passing on stubs. Nothing from any other lane's real implementation is needed.

Work in new lane-08 files and in lane-08 existing files (`FrameLoop.ts`, `GameCameraRigs.ts`, `GameFeel.ts`,
`GameRuntime.ts`, `GameGenreKits.ts`, `GameSceneGeometryBindings.ts`, `CameraChoreographer.ts`, `PlatformerMotion.ts`,
`VehicleChassis.ts`, `MathTypes.ts`, `packages/input/`, `packages/physics/src/{Raycast,ScenePhysicsBridge}.ts`) starts
on day 0. The three carved modules owned by this lane (`nodes/camera.ts`, `nodes/game/racingCamera.ts`,
`app/{frameAlpha,frameLoopDefaults}.ts`) exist after PR 0b-1 (≤ 2026-10-07); until then the replacement code is written
in `camera/` / `time/` and wired after the merge. The C-01 `collect` hook is live after PR 0b-2; until then the
interpolation and fade contributors are unit-tested by calling `collect()` directly. Capture strip/WebM plugins are
live after PR 0b-3; until then the lane harness records frames itself with Playwright in `qr-prd08-camera.yml`.

### Owned files and directories (must match CONTRACTS §4.1 row 08)

`packages/engine/src/agent-api/{camera,feel,time,controls,vehicle}/`;
`packages/engine/src/agent-api/{GameCameraRigs,CameraChoreographer,GameGenreKits,GameSceneGeometryBindings,PlatformerMotion,VehicleChassis,FrameLoop,GameRuntime,GameFeel}.ts`
(`GameRuntime.ts` minus the effects regions carved to PRD 07's `vfx/gameEffects.ts`);
`packages/engine/src/agent-api/app/{frameAlpha,frameLoopDefaults}.ts`; `packages/engine/src/agent-api/nodes/camera.ts`;
`packages/engine/src/agent-api/nodes/game/racingCamera.ts`; `packages/rendering/src/shaders/camera-fade.glsl.ts`;
`packages/input/` (except `src/TouchLayouts.ts` → 09 and `src/controls/` → 15);
`packages/physics/src/{Raycast,ScenePhysicsBridge}.ts`; `packages/scene/src/MathTypes.ts`;
`benchmarks/quality-rebuild/motion/`; `tools/camera-cast-codemod/`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file; `docs/project/aura3d-quality-rebuild/evidence/{prd08,prd-08}/`;
`packages/*/src/lanes/prd08.ts`; `agent-api/compiler/diagnosticOnly.prd08.ts`; `packages/aura3d-cli/src/commands/prd08/`;
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd08/`; `.github/workflows/qr-prd08-*.yml`;
`tests/qr/prd08/`; `tests/unit/contracts/impl/prd08-*`. Explicit test owner: `tests/unit/engine/game-feel.test.ts` (§4.1
creator row); by first-import rule also `tests/unit/engine/{fixed-step-determinism,game-camera-rigs,platformer-motion,vehicle-chassis}.test.ts`.

Tasks of the earlier draft that edited files owned by other lanes were moved to §12.3: `index.ts` outside the carves,
`app/createAuraApp.ts`, `app/runtimeNodes.ts`, `packages/lean/src/game.ts`, the old gate tests (15); `GameAppRuntime.ts`,
`GameAudio.ts`, `PositionalEmitter.ts`, `AudioSource.ts` (09); `ShaderLibrary.ts` (01); `WebGPUDevice.ts` (11);
templates, skills, `tests/templates` (13); `apps/showcase-*` routes and `skyline-player-feel.test.ts` (14);
`packages/aura3d-cli/src/cli.ts` (05, replaced by the C-39 registry); `browser-matrix.yml` and root playwright configs
(12, replaced by the lane workflow and lane config).

### Extension points used in files owned by others

| Host file (owner) | Extension point | What this lane plugs in |
|---|---|---|
| `renderer/FrameGraph.ts` (01) | C-01 `registerFrameContributor` | `prd08.interpolation`, `prd08.occluderFade` (`collect`); blackboard `prd08.screenFeel`, `prd08.letterbox` |
| program registry (01) | C-02 `registerShaderChunk/Feature` | `prd08.cameraFade` |
| `app/createAuraApp.ts` (15) | C-38 `registerAppExtension` | real `camera`, `time`, `feel` factories; reads `camera`, `loop`, `accessibility` options |
| `app/runtimeNodes.ts` (15) | C-37 `registerNodeHandleExtension("prd08.time")` | `interpolate`, `timeScale`, `teleport` |
| diagnostics host (15/12) | C-31 `registerDiagnosticsSection` | `camera`, `loop` |
| `looks/` lint host (13) | C-34 `registerLookLintRule` | `look/evidence-only-feel` |
| `cli.ts` dispatch (05) / registry (15) | C-39 `registerCodemod`, `registerDoctorRule`, `registerCliCommand` | `camera-cast`, `feel/evidence-only`, `prd08 motion-report` |
| `benchmarks/quality-rebuild/shared/registry.ts` (12) | C-30 lane scene index | `prd08-motion-*` scenes |
| `capture-games.mjs` / `capture.mjs` (12) | C-33 step plugins + `--flags` | uses PRD 12's `strip`/`webm` steps; no new plugin needed |
| `GameSession` (09) | C-24 delegation (R15) | provides `app.time` as the target |
| `GameSound` slot (09) | C-25 | listener pose, rpm/load, feel cues |
| `app.effects` (07) | C-20 | feel `vfx` bursts |
| `resetTemporalHistory` (03) | C-14 via `app.cutCamera()` | camera cuts |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_CAMERA` | bool | every behaviour in this PRD: real C-22/C-23 factories, rig defaults in kit builders, `fromSpec` path, layers on the presented pose, feel bus dispatch, bicycle/platformer kit defaults, touch auto-mount in kits, `freezeSpecs` availability | `camera.legacy: true` (inverse) |
| `A3D_QR_CAMERA_LOOP` | bool | `maxFrameDt` clamp, `maxSubSteps` 6, overload policy, `onTick`, `FixedStepDriver` | `loop.renderPerSubstep: true` (inverse escape hatch) |
| `A3D_QR_CAMERA_INTERPOLATION` | bool | `prd08.interpolation` contributor and handle prev/curr capture | `loop.interpolation: false` (inverse) |

Sub-flags require the lane flag (CONTRACTS §5.2). CI runs conformance with `none`, `all`, and `camera` alone (§5.4).

### Stubs used

C-01 (collect after `collectRenderItemsWithDiagnostics`; `previousViewProjectionMatrix` may be null), C-02
(`PROGRAM_GENERATOR_PENDING`; ChunkHarness real), C-06 (`eulerToQuat` ZYX delegate), C-08 (`buffer: null`), C-13 (no
screen-feel consumer), C-14 (reset → existing `temporalHistory.reset()`), C-19 (`node.play` mapping), C-20
(primitive-pool bursts), C-24 (`createGame` wraps `createGameApp`), C-25 (wraps `GameAudio.ts`, restart-voice rate),
C-26 (`ground()` → lane-08 `Raycast.ts`, else `y = 0`), C-27 (real data), C-28 (partial counters), C-30/C-31/C-33
(registry, null sections, today's capture + plugins), C-34/C-36/C-37/C-38/C-39 (real or wrapping legacy). This lane's
own C-22/C-23 stubs stay the flag-off path until CONTRACTS §5.4 removal.

### Requests to other lanes (non-blocking)

See §12.3 (Q-01-1, Q-03-1, Q-09-1…Q-09-6, Q-11-1…Q-11-2, Q-13-1…Q-13-3, Q-14-1…Q-14-3, Q-15-1…Q-15-6, CCR-08-1…CCR-08-3).
None gates a lane-08 merge or a standalone criterion.

### Integration checkpoints

Integrated acceptance (§16A) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_CAMERA` on inside
`qr_flags=all`, and never blocks a PRD 08 merge:
- IC-0 (2026-10-08): flags `none` baseline; this lane records motion-scene and per-game camera/loop baselines
  (`diagnostics().loop.renderSubmissionsLastTick`, sim-speed ratio, `subjectScreenHeightFraction`).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening (vision-only via C-32, recorded, cannot accept).
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds; the only rounds that can move
  `A3D_QR_CAMERA` to `integrated-accepted` and satisfy §16A. Leave-one-out (`all,-camera`) attributes regressions.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7); the flag is not
promoted, and nothing else happens.

## 13. Implementation phases

Each phase's exit criteria are met on a GitHub Actions `macos-14` run (Chromium, ANGLE Metal) of the lane workflow
`.github/workflows/qr-prd08-camera.yml`, with the run id recorded in
`docs/project/aura3d-quality-rebuild/evidence/prd08/<phase>.md`. Phase exits use **standalone** criteria only (S-ids,
§16). Phase 1 starts on day 0. Phases 2–5 depend only on Phase 1 outputs and the PR 0b merges, not on each other, and
can run in parallel inside the lane. No phase waits for another lane; integrated criteria (I-ids, §16A) are evaluated
at checkpoints and never gate a phase exit. Motion strips are captured from Phase 2 on and screened with C-32; screening
is recorded, it does not accept.

**Phase 1 — Day 0: loop, time, math primitives, controller skeleton (2026-10-05 →; new files + lane-08 files only).**
- Work: `FrameLoop.ts` (L-1, L-2, L-3 behind `A3D_QR_CAMERA_LOOP`); `time/{TimeController,FixedStepDriver}.ts`
  (T-1…T-5, L-4); `time/Interpolation.ts` store (L-7, unit level); `camera/{Spring,Spline,framing}.ts`,
  `feel/Noise.ts` (C-8, Q-1, R-10, Y-1); `camera/CameraController.ts` + `rigs/{fromSpec,static}.ts` (C-1, C-2, C-6,
  C-7) built against the C-22 contract types; golden fixture recording (C-14 — the originals stay in `index.ts`, so the
  recording can happen at any time); `MathTypes.ts` `rollUpVector` + quat helpers (C-4 part); `vehicle/BicycleModel.ts`
  (V-1, pure); `tools/camera-cast-codemod/` (D-8); lane workflow, `tests/qr/prd08/` scaffolding,
  `playwright.prd08.config.ts`, lane harness page; motion scene skeletons M1–M6 registered under
  `benchmarks/quality-rebuild/scenes/prd08/`; IC-0 flag-`none` baseline capture of the lane scenes.
- Exit: S1, S2, S3 (store-level, contributor called directly), S4, S5 (global scope), S16 (typecheck, lint, unit,
  C-22/C-23 conformance on `stub` and `real`, flag-off sentinel identity), S17 (codemod fixtures).

**Phase 2 — Rigs, springs, layers, collision (needs Phase 1; wiring after PR 0b-1/0b-2, ≤ 2026-10-07).**
- Scope: C-3, C-5 (lane side), C-9…C-13, R-1…R-12, Y-1…Y-7, S-1…S-2; C-38 `camera` extension registration; C-01
  `prd08.interpolation` contributor wiring (L-7) and `prd08.occluderFade`; C-37 `prd08.time`.
- Exit: S3 (end-to-end on the lane harness), S6, S7, S8, S15, S9 for M1–M4.

**Phase 3 — Feel bus, hit-stop consumers, screen-feel publication, cinematic rails.**
- Scope: F-1…F-7, T-6…T-8, Q-1…Q-5 (sequence/rail), S-3, Y-6 DOM fallback.
- Exit: S5 (scoped), S10, S11, S9 for M5.

**Phase 4 — Motion models, controls, audio glue.**
- Scope: V-1…V-7, P-1…P-6, I-1…I-7, A-3, A-5, A-10 (the lane-08 audio glue; the rest of A is §12.3 Q-09-*).
- Exit: S12, S13, S14, S18, S9 for M6.

**Phase 5 — Facts, codemod/doctor hand-off, deprecations, request filing.**
- Scope: D-6 (facts F-08-*), D-8, X-1, X-2 (engine side), X-5, X-7 (lane replacements); file every §12.3 request and
  CCR with its patch or spec attached.
- Exit: S17 (doctor rule + codemod report on `apps/` and templates committed), S19 (per-tier budgets on the lane
  harness), every §12.3 item filed with an issue link in `evidence/prd08/requests.md`; flag `A3D_QR_CAMERA` moves to
  `standalone-accepted` (CONTRACTS §5.3) when S1–S19 are green on one lane CI run.

**Phase 6 — Integrated acceptance (checkpoint-driven, never blocks merges).**
- Exit (= completion, §21): §16A criteria met at a G-PANEL round with `A3D_QR_CAMERA` on in `all`; human + vision
  sign-off recorded; flag reaches `integrated-accepted`, then `default-on` after two clean checkpoints.

## 14. Task checklist

Every task edits only lane-08 paths (§Parallel execution) unless it says "request". Tests live under
`tests/qr/prd08/` (lane-owned) unless an existing lane-08 test file is named. "flag" means
`resolveQrFlags(...).on("A3D_QR_CAMERA")` (or the named sub-flag); every behaviour change is inert with the flag off.

### Loop and interpolation (L)

- [x] L-1 `packages/engine/src/agent-api/FrameLoop.ts`: add `maxFrameDt` option (default 0.1, applied only with
  `A3D_QR_CAMERA_LOOP`); clamp `dt` in `tick()` (`:179-185`, the `dt` computed at `:181`) and in `step()` (`:124-126`,
  before `* this.timeScale`). Count clamped ticks as `clampedFrames` in `snapshot()`. Unit test in
  `tests/unit/engine/fixed-step-determinism.test.ts` (lane 08): a 2.0 s rAF gap advances sim by exactly
  `min(maxFrameDt, maxSubSteps·fixedDt)` and increments `clampedFrames` by 1; with the flag off the old result holds.
- [x] L-2 `FrameLoop.ts:62` and carved `app/frameLoopDefaults.ts` (`DEFAULT_MAX_SUBSTEPS`, from `index.ts:7061` and
  `:8204`): default 5 → 6 under `A3D_QR_CAMERA_LOOP`; add `overload: "slow-motion" | "catch-up"` (C-23
  `AuraLoopOptions`, default `"slow-motion"`, semantics §6.7) to `FrameLoopOptions`; replace the clamp at
  `FrameLoop.ts:144-146` with the policy switch; count `overloadFrames` in `snapshot()`; add the substep-cap guard
  (§6.7). Unit tests for both policies at `fixedDt 1/120`, 100 ms ticks. Until PR 0b-1 merges, the constant lives in
  `time/loopDefaults.ts` and `frameLoopDefaults.ts` re-exports it after the carve.
- [x] L-3 `FrameLoop.ts`: add `onTick(callback(frame: { realDt, substeps, alpha, simTime }))` emitted **once** after the
  substep loop, including ticks with 0 substeps.
- [x] L-4 New `time/FixedStepDriver.ts`: `createFixedStepDriver(app, options: AuraLoopOptions)` that owns a `FrameLoop`,
  calls the public `app.advance(fixedDt)` (`index.ts:11582`) per substep and `app.step(0)` once per tick, publishes
  `alpha/realDt/simTime` to `app.onRender` subscribers, and records `renderSubmissionsLastTick`. The C-38 `time`
  extension starts it for `createAuraApp({ autoStart: true, loop })` when `A3D_QR_CAMERA_LOOP` is on. Test
  `tests/qr/prd08/unit/render-interpolation.test.ts`: with a fake app, `step` is called exactly once per tick and
  `advance` N times for substeps ∈ {0,1,2,6}. `createGameApp` adoption is request Q-09-5.
- [ ] L-5 Request Q-15-2 (render dt clamp at `index.ts:11328, 12319, 12382`) and Q-15-3 (alpha in payloads at
  `:11508, :11694`). Lane side: export `DEFAULT_MAX_FRAME_DT` from `app/frameLoopDefaults.ts` and
  `currentFrameAlpha(app)` from `app/frameAlpha.ts` so the PRD 15 edit is a one-line import each.
- [ ] L-6 `app/frameAlpha.ts` (carved from `index.ts:11290-11302`): under the flag, `runtimeAlpha` returns the
  `FixedStepDriver`/`FrameLoop` alpha instead of `(dt % fixedDt)/fixedDt`; flag off keeps the modulo.
- [x] L-7 New `time/Interpolation.ts`: `InterpolationStore` with `capturePrevious()`, `captureCurrent()`,
  `resolve(alpha)`; per handle prev/curr position (lerp), rotation (XYZ Euler → `@aura3d/math` `Quaternion` via
  `Euler`, shortest-path slerp, back to XYZ Euler), scale (lerp). Register C-37 handle extension `prd08.time`
  (`interpolate`, `timeScale`, `teleport(x, y, z, rotation?)`) and the C-01 `collect` contributor
  `prd08.interpolation` (`time/InterpolationContributor.ts`, flag `A3D_QR_CAMERA_INTERPOLATION`) that replaces the model
  matrix of each item whose `label` is a registered runtime-node id with the resolved one and fills
  `previousModelMatrix` (C-14). Dev warning when a handle moves > 5 u in one fixed step without `teleport`. Unit tests:
  alpha 0/0.5/1 results; yaw 350° → 10° interpolates through 0° (not 180°); teleport produces no intermediate
  positions; the contributor returns the same array when the flag is off; `handle.rotation` is never overwritten.
- [ ] L-8 Lane benchmark harness: `tests/qr/prd08/harness/camera-feel-harness.{html,ts}` builds a scene with 20 moving
  runtime nodes on `createAuraApp` + `FixedStepDriver` (no dependency on `createGameApp`).
- [ ] L-9 New `tests/qr/prd08/browser/frame-pacing.spec.ts` on the L-8 harness: Playwright overrides
  `requestAnimationFrame` with a scripted clock (60/120/144 Hz and fixed 100/250 ms intervals) and records per
  presented frame `performance.now()`, `simTime`, presented node positions and `renderSubmissionsLastTick`; writes the
  CSV of §20 item 3; asserts S1, S2, S3. A second, non-gating run uses CDP CPU throttle rate 6 to record real-world
  pacing for the evidence pack. Runs remotely only (`qr-prd08-camera.yml`).
- [ ] L-10 Request Q-14-1 (filed in Phase 1, not deferred): remove the explicit `maxSubSteps: 2` from the six game loop
  configs (§5 table) so they get the new default; capture before/after sim-speed at the measured fps.

### Time (T)

- [x] T-1 New `time/TimeController.ts` implementing the C-23 `AuraTimeController`; `scale` setter clamps to [0, 4];
  registered as the real C-38 `time` extension.
- [x] T-2 `FrameLoop.ts`: replace readonly `timeScale` (`:46, :63`) with a getter reading the TimeController (keep
  constructor option as initial value; PR 0b's `setTimeScale` wiring stays valid); `step()` reads it per call.
- [x] T-3 `hitStop(seconds, { scope: "global" })`: sim dt 0; overlapping calls take max remaining. Unit test.
- [x] T-4 `hitStop(seconds, { scope: actors })`: sets `handle.timeScale = 0` (C-37 `prd08.time`) for listed handles; the
  following lane-08 integrators multiply their dt by the bound handle's `timeScale`: `createGameKinematicBody`
  update/move (`GameRuntime.ts:2074`), `createGameArcadeVehicle` update (`:2007`), `createCombatWorld` actor step
  (`:2541`), `createGamePlatformerKit` player body (`GameGenreKits.ts:895`). Animation freeze is PRD 06's read of
  `handle.timeScale` (C-23 semantics; no request). Unit test: in a two-actor combat world, a scoped hit-stop freezes
  both listed actors' positions for the duration while a third, unlisted actor's position keeps changing.
- [x] T-5 `slowMo(scale, seconds, { easeOut })` + `scaleTo(value, halflife)` using `damp`. Unit test: `scaleTo(0.25, 0.1)`
  reaches 0.625 ± 0.01 after 0.1 s; `slowMo(0.3, 1, { easeOut: 0.2 })` returns to 1 ± 0.01 at t = 1.2 s.
- [x] T-6 `app.time` via the C-38 `time` factory; `GameSession` delegation is PRD 09's (R15) and needs no request.
- [ ] T-7 `GameRuntime.ts:3596, 3617` (`resolveAttack`): combat world, on hit event with `hitStop > 0` (seconds), calls
  `app.time.hitStop(hitStop, { scope: [attackerId, defenderId] })` when the world is bound to an app (`combat({ app })` or
  `bind(app)`); option `autoHitStop` default true under the flag. Unit test with a fake app.
- [ ] T-8 `GameFeel.ts:136-140`: when `gameFeel.attach(app)` is called, `hitStop(durationMs)` forwards to
  `app.time.hitStop(durationMs / 1000)`; `timeScale()` reads `app.time.scale`; `effectiveDt(dtMs)` keeps its ms contract.
  Update `tests/unit/engine/game-feel.test.ts` (lane 08) with a unit-conversion assertion (70 ms → 0.07 s).

### Camera controller (C)

- [x] C-1 New `camera/CameraController.ts` implementing the C-22 `AuraCameraController` (types imported from
  `contracts/camera.ts`); internal state: rig, blend {from pose, t, duration, ease}, layers sorted by order, presented
  pose, previous VP.
- [x] C-2 New `camera/rigs/fromSpec.ts`: `rigs.fromSpec(spec)` reproducing `applyCameraOffset` (`index.ts:15616`),
  `resolveCameraTarget` (`:15629`), `resolveCameraEye` (`:15654-15689`) and the smoothing filter (`:15707-15745`)
  exactly. These functions stay in PRD 15's `index.ts`, so the math is **copied verbatim** into `fromSpec.ts` with a
  header comment naming the source lines; C-14 proves equality and Q-15-1 deletes the originals later.
- [x] C-3 New `camera/extension.ts`: real C-38 factory for member `camera` (flag `A3D_QR_CAMERA`) that constructs one
  controller per app, calls `controller.use(rigs.fromSpec(app.scene.camera), { blend: 0 })` on every new scene
  snapshot (detected by snapshot identity in an `app.onFrame` hook), applies `freezeSpecs` (X-5), and presents through
  `setPose` every frame. Registered from `packages/engine/src/lanes/prd08.ts`.
- [x] C-4 `packages/scene/src/MathTypes.ts`: add `rollUpVector(forward, up, roll)` (Rodrigues) next to `lookAtMat4`
  (`:90`) with unit tests: roll π/2 maps up to ±right; a straight-down camera (`forward = [0,−1,0]`, `up = [0,0,−1]`)
  yields a finite `lookAtMat4`; `roll = 0` returns `up` bit-for-bit. Wiring into `createViewProjection`
  (`index.ts:17758-17765`) is Q-15-1 after CCR-08-1; until then `setPose` writes `up`/`roll` only into evidence
  (`rollApplied: false`).
- [x] C-5 Lane side of Q-15-1: provide `presentedViewProjection(app)` in `camera/CameraController.ts` (cached VP of the
  presented pose) so PRD 15 can replace the C8 call sites (`resolveCameraFrame(` at `index.ts:12354, 13602, 13760,
  13857, 17760`; `createViewProjection(` at `:13809, 13856, 16089, 16187`) with one import. Standalone check: with the
  flag on, the eye the legacy resolution returns for the written spec (read through the C-22 stub `presented()` on a
  second, flag-off controller over the same snapshot) equals the real controller's `presented().position` within 1e-6,
  which proves `u_cameraPosition` is the presented eye.
- [x] C-6 Implement `setPose`, `setFov`, `setRoll` (springed when `halflife` given), `use` with blend (pose lerp + quat
  slerp + fov lerp over `blend` seconds with `ease`), `cut()` (reset springs, call `app.cutCamera()` → C-14
  `resetTemporalHistory("camera-cut")`). Unit tests: `use(rig, { blend: 0.5 })` at t = 0.25 s with `ease: "linear"` is
  the midpoint pose ± 1e-6; `cut()` calls `cutCamera` exactly once and a blend does not.
- [x] C-7 `controller.evidence()` returns `AuraCameraEvidence` built from the submitted VP; compute
  `subjectScreenHeightFraction` by projecting the 8 corners of the active rig subject's `handle.bounds()` through the
  presented VP and taking (max NDC y − min NDC y)/2. Unit test: a 1 u tall, 0.01 u deep box centred on the view axis at
  distance `d = 1/(2·tan(25°)·0.5)` with fov 50 reports 0.50 ± 0.01. Registered as C-31 section `camera`.
- [x] C-8 New `camera/Spring.ts`: `damp`, `springScalar`, `springVec3`, `springAngle`, `springQuat` per §6.3. Unit tests
  `tests/qr/prd08/unit/camera-spring.test.ts`: from rest, remaining gap at t = halflife is 0.500 ± 0.01 for `damp` and
  0.597 ± 0.01 for springs; frame-rate independence (60 vs 144 vs a seeded variable dt stream: positions at t = 1 s
  within 1e-3 of each other); no overshoot from rest for springs; `springAngle` from 350° to 10° moves through 0°.
- [ ] C-9 New `camera/Probe.ts`: `sphereCast` via `sphereCastCollider` (`packages/physics/src/Raycast.ts:87`, lane 08)
  over the bodies of `app.physics` when a world exists; else an AABB-list sphere sweep over runtime-handle `bounds()`
  (C18) and static scene node bounds; `occluders()` returns node ids whose AABB intersects the eye→subject segment. A
  BVH path is used only if Q-11-2 exports one (feature-detected). Unit tests: wall between subject and desired eye →
  `hit` with distance within 0.01 of analytic; no wall → `hit: false`.
- [ ] C-10 Collision helper used by chase/shoulder/orbit/flight: asymmetric half-lives (pull-in 0.04, push-out 0.35),
  radius 0.2; reuse `createCollisionAwareOrbit` math (GameCameraRigs.ts:190-279).
- [ ] C-11 New `camera/OccluderFade.ts`: per-node fade spring to 0.3 for nodes in `probe.occluders()` that are not the
  subject and not tagged `cameraOpaque`; C-01 `collect` contributor `prd08.occluderFade` writes
  `RenderItem.cameraFade` and `cameraFadeOffset` (S-1). Unit test: contributor output for a 3-item list with one
  occluder sets `cameraFade` only on that item and returns the input array unchanged with the flag off.
- [ ] C-12 Near-plane auto-adjust for chase/fighting/altitude rigs (`near = clamp(0.02·d, 0.05, 0.5)`, written through
  `setPose` into the existing `AuraCameraSpec.near`), unless the route passes `near` explicitly.
- [ ] C-13 Carved `nodes/game/racingCamera.ts` (from `index.ts:7641-7650`): delete the composition-report/verdict-string
  gate in `createGameRacingCameraRig` (extra arguments ignored, no throw). The turbo call-site cleanup
  (`apps/showcase-turbo-drift-circuit/src/main.ts:2789-2794`) is request Q-14-2.
- [x] C-14 Golden tests `tests/qr/prd08/unit/camera-controller.test.ts`: record 40 (spec, time, subject) tuples from the
  unchanged legacy resolution — read through the C-22 **stub** `presented()` with `A3D_QR_CAMERA` off, which calls the
  existing `resolveCameraFrame` path — into `tests/qr/prd08/fixtures/legacy-frames.json` on day 0; assert `fromSpec`
  equality within 1e-6. Re-recording requires a written reason and the diff in `evidence/prd08/goldens.md`.

### Rigs (R)

- [ ] R-1 `camera/rigs/chase.ts` per `ChaseRigOptions` (§7.1), arm-space damping (§6.3): yaw spring on subject heading,
  distance/height springs, look-point spring, look-ahead from subject velocity (`clamp(v·seconds, max)` springed with
  `halflife` default 0.25), speed-aware distance and FOV, bank from lateral acceleration, framing solver, collision.
  Unit tests: constant 20 u/s straight line, look-ahead off → eye-to-subject distance within 2 % of `distance(v)` and
  projected subject centre within 3 % frame height of rest after 1 s; the legacy `smoothing 0.045` follow spec on the
  same path fails the distance assertion (proves the test discriminates); FOV at `v = maxSpeed` equals
  `base + perSpeed·v` clamped to `max`; 90° turn at 20 u/s → camera yaw lags subject yaw by 5°–25° at the turn midpoint.
- [ ] R-2 `camera/rigs/flight.ts`: arm in subject local frame (pitch included), `horizonLock` blend of up vector
  between world-up and subject-up, bank gain default 0.6, max 25°. Tests: subject pitched 30° → camera pitch ≥ 20° with
  `horizonLock 0.3`; subject rolled 60° (steady state) → presented roll 36° ± 1° with `maxDeg 45`, and 25° ± 0.5° with the default `maxDeg 25`; projected
  ground plane occupies ≥ 15 % of the frame in all frames of a scripted 60° banked turn at 50 m altitude.
- [ ] R-3 `camera/rigs/follow2d.ts`: dead zone (default 0.18 × 0.22 of frame), forward lead 1.2 u in facing direction
  springed, platform snap on Y. Tests: jump inside dead zone causes no vertical camera motion until landing; landing on
  a platform 2 u higher moves the camera Y to the new rest within 0.4 s; reversing facing moves the lead to the other
  side within 0.5 s.
- [ ] R-4 `camera/rigs/fighting.ts`: midpoint target, distance solved to keep both fighters' bounds inside 15 %–85 %
  horizontal band and height fraction 0.5; zoom on distance only; camera stays on the fight plane's normal. Test:
  fighters 1 u vs 6 u apart both fit inside the band; FOV constant; camera yaw relative to the fight-plane normal stays
  0° ± 0.5° through a 10 s scripted fight (no mid-fight orbit).
- [ ] R-5 `camera/rigs/shoulder.ts` wrapping `createShoulderCamera` (GameCameraRigs.ts:94-153) + C-10 collision. Test:
  output equals `createShoulderCamera` for the same inputs when no collider is present (1e-6).
- [ ] R-6 `camera/rigs/orbit.ts` (yaw/pitch springs, pitch limits, optional collision) + `rigs.orbit.bindPointer(canvas,
  rig, { sensitivity = 0.25°/px })` mapping pointer/touch drag to yaw/pitch targets. Tests: pitch clamps to limits;
  synthetic 100 px drag changes target yaw by 25° ± 0.1°.
- [ ] R-7 `camera/rigs/topDown.ts` with centroid of one or many targets, dead zone, arena bounds clamp, up-vector
  handling (§6.4). Tests: target at arena corner → all four arena-edge points stay inside the frame; `pitchDeg 90`
  gives a finite matrix.
- [ ] R-8 `camera/rigs/altitude.ts`: distance = f(altitude) so ground point and goal both inside frame; subject fraction
  0.10; lead 30 % toward goal. Test with aurora-lander-like altitudes 2/20/80 u: ground point and goal project inside
  NDC [−0.9, 0.9] in all three; subject height fraction 0.08–0.12.
- [x] R-9 `camera/rigs/static.ts`: fixed pose from `Partial<AuraCameraPose>` (defaults from the current spec). Test:
  trauma/punch layers still change the presented pose on a static rig.
- [x] R-10 Framing solver `camera/framing.ts`: `distanceForFraction(h, fovDeg, p) = h / (2·tan(fov/2)·p)` and inverse
  `fractionForDistance`; for portrait aspects solve on the narrower (horizontal) axis using `ctx.aspect`. Unit tests
  round-trip within 1e-9 and a 390×844 case.
- [ ] R-11 `GameSceneGeometryBindings.ts` (`createGameRacingPresentationCamera` `:469-531`, `createGamePlatformerPresentationCamera`
  `:676-733`) and carved `nodes/game/racingCamera.ts` (from `index.ts:7605-7639`): with the flag on,
  `game.racingCameraRig` → `rigs.chase`, `game.platformerCameraRig` → `rigs.follow2d`, racing top-down → `rigs.topDown`;
  remove every hard-coded `smoothing` constant listed in §2.1 C10 from the flag-on path. `{ legacySpec: true }` and
  flag off return today's spec unchanged (snapshot test). The `game.*` keys in PRD 09's `nodes/game/index.ts` already
  reference these functions; no edit there.
- [ ] R-12 `GameRuntime.ts:2734-2798`: re-implement `createGameCameraDirector` over `rigs.fighting` + controller shake;
  keep `update()` return type; add `bind(app)`.

### Layers (Y)

- [x] Y-1 `feel/Noise.ts`: seeded 1D gradient noise `perlin1(x, seed)` normalised to [-1, 1] (raw gradient noise ×2,
  clamped); tests: continuity (|Δ| < 0.1 for Δx = 0.01), determinism per seed, and max |value| over x ∈ [0, 100] ≥ 0.9
  (amplitude actually reaches the configured maxima).
- [x] Y-2 `camera/layers/trauma.ts`: 6-DoF per §6.5 using `createTraumaShake` envelope (GameCameraRigs.ts:306-347) with
  noise from Y-1 and smooth terminal fade; translation scaled by `min(1, subjectDistance/6)`. Tests: S7
  (presented offset equals layer output; peak |yaw| ≥ 0.35·maxYaw in first 0.25 s, default seed); energy reaches 0
  within `1/decay` s + 0.05 s with no discontinuity > 5 % of `maxYaw` per frame in the terminal band; autocorrelation
  of the yaw channel shows no period between 0.05 s and 1 s (not a sine).
- [x] Y-3 `camera/layers/punch.ts`: wraps `createPunchIn` (GameCameraRigs.ts:390-415); applies `fovOffset` **and**
  `distanceOffset` along view axis. Test: `trigger({ fov: -4, dolly: 0.35 })` → presented FOV dips by 4° ± 0.1° and eye
  moves 0.35 ± 0.01 u along the view axis at the envelope peak.
- [x] Y-4 `camera/layers/fovKick.ts`: named channels summed, each springed. Test: channels `boost +6` and `speed +4`
  settle to +10° ± 0.05°; clearing one channel returns to +4° with the channel's half-life.
- [x] Y-5 `camera/layers/lookAt.ts`: weighted target override with spring weight. Test: weight 1 aims the view axis at
  the override within 0.5° after 3 half-lives; weight 0 leaves the rig pose untouched (1e-6).
- [ ] Y-6 `camera/layers/cinematicBars.ts`: target aspect, ease; draws a DOM overlay of two black bars (standalone) and
  publishes its rect on the C-01 blackboard as `prd08.letterbox` for any C-13 composite that wants it. Test: 16:9
  canvas, target 2.39:1 → bar height `(1 − (16/9)/2.39)/2` of canvas height each, ± 1 px.
- [x] Y-7 Reduced-motion policy in controller (§6.5 multipliers), sourced from `matchMedia('(prefers-reduced-motion:
  reduce)')`, the app's `accessibility.reducedMotion` source (C-38 option; `createGameReducedMotionSource`,
  GameRuntime.ts:4218), or C-24 `GameSession.reducedMotion` when a game session is bound; unit test multipliers;
  browser test with Playwright `emulateMedia({ reducedMotion: "reduce" })` shows `diagnostics().camera.pose.roll = 0`
  and trauma yaw ≤ 25 % of the unreduced run during the same impulse.

### Shader (S)

- [ ] S-1 New `packages/rendering/src/shaders/camera-fade.glsl.ts`: C-02 `ShaderChunk` (GLSL per §8.2 plus `wgsl` twin)
  and `ShaderFeature` `prd08.cameraFade` (define `A3D_CAMERA_FADE`, uniforms `u_cameraFade`, `u_cameraFadeOffset`,
  variant key bit `cameraFade`, active only when `RenderItem.cameraFade < 0.999`). ChunkHarness test (remote,
  `qr-prd08-camera.yml`): a 64×64 quad with `u_cameraFade = 0.5` writes 50 % ± 2 % of covered pixels, `1.0` writes
  100 %, and the program without the feature compiles byte-identical source to the program generated without the chunk.
  The legacy `ShaderLibrary.ts` is not edited (optional Q-01-1); the WebGPU packed-uniform wiring is Q-11-1.
- [ ] S-2 `camera/OccluderFade.ts` contributor (C-11 task) fills `cameraFade`/`cameraFadeOffset` per item; the offset
  cycles `(0,0) (2,2) (2,0) (0,2)` by `FrameContributorContext.frameIndex` only when a C-13 pass with id containing
  `taa` is registered. Shadow/depth variants never request the feature (C-11 `registerDepthVariantFeature` not used).
- [ ] S-3 `feel/FeelBus.ts` + controller publish `AuraScreenFeelUniforms` `{ flash, chroma, radialBlur, vignette, center }`
  per frame on the C-01 blackboard key `prd08.screenFeel` (C-23) and in `diagnostics().camera.screenFeel`. The `screen`
  channel counts as executed only for the parts that produced pixels: flash/vignette via `feel/ScreenOverlay.ts` when
  `feel.screenFallback: "dom"`, any part when a C-13 consumer reports it read the key this frame (consumer sets
  `blackboard.set("prd08.screenFeel.consumed", true)`; documented in facts F-08-5 for PRD 03).

### Sequences and rails (Q)

- [x] Q-1 `camera/Spline.ts`: centripetal Catmull-Rom (alpha 0.5), closed/open, arc-length LUT (256 samples),
  `pointAt(u)`, `tangentAt(u)`. Tests: passes through control points; C1 continuity at joints (tangent angle Δ < 1°);
  constant-speed parameterisation within 2 %.
- [ ] Q-2 `camera/rigs/rail.ts` per `AuraCameraRailOptions`; look-at track as node, point, or second spline; FOV per point
  interpolated with the same u.
- [ ] Q-3 `camera/Sequence.ts`: `controller.play(sequence)` → shots with blend-in, bars, `skip()`; `onEnd: "return"` blends
  back to the previous rig.
- [ ] Q-4 `CameraChoreographer.ts:234-238`: `"catmull-rom"` uses Q-1 across keyframes (not per-segment smoothstep); update
  `sampleCameraPath`; add test that velocity at interior keyframes is non-zero.
- [x] Q-5 `camera/rigs/fromSpec.ts`: with the flag on, the `path`/`flythrough`/`dolly` modes (legacy math at
  `index.ts:15670-15686`, PRD 15's, not edited) are presented via `rigs.rail` with 2 points; `loop` default
  `"pingpong"` for `dolly`, `"none"` for path (hold at end — no snap back). Flag off keeps the legacy snap. Test: a
  `path` spec at `t = seconds + 0.1` holds the end pose with the flag on and equals the golden with it off.

### Feel bus (F)

- [ ] F-1 `feel/FeelBus.ts` implementing the C-23 `AuraFeelBus`; real C-38 `feel` extension.
- [ ] F-2 Channel dispatch: shake → `app.camera.shake.add`; punch → `app.camera.punch.trigger`; hitStop → `app.time`;
  haptics → `@aura3d/input` `Haptics` (gamepad dual-rumble, `navigator.vibrate` on touch, no-op otherwise); audio →
  C-25 `GameSound.play(cue, { position, rate: 1 + jitter, volumeDb })` on the bound sound slot (no-op + `executed` 0
  when none is bound); vfx → C-20 `app.effects.burst(kind, position, { count })`; screen → S-3.
- [ ] F-3 Presets `arcade`, `fighting`, `racing`, `platformer`, `puzzle`, `calm` with event maps for `land`, `jump`,
  `hit-light`, `hit-heavy`, `ko`, `collect`, `boost`, `explode`, `score`, `fail`; values documented in a table in the
  source file header and exported as `feelPresets` for tests. Required starting values (tunable only with a recorded
  review in `evidence/prd08/tuning.md` citing a §16A screening or panel record):

  | Event (preset) | shake | punch fov / dolly | hitStop s (scope) | haptics strong/weak/ms | screen |
  |---|---|---|---|---|---|
  | `hit-light` (fighting) | 0.25 | −1.5 / 0.10 | 0.045 (actors) | 0.3 / 0.2 / 40 | flash 0.08 |
  | `hit-heavy` (fighting) | 0.55 | −4 / 0.35 | 0.07 (actors) | 0.8 / 0.4 / 90 | flash 0.25, chroma 0.6, radialBlur 0.2 |
  | `ko` (fighting) | 0.8 | −6 / 0.5 | 0.10 (global), then `slowMo(0.3, 0.8)` | 1.0 / 0.6 / 180 | flash 0.4, vignette 0.5 |
  | `land` (platformer) | 0.15 × strength | — | — | 0 / 0.2 / 30 | — |
  | `boost` (racing) | 0.1 | fovKick +8 (channel `boost`, half-life 0.25) | — | 0.2 / 0.4 / 120 | radialBlur 0.3 |
  | `explode` (arcade) | 0.7 | −3 / 0.25 | 0.03 (global) | 0.9 / 0.5 / 150 | flash 0.3, chroma 0.4 |
  | `score` (puzzle) | 0.1 | −2 / 0.15 | — | 0.2 / 0.1 / 40 | vignette 0.15 |
  | any event (calm) | ≤ 0.1 | ≤ −1 / 0 | — | 0 | none |

  Unit test: every preset defines all ten events (calm may map to empty specs) and no value exceeds the reduced-motion
  caps after multipliers.
- [ ] F-4 `executed` accounting (C-23 invariant): a channel counts only if it produced an effect (layer energy > 0 on the
  next presented frame; haptics actuator present and called; C-25 `play` returned a `VoiceHandle`; C-20 `burst`
  reported `pixelBacked`; screen per S-3). Test with fakes, plus one test against the real PR 0a stubs proving
  `executed.vfx` counts primitive-pool bursts and `executed.screen` stays 0 without a consumer or DOM fallback.
- [ ] F-5 `GameFeel.ts`: `gameFeel.create({ app })` routes `damageFlash`/`speedLines`/`landingDust` through `app.feel`
  (effects reach pixels through C-20; PRD 07's auto-mount is theirs); remove the `effectsSpawned` counter from evidence
  when not rendered.
- [ ] F-6 Platformer kit emits `land` (with `strength = impactVelocity/terminal`) and `jump`; racing kit emits `boost`,
  `drift-start`, `collision`; combat emits `hit-light`/`hit-heavy`/`ko` mapped from move strength.
- [ ] F-7 Evidence-only feel checks, registered from lane-08 files only:
  (a) source scan `feel/lint/feelSourceScan.ts` registered as C-39 doctor rule `feel/evidence-only` from
  `packages/aura3d-cli/src/commands/prd08/feelLint.ts` (no edit to `cli.ts`, owner 05; `aura3d doctor --look` hosts it,
  PRD 13). TypeScript AST scan of route/template sources. Flags any value returned by `.update(`/`.follow(`/`.snap(` on an object
  created by `camera.shake`, `camera.punchIn`, `game.cameraRig`, `game.cameraDirector` or `gameFeel.create` when that
  value is only (i) discarded (`void x`), (ii) written into an object passed to `publishEvidence`/`evidence`/HUD text, or
  (iii) never read; does not flag objects passed to `app.camera.use/addLayer` or `app.feel`. Fixture tests (copies of
  the source excerpts under `tools/camera-cast-codemod/fixtures/feel-lint/`): the neon-swarm `void cameraState` pattern
  (`main.ts:1667-1671`), the mini-game `cameraRig.follow` inside evidence (`templates/mini-game/src/main.ts:214`) and
  the fighting-game HUD-only director output (`:322, :361`) are flagged; fixtures written to the D-1/D-3 specs are clean.
  (b) runtime C-34 rule `look/evidence-only-feel` (`feel/lint/evidenceOnlyFeel.ts`): error when
  `app.feel.evidence().emitted > 0` and every channel's `executed` is 0 over the last 300 frames.

### Vehicle (V)

- [x] V-1 New `vehicle/BicycleModel.ts` per §6.9 with fixed-step integration at the loop's `fixedDt`; pure, deterministic.
- [ ] V-2 `GameRuntime.ts:2007-2045` `createGameArcadeVehicle`: add `model` option; `"bicycle"` delegates to V-1; extend
  state with `lateralVelocity`, `yawRate`, `slipAngle`, `drifting`, `rpm`, `lateralG`.
- [ ] V-3 Torque curve + quadratic drag + rolling resistance; default curve peaks at 0.6·maxSpeed.
- [ ] V-4 Handbrake rear-grip scale 0.45; counter-steer assist (0 = none, 1 = full yaw-rate damping).
- [ ] V-5 `GameGenreKits.ts:1343-1580` `game.racing`: default `model: "bicycle"`; wire `createVehicleChassis`
  (VehicleChassis.ts:297) as default presentation for the player car (pitch/roll/suspension/wheels); emit F-6 events.
- [ ] V-6 Chase rig integration: `bank` reads `lateralG`; FOV `perSpeed` reads `|vLong|`.
- [x] V-7 Tests `tests/qr/prd08/unit/bicycle-vehicle.test.ts`: straight-line top speed within 2 % of `maxSpeed`;
  steady-state cornering yaw rate ≤ `μg/v`; handbrake drift (S12); determinism across identical input streams.

### Platformer (P)

- [ ] P-1 `GameRuntime.ts:2181-2186` `createGameKinematicBody` (`:2074`) `body.move`: integrate toward target velocity with `groundAccel`, `groundDecel`,
  `turnAccel`, `airControl` (§6.9); keep the old instant behaviour behind `instantVelocity: true`.
- [ ] P-2 `GameGenreKits.ts:851-872` + `:1054-1057`: add level option `feel` (default `"responsive"`); when set, take
  `fallGravityMultiplier` from `platformerFeelProfile(feel).fallMultiplier` (1.6) unless the level sets it explicitly,
  and implement apex hang (gravity × `apexHangGravityScale`, default 0.5, while `|vy| < apexHangFraction·jumpVelocity`).
  Do **not** call `solvePlatformerMotion` by default (it re-derives gravity/jump from geometry, M5). `feel: false`
  restores `fallGravityMultiplier: 1` and no apex hang. Keep coyote 110 / buffer 130 / release 0.45. Test: with the
  default feel, time from apex-band exit to landing is ≥ 10 % shorter than with `feel: false`, and apex dwell
  (|vy| < 0.14·v0) lasts ≥ 1.5× longer.
- [ ] P-3 Presentation state `{ squash, stretch, lean, landImpact }`: stretch on jump (scaleY 1.12, XZ 0.94, 0.1 s), squash on
  land (scaleY 0.86 × strength, 0.12 s), lean = `−vx/maxSpeed · 8°`; applied to the player runtime node unless
  `presentation: false`.
- [ ] P-4 Emit `land`/`jump` feel events (F-6).
- [ ] P-5 Kit camera default: `rigs.follow2d` with framing 0.28.
- [ ] P-6 Tests `tests/qr/prd08/unit/platformer-accel.test.ts`: S13 timings; `tests/unit/engine/platformer-motion.test.ts`
  (lane 08) updated for new flag-on defaults, flag-off assertions unchanged.

### Input and controls (I)

- [ ] I-1 New `controls/TouchControls.ts` `mountTouchControls(app, input, layout, options)`: DOM overlay sibling of the
  canvas; one element per `GameTouchControlRegion`; pointer capture; stick via `VirtualTouchJoystick`
  (`packages/input/src/VirtualTouchControls.ts`); buttons map to actions; `env(safe-area-inset-*)`; `aria-label` per control;
  min target 48 CSS px. Exported from the lane barrel for PRD 09's C-24 wrapper (R16); layouts come from
  `createGameTouchControlLayout` (`GameRuntime.ts:1600`) or PRD 09's `TouchLayouts.ts` presets, read-only.
- [ ] I-2 `createGameInput` (GameRuntime.ts:1668-1936): register a `touch` virtual device fed by I-1.
- [ ] I-3 `input.activeDevice()` tracking the last device with input (keyboard/gamepad/touch); `input.prompt(action)` →
  label/glyph from the binding table: keyboard → `KeyboardEvent.code` display name (`"Space"`, `"Arrow Left"`); gamepad →
  standard-mapping glyph id (`"pad-a"`, `"pad-rt"`, …, labelled "A"/"RT"); touch → the bound touch region's `label`
  (or the action name capitalised). Test: binding `jump: ["Space", "pad:0", "touch:jump"]` returns `Space`/`A`/`Jump`
  for each active device.
- [ ] I-4 Auto show/hide: show on first `touchstart`, hide on keyboard/gamepad input; `options.autoHide` default true.
- [ ] I-5 Per-action `bufferMs` and `consume(action)`; defaults jump 130 ms, attack 150 ms, others 120 ms (existing).
- [ ] I-6 Haptics: `Haptics` (packages/input/src/Haptics.ts) reachable via feel bus; gamepad `vibrationActuator`,
  touch `navigator.vibrate(ms)`; respects a `haptics: false` user setting.
- [ ] I-7 Tests: new `tests/qr/prd08/unit/touch-controls-mount.test.ts` (jsdom: pointer events → axis values) and
  `tests/qr/prd08/unit/touch-device-prompts.test.ts` (I-3); browser test in `tests/qr/prd08/browser/camera-feel.spec.ts`
  with Playwright touch emulation on the lane harness. `tests/unit/engine/touch-control-binding.test.ts` (owner 15 by
  first import, `TouchControlBinding.ts`) is not edited.

### Audio (A) — lane-08 glue only; the playback graph is PRD 09's (R17, C-25)

- [ ] A-1…A-2, A-4, A-6…A-9 of the earlier draft moved to requests Q-09-1…Q-09-4 (§12.3) with the same numbers
  (panner model by tier, occlusion lowpass `20000·(1-occ)^2 + 400` Hz, live `setRate` τ 0.03 s, limiter −6 dB/12/6,
  jitter, voice limit 4, `PositionalEmitter.ts:232` live rate, default-cue removal, OfflineAudioContext checks: L/R
  energy ratio > 3:1 at +x with listener facing −z; 440 Hz loop with `setRate(2)` at 0.5 s → 880 ± 10 Hz in 0.7–1.0 s).
- [ ] A-3 `camera/extension.ts`: when a C-25 `GameSound` is bound (lane-08 export `bindFeelSound(app, sound)` from
  `feel/`, which PRD 09's `createGame` can call; no contract change), call `setListener({ position, forward, up })` from `presented()` once per presented frame. Test with a fake
  `GameSound`: one call per presented frame, values equal the presented pose within 1e-6.
- [ ] A-5 `GameGenreKits.ts` racing kit and `game.craft`: create `GameSound.engine({ cue, rpmRange, pitchRange })` when
  a sound slot is bound and call `setRpm(state.rpm)`/`setLoad(throttle)` each fixed step. Test with a fake: rpm series
  equals the vehicle model's `rpm` series.
- [ ] A-10 `tests/qr/prd08/unit/feel-audio-dispatch.test.ts`: feel `audio` channel calls `GameSound.play` with
  `rate ∈ [1 − pitchJitter, 1 + pitchJitter]` and the event position; `executed.audio` increments only when a
  `VoiceHandle` is returned (the C-25 stub returns one for asset cues, `null` otherwise).

### Facts, codemod, hand-off (D) — templates and skills are PRD 13's (R20)

- [ ] D-1…D-5 Template specs, delivered to PRD 13 as request Q-13-1 (one issue, five sections, each with the exact edit):
  - mini-game (`templates/mini-game/src/main.ts`): replace static `camera.perspective` (`:171-175`) and the
    `game.cameraRig({ kind: "side-view-follow" })` instance (`:76`) with
    `app.camera.use(camera.rigs.follow2d({ target: "hero", framing: { subjectHeightFraction: 0.28 } }))`; remove the
    evidence-only `cameraRig.follow` (`:214`); `gameFeel.attach(app)`; platformer step uses `app.time`;
    `app.feel.preset("platformer")`; touch controls.
  - racing-starter (`:217`): `rigs.chase` (speed FOV `perSpeed 0.4`, look-ahead `{ seconds: 0.35, max: 4 }`, bank
    `{ gain: 0.5, maxDeg: 6 }`); `model: "bicycle"`; chassis; C-25 `engine`; `app.feel.preset("racing")`; touch (steer
    stick + throttle/brake/handbrake).
  - fighting-game (`:144, 185, 322, 361`): `rigs.fighting`; delete the HUD-text camera output (`hud-camera` `:64, :82,
    :361`); `combat({ app })` auto hit-stop; preset `fighting`; touch (stick + 3 buttons).
  - character-controller (`:57`): `rigs.shoulder({ target: "hero", collision: true })`; left-half floating
    `VirtualTouchJoystick`, right-half drag → `rigs.orbit.bindPointer`; one wall so collision is exercised.
  - falling-blocks-starter (`:251`): `rigs.static` with the current pose tilted 10° about X; preset `puzzle`.
  The same five configurations are built by this lane as lane-harness scenes `tests/qr/prd08/harness/templates/*.ts`
  so their standalone metrics (S6, S7, S10, S14) are proven without editing templates.
- [ ] D-6 Facts F-08-1…F-08-6 committed to `evidence/prd08/facts.md` and appended to CONTRACTS Appendix B (C-40 rows
  are the one CONTRACTS edit a lane may make, §6.4): rig-by-genre table (§6.4), framing fractions, feel preset table
  (F-3), `app.time` usage, touch kit usage, screen-feel reference behaviour (§8.3) and the forbidden evidence-only
  pattern. Skill text itself is Q-13-2.
- [ ] D-7 `tests/templates` assertions → request Q-13-3.
- [x] D-8 `tools/camera-cast-codemod/index.mjs` registered as C-39 codemod `camera-cast` + fixture tests for the five
  style-(a) cast sites and the cinematic-architecture cast (§2.2 G1, excerpts copied into `fixtures/`), plus
  "reported, not rewritten" fixtures for the two style-(b) sites. Report-mode run over `apps/` and
  `packages/create-aura3d/templates/` committed to `evidence/prd08/camera-cast-report.md`.

### Removals / deprecations (X)

- [ ] X-1 `nodes/camera.ts`: deprecation warning for `smoothing` (once per spec, flag on) with the computed half-life.
- [ ] X-2 Delete `createGameCameraRig` aggregator (GameCameraRigs.ts:525-596 plus its option/evidence types) when the
  flag reaches `default-on` and `camera-cast` reports 0 remaining callers.
- [ ] X-3 Lean delegation → request Q-15-4 (lane side: `camera/leanAdapters.ts` with tests).
- [ ] X-4 Removal of `smoothedCameraFrames`/`resolveCameraFrame` (`index.ts:15696-15745`) → request Q-15-1 after C-14
  parity is green.
- [x] X-5 Dev-mode `Object.freeze` on camera specs in `camera/extension.ts`, behind the PR 0a option
  `createAuraApp({ camera: { freezeSpecs: true } })`; error text points to `app.camera`. Default-on in dev after flag
  `default-on` (§10 item 6).
- [ ] X-6 `@aura3d/controls` README → request Q-15-5.
- [ ] X-7 Replacement gates in `tests/qr/prd08/` for the "fired/adopted" gates listed in §2.1 C21: they read
  `diagnostics().camera` (presented pose/VP and layer energy on submitted frames) instead of rig/evidence inputs. Each
  replacement must fail on the pre-change code for at least one scene (recorded in `evidence/prd08/gates.md`). The
  lane-08 tests `tests/unit/engine/{game-camera-rigs,fixed-step-determinism}.test.ts` are rewritten in place; the
  others are retired by request Q-15-6 / Q-14-3.

## 15. Test requirements

Policy: browser, GPU, frame-pacing, and audio-render tests run only on remote GitHub Actions; no local browser runs.
The existing `.github/workflows/browser-matrix.yml` (`chromium-browser-and-visual`, `ubuntu-latest`, SwiftShader) and
`quality-rebuild-capture.yml` (macos-14) are PRD 12's and are not edited; `test.yml`/`ci.yml` are PRD 15's. This lane
adds its own workflow:

- `.github/workflows/qr-prd08-camera.yml` (lane-owned), triggered on PRs touching lane-08 paths and on
  `workflow_dispatch`:
  - job `unit` (`ubuntu-latest`): `pnpm exec vitest run --config tests/qr/prd08/vitest.config.ts` (lane-owned config
    including `tests/qr/prd08/unit/**`, `tests/unit/contracts/impl/prd08-*`, and the lane-08 existing tests
    `tests/unit/engine/{fixed-step-determinism,game-camera-rigs,game-feel,platformer-motion,vehicle-chassis}.test.ts`);
    runs with flags `none` and `camera`.
  - job `browser-gpu` (`runs-on: macos-14`, Chromium, ANGLE Metal):
    `pnpm exec playwright test --config tests/qr/prd08/playwright.prd08.config.ts` (frame pacing, camera feel,
    ChunkHarness fade coverage, touch emulation, reduced motion); uploads CSV/JSON/PNG artifacts.
  - job `motion-capture` (`macos-14`, dispatch and nightly): `pnpm quality:capture --scenes prd08-motion-* --flags camera`
    through C-33 (strip + WebM steps), both engines; writes to `evidence/prd08/motion/`.
- Required repo checks still apply to every lane PR: `qr-contracts.yml` (typecheck, lint, unit incl. all conformance
  suites, ownership) and the flag-off sentinel identity check (CONTRACTS §6.1).

Unit (vitest, lane config):

- `tests/qr/prd08/unit/camera-spring.test.ts` — half-life, frame-rate independence, angle wrap, quat spring.
- `tests/qr/prd08/unit/camera-controller.test.ts` — legacy golden frames (C-14), layer order, blend, cut, evidence equals
  submitted VP, reduced-motion multipliers, `setPose` writes the camera node.
- `tests/qr/prd08/unit/camera-rigs.test.ts` — R-1…R-10 assertions.
- `tests/qr/prd08/unit/camera-spline.test.ts` — Q-1, Q-4, Q-5.
- `tests/qr/prd08/unit/time-controller.test.ts` — T-3…T-5, T-7.
- `tests/qr/prd08/unit/render-interpolation.test.ts` — L-4, L-7 (store + C-01 contributor).
- `tests/qr/prd08/unit/camera-fade-chunk.test.ts` — S-1 source generation, C-11 contributor.
- `tests/unit/engine/fixed-step-determinism.test.ts` (lane 08, extended) — L-1, L-2, determinism unchanged with flag off.
- `tests/unit/engine/game-camera-rigs.test.ts`, `game-feel.test.ts`, `platformer-motion.test.ts`, `vehicle-chassis.test.ts`
  (lane 08, updated).
- `tests/qr/prd08/unit/bicycle-vehicle.test.ts`, `platformer-accel.test.ts`, `feel-bus.test.ts`,
  `feel-audio-dispatch.test.ts`, `touch-controls-mount.test.ts`, `touch-device-prompts.test.ts` (new).
- `tests/unit/contracts/impl/prd08-{camera,time}.test.ts` — C-22/C-23 conformance on `real`.
- `tools/camera-cast-codemod/` fixture tests (codemod purity, doctor rule fixtures).

Browser (Playwright, remote, lane config; GPU specs in `browser-gpu`):

- `tests/qr/prd08/browser/frame-pacing.spec.ts` — S1, S2, S3; 60/120/144 Hz and 100/250 ms scripted rAF via `page.clock` +
  `requestAnimationFrame` override (gating); CDP CPU throttle run for evidence only (non-gating).
- `tests/qr/prd08/browser/camera-feel.spec.ts` on `camera-feel-harness`: chase framing deviation, shake peak in the
  presented VP read back from `diagnostics().camera`, roll in the presented pose, collision over scripted orbit,
  touch emulation driving input, hit-stop freeze, feel `executed` counts against the PR 0a stubs, reduced motion.
- ChunkHarness fade coverage (S-1) in the same job.
- Template smoke stays PRD 13's (`tests/templates`, Q-13-3); this lane's equivalent runs on the harness template
  configurations (D-1…D-5 harness scenes).

Determinism: all rigs, layers, noise, vehicle, and platformer tests run with fixed dt streams and seeds; replay
(`createGameInput` replay export) must produce identical presented poses across two runs (hash of 300 frames of poses).

## 16. Standalone acceptance (gates this lane's merges and `standalone-accepted`)

Provable by this lane alone on today's renderer with `A3D_QR_CAMERA` on and PR 0a/0b stubs for every other contract
(CONTRACTS §8 row 08). All runs are remote (`qr-prd08-camera.yml`, macos-14). These are engineering and metric
criteria; they show that camera, time and feel values **reach the presented pose and frame**, and they never support
a claim of three.js-level quality (CONTRACTS §7 honesty rule). Each criterion has a control that must fail.

| ID | Criterion | Measured on | Threshold | Control that must fail |
|---|---|---|---|---|
| S1 | One render per tick | lane harness, `FixedStepDriver`, 60/120/144 Hz and 100/250 ms scripted rAF | `diagnostics().loop.renderSubmissionsLastTick === 1` on every tick, 0 only when paused/hidden | `loop.renderPerSubstep: true` gives 2 on 2-substep ticks |
| S2 | Real-time sim under load | same, `maxSubSteps: 6` | 100 ms ticks: `simTime` advances 1.00 s ± 1 fixed step per 1.00 s wall; 250 ms ticks: 0.1 s per tick and `clampedFrames` +1 each tick; `fixedDt 1/120` at 100 ms: `overloadFrames` +1 per tick under `"slow-motion"` (0.05 s/tick) and 10 × 0.1 s ± 1 step total after 10 ticks under `"catch-up"` | flag off (`maxSubSteps 5`, old clamp) shows the documented slow-motion |
| S3 | No judder | 120 Hz rAF, `fixedDt 1/60`, 20 bodies | presented positions monotonic, max step deviation ≤ 10 % of mean | `interpolation: false` shows the 2:1 pattern |
| S4 | Legacy parity | 40 golden tuples (C-14) | `rigs.fromSpec` equals the legacy resolution within 1e-6 | — (parity test) |
| S5 | Hit-stop | lane combat harness (two fighters + bystander) | global: sim frozen for the duration ± 1 fixed step; scoped `[a, b]`: a and b positions frozen 0.07 s ± 1 step while the bystander moves and camera shake continues (layer energy > 0 on frozen frames) | `time.hitStop` not called (route-style evidence only) leaves positions moving |
| S6 | Chase framing | subject at 20 u/s straight, look-ahead off | eye-to-subject distance within 2 % of `distance(v)` after 1 s; projected subject centre within 3 % of frame height of rest | legacy `smoothing 0.045` follow spec misses the distance assertion (7.2 u lag) |
| S7 | Shake reaches the presented pose unfiltered | trauma 1.0 impulse | presented yaw/pitch offset vs rig pose equals layer output within 1e-6 rad on every frame (read from `diagnostics().camera.viewProjection`); peak abs(yaw) ≥ 0.35·max in first 0.25 s; roll present in `pose.roll` | legacy follow filter passes 4–9 % |
| S8 | Collision | scripted 30 s orbit around a box wall | eye never inside the wall | collision off |
| S9 | Motion-scene metrics (M1–M6 automated columns below) | `prd08-motion-*` scenes, C-33 strips | per-row automated threshold | per-row control |
| S10 | Feel accounting | `app.feel` against the PR 0a stubs | `executed.shake/punch/hitStop/haptics` > 0 after an emit; `executed.vfx` counts C-20 primitive-pool bursts; `executed.screen` 0 unless the DOM fallback is on; `executed.audio` 0 with no sound bound | a stub-only channel counted as executed fails the test |
| S11 | Rail continuity | closed 6-point rail | no positional discontinuity > 1 % of rail length between last and first frame; speed variation ≤ 5 % | today's smoothstep `CameraChoreographer` exceeds 5 % |
| S12 | Bicycle drift | scripted input, flat ground, `μ 1.0` | accelerate to 15 u/s, full steer + handbrake 0.5 s, release with steer held: `abs(slipAngle) > 0.2 rad` for ≥ 0.6 s and `drifting`; counter-steer −0.5: `abs(slipAngle) < 0.05 rad` within 1.5 s | `model: "unicycle"` never exceeds 0.01 rad |
| S13 | Platformer accel | kit body | max speed in 0.08–0.12 s on ground; stop in 0.06–0.10 s | `instantVelocity: true` reaches max in 1 step |
| S14 | Touch | lane harness mini-game configuration, emulated 390×844 DPR 3 | play end-to-end by touch only; no keyboard prompt text in the DOM while `activeDevice() === "touch"`; all targets ≥ 48 CSS px | keyboard-only build shows the prompt |
| S15 | Fade chunk | ChunkHarness, 64×64 | `cameraFade 0.5` → 50 % ± 2 % covered pixels; `1.0` → 100 %; no-feature program source byte-identical | — |
| S16 | Engineering gates | `qr-contracts.yml`, lane CI | typecheck/lint/unit green; C-22/C-23 conformance green on `stub` and `real`; flag-off sentinel identity (CONTRACTS §6.1); ownership check | — |
| S17 | Codemod + doctor | fixtures + report-mode run | all style-(a) fixtures rewritten, style-(b) reported; doctor rule flags the three evidence-only fixtures and passes clean fixtures | — |
| S18 | Audio glue | fake `GameSound` | one `setListener` per presented frame equal to the presented pose; `engine().setRpm` series equals vehicle `rpm` | — |
| S19 | Budgets | lane harness per tier (§17) | CPU/GPU/memory/bundle per tier within §17 | — |

Motion scenes (lane-08 `benchmarks/quality-rebuild/motion/`, registered as `prd08-motion-*` via C-30; same input to
Aura3D and three@0.185.1, fixed seed, 1280×720 DPR 1, 12-frame strip at 0.1 s via PRD 12's `strip` step + 3 s WebM via
`webm`; the three.js reference implements the same rig by hand: `PerspectiveCamera` + critically damped spring +
simplex shake + `CatmullRomCurve3`, so the comparison is of motion quality, not of the reference's library). The
automated column is standalone (S9); the judged column is integrated (I9, §16A).

| Scene | Content | Judged criterion (§16A) | Automated threshold (S9) |
|---|---|---|---|
| M1 chase-speed | car (scene 18 assets) accelerating 0→25 u/s on a straight then S-bend | subject stays framed, no horizon shrink, look-ahead visible on bends | `subjectScreenHeightFraction` 0.20–0.26 in every captured frame; the legacy `smoothing 0.045` rig through the same scene falls outside (control) |
| M2 impact-shake | static subject, trauma impulses 0.3/0.6/1.0 at t = 0.5/2.0/3.5 s | shake visible, organic, rotational, decays smoothly | presented rotational offset peaks within 0.1 s after each impulse, peak ratios within 30 % of 0.09 : 0.36 : 1; `pose.roll ≠ 0` in ≥ 1 frame per impulse |
| M3 flight-bank | aircraft turning 60° bank, pitching 20° | camera banks/pitches with craft, horizon readable | projected horizon (world y = 0 far) intersects the frame in 12/12 strip frames (with roll rendered as 0 until I1; the rendered-roll check is I1) |
| M4 collision | third-person subject walking past walls/pillars | camera never inside geometry; occluders fade | 0 frames with eye inside geometry; occluder fade state > 0 on occluders (pixels: I3) |
| M5 rail-shot | 6-point closed rail around scene 09 environment | smooth constant speed, no end snap | per-frame speed variation ≤ 5 % (smoothstep choreographer control exceeds it) |
| M6 pacing-120 | 20 moving bodies, 120 Hz rAF, fixedDt 1/60 | no judder on 120 fps video | S3 spacing |

## 16A. Integrated acceptance (evaluated only at CONTRACTS §7 checkpoints; never blocks)

Evaluated with `A3D_QR_CAMERA` on inside `qr_flags=all`. Screening rounds (IC-1…IC-3) record vision scores via C-32;
only G-PANEL rounds (IC-4, IC-8, IC-12, …) can pass these. Each row names the contracts/requests whose real
implementation it needs; a row whose dependency has not landed is reported "not yet evaluable", not "failed".

| ID | Criterion | Needs | Threshold |
|---|---|---|---|
| I1 | Roll rendered | CCR-08-1 + Q-15-1 | `roll = 10°` rotates the projected world-up in the captured frame by 10° ± 0.1°; M3 horizon check with rendered roll |
| I2 | One render per tick in shipped games | Q-09-5, Q-14-1 | capture reports `renderSubmissionsLastTick = 1` for every `createGameApp` route; sim-speed ratio ≥ 0.95 at the measured fps for the six L-10 routes |
| I3 | Occluder fade on production draws | C-02 real (`A3D_QR_CORE=v2`); Q-11-1 for WebGPU | M4 strip shows faded occluders; fade-off frames byte-identical to flag-off |
| I4 | Screen feel visible | C-13 consumer of `prd08.screenFeel` (PRD 03) | chroma/radial blur present in M2/hit frames; `executed.screen` > 0 without the DOM fallback |
| I5 | Cuts without TAA smear | C-14 real, C-13 TAA | first frame after `cut()` has no ghost of the previous shot (FLIP vs a no-history render ≤ IC-0 noise) |
| I6 | Scoped hit-stop freezes animation | C-19 real (PRD 06 reads `timeScale`) | animation time of the two listed actors constant for the hit-stop window |
| I7 | Feel VFX look | C-20 real particle pass | feel `vfx` bursts render as particles (`fx.backend === "particle-pass"`) |
| I8 | Audible feel | Q-09-1, Q-09-2, C-25 real | OfflineAudioContext: L/R energy > 3:1 at +x listener facing −z; engine `setRate(2)` → 880 ± 10 Hz in 0.7–1.0 s |
| I9 | Motion scenes judged | lane scenes + G-PANEL | vision/human ≥ 7/10 "camera" on M1–M5, "smooth" verdict on M6; within 1 point of the three reference |
| I10 | Templates | Q-13-1, Q-13-3 | five templates use a rig, feel bus, `app.time`, touch kit; motion strips camera ≥ 7 (falling-blocks ≥ 6), polish_juice ≥ 6 |
| I11 | Games (PRD 14 migration via Q-14-1) | Q-14-1 + the engine lanes for shading | table below |
| I12 | Casts gone | Q-14-1, Q-13-1 | `rg "as unknown as Mutable" apps packages/create-aura3d/templates` has 0 camera-spec hits; the two direct-write sites migrated; every route boots with `freezeSpecs: true` without a `TypeError` in the remote route-health run |

I11 game targets (captured at checkpoints by PRD 12's `quality-rebuild-capture.yml` with each route's `qrFlags` and
with `all`, real input, no `?capture=` lenses, C-33 strip + WebM steps). Reference bar: the research 21 vision judge's
"competent modern three.js browser game" standard. These are attributed to this lane only for the camera, polish_juice
and mobile categories, and only on routes PRD 14 has migrated (Q-14-1); shading-driven scores belong to the engine lanes.
Targets for games migrated onto this PRD's systems:

| Game(s) | Criterion | Current (research 21) | Target |
|---|---|---|---|
| aura-clash, mech-hangar | fighting rig; fighters 45–60 % frame height; visible hit-stop + shake on hits | camera 3 / 3.5, polish_juice 3 / 2 | camera ≥ 7, polish_juice ≥ 6 |
| turbo-drift-circuit, courier-rush, pulse-tunnel | chase rig; speed FOV; drift/bank; no black/inside-geometry frames | camera 3.5 / 3 / 2 | camera ≥ 7, polish_juice ≥ 6 |
| patrol-wing | flight rig; ground/horizon in frame | camera 3, polish_juice 3 | camera ≥ 7, polish_juice ≥ 6 |
| aurora-lander | altitude rig; terrain + pad always in frame; lander 8–12 % | camera 2, polish_juice 2 | camera ≥ 7, polish_juice ≥ 6 |
| deep-recovery | chase rig 15–25° pitch, near-plane occluder fade | camera 2.5, polish_juice 3 | camera ≥ 6, polish_juice ≥ 5.5 (fps is PRD 11's, C-27/C-28) |
| skyline-runner | follow2d; hero ≥ 0.25 frame height | camera 4, polish_juice 2 | camera ≥ 7, polish_juice ≥ 6 |
| blockfall, vault-breakers, bank-shot, orbital-defense | static/topDown rig with tilt + event shake/punch | camera 2–4, polish_juice 0.5–2 | camera ≥ 6, polish_juice ≥ 6 |
| gallery-shift, gravity-post, rooftop-buckets, siege-golf, neon-swarm | genre rig + shot cameras without `setScene` remount | camera 4–4.5, polish_juice 2–3 | camera ≥ 6.5, polish_juice ≥ 6 |
| All 18 on mobile 390×844 | touch controls present; no keyboard prompts; subject framing per rig | mobile_presentation 1–4 | ≥ 6 (layout is PRD 09's C-24 HUD/touch and PRD 14's routes) |

Review procedure (G-PANEL, CONTRACTS §7 and C-32): two human judges plus one vision model; disagreements > 2 points
go to the humans. Vision models receive the 12-frame strips (as images) plus the rubric; the WebM is for the human
pass only (vision models are not assumed to ingest video). The motion rubric is versioned at
`benchmarks/quality-rebuild/motion/review-rubric.md` (lane-08 path; this lane writes it in Phase 1, reusing the
research 21 category definitions verbatim so scores are comparable to the "Current" column, and registers it with
C-32), and each review record stores the rubric version, model id, capture run id and seed. "Frames are
interchangeable" is an automatic polish_juice fail, decided mechanically: for
each game capture an idle strip and an action strip from the same replay; if the mean SSIM between corresponding
frames is ≥ 0.97 **and** `diagnostics().camera.layers` energy is 0 in every action frame, the game fails polish_juice
regardless of reviewer score. Non-visual
categories (`game_feel`, `controls`, `physics_feel`, `sound_audio`) are rejudged with the research 20 rubric from code +
capture data + audio recordings; targets: game_feel ≥ 6, controls ≥ 6 (incl. touch), physics_feel ≥ 5.5 for vehicle/platformer
games, sound_audio ≥ 5 (sound is PRD 09's C-25; this lane is attributed only for listener and rpm wiring).

## 17. Performance budgets

Tiers are the C-27 `QUALITY_TIERS` (real data from PR 0a; `"auto"` resolves high on desktop, medium on coarse pointer
until PRD 11's probe is real). Budgets are for this lane's systems only (camera + layers + probe + interpolation + feel
bus + listener/rpm glue + touch overlay), measured standalone on the lane harness on the remote macos-14 runner with
the tier forced via `app.quality.set` (S19), and at checkpoints on PRD 11's mobile reference device class. The audio
graph's own cost (panners, limiter) is PRD 09's budget.

| Tier | GPU ms | CPU ms (main thread) | Memory | Bundle (min+gz, engine delta) | Notes |
|---|---|---|---|---|---|
| Low (mobile, integrated) | ≤ 0.10 (fade feature off; screen-feel flash+vignette only) | ≤ 0.35 (1 sphere cast, ≤ 300 interpolated handles) | ≤ 64 KB | typical game ≤ 15 KB, everything ≤ 24 KB (see below) | panning hint `equalpower` passed to C-25, ≤ 8 voices hint; haptics via `navigator.vibrate` |
| Medium | ≤ 0.15 | ≤ 0.45 (2 casts, ≤ 600 handles) | ≤ 96 KB | same | `equalpower`, 16 voices hint |
| High | ≤ 0.20 | ≤ 0.55 (3 casts, ≤ 1000 handles) | ≤ 128 KB | same | `HRTF`, 24 voices hint |
| Ultra | ≤ 0.25 | ≤ 0.70 (3 casts + occluder query, ≤ 2000 handles) | ≤ 192 KB | same | `HRTF`, 32 voices hint |

Net-frame requirement: on loop paths with `maxSubSteps ≥ 2`, total GPU time per presented frame must **drop** vs baseline
(one submission per tick). Standalone: the lane harness with `FixedStepDriver` (S1, S19). Integrated: the checkpoint
capture reports `renderSubmissionsLastTick = 1` for all 18 games after Q-09-5 and Q-14-1 (I2). Bundle is measured by
this lane's own fixture under `tests/qr/prd08/bundle/` with the repo's existing bundle-size tooling invoked read-only
(`tools/bundle-size/` is PRD 11's; no edit) on two fixtures:
(1) "typical game" = controller + layers + `rigs.chase` + collision + time + loop/interpolation + feel bus + touch kit
≈ R1 4 + one rig 1 + R3 1.5 + R4 0.8 + R5 1 + R6 1.5 + R12 1.5 + R10 3 = 14.3 KB, budget ≤ 15 KB; (2) "everything" (all rigs, rail/Spline, bicycle,
platformer, touch, feel, fade chunk) ≤ 24 KB, which matches the §7.4 column sum (≈ 23.9 KB including R13 and the
R11 glue). Rigs must tree-shake (the typical fixture must not pull `rail`/`Spline`/`BicycleModel`).

## 18. Browser coverage

- Chromium (macos-14 ANGLE Metal; primary, lane job `browser-gpu`); Chromium Linux SwiftShader (lane job `unit`
  where a browser is needed without GPU: touch overlay, prompts).
- WebKit (Playwright WebKit on macos-14, lane job): pointer events on touch emulation, `matchMedia` reduced motion.
  `AudioListener.positionX` fallback to `setPosition` and HRTF availability are PRD 09's (C-25) and are checked at
  checkpoints (I8).
- Firefox (Playwright on macos-14, lane job): `vibrationActuator` absent → haptics no-op; `navigator.vibrate` absent on desktop.
- Gamepad API: Playwright-injected `navigator.getGamepads` stub (CI cannot attach hardware); `playEffect` feature-detected.
- WebGPU backend: the chunk's WGSL twin is validated as text standalone; the rendered WebGPU fade is I3 after Q-11-1.

## 19. Mobile coverage

- Emulated devices (remote, lane job): 390×844 DPR 3 (iPhone 14 class), 412×915 DPR 2.625 (Pixel 7 class), landscape
  variants; touch emulation drives the lane-harness template configurations (S14). The 18 games' touch layouts are
  evaluated at checkpoints (I11 mobile row).
- Requirements: touch controls auto-shown; targets ≥ 48 CSS px; no keyboard prompt text when `activeDevice() ===
  "touch"`; safe-area insets respected; camera framing fractions recomputed from portrait aspect (rigs use `ctx.aspect`;
  framing solves on the narrower axis); reduced-motion honoured; haptics via `navigator.vibrate` on Android only (iOS
  Safari lacks it — no-op).
- Performance: Low tier budgets above; ≤ 1 camera sphere cast per frame.
- Real-device spot check (human, before the first G-PANEL round): one iOS and one Android device run the racing and
  fighting harness configurations; reviewer records feel notes (input latency, touch ergonomics, shake comfort) in
  `evidence/prd08/devices.md`.

## 20. Screenshots / evidence required

Stored under `docs/project/aura3d-quality-rebuild/evidence/prd08/` (lane-owned). For each phase exit:

1. Motion strips (12 frames @ 0.1 s, C-33 `strip`) and 3–5 s WebM (C-33 `webm`) for M1–M6, 1280×720 DPR 1, Aura3D next
   to the three.js reference, in `evidence/prd08/motion/<scene>/`, with the capture run id.
2. `diagnostics().camera` (`AuraCameraEvidence`) and `diagnostics().loop` JSON per captured frame, from the presented
   matrix — not from route inputs.
3. Frame-pacing trace CSV (`frame-pacing.spec.ts`) for 60/120/144 Hz and throttled runs.
4. Feel accounting JSON (`app.feel.evidence()`) per harness scenario, showing which channels executed on stubs.
5. Screening records (C-32) from IC-1…IC-3 next to the strips; G-PANEL records for §16A when they exist.
6. Codemod/doctor report (`camera-cast-report.md`), request ledger (`requests.md`), facts (`facts.md`).
Per migrated game and template (integrated, produced at checkpoints by PRD 12/13/14 runs): opening/mid/action strips
desktop 1920×1080 and mobile 390×844, before/after pairs from identical input replays, OfflineAudioContext WAVs (I8).

## 21. Completion criteria

Standalone completion (lane done; flag `standalone-accepted`):
- All §14 tasks that edit lane-08 paths checked; every §12.3 request and CCR filed with its spec.
- S1–S19 green on one `qr-prd08-camera.yml` run (macos-14), run id recorded.
- `app.camera`, `app.time`, `app.feel` real factories registered behind `A3D_QR_CAMERA`; flag-off identity proven.
- Facts F-08-* delivered (C-40).

Integrated completion (program done for this lane; evaluated at checkpoints, never blocks merges):
- §16A I1–I12 met at a G-PANEL round with `A3D_QR_CAMERA` on in `all`; flag `integrated-accepted`, then `default-on`.
- No claim in docs, README, or evidence that Aura3D camera/feel is "three.js-quality" or "parity" unless a G-PANEL
  round shows the median within the stated margin of the three r185 reference under the same capture conditions,
  citing rubric version and capture run id (CONTRACTS §7 honesty rule). Engineering gates (S-ids) are never cited as
  quality evidence; release notes state measured review scores.

## 22. Rollback considerations

- Lane flag: `A3D_QR_CAMERA` off (or `?a3d-qr=-camera`) restores the PR 0a stubs everywhere; sub-flags
  `A3D_QR_CAMERA_LOOP` and `A3D_QR_CAMERA_INTERPOLATION` roll back the loop and interpolation independently.
- Per-app options (PRD-local aliases, CONTRACTS §5.1): `camera: { legacy: true }` (pure `fromSpec`, no layers),
  `loop: { interpolation: false }`, `loop: { renderPerSubstep: true }` (escape hatch, removed with the flag-off path),
  `feel: false`.
- Kit defaults (`model: "bicycle"`, `feel: "responsive"`, new rig defaults) revertible per call (`model: "unicycle"`,
  `feel: false` + `instantVelocity: true`, `legacySpec: true`).
- Golden legacy-frame fixtures (C-14) make the legacy path verifiable after rollback.
- Fade: `prd08.cameraFade` is a variant bit and `prd08.occluderFade` a flagged contributor; flag off removes all cost.
- A lane PR that turns main red is reverted at once by anyone (CONTRACTS §6.1); the lane re-lands it.
- Rollback of a game migration is per-route (PRD 14, `A3D_QR_ROUTE_*`) and does not require engine rollback.

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Golden mismatch between `fromSpec` (copied math) and the legacy `resolveCameraFrame` in PRD 15's `index.ts` | silent framing changes | C-14 fixtures recorded day 0 through the stub; 1e-6 tolerance; the copy is deleted only by Q-15-1 after parity |
| `setPose` presenting through the legacy camera node adds a per-frame spec write | CPU cost or remount if the write path remounts | write via the C-22 stub's node write (no `setScene`); S19 CPU budget; if a remount is detected (`RUNTIME_ADD_REMOUNT`-style diagnostic), fall back to `legacy` and file CCR |
| `app.step(0)` in `FixedStepDriver` fires `onFrame` callbacks with dt 0 | callbacks that divide by dt | driver passes `realDt` through `onRender`; unit test with a dt-dividing callback; documented in facts |
| Roll stays unrendered for long if Q-15-1/CCR-08-1 slip | M3/flight look incomplete | roll is integrated (I1); standalone criteria use pose-level roll; `flight` rig keeps horizon via up-vector blend which does render |
| Interpolation exposes game code that teleports handles each frame (405 `game.runtimeNode` uses) → smearing on respawn | visible streaks | `teleport()` (C-37) + dev warning when a handle moves > 5 u in one step without teleport |
| One-render-per-tick changes evidence frame counters used by existing gates | false gate failures | gates read `diagnostics().loop`; Q-15-6/Q-14-3; release note |
| Shake/roll causes motion sickness | accessibility regression | reduced-motion multipliers enforced centrally; roll default 2.5° max; C-24 `GameSession.reducedMotion` honoured |
| Bicycle model feels worse than unicycle to casual players | racing feel regression | `steerAssist` default 0.6; tuned against M1 screening; kit-level opt-out |
| Camera collision via AABB fallback is coarse | camera pops near complex meshes | asymmetric springs; BVH via Q-11-2 when available; per-node `cameraBlocker: false` tag |
| Fade invisible until C-02 is real | M4 judged without fade | fade is I3; collision (S8) carries the standalone M4 result |
| Dither fade stipple without TAA | visible pattern | fade only on occluders, short duration; offset cycling when a C-13 TAA pass exists |
| Low fps (5–15 fps measured) masks feel improvements | reviewers still judge "laggy" | fps is PRD 11's; this lane's acceptance runs on the harness/M-scenes at ≥ 50 fps; game targets (I11) are attributed per category |
| Feel bus becomes another evidence-only surface | repeat of current failure | C-23 `executed` invariant (F-4) + doctor rule and lookLint rule (F-7) + panel review |
| Raising `maxSubSteps` to 6 on a CPU-bound route makes each slow frame slower (spiral of death) | fps drops further under load | substep-cap guard (§6.7) lowers the cap after 30 overloaded ticks; `overloadFrames`/`substepCapReduced` exposed via C-31 for the governor; L-10 before/after captured by PRD 14 |
| Euler ↔ quaternion round-trip in interpolation changes Euler representation (e.g. 180° flips) for code that reads `handle.rotation` back | gameplay code comparing angles misbehaves | interpolation writes only the presented transform (C-01 contributor); `handle.rotation` is never overwritten; unit test asserts this |
| Spring "half-life" misread as exact 50 % point | wrong tuning / failing tests | §6.3 documents 0.597 remaining gap for springs vs 0.5 for `damp`; C-8 tests both |
| A request is declined or slow (CONTRACTS §6.5: 2 working days) | integrated row stays "not yet evaluable" | every request has a standalone fallback in §12.3; unresolved requests appear in checkpoint reports |

## 24. Explicitly out of scope

- Particle/VFX rendering and effect visuals (PRD 07, C-20); this PRD only dispatches requests.
- Post-processing pass implementation for radial blur/chroma/vignette/flash and TAA (PRD 03, C-13/C-14).
- Shadows, IBL, materials, tone mapping (PRDs 02–04).
- Character locomotion blending, IK, and animation clips (PRD 06, C-19), beyond per-actor time scale and presentation hooks.
- The audio playback graph (panners, limiter, live loops, default cue) and sampled audio assets (PRD 09, C-25); this
  PRD supplies listener pose, rpm and feel cues only.
- HUD/menus/loading/pause shell, `createGame` and capture context (PRD 09, C-24).
- Templates and skill text (PRD 13), game route edits (PRD 14), `index.ts`/`createAuraApp` edits (PRD 15) — all via
  §12.3 requests.
- Fps/performance fixes for the 18 games (PRD 11) and per-game rebuilds (PRD 14).
- Full physical vehicle simulation (suspension-coupled tyre model, gearbox sim) and realistic flight aerodynamics.
- VR/WebXR camera rigs; `@aura3d/controls` viewer controls redesign.
