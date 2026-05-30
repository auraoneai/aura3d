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
  .addMany(prefabs.particleFountain({ count: 2400 }))
  .add(effects.particles({ emitter: "swirl", particleCount: 1200 }))
  .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
  .addMany(prefabs.materialSwatches())
  .addMany(prefabs.productStage())
  .addMany(prefabs.physicsRamp())
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .addMany(prefabs.dataBars3D({ grid: 6 }))
  .addMany(prefabs.neonTunnel({ rings: 16 }))
  .addMany(prefabs.miniGolfHole())
  .addMany(prefabs.primitiveHumanoid())
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

Small HUDs and toggles:

```ts
import { ui } from "@aura3d/engine";

ui.html("#app", `<button class="toggle" type="button">switch to night</button>`);
ui.onClick(".toggle", (button) => {
  ui.setText(button, "switch to day");
  ui.setPressed(button, true);
});
```

React adapter:

```ts
import { AuraCanvas, Scene, Model, Camera, Lights, Effect } from "@aura3d/react";
```

Use `model(assets.robot)`. The safe API does not accept `model("robot")`.
