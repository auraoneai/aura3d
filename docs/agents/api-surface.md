# API Surface

Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first. Importable
names are not the same as public proof of every rendering or gameplay claim.
Capability wording must identify whether it is root safe API,
production-runtime, rendering internals, CLI asset pipeline, template-only
scaffold, prototype, or roadmap.

## Public Root Package

Agent-authored browser apps should import public APIs from root
`@aura3d/engine`:

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

`unsafeModelUrl` is listed because it may exist for explicit diagnostics or
temporary local work. It is not allowed in public safe examples, benchmark
routes, showcase routes, or release-facing docs. Use generated typed assets and
`model(assets.name)`.

Do not import `three`, `three/examples/...`, `GLTFLoader`, renderer internals,
or production-runtime internals to make a public example look stronger. If a
feature needs internals, the correct output is a library task or roadmap item,
not route-local workaround code.

## Root `createAuraApp` Boundary

Root `createAuraApp` proves only what a browser test can prove while importing
from `@aura3d/engine`. Do not claim these from this API surface without
root-only browser screenshots and runtime evidence:

- production renderer parity;
- full PBR material parity;
- HDR/IBL/environment lighting parity;
- postprocess such as bloom, SSAO, DOF, FXAA/TAA, or color grading;
- native WebGPU or compute rendering;
- skinned GLB animation;
- morph target rendering;
- production platformer, racing, falling-block, character controller, or
  generic collision kits.

When evidence is missing, label the example `prototype`, `template-only
scaffold`, `production-runtime`, `rendering` internals, or `roadmap`.

## Asset-Safe Pattern

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.product)).add(lights.studio())
});
```

Never use raw model strings or URLs in public safe examples:

```ts
model("product");
model("/assets/product.glb");
model("https://example.com/product.glb");
unsafeModelUrl("https://example.com/product.glb");
```

Scene kits are the preferred benchmark-facing API when they are exported from
root `@aura3d/engine`. Do not assume every kit proves every visual feature in
its name. Verify the returned nodes, app options, browser pixels, and route
evidence before using the kit in a public claim.

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

Scene kits still follow the claim boundary. If a kit or prefab uses primitives,
declarative effects, non-skinned placeholders, route-local logic, or simulated
behavior, public copy must say so. Do not use a kit name to imply production
renderer, WebGPU, skinned animation, morph target, or reusable game-kit support.

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

Visual QA helpers are repair signals. They are not final proof for renderer,
animation, material, WebGPU, or gameplay claims.

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
  .addMany(character.lowPolyHumanoid({ showJoints: false, motionTrail: false, clip: "benchmark-pose" }))
  .add(shadows.contact({ footprint: [1.2, 0.7] }))
  .add(primitives.torus({ name: "smooth orbit ring", material: material.neon() }))
  .add(primitives.capsule({ name: "rounded limb", material: material.clearcoat() }))
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

Primitive helpers are not a substitute for a real primary asset. Use them for
set dressing, debug and collision guides, HUD anchors, and explicitly abstract
visualization. Do not build the main character, vehicle, product, world, weapon,
creature, or hero environment from primitives for a named object prompt.
Material helper names are not PBR proof; material claims require an explicit
support matrix and screenshots for the claimed root or internal path.

Camera presets and route evidence:

```ts
const appScene = sceneKits.productViewer(assets.product).scene();
const evidence = collectAuraSceneEvidence(appScene);
console.log(evidence.camera.orbitEnabled, evidence.animation.turntableEnabled, evidence.assets);
```

Use `camera.physics()`, `camera.charts()`, `camera.materials()`,
`camera.city()`, `camera.product()`, `camera.solar()`, `camera.humanoid()`,
`camera.miniGolf()`, and `camera.neon()` before hand-tuning prompt cameras. Use
`camera.autoFrame({ bounds })` for procedural scenes with known bounds. Use
`camera.frameAsset(assets.name, { targetHeight })` for a typed GLB that needs a
first-load framing camera. `camera.frameAsset(...)` has public-root typed-GLB
browser proof, but it is not a semantic grounding API; do not claim tire, foot,
road, or contact-point grounding from it.

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

UI APIs are for UI. Do not use DOM or CSS markup as fake particles, fake 3D
labels, fake lighting, fake trails, fake renderer output, or evidence for a
rendered Aura3D capability.
