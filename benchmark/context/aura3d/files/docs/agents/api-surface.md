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
  sceneKits,
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
  product,
  solar,
  particles,
  ui,
  createAuraRouteHealthSnapshot,
  captureAuraAppScreenshot
} from "@aura3d/engine";
```

Scene kits are the preferred benchmark-facing API. Each kit returns scene nodes,
camera, lights, effects, interactions, UI, diagnostics, acceptance evidence,
`customize(...)`, and `toAppOptions()`.

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";
import { assets } from "./aura-assets";

const dataset = [
  [0.42, 0.68, 0.91],
  [0.55, 0.77, 0.83],
  [0.31, 0.59, 0.72]
] as const;

createAuraApp("#app", sceneKits.physicsPlayground().toAppOptions());
createAuraApp("#app", sceneKits.particleFountain({ particleCount: 2400, emissionRate: 120 }).toAppOptions());
createAuraApp("#app", sceneKits.solarSystem().toAppOptions());
createAuraApp("#app", sceneKits.neonTunnel().toAppOptions());
createAuraApp("#app", sceneKits.dataViz({ dataset }).toAppOptions());
createAuraApp("#app", sceneKits.miniGolf().toAppOptions());
createAuraApp("#app", sceneKits.materialLab().toAppOptions());
createAuraApp("#app", sceneKits.cityBlock({ timeOfDay: "night" }).toAppOptions());
createAuraApp("#app", sceneKits.humanoidWalk({ animationState: "benchmark-pose" }).toAppOptions());
createAuraApp("#app", sceneKits.productViewer(assets.product).toAppOptions());
```

Prompt-plan apps should import `compilePromptPlan` wherever they use
`definePromptPlan` or `promptPlanToScene`, then inspect
`compilePromptPlan(plan).report.repairHints` before accepting weak visual
output.

Physics boundary:

- Use `sceneKits.physicsPlayground()`, `sceneKits.miniGolf()`,
  `prefabs.physicsPlayground(...)`, `prefabs.physicsRamp()`, and
  `prefabs.miniGolfHole()` first for agent-authored benchmark scenes.
- Use the safe root `physics` namespace through members such as
  `physics.world(...)`, `physics.body(...)`, `physics.box(...)`,
  `physics.sphere(...)`, `physics.step(...)`, `physics.debug(...)`, and
  `physics.debugNodes(...)`.
- Use `physics.worldFromScene(scene)` after authoring `.physics(...)` on nodes
  when a prompt needs bodies and colliders derived from scene geometry.
- Do not import `PhysicsWorld`, `Shape`, or `PhysicsDebugAdapter` from
  `@aura3d/engine`.

Visual QA helpers:

```ts
console.log(charts.visualQA(sceneKits.dataViz({ dataset }).nodes));
console.log(character.visualQA(sceneKits.humanoidWalk({ animationState: "benchmark-pose" }).nodes));
console.log(city.visualQA(sceneKits.cityBlock({ timeOfDay: "night" }).nodes));
console.log(product.visualQA(sceneKits.productViewer(assets.product).nodes));
console.log(solar.visualQA(sceneKits.solarSystem().nodes));
```

Lower-level repair helpers remain available when a prompt requires custom
composition:

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
  .addMany(character.lowPolyHumanoid({ showJoints: true, motionTrail: true, clip: "benchmark-pose" }))
  .add(shadows.contact({ footprint: [1.2, 0.7] }))
  .add(primitives.torus({ name: "smooth orbit ring", material: material.neon() }))
  .add(primitives.capsule({ name: "rounded limb", material: material.clearcoat() }))
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

Camera presets and route evidence:

```ts
const appScene = sceneKits.productViewer(assets.product).scene();
const evidence = collectAuraSceneEvidence(appScene);
console.log(evidence.camera.orbitEnabled, evidence.animation.turntableEnabled, evidence.assets);
```

Use `camera.physics()`, `camera.charts()`, `camera.materials()`,
`camera.city()`, `camera.product()`, `camera.solar()`, `camera.humanoid()`,
`camera.miniGolf()`, and `camera.neon()` before hand-tuning prompt cameras. Use
`camera.autoFrame({ bounds })` for procedural scenes with known bounds.

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
