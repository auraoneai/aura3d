# Aura3D Game Runtime API

Status: public runtime API for Aura3D game and interactive showcase routes.

> New to building a game with Aura3D? Start with the end-to-end walkthrough —
> [docs/guides/build-a-browser-game.md](../guides/build-a-browser-game.md) — which ties this API
> together with assets, the 1.3 animation stack, camera/HUD/audio, evidence, and deploy. This page
> is the per-API reference.

Aura3D game runtime APIs let an app keep one Aura app mounted while mutating typed scene nodes frame by frame. This is the foundation for gameplay systems such as input, kinematic bodies, hitboxes, animation controllers, runtime effects, combat cameras, reduced-motion variants, and launch evidence.

Create one Aura app per route. Do not recreate the app every frame, hand-wire a renderer, import from `three`, or load models by string id. Resolve real models from the **federated asset index** — a hosted catalog of 800,000+ GLB/glTF assets the CLI searches (`assets search`/`resolve`, primary adapter `createAuraIndexAdapter`) — or `assets add` a file you have; either way import typed `assets` from `./aura-assets` and pass them to `model(assets.name)`. See `docs/agents/asset-workflow.md`.

## Import

```ts
import {
  AnimationController,
  createAuraApp,
  createAnimationController,
  game,
  games,
  lights,
  material,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";
```

The examples in this page use the public root package. Prefer the `game` facade for runtime helpers: `game.input(...)`, `game.inputReplay(...)`, `game.touchControls(...)`, `game.jumpAssist(...)`, `game.collider.*`, `game.debug.*`, `game.hud.*`, `game.accessibility.*`, and `game.evidence(...)`. Use `game.fighting(...)` for the ready-made fighting runtime kit. Use `games.fighting.stage(...)` or `games.fighting.stagePreset(...)` for stage source builders.

For current skeletal animation, animation events, and viseme/blendshape sync, read `docs/api/animation-runtime-events.md` after this page. The runtime node and frame-loop APIs here are the base layer; visible skinned GLB playback and morph target evidence are separate release gates.

## Minimal runtime route

```ts
const arena = scene()
  .add(model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter", "local"] })))
  .add(model(assets.opponent).runtime(game.runtimeNode("opponent", { tags: ["fighter", "ai"] })))
  .add(lights.studio());

const app = createAuraApp("#app", { scene: arena });
const player = app.nodes.require("player");

const input = game.input({
  actions: {
    moveLeft: ["KeyA", "ArrowLeft"],
    moveRight: ["KeyD", "ArrowRight"],
    jump: ["Space"],
    light: ["KeyJ"]
  },
  axes: {
    moveX: { negative: "moveLeft", positive: "moveRight", gamepadAxis: 0 }
  }
});

const playerBody = game.kinematicBody({
  id: "player",
  position: [-1.4, 0, 0],
  bounds: { minX: -3.2, maxX: 3.2, minY: 0, maxY: 3, minZ: -0.2, maxZ: 0.2 }
});

app.onFrame(({ dt }) => {
  input.update(dt);
  playerBody.move(input.axis("moveX"));
  if (input.pressed("jump")) playerBody.jump();

  const body = playerBody.update(dt);
  player.setPosition(body.position[0], body.position[1], body.position[2]);
});
```

## Runtime facade

Use `game.createRuntime(...)` when a route wants one object that owns input, bodies, combat, effects, camera direction, and evidence labels.

```ts
const runtime = game.createRuntime({
  id: "aura-clash-round",
  rules: game.rules("arena-fighter", {
    roundSeconds: 90,
    inputBufferMs: 140,
    hitStopSeconds: 0.08
  }),
  reducedMotion: false
});

runtime.input = app.input({
  actions: {
    moveLeft: ["KeyA", "ArrowLeft"],
    moveRight: ["KeyD", "ArrowRight"],
    light: ["KeyJ"],
    special: ["KeyL"]
  },
  axes: {
    moveX: { negative: "moveLeft", positive: "moveRight" }
  }
});

app.onFrame(({ dt }) => {
  runtime.input.update(dt);
  if (runtime.input.combo(["moveRight", "moveRight", "special"], 260)) {
    runtime.events.emit({ type: "special", actorId: "player" });
  }
  runtime.update(dt);
});
```

For smaller examples, call the individual helpers directly: `game.input(...)`, `game.kinematicBody(...)`, `game.combatWorld(...)`, `game.effects(...)`, and `game.cameraDirector(...)`.

## Game facade helper quick start

`game.fighting(...)` creates a small public-API fighting runtime kit that owns controls, input, kinematic bodies, combat, camera direction, and effects. Pair it with `games.fighting.stagePreset(...)` for authored stage source nodes.

```ts
const stage = games.fighting.stagePreset("neon-dojo", {
  palette: { aura: "#32ffd2" }
});

const stageIssues = games.fighting.validateStage(stage);
if (stageIssues.some((issue) => issue.severity === "error")) {
  throw new Error(stageIssues.map((issue) => issue.message).join("\n"));
}

const fighting = game.fighting({
  playerId: "player",
  opponentId: "opponent",
  autoListen: true,
  stage: { width: stage.combatBounds.maxX - stage.combatBounds.minX }
});

const app = createAuraApp("#app", {
  scene: stage.nodes
    .reduce((builder, node) => builder.add(node), scene())
    .add(model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter", "local"] })))
    .add(model(assets.opponent).runtime(game.runtimeNode("opponent", { tags: ["fighter", "ai"] })))
    .add(lights.studio())
});

const player = app.nodes.require("player");
const opponent = app.nodes.require("opponent");

app.onFrame(({ dt }) => {
  const snapshot = fighting.update(dt);

  player.setPosition(
    snapshot.player.position[0],
    snapshot.player.position[1],
    snapshot.player.position[2]
  );
  opponent.setPosition(
    snapshot.opponent.position[0],
    snapshot.opponent.position[1],
    snapshot.opponent.position[2]
  );
});

const evidence = app.evidence({
  input: fighting.input,
  bodies: [fighting.bodies.player, fighting.bodies.opponent],
  combat: fighting.combat,
  effects: fighting.effects,
  camera: fighting.camera,
  stage: {
    id: stage.id,
    safeZones: true,
    bounds: stage.combatBounds,
    warnings: stageIssues.map((issue) => issue.message)
  }
});

console.log(evidence.systems, evidence.stage);
```

## Fighting stage builder

Use `games.fighting.stage(...)` when a playable route needs an authored stage with foreground, combat lane, midground, skyline, parallax, safe zones, combat bounds, and screenshot hints.

```ts
const stage = games.fighting.stage({
  id: "neon-training-grid",
  width: 7.2,
  safeInset: 0.45,
  palette: {
    floor: "#07120f",
    lane: "#23ffc7",
    skyline: "#102f3f",
    fog: "#071f19"
  }
});

const stageIssues = games.fighting.validateStage(stage);
if (stageIssues.some((issue) => issue.severity === "error")) {
  throw new Error(stageIssues.map((issue) => issue.message).join("\\n"));
}

const arena = stage.nodes
  .reduce((builder, node) => builder.add(node), scene())
  .add(model(assets.fighter).runtime(game.runtimeNode("player")))
  .add(model(assets.rival).runtime(game.runtimeNode("rival")));
```

The stage evidence includes layer count, camera-safe bounds, non-blocking geometry status, combat bounds, light-rig count, and screenshot acceptance hints. This is still source evidence; visual approval requires an actual captured screenshot.

Preset stages are available for fast starts:

```ts
const rooftop = games.fighting.stagePreset("rooftop-city");
const dojo = games.fighting.stagePreset("neon-dojo", {
  palette: { aura: "#ffffff" }
});
const industrial = games.fighting.stagePreset("industrial-arena");
const training = games.fighting.stagePreset("training-grid");
```

## Mark mutable runtime nodes

Runtime mutation is opt-in. Add `.runtime({ id })` to the node that gameplay code needs to control.

```ts
const fighter = model(assets.fighter)
  .position(-1.2, 0, 0)
  .runtime(game.runtimeNode("player", { tags: ["fighter", "local"] }));

const arena = scene()
  .background("#020806")
  .add(fighter)
  .add(lights.studio());
```

The immutable scene-builder workflow still works for ordinary product viewers, material labs, and static scenes. Use runtime nodes only when the app needs frame-by-frame gameplay control.

## `createAuraApp` returns `AuraAppHandle`

`createAuraApp(target, options)` returns an `AuraAppHandle`. Keep that handle for the life of the route. It owns the canvas, renderer backend, current scene snapshot, runtime node registry, frame loop, diagnostics, screenshots, and teardown.

```ts
const app = createAuraApp("#app", {
  scene: arena,
  autoStart: true
});
```

Primary handle members:

| Member | Purpose |
| --- | --- |
| `app.nodes` | Registry for nodes marked with `.runtime(game.runtimeNode("id"))`. |
| `app.runtime` | Read-only loop state: `{ paused, frame, time }`. |
| `app.onFrame(callback)` | Register a per-frame callback. Returns an unsubscribe function. |
| `app.offFrame(callback)` | Remove a previously registered frame callback. |
| `app.input(options)` | Create an app-owned `game.input(...)` controller that is disposed by `app.dispose()`. |
| `app.evidence(options?)` | Collect runtime evidence directly from the mounted app handle. |
| `app.pause()` | Pause the browser-driven frame loop without disposing the app. |
| `app.resume()` | Resume the browser-driven frame loop. |
| `app.step(dt?)` | Advance one manual frame. Defaults to the runtime fixed step when `dt` is omitted. |
| `app.dispose()` | Tear down the app, listeners, frame callbacks, and renderer resources. |
| `app.setScene(scene)` | Replace the scene snapshot while keeping the same app handle. Use sparingly for route-level scene swaps, not every frame. |
| `app.diagnostics()` | Return runtime diagnostics for the mounted app. |
| `app.screenshot()` | Return a PNG data URL screenshot from the mounted app. |

`onFrame` receives an `AuraAppFrame`:

```ts
type AuraAppFrame = {
  dt: number;
  time: number;
  frame: number;
  paused: boolean;
  source: "raf" | "manual" | "fixed";
};
```

Use the unsubscribe function when removing a gameplay system:

```ts
const app = createAuraApp("#app", { scene: arena });
const player = app.nodes.require("player");

const movePlayer = ({ dt }) => {
  player.translate(dt * 1.5, 0, 0);
};

const unsubscribe = app.onFrame(movePlayer);

app.offFrame(movePlayer);
```

Use `dispose()` only when the route unmounts or the app is permanently replaced:

```ts
const input = app.input({
  actions: { light: ["KeyJ"] },
  autoListen: true
});

window.addEventListener("beforeunload", () => {
  app.dispose();
});
```

## Deterministic stepping

Tests, replays, and editors can step the runtime manually.

```ts
app.pause();
app.step(1 / 60);
app.step(1 / 60);
app.resume();
```

`app.runtime` reports the current loop state:

```ts
console.log(app.runtime.frame, app.runtime.time, app.runtime.paused);
```

## Runtime node registry

`app.nodes` only contains nodes that were explicitly marked with `.runtime(game.runtimeNode("id"))`.

```ts
const player = app.nodes.require("player");
const opponent = app.nodes.get("opponent");

console.log(app.nodes.has("player"));
console.log(app.nodes.ids());
console.log(app.nodes.all().map((node) => node.id));
```

Registry methods:

| Method | Use |
| --- | --- |
| `get(id)` | Return a runtime node handle, or `undefined` if missing. |
| `require(id)` | Return a runtime node handle, or throw if missing. Prefer this for required gameplay actors. |
| `has(id)` | Check whether a runtime id exists. |
| `ids()` | Return all registered runtime ids. |
| `all()` | Return all runtime node handles. |

## Runtime node handles

`RuntimeNodeHandle` exposes mutable transform, visibility, material, animation, animation pose, morph target, bounds, and effect attachment state for one runtime node. It does not change the typed asset id or reload the model.

```ts
const player = app.nodes.require("player");

player
  .setPosition(-1, 0, 0)
  .setRotation(0, Math.PI / 2, 0)
  .setScale(0.8)
  .setMaterial(material.metallic({ color: "#f8d96a" }))
  .setMorphTarget("Mouth_AA", 0)
  .play("idle", { loop: true, speed: 1 });

player.visible = true;
player.attachEffect({ kind: "dash-trail", color: "#7ef8ff", duration: 0.18 });
```

Handle fields and methods:

- `setPosition(x, y, z)`
- `translate(x, y, z)`
- `setRotation(x, y, z)`
- `setScale(scale)`
- `setVisible(visible)`
- `setMaterial(material)`
- `play(clip, options)`
- `setAnimation(animation)`
- `setAnimationBinding(binding)`
- `setAnimationPose(pose, metadata)`
- `animationPose()`
- `setMorphTarget(name, weight)`
- `setMorphTargets(weights)`
- `morphTargets()`
- `bounds()`
- `attachEffect(effect)`
- `effects()`
- `snapshot()`

Direct mutable fields are also available for current state: `position`, `rotation`, `scale`, and `visible`.

Use `snapshot()` for evidence, UI readouts, and debugging instead of reaching into renderer internals:

```ts
const snapshot = player.snapshot();
console.log(snapshot.id, snapshot.tags, snapshot.position, snapshot.bounds);
```

## Animation controllers

Use `AnimationController` or `createAnimationController(...)` for public named clip control on runtime models that have embedded GLB animation metadata. This is the source-level controller API for gameplay code; routes still use typed assets from `./aura-assets` and do not address clips by invented asset ids.

```ts
import {
  AnimationController,
  createAuraApp,
  game,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter"] })))
    .add(lights.studio())
});

const player = app.nodes.require("player");
const input = app.input({
  actions: { light: ["KeyJ", "GamepadWest"] }
});

const animation = new AnimationController({
  id: "player-animation",
  clipRegistry: assets.fighter,
  requiredClips: ["Idle", "Walk", "LightPunch"],
  requiredBones: ["Hips", "Spine"],
  suppressRootMotion: true,
  layers: [
    { id: "lower-body", role: "locomotion", bodyMask: "lower-body" },
    { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
  ]
});

animation.bindRuntimeNode(player, {
  id: "player-runtime-animation",
  defaultClipId: "Idle"
});

animation.onEvent("hitbox", ({ event }) => {
  console.log("activate hitbox", event.name, event.payload);
});

animation.play("Idle", { loop: "loop" });

app.onFrame(({ dt }) => {
  input.update(dt);
  animation.update(dt);

  if (input.pressed("light")) {
    animation.crossFade("LightPunch", 0.08, {
      attack: true,
      restartFromFrameZero: true,
      layer: "upper-body"
    });
  }
});
```

Controller methods:

| Method | Use |
| --- | --- |
| `registerClip(clip)` | Add a named source clip with tracks, events, sampler, root-motion metadata, or a baked fallback pose. |
| `registerEmbeddedGLBClips(assetOrMetadata)` | Register embedded GLB clip metadata from a typed Aura asset or explicit registry metadata. |
| `registerLayerMetadata(layer)` | Register source metadata for a layer such as `lower-body` locomotion or `upper-body` attack overlays. |
| `bindRuntimeNode(node, options?)` | Bind controller state to a `RuntimeNodeHandle`. On update, the handle receives active clip, loop/speed, local `captureTime`, and `animationBinding` snapshot metadata. |
| `unbindRuntimeNode(idOrNode)` | Remove a runtime-node binding and clear binding metadata from the handle when supported. |
| `play(clip, options?)` | Start or retarget a named clip. Options include `restart`, `loop`, `speed`, `weight`, `layer`, `fadeIn`, `startTime`, `fallbackClipId`, and `suppressRootMotion`. |
| `stop(clip?, options?)` | Stop one clip or all active clips, optionally with `fadeOut`. |
| `pause(clip?)` / `resume(clip?)` | Pause or resume one clip or the full controller without resetting local time. |
| `restart(clip?, options?)` | Restart a clip or the active clip from `startTime` without manually calling `stop` first. |
| `crossFade(clip, duration, options?)` | Fade active clips or a selected `fromClipId` / `fromLayer` into a target clip. `crossfade(...)` is retained as a lowercase alias. |
| `setLayerWeight(layer, weight)` | Adjust effective contribution for all clips on a named layer, useful for upper-body attacks over locomotion. |
| `scrub(clip, time, options?)` | Seek a clip for deterministic tests, editors, thumbnails, and hitbox preview. |
| `capturePose(options?)` | Return the blended pose, active clip states, and animation diagnostics. |
| `on(type, listener)` | Listen for `start`, `end`, `loop`, `event`, `crossFadeStart`, `crossFadeEnd`, `scrub`, `poseCaptured`, `stateChanged`, or `diagnostic`. |
| `onEvent(filter?, listener)` | Listen to sampled clip events. A string filter matches event `name`, `type`, or tag. |
| `diagnostics(options?)` | Report missing skeletons, missing required clips, missing required bones, missing track bones, and empty tracks. |
| `retargetDiagnostics(options?)` | Report source-level retarget metadata gaps, including missing humanoid bone maps, missing mapped bones, undocumented rest pose, undocumented scale, and undocumented constraints. |

Embedded GLB clip registry metadata can come directly from typed Aura assets:

```ts
const animation = createAnimationController({
  clipRegistry: assets.hero,
  requiredClips: ["Idle", "Run", "Attack"],
  requiredBones: ["Hips", "Spine", "Head"],
  retarget: {
    source: "external-humanoid-library",
    restPose: "t-pose",
    scale: "uniform",
    boneMap: {
      Hips: "Hips",
      Spine: "Spine",
      Head: "Head"
    },
    constraints: [
      "explicit-humanoid-bone-map",
      "matching-rest-pose",
      "uniform-scale",
      "root-motion-policy",
      "no-runtime-ik",
      "no-automatic-proportion-warp"
    ],
    externalLibrary: {
      library: "external-humanoid-library",
      sourceAssetName: "licensed library run clip",
      sourceClipId: "Run"
    }
  }
});

const issues = animation.diagnostics({ requireSkeleton: true });
if (issues.some((issue) => issue.severity === "error")) {
  throw new Error(issues.map((issue) => issue.message).join("\\n"));
}
```

Runtime-node binding is source-level. `bindRuntimeNode(player)` does not create a renderer mixer, import `three`, or reload assets. It mirrors controller state onto the `RuntimeNodeHandle` using the public handle methods: active clip, loop flag, speed, local capture time, and `animationBinding` snapshot metadata. The handle snapshot can then show `animationBinding.controllerId`, `activeClipId`, `layer`, `layerRole`, `bodyMask`, `poseBakedFallback`, `retargeted`, and source asset metadata.

External humanoid animation libraries are represented as metadata, not as an automatic compatibility claim. Use `retarget` or `externalHumanoidLibrary` metadata to record library name, source clip, source/target rig assumptions, explicit humanoid bone map, rest pose, uniform scale/unit assumptions, and license/source fields. Aura3D diagnostics intentionally require this metadata because source support does not infer arbitrary rigs.

Retarget diagnostics are constrained and documented:

| Constraint | Diagnostic intent |
| --- | --- |
| `explicit-humanoid-bone-map` | Every retargeted humanoid clip needs explicit source-to-target bone mapping metadata. |
| `matching-rest-pose` | Source and target rest-pose assumptions must be stated, for example T-pose, A-pose, or bind pose. |
| `uniform-scale` | Source metadata may document uniform scale or unit conversion; runtime proportion warping is not implied. |
| `root-motion-policy` | Metadata must state whether gameplay suppresses or preserves root motion. |
| `no-runtime-ik` | Source metadata does not claim runtime IK solving. |
| `no-automatic-proportion-warp` | Source metadata does not claim automatic humanoid proportion correction. |

Layer metadata is explicit. Use `lower-body` for locomotion and `upper-body` for attack or gesture overlays, or register custom `AuraAnimationLayerMetadata`. The built-in inferred metadata treats `upper-body` as an overlay with `restartFromFrameZero: true`; attack clips or `play` / `crossFade` calls with `attack: true` or `restartFromFrameZero: true` restart from local time `0` so a punch does not resume from a previous impact frame.

Clip event source semantics are source-local. `onEvent(...)` receives `source.semantics === "clip-local-time"` with clip id, playback id, layer, previous/local time, loop count, retarget flag, pose-baked fallback flag, and source asset metadata. Events are sampled from source clip local time before runtime-node binding or renderer skinning, so hitbox windows stay deterministic in source evidence.

When an embedded GLB route does not have a live renderer mixer or decoded track sampler, the controller uses a pose-baked fallback path. Fallback poses can come from `pose`, `fallbackPose`, registry-level `poseBakedFallback`, or skeleton bind-pose metadata. The returned pose includes `metadata.poseBakedFallback` so evidence can distinguish source-level fallback from renderer-applied skinning.

Fallback metadata is also surfaced as `metadata.poseBakedFallbackMetadata` and in runtime-node binding snapshots. It can include source, reason, source clip id, source asset id/name, and fallback kind such as `clip-pose`, `clip-fallback-pose`, `registry-pose`, `skeleton-bind-pose`, or `empty-pose`.

Root-motion suppression is metadata-driven. Set `suppressRootMotion: true` on the controller, clip registry, or individual clip to keep gameplay movement authoritative in `game.kinematicBody(...)`. Captured poses then omit `rootMotion` and include `metadata.rootMotionSuppressed`, `metadata.rootMotionPolicy`, and optional root-motion track or bone metadata.

## `game.input`

`game.input(options)` creates a frame-aware input controller for keyboard, pointer, touch, gamepad, deterministic replay, and headless tests.

```ts
const input = game.input({
  actions: {
    moveLeft: ["KeyA", "ArrowLeft", "GamepadDpadLeft"],
    moveRight: ["KeyD", "ArrowRight", "GamepadDpadRight"],
    jump: ["KeyW", "ArrowUp", "GamepadSouth"],
    light: ["KeyJ", "GamepadWest"]
  },
  axes: {
    moveX: {
      negative: "moveLeft",
      positive: "moveRight",
      gamepadAxis: 0,
      deadzone: 0.18,
      deadzoneMode: "scaled",
      smoothing: 18,
      snap: true
    }
  },
  axisDefaults: { deadzone: 0.18, deadzoneMode: "scaled" },
  bufferMs: 120,
  pointer: true,
  touch: true,
  gamepad: true
});
```

Call `input.update(dt)` once per frame before querying edge states:

```ts
app.onFrame(({ dt }) => {
  input.update(dt);

  if (input.pressed("light")) {
    player.play("lightPunch", { restart: true });
  }

  player.translate(input.axis("moveX") * dt * 4, 0, 0);
});
```

Controller methods:

| Method | Use |
| --- | --- |
| `update(dt?)` | Advance input state and return a snapshot. |
| `snapshot()` | Return the latest input snapshot. |
| `pressed(action)` | True for the frame an action becomes held. |
| `held(action)` | True while the action is held. |
| `released(action)` | True for the frame an action is released. |
| `buffered(action, windowMs?)` | True if the action was pressed within the buffer window. |
| `combo(actions, windowMs?)` | True when the ordered action sequence was pressed inside the buffer window. |
| `axis(name, negativeAction?, positiveAction?)` | Resolve a digital, gamepad, or pointer axis to `-1..1`. |
| `press(binding)` / `release(binding)` | Manually drive a binding for tests and replay tools. |
| `setAction(action, held)` | Manually drive an action by action name. |
| `recorded()` | Return recorded press/release events. |
| `replay(events, dt?)` | Replay recorded input events into the controller and optionally advance by `dt`. |
| `clearReplay()` | Clear recorded events. |
| `dispose()` | Remove DOM listeners and clear controller state. |

Axis bindings support:

| Field | Use |
| --- | --- |
| `deadzone` | Ignore small analog values. Defaults to `0.18` for gamepad axes. |
| `deadzoneMode` | `"axial"` returns raw values outside the dead zone; `"scaled"` remaps the usable range to `0..1`. |
| `smoothing` | Optional response rate per second. `0` disables smoothing. Larger values follow input faster. |
| `snap` | Skip smoothing when the axis changes sign, useful for platformer and fighting-game movement. |
| `scale` | Multiply the resolved axis before clamping to `-1..1`. |
| `invert` | Flip the final axis sign. |

`input.snapshot().axes` contains the resolved configured axis values for source-level debug HUDs and replay inspection.

Headless tests and deterministic editors can disable DOM listeners:

```ts
const input = game.input({
  actions: { light: ["KeyJ"] },
  autoListen: false
});

input.press("KeyJ");
input.update(1 / 60);

console.log(input.pressed("light")); // true
console.log(input.held("light")); // true

input.release("KeyJ");
input.update(1 / 60);

console.log(input.released("light")); // true
```

Input replay uses the same controller API:

```ts
const recording = input.recorded();
const replay = game.input({ actions: { light: ["KeyJ"] }, autoListen: false });

replay.replay(recording);
```

For deterministic playback, normalize a recording into a replay plan and step it with a fixed `dt`:

```ts
const replayPlan = game.inputReplay(input.recorded(), {
  fps: 60,
  seed: 1234,
  label: "round-1-smoke"
});

const replayInput = game.input({
  actions: {
    jump: ["Space"],
    light: ["KeyJ"]
  },
  autoListen: false
});

const driver = game.inputReplayDriver(replayInput, replayPlan);

while (!driver.snapshot().complete) {
  const snapshot = driver.step(1 / 60);
  console.log(snapshot.frame, snapshot.activeBindings);
}

console.log(replayPlan.checksum);
```

Use `game.inputReplayEventsAt(replayPlan, frame)` when an editor timeline needs the exact press/release events for one frame without mutating a controller.

## Touch control layout helper

`game.touchControls(...)` returns source-level rectangles for virtual sticks, dpads, and buttons. It does not install DOM elements; render the returned regions through your route UI and map each region's `binding` into `input.press(binding)` and `input.release(binding)`.

```ts
const touchLayout = game.touchControls({
  width: window.innerWidth,
  height: window.innerHeight,
  safeArea: { bottom: 20 },
  stick: { action: "move", kind: "stick", label: "Move" },
  buttons: [
    { action: "jump", label: "Jump", binding: "TouchJump" },
    { action: "light", label: "Light", binding: "TouchLight" },
    { action: "special", label: "Special", binding: "TouchSpecial" }
  ]
});

console.log(touchLayout.controls.map((control) => control.rect));
console.log(touchLayout.bindings.jump); // "TouchJump"
```

For routes using `game.input`, include the touch bindings in normal action definitions:

```ts
const input = game.input({
  actions: {
    jump: ["Space", "TouchJump"],
    light: ["KeyJ", "TouchLight"],
    special: ["KeyL", "TouchSpecial"]
  },
  autoListen: true,
  touch: true
});
```

## `game.kinematicBody`

`game.kinematicBody(options)` creates a lightweight gameplay body for deterministic character movement. It is runtime state, not a renderer node. Sync it to a `RuntimeNodeHandle` after `update(dt)`.

```ts
const player = app.nodes.require("player");
const body = game.kinematicBody({
  id: "player",
  position: [-1.4, 0, 0],
  size: [0.72, 1.7, 0.42],
  gravity: -18,
  groundY: 0,
  friction: 10,
  maxSpeed: 5,
  jumpVelocity: 7.5,
  coyoteMs: 90,
  jumpBufferMs: 120,
  bounds: { minX: -3.2, maxX: 3.2, minY: 0, maxY: 3, minZ: -0.2, maxZ: 0.2 }
});

app.onFrame(({ dt }) => {
  body.move(input.axis("moveX"));
  if (input.pressed("jump")) body.requestJump();
  body.consumeJump();
  if (input.pressed("dash")) body.dash([body.facing, 0, 0]);

  const state = body.update(dt);
  player.setPosition(state.position[0], state.position[1], state.position[2]);
});
```

Body methods:

| Method | Use |
| --- | --- |
| `move(axis, speed?)` | Apply horizontal movement from an axis value. |
| `jump(velocity?)` | Jump if grounded and return whether the jump started. |
| `requestJump()` | Store a jump request for the configured `jumpBufferMs` window. |
| `canJump()` | True when the body is grounded or inside the configured `coyoteMs` window. |
| `consumeJump(velocity?)` | Start a buffered jump when both the buffer and coyote/grounded windows are valid. |
| `dash(direction, speed?)` | Apply a directional dash velocity. |
| `applyKnockback(velocity)` | Add combat knockback and mark the body airborne. |
| `update(dt)` | Advance gravity, friction, bounds, ground snapping, and facing state. |
| `snapToGround(groundY?)` | Force the body to a grounded position. |
| `bounds()` | Return the body AABB. |
| `snapshot()` | Return current body state for evidence and debugging. |

Readable body state includes `position`, `velocity`, `size`, `grounded`, and `facing`.

For route-level jump timing without binding it to a body, use `game.jumpAssist(...)`:

```ts
const jumpAssist = game.jumpAssist({
  coyoteMs: 100,
  bufferMs: 120
});

app.onFrame(({ dt }) => {
  jumpAssist.update(dt, {
    grounded: playerBody.grounded,
    jumpPressed: input.pressed("jump")
  });

  if (jumpAssist.consume()) {
    playerBody.jump();
  }
});
```

`jumpAssist.snapshot()` reports `coyoteAvailable`, `jumpBuffered`, `consumed`, and `canJump` for debug overlays.

## Collider helpers and debug geometry

The source runtime includes typed collider factories for gameplay systems that need collider metadata before renderer or physics-adapter integration. These helpers are usable in 2D and 3D by setting `dimension`, using zero-depth boxes, or using `rect` colliders.

```ts
const colliders = [
  game.collider.capsule({
    id: "player-body",
    center: playerBody.position,
    radius: 0.34,
    height: 1.7,
    axis: "y",
    tags: ["player", "hurt"]
  }),
  game.collider.box({
    id: "crate",
    center: [1.2, 0.45, 0],
    size: [0.9, 0.9, 0.9],
    tags: ["solid"]
  }),
  game.collider.sphere({
    id: "pickup-radius",
    center: [0, 0.8, 0],
    radius: 0.55,
    sensor: true
  }),
  game.collider.rect({
    id: "platform-2d",
    center: [0, 0, 0],
    size: [4, 0.25],
    plane: "xy"
  })
];

const debugGeometry = game.debug.colliders(colliders, {
  source: "level-colliders",
  color: "#7dd3fc"
});
```

Collider helpers:

| Helper | Use |
| --- | --- |
| `game.collider.box(options)` | 2D or 3D box collider. `size` accepts `[x, y]` or `[x, y, z]`. |
| `game.collider.sphere(options)` | Spherical collider with `radius`. Use `dimension: 2` for a circular gameplay radius. |
| `game.collider.capsule(options)` | Capsule collider with `radius`, `height`, and axis `"x"`, `"y"`, or `"z"`. |
| `game.collider.rect(options)` | 2D rectangle on the `"xy"`, `"xz"`, or `"yz"` plane. |
| `game.collider.aabb(collider)` | Return the collider's broad-phase AABB. |

Debug geometry helpers:

| Helper | Use |
| --- | --- |
| `game.debug.colliders(colliders, options?)` | Convert colliders into source-level primitive descriptors. |
| `game.debug.hitboxes(hitboxes, options?)` | Convert combat hitbox/hurtbox arrays into debug boxes with actor origin/facing support. |
| `game.debug.combat(snapshot, options?)` | Convert combat actor hurtboxes, guardboxes, and pushboxes into debug geometry. |

The returned debug geometry is source data, not visual approval. A route still needs browser/screenshot validation before claiming visual debug overlays work.

## `game.combatWorld`

`game.combatWorld()` creates a deterministic combat resolver for actors, hurtboxes, guardboxes, pushboxes, active attacks, and hit events. Keep it in sync with runtime node and kinematic body positions.

```ts
const combat = game.combatWorld();

combat.addActor({
  id: "player",
  team: "player",
  position: playerBody.position,
  facing: playerBody.facing,
  health: 100,
  guard: 100,
  hurtboxes: [{ id: "body", offset: [0, 0.85, 0], size: [0.7, 1.7, 0.45] }]
});

combat.addActor({
  id: "opponent",
  team: "enemy",
  position: opponentBody.position,
  facing: opponentBody.facing,
  health: 100,
  guard: 100,
  hurtboxes: [{ id: "body", offset: [0, 0.85, 0], size: [0.7, 1.7, 0.45] }]
});

app.onFrame(({ dt }) => {
  combat.setActor("player", {
    position: playerBody.position,
    facing: playerBody.facing,
    guarding: input.held("guard")
  });

  if (input.pressed("light")) {
    player.play("lightPunch", { restart: true, speed: 1.2 });
    combat.beginAttack("player", {
      id: "light-punch",
      damage: 8,
      hitStop: 0.08,
      hitStun: 14,
      recovery: 10,
      activeFrames: [2, 5],
      durationFrames: 16,
      knockback: [2.5, 0.8, 0],
      hitboxes: [{ id: "fist", offset: [0.55, 1.1, 0], size: [0.55, 0.35, 0.35] }]
    });
  }

  combat.update(dt);

  for (const event of combat.consumeEvents()) {
    if (event.type === "hit") {
      effects.hitSpark(event.position, { ownerId: event.attackerId });
      cameraDirector.impact(0.8, event.hitStop ?? 0.08);
    }
  }
});
```

Combat methods:

| Method | Use |
| --- | --- |
| `addActor(actor)` | Add an actor with team, health, guard, boxes, position, and facing. |
| `setActor(id, patch)` | Patch an actor each frame as bodies move or guarding changes. |
| `removeActor(id)` | Remove an actor. |
| `beginAttack(attackerId, move)` | Start a move with active frames and hitboxes. |
| `update(dt)` | Advance combat frames, resolve active hits, and return a snapshot. |
| `events()` | Read current-frame combat events without clearing them. |
| `consumeEvents()` | Read and clear current-frame combat events. |
| `snapshot()` | Return actors, active attacks, and events for evidence. |
| `clear()` | Reset combat state. |

Combat event types are `"hit"`, `"blocked"`, `"whiff"`, and `"push"`.

## `game.cameraDirector`

`game.cameraDirector(options)` tracks gameplay targets and returns camera framing state. It is intentionally separate from renderer internals so games can apply the result to a runtime camera node, a camera rig node, or route-specific camera integration.

```ts
const reducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

const cameraDirector = game.cameraDirector({
  targetY: 0.95,
  distance: 6.2,
  baseFov: 42,
  minZoom: 0.86,
  maxZoom: 1.24,
  stageBounds: { minX: -3.2, maxX: 3.2 },
  reducedMotion
});

app.onFrame(({ dt }) => {
  const cameraState = cameraDirector.update(dt, [
    { id: "player", position: playerBody.position },
    { id: "opponent", position: opponentBody.position }
  ]);

  cameraRig?.setPosition(cameraState.position[0], cameraState.position[1], cameraState.position[2]);
});
```

Camera director methods:

| Method | Use |
| --- | --- |
| `update(dt, targets)` | Return position, target, FOV, zoom, shake, and reduced-motion state. |
| `impact(intensity?, duration?)` | Request camera shake for hits. No-ops when reduced motion is enabled. |
| `special(target?, duration?)` | Temporarily focus a special move or cinematic target. |
| `snapshot()` | Return the latest camera state for evidence. |

## `game.effects`

`game.effects(options)` creates a pooled runtime effects controller. It tracks effect instances for rendering, attachment, pooling, and evidence.

```ts
const effects = game.effects({ poolSize: 96 });

app.onFrame(({ dt }) => {
  if (input.pressed("dash")) {
    effects.dashTrail(playerBody.position, { ownerId: "player", color: "#7ef8ff", duration: 0.22 });
  }

  effects.update(dt);
});
```

Supported effect kinds:

- `"hit-spark"`
- `"block-spark"`
- `"dash-trail"`
- `"impact-flash"`
- `"aura-burst"`
- `"shockwave"`

Effects methods:

| Method | Use |
| --- | --- |
| `spawn(kind, position, options?)` | Spawn any supported effect kind. |
| `hitSpark(position, options?)` | Spawn a hit spark. |
| `blockSpark(position, options?)` | Spawn a block spark. |
| `dashTrail(position, options?)` | Spawn a dash trail. |
| `impactFlash(position, options?)` | Spawn an impact flash. |
| `auraBurst(position, options?)` | Spawn an aura burst. |
| `shockwave(position, options?)` | Spawn a shockwave. |
| `update(dt)` | Age and retire active effects, then return a snapshot. |
| `snapshot()` | Return active, spawned, pooled, and instance details. |
| `nodes()` | Return scene nodes for active effects when a route renders the pool. |
| `clear()` | Remove active effects. |

Effect options include `color`, `intensity`, `duration`, `radius`, and `ownerId`.

For node-local effect evidence, attach an effect to the runtime node handle:

```ts
player.attachEffect({ kind: "aura-burst", color: "#f8d96a", intensity: 1.4, duration: 0.35 });
```

## HUD source helpers

Aura3D does not own your DOM overlay. The app owns HUD rendering, text updates, layout, CSS, and event handlers. Use `game.hud.*` helpers to create typed source evidence that identifies what each HUD element is bound to.

```ts
const hud = game.hud.bindings([
  game.hud.health({ actorId: "player", label: "Player health" }),
  game.hud.health({ actorId: "opponent", label: "Opponent health" }),
  game.hud.meter({ actorId: "player", label: "Player meter" }),
  game.hud.timer({ valuePath: "round.timeRemaining" }),
  game.hud.combo({ actorId: "player" }),
  game.hud.round({ valuePath: "round.index" }),
  game.hud.debugToggle({ action: "debug", statePath: "debug.visible" })
]);
```

HUD bindings are source descriptors. They do not create HTML by themselves. A route should still render DOM with `ui.html`, `ui.setText`, framework state, or its own markup, then keep the text in sync with input, combat, round, and debug state.

Each binding records:

- `binding`: `"health"`, `"meter"`, `"timer"`, `"combo"`, `"round"`, or `"debug-toggle"`
- `owner: "app"` because app code owns DOM, text updates, CSS, and click/key handlers
- `source`: combat, round, input, runtime, debug, or app state
- `valuePath` and optional `maxPath` for evidence and diagnostics
- `a11yLabel` so HUD evidence can be paired with accessibility labels

Pass the bindings to evidence:

```ts
const evidence = app.evidence({
  input,
  bodies: [playerBody, opponentBody],
  combat,
  effects,
  camera: cameraDirector,
  hud
});
```

If a game route omits health, meter, timer, combo, round, or debug-toggle source bindings, `game.evidence(...)` reports the missing HUD source evidence in `evidence.hud.warnings`.

## Accessibility source helpers

Accessibility is also source-owned by the app. Aura3D exposes helpers so a route can prove that labels, focus, reduced motion, reduced flash, high contrast, and pause controls were designed instead of being added as unsupported claims.

```ts
const reducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

const userSettings = {
  reducedFlash: false,
  highContrast: false
};

const accessibility = [
  game.accessibility.label({
    targetId: "player-health",
    label: "Player health",
    live: true
  }),
  game.accessibility.focus({
    scopeId: "pause-menu",
    targets: ["resume", "restart", "options"]
  }),
  game.accessibility.reducedMotion({ enabled: reducedMotion }),
  game.accessibility.reducedFlash({ enabled: userSettings.reducedFlash }),
  game.accessibility.highContrast({ enabled: userSettings.highContrast }),
  game.accessibility.pauseControls({
    actions: ["pause", "Escape", "GamepadStart"],
    resumeActions: ["pause", "Enter", "GamepadSouth"],
    menuId: "pause-menu"
  })
];

const cameraDirector = game.cameraDirector({ reducedMotion });
const effects = game.effects({
  reducedMotion,
  reducedFlash: userSettings.reducedFlash
});
```

Pause controls should call the app handle, not remount the scene:

```ts
if (input.pressed("pause")) {
  if (app.runtime.paused) app.resume();
  else app.pause();
}
```

Accessibility helper ownership:

- Labels, focus order, high-contrast CSS, and HUD text are app-owned.
- Reduced-motion and reduced-flash preferences are shared source evidence: the app reads/stores the preference, and Aura3D camera/effects helpers consume `reducedMotion` and `reducedFlash` flags.
- Pause controls are shared source evidence: the app maps input and calls Aura3D `app.pause()`, `app.resume()`, or `app.step(dt)`.

## Reduced motion

Respect user motion preferences in game routes. Pass the preference into `game.cameraDirector({ reducedMotion })`, then gate high-motion gameplay effects in app code.

```ts
const reducedMotion = typeof window !== "undefined"
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
  : false;

const cameraDirector = game.cameraDirector({ reducedMotion });

app.onFrame(({ dt }) => {
  cameraDirector.update(dt, targets);

  if (!reducedMotion && input.pressed("special")) {
    cameraDirector.special(playerBody.position, 0.8);
    effects.auraBurst(playerBody.position, { intensity: 1.6, radius: 1.2 });
  }
});
```

Reduced motion rules:

- Keep gameplay input, hit timing, physics, and combat state unchanged.
- Disable or reduce camera shake, rapid zooms, full-screen flashes, and dense particle bursts.
- Prefer shorter, lower-intensity effects when motion is reduced.
- Include the camera director in `game.evidence(...)`; evidence reports `camera.reducedMotion`.

## Evidence

Use game runtime evidence to prove that a showcase is not just a static scene.

```ts
const evidence = game.evidence(app, {
  input,
  bodies: [playerBody, opponentBody],
  combat,
  effects,
  camera: cameraDirector,
  animation: {
    controllers: 1,
    activeClips: [player.snapshot().animation?.clip ?? "idle"],
    eventCount: combat.snapshot().events.length
  },
  assets: {
    typedAssets: Object.keys(assets).length,
    missingAssets: []
  },
  stage: {
    id: "dojo",
    safeZones: true,
    bounds: { minX: -3.2, maxX: 3.2 },
    warnings: []
  },
  hud,
  accessibility
});

console.log(evidence.runtimeNodes.ids);
console.log(evidence.loop.frame);
console.log(evidence.systems);
console.log(evidence.ownership);
```

The evidence report includes:

- `kind: "aura-game-runtime-evidence"`
- `source`: mounted-runtime or scene-source evidence, with Aura3D-owned, app-owned, and shared subsystem lists
- `ownership`: per-subsystem source evidence that identifies whether Aura3D, the app, or both own the subsystem
- `loop`: frame, time, and paused state from `app.runtime`
- `runtimeNodes`: count and ids from `app.nodes`
- `systems`: booleans for mutable nodes, frame loop, input, physics, animation, effects, camera, collision, and stage
- `input`: configured actions, axes, active bindings, and input frame
- `physics`: kinematic body count and grounded body count
- `collision`: combat world presence, actor count, active attacks, and events
- `animation`: controller count, active clips, and event count supplied by the route
- `effects`: active, spawned, and pooled effects
- `camera`: camera director activity, FOV, zoom, shake, and reduced-motion state
- `assets`: typed asset count and missing asset list supplied by the route
- `stage`: stage id, safe-zone status, bounds, and warnings supplied by the route
- `hud`: typed HUD binding coverage and missing health/meter/timer/combo/round/debug-toggle source gaps
- `accessibility`: label, focus, reduced-motion, reduced-flash, high-contrast, and pause-control coverage
- `warnings`: missing runtime nodes, frame loop not advanced, missing typed assets, and stage warnings

Evidence is strongest after the app has advanced at least one frame:

```ts
app.pause();
app.step(1 / 60);
const evidence = game.evidence(app, { input, bodies: [playerBody], combat, effects, camera: cameraDirector });
```

## Source-level debug overlay data

`game.debug.overlay(...)` creates source-level overlay data from input, bodies, combat, effects, camera, colliders, hitboxes, and custom labels. It does not render DOM or 3D geometry by itself; route UI code can render the returned `sections` and `geometry` records.

```ts
const overlay = game.debug.overlay({
  runtime: app.runtime,
  input,
  bodies: [playerBody, opponentBody],
  combat,
  effects,
  camera: cameraDirector,
  colliders,
  labels: {
    route: "arena",
    mode: "debug"
  },
  warnings: []
});

for (const section of overlay.sections) {
  console.log(section.title, section.metrics);
}

for (const debugNode of overlay.geometry) {
  console.log(debugNode.primitive, debugNode.position, debugNode.aabb);
}
```

Overlay data includes:

- `kind: "aura-game-debug-overlay"`
- `frame`, `time`, and `paused`
- `sections`: runtime, input, physics, combat, effects, and camera metrics when supplied
- `geometry`: collider, hitbox, hurtbox, guardbox, and pushbox debug primitive descriptors
- `labels`: route-supplied string, number, or boolean labels
- `warnings`: source-level warnings supplied by the route

Use overlay data for editor panels, debug HUDs, screenshots annotations, and replay review. It is still source evidence; visual overlay quality requires browser/screenshot validation.

`collectAuraSceneEvidence(scene)` also includes a `gameRuntime` section. That section is source-mode evidence collected from scene runtime nodes, animations, typed assets, and game-like interaction hints. It does not replace mounted runtime evidence from `app.evidence(...)`; it exists so diagnostics can catch source gaps before a route runs.

## Package and readiness commands

These commands are the declared public readiness path for game runtime routes. They are not evidence until they have actually been run and their reports are archived with the route.

Scaffold a public-API fighting-game starter:

```bash
npx create-aura3d@latest my-fighter --template fighting-game
cd my-fighter
```

Add typed model assets before writing `model(assets.x)` code:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
npx @aura3d/cli@latest assets add ./assets/opponent.glb --name opponent
```

Check game asset readiness and static deployment output before claiming a route is asset-ready or deploy-ready:

```bash
npx @aura3d/cli@latest assets validate-game
npx @aura3d/cli@latest check-deploy --dist dist
```

Repository release gates for the current Aura3D game runtime track:

```bash
pnpm game-runtime:docs
pnpm game-runtime:template
pnpm game-runtime:package
pnpm game-runtime:release
```

Do not mark a game route launch-ready until the source evidence, asset readiness, package smoke, route-health, browser runtime, screenshots, visual approval, accessibility, and deployment gates have all passed. `app.evidence(...)` and `game.evidence(...)` prove source/runtime coverage; they do not replace browser screenshot or visual-quality evidence.

## Static scenes are not game runtime evidence

Do not claim a game route is launch-ready when the source is only a static scene with models, lights, a camera, labels, or a noninteractive HUD. A game route needs source and runtime evidence for mutable nodes, frame-loop updates, input, gameplay state, and app-owned HUD/accessibility coverage.

Blocking readiness gaps include:

- No `.runtime(game.runtimeNode("id"))` nodes for gameplay actors or mutable HUD/debug labels
- No `app.onFrame(...)` or `app.step(dt)` path that advances gameplay systems
- No `input.update(dt)` and no action/axis plan for player control
- No kinematic body, combat, camera, effects, or equivalent app-owned gameplay state
- No `app.evidence(...)` or `game.evidence(...)` report after at least one frame
- No HUD source bindings for health, meter, timer, combo, round, and debug toggles
- No accessibility source helpers for labels, focus, reduced motion, reduced flash, high contrast, and pause controls

## Do not recreate the app every frame

Do this:

```ts
const app = createAuraApp("#app", { scene: arena });
const player = app.nodes.require("player");

app.onFrame(({ dt }) => {
  player.translate(dt, 0, 0);
});
```

If the systems are app-owned, collect the same report from the handle:

```ts
const evidence = app.evidence({
  input,
  bodies: [playerBody, opponentBody],
  combat,
  effects,
  camera: cameraDirector
});
```

Do not do this:

```ts
// Wrong: this throws away runtime state and reloads assets.
setInterval(() => {
  createAuraApp("#app", { scene: buildSceneFromState() });
}, 16);
```

One route should create one Aura app, then mutate runtime nodes and runtime systems through the app handle.

## Release readiness boundary

The examples on this page are source-complete API examples. They are limited to
public root imports from `@aura3d/engine`, typed asset refs generated by the
Aura3D CLI, and mutable runtime nodes registered with
`.runtime(game.runtimeNode("id"))`.

Source-complete evidence can be collected from a mounted app handle:

```ts
const sourceEvidence = game.evidence(app);

console.log(sourceEvidence);
```

That evidence proves the route source declares runtime nodes, frame-loop wiring,
input, physics, combat, effects, camera direction, typed assets, and stage
metadata. It does not prove rendered movement, browser input behavior, package
installability, deployment, screenshots, accessibility, or visual approval.

Treat these as separate gates:

| Gate | Source-complete signal | Execution-required proof |
| --- | --- | --- |
| API examples | Public `@aura3d/engine` imports, typed `assets.x`, no `three`, no raw GLB URL, no string model id | TypeScript/package smoke from a packed install |
| Runtime movement | `app.onFrame(...)`, `app.nodes.require(...)`, mutable node updates | Browser route evidence showing visible movement over frames |
| Input and replay | `app.input(...)` or `game.input(...)`, `input.update(dt)`, `pressed`/`held`/`axis`/`combo` usage | Browser controls or replay report with command output |
| Physics and combat | `game.kinematicBody(...)`, `game.combatWorld(...)`, hitbox/hurtbox declarations | Browser or deterministic execution evidence showing collision, health change, and event logs |
| Effects and camera | `game.effects(...)`, `game.cameraDirector(...)`, reduced-motion settings | Screenshot/video evidence for hit sparks, trails, camera framing, and reduced-motion behavior |
| Stage and assets | CLI-added typed assets, `games.fighting.stage(...)` or `stagePreset(...)`, `validateStage(...)` | Asset validation output, screenshot-safe stage capture, and deployment asset proof |

Do not mark a game-runtime route release-ready from source declarations alone.
Release readiness remains blocked until the corresponding command output,
browser report, screenshot artifacts, package-smoke proof, deployment proof, and
human or automated visual/accessibility approval are archived.
