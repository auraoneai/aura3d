# Build Playbook

Use the public Aura3D API first:

```ts
import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Build order:

1. Choose a starter template.
2. Add or validate user assets with `@aura3d/cli`.
3. Write a `definePromptPlan(...)` with subject asset, scene type, camera,
   lighting, effects, interaction, and screenshot acceptance criteria.
4. Compile the plan with `promptPlanToScene(plan)` instead of improvising
   unrelated primitives.
5. Enable diagnostics with `diagnostics: { overlay: true }`.
6. Run build, route-health, screenshot, and deployment checks.

Minimal prompt-plan shape:

```ts
const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.product },
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  effects: ["bloom"],
  interaction: "orbit",
  acceptanceCriteria: [
    "product is centered and recognizable",
    "studio lighting shapes the asset"
  ]
} as const);

createAuraApp("#app", { scene: promptPlanToScene(plan) });
```

Do not treat a compiling app or nonblank screenshot as visual proof. The
screenshot must visibly satisfy the prompt without relying on labels,
diagnostics, or a lone asset plus decorative cues.

Keep edits scoped to active product paths. Archived legacy runtime files are
historical reference only.
