# Fighting Game Example

This example shows the Aura3D 1.0.10 game runtime path for a small 2.5D fighting-game slice.

Use the template when starting a real app:

```bash
npx create-aura3d@latest aura-fighter --template fighting-game
```

The core pattern is:

- Mount one Aura app.
- Mark mutable fighter models with `.runtime(game.runtimeNode("id"))`.
- Use `app.input(...)` so input listeners are disposed with `app.dispose()`.
- Use `game.kinematicBody(...)` for movement, gravity, dash, jump, bounds, and knockback.
- Use `game.combatWorld(...)` for hitboxes, hurtboxes, guard, hit-stop, stun, recovery, and typed combat events.
- Use `game.effects(...)` and `game.cameraDirector(...)` for hit sparks and impact framing.
- Use `app.evidence(...)` to prove the route uses runtime systems.

```ts
import {
  camera,
  createAuraApp,
  effects,
  game,
  games,
  lights,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const stage = games.fighting.stagePreset("neon-dojo");
const stageIssues = games.fighting.validateStage(stage);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let reducedFlash = false;

const app = createAuraApp("#app", {
  scene: scene()
    .background("#06140f")
    .add(
      primitives.plane({
        name: "combat lane",
        material: material.pbr({ color: "#10291f", roughness: 0.72 })
      }).position(0, 0, 0).scale([8.5, 1, 2.4])
    )
    .add(
      model(assets.playerFighter)
        .position(-1.8, 0.9, 0)
        .scale(0.72)
        .runtime(game.runtimeNode("player", { tags: ["fighter", "player", "typed-glb"] }))
    )
    .add(
      model(assets.rivalFighter)
        .position(1.8, 0.9, 0)
        .rotate(0, Math.PI, 0)
        .scale(0.72)
        .runtime(game.runtimeNode("rival", { tags: ["fighter", "rival", "typed-glb"] }))
    )
    .addMany([
      effects.bloom({ intensity: 0.32 }),
      lights.studio({ intensity: 1.15 }),
      camera.perspective({ position: [0, 1.75, 5.8], target: [0, 0.85, 0], fov: 42 })
    ])
});

const input = app.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["KeyW", "ArrowUp"],
    guard: ["ShiftLeft", "ShiftRight"],
    dash: ["Space"],
    light: ["KeyJ"],
    heavy: ["KeyK"],
    special: ["KeyL"]
  },
  axes: {
    moveX: { negative: "left", positive: "right", gamepadAxis: 0 }
  },
  bufferMs: 150,
  gamepad: true
});

const playerBody = game.kinematicBody({
  id: "player",
  position: [-1.8, 0.9, 0],
  bounds: { minX: -3.8, maxX: 3.8, minZ: -0.4, maxZ: 0.4 },
  groundY: 0
});

const rivalBody = game.kinematicBody({
  id: "rival",
  position: [1.8, 0.9, 0],
  bounds: { minX: -3.8, maxX: 3.8, minZ: -0.4, maxZ: 0.4 },
  groundY: 0
});

const combat = game.combatWorld();
const runtimeEffects = game.effects({ poolSize: 64, reducedMotion, reducedFlash });
const director = game.cameraDirector({ stageBounds: stage.combatBounds, reducedMotion });

combat.addActor({ id: "player", team: "player", position: playerBody.position, facing: 1 });
combat.addActor({ id: "rival", team: "rival", position: rivalBody.position, facing: -1 });

app.onFrame(({ dt }) => {
  input.update(dt);

  playerBody.move(input.axis("moveX"));
  if (input.pressed("jump")) playerBody.jump();
  if (input.pressed("dash")) playerBody.dash([playerBody.facing, 0, 0], 8);

  if (input.pressed("light")) {
    combat.beginAttack("player", {
      id: "player-light",
      damage: 7,
      hitStop: 0.08,
      hitStun: 0.22,
      recovery: 0.18,
      activeFrames: [2, 8],
      durationFrames: 18,
      knockback: [playerBody.facing * 1.8, 0.5, 0],
      hitboxes: [
        {
          id: "jab",
          offset: [playerBody.facing * 0.58, 0.82, 0],
          size: [0.58, 0.45, 0.45]
        }
      ]
    });
  }

  playerBody.update(dt);
  rivalBody.update(dt);
  combat.setActor("player", {
    position: playerBody.position,
    facing: playerBody.facing,
    guarding: input.held("guard")
  });
  combat.setActor("rival", {
    position: rivalBody.position,
    facing: -1
  });
  combat.update(dt);

  for (const event of combat.consumeEvents()) {
    if (event.type === "hit" || event.type === "blocked") {
      const attackerBody = event.attackerId === "player" ? playerBody : rivalBody;
      runtimeEffects.hitSpark(event.position, {
        ownerId: event.attackerId,
        intensity: event.type === "hit" ? 1.1 : 0.65,
        attachment: {
          targetId: event.attackerId,
          getPosition: () => attackerBody.position,
          offset: [0, 0.82, 0]
        }
      });
      director.impact(event.type === "hit" ? 0.42 : 0.18, 0.16);
    }
  }

  runtimeEffects.update(dt);
  director.update(dt, [
    { id: "player", position: playerBody.position },
    { id: "rival", position: rivalBody.position }
  ]);

  app.nodes.require("player")
    .setPosition(playerBody.position[0], playerBody.position[1], playerBody.position[2])
    .setRotation(0, playerBody.facing < 0 ? Math.PI : 0, 0)
    .play(input.held("guard") ? "guard" : input.buffered("light") ? "attack" : "idle");

  app.nodes.require("rival")
    .setPosition(rivalBody.position[0], rivalBody.position[1], rivalBody.position[2])
    .setRotation(0, Math.PI, 0)
    .play("idle");
});
```

## Evidence

Collect runtime evidence from the mounted app handle:

```ts
const evidence = app.evidence({
  input,
  bodies: [playerBody, rivalBody],
  combat,
  effects: runtimeEffects,
  camera: director,
  assets: { typedAssets: 2, missingAssets: [] },
  stage: {
    id: stage.id,
    safeZones: stageIssues.length === 0,
    bounds: stage.combatBounds,
    warnings: stageIssues.map((issue) => issue.message)
  }
});
```

The report proves:

- Runtime nodes exist and are mutable.
- The frame loop has advanced.
- Input actions and axes are configured.
- Kinematic bodies are active.
- Combat/collision state exists.
- Effects and camera director state are attached.
- Typed assets and stage metadata are present.

## Typed GLB stages

When a stage uses an external GLB, add it through the Aura3D CLI first and consume the generated typed asset:

```bash
npx @aura3d/cli@latest assets add ./assets/stage.glb --name stage
```

```ts
import { game, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const stageScene = scene()
  .add(model(assets.stage).runtime(game.runtimeNode("stage", { tags: ["stage", "typed-glb"] })));
```

Do not use `model("stage")`, raw GLB URLs, or private loader code for playable stage proof.

Do not claim a game route is launch-ready until build, browser tests, visual screenshots, asset validation, and route/GLB deployment proof have passed.

## 1.0.10 animation-event upgrade path

For 1.0.10 release work, the fighting starter should drive visible named GLB
clips through `AnimationController` and use clip-local animation events for
combat timing. Keep movement authoritative in `game.kinematicBody(...)`; use
animation events for attack windows, effects, and camera response.
This snippet assumes the `input`, `playerBody`, and `combat` objects from the
runtime example above.

```ts
import {
  createAuraApp,
  createAnimationController,
  game,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene().add(
    model(assets.playerFighter)
      .runtime(game.runtimeNode("player", { tags: ["fighter", "typed-glb"] }))
  )
});

const player = app.nodes.require("player");
const animation = createAnimationController({
  id: "player-animation",
  clipRegistry: assets.playerFighter,
  requiredClips: ["Idle", "Run", "Jump", "LightPunch", "HitReact"],
  suppressRootMotion: true,
  layers: [
    { id: "base", role: "locomotion", bodyMask: "full-body" },
    { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
  ]
});

animation.bindRuntimeNode(player, {
  defaultClipId: "Idle"
});

animation.onEvent("hitbox.open", ({ event, source }) => {
  const payload = event.payload as { damage?: number } | undefined;
  combat.beginAttack("player", {
    id: `${source.clipId}:event-hitbox`,
    damage: payload?.damage ?? 7,
    hitStop: 0.08,
    hitStun: 0.22,
    recovery: 0.18,
    activeFrames: [0, 4],
    durationFrames: 8,
    knockback: [playerBody.facing * 1.8, 0.5, 0],
    hitboxes: [
      { id: "jab", offset: [playerBody.facing * 0.58, 0.82, 0], size: [0.58, 0.45, 0.45] }
    ]
  });
});

app.onFrame(({ dt }) => {
  input.update(dt);

  const moving = Math.abs(input.axis("moveX")) > 0.05;
  animation.crossFade(moving ? "Run" : "Idle", 0.12, { layer: "base" });

  if (input.buffered("light", 140)) {
    animation.crossFade("LightPunch", 0.06, {
      restart: true,
      restartFromFrameZero: true,
      layer: "upper-body",
      attack: true
    });
  }

  animation.update(dt);
});
```

This is source guidance until browser evidence proves the named clips deform the
fighter, the attack restarts from frame zero, the blend is visible, and the
event-created hitbox appears in combat evidence and screenshots.

## Source versus execution gates

This example is source-complete when it uses only public `@aura3d/engine`
imports, typed assets from `./aura-assets`, `.runtime(game.runtimeNode("id"))`,
one `createAuraApp(...)` call for the route, `app.onFrame(...)`,
`app.input(...)`, `game.kinematicBody(...)`, `game.combatWorld(...)`,
`game.effects(...)`, `game.cameraDirector(...)`, and `game.evidence(app)`.

```ts
const sourceEvidence = game.evidence(app);

window.__AURA3D_GAME_RUNTIME_SOURCE_EVIDENCE__ = {
  sourceEvidence,
  note: "Source evidence only; browser/package/deploy proof is still required."
};
```

Evidence-only gates that still require execution:

| Gate | Required proof |
| --- | --- |
| Package API | Packed `@aura3d/engine` install smoke that imports the public root API from a clean consumer project |
| Browser runtime | Browser route report showing frame-loop movement, input/replay, collision, animation state changes, effects, and nonblank visual output |
| Assets | CLI asset validation output for every GLB used by the playable route |
| Screenshots | Deterministic screenshots or videos with stable paths and hashes |
| Accessibility | Reduced-motion, reduced-flash, pause controls, labels, focus/HUD behavior, and contrast evidence |
| Deployment | Durable deployed route plus GLB/static asset fetch proof |

Source-complete means the example is ready for those checks. It does not mean
the route is release-ready.
