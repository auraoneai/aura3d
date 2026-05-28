# Build Playbook

Use the public Aura3D API first:

```ts
import { createAuraApp, scene, model, camera, lights } from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Build order:

1. Choose a starter template.
2. Add or validate user assets with `@aura3d/cli`.
3. Compose the scene from public helpers.
4. Enable diagnostics with `diagnostics: { overlay: true }`.
5. Run build, route-health, screenshot, and deployment checks.

Keep edits scoped to active product paths. Archived legacy runtime files are
historical reference only.
