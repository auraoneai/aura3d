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

React adapter:

```ts
import { AuraCanvas, Scene, Model, Camera, Lights, Effect } from "@aura3d/react";
```

Use `model(assets.robot)`. The safe API does not accept `model("robot")`.
