# API Surface

Public package:

```ts
import {
  createAuraApp,
  defineAuraAssets,
  scene,
  model,
  unsafeModelUrl,
  primitives,
  prefabs,
  camera,
  lights,
  material,
  effects,
  timeline,
  interactions,
  ui,
  createAuraRouteHealthSnapshot,
  captureAuraAppScreenshot
} from "@aura3d/engine";
```

Round 1 repair helpers:

```ts
scene()
  .addMany(prefabs.particleFountain({ count: 1400 }))
  .add(effects.particles({ emitter: "swirl", particleCount: 1200 }))
  .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "night" }))
  .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24 }))
  .addMany(prefabs.materialSwatches())
  .addMany(prefabs.productStage())
  .addMany(prefabs.physicsRamp())
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .addMany(prefabs.miniGolfHole())
  .addMany(prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true }))
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

Particle-fountain benchmark scenes should also add a visible emission-rate
control with `ui.html`/`ui.onClick`; the prefab supplies the emitter, ground
collision plane, splash ring, lifetime color swatches, and dense arcs.

Follow camera:

```ts
scene()
  .addMany(prefabs.miniGolfHole())
  .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2 }));
```

The mini-golf prefab includes green, obstacle, ball, aim line, shot-power meter,
ball trail ghosts, contact flash, score counter geometry, cup, and a follow
target beacon. Pair it with a visible strokes HUD for benchmark prompt 06.

Small HUDs and toggles:

```ts
import { ui } from "@aura3d/engine";

ui.html("#app", `<button class="toggle" type="button">switch to night</button>`);
ui.onClick(".toggle", (button) => {
  ui.setText(button, "switch to day");
  ui.setPressed(button, true);
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
