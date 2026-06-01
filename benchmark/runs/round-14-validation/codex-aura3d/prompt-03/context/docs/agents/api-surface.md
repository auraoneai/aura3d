# API Surface

Public package:

```ts
import {
  createAuraApp,
  collectAuraSceneEvidence,
  definePromptPlan,
  compilePromptPlan,
  promptPlanToScene,
  defineAuraAssets,
  scene,
  model,
  unsafeModelUrl,
  primitives,
  group,
  groups,
  shadows,
  prefabs,
  camera,
  lights,
  material,
  effects,
  timeline,
  interactions,
  physics,
  labels,
  environments,
  games,
  charts,
  character,
  city,
  ui,
  createAuraRouteHealthSnapshot,
  captureAuraAppScreenshot
} from "@aura3d/engine";
```

Prompt-plan apps should import `compilePromptPlan` wherever they use
`definePromptPlan` or `promptPlanToScene`, then inspect
`compilePromptPlan(plan).report.repairHints` before accepting weak visual
output.

Physics boundary:

- Use `prefabs.physicsPlayground(...)`, `prefabs.physicsRamp()`, and
  `prefabs.miniGolfHole()` first for agent-authored benchmark scenes.
- Use the safe root `physics` namespace through members such as
  `physics.world(...)`, `physics.body(...)`, `physics.box(...)`,
  `physics.sphere(...)`, `physics.step(...)`, `physics.debug(...)`, and
  `physics.debugNodes(...)`.
- Use `physics.worldFromScene(scene)` after authoring `.physics(...)` on nodes
  when a prompt needs bodies and colliders derived from scene geometry.
- Do not import `PhysicsWorld`, `Shape`, or `PhysicsDebugAdapter` from
  `@aura3d/engine`. Those names are internal/private for agent docs; the root
  `physics` namespace is the public agent-facing simulation boundary.

Round 1 repair helpers:

```ts
scene()
  .addMany(prefabs.particleFountain({ count: 1400 }))
  .add(effects.particles({ emitter: "swirl", particleCount: 1200 }))
  .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "night" }))
  .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24 }))
  .addMany(prefabs.materialSwatches())
  .addMany(prefabs.productViewer(assets.product))
  .addMany(prefabs.physicsRamp())
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .addMany(prefabs.miniGolfHole())
  .addMany(character.primitiveHumanoid({ showJoints: true, motionTrail: true, clip: "walk" }))
  .add(shadows.contact({ footprint: [1.2, 0.7] }))
  .add(primitives.torus({ name: "smooth orbit ring", material: material.neon() }))
  .add(primitives.capsule({ name: "rounded limb", material: material.clearcoat() }))
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

Use `collectAuraSceneEvidence(scene).performance.budgets` or
`performance.budgetFor("neonTunnel")` to report helper draw-call/node/FPS
budgets. Use `character.visualQA(character.primitiveHumanoid())` when checking
that primitive humanoids stay connected and proportionate across captured
animation frames.

Particle-fountain benchmark scenes should also add a real emission-rate control
with `ui.html`, `ui.range`, and `ui.onInput`; the prefab supplies the nozzle,
ground collision plane, splash ring, lifetime color swatches, and dense arcs.

Follow camera:

```ts
scene()
  .addMany(prefabs.miniGolfHole())
  .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }));
```

Camera presets and route evidence:

```ts
const appScene = scene()
  .addMany(prefabs.productViewer(assets.product))
  .add(interactions.orbit())
  .camera(camera.product());

const evidence = collectAuraSceneEvidence(appScene);
console.log(evidence.camera.orbitEnabled, evidence.animation.turntableEnabled, evidence.assets);
```

Use `camera.physics()`, `camera.charts()`, `camera.materials()`,
`camera.city()`, `camera.product()`, `camera.solar()`, `camera.humanoid()`,
`camera.miniGolf()`, and `camera.neon()` before hand-tuning prompt cameras.
Use `camera.autoFrame({ bounds })` for procedural scenes with known bounds.

Editable material parameters:

```ts
const materialKnobs = material.labParameters();
const glass = material.fromParameters(materialKnobs.find((entry) => entry.name === "glass")!);
scene().add(primitives.sphere({ material: glass }));
```

The mini-golf prefab includes green, obstacle, ball, aim line, shot-power meter,
ball trail ghosts, contact flash, score counter geometry, cup, and a follow
target beacon. Pair it with a visible strokes HUD for benchmark prompt 06.
For game-state evidence, use the public state controller:

```ts
const golf = games.createMiniGolfState();
golf.shoot({ vector: [2.9, 0, -1.55], power: 1.4 });
golf.step(180);
console.log(golf.snapshot().shots, golf.snapshot().score, golf.snapshot().ballPosition);
```

Small HUDs and toggles:

```ts
import { physics, ui } from "@aura3d/engine";

ui.html("#app", `<button class="toggle" type="button">switch to night</button>`);
ui.onClick(".toggle", (button) => {
  ui.setText(button, "switch to day");
  ui.setPressed(button, true);
});

ui.html("#app", `<input id="rate" type="range" min="60" max="180" value="120" />`);
ui.slider("#rate", { min: 60, max: 180, value: 120, metric: "particle-emission-rate" });
ui.onInput("#rate", (input) => ui.setText("#rate-value", input.value));
const world = physics.world();
ui.resetButton("#reset", () => {
  world.reset();
  ui.setText("#status", `reset ${world.snapshot().resets}`);
});
```

`ui.html("#app", markup)` inserts inside the target by default. Use it for
mounting HUDs and nested scene containers; pass an explicit `InsertPosition`
only when you intentionally need sibling markup.

Mount targets:

```ts
createAuraApp("#app", { scene: scene().add(lights.studio()) });

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
createAuraApp(canvas, { scene: scene().add(lights.studio()) });
```

`createAuraApp` accepts selector strings, elements, canvases, and nullable DOM
query results. Nullable targets throw a clear runtime error if the element is
missing, which keeps agent-authored `querySelector` code type-safe.

React adapter:

```ts
import { AuraCanvas, Scene, Model, Camera, Lights, Effect } from "@aura3d/react";
```

Use `model(assets.robot)`. The safe API does not accept `model("robot")`.
