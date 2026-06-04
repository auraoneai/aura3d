# Aura3D App API

Use `@aura3d/engine` for the public authoring surface.

```ts
import { createAuraApp, scene, model, camera, lights, material } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  diagnostics: { overlay: true },
  scene: scene()
    .add(model(assets.product, { material: material.pbr() }))
    .add(lights.studio())
    .camera(camera.orbit({ distance: 4 }))
});
```

The scene description is source code. Generated diagnostics snapshots are for
testing and bug reports, not an alternate authoring language.
