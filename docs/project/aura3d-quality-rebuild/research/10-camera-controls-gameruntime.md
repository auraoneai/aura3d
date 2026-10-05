# 10 — Camera, controls, game feel and the shared game runtime

Branch `aura3d-quality-rebuild/audit` at `950b2971`. Scope: `packages/controls`, `packages/input`,
`packages/audio`, `packages/physics`, `packages/physics-rapier`, `packages/engine/src/game`,
`packages/engine/src/agent-api/Game*.ts` (the genre kits, camera rigs, feel, runtime), `packages/lean/src/game.ts`,
`apps/common`, the 17 `apps/showcase-*` games, and the five game templates in `packages/create-aura3d/templates`.

Method: I read the implementations, not the READMEs or evidence JSON. For every capability I traced the path from the
API call to the value that actually reaches `lookAtMat4` / `perspectiveMat4` / the WebAudio graph / the scene node
list. Nothing ran in a browser (policy). The numbers below come from the source constants plus one small `node -e`
calculation of the follow-camera filter response.

---

## 0. Verdict

Game feel does not lose to three.js on API count. Aura3D ships more named game-camera and juice APIs than three.js
r185, which ships none (three has OrbitControls/PointerLock/Fly/etc. and leaves game cameras to the user or to libs like
`camera-controls`). It loses on the **last mile**. In nearly every case the helper computes a correct number, the
number goes into an evidence object, and then one of four things happens:

1. **The number never reaches pixels.** Effect nodes are never handed to the renderer. Camera rig output is
   printed into HUD text. Hit-stop is a field on an event.
2. **It reaches pixels but gets filtered out.** Shake goes through a follow camera whose smoothing is a ~0.27–0.36 s
   low-pass, which leaves 4–9% of the amplitude.
3. **It is written to a field the renderer ignores.** Turbo Drift writes shake into `distance`/`height`/`sideOffset`,
   but follow mode reads only `offset[]`.
4. **There is no public seam to apply it.** `AuraApp` has no camera API. Games mutate the frozen scene spec with
   `as unknown as Mutable…` casts.

The foundations under the juice are also arcade-1990s:

- The shared vehicle is a 2D unicycle with no lateral velocity.
- The platformer body sets horizontal velocity instantly.
- The fixed-step game loop renders once per simulation substep with no interpolation.
- The default sound is a 176 Hz sine "beep".
- Positional audio is bookkeeping only.
- VFX "hit sparks" are single emissive spheres that shrink.

The agent skill for building games says nothing about cameras, feel, audio, or VFX. The canonical templates use
static wide cameras. One template's PRD-driven framing target is a hero at one-eighth of frame height.

Together these explain most of the "Atari / early-Nintendo" read in the motion and framing domain:

- Small subjects in static or laggy wide shots.
- Objects that slide rigidly with no weight.
- Juice that does not show.
- Beeps instead of mixed, spatial sound.

The renderer audit (other files) covers the shading half.

---

## 1. Capability ladder (camera / controls / feel / runtime)

Ladder columns: E = exists, W = technically works, API = public API, Used = used by shipped games/templates, Def = good
defaults, Comp = composes with the rest of the runtime, Q = modern visual/feel quality, Agent = the skill tells agents
to use it, Ex = examples demonstrate it in pixels.

| Capability | E | W | API | Used | Def | Comp | Q | Agent | Ex | Key evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Root follow camera (`camera.follow`) | Y | Y | Y | 6/17 games | N | partial | N | N | partial | `agent-api/index.ts:3249-3264`, `:15707-15745` |
| Velocity look-ahead | N | – | – | – | – | – | – | – | – | look-ahead is a static `targetOffset` only (`GameSceneGeometryBindings.ts:511`, `:713`) |
| Spring-arm / camera collision | Y (`collisionAwareOrbit`) | Y (needs caller probe) | Y | 0 games | ok | N (not wired to the root camera) | – | N | N | `GameCameraRigs.ts:190-279`; no `camera.collisionAwareOrbit` call in any app |
| Shoulder cam | Y | Y | Y | 0 | ok | N | – | N | N | `GameCameraRigs.ts:94-153` |
| Trauma shake | Y ×4 impls | math yes | Y | 4 games (2 effective) | ok | **N**: filtered or dropped | N | N | N | §3.3 |
| Camera roll / banking | N | – | – | – | – | – | – | – | – | `lookAtMat4(eye, target, [0,1,0])` fixed up vector `index.ts:15760` |
| FOV kick / punch-in | Y ×3 impls | FOV part yes | Y | 3 games | ok | FOV only; `distanceOffset` never applied by aggregator | partial | N | partial | `GameCameraRigs.ts:571-576` |
| Fighting camera director | Y | Y | Y | 1 template + skyline | N | N (output unused in template) | N | N | N | `GameRuntime.ts:2734-2798`; template `fighting-game/src/main.ts:322,361` |
| Camera paths / cinematics | Y | 2-point lerp, loops | Y | cinematic apps | N | – | N | N | – | `index.ts:15670-15686` |
| Hit-stop | Y ×3 | state only | Y | 0 games use the engine one | ok values | **N**: nothing consumes `timeScale`/`effectiveDt` in any game | – | N | N | `GameFeel.ts:195-203,240-243`; `GameRuntime.ts:3596,3617` |
| VFX / juice (`game.effects`) | Y | data only | Y | 5 games spawn | – | **N**: `nodes()` never called by any game | Atari (emissive sphere/box/torus) | N | N | `GameRuntime.ts:2800-2879,3879-3916` |
| Tween/easing library | N | – | – | – | – | – | – | – | – | no `tween`/`easing` export in `packages/*/src` |
| Fixed timestep loop | Y | Y | Y (`createGameApp`) | 6 games; 5 more hand-roll accumulators | N (renders per substep, no interpolation) | N | N | N | – | `FrameLoop.ts:138-142`, `GameAppRuntime.ts:151-153`, `index.ts:11592-11615` |
| Render interpolation | Y in `ScenePhysicsBridge`/ECS | Y | internal | 0 | – | N (game loop never passes alpha) | – | N | N | `physics/src/ScenePhysicsBridge.ts:70-78` |
| Input buffering / deadzone / gamepad | Y | Y | Y | all | good (120 ms buffer, 0.18 deadzone) | Y | good | partial | Y | `GameRuntime.ts:1668-1936` |
| Platformer feel (coyote, buffer, variable jump) | Y | Y | Y | kit + skyline | **coyote/buffer good; `fallGravityMultiplier: 1`, instant velocity** | Y | N | N | partial | `GameGenreKits.ts:851-871,1032`, `GameRuntime.ts:2181-2186` |
| `solvePlatformerMotion` (asymmetric gravity, apex hang) | Y | Y | Y | skyline only | good | Y | good | N | 1 game | `PlatformerMotion.ts:243-278` |
| Arcade vehicle | Y | Y | Y | racing kit + template + 3 games | N | Y | **N**: unicycle, no slip | N | – | `GameRuntime.ts:2007-2045` |
| Vehicle chassis (suspension, pitch/roll, wheels) | Y | Y | Y | turbo only | ok | partial | partial | N | 1 game | `VehicleChassis.ts:297-340` |
| Spatial audio | Y (`SpatialAudio`, `PositionalEmitter`) | Y | Y (package) | **0**: `GameAudio.playPositional` never builds a panner | – | N | – | N | N | `game/GameAudio.ts:345-386` |
| Engine-RPM / speed-pitched loops | N in GameAudio | – | – | – | – | – | – | – | – | turbo `main.ts:4411-4417` plays the engine loop once at fixed rate |
| Music / ducking | Y | Y | Y | several | ok | Y | ok | N | Y | `GameAudio.ts:435-446` |
| HUD | DOM helpers | Y | Y | all | generic | Y | generic | partial | Y | `index.ts:3967-4000` |
| Loading / transitions | N engine-level | – | – | ad hoc | – | – | – | N | – | only `app.ready()` |
| `@aura3d/controls`, `@aura3d/input` packages | Y | Y | Y | **0 games/templates import them** | Orbit damping off by default (same as three) | N (parallel stack) | – | N | N | grep for `@aura3d/controls\|@aura3d/input` in apps/templates returns nothing |

---

## 2. What games actually call (measured)

I counted import and member usage across `apps/showcase-*/src` (excluding tests).

- Every game imports only `@aura3d/engine` plus its own files. **No game imports `@aura3d/controls`, `@aura3d/input`,
  `@aura3d/audio`, or `@aura3d/physics` directly.** Those packages reach games only through engine re-exports, or not
  at all.
- `game.runtimeNode` is used 405 times. Games build a static scene and then teleport handles every frame with
  `setPosition`/`setRotation`/`setScale`/`setVisible`. That is the whole animation model for gameplay objects.
- Camera API use: `camera.perspective` 26, `camera.follow` 8, `game.racingCameraRig` 7, `game.platformerCameraRig` 7,
  `game.cameraDirector` 5, `camera.shake` 2, `camera.punchIn` 2, `gameFeel.create` 2.
- Shared juice reaches **2 of 17** games (skyline-runner, turbo-drift-circuit) plus aura-clash. Blockfall, neon-swarm,
  mech-hangar, and patrol-wing each reinvent shake, punch, or hit-stop locally:
  - `apps/showcase-blockfall-reactor/src/camera-feel.ts`
  - `apps/showcase-neon-swarm/src/combat-feel.ts`
  - `apps/showcase-mech-hangar/src/arena/mech-fight.ts`
  - `apps/showcase-patrol-wing/src/drones.ts`
- Timestep:
  - `createGameApp({ loop: { fixedDt } })` is used by bank-shot, blockfall, gallery-shift, rooftop-buckets,
    vault-breakers, and patrol-wing.
  - Hand-rolled accumulators exist in aurora-lander (`main.ts:221,1810-1816`), mech-hangar (`arena/mech-fight.ts:162,414-417`),
    skyline (`character-world.ts:432-476`, `ghost.ts:70-81`), and rooftop (`shot.ts:241`).
  - The rest use raw variable `dt`: courier, deep-recovery, neon-swarm, turbo, pulse-tunnel, gravity-post.
  - Result: three timestep regimes and no render interpolation in any of them.
- Easing: no shared tween or easing module. Only three games contain easing code at all
  (aurora-lander terrain, product configurator, material inspector).

### 2.1 Shared vs reinvented

| Concern | Shared engine piece | Games that reinvent it |
|---|---|---|
| Follow/chase camera | `camera.follow` + `*CameraRig` spec builders | courier (look-back blend), patrol-wing (`Object.assign` re-aim), skyline (`camera-readability.ts`), turbo (`syncChaseCamera`), blockfall (`camera-feel.ts`) |
| Shake | `camera.shake` (GameCameraRigs), `cameraDirector.impact`, lean `gameFeel` | blockfall, neon-swarm, mech-hangar; skyline blends director + root shake by hand (`feel.ts:546-548`) |
| Punch-in | `camera.punchIn` | blockfall (`camera-feel.ts:76-91`, with a frame-rate-dependent `strength *= 0.92 + progress*0.08`) |
| Hit-stop | `gameFeel.hitStop`, combat `event.hitStop` | mech-hangar (own), turbo ghost, patrol-wing drones |
| Fixed step | `FrameLoop` / `createGameApp` | 5 hand-rolled accumulators |
| VFX | `game.effects` (data only) | neon-swarm spark pool (`combat-feel.ts:26,60-124`), plus primitive nodes in each game |
| Audio cue manifests | `createGameAudio` | every game writes its own `*-audio.ts` manifest (20 files); none share mixing, pitch, or spatial |
| HUD | `ui.*`, `game.hud.*` bindings (values only) | every game has its own `hud.ts` / innerHTML |
| Vehicle | `createGameArcadeVehicle`, `VehicleChassis` | courier van, patrol-wing `FlightModel`, gravity-post pod, aurora-lander, deep-recovery sub all hand-rolled |

There are **at least seven independent camera-follow implementations**:

1. Root follow: `index.ts:15707`
2. `GameCameraRigs.createFollowRig`: `:459`
3. `GameCameraRigs.createShoulderCamera`: `:94`
4. lean `createLeanCameraRig`: `packages/lean/src/game.ts:79`
5. `@aura3d/input` `ThirdPersonFollowControls`: `packages/input/src/controls/ThirdPersonFollowControls.ts`
6. `createGameCameraDirector`: `GameRuntime.ts:2734`
7. Per-game code

There are **four shake implementations**:

1. `GameCameraRigs.createTraumaShake`
2. `cameraDirector`'s constant offset
3. lean hash-noise shake
4. Blockfall's wobble

None of them composes with another.

---

## 3. Camera findings (A/B: engine + defaults)

### 3.1 The root follow camera is a single first-order lag on both eye and target

`resolveCameraFrame` (`agent-api/index.ts:15707-15745`) works like this:

```ts
const smoothing = Math.max(0, Math.min(0.98, cameraSpec.smoothing ?? 0));
...
const responsePerSecond = -Math.log(1 - smoothing) * 60;
const amount = 1 - Math.exp(-responsePerSecond * deltaSeconds);
const frame = { time,
  target: mixCameraVector(previous.target, rawTarget, amount),
  eye:    mixCameraVector(previous.eye,    rawEye,    amount) };
```

- The frame-rate independence is correct (good).
- The **target is lagged by the same filter as the eye**. A moving subject therefore drifts away from the screen
  position it was framed at, and the camera visibly "chases" the subject's position instead of keeping it locked.
  Modern chase cams (Unity Cinemachine, Unreal spring arm, `camera-controls` for three) damp the arm/eye but keep the
  look-at on, or near, the subject, often with separate yaw/pitch/position damping.
- It has no velocity-based look-ahead, no dead zone, no separate rotational damping, and no critically-damped spring.
- `offsetMode: "target-yaw"` rotates the offset by `target.rotation[1]` only (`index.ts:15606-15619`). Pitch and roll
  of the subject are ignored. **Patrol Wing (a flight game) cannot have the camera follow the aircraft's pitch or
  bank.** The view always stays level with the horizon.
- The up vector is hard-coded: `lookAtMat4([...eye], [...target], [0, 1, 0])` (`index.ts:15760`). **No camera roll is
  possible anywhere in the root renderer.** `TraumaShake` computes `roll` (`GameCameraRigs.ts:344`), and
  `createGameCameraRig` drops it (`:571-576`).

#### The default smoothing values are low-pass filters that kill juice and create lag

The smoothing constants the engine's own rig builders emit are:

- `GameSceneGeometryBindings.ts:516` racing chase: `smoothing: options.smoothing ?? 0.045`
- `:718` platformer follow: `0.045`
- `index.ts:7619` racing top-down: `0.045`
- `camera.follow` default: `0.18` (`index.ts:3262`)

Their filter response (computed with `node -e`):

| smoothing | k (1/s) | time constant τ | gain on 39.7 rad/s shake term | gain on 71.3 rad/s term | steady-state lag at 20 u/s |
|---|---|---|---|---|---|
| 0.045 (engine racing/platformer rig default) | 2.76 | 0.362 s | **0.069** | 0.039 | 7.2 u |
| 0.06 (patrol-wing) | 3.71 | 0.269 s | 0.093 | 0.052 | 5.4 u |
| 0.12 (courier) | 7.67 | 0.130 s | 0.190 | 0.107 | 2.6 u |
| 0.18 (`camera.follow` default, turbo) | 11.91 | 0.084 s | 0.287 | 0.165 | 1.7 u |

Consequences:

- **Skyline's root shake is about 7% visible.** Skyline applies shake by writing `cameraSpec.offset`
  (`skyline-runner/src/feel.ts:474-480`, `camera-readability.ts:84-88`). That offset becomes `rawEye`, which is then
  filtered with τ = 0.36 s. The trauma noise frequencies 39.7/71.3/127.9 rad/s (`GameCameraRigs.ts:323-326`) are
  attenuated to 4–7% of `maxOffset 0.09` (`feel.ts:156`). That is millimetres. Evidence records `maxShakeOffset` from
  the unfiltered value (`feel.ts:536-551`), so the proof says shake fired while the image barely moves.
- At the racing kit's own `maxSpeed: 11.5` (template) and the 0.045 default, the camera trails by about 11.5 × 0.36 ≈
  4.2 scene units, more than the 3.6-unit chase distance (`GameSceneGeometryBindings.ts:493`). The car shrinks toward
  the horizon at speed. Turbo's own source comment confirms this was observed: "A smoothed midpoint rig can still trail
  several car lengths behind that state under load, producing a machine-green frame with both racers tiny at the
  horizon" (`turbo-drift-circuit/src/main.ts:2826-2830`). The fix was to disable smoothing **for review capture only**.
  Public gameplay keeps the lag.

**Recommendation:**

- Replace the scalar `smoothing` with a proper rig:
  - Critically-damped spring (`SmoothDamp`) per axis.
  - Separate damping for arm position vs look-at.
  - Velocity look-ahead.
  - Dead zone.
  - Shake/punch applied *after* damping as an additive post-offset, including roll.
- Make the defaults speed-aware.
- Remove `smoothing` from shake paths.

### 3.2 There is no runtime camera API, so games cast the frozen spec

- `AuraApp` (`index.ts:10680-10769`) exposes `setScene`, `nodes`, `onFrame`, and so on. It has **no camera handle**.
- `scene().camera(spec)` stores the spec object by reference (`index.ts:4802-4806`, `:4827`). Each frame reads
  `snapshot.camera` (`:17759`).
- So the only ways to animate the camera are:
  - Move an invisible "camera-target" runtime node and let follow mode chase it (courier
    `courier-camera-target`, patrol-wing `camera-target`, turbo `racing-action-focus`).
  - Cast and mutate the spec: `Object.assign(chaseCamera as unknown as MutableChaseCamera, …)`. This appears in
    courier `main.ts:1394`, patrol-wing `:805,854,1051`, turbo `:2760`, skyline `feel.ts:476-479`, and blockfall
    `camera-feel.ts:83-91`.
- This is undocumented, untyped, and fragile. It produced a real bug (§3.3).

**Recommendation:** add `app.camera` as a live, typed controller:

- `setPose`, `setFov`, and `setRoll`.
- `attach(rig)`, where a rig is any `{ update(dt, ctx) → {position, target, fov, roll} }`.
- Shake/punch layers that the runtime composes after rig damping.

Make the GameCameraRigs objects plug straight in.

### 3.3 Turbo Drift's shake writes to fields follow mode ignores

`syncChaseCamera` (`turbo-drift-circuit/src/main.ts:2712-2781`) runs every frame:

```ts
chaseCameraTuning.distance   += juiceCameraAllowed ? shakeSnap.offset[2] + punchSnap.distanceOffset : 0;
chaseCameraTuning.height     += juiceCameraAllowed ? shakeSnap.offset[1] : 0;
chaseCameraTuning.sideOffset += juiceCameraAllowed ? shakeSnap.offset[0] : 0;
chaseCameraTuning.fov = turboChaseBaseFov() + (juiceCameraAllowed ? punchSnap.fovOffset : 0);
Object.assign(racingCamera as unknown as MutableChaseCamera, chaseCameraTuning);
```

- `racingCamera` comes from `game.racingCameraRig({ mode: "chase", targetNode })`. That resolves to the follow branch
  of `createGameRacingPresentationCamera`, which **bakes** `offset: [sideOffset, height, -distance]` at creation
  (`GameSceneGeometryBindings.ts:506-518`).
- `resolveCameraEye` in follow mode uses `cameraSpec.offset` when it is present and falls back to `distance` only
  when it is absent (`index.ts:15662-15668`). `height` and `sideOffset` are not `AuraCameraSpec` fields at all.
- So every per-frame write to distance, height, and side offset (finish ceremony blend, off-track nudge, trauma shake,
  punch distance kick) has **no effect on the rendered eye**. Only `fov` (read live by `createCameraProjection`,
  `RootRuntimeSupport.ts:22-28`) changes pixels.
- The evidence block (`main.ts:2761-2780`) still reports `cameraDistance`, `cameraHeight`, and `maxShakeOffset` from
  the unapplied values.
- This is the clearest case of evidence passing while pixels stay unchanged.

### 3.4 Camera rig APIs are gated on evidence strings, not on behaviour

`createGameRacingCameraRig` (`index.ts:7641-7650`) throws unless the caller passes a composition-report **path string**
and the literal verdict strings `"pass"`. Turbo satisfies this by hard-coding them (`main.ts:2789-2794`):

```ts
composition: { report: "tests/reports/.../asset-pair-composition.json",
               verdict: "pass", cameraReadabilityVerdict: "pass", selectedMode: "chase" }
```

The gate does not read the file. It only makes agents copy magic strings, adding friction to the one shared racing
camera without improving it. Bucket E/G.

### 3.5 Camera director "shake" is a constant slide, and its output is unused

`createGameCameraDirector` (`GameRuntime.ts:2734-2798`):

- `shake = shakeIntensity * (shakeRemaining / (shakeRemaining + seconds))` is a decaying scalar.
- The position applies `focus[0] + shake * 0.04` and `focus[1] + 0.42 + shake * 0.02`. That is a **unidirectional
  4 cm push that slides back**. There is no oscillation and no noise, so it is not a shake.
- There is no damping. The target snaps to the fighters' midpoint every frame.
- Zoom changes both `baseDistance * zoom` and `fov: baseFov / zoom`, so the zoom is applied twice and fights itself.
- In the **fighting-game template** the director's result is used only as HUD text:
  `ui.setText(hudCamera, \`Camera zoom ${cameraFrame.zoom.toFixed(2)}\`)` (`templates/fighting-game/src/main.ts:361`).
  The scene camera stays static: `camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 })`
  (`:144`).

### 3.6 Camera paths are two-point lerps that loop

`resolveCameraEye` for `path` and `flythrough` (`index.ts:15678-15686`):
`eye = mix3(from, to, eased)` with `phase = (t % seconds) / seconds`.

- There is no spline, no waypoints, no look-at track, and no FOV track.
- At the end of the loop the camera **snaps** from `to` back to `from`.
- `dolly` is a cosine ping-pong between two points (`:15670-15677`).

Three.js users build this with `CatmullRomCurve3` and `getPointAt` in five lines. (`CameraPathEditor.ts` /
`CameraChoreographer.ts` exist in the animation-studio surface, but the root camera spec cannot express them.)

### 3.7 The default camera and the template cameras are static wide shots

| Surface | Camera | Effect |
|---|---|---|
| `AuraSceneBuilder` default | `camera.orbit()`: eye fixed at `[2.48, 2.48, 3.12]` looking at `[0,0.8,0]` (`index.ts:4782`, `:3223-3238`) | The skill's canonical snippet (`aura3d-browser-game/SKILL.md:34-60`) sets no camera. A 14-unit level gets a fixed 4-unit orbit shot, so the player walks off screen. |
| `mini-game` template | static `camera.perspective` at `[6.1, 3.8, 10.4]` (`templates/mini-game/src/main.ts:171-175`) | The whole level is in frame and the hero is tiny. `cameraRig.follow(...)` is called **only inside `publishEvidence`** (`:214`). |
| `racing-starter` template | static top-down `camera.perspective({ position: [2.7, 7.8, 8.6], target: [2.7, 0, 1.55], fov: 43 })` (`:217`) | No chase camera at all. The car is a toy on a board seen from 10 units away. The road is four `primitives.box` strips (`:50-55,220-225`). |
| `fighting-game` template | static (`:144`); director unused (§3.5) | Fighters never get framed tighter on hits. |
| `character-controller` template | `camera.orbit` | No third-person follow. |
| skyline-runner | follow distance chosen so the "hero [is] at roughly one-eighth of frame height" (`skyline-runner/src/main.ts:1629`) | The PRD and gates explicitly target a small hero. |

Small subjects in big empty frames are the single largest framing driver of the "early-console" look. That holds
regardless of shading quality: low-poly hero proportions at 1/8 frame height read as sprites.

---

## 4. Game-feel kit findings (A/D)

### 4.1 `game.effects` and `gameFeel` effects never reach the renderer in any game

- `createGameEffects` (`GameRuntime.ts:2800-2879`) is a pure data pool. Pixels exist only if the route calls
  `effects.nodes()` and puts the result into a scene. `nodes()` maps each effect through `effectToSceneNode`
  (`:3879-3916`).
- **No game calls `.nodes()` on an effects controller or on `gameFeel`.** I grepped all `apps/showcase-*/src` for
  `\.nodes\(\)`. The only hits are `setScene` calls in non-game apps.
  - neon-swarm calls `gameEffects.spawn(...)` 7 times (`main.ts:1148-1627`) and **never even calls
    `gameEffects.update`**.
  - courier calls `update` (`:1402`) but never renders.
  - turbo and skyline route `damageFlash`, `speedLines`, and `landingDust` through `gameFeel` (`turbo main.ts:669-696`,
    `skyline feel.ts:362-491`) and record `effectsActive` / `effectsSpawned` into evidence
    (`turbo main.ts:2770-2771`, `skyline main.ts:3594`).
  - Nothing is drawn.
- `GameFeel.ts:7-9` states that every effect "resolve[s] to real scene nodes through `nodes()` — never DOM, canvas, or
  CSS fakes". The contract is true in isolation and false in every consumer.
- Even when rendered, the look is primitive (`effectToSceneNode`):
  - `hit-spark`, `block-spark`, `impact-flash`, and `ground-dust` are one emissive **sphere** with shrinking scale and
    `opacity: life`.
  - `dash-trail` and `slash-trail` are a single emissive **box**. That box is also what `gameFeel.speedLines` produces.
  - shockwaves are a **torus**.
  - Only `aura-burst` is a particle emitter.
  - There are no sprite flipbooks, soft particles, streak or ribbon trails, screen-space speed lines, chromatic or
    radial-blur kick, or vignette pulse.
  - The `aura3d-game-art` skill produces flipbooks for `effects.flipbook`, but `game.effects` kinds never use them.
- A separate note in patrol-wing (`main.ts:461-466`) says sub-1 `opacity` "rendered as dark shells". If that renderer
  issue is still present, the fading-sphere effects would render as dark blobs. (Renderer audit; flagged here because
  it affects every juice primitive.)

### 4.2 Hit-stop is metadata

- The combat world writes `hitStop: attack.move.hitStop ?? 0.06` into events (`GameRuntime.ts:3596,3617`). The fighting
  kit defines 0.045/0.07/0.1 s (`game-kits/fighting.ts:276-318`). **Nothing in the runtime freezes on it.**
- `gameFeel.hitStop()` sets `hitStopRemainingMs`, which only changes `timeScale()`/`effectiveDt()` (`GameFeel.ts:136-140,
  240-243`). No game calls `effectiveDt`: grep for `effectiveDt|timeScale` in skyline and turbo finds no hits.
- The `mini-game` template calls `gameFeel.hitStop()` (`:120`) on the lean kit, but `platformer.step(...)` runs
  unconditionally (`:106-126`). `frozen` is only published to evidence (`:215`). Lean `addTrauma` is also only published.
  The template camera is static, so the shake never moves anything.
- `createGameApp` does not consult any feel or time-scale source. `FrameLoop.timeScale` is a constructor constant
  (`FrameLoop.ts:63`) with no setter, so hit-stop cannot be expressed at the loop level either.

**Recommendation:**

- Move hit-stop, slow-mo, and time scale into `GameAppRuntime`:
  - `runtime.timeScale` should be settable.
  - `gameFeel` should drive it automatically when attached.
  - Combat events with `hitStop` should freeze the actors involved by default (per-actor hit-stop, the
    fighting-game norm).

### 4.3 Shake quality where it exists

- `createTraumaShake`: a three-sine sum at fixed frequencies with amplitude `trauma²` (`GameCameraRigs.ts:323-347`).
  It is deterministic and acceptable as a base, but the frequencies are periodic (no Perlin/simplex). The terminal band
  `< 0.05` snaps to zero (`:334-336`). The aggregator drops `roll`.
- Lean shake (`packages/lean/src/game.ts:140-163`) uses `sin(tick*12.9898)*43758.5453` hash noise per **call**. It is
  white noise sampled once per frame, so it is frame-rate dependent and jittery, not smooth.
- Blockfall's punch decays with `strength *= 0.92 + progress*0.08` per frame (`camera-feel.ts:79`), which is
  frame-rate dependent.

---

## 5. Runtime loop findings (A/B)

### 5.1 `createGameApp` renders once per fixed substep, with no interpolation

The chain:

- `createGameApp` → `createAuraApp(..., { autoStart: false })` → `createGameAppRuntime` (`index.ts:11818-11827`).
- The runtime's `FrameLoop` emits once per fixed substep (`FrameLoop.ts:138-142`).
- Each emit calls `app.step(frame.dt)` (`GameAppRuntime.ts:151-153`).
- `app.step` calls `app.advance(dt)` and then **`productionController.render(simulatedMs)`** (`index.ts:11592-11615`).

Consequences with the typical `{ fixedDt: 1/60, maxSubSteps: 2 }` (bank-shot `main.ts:391`, blockfall `:668`,
gallery `:1137`, rooftop `:761`, vault `:410`):

- A rAF tick with 0 substeps submits **no frame**. A tick with 2 substeps renders **twice**, and the first render is
  wasted GPU work.
- On a 120 Hz display the game presents at most 60 distinct frames, with uneven gaps from jitter.
- On 144 Hz the cadence pattern is irregular (2–3 vsyncs per sim step), which reads as micro-stutter. That stutter is
  a classic "old game" tell.
- `frame.alpha` is computed (`FrameLoop.ts:140,187-190`) but never forwarded. `app.step(frame.dt)` drops it, and the
  `AuraApp` `runtimeAlpha` is a meaningless `(dt % fixedDt)/fixedDt` (`index.ts:11296`).
  `physics/ScenePhysicsBridge.ts:70-78` implements proper previous/current interpolation, but nothing in the game path
  uses it.

**Recommendation:** use the standard loop:

- Run simulation steps from the accumulator.
- Render **once per rAF**, with `alpha` interpolation of runtime-node transforms (store previous and current per
  handle).
- Expose `alpha` to `onRender`.

### 5.2 Non-`createGameApp` path: variable, unclamped dt

`render()` uses `delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67` with **no upper clamp**
(`index.ts:11326-11334`). After a tab switch or GC pause, `runRuntimeFrame(dt)` and `canvasRuntimePhysics.step(dt)` get
seconds-long steps. The genre kits clamp internally to 0.05 s (`GameRuntime.ts:2021`, `GameGenreKits.ts:1499`). Below
20 fps the game therefore runs in slow motion while the camera's exponential smoothing uses the full dt. Sim and
camera desync, so the camera jumps.

---

## 6. Physics / motion feel (A/B/D)

### 6.1 The shared arcade vehicle is a unicycle

`createGameArcadeVehicle` (`GameRuntime.ts:2007-2045`):

```ts
speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag * seconds);   // constant decel, not v² drag
const heading = state.heading + steer * steerRate * (0.28 + |speed|/maxSpeed) * (1 + drift*0.55) * seconds;
x += cos(heading) * speed * seconds;  z += sin(heading) * speed * seconds; // velocity ≡ heading
```

- The velocity vector always equals the heading, so there is **no lateral slip, no slip angle, no oversteer, and no
  weight transfer**. "Drift" is a scalar that multiplies steering rate by up to 1.55.
- The car rotates like a cursor on a pin. Without `VehicleChassis` it has no pitch, roll, suspension, or wheel spin.
- Acceleration is constant (`16`), with no torque curve or gears.
- It is used by `game.racing` (`GameGenreKits.ts:1343-1580`), the racing template, and courier (`createGameArcadeVehicle`).
- `VehicleChassis` (`VehicleChassis.ts:1-29,297-340`) is a good pure module: four-contact suspension, pitch/roll from
  load, and wheel spin and steer. **Only turbo uses it.** The racing template, courier van, and racing kit
  presentation do not. Its own header describes exactly the defect the others still have: "reads as a sprite sliding on
  a plane, which is what it is".

**Recommendation:**

- Add a bicycle model with lateral velocity and tyre-grip curves to `game.racing`:
  - Drift as actual slip angle.
  - Counter-steer.
  - Speed-dependent steering.
  - Quadratic drag.
- Make `VehicleChassis` the default presentation path inside `game.racing`, so every racing route gets suspension,
  attitude, and wheel visuals.

### 6.2 Platformer kit defaults: good scaffolding, flat feel

Kit defaults (`GameGenreKits.ts:851-871`): `gravity -22`, `jumpVelocity 8.25`, `coyoteMs 110`, `jumpBufferMs 130`,
`jumpReleaseScale 0.45`, **`fallGravityMultiplier: 1`**, `friction: 0` (`:908`). Coyote time, buffering, and variable
jump height are present, which is good.

The weaknesses:

- `body.move(moveX, config.moveSpeed)` sets `velocity.x = axis * speed` **instantly**
  (`GameRuntime.ts:2181-2186`). There is no ground acceleration, deceleration, turn-around skid, or air-control factor.
  The character starts and stops like a 1985 sprite.
- Symmetric gravity (`fallGravityMultiplier 1`) gives a floaty parabola. `solvePlatformerMotion`
  (`PlatformerMotion.ts:243-278`) has good named feels (`snappy` fall ×1.9, `responsive` ×1.6, apex hang) but must be
  opted into. Only skyline does (`level.ts`, `main.ts`). The templates and the skill do not mention it.
- There are no squash/stretch, land, or anticipation hooks feeding the character presentation.
  `gameFeel.landingDust` exists, but its output is never rendered (§4.1).

**Recommendation:**

- Default `game.platformer` to `solvePlatformerMotion("responsive")`.
- Add acceleration, deceleration, and air control to the kinematic body.
- Emit a per-frame presentation state (`squash`, `lean`, `landImpact`) that the kit applies to the runtime node by
  default.

### 6.3 Rapier is used as a contact oracle; "physics proof" is side evidence

- `@aura3d/physics-rapier` reaches games only through `game.collisionWorld({ backend: "rapier" })`. That happens in
  turbo (vehicle-vehicle contact, `main.ts:2350-2375`), aurora-lander (zero-gravity queries, `main.ts:250`), and
  skyline (`character-world.ts:531`).
- `apps/common/src/rapier-physics-proof.ts` (imported by turbo `:32` and blockfall `:87`) builds **a separate Rapier
  world, drops a box for 480 steps at startup, and returns numbers**. It is evidence that Rapier runs, unconnected to
  gameplay, and it costs synchronous startup time. Bucket G.
- `apps/common/src/runtime.ts` (885 lines) is a product-viewer production runtime (ProductionWebGL2Renderer, HDR, PBR)
  used by the viewer/demo apps. **It is not a shared game runtime.** No shared game shell exists (pause menu, title,
  loading, settings, results screen). Each showcase rebuilds these.

### 6.4 `@aura3d/physics` controllers

`ArcadeCharacterController`, `PhysicalCharacterController`, `PhysicalVehicleController`, `FightingCharacterController`,
and `KinematicWorld` exist (`packages/physics/src`, 7.3k lines). No game or template imports `@aura3d/physics`
directly. The engine re-exports a subset under `physics.*` and `game.*`. The physical vehicle controller
(147 lines) is not the path any racing game uses.

---

## 7. Input and controls (preserve; minor B)

- `createGameInput` (`GameRuntime.ts:1668-1936`) is the strongest shared piece:
  - Action maps.
  - Axes with deadzone (0.18 default, axial or scaled).
  - Exponential smoothing with snap-on-reversal (`:1774-1778`).
  - Gamepad polling.
  - A 120 ms press buffer (`buffered()`) and combos.
  - Replay export/import and driver.
  - Touch layouts.

  It is used by every game. Keep it.
- `@aura3d/input` (ActionMap, InputSystem, Gamepad, VirtualTouchControls, its own OrbitControls/FirstPerson/
  ThirdPersonFollow) and `@aura3d/controls` (Orbit/Trackball/Arcball/Fly/Map/Transform/Drag/Picking) are **a parallel
  stack no game or template imports**. `OrbitControls` damping defaults to off with `dampingFactor 0.05`
  (`packages/controls/src/OrbitControls.ts:51-52`, `packages/input/src/controls/OrbitControls.ts:76-77`), the same as
  three.js `OrbitControls.js:219`. That is fine for viewers, but no game camera derives from these.
- Haptics (`packages/input/src/Haptics.ts`) are not wired to any game impact event.

---

## 8. Audio (A/B/D)

### 8.1 `GameAudio.playPositional` is not spatial

`playCue` (`engine/src/game/GameAudio.ts:345-386`) always plays into `bus.node?.input ?? audioContext.destination`.
The `spatial` argument goes **only** to `recordPlayingNode` (`:320-343`). That function writes `attenuationGain` and
`dopplerShift` numbers into evidence. No `PannerNode`, gain, or playbackRate is ever applied, so `playPositional(cue,
pos)` sounds identical to `cue(cue)`. `setOcclusion` likewise mutates evidence records only (`:415-421`).

The real spatial pieces exist in `@aura3d/audio` and are not used:

- `SpatialAudio` (HRTF PannerNode, `packages/audio/src/SpatialAudio.ts:13-36`, matching three.js
  `PositionalAudio.js:58-59`).
- `PositionalEmitter` (attenuation, doppler, lowpass occlusion, `PositionalEmitter.ts:200-266`).

There is also no listener sync to the camera. three.js `AudioListener` follows the camera's world matrix every frame.
Aura's `AudioListener.ts` is 17 lines and `GameAudio.setListenerPosition` is manual.

**Bug in the real emitter:** `PositionalEmitter.update` sets `this.source.playbackRate = lastDoppler`
(`PositionalEmitter.ts:232`). `AudioSource` applies `playbackRate` only when `play()` creates the buffer node
(`AudioSource.ts:47-51`), so doppler never changes a playing loop.

### 8.2 The default cue is an Atari beep

`playDefaultCue` (`GameAudio.ts:485-503`) is a `sine` oscillator at `cue.frequency ?? 176` Hz for 0.12 s at gain
0.025. Any cue without an asset sounds like a 1980s console blip. All 17 showcases supply asset cues (each `*-audio.ts`
references typed assets), which is good. Generated games that skip assets fall back to beeps.

### 8.3 No parameterised loops

- Turbo plays `engine`, `wind`, and `music` once at the green flag (`main.ts:4411-4417`). The engine loop is "gated by
  throttle presence" (`turbo-audio.ts:123`) with **no RPM or speed pitch** and no layering.
- Patrol-wing maps throttle to volume only (`wing-audio.ts:8-9,92`).
- Courier has the same pattern.
- `GameAudio` has no `setCueRate` / `setCueGain` for live loops, so a route cannot pitch an engine even if it wants to.
- Engine pitch tracking speed is the single most important audio cue for vehicle feel. Every racing or flight game
  here lacks it.
- There is no shared compressor or limiter on master, no reverb send per environment, no random pitch/volume variation
  for repeated SFX, and no voice limiting beyond `MAX_PLAYING_NODES` for the evidence list. `GameMixer.ts` and
  `AudioMixer.ts` exist in `@aura3d/audio` but `createGameAudio` does not build on them.

---

## 9. HUD, UI, transitions

- `ui.*` (`index.ts:3967-4000`) is thin DOM sugar (`textContent`, `onclick`, `insertAdjacentHTML`, `scoreCounter`).
  `game.hud.*` bindings resolve values for evidence. They do not draw anything.
- Templates render HUD as `innerHTML` rebuilt every frame in a generic `rgba(3,9,14,.78)` Inter panel
  (`racing-starter/src/main.ts:257-286`, `mini-game/src/main.ts:191-201`). That is developer-overlay styling, not game
  UI. There are no shared animated counters, damage numbers, world-anchored indicators, speedometer, minimap,
  off-screen markers, or transitions.
- Loading and transitions: there is nothing engine-level beyond `app.ready()`. There is no fade, iris, or crossfade
  between `setScene` calls. `setScene` disposes and remounts the renderer (`mountCurrentScene`, `index.ts:11353-11359`),
  so scene changes are hard cuts with a possible blank frame.

---

## 10. Agent-authoring failure (E)

- `aura3d-browser-game/SKILL.md` (121 lines) mentions the camera exactly once: "a camera that keeps the player
  visible" (`:73`). It says **nothing** about follow rigs, shake, hit-stop, effects, audio feel, `solvePlatformerMotion`,
  `VehicleChassis`, or fixed-step loops.
- Its canonical snippet (`:34-60`):
  - Sets no camera, so it gets the static default orbit.
  - Uses `lights.studio()`.
  - Steps with raw `dt`.
  - Sets positions directly.
- The skill's weight is on certification and evidence commands (`:76-99`).
- Templates model "feel present in evidence only":
  - mini-game: rig used only in `publishEvidence`, trauma and hitStop never applied.
  - fighting-game: director to HUD text, effects never rendered, hitStop never applied.
  - racing-starter: no follow camera, primitive road strips, the car `setScale` bumps on drift (`:158`) as the only
    "drift feel".

  Agents copy templates, so they reproduce the gap faithfully.
- The parity and adoption narrative is written into game evidence:
  - `"engine.camera.shake + engine.camera.punchIn + engine.gameFeel over game.racingCameraRig chase follow"`
    (turbo `main.ts:3953`).
  - `rootKit: "engine.camera.shake + engine.camera.punchIn + engine.gameFeel over game.platformerCameraRig follow"`
    (skyline `main.ts:1743`).

  Both strings claim composition that the pixel path does not deliver (§3.1, §3.3, §4.1).

---

## 11. Comparison with three.js r185 practice

| Topic | three.js r185 (+ ecosystem norm) | Aura3D |
|---|---|---|
| Game camera | User-owned `PerspectiveCamera`; per-frame `position.lerp` / `quaternion.slerp` or the `camera-controls` lib (spring-damped, collision via raycast); roll via `camera.up`/quaternion | Spec object read by the renderer; no live API; up fixed `[0,1,0]`; yaw-only follow; one scalar lag on eye and target |
| Shake | User-added noise (simplex) on the camera after controls update; full 6-DoF incl. roll | 3–4 implementations; dropped roll; filtered by follow lag; dead in turbo |
| Loop | `renderer.setAnimationLoop`; one render per rAF; users add a fixed-step accumulator with interpolation | Renders per sim substep; alpha unused |
| Audio | `AudioListener` attached to camera (auto world-matrix sync); `PositionalAudio` = HRTF panner; `setPlaybackRate` live | Game path non-spatial; no listener sync; no live rate |
| VFX | Sprites, `Points`, instanced quads, `three.quarks` / custom particle shaders, postprocessing passes | Emissive primitive per effect, not rendered by any game |
| Tweening | `@tweenjs/tween.js` (three's examples) / GSAP universal | None |
| Vehicles | Cannon-es/Rapier `RaycastVehicle` with friction slip | Unicycle kinematics; chassis visual optional |

three.js offers none of these as engine features. Modern three.js games look and feel modern because the developer
owns a live camera and loop and plugs in mature libraries. Aura3D replaced that ownership with declarative specs plus
evidence. It then did not finish the last mile that would make the declarative path as good as the hand-rolled one.

---

## 12. Recommendations (ordered by pixel/feel impact per effort)

1. **Live camera controller with composited layers** (P0). Add `app.camera` with these stages, applied in order:
   1. Rig (follow / chase / shoulder / orbit / path).
   2. Spring damping (separate arm vs look-at).
   3. Additive shake (pos + roll) and punch (FOV + dolly).
   4. Projection.

   Support full-orientation follow (pitch/roll for flight) and velocity look-ahead. Wire `collisionAwareOrbit` with a
   built-in physics/BVH probe. Delete the `Object.assign`-cast pattern and the evidence-string gate in
   `racingCameraRig`.
2. **Render effects automatically** (P0). `game.effects` and `gameFeel` should register an owned, pooled node group
   in the app (instanced billboards / flipbooks / additive streaks), drawn every frame without route code. Replace the
   sphere/box/torus kinds with sprite/particle/ribbon presets, and add screen-space kicks (radial blur, chromatic,
   vignette flash) as post layers.
3. **Fix the loop** (P0). Render once per rAF, interpolate runtime-node transforms with `alpha`, clamp dt
   (≤ 0.1 s), and make `timeScale` settable so hit-stop and slow-mo are runtime-level and auto-driven by combat
   `hitStop`.
4. **Retune shared defaults** (P1):
   - Follow smoothing should become a spring with ~0.08–0.12 s arm τ and near-zero look-at lag.
   - Platformer defaults to `solvePlatformerMotion("responsive")` with acceleration/deceleration.
   - The racing kit gets a slip-angle model and `VehicleChassis` by default.
5. **Real game audio** (P1):
   - `playPositional` should route through `PositionalEmitter`/`SpatialAudio`.
   - Auto-sync the listener to the camera.
   - Add live `setRate`/`setGain` on looping cues (engine RPM).
   - Add master compressor/limiter, per-cue pitch/volume randomisation, and voice limits.
   - Replace the sine default cue with an error or a decent synthesized default.
   - Fix the `PositionalEmitter` live playbackRate bug.
6. **Shared tween/easing + game shell** (P1). Add `tween(handle, {position, scale, …}, {duration, ease})` on runtime
   nodes, standard Penner/back/elastic easings, and a shared shell (title → loading with progress/fade → play → pause
   → results) with scene crossfades.
7. **Templates and skill** (P0 for agents):
   - Every game template uses a follow rig, shake, rendered effects, a juice event map (land / hit / collect /
     boost), and a vehicle chassis where applicable.
   - The skill adds a "feel checklist" and forbids evidence-only feel (a rig or effect whose output is not consumed by
     the camera or scene).
   - Raise the hero-framing target well above 1/8 frame height.
8. **Consolidate** (P2). Collapse the seven follow and four shake implementations into the one runtime rig. Either fold
   `@aura3d/input`/`@aura3d/controls` game-relevant parts into the runtime or mark them viewer-only. Remove
   `apps/common/src/rapier-physics-proof.ts` from game startup.

---

## 13. Fake-parity inventory (this domain)

- `GameAudio.playPositional` / `setOcclusion`: evidence numbers, no spatial audio graph.
- `gameFeel.damageFlash` / `speedLines` / `landingDust` in turbo and skyline: spawned into a pool nobody renders.
  Evidence reports `effectsSpawned`.
- `game.effects` in neon-swarm (never updated or rendered) and courier (updated, never rendered).
- Turbo `syncChaseCamera` shake, punch distance, finish blend, and off-track nudge: written to `distance`/`height`/
  `sideOffset`, which follow mode ignores. Evidence reports them as applied camera values.
- Skyline root shake: applied, but low-passed to ~7% by the τ = 0.36 s follow filter. Evidence uses unfiltered
  magnitude.
- Fighting template `cameraDirector`: output only to HUD text. `combat` `hitStop`: never applied.
- mini-game template `cameraRig` / `gameFeel` / `governor`: values only in `publishEvidence`.
- `createGameCameraRig` trauma `roll` and punch `distanceOffset`: computed, dropped.
- `createGameRacingCameraRig` "composition verdict" gate: literal strings, file never read.
- `apps/common/src/rapier-physics-proof.ts`: off-path Rapier box drop as runtime evidence.
- Adoption strings in evidence (turbo `main.ts:3953`, skyline `main.ts:1743`) asserting composed juice.

## 14. Preserve

- `createGameInput`: action/axis mapping, deadzone, smoothing, buffering, combos, gamepad, replay, touch layouts.
- `PlatformerMotion.solvePlatformerMotion` and the coyote/jump-buffer/variable-jump scaffolding in the platformer kit.
- `VehicleChassis`: pure suspension/attitude/wheel module. Make it the default.
- `GameCameraRigs` math (trauma envelope, punch envelope, collision-aware orbit with rate-limited pull-in). Keep it as
  rig and layer implementations behind a live camera controller.
- The frame-rate-independent conversion in `resolveCameraFrame` (`-ln(1-s)*60`). Keep the idea, replace the filter.
- `FrameLoop` accumulator and `PhysicsStepper` / `ScenePhysicsBridge` interpolation code (just wire alpha through).
- `@aura3d/audio` `SpatialAudio` and `PositionalEmitter` (after the playbackRate fix), `AudioFileManager`, bus ducking.
- Determinism and replay infrastructure (input replay, seeded shakes). It is valuable for testing once pixels and feel
  are correct.
