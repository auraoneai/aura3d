# Build a Browser Game with Aura3D — End-to-End Guide

This is the one place that ties together every component you need to build a browser game with
Aura3D, in the order you actually use them, from an empty folder to a deployable, evidence-backed
route. Each step links to the deep reference doc for that system, so this guide stays a walkthrough
and a map rather than a duplicate.

The worked example throughout is a 1v1 fighter (the `fighting-game` template and the deployed **Aura
Clash** showcase), but the same systems build platformers, brawlers, arena shooters, and any
runtime-driven 3D route.

---

## 0. The component map

Everything a game needs, the public API for it, and where it's documented in depth:

| You need… | Public API | Reference |
| --- | --- | --- |
| A mounted game app + frame loop | `createGameApp(...)`, `app.onFrame(...)` | `docs/api/game-runtime.md` |
| Real models (not invented URLs) | federated 800K+ index via `@aura3d/cli assets search/resolve` (`createAuraIndexAdapter`) + `assets add`, then `model(assets.x)` | `docs/agents/asset-workflow.md` |
| Mutable runtime nodes | `game.runtimeNode("id")`, `.runtime(...)` | `docs/api/game-runtime.md` |
| Input (keyboard/gamepad/touch) | `app.input`, `app.inputController(...)`, `game.touchControls(...)` | `docs/api/game-runtime.md` |
| Deterministic replay | `game.inputReplay(...)`, `game.inputReplayDriver(...)` | `docs/api/game-runtime.md` |
| 2.5D movement, gravity, jump | `game.kinematicBody(...)`, `game.jumpAssist(...)` | `docs/api/game-runtime.md` |
| Stage + bounds + safe zones | `games.fighting.stagePreset(...)`, `validateStage(...)` | `docs/api/game-runtime.md` |
| Hitboxes, guard, hit-stop, stun | `game.combatWorld(...)`, `game.collider.*` | `docs/api/game-runtime.md` |
| Clip playback + blending | `AnimationController`, `AnimationMixer` | `docs/animation/controllers.md` |
| Locomotion (idle/walk/run) | `createLocomotionKit(...)`, `createLocomotionAnimationStateGraph(...)`, `BlendTree1D` | `docs/animation/runtime-support.md` |
| **Believable motion (1.3)** | inertialized transitions, foot IK + foot-lock, spring bones, event tracks, morph/viseme | `docs/animation/believable-motion.md` |
| Skinned characters | `model(assets.character)`, GLB skinning (WebGL2 + WebGPU 96-joint) | `docs/animation/runtime-support.md`, `docs/rendering/` |
| Camera direction | `game.cameraDirector(...)` | `docs/api/game-runtime.md` |
| Hit sparks, shake, zoom | `game.effects(...)` | `docs/api/game-runtime.md` |
| HUD + accessibility | `game.hud.*`, `game.accessibility.*`, `ui.*` | `docs/api/game-runtime.md` |
| Audio cues | `createGameAudio(...)` | `docs/api/game-runtime.md` |
| Proof the route is real | `game.evidence(app, ...)`, `game.debug.overlay(...)` | `docs/api/game-runtime.md` |
| Route health + deploy | `aura3d route check`, `aura3d check-deploy` | `docs/agents/prompt-to-3d-workflow.md` |

> Rule of thumb that runs through every step: **the agent writes code; you bring the assets.** Models
> come from the typed asset CLI, never from hand-written GLB URLs or string ids.

---

## 1. Scaffold

```bash
npx create-aura3d@latest my-fighter --template fighting-game
cd my-fighter
npm run dev
```

The `fighting-game` template boots a playable route on public APIs only, with runtime-node
placeholders so combat is inspectable before you add art. Source layout:

- `src/main.ts` — mounts the route, owns the frame loop, publishes `window.__AURA3D_GAME_*` evidence.
- `src/game/fighters.ts` — typed fighter resolution, runtime nodes, animation setup.
- `src/game/moves.ts` — combat move declarations + hitbox source.
- `src/game/stage.ts` — stage preset, touch controls, colliders, readiness.
- `src/aura-assets.ts` — the typed asset manifest the CLI generates.

(For a locomotion-first starter instead of combat, use `--template character-controller`.)

---

## 2. Typed assets — generated from the federated index

When a prompt names a real object, resolve it from the **federated asset index** instead of modelling
primitives or inventing a URL. This is a **hosted, federated index of 800,000+ GLB/glTF assets** (a
~850K catalog aggregating the free GLB/glTF universe, with license + provenance preserved). The CLI's
`assets search` / `assets resolve` run **live federated search** against it — primary adapter
**`createAuraIndexAdapter`** (`@aura3d/asset-index`) — so your agent **generates the asset from the
index** and gets a typed, license-aware model:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name playerFighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset playerFighter --no-placeholders --require-license
```

Or add a file you already have:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name playerFighter
```

Either path writes a typed entry into `src/aura-assets.ts`, so code references `model(assets.playerFighter)` —
never `model("fighter")` or a raw URL. See `docs/agents/asset-workflow.md`.

---

## 3. Mount the app + runtime nodes

```ts
import { camera, createGameApp, effects, game, lights, scene, ui } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createGameApp("#app", {
  scene: scene()
    .add(model(assets.playerFighter).runtime(game.runtimeNode("player", { tags: ["fighter", "local"] })))
    .add(model(assets.rivalFighter).runtime(game.runtimeNode("rival", { tags: ["fighter", "ai"] })))
    .add(lights.studio())
});

const player = app.nodes.require("player");
const rival = app.nodes.require("rival");
```

`.runtime(game.runtimeNode("id"))` marks a node **mutable** so you can move/rotate/animate it every
frame. The frame loop is yours:

```ts
app.onFrame(({ dt }) => {
  // step simulation, drive nodes, update HUD — all here
});
```

**Do not recreate the app every frame** — mount once, mutate nodes in `onFrame`.

---

## 4. Input

```ts
app.input.pressed("light");          // edge
app.input.held("guard");             // state
const touch = game.touchControls({ width: innerWidth, height: innerHeight, buttons: [/* ... */] });
```

For deterministic smoke/replay, record and re-drive input:

```ts
const replay = game.inputReplay(app.input.recorded(), { fps: 60, label: "round-1" });
const driver = game.inputReplayDriver(game.input({ /* same actions */, autoListen: false }), replay);
```

---

## 5. Movement & physics

```ts
const body = game.kinematicBody({ position: playerStart, gravity: -12.25, groundY: 0 });
const jump = game.jumpAssist({ coyoteMs: 100, bufferMs: 120 });

app.onFrame(({ dt }) => {
  jump.update(dt, { grounded: body.grounded, jumpPressed: app.input.pressed("jump") });
  if (jump.consume()) body.jump(8.65);
  body.update(dt);
  player.setPosition(body.position[0], body.position[1], body.position[2]);
});
```

Stage bounds + safe zones come from the fighting preset:

```ts
const stage = games.fighting.stagePreset("neon-dojo");
const issues = games.fighting.validateStage(stage); // readiness warnings
```

---

## 6. Combat

```ts
const combat = game.combatWorld({ /* actors, bounds */ });
// each move carries startup/active/recovery frames, damage, knockback, hit-stop, stun:
const snapshot = combat.update(dt);
for (const event of snapshot.events) {
  if (event.type === "hit") { /* apply damage, spark, hit-stop */ }
}
```

The active-frame window (when a hitbox is live) is best driven by **authored animation event
tracks** (see step 7.4) so the hitbox turns on/off from the clip, not a guessed time threshold —
and it stays deterministic for replay.

---

## 7. Animation — the full stack

This is where Aura3D's 1.3 work pays off. Layer these as needed:

### 7.1 Clips + blending
Bind an `AnimationController` (or `AnimationMixer`) to a runtime node and crossfade clips:

```ts
const anim = createFighterAnimationController(/* clip registry */);
anim.crossFade("LightPunch", 0.08, { restart: true });
app.onFrame(({ dt }) => anim.update(dt));
```
See `docs/animation/controllers.md`.

### 7.2 Locomotion (idle ↔ walk ↔ run)
For a moving character, map speed to blended clip weights:

```ts
import { createLocomotionKit } from "@aura3d/animation";
const loco = createLocomotionKit({ idleClip: "Idle", walkClip: "Walk", runClip: "Run" });
const sample = loco.sample(speed, dt); // clipWeights + inertialized stateTransition
```
See `docs/animation/runtime-support.md`.

### 7.3 Believable motion (1.3) — the headline upgrades
All of these are real, gate-backed runtimes (`pnpm animation-engine:believable-motion`) and run live
in Aura Clash. Full API in **`docs/animation/believable-motion.md`**:

- **Critically-damped transitions** — `fighterInertializedWeights(...)` / `createInertializer(...)`: move/state swaps carry momentum through instead of dissolving. Drop-in replacement for a linear crossfade.
- **Foot IK + foot-lock** — `createFootIkRig(...)` on `solveTwoBoneIk` + a ground query: planted feet stop sliding under an in-place locomotion clip; the GLB runtime exposes `actor.animation.solveImportedSkeletonTwoBoneIK(...)` for skinned rigs.
- **Spring bones** — `createSpringChain(...)`: secondary dynamics (body sway, accessories) that lag into acceleration and settle.
- **Animation event tracks** — `createAnimationEventTracks(...)` + `sampleClipEvents(...)`: named lanes of typed markers (hitbox active-frames, footsteps, VFX). Drive combat active-frames and cosmetics from the authored clip.
- **Morph targets / viseme lip-sync** — `node.morphInfluence(name, weight)` and `applyVisemeMorphInfluences(...)`: facial blendshapes with normal morphing (lighting follows the deformation). Needs a rig with blendshapes (Aura Clash fighters have none, so this is showcased in Animation Studio).

> All five are presentation-layer: they never touch the combat simulation, so **deterministic replay
> stays byte-stable**. Apply them after you've stepped the sim and synced node transforms.

### 7.4 Skinned rendering
`model(assets.character)` renders skinned GLBs with up to a 96-joint palette on **both** WebGL2 and
WebGPU. Morph targets run on a texture-backed path past the old 4-target/64-vertex cap. See
`docs/rendering/`.

---

## 8. Camera, effects, HUD, accessibility, audio

```ts
const cam = game.cameraDirector({ /* follow, frame, zoom on impact */ });
const fx  = game.effects({ /* sparks, shake, zoom */ });
const hud = game.hud.bindings([ game.hud.health({ actorId: "player" }), game.hud.timer({ valuePath: "round.timeRemaining" }) ]);
const a11y = [ game.accessibility.label({ targetId: "player-health", live: true }), game.accessibility.pauseControls({ /* ... */ }) ];
ui.html("#hud", `...`); // declarative HUD markup
```

Respect `prefers-reduced-motion` / `prefers-contrast`. Audio cues are data-driven via
`createGameAudio({ buses, cues })` — fire `audio.cue("player-hit")` from combat events, footsteps from
the foot-plant/event-track, and a telegraph spark from the authored VFX marker.

---

## 9. Evidence & deterministic replay

A game route must prove it's running the runtime, not a static scene:

```ts
const evidence = app.evidence({ input, bodies: [body], combat, effects: fx, camera: cam, hud, accessibility: a11y, stage });
const overlay  = game.debug.overlay({ runtime: app.runtime, input, bodies: [body], combat, effects: fx, camera: cam, colliders });
```

Run the same inputs twice and assert an identical checksum (deterministic combat replay). Keep all the
believable-motion layers presentation-only so they don't change that checksum.

---

## 10. Verify & deploy

```bash
npx @aura3d/cli@latest route check
npx @aura3d/cli@latest assets validate-game
npx @aura3d/cli@latest check-deploy --dist dist
```

Source evidence alone is not launch-ready: asset readiness, package smoke, browser route health,
deterministic screenshots, accessibility proof, and deploy checks must all pass before you call a
game route done.

---

## 11. Worked example: Aura Clash

The deployed showcase at `apps/aura-clash-showcase/` exercises the whole stack end to end: typed
skinned GLB fighters, `game.combatWorld` hit windows derived from authored clip events, inertialized
move transitions, foot-IK foot-lock with footsteps, spring body-sway, hit-stop + impact dynamics,
HUD/accessibility/audio, and a deterministic replay proof — all browser-verified by
`apps/aura-clash-showcase/tests/playable-smoke.spec.ts`. Read its source as the reference
implementation of this guide.

---

## 12. Where to go deeper

- Game runtime API (full reference): `docs/api/game-runtime.md`
- Believable-motion runtimes (1.3): `docs/animation/believable-motion.md`
- Animation controllers / mixer: `docs/animation/controllers.md`
- Locomotion + skinning support: `docs/animation/runtime-support.md`
- Animation event timeline integration: `docs/animation/timeline-editor-integration.md`
- Typed asset workflow: `docs/agents/asset-workflow.md`
- Prompt-to-3D workflow + deploy: `docs/agents/prompt-to-3d-workflow.md`
- Public API surface: `docs/api/public-api.md`
- Capability boundaries: `docs/project/known-limits.md`
