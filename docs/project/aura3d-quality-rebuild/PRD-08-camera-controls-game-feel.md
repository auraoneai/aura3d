# PRD 08 — Camera / Controls / Game Feel

Program: Aura3D visual-quality autopsy and rebuild. Branch `aura3d-quality-rebuild/audit`.
Status: proposed. Owner area: `packages/engine/src/agent-api` (camera, loop, feel, genre kits), `packages/engine/src/game/GameAudio.ts`,
`packages/audio`, `packages/input`, `packages/create-aura3d/{templates,skills}`.

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

### 2.1 Camera

| # | Finding | Location |
|---|---|---|
| C1 | `AuraApp` exposes `setScene`, `nodes`, `physics`, `onFrame`, `step`, … and **no camera handle**. | `packages/engine/src/agent-api/index.ts:10680-10769` |
| C2 | `AuraCameraSpec` is a readonly declarative record (`mode`, `position`, `target`, `offset`, `offsetMode: "scene" \| "target-yaw"`, `fov`, `smoothing`, …). No roll, no up, no velocity, no layers. | `index.ts:3160-3193` |
| C3 | `camera.follow` default `smoothing: 0.18`, `distance: 5`, `fov: 50`. | `index.ts:3249-3264` |
| C4 | `resolveCameraFrame`: one exponential mix with the same `amount` on `target` and `eye`; `responsePerSecond = -ln(1-s)·60`; resets when gap > 250 ms. Only applies to `mode === "follow"`. | `index.ts:15707-15745` |
| C5 | `applyCameraOffset` rotates the offset by `target.rotation[1]` (yaw) only. | `index.ts:15616-15619` |
| C6 | `resolveCameraEye` follow branch prefers `cameraSpec.offset` and only falls back to `distance` when offset is absent; `path`/`flythrough` are `mix3(from, to, eased)` with `phase = (t % seconds)/seconds` (snap at loop end); `dolly` is a cosine ping-pong. | `index.ts:15654-15689` |
| C7 | View matrix: `lookAtMat4([...eye], [...target], [0, 1, 0])` — fixed up vector, no roll. (R10 cited `:15760`; current location below.) | `index.ts:17759-17765` (`createViewProjection`) |
| C8 | All production-bridge camera consumers go through `resolveCameraFrame`/`createViewProjection` — a single injection point. | `index.ts:12354, 13602, 13760, 13809, 13856-13857, 16089, 16187` |
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
| T3 | `GameAppRuntime` calls `app.step(frame.dt)` per emitted substep; `app.step` = `advance` + `productionController.render` → one GPU submission **per substep**, zero submissions on 0-substep ticks; `frame.alpha` is dropped. | `GameAppRuntime.ts:151-153`; `index.ts:11592-11615` (R10) |
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
   `"pass"`. No gate looks at motion. This is a process root cause handled jointly with PRD 12.

## 4. Affected packages

- `@aura3d/engine` (`packages/engine`) — camera controller, rigs, loop/time, interpolation, feel bus, genre kits,
  `GameAudio`, touch mount.
- `@aura3d/audio` (`packages/audio`) — `PositionalEmitter` live rate fix, listener, mixer reuse.
- `@aura3d/input` (`packages/input`) — haptics + virtual joystick reused by engine touch kit.
- `@aura3d/physics` (`packages/physics`) — interpolation helpers reused; camera collision probe via existing queries.
- `@aura3d/scene` (`packages/scene/src/MathTypes.ts`, exported as `@aura3d/scene/math`) — `lookAtMat4` already takes an arbitrary up; add `rollUpVector(forward, up, roll)` and `quatFromEulerXYZ`/`eulerXYZFromQuat`/`slerpQuat` tuple helpers over `@aura3d/math` `Quaternion`/`Euler`.
- `@aura3d/lean` (`packages/lean/src/game.ts`) — lean camera rig and shake collapse onto the engine controller.
- `@aura3d/controls` — no functional change; documented as viewer-only.
- `create-aura3d` templates + skills; `aura3d-cli` skill mirror.
- All 18 games (migration executed under PRD 14).

## 5. Affected files / directories

New:

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
- `tests/unit/engine/camera-controller.test.ts`, `camera-spring.test.ts`, `camera-rigs.test.ts`, `camera-spline.test.ts`,
  `time-controller.test.ts`, `render-interpolation.test.ts`, `bicycle-vehicle.test.ts`, `platformer-accel.test.ts`,
  `feel-bus.test.ts`, `game-audio-spatial.test.ts`, `touch-controls-mount.test.ts`.
- `tests/browser/camera-feel-harness.{html,ts}`, `tests/browser/camera-feel.spec.ts`, `tests/browser/frame-pacing.spec.ts`
  (matched by the existing `playwright.config` `testMatch: tests/browser/**/*.spec.ts`).
- `tests/fixtures/camera/legacy-frames.json` (C-14 golden fixture).
- `tools/camera-cast-codemod/index.mjs` + `tools/camera-cast-codemod/fixtures/` (new tool directory, following the
  one-directory-per-tool convention under `tools/`).
- `benchmarks/quality-rebuild/motion/` — temporal scenes M1–M6 (see §16; infrastructure owned by PRD 12).

Changed tests (existing gates that assert "fired"/"adopted", §2.1 C21): `tests/browser/gamefeel-camera-rigs.spec.ts` +
`gamefeel-camera-rigs-harness.ts`, `tests/browser/route-gamefeel-adoption.spec.ts`, `tests/browser/game-runtime-visual.spec.ts`,
`tests/unit/engine/game-camera-rigs.test.ts`, `tests/unit/engine/fixed-step-determinism.test.ts`,
`tests/unit/game-runtime/game-runtime-source-gates.test.ts`, `tests/unit/apps/skyline-player-feel.test.ts`.

Changed:

- `packages/engine/src/agent-api/index.ts` — `AuraApp` (10680-10769), `camera.*` builders (3216-3290),
  `resolveCameraFrame` (15707-15745), `resolveCameraEye` (15654-15689), `createViewProjection` (17759-17765),
  render dt (11328, 12319, 12382), `app.step`/render coupling (11592-11615), `runtimeAlpha` (11290-11302),
  `createGameRacingCameraRig` gate (7641-7650), `createGameApp` (11818+).
- `packages/engine/src/agent-api/FrameLoop.ts`, `GameAppRuntime.ts`; `index.ts:7061, 8204` (other `maxSubSteps ?? 5` defaults).
- `packages/engine/src/agent-api/GameCameraRigs.ts` (keep math, re-home as rigs/layers, delete aggregator).
- `packages/engine/src/agent-api/GameFeel.ts` (hit-stop → TimeController; effects → PRD 07 layer).
- `packages/engine/src/agent-api/GameRuntime.ts` — vehicle (2007-2045), platformer body (2181-2186), director (2734-2798),
  combat `hitStop` events (3596, 3617).
- `packages/engine/src/agent-api/GameGenreKits.ts` — platformer defaults (851-872), fall gravity (1054-1057), racing kit (1343-1580).
- `packages/engine/src/agent-api/GameSceneGeometryBindings.ts` — rig builders (469-531, 676-733).
- `packages/engine/src/agent-api/CameraChoreographer.ts` — real Catmull-Rom.
- `packages/engine/src/game/GameAudio.ts` — spatial routing, live loops, default cue, mixer.
- `packages/audio/src/PositionalEmitter.ts`, `AudioSource.ts`.
- `packages/lean/src/game.ts` — rig/shake → engine controller adapters.
- `packages/scene/src/MathTypes.ts` — `lookAtMat4` already takes an up vector; add `rollUpVector(forward, up, roll)` and quat tuple helpers.
- `packages/rendering/src/ShaderLibrary.ts` (GLSL fragment variants) and `packages/rendering/src/WebGPUDevice.ts`
  (WGSL PBR source + packed uniform buffer, `u_cameraPosition` packed at float offset 164, `:2230`) — §8.2 fade.
- Six game `loop.maxSubSteps: 2` lines (L-10): `apps/showcase-bank-shot/src/main.ts:391`, `showcase-blockfall-reactor/src/main.ts:668`,
  `showcase-gallery-shift/src/main.ts:1137`, `showcase-rooftop-buckets/src/main.ts:761`, `showcase-vault-breakers/src/main.ts:410`,
  `showcase-siege-golf/src/main.ts:884`.
- `packages/create-aura3d/templates/{mini-game,racing-starter,fighting-game,character-controller,falling-blocks-starter}/src/main.ts`.
- `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md` and `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md`.

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
 └─ audio.listener ← PresentedPose (auto)                                   [A-3]
 └─ feel.postUniforms ← layers (radial blur, chroma, vignette, flash)       [S-3, PRD 03]
 └─ renderer.render(once)   using view = inverse(PresentedPose), prevVP     [R-*]
 └─ camera.evidence ← exactly the matrix submitted
```

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
so existing scenes render unchanged, but layers (shake, punch) now apply after it. `resolveCameraFrame` becomes a thin
call into the controller; all eight consumers in §2.1 C8 switch to `controller.presented()`.

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
via `app.physics` queries when a physics world exists, otherwise a CPU BVH over render-item bounds (PRD 11 owns the
BVH; Phase 2 ships an AABB-list fallback). Pull-in half-life 0.04 s, push-out half-life 0.35 s (asymmetric to avoid
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
Mobile: none. Fallback: `layers.enabled = false` (capture mode "poster" may freeze layers, see PRD 09 `app.capture`).

### 6.6 Time controller

`app.time` replaces the `FrameLoop.timeScale` constant and `gameFeel.effectiveDt` convention:

- `scale` (settable, springable via `time.scaleTo(value, halflife)`).
- `hitStop(seconds, { scope })`: `scope: "global"` sets sim dt to 0; `scope: actor[]` sets per-handle `timeScale = 0`
  for the listed runtime handles and their animation controllers (PRD 06) while the rest of the sim runs. Overlapping
  hit-stops take `max(remaining)`, never sum.
- `slowMo(scale, seconds, { easeOut })`.
- Combat world events with `hitStop` in seconds (GameRuntime.ts:3596, 3617) call `time.hitStop(event.hitStop, { scope:
  [attacker, defender] })` by default; opt out with `combat({ autoHitStop: false })`.
- `gameFeel.hitStop(durationMs)` forwards to `app.time.hitStop(durationMs / 1000)` when the feel controller is attached
  to an app (`app.time` is seconds-based; `gameFeel` stays ms-based for back-compat).

### 6.7 Loop and interpolation

`createGameApp` and `createAuraApp({ autoStart: true })` share one loop implementation:

- `maxFrameDt` default 0.1 s, applied to rAF dt on every path (fixes T5).
- `maxSubSteps` default 6 (changed in all three places: `FrameLoop.ts:62`, `index.ts:7061`, `index.ts:8204`); overload policy `"slow-motion"` (today's behaviour, now explicit: time beyond `maxSubSteps·fixedDt` is discarded) or `"catch-up"` (excess stays in the accumulator, capped at `maxFrameDt`, and is consumed on following ticks so sim time is preserved); overload frames counted in
  `diagnostics().loop.overloadFrames` (honest telemetry, also feeds PRD 11 governor). Spiral-of-death guard: if the
  mean CPU time of one substep × `maxSubSteps` exceeds the frame budget for 30 consecutive ticks, the loop lowers its
  effective substep cap by 1 (floor 2) and records `loop.substepCapReduced`; it never raises it above the configured value.
- Render once per tick after all substeps (fixes T3).
- Interpolation store per runtime handle: previous/current position vec3, rotation as quaternion (converted from the
  handle's XYZ Euler with `@aura3d/math` `Euler`/`Quaternion`, slerped, then converted back to XYZ Euler for the
  existing render path — C18), scale vec3 = 80 bytes. Handles opt out with `handle.interpolate = false`;
  `handle.teleport(x, y, z)` (positional, matching `setPosition`) copies current into previous to avoid smear across
  respawns.
- `onRender(frame: { alpha, realDt, simTime })` added for routes that draw HUD or custom effects.
- `ScenePhysicsBridge` interpolation path (physics/src/ScenePhysicsBridge.ts:70-78) is reused for physics-driven nodes so
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

Each channel is optional and dispatches to: camera trauma/punch layers, `app.time`, `@aura3d/input` `Haptics` (gamepad
`vibrationActuator.playEffect("dual-rumble")`, `navigator.vibrate` on touch), `GameAudio`, the PRD 07 effects layer,
and the PRD 03 screen-feel uniforms. Reduced-motion/flash policies are applied centrally. Evidence records emitted
events and which channels **executed** (node handle created, layer energy > 0 at presentation), not requested values.

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

- Touch kit: `game.touchControls.mount(app, layout)` renders the `createGameTouchControlLayout` regions as DOM
  (pointer events, `touch-action: none`, safe-area insets, ≥ 48 CSS px targets, 44 px minimum per WCAG 2.5.5 AAA
  guidance), drives `createGameInput` axes/actions via a virtual device, uses `VirtualTouchJoystick` (floating stick,
  dead zone 0.12). Auto-shows on first touch, hides on keyboard/gamepad input.
- Device prompts: `input.activeDevice()` → `"keyboard" | "gamepad" | "touch"` and `input.prompt(action)` → glyph/text
  for the active device; HUD helpers use it so "HOLD SPACE" never appears on touch.
- Input buffering: keep the 120 ms global buffer; add per-action `bufferMs` and `consume(action)` to prevent double
  fires; jump/attack defaults 130/150 ms.
- Audio: `playPositional` builds `PannerNode` (`HRTF` on High/Ultra, `equalpower` on Low/Medium/mobile), listener auto-
  synced to `app.camera` presented pose each frame; `audio.loop(cue)` returns `{ setRate, setGain, setPosition, stop }`
  with `AudioParam.setTargetAtTime` smoothing (τ 0.03 s); `audio.engine(cue, { rpmRange, pitchRange, layers })` maps
  vehicle `rpm` to playbackRate; master `DynamicsCompressorNode` limiter (threshold −6 dB, ratio 12, knee 6); per-cue
  `pitchJitter`/`gainJitter`; voice limit per cue (default 4) with oldest-steal; `PositionalEmitter` live rate fix;
  default cue replaced by a dev-mode warning and a filtered noise transient (no tonal beep).

## 7. APIs to add / change / remove

### 7.1 Add

```ts
// packages/engine/src/agent-api/camera/CameraController.ts
/** New public type (none exists today, §2.1 C18): unit quaternion [x, y, z, w]. */
export type AuraQuat = readonly [number, number, number, number];

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
  readonly rotation: AuraQuat;        // interpolated
  readonly velocity: AuraVec3;        // finite-difference of interpolated position, springed
  readonly bounds?: { readonly min: AuraVec3; readonly max: AuraVec3 }; // from AuraRuntimeNodeHandle.bounds()
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
  cut(): void;                               // resets springs + renderer temporal history
  evidence(): AuraCameraEvidence;
}

export interface AuraTraumaLayer extends AuraCameraLayer {
  add(amount: number): void;                 // clamps trauma to [0,1]
  configure(options: Partial<{ maxOffset: number; maxYawDeg: number; maxPitchDeg: number; maxRollDeg: number; frequency: number; decay: number; seed: number }>): void;
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

// AuraApp additions (index.ts:10680)
export interface AuraApp {
  readonly camera: AuraCameraController;
  readonly time: AuraTimeController;
  readonly feel: AuraFeelBus;
  onRender(callback: (frame: { readonly alpha: number; readonly realDt: number; readonly simTime: number }) => void): () => void;
}

// Runtime handle additions (AuraRuntimeNodeHandle, index.ts:10497; rotation stays XYZ Euler AuraVec3)
export interface AuraRuntimeNodeHandle {
  interpolate: boolean;                      // default true
  timeScale: number;                         // default 1; set by hitStop scope
  teleport(x: number, y: number, z: number, rotation?: AuraVec3): this; // positional like setPosition; rotation Euler XYZ
}

// createAuraApp / createGameApp option addition
export interface AuraAppAccessibilityOptions {
  readonly reducedMotion?: GameAccessibilitySource;   // from game.accessibility.reducedMotion(); default reads matchMedia
}

// Loop options (createGameApp / createAuraApp)
export interface AuraLoopOptions {
  readonly fixedDt?: number;                 // default 1/60
  readonly maxSubSteps?: number;             // default 6
  readonly maxFrameDt?: number;              // default 0.1
  readonly overload?: "slow-motion" | "catch-up"; // default "slow-motion"
  readonly interpolation?: boolean;          // default true
}

// Feel bus
export interface AuraFeelEventSpec {
  readonly shake?: number;
  readonly punch?: { readonly fov?: number; readonly dolly?: number };
  readonly hitStop?: { readonly seconds: number; readonly scope?: "global" | "actors" };
  readonly haptics?: { readonly strong?: number; readonly weak?: number; readonly ms?: number };
  readonly audio?: { readonly cue: string; readonly pitchJitter?: number; readonly gainJitter?: number; readonly positional?: boolean };
  readonly vfx?: { readonly kind: string; readonly count?: number };   // dispatched to PRD 07 effects layer
  readonly screen?: { readonly flash?: number; readonly chroma?: number; readonly radialBlur?: number; readonly vignette?: number };
}
export interface AuraFeelBus {
  define(event: string, spec: AuraFeelEventSpec): void;
  emit(event: string, at?: { readonly position?: AuraVec3; readonly actors?: readonly (string | AuraRuntimeNodeHandle)[]; readonly strength?: number }): void;
  preset(name: "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm"): void;
  evidence(): { readonly emitted: number; readonly executed: Record<string, number> };
}

// Easing (shared; also used by tween in PRD 09)
export type AuraEaseName = "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic" | "outBack" | "outElastic" | "inOutSine" | "outExpo";
export declare const ease: Record<AuraEaseName, (t: number) => number>;
export declare function damp(current: number, target: number, halflife: number, dt: number): number;

// Vehicle
export interface GameArcadeVehicleOptions { /* existing fields */ readonly model?: "unicycle" | "bicycle"; readonly mass?: number; readonly cgToFront?: number; readonly cgToRear?: number; readonly yawInertia?: number; readonly maxSteer?: number; readonly steerReferenceSpeed?: number; readonly tyre?: { readonly mu?: number; readonly B?: number; readonly C?: number }; readonly handbrakeRearGrip?: number; readonly dragCoefficient?: number; readonly rollingResistance?: number; readonly torqueCurve?: readonly (readonly [number, number])[]; readonly steerAssist?: number }
export interface GameArcadeVehicleState { /* existing: x, z, heading, speed, drift */ readonly lateralVelocity: number; readonly yawRate: number; readonly slipAngle: number; readonly drifting: boolean; readonly rpm: number; readonly lateralG: number }

// Platformer body / kit
export interface GamePlatformerBodyOptions { readonly groundAccel?: number; readonly groundDecel?: number; readonly turnAccel?: number; readonly airControl?: number; readonly instantVelocity?: boolean; readonly presentation?: boolean }
export interface GamePlatformerLevel { /* existing */ readonly feel?: PlatformerFeel | false; readonly apexHangGravityScale?: number } // feel default "responsive"; false = today's behaviour

// Controls
export interface AuraTouchControlsMount { readonly visible: boolean; show(): void; hide(): void; dispose(): void }
export declare function mountTouchControls(app: AuraApp, input: GameInputController, layout: GameTouchControlLayout, options?: { readonly autoHide?: boolean; readonly opacity?: number }): AuraTouchControlsMount;
export interface GameInputController { /* existing */ activeDevice(): "keyboard" | "gamepad" | "touch"; prompt(action: string): { readonly label: string; readonly glyph?: string }; consume(action: string): boolean }

// Audio
export interface GameAudioLoopHandle { setRate(rate: number, timeConstant?: number): void; setGain(gain: number, timeConstant?: number): void; setPosition(position: AuraVec3): void; stop(fadeSeconds?: number): void }
export interface GameAudio<TCue extends string> { /* existing */ loop(cue: TCue, options?: { readonly position?: AuraVec3; readonly bus?: string }): GameAudioLoopHandle; engine(cue: TCue, options: { readonly rpmRange: readonly [number, number]; readonly pitchRange: readonly [number, number] }): { update(rpm: number, throttle: number): void; stop(): void }; attachListener(camera: AuraCameraController): void }
```

### 7.2 Change

| API | Change |
|---|---|
| `scene().camera(spec)` | Still accepted; wrapped by `rigs.fromSpec`; spec object is frozen in dev (`Object.freeze`) after Phase 5 so cast-mutation throws with a message pointing at `app.camera`. |
| `camera.follow({ smoothing })` | `smoothing` deprecated; `fromSpec` keeps the first-order filter with `halflife = ln2 / (-ln(1-s)·60)` (identical output, §6.3), dev warning once with the computed half-life. New options `halflife` (first-order, legacy-compatible) and, on rigs, spring half-lives. Converting a route from `smoothing` to a spring rig is a visible change and is done per game in PRD 14. |
| `game.racingCameraRig` / `game.platformerCameraRig` / `createGameRacingPresentationCamera` | Return `AuraCameraRig` (`rigs.chase` / `rigs.follow2d`) with new defaults instead of a spec with `smoothing 0.045`. Old shape behind `{ legacySpec: true }` for one minor release. |
| `createGameRacingCameraRig` | Remove the composition path/verdict-string gate (index.ts:7641-7650). |
| `camera.shake` / `camera.punchIn` (GameCameraRigs) | Become constructors for detached layers usable via `app.camera.addLayer`; `roll` and `distanceOffset` applied. |
| `game.cameraDirector` | Re-implemented as `rigs.fighting` + `app.camera.shake`; old `update()` returns the presented pose; `bind(app)` attaches. |
| `FrameLoop` | `timeScale` mutable via TimeController; `maxFrameDt`; emits `onRender` once per tick with alpha. |
| `GameAppRuntime.step` | Advances N substeps, renders once. |
| `gameFeel.hitStop` / `effectiveDt` | Forward to `app.time` when attached; `effectiveDt` kept for detached use. |
| `GameAudio.playPositional` / `setOcclusion` | Real panner + lowpass (`BiquadFilterNode` cutoff from occlusion). |
| `PositionalEmitter.update` | Writes `source.playbackRate.value`/`setTargetAtTime` on the live buffer node. |
| `CameraChoreographer` `"catmull-rom"` | Real centripetal Catmull-Rom via `camera/Spline.ts`. |
| Platformer kit defaults | `feel: "responsive"` (fall ×1.6 + apex hang), accel/decel/air control on. |
| `game.racing` | `model: "bicycle"` + `VehicleChassis` presentation on by default. |

### 7.3 Remove (after deprecation window, PRD 15 schedules)

- `createGameCameraRig` aggregator (GameCameraRigs.ts:525-596) — replaced by controller.
- lean `createLeanCameraRig` and hash-noise shake (`packages/lean/src/game.ts:79, 140-163`) — become adapters.
- `runtimeAlpha` modulo computation (index.ts:11290-11302).
- `GameAudio` sine default cue (`playDefaultCue`, GameAudio.ts:485-503).
- Evidence fields that report unapplied camera values (turbo/skyline `cameraDistance`, `maxShakeOffset` from inputs) —
  route-side removal in PRD 14; engine side: `GameCameraEvidence` from `createGameCameraRig` removed.
- `apps/common/src/rapier-physics-proof.ts` from game startup (research 10 §6.3; executed under PRD 09/14).

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
| R11 Spatial audio + live loops + limiter | Engine pitch, positional cues, no clipping | 0 | WebAudio thread: HRTF ≈ 0.02 ms/voice; equalpower ≈ 0 | panner per voice | +2 KB | equalpower, 8 voices | non-spatial (current) |
| R12 Feel bus + presets | One declaration → camera/time/haptics/audio/VFX/screen | depends on PRD 03/07 channels | < 0.01 ms/event | < 2 KB | +1.5 KB | haptics via `navigator.vibrate` | per-channel disable |

## 8. Shader changes

Camera, time, and controls are CPU systems; the view matrix (incl. roll) is built on the CPU. Three shader-level
changes are in scope or required as feeds:

### 8.1 View matrix with roll — no shader change

`createViewProjection` (index.ts:17759-17765) builds `view = lookAtMat4(eye, target, upRolled)` where
`upRolled = rotate(up, forward, roll)` (Rodrigues), or directly `view = inverse(compose(position, orientation))` from the
controller's quaternion. All PBR/WGSL code consumes `u_viewProjection`/`u_cameraPosition` unchanged.
`u_cameraPosition` must be the **presented** (post-shake) eye so specular/fresnel stays consistent with the view.

### 8.2 Occluder screen-door fade (new, PBR + unlit variants)

For draws the probe reports as occluding the eye→subject segment, the renderer sets a per-draw uniform
`u_cameraFade` (float, 1 = opaque). Fragment stage, before lighting:

GLSL (`packages/rendering/src/ShaderLibrary.ts`: every PBR fragment variant that declares `u_cameraPosition` — today
`:206`, `:719`, `:1249`, `:1786`, `:2413` — plus the unlit fragment variant; guarded by `#ifdef A3D_CAMERA_FADE`):

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

WGSL equivalent: the WebGPU PBR fragment source is embedded in `packages/rendering/src/WebGPUDevice.ts` with a packed
per-draw uniform buffer (`u_cameraPosition` written at float offset 164, `:2230`); append `cameraFade: f32` and
`cameraFadeOffset: vec2<f32>` to that packed struct (respecting 16-byte alignment, bump the buffer size), and add
`if (u.cameraFade < 0.999 && bayer4(pos.xy + u.cameraFadeOffset) >= u.cameraFade) { discard; }` with `bayer4` as a
`const` array lookup. Shadow pass unaffected (occluder still casts). Variant key bit
`cameraFade` so non-faded draws pay nothing (discard disables early-Z only on the faded variant). A static Bayer
pattern does **not** resolve under TAA (the same pixels are discarded every frame), so `u_cameraFadeOffset` cycles
through the 4 offsets `(0,0) (2,2) (2,0) (0,2)` frame by frame whenever TAA is active (PRD 03 exposes the frame index);
without TAA the offset is held at `(0,0)` and the stipple is accepted. Fade target 0.3, spring half-life 0.08 s.

### 8.3 Screen-feel uniforms (feeds into PRD 03 final composite)

This PRD defines the parameters; PRD 03 owns the pass. Uniforms: `u_feelFlash` (linear HDR additive, applied pre-tone-
map), `u_feelChroma` (0..1), `u_feelRadialBlur` (0..1), `u_feelVignette` (0..1), `u_feelCenter` (vec2 NDC of the event,
from the feel bus position projected through the presented VP). Reference GLSL behaviour for PRD 03:
- radial blur: 8 taps along `(uv - center)`, step `0.012 · u_feelRadialBlur`, weights `1 - i/8`, normalised;
- chroma: sample R at `uv + d·k`, B at `uv - d·k`, `d = (uv - 0.5)`, `k = 0.006 · u_feelChroma`;
- vignette pulse: `col *= 1 - u_feelVignette · smoothstep(0.35, 0.9, length(uv - 0.5))`;
- flash: `hdr += u_feelFlash · flashColor` before exposure/tonemap.
All four short-circuit when the uniform is 0 (single branch); on Low tier only flash + vignette are enabled.

### 8.4 Velocity / temporal history

`packages/rendering/src/TemporalHistory.ts:71-93` builds the velocity pass from `u_modelViewProjection` (current) and
`u_previousViewProjection` (previous), i.e. camera-motion vectors only, and rejects skinned/morphed/transparent items
(`:74`). The controller supplies the previous presented VP each frame and sets it equal to current on `cut()` (also
calls `resetTemporalHistory("camera-cut")`, index.ts:12471). Interpolated per-object previous model matrices
(`u_previousModel`) are produced by §6.7 and exposed for PRD 03's per-object motion vectors; this PRD exposes them,
PRD 03 adds the uniform and consumes them.

## 9. Rendering changes

1. `createViewProjection` and every consumer in §2.1 C8 read `app.camera.presented()`; `resolveCameraFrame` and the
   `smoothedCameraFrames` WeakMap (index.ts:15696-15745) are deleted once `rigs.fromSpec` reproduces them.
2. Exactly one `productionController.render` per tick (index.ts:11592-11615 split into `advance` + `present`).
3. Renderer receives interpolated model matrices for runtime handles (currently teleported via `setPosition`).
4. Camera cut → `resetTemporalHistory("camera-cut")`; rig blends do not reset history.
5. Projection: FOV from the presented pose (layers included); near plane auto-adjust `near = clamp(0.02·distanceToSubject,
   0.05, 0.5)` for chase/fighting/altitude rigs to recover depth precision (helps SSAO/SSR linearised depth issues
   in research 19; precision work owned by PRD 01).
6. Siege Golf-style per-phase `setScene` remounts are replaced by `app.camera.use(rig, { blend })` (no remount, no blank
   frame).
7. Letterbox bars via viewport scissor + clear in the final composite (PRD 03 hook) — no extra pass.
8. Diagnostics: `diagnostics().camera` = `AuraCameraEvidence`; `diagnostics().loop` = `{ realFps, simHz, substepsLast,
   overloadFrames, renderSubmissionsLastTick }`. The engine fps counter must report presented frames per real second
   (research 20: engine reports 60 while harness measures 5–20 fps; counter fix co-owned with PRD 11).

## 10. Migration plan

1. Phase 1 lands controller + `rigs.fromSpec` + loop fixes with **zero visual change by default** except dt clamp and
   one-render-per-tick (both strict improvements). All 18 games keep working.
2. Phase 2 ships rigs/layers; engine rig builders (`game.racingCameraRig`, `game.platformerCameraRig`) switch to new
   defaults. Games that call them (turbo, skyline, courier, others per research 10 §2: 7 + 7 call sites) visibly change;
   PRD 14 owns per-game retune and capture.
3. Codemod `tools/camera-cast-codemod/index.mjs` rewrites the known `Object.assign(x as unknown as Mutable…, {...})`
   patterns (§2.2 G1 style a) into `app.camera` calls and prints a manual-migration list for style (b) direct writes
   (skyline `feel.ts:474-480`, blockfall `camera-feel.ts:85-91`) and any other write to a value typed as or derived from
   `AuraCameraSpec`; run on `apps/` and `packages/create-aura3d/templates/`.
4. Templates (mini-game, racing-starter, fighting-game, character-controller, falling-blocks-starter) are rewritten in
   Phase 5 to use rigs, feel bus, time controller, touch kit — they are what agents copy (research 10 §10).
5. Skill update (both `create-aura3d` and `aura3d-cli` copies) adds a "Camera and feel" section and forbids
   evidence-only feel (PRD 13 owns skill infrastructure).
6. After two minor releases: freeze camera spec in dev, remove aggregator/lean shake/sine cue (§7.3).

### 10.1 Per-game impact matrix

What each shipped game gets from this PRD, what changes visibly, and what PRD 14 must do. "Phase 1 auto" = changes
that reach the game with no route edit. Loop regime from §2.3 T9; current scores from research 21 (camera /
polish_juice / mobile_presentation).

| Game | Scores now | Loop regime → Phase 1 auto effect | Camera today → target rig | Feel / time | Controls / audio | PRD 14 work items |
|---|---|---|---|---|---|---|
| aura-clash | 3 / 3 / 2 | headless `createGameApp {1/60,3}` → dt clamp; render coupling unchanged until route uses `onRender` | static perspective, orbits mid-fight → `rigs.fighting` (p 0.5) | combat `autoHitStop` (0.045/0.06 s) + `fighting` preset | touch kit replaces "HOLD SPACE"; sampled audio already | remove orbit; bind director; touch layout |
| mech-hangar | 3.5 / 2 / 1.5 | hand-rolled accumulator → none | static → `rigs.fighting` | `fighting` preset, hit-stop | touch kit; device prompts | port accumulator to `createGameApp` |
| turbo-drift-circuit | 3.5 / 2.5 / 3 | raw dt → none | follow spec + cast (`main.ts:2760`), capture-only smoothing bypass (`:2826-2830`) → `rigs.chase` + bank + speed FOV | `racing` preset; drift/boost events | `audio.engine` on rpm; touch steer | delete cast, magic composition strings (`:2789-2794`), `VISUAL_CAPTURE_CAMERA` bypass; bicycle model retune |
| courier-rush | 3 / 2 / 3 | raw dt → none | chase spec + cast (`main.ts:1394`) → `rigs.chase` + collision (suspected inside-geometry frames) | `racing`/`arcade` | touch kit | delete cast; collision tags on world kit (PRD 10) |
| pulse-tunnel | 2 / 2 / 1 | raw dt → none | chase, static FOV → `rigs.chase` with speed FOV + `fovKick` on beat | beat-synced punch | touch kit | wire beat events to `app.feel` |
| patrol-wing | 3 / 3 / 3 | `createGameApp {1/60,4}` → one render/tick, interpolation | chase spec + 3 casts (`main.ts:805, 854, 1051`) → `rigs.flight` (bank 0.6, horizonLock) | `arcade` preset | replace 11 text buttons with touch stick + 2 buttons; throttle → `audio.engine` | delete casts; `game.craft` |
| aurora-lander | 2 / 2 / 4 | hand-rolled → none | far static → `rigs.altitude` (lander 8–12 %) | land impact event | `audio.engine` thrust | port to `game.craft` |
| deep-recovery | 2.5 / 3 / 3 | raw dt (0.5 fps measured) → dt clamp prevents multi-second sim jumps | low/close chase → `rigs.chase` 15–25° pitch + occluder fade | — | positional sonar via panner | fps blocker owned by PRD 11 first |
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

- Scenes using `scene().camera(spec)` with no `app.camera` calls render identically (same eye/target math via
  `rigs.fromSpec`, same smoothing via the mapping in §6.3). Verified by golden pose tests (task C-14).
- `smoothing` keeps working with a deprecation warning; behaviour identical.
- Cast-mutation of the spec keeps working until the freeze (Phase 5 + 2 releases) because `fromSpec` reads the spec
  object by reference every frame, same as today.
- `createGameApp({ loop })` signature unchanged; added fields optional. Behavioural change: one render per tick, dt
  clamp, `maxSubSteps` default 5 → 6 (only affects callers that do not pass it). Routes that relied on render-per-substep for evidence counts (frame counters) must read
  `diagnostics().loop` instead; listed in release notes.
- Interpolation affects only the presented transform; `handle.position`/`handle.rotation` read by gameplay code remain
  the latest simulated values.
- `gameFeel.effectiveDt` kept. `game.cameraDirector().update()` keeps its return type.
- `createGameArcadeVehicle` default stays `"unicycle"` for direct callers for one release; `game.racing` defaults to
  `"bicycle"` immediately (kit-level change, documented).
- Platformer kit default motion change is a feel change for kit users (skyline unaffected: already uses
  `solvePlatformerMotion`). `feel: false` + `instantVelocity: true` restores old behaviour.
- Lean entry (`@aura3d/lean/game`) keeps its API; implementation delegates.

## 12. Dependencies on other PRDs

| PRD | Dependency |
|---|---|
| 01 Rendering Core / Scene Graph | Presented-pose injection into the view matrix path; near/far precision; quaternion runtime handle rotation. Blocking for Phase 1 integration (light). |
| 03 Postprocessing / AA / Tone Mapping | Screen-feel composite (§8.3), TAA to resolve dither fade, velocity buffer with interpolated previous matrices, letterbox hook. Phase 3 feel `screen` channel blocked on 03. |
| 06 Animation / Characters | Per-actor `timeScale` for hit-stop scope; squash/stretch/lean presentation applied to skinned characters; landing/anticipation clips. |
| 07 VFX / Particles | Feel bus `vfx` channel requires an auto-rendered effects layer (`game.effects` currently draws nothing; research 16 §4, 19). This PRD does not build particles. |
| 09 Shared Game Runtime | `app.capture` (capture may set camera pose/clock only), `game.session` pause/visibility (pause must stop sim and freeze layers), tween module shares `ease`. |
| 10 World Building | Camera collision geometry/BVH tags (`cameraBlocker`, `cameraFade`) on world kits. |
| 11 WebGPU / Performance Tiers | Tier definitions used in §17; fps counter honesty; BVH for probe; governor reads `overloadFrames`. |
| 12 Visual Benchmark + Regression | Temporal motion scenes M1–M6 and video/frame-strip capture in the remote harness; vision-model review loop. |
| 13 Agent Authoring / Skills / Templates | Skill text + template rewrite + lint rule "no evidence-only feel". |
| 14 18-Game Rebuild | Per-game migration and retune; acceptance captures. |
| 15 API Consolidation | Deprecation schedule; folding `@aura3d/input`/`@aura3d/controls`/lean duplicates. |

## 13. Implementation phases

Each phase ends with a remote CI run (GH Actions macos-14, see §15) and, from Phase 2 on, a vision/human review of
captured motion strips (§16). A phase is not complete on green tests alone.

**Phase 1 — Loop, time, controller skeleton (no default look change).**
Scope: L-1…L-10, T-1…T-6, C-1…C-6, C-14.
Exit criteria: (a) one renderer submission per rAF tick in all three loop paths, proven by
`diagnostics().loop.renderSubmissionsLastTick === 1` in `tests/browser/frame-pacing.spec.ts`; (b) with a synthetic rAF
driven at exactly 100 ms intervals (rAF override + `page.clock`, not CPU throttling, so the test is deterministic) and
`maxSubSteps: 6`, `simTime` advances 1.00 s ± 1 fixed step per 1.00 s of wall time; with a 250 ms interval, realDt
is clamped to `maxFrameDt` (0.1 s) so `simTime` advances 0.1 s per tick and `diagnostics().loop.clampedFrames`
increments every tick (documented slow-motion below 10 fps); with `fixedDt: 1/120` at 100 ms intervals,
`overloadFrames` increments every tick under `overload: "slow-motion"` (sim advances 6/120 = 0.05 s per tick) and under
`"catch-up"` total sim time after 10 ticks equals 10 × 0.1 s ± 1 fixed step once the input stops; (c) 120 Hz synthetic rAF trace shows
presented runtime-node positions monotonic and evenly spaced (max step deviation ≤ 10 % of mean) with interpolation on,
and the same trace with `interpolation: false` shows the 2:1 judder pattern (proves the test can fail);
(d) golden pose tests show `rigs.fromSpec` matches the pre-change `resolveCameraFrame` output within 1e-6 for 40 recorded
spec/time/subject tuples; (e) `app.time.hitStop` freezes sim for the requested duration ±1 fixed step.

**Phase 2 — Rigs, springs, layers, collision.**
Scope: C-7…C-13, R-1…R-12, Y-1…Y-7, S-1…S-2.
Exit criteria: (a) chase rig, subject at constant 20 u/s on a straight line, look-ahead disabled: eye-to-subject
distance stays within 2 % of the configured `distance(v)` after 1 s, and the subject's projected centre stays within
3 % of frame height of its rest position (today: 7.2 u lag, subject shrinks); (b) shake reaches pixels unfiltered: for
every frame of a trauma-1.0 impulse, the presented view's yaw/pitch/roll offset relative to the rig pose equals the
trauma layer's own output within 1e-6 rad (today the follow filter passes 4–9 %), and with the default seed the
layer's peak |yaw| in the first 0.25 s is ≥ 0.35 · `maxYawDeg` (guards against collapsed noise amplitude; trauma² is
≥ 0.36 over that window at `decay 1.6/s`); (c) roll visible in
presented VP: `roll = 10°` rotates the projected world-up direction by 10° ± 0.1°; (d) collision: eye never inside a
test box wall over a scripted 30 s orbit; (e) motion benchmark scenes M1–M4 captured and reviewed (§16) with pass verdicts.

**Phase 3 — Feel bus, hit-stop consumers, screen-feel feed, cinematic rails.**
Scope: F-1…F-7, T-7…T-8, Q-1…Q-5 (sequence/rail), S-3.
Exit criteria: (a) combat event with `hitStop 0.07` freezes both actors for 0.07 s ± 1 step while camera shake continues
(browser-verified on the fighting template); (b) feel bus channels report `executed` only when the channel produced a
presented change (layer energy > 0 on a submitted frame, haptics call made, audio node started); (c) rail with `loop:
"loop"` has no positional discontinuity > 1 % of rail length between last and first frame; (d) M5 scene review pass.

**Phase 4 — Motion models, controls, audio feel.**
Scope: V-1…V-7, P-1…P-6, I-1…I-7, A-1…A-9.
Exit criteria: (a) bicycle vehicle drift, scripted input on flat ground with default tyre (`μ 1.0`): accelerate to 15 u/s,
then full steer + handbrake held 0.5 s, then handbrake released with steer held: `|slipAngle| > 0.2 rad` for ≥ 0.6 s
and `drifting === true` during that window; then with steer reversed to −0.5 (counter-steer) `|slipAngle| < 0.05 rad`
within 1.5 s; the same script with `model: "unicycle"` never exceeds 0.01 rad (proves the test can fail); (b) platformer reaches max speed in 0.08–0.12 s ground, stops in 0.06–0.10 s; (c)
touch kit drives the mini-game template end-to-end on an emulated 390×844 DPR 3 device; no keyboard prompt text visible
when `activeDevice() === "touch"`; (d) engine loop pitch tracks rpm (playbackRate changes on a playing node, verified by
an `OfflineAudioContext` render), positional cue pans L/R by listener orientation; (e) M6 review pass.

**Phase 5 — Templates, skill, deprecations, game migration hand-off.**
Scope: D-1…D-8, X-1…X-7.
Exit criteria: (a) all five game templates use a rig, the feel bus, `app.time`, touch kit; template motion strips pass
vision review with the §21 thresholds (camera ≥ 7, falling-blocks ≥ 6; polish_juice ≥ 6); (b) skill lint rule rejects evidence-only feel in template CI;
(c) `rg "as unknown as Mutable" apps packages/create-aura3d/templates` returns 0 camera-spec hits, the two
direct-write sites (skyline, blockfall) are migrated, and every game route boots with the dev `Object.freeze` camera
spec (X-5) enabled without a `TypeError` in the remote route-health run; (d) PRD 14 receives per-game migration tickets
(one per row of §10.1) with before-captures attached.

## 14. Task checklist

### Loop and interpolation (L)

- [ ] L-1 `packages/engine/src/agent-api/FrameLoop.ts`: add `maxFrameDt` option (default 0.1); clamp `dt` in `tick()`
  (`:179-185`, the `dt` computed at `:181`) and in `step()` (`:124-126`, before `* this.timeScale`). Count clamped
  ticks as `clampedFrames` in `snapshot()`. Unit test in `tests/unit/engine/fixed-step-determinism.test.ts`: a 2.0 s
  rAF gap advances sim by exactly `min(maxFrameDt, maxSubSteps·fixedDt)` and increments `clampedFrames` by 1.
- [ ] L-2 Change `maxSubSteps` default from 5 to 6 in `FrameLoop.ts:62`, `index.ts:7061` (`createAuraGameRuntime`) and
  `index.ts:8204` (`game.loop`); add `overload: "slow-motion" | "catch-up"` (default `"slow-motion"`, semantics §6.7) to
  `FrameLoopOptions`; replace the clamp at `FrameLoop.ts:144-146` with the policy switch; count `overloadFrames` in
  `snapshot()`; add the substep-cap guard (§6.7). Unit tests for both policies at `fixedDt 1/120`, 100 ms ticks.
- [ ] L-3 `FrameLoop.ts`: add `onTick(callback(frame: { realDt, substeps, alpha, simTime }))` emitted **once** after the
  substep loop, including ticks with 0 substeps.
- [ ] L-4 `GameAppRuntime.ts:151-153`: replace per-substep `app.step(frame.dt)` with per-substep `app.advance(frame.dt)`
  and one `app.present({ alpha, realDt })` from `onTick`. Test: `tests/unit/engine/render-interpolation.test.ts` counts
  renderer `render` calls with a mock controller: 1 per tick for substeps ∈ {0,1,2,6}.
- [ ] L-5 `index.ts:11592-11615`: split `app.step` into `advance(dt)` (unchanged) and an internal `present(alpha)` that
  calls `productionController.render` once; `step(dt)` = `advance(dt)` + `present(1)` (public behaviour kept).
- [ ] L-6 `index.ts:11328, 12319, 12382`: clamp `delta` to `[1, maxFrameDt·1000]` ms; single dt variable passed to both
  `runRuntimeFrame` and camera update.
- [ ] L-7 New `packages/engine/src/agent-api/time/Interpolation.ts`: `InterpolationStore` with `capturePrevious()`,
  `captureCurrent()`, `resolve(alpha)`; per handle prev/curr position (lerp), rotation (XYZ Euler → `@aura3d/math`
  `Quaternion` via `Euler`, shortest-path slerp, back to XYZ Euler for the existing render path), scale (lerp). Wire into
  `AuraRuntimeNodeRegistry` handles (`index.ts:10497`); add `handle.interpolate`, `handle.timeScale`,
  `handle.teleport(x, y, z, rotation?)`. Dev warning when a handle moves > 5 u in one fixed step without `teleport`.
  Unit tests: alpha 0/0.5/1 results; yaw 350° → 10° interpolates through 0° (not 180°); teleport produces no
  intermediate positions.
- [ ] L-8 `index.ts:11290-11302`: delete the modulo `runtimeAlpha`; pass FrameLoop alpha through `onRender` and runtime
  frame payloads (`:11508, :11694`).
- [ ] L-9 New `tests/browser/frame-pacing.spec.ts` + `tests/browser/camera-feel-harness.{html,ts}`: harness scene with
  20 moving runtime nodes; Playwright overrides `requestAnimationFrame` with a scripted clock (60/120/144 Hz and fixed
  100/250 ms intervals) and records per presented frame `performance.now()`, `simTime`, presented node positions and
  `renderSubmissionsLastTick`; writes the CSV of §20 item 3; asserts §13 Phase 1 (a)(b)(c). A second, non-gating run
  uses CDP CPU throttle rate 6 to record real-world pacing for the evidence pack. Runs remotely only.
- [ ] L-10 Hand-off ticket to PRD 14 (executed with Phase 1, not deferred): remove the explicit `maxSubSteps: 2` from the
  six game loop configs listed in §5 so they get the new default; capture before/after sim-speed at the measured fps.

### Time (T)

- [ ] T-1 New `time/TimeController.ts` implementing `AuraTimeController` (§7.1); `scale` setter clamps to [0, 4].
- [ ] T-2 `FrameLoop.ts`: replace readonly `timeScale` (`:46, :63`) with a getter reading the TimeController (keep
  constructor option as initial value); `step()` reads it per call.
- [ ] T-3 `hitStop(seconds, { scope: "global" })`: sim dt 0; overlapping calls take max remaining. Unit test.
- [ ] T-4 `hitStop(seconds, { scope: actors })`: sets `handle.timeScale = 0` for listed handles; the following multiply
  their dt by the bound handle's `timeScale`: `createGameKinematicBody` update/move (GameRuntime.ts:2074), `createGameArcadeVehicle`
  update (`:2007`), `createCombatWorld` actor step (`:2541`), platformer kit player body (`GameGenreKits.ts:895`), and
  `AnimationController` (PRD 06 owns that edit). Unit test: in a two-actor combat world, a scoped hit-stop freezes both
  listed actors' positions and animation time for the duration while a third, unlisted actor's position keeps changing.
- [ ] T-5 `slowMo(scale, seconds, { easeOut })` + `scaleTo(value, halflife)` using `damp`. Unit test: `scaleTo(0.25, 0.1)`
  reaches 0.625 ± 0.01 after 0.1 s; `slowMo(0.3, 1, { easeOut: 0.2 })` returns to 1 ± 0.01 at t = 1.2 s.
- [ ] T-6 Expose `app.time` on `AuraApp` (index.ts:10680) and on `GameAppRuntime`.
- [ ] T-7 `GameRuntime.ts:3596, 3617` (`resolveAttack`): combat world, on hit event with `hitStop > 0` (seconds), calls
  `app.time.hitStop(hitStop, { scope: [attackerId, defenderId] })` when the world is bound to an app (`combat({ app })` or
  `bind(app)`); option `autoHitStop` default true. Unit test with a fake app.
- [ ] T-8 `GameFeel.ts:136-140`: when `gameFeel.attach(app)` is called, `hitStop(durationMs)` forwards to
  `app.time.hitStop(durationMs / 1000)`; `timeScale()` reads `app.time.scale`; `effectiveDt(dtMs)` keeps its ms contract.
  Update `tests/unit/engine/game-feel.test.ts` with a unit-conversion assertion (70 ms → 0.07 s).

### Camera controller (C)

- [ ] C-1 New `camera/CameraController.ts` with `AuraCameraController` (§7.1); internal state: rig, blend {from pose,
  t, duration, ease}, layers sorted by order, presented pose, previous VP.
- [ ] C-2 New `camera/rigs/fromSpec.ts`: `rigs.fromSpec(spec)` reproducing `resolveCameraTarget`/`resolveCameraEye`
  (index.ts:15616-15689: `applyCameraOffset`, `resolveCameraTarget` `:15629`, `resolveCameraEye` `:15654`) and the smoothing filter (15707-15745) exactly; move the helper functions, do not duplicate.
- [ ] C-3 `index.ts`: construct one controller per app; `scene().camera(spec)` and `setScene` call
  `controller.use(rigs.fromSpec(spec), { blend: 0 })`.
- [ ] C-4 `index.ts:17758-17765` `createViewProjection`: take the presented pose; build view with
  `lookAtMat4(eye, target, rollUpVector(forward, up, roll))`; add `rollUpVector` to `packages/scene/src/MathTypes.ts`
  with unit tests: roll π/2 maps up to ±right; a straight-down camera (`forward = [0,−1,0]`, `up = [0,0,−1]`) yields a
  finite matrix; `roll = 0` output equals today's matrix bit-for-bit.
- [ ] C-5 Replace the 8 `resolveCameraFrame` / `createViewProjection` call sites (index.ts:12354, 13602, 13760, 13809,
  13856, 13857, 16089, 16187) with `controller.presented()` / its cached VP; `u_cameraPosition` = presented eye.
  Verify with `rg -n "resolveCameraFrame\(|createViewProjection\(" packages/engine/src` returning only the controller.
- [ ] C-6 Expose `app.camera` on `AuraApp`; implement `setPose`, `setFov`, `setRoll` (springed when `halflife` given),
  `use` with blend (pose lerp + quat slerp + fov lerp over `blend` seconds with `ease`), `cut()` (reset springs, call
  `resetTemporalHistory("camera-cut")`). Unit tests: `use(rig, { blend: 0.5 })` at t = 0.25 s with `ease: "linear"` is
  the midpoint pose ± 1e-6; `cut()` calls `resetTemporalHistory` exactly once and a blend does not.
- [ ] C-7 `controller.evidence()` returns `AuraCameraEvidence` built from the submitted VP; compute
  `subjectScreenHeightFraction` by projecting the 8 corners of the active rig subject's `handle.bounds()` through the
  presented VP and taking (max NDC y − min NDC y)/2. Unit test: a 1 u tall, 0.01 u deep box centred on the view axis at distance `d = 1/(2·tan(25°)·0.5)` with
  fov 50 reports 0.50 ± 0.01.
- [ ] C-8 New `camera/Spring.ts`: `damp`, `springScalar`, `springVec3`, `springAngle`, `springQuat` per §6.3. Unit tests
  `tests/unit/engine/camera-spring.test.ts`: from rest, remaining gap at t = halflife is 0.500 ± 0.01 for `damp` and
  0.597 ± 0.01 for springs; frame-rate independence (60 vs 144 vs a seeded variable dt stream: positions at t = 1 s
  within 1e-3 of each other); no overshoot from rest for springs; `springAngle` from 350° to 10° moves through 0°.
- [ ] C-9 New `camera/Probe.ts`: `sphereCast` via `@aura3d/physics` `sphereCast` (`packages/physics/src/Raycast.ts:87`
  family) when `app.physics` has a world; else an AABB-list sphere sweep over runtime-handle `bounds()` (C18) and
  static scene node bounds; `occluders()` returns node ids whose AABB intersects the eye→subject segment. Unit tests:
  wall between subject and desired eye → `hit` with distance within 0.01 of analytic; no wall → `hit: false`.
- [ ] C-10 Collision helper used by chase/shoulder/orbit/flight: asymmetric half-lives (pull-in 0.04, push-out 0.35),
  radius 0.2; reuse `createCollisionAwareOrbit` math (GameCameraRigs.ts:190-279).
- [ ] C-11 Occluder fade manager: per-node fade spring to 0.3 for nodes in `probe.occluders()` that are not the subject
  and not tagged `cameraOpaque`; writes per-draw `u_cameraFade` (S-1).
- [ ] C-12 Near-plane auto-adjust for chase/fighting/altitude rigs (`near = clamp(0.02·d, 0.05, 0.5)`), unless the route
  passes `near` explicitly.
- [ ] C-13 `index.ts:7641-7650`: delete the composition-report/verdict-string gate in `createGameRacingCameraRig`; update
  turbo call site (`apps/showcase-turbo-drift-circuit/src/main.ts:2789-2794`) to drop the magic strings.
- [ ] C-14 Golden tests `tests/unit/engine/camera-controller.test.ts`: record 40 (spec, time, subject) tuples from the
  pre-change `resolveCameraFrame` into `tests/fixtures/camera/legacy-frames.json` **before** C-2 lands; assert `fromSpec`
  equality within 1e-6.

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
- [ ] R-9 `camera/rigs/static.ts`: fixed pose from `Partial<AuraCameraPose>` (defaults from the current spec). Test:
  trauma/punch layers still change the presented pose on a static rig.
- [ ] R-10 Framing solver `camera/framing.ts`: `distanceForFraction(h, fovDeg, p) = h / (2·tan(fov/2)·p)` and inverse
  `fractionForDistance`; for portrait aspects solve on the narrower (horizontal) axis using `ctx.aspect`. Unit tests
  round-trip within 1e-9 and a 390×844 case.
- [ ] R-11 `GameSceneGeometryBindings.ts` (`createGameRacingPresentationCamera` `:469-531`, `createGamePlatformerPresentationCamera`
  `:676-733`) and `index.ts:7605-7639`: `game.racingCameraRig` → `rigs.chase`, `game.platformerCameraRig` →
  `rigs.follow2d`, racing top-down → `rigs.topDown`; remove every hard-coded `smoothing` constant listed in §2.1 C10.
  `{ legacySpec: true }` returns today's spec unchanged (snapshot test).
- [ ] R-12 `GameRuntime.ts:2734-2798`: re-implement `createGameCameraDirector` over `rigs.fighting` + controller shake;
  keep `update()` return type; add `bind(app)`.

### Layers (Y)

- [ ] Y-1 `feel/Noise.ts`: seeded 1D gradient noise `perlin1(x, seed)` normalised to [-1, 1] (raw gradient noise ×2,
  clamped); tests: continuity (|Δ| < 0.1 for Δx = 0.01), determinism per seed, and max |value| over x ∈ [0, 100] ≥ 0.9
  (amplitude actually reaches the configured maxima).
- [ ] Y-2 `camera/layers/trauma.ts`: 6-DoF per §6.5 using `createTraumaShake` envelope (GameCameraRigs.ts:306-347) with
  noise from Y-1 and smooth terminal fade; translation scaled by `min(1, subjectDistance/6)`. Tests: §13 Phase 2 (b)
  (presented offset equals layer output; peak |yaw| ≥ 0.35·maxYaw in first 0.25 s, default seed); energy reaches 0
  within `1/decay` s + 0.05 s with no discontinuity > 5 % of `maxYaw` per frame in the terminal band; autocorrelation
  of the yaw channel shows no period between 0.05 s and 1 s (not a sine).
- [ ] Y-3 `camera/layers/punch.ts`: wraps `createPunchIn` (GameCameraRigs.ts:390-415); applies `fovOffset` **and**
  `distanceOffset` along view axis. Test: `trigger({ fov: -4, dolly: 0.35 })` → presented FOV dips by 4° ± 0.1° and eye
  moves 0.35 ± 0.01 u along the view axis at the envelope peak.
- [ ] Y-4 `camera/layers/fovKick.ts`: named channels summed, each springed. Test: channels `boost +6` and `speed +4`
  settle to +10° ± 0.05°; clearing one channel returns to +4° with the channel's half-life.
- [ ] Y-5 `camera/layers/lookAt.ts`: weighted target override with spring weight. Test: weight 1 aims the view axis at
  the override within 0.5° after 3 half-lives; weight 0 leaves the rig pose untouched (1e-6).
- [ ] Y-6 `camera/layers/cinematicBars.ts`: target aspect, ease; emits a viewport rect consumed by the composite (PRD 03 hook;
  until then, a DOM overlay fallback of two black bars). Test: 16:9 canvas, target 2.39:1 → bar height
  `(1 − (16/9)/2.39)/2` of canvas height each, ± 1 px.
- [ ] Y-7 Reduced-motion policy in controller (§6.5 multipliers), sourced from `matchMedia('(prefers-reduced-motion:
  reduce)')` or the app's `accessibility.reducedMotion` source (`createGameReducedMotionSource`, GameRuntime.ts:4218);
  unit test multipliers; browser test with Playwright `emulateMedia({ reducedMotion: "reduce" })` shows presented roll
  = 0 during a trauma impulse.

### Shader (S)

- [ ] S-1 `packages/rendering/src/ShaderLibrary.ts`: add `A3D_CAMERA_FADE` define, `u_cameraFade` + `u_cameraFadeOffset`
  uniforms, Bayer-4 discard (§8.2) to every PBR fragment variant and the unlit fragment variant; WGSL equivalent in the
  WebGPU PBR source and packed uniform struct in `packages/rendering/src/WebGPUDevice.ts` (§8.2); variant key bit
  `cameraFade`. Renderer test: a draw with `u_cameraFade = 0.5` writes 50 % ± 2 % of covered pixels in a 64×64
  readback, `u_cameraFade = 1` writes 100 %, and a draw without the variant bit produces a byte-identical image to
  today (remote browser test, WebGL2 and — where available — WebGPU).
- [ ] S-2 Renderer: per-draw `cameraFade` parameter plumbed from engine draw entries; shadow pass ignores it.
- [ ] S-3 Feel uniforms struct `{ flash, chroma, radialBlur, vignette, center }` published per frame by the controller to
  the PRD 03 composite input; until PRD 03 lands, values are recorded in `diagnostics().camera.screenFeel` and the feel bus
  marks the `screen` channel as **not executed**.

### Sequences and rails (Q)

- [ ] Q-1 `camera/Spline.ts`: centripetal Catmull-Rom (alpha 0.5), closed/open, arc-length LUT (256 samples),
  `pointAt(u)`, `tangentAt(u)`. Tests: passes through control points; C1 continuity at joints (tangent angle Δ < 1°);
  constant-speed parameterisation within 2 %.
- [ ] Q-2 `camera/rigs/rail.ts` per `AuraCameraRailOptions`; look-at track as node, point, or second spline; FOV per point
  interpolated with the same u.
- [ ] Q-3 `camera/Sequence.ts`: `controller.play(sequence)` → shots with blend-in, bars, `skip()`; `onEnd: "return"` blends
  back to the previous rig.
- [ ] Q-4 `CameraChoreographer.ts:234-238`: `"catmull-rom"` uses Q-1 across keyframes (not per-segment smoothstep); update
  `sampleCameraPath`; add test that velocity at interior keyframes is non-zero.
- [ ] Q-5 `index.ts:15670-15686` `path`/`flythrough`/`dolly` modes: implement via `rigs.rail` with 2 points; `loop` default
  `"pingpong"` for `dolly`, `"none"` for path (hold at end — no snap back).

### Feel bus (F)

- [ ] F-1 `feel/FeelBus.ts` implementing `AuraFeelBus` (§7.1); expose `app.feel`.
- [ ] F-2 Channel dispatch: shake → `app.camera.shake.add`; punch → `app.camera.punch.trigger`; hitStop → `app.time`;
  haptics → `@aura3d/input` `Haptics` (gamepad dual-rumble, `navigator.vibrate` on touch, no-op otherwise); audio →
  `GameAudio.play`/`playPositional` with jitter; vfx → PRD 07 layer API (`fx.burst(kind, pos, { count })`); screen → S-3.
- [ ] F-3 Presets `arcade`, `fighting`, `racing`, `platformer`, `puzzle`, `calm` with event maps for `land`, `jump`,
  `hit-light`, `hit-heavy`, `ko`, `collect`, `boost`, `explode`, `score`, `fail`; values documented in a table in the
  source file header and exported as `feelPresets` for tests. Required starting values (tunable only with a §16
  review record):

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
- [ ] F-4 `executed` accounting: a channel counts only if it produced an effect (layer energy > 0 on next presented frame;
  haptics actuator present and called; audio node started; vfx handle returned by the layer). Test with fakes.
- [ ] F-5 `GameFeel.ts`: `gameFeel.create({ app })` routes `damageFlash`/`speedLines`/`landingDust` through `app.feel`;
  remove the `effectsSpawned` counter from evidence when not rendered.
- [ ] F-6 Platformer kit emits `land` (with `strength = impactVelocity/terminal`) and `jump`; racing kit emits `boost`,
  `drift-start`, `collision`; combat emits `hit-light`/`hit-heavy`/`ko` mapped from move strength.
- [ ] F-7 Lint rule (in `aura3d doctor`, `packages/aura3d-cli/src/cli.ts:229`; PRD 13 owns the CLI) `feel/evidence-only`:
  TypeScript AST scan of route/template sources. Flags any value returned by `.update(`/`.follow(`/`.snap(` on an object
  created by `camera.shake`, `camera.punchIn`, `game.cameraRig`, `game.cameraDirector` or `gameFeel.create` when that
  value is only (i) discarded (`void x`), (ii) written into an object passed to `publishEvidence`/`evidence`/HUD text, or
  (iii) never read; does not flag objects passed to `app.camera.use/addLayer` or `app.feel`. Fixture tests: the
  neon-swarm `void cameraState` pattern (`main.ts:1667-1671`), the mini-game `cameraRig.follow` inside evidence
  (`templates/mini-game/src/main.ts:214`) and the fighting-game HUD-only director output (`:322, :361`) are flagged; the
  rewritten D-1/D-3 templates are clean.

### Vehicle (V)

- [ ] V-1 New `vehicle/BicycleModel.ts` per §6.9 with fixed-step integration at the loop's `fixedDt`; pure, deterministic.
- [ ] V-2 `GameRuntime.ts:2007-2045` `createGameArcadeVehicle`: add `model` option; `"bicycle"` delegates to V-1; extend
  state with `lateralVelocity`, `yawRate`, `slipAngle`, `drifting`, `rpm`, `lateralG`.
- [ ] V-3 Torque curve + quadratic drag + rolling resistance; default curve peaks at 0.6·maxSpeed.
- [ ] V-4 Handbrake rear-grip scale 0.45; counter-steer assist (0 = none, 1 = full yaw-rate damping).
- [ ] V-5 `GameGenreKits.ts:1343-1580` `game.racing`: default `model: "bicycle"`; wire `createVehicleChassis`
  (VehicleChassis.ts:297) as default presentation for the player car (pitch/roll/suspension/wheels); emit F-6 events.
- [ ] V-6 Chase rig integration: `bank` reads `lateralG`; FOV `perSpeed` reads `|vLong|`.
- [ ] V-7 Tests `tests/unit/engine/bicycle-vehicle.test.ts`: straight-line top speed within 2 % of `maxSpeed`;
  steady-state cornering yaw rate ≤ `μg/v`; handbrake drift (§13 Phase 4 a); determinism across identical input streams.

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
- [ ] P-6 Tests `tests/unit/engine/platformer-accel.test.ts`: §13 Phase 4 (b) timings; `tests/unit/engine/platformer-motion.test.ts`
  updated for new defaults.

### Input and controls (I)

- [ ] I-1 New `controls/TouchControls.ts` `mountTouchControls(app, input, layout, options)`: DOM overlay sibling of the
  canvas; one element per `GameTouchControlRegion`; pointer capture; stick via `VirtualTouchJoystick`
  (`packages/input/src/VirtualTouchControls.ts`); buttons map to actions; `env(safe-area-inset-*)`; `aria-label` per control;
  min target 48 CSS px.
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
- [ ] I-7 Tests: `tests/unit/engine/touch-control-binding.test.ts` extended; new `tests/unit/engine/touch-controls-mount.test.ts`
  (jsdom: pointer events → axis values); browser test in `camera-feel.spec.ts` with Playwright touch emulation.

### Audio (A)

- [ ] A-1 `GameAudio.ts:345-386` `playCue`: when `spatial` is present, create `PannerNode` (`panningModel` from tier:
  `HRTF` High/Ultra, `equalpower` Low/Medium/mobile; `distanceModel "inverse"`, refDistance 1, rolloff 1) between source
  and bus; set position.
- [ ] A-2 `setOcclusion` (`:415-421`): insert `BiquadFilterNode` lowpass, cutoff `20000·(1-occ)^2 + 400` Hz, smoothed.
- [ ] A-3 `attachListener(app.camera)`: per presented frame set `AudioListener` position/forward/up from the presented pose
  (`positionX.setTargetAtTime`), auto-called by `createGameAudio({ app })`.
- [ ] A-4 `loop(cue)` returning `GameAudioLoopHandle` with live `playbackRate`/`gain` via `setTargetAtTime`.
- [ ] A-5 `engine(cue, { rpmRange, pitchRange })` helper; racing kit and `game.craft` pass `rpm`/throttle.
- [ ] A-6 Master `DynamicsCompressorNode` limiter on the master bus; per-cue `pitchJitter`/`gainJitter`; per-cue voice limit
  (default 4, oldest-steal).
- [ ] A-7 `packages/audio/src/PositionalEmitter.ts:228-232` + `AudioSource.ts:43-51`: turn `AudioSource.playbackRate`
  into a setter that, when a node is playing, calls `node.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.03)`
  (guarded for mock contexts as today). Test in `packages/audio/tests/audio.test.ts`: a playing source's node
  `playbackRate` receives the new target after `PositionalEmitter.update` with a moving emitter.
- [ ] A-8 `GameAudio.ts:485-503`: replace sine default with a dev-mode `console.warn` once per cue + 40 ms filtered noise
  transient (gain 0.02); production builds play nothing for missing assets and record a diagnostics warning.
- [ ] A-9 Tests `tests/unit/engine/game-audio-spatial.test.ts` with a fake AudioContext asserting graph topology
  (source → panner → [lowpass] → bus → limiter → destination); browser `OfflineAudioContext` render tests: L/R energy
  ratio > 3:1 for a source at +x with listener facing −z (and < 1:3 at −x); a 440 Hz looping buffer whose handle calls
  `setRate(2)` at 0.5 s renders a dominant frequency of 880 ± 10 Hz in the 0.7–1.0 s window.

### Templates, skill, docs (D)

- [ ] D-1 `packages/create-aura3d/templates/mini-game/src/main.ts`: replace static `camera.perspective` (`:171-175`) and the
  `game.cameraRig({ kind: "side-view-follow" })` instance (`:76`) with
  `app.camera.use(camera.rigs.follow2d({ target: "hero", framing: { subjectHeightFraction: 0.28 } }))`; remove the
  evidence-only `cameraRig.follow` (`:214`); `gameFeel.attach(app)` so `hitStop` reaches `app.time`; platformer step
  uses `app.time`; `app.feel.preset("platformer")`; mount touch controls.
- [ ] D-2 `racing-starter/src/main.ts:217`: replace the static top-down `camera.perspective` with `rigs.chase` (speed FOV
  `perSpeed 0.4`, look-ahead `{ seconds: 0.35, max: 4 }`, bank `{ gain: 0.5, maxDeg: 6 }`); `model: "bicycle"`; chassis;
  `audio.engine`; `app.feel.preset("racing")`; mount touch controls (steer stick + throttle/brake/handbrake buttons).
- [ ] D-3 `fighting-game/src/main.ts:144, 185, 322, 361`: `rigs.fighting`; delete the HUD-text camera output (`hud-camera`
  `:64, :82, :361`); `combat({ app })` auto hit-stop; feel preset `fighting`; touch layout (stick + 3 buttons).
- [ ] D-4 `character-controller/src/main.ts:57`: replace `camera.orbit` with `rigs.shoulder({ target: "hero", collision:
  true })`; add a left-half floating `VirtualTouchJoystick` for movement and right-half drag → `rigs.orbit.bindPointer`
  style yaw/pitch for look; one wall in the scene so collision is exercised by the template smoke test.
- [ ] D-5 `falling-blocks-starter/src/main.ts:251`: `rigs.static` with the current pose tilted 10° about X, feel preset
  `puzzle` (shake 0.3 on hard drop, punch `fov −2` on line clear, `score` on tetris).
- [ ] D-6 `packages/create-aura3d/skills/aura3d-browser-game/SKILL.md` and `packages/aura3d-cli/skills/aura3d-browser-game/SKILL.md`:
  add "Camera and feel" section: choose rig by genre (table from §6.4), framing fractions, feel presets, `app.time`,
  touch kit, "never write shake/punch/director output to evidence only"; update canonical snippet to set a rig.
- [ ] D-7 `tests/templates` (vitest config `tests/templates/vitest.config.ts`): assert each game template calls
  `app.camera.use` with a non-static rig (except falling-blocks), defines or presets ≥ 3 feel events, calls
  `mountTouchControls`, and passes the F-7 lint.
- [ ] D-8 `tools/camera-cast-codemod/index.mjs` + fixture tests for the five style-(a) cast sites and the
  cinematic-architecture cast (§2.2 G1), plus "reported, not rewritten" fixtures for the two style-(b) sites.

### Removals / deprecations (X)

- [ ] X-1 Deprecation warning for `smoothing` (once per spec) with the computed half-life in the message.
- [ ] X-2 Delete `createGameCameraRig` aggregator after D-* and PRD 14 migrations (GameCameraRigs.ts:525-596 plus its
  option/evidence types above it).
- [ ] X-3 `packages/lean/src/game.ts:79, 140-163`: lean rig/shake delegate to engine controller/trauma layer.
- [ ] X-4 Remove `smoothedCameraFrames` and `resolveCameraFrame` (index.ts:15696-15745) once `fromSpec` owns them.
- [ ] X-5 Dev-mode `Object.freeze` on camera specs: available behind `createAuraApp({ camera: { freezeSpecs: true } })`
  from Phase 5 (used by Phase 5 exit (c)), default-on in dev two releases later; error text points to `app.camera`.
- [ ] X-6 Mark `@aura3d/controls` README "viewer controls; game cameras use `app.camera`" (no code change).
- [ ] X-7 Rewrite the "fired/adopted" gates listed in §2.1 C21 to read `diagnostics().camera` (presented pose/VP and
  layer energy on submitted frames) instead of rig/evidence inputs; delete assertions that only check a shake/rig
  "was selected". Each rewritten gate must fail on the pre-change code for at least one route (record which).

## 15. Test requirements

Policy: browser, GPU, frame-pacing, and audio-render tests run only on remote GitHub Actions; no local browser runs.
Note that the existing `.github/workflows/browser-matrix.yml` job `chromium-browser-and-visual` runs on `ubuntu-latest`
(SwiftShader), and `.github/workflows/test.yml` unit jobs run on `ubuntu-latest` / an OS matrix; only
`.github/workflows/quality-rebuild-capture.yml` (`games`, `threejs-benchmark` jobs) runs on `macos-14` (ANGLE Metal).
Therefore:

- Unit tests: existing `test.yml` `test` job (`pnpm test:unit`, `pnpm test:packages`).
- GPU-dependent browser tests (S-1 readback, camera-feel VP readback, frame pacing): a **new** job `camera-feel` with
  `runs-on: macos-14` added to `browser-matrix.yml`, running
  `pnpm exec playwright test tests/browser/camera-feel.spec.ts tests/browser/frame-pacing.spec.ts`.
- Non-GPU browser tests (audio graph, touch overlay, OfflineAudioContext): may run in the existing ubuntu job.
- Capture/visual runs: `quality-rebuild-capture.yml` (macos-14), extended by PRD 12 for motion strips.

Unit (vitest, `pnpm test:unit`, CI `test.yml`):

- `tests/unit/engine/camera-spring.test.ts` — half-life, frame-rate independence, angle wrap, quat spring.
- `tests/unit/engine/camera-controller.test.ts` — legacy golden frames (C-14), layer order, blend, cut, evidence equals
  submitted VP, reduced-motion multipliers.
- `tests/unit/engine/camera-rigs.test.ts` — R-1…R-10 assertions.
- `tests/unit/engine/camera-spline.test.ts` — Q-1, Q-4.
- `tests/unit/engine/time-controller.test.ts` — T-3…T-5, T-7.
- `tests/unit/engine/render-interpolation.test.ts` — L-4, L-7.
- `tests/unit/engine/fixed-step-determinism.test.ts` (existing, extended) — L-1, L-2, determinism unchanged.
- `tests/unit/engine/game-camera-rigs.test.ts`, `game-feel.test.ts`, `platformer-motion.test.ts`, `vehicle-chassis.test.ts`
  (existing, updated).
- `tests/unit/engine/bicycle-vehicle.test.ts`, `platformer-accel.test.ts`, `feel-bus.test.ts`, `game-audio-spatial.test.ts`,
  `touch-controls-mount.test.ts` (new).
- `packages/audio/tests/audio.test.ts` (`pnpm test:packages`) — A-7.

Browser (Playwright, remote; GPU specs in the new macos-14 `camera-feel` job):

- `tests/browser/frame-pacing.spec.ts` — Phase 1 (a)(b)(c), 60/120/144 Hz and 100/250 ms scripted rAF via `page.clock` +
  `requestAnimationFrame` override (gating); CDP CPU throttle run for evidence only (non-gating).
- `tests/browser/camera-feel.spec.ts` on `camera-feel-harness`: chase framing deviation, shake peak in presented VP read
  back from `diagnostics().camera`, roll in VP, collision over scripted orbit, occluder fade readback (S-1), touch
  emulation driving input, hit-stop freeze, OfflineAudioContext checks (A-9).
- Template smoke (`tests/templates`) under remote browser: each game template boots, presents frames, camera rig active.

Determinism: all rigs, layers, noise, vehicle, and platformer tests run with fixed dt streams and seeds; replay
(`createGameInput` replay export) must produce identical presented poses across two runs (hash of 300 frames of poses).

## 16. Visual acceptance tests

Engineering gates above do not satisfy this section. Acceptance requires human or vision-model review of captured
motion (frame strips at fixed intervals + short video), with the reviewer seeing the frames. The existing 18 still-frame
benchmark scenes (`benchmarks/quality-rebuild/shared/scenes.ts`) are static and cannot judge camera motion; PRD 12 adds
a `motion/` track to the same harness (same input to Aura3D and three@0.185.1, fixed seed, 1280×720 DPR 1, 12-frame strip
at 0.1 s + 3 s WebM).

Motion scenes (three.js reference implements the same rig with hand-written equivalents: `PerspectiveCamera` +
critically damped spring + simplex shake + `CatmullRomCurve3`; the comparison is of motion quality, not the reference's
library):

| Scene | Content | Judged criterion | Threshold |
|---|---|---|---|
| M1 chase-speed | car (scene 18 assets) accelerating 0→25 u/s on a straight then S-bend | subject stays framed (screen height fraction stable), no horizon shrink, look-ahead visible on bends | vision score ≥ 7/10 "camera"; automated: `subjectScreenHeightFraction` 0.20–0.26 in every captured frame (the legacy `smoothing 0.045` rig run through the same scene must fall outside this band, recorded as the control); within 1 point of three reference |
| M2 impact-shake | static subject, trauma impulses 0.3/0.6/1.0 at t = 0.5/2.0/3.5 s | shake visible, organic (not periodic), rotational, decays smoothly, roll present | ≥ 7/10; automated: presented rotational offset peaks occur within 0.1 s after each impulse with peak ratios within 30 % of 0.09 : 0.36 : 1 (trauma²) and roll ≠ 0 in ≥ 1 frame per impulse |
| M3 flight-bank | aircraft turning 60° bank, pitching 20° | camera banks/pitches with craft, horizon readable | ≥ 7/10; automated: the projected horizon line (world y = 0 at far distance) intersects the frame in 12/12 strip frames |
| M4 collision | third-person subject walking past walls/pillars | camera never inside geometry; occluders fade | 0 frames with eye inside geometry (automated) + ≥ 7/10 |
| M5 rail-shot | 6-point closed rail around scene 09 environment | smooth constant-speed motion, no stop–start at keys, no end snap | ≥ 7/10; automated: per-frame speed variation ≤ 5 % (today's smoothstep choreographer, run as control, must exceed it) |
| M6 pacing-120 | 20 moving bodies, 120 Hz rAF, fixedDt 1/60 | no judder | automated even spacing (Phase 1 c) + reviewer "smooth" verdict on 120 fps video |

Game acceptance (captured by `tools/quality-rebuild-capture` with real input, no `?capture=` lenses, extended to save
12-frame strips + 5 s video per game; PRD 12/14 run it). Reference bar: the research 21 vision judge's "competent
modern three.js browser game" standard. Targets for games migrated onto this PRD's systems:

| Game(s) | Criterion | Current (research 21) | Target |
|---|---|---|---|
| aura-clash, mech-hangar | fighting rig; fighters 45–60 % frame height; visible hit-stop + shake on hits | camera 3 / 3.5, polish_juice 3 / 2 | camera ≥ 7, polish_juice ≥ 6 |
| turbo-drift-circuit, courier-rush, pulse-tunnel | chase rig; speed FOV; drift/bank; no black/inside-geometry frames | camera 3.5 / 3 / 2 | camera ≥ 7, polish_juice ≥ 6 |
| patrol-wing | flight rig; ground/horizon in frame | camera 3, polish_juice 3 | camera ≥ 7, polish_juice ≥ 6 |
| aurora-lander | altitude rig; terrain + pad always in frame; lander 8–12 % | camera 2, polish_juice 2 | camera ≥ 7, polish_juice ≥ 6 |
| deep-recovery | chase rig 15–25° pitch, near-plane occluder fade | camera 2.5, polish_juice 3 | camera ≥ 6, polish_juice ≥ 5.5 (fps blocker owned by PRD 11) |
| skyline-runner | follow2d; hero ≥ 0.25 frame height | camera 4, polish_juice 2 | camera ≥ 7, polish_juice ≥ 6 |
| blockfall, vault-breakers, bank-shot, orbital-defense | static/topDown rig with tilt + event shake/punch | camera 2–4, polish_juice 0.5–2 | camera ≥ 6, polish_juice ≥ 6 |
| gallery-shift, gravity-post, rooftop-buckets, siege-golf, neon-swarm | genre rig + shot cameras without `setScene` remount | camera 4–4.5, polish_juice 2–3 | camera ≥ 6.5, polish_juice ≥ 6 |
| All 18 on mobile 390×844 | touch controls present; no keyboard prompts; subject framing per rig | mobile_presentation 1–4 | ≥ 6 (layout owned with PRD 09/14) |

Review procedure: two independent vision-model passes plus one human pass; disagreements > 2 points go to the human.
Vision models receive the 12-frame strips (as images) plus the rubric; the WebM is for the human pass only (vision
models are not assumed to ingest video). The rubric and prompt are versioned at
`benchmarks/quality-rebuild/motion/review-rubric.md` (PRD 12 creates it; it must reuse the research 21 category
definitions verbatim so scores are comparable to the "Current" column), and each review record stores the rubric
version, model id, and seed. "Frames are interchangeable" is an automatic polish_juice fail, decided mechanically: for
each game capture an idle strip and an action strip from the same replay; if the mean SSIM between corresponding
frames is ≥ 0.97 **and** `diagnostics().camera.layers` energy is 0 in every action frame, the game fails polish_juice
regardless of reviewer score. Non-visual
categories (`game_feel`, `controls`, `physics_feel`, `sound_audio`) are rejudged with the research 20 rubric from code +
capture data + audio recordings; targets: game_feel ≥ 6, controls ≥ 6 (incl. touch), physics_feel ≥ 5.5 for vehicle/platformer
games, sound_audio ≥ 5 (sampled assets owned by PRD 05).

## 17. Performance budgets

Tiers follow PRD 11. Budgets are for this PRD's systems only (camera + layers + probe + interpolation + feel bus + audio
graph + touch overlay), measured on the remote capture runner and on PRD 11's mobile reference device class.

| Tier | GPU ms | CPU ms (main thread) | Memory | Bundle (min+gz, engine delta) | Notes |
|---|---|---|---|---|---|
| Low (mobile, integrated) | ≤ 0.10 (dither fade only; screen-feel flash+vignette only) | ≤ 0.35 (1 sphere cast, ≤ 300 interpolated handles) | ≤ 64 KB | typical game ≤ 15 KB, everything ≤ 24 KB (see below); audio delta ≤ 2 KB | equalpower panning, ≤ 8 voices, haptics via `navigator.vibrate` |
| Medium | ≤ 0.15 | ≤ 0.45 (2 casts, ≤ 600 handles) | ≤ 96 KB | same | equalpower, 16 voices |
| High | ≤ 0.20 | ≤ 0.55 (3 casts, ≤ 1000 handles) | ≤ 128 KB | same | HRTF, 24 voices |
| Ultra | ≤ 0.25 | ≤ 0.70 (3 casts + occluder query, ≤ 2000 handles) | ≤ 192 KB | same | HRTF, 32 voices |

Net-frame requirement: on loop paths with `maxSubSteps ≥ 2`, total GPU time per presented frame must **drop** vs baseline
(one submission per tick). The capture run must report `renderSubmissionsLastTick = 1` for all 18 games after PRD 14
migration. Bundle measured with the existing BUNDLE_SIZES check (aura3d-performance skill) on two fixtures:
(1) "typical game" = controller + layers + `rigs.chase` + collision + time + loop/interpolation + feel bus + touch kit
≈ R1 4 + one rig 1 + R3 1.5 + R4 0.8 + R5 1 + R6 1.5 + R12 1.5 + R10 3 = 14.3 KB, budget ≤ 15 KB; (2) "everything" (all rigs, rail/Spline, bicycle,
platformer, touch, feel) ≤ 24 KB, which matches the §7.4 column sum (≈ 23.3 KB excluding audio). Rigs must tree-shake
(the typical fixture must not pull `rail`/`Spline`/`BicycleModel`).

## 18. Browser coverage

- Chromium (macos-14 ANGLE Metal; primary CI), Chromium Linux SwiftShader for unit-adjacent browser tests where GPU is not
  needed (audio graph, touch overlay).
- WebKit (Playwright WebKit on macos-14): `AudioListener.positionX` AudioParam fallback to `setPosition`; `PannerNode`
  HRTF availability; pointer events on touch emulation.
- Firefox (Playwright on macos-14): `vibrationActuator` absent → haptics no-op; `navigator.vibrate` absent on desktop.
- Gamepad API: tested with Playwright-injected `navigator.getGamepads` stub (CI cannot attach hardware); `playEffect`
  feature-detected.
- WebGPU backend: S-1 WGSL path tested where `browser-matrix.yml` has WebGPU enabled; otherwise WebGL2 only.

## 19. Mobile coverage

- Emulated devices (remote): 390×844 DPR 3 (iPhone 14 class), 412×915 DPR 2.625 (Pixel 7 class), landscape variants;
  touch emulation drives every game template and the 18 games' touch layouts.
- Requirements: touch controls auto-shown; targets ≥ 48 CSS px; no keyboard prompt text when `activeDevice() ===
  "touch"`; safe-area insets respected; camera framing fractions recomputed from portrait aspect (rigs use `ctx.aspect`;
  framing solves on the narrower axis); reduced-motion honoured; haptics via `navigator.vibrate` on Android only (iOS
  Safari lacks it — no-op).
- Performance: Low tier budgets above; equalpower panning; ≤ 1 camera sphere cast per frame.
- Real-device spot check (human, before Phase 5 exit): one iOS and one Android device run the racing and fighting
  templates; reviewer records feel notes (input latency, touch ergonomics, shake comfort).

## 20. Screenshots / evidence required

For each phase exit and each migrated game:

1. Motion strips (12 frames @ 0.1 s) and 3–5 s WebM for M1–M6 and for each game's opening/mid/action, desktop
   1920×1080 and mobile 390×844, Aura3D next to the three.js reference for M-scenes. Stored under
   `docs/project/aura3d-quality-rebuild/evidence/motion/<scene-or-game>/`.
2. `diagnostics().camera` (`AuraCameraEvidence`) and `diagnostics().loop` JSON per captured frame, from the presented
   matrix — not from route inputs.
3. Frame-pacing trace CSV (`frame-pacing.spec.ts`) for 60/120/144 Hz and throttled runs.
4. Audio: OfflineAudioContext renders (WAV) for A-9 and 10 s in-game recordings of racing/fighting templates.
5. Vision/human review records (scores + notes) committed next to the strips; a phase cannot close without them.
6. Before/after pairs for every template (D-1…D-5) using identical input replays.

## 21. Completion criteria

- All §14 tasks checked, with tests in §15 green on remote CI.
- `app.camera`, `app.time`, `app.feel` shipped and documented; zero camera-spec casts or direct writes in apps/ and
  templates/ (Phase 5 exit (c): grep + freeze-flag route-health run); zero calls of camera rig/director/shake whose output is not attached (lint F-7 clean).
- Every game loop path submits one frame per tick; dt clamped; interpolation on by default.
- Motion scenes M1–M6 pass §16 thresholds with review records.
- All five game templates pass §16 review (camera ≥ 7 except falling-blocks ≥ 6; polish_juice ≥ 6).
- Hand-off to PRD 14 completed with per-game rig/feel specs; PRD 14 owns the 18-game acceptance numbers in §16.
- No claim in docs, README, or evidence that Aura3D camera/feel is "three.js-quality" or "parity"; release notes state
  the measured review scores.

## 22. Rollback considerations

- Feature flags on `createAuraApp`/`createGameApp`: `camera: { legacy: true }` (pure `fromSpec`, no layers),
  `loop: { interpolation: false }`, `loop: { renderPerSubstep: true }` (temporary escape hatch, removed after two
  releases), `feel: false`, `audio: { spatial: false }`.
- Kit defaults (`model: "bicycle"`, `feel: "responsive"`, new rig defaults) revertible per call (`model: "unicycle"`,
  `feel: false` + `instantVelocity: true`, `legacySpec: true`).
- Golden legacy-frame fixtures (C-14) make the legacy path verifiable after rollback.
- Shader `A3D_CAMERA_FADE` is a variant bit; disabling the fade manager removes all cost.
- Rollback of a game migration is per-route (PRD 14) and does not require engine rollback.

## 23. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Golden mismatch between `fromSpec` and old `resolveCameraFrame` | silent framing changes in 18 games | C-14 fixtures recorded before refactor; 1e-6 tolerance |
| Interpolation exposes game code that teleports handles each frame (405 `game.runtimeNode` uses) → smearing on respawn | visible streaks | `teleport()` API + dev warning when a handle moves > 5 u in one step without teleport |
| One-render-per-tick changes evidence frame counters used by existing gates | false gate failures | gates read `diagnostics().loop`; release note; PRD 12 updates harness |
| Shake/roll causes motion sickness | accessibility regression | reduced-motion multipliers enforced centrally; roll default 2.5° max; settings toggle in `game.session` (PRD 09) |
| Bicycle model feels worse than unicycle to casual players | racing feel regression | `steerAssist` default 0.6; tuned against M1 review; kit-level opt-out |
| HRTF cost on low-end devices | audio thread underruns | tier-based panning model and voice caps |
| Camera collision via AABB fallback is coarse | camera pops near complex meshes | asymmetric springs; BVH from PRD 11 replaces fallback; per-node `cameraBlocker: false` tag |
| Dither fade stipple without TAA | visible pattern | fade only on occluders, short duration; PRD 03 TAA resolves it |
| Low fps (5–15 fps measured) masks feel improvements | reviewers still judge "laggy" | PRD 11 owns fps; this PRD's acceptance on templates/M-scenes at ≥ 50 fps; game targets conditional on PRD 11 |
| Feel bus becomes another evidence-only surface | repeat of current failure | `executed` accounting (F-4) + lint (F-7) + vision review |
| Raising `maxSubSteps` to 6 on a CPU-bound route makes each slow frame slower (spiral of death) | fps drops further under load | substep-cap guard (§6.7) lowers the cap after 30 overloaded ticks; `overloadFrames`/`substepCapReduced` feed the PRD 11 governor; L-10 per-game change is captured before/after |
| Euler ↔ quaternion round-trip in interpolation changes Euler representation (e.g. 180° flips) for code that reads `handle.rotation` back | gameplay code comparing angles misbehaves | interpolation writes only the presented transform used for rendering; `handle.rotation` (sim state) is never overwritten by the interpolated value; unit test asserts this |
| Spring "half-life" misread as exact 50 % point | wrong tuning / failing tests | §6.3 documents 0.597 remaining gap for springs vs 0.5 for `damp`; C-8 tests both |

## 24. Explicitly out of scope

- Particle/VFX rendering and effect visuals (PRD 07); this PRD only dispatches requests.
- Post-processing pass implementation for radial blur/chroma/vignette/flash and TAA (PRD 03).
- Shadows, IBL, materials, tone mapping (PRDs 02–04).
- Character locomotion blending, IK, and animation clips (PRD 06), beyond per-actor time scale and presentation hooks.
- Sampled audio asset sourcing and SFX authoring (PRD 05); this PRD changes the playback graph.
- HUD/menus/loading/pause shell and `app.capture` (PRD 09).
- Fps/performance fixes for the 18 games (PRD 11) and per-game rebuilds (PRD 14).
- Full physical vehicle simulation (suspension-coupled tyre model, gearbox sim) and realistic flight aerodynamics.
- VR/WebXR camera rigs; `@aura3d/controls` viewer controls redesign.
