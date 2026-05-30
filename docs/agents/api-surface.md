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
  createAuraRouteHealthSnapshot,
  captureAuraAppScreenshot
} from "@aura3d/engine";
```

Round 1 repair helpers:

```ts
scene()
  .addMany(prefabs.particleFountain({ count: 1400 }))
  .add(effects.particles({ emitter: "swirl", particleCount: 1200 }))
  .addMany(prefabs.cityBlock({ blocks: 5 }))
  .addMany(prefabs.materialSwatches())
  .addMany(prefabs.productStage())
  .addMany(prefabs.physicsRamp())
  .add(primitives.cylinder({ material: material.clearcoat() }))
  .add(primitives.sphere({ material: material.glass() }).animate({ clip: "float" }));
```

React adapter:

```ts
import { AuraCanvas, Scene, Model, Camera, Lights, Effect } from "@aura3d/react";
```

Use `model(assets.robot)`. The safe API does not accept `model("robot")`.
