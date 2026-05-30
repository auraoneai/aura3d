# Build Playbook

Use the public Aura3D API first:

```ts
import { compilePromptPlan, createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Build order:

1. Choose a starter template.
2. Add or validate user assets with `@aura3d/cli`.
3. Write a `definePromptPlan(...)` with subject asset, scene type, camera,
   lighting, effects, interaction, and screenshot acceptance criteria.
4. Compile the plan with `compilePromptPlan(plan)` and inspect
   `report.visualSystems`, `report.negativeCriteria`, and
   `report.repairHints`.
5. Render with `promptPlanToScene(plan)` instead of improvising unrelated
   primitives.
6. Enable diagnostics with `diagnostics: { overlay: true }`.
7. Run build, route-health, screenshot, prompt-fidelity, and deployment checks.

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

const compiled = compilePromptPlan(plan);

createAuraApp("#app", { scene: promptPlanToScene(plan) });

console.log(compiled.report.repairHints);
```

Do not treat a compiling app or nonblank screenshot as visual proof. The
screenshot must visibly satisfy the prompt without relying on labels,
diagnostics, or a lone asset plus decorative cues.

If screenshot review fails, apply `compilePromptPlan(plan).report.repairHints`
before changing the review label. Typical repairs are tighter framing, more
foreground/background structure, stronger key/fill/rim lighting, real
environment response for effects, and visible state for game interactions.

Round 1 failure repairs:

- Particle/VFX prompts: start with `prefabs.particleFountain(...)` or
  `effects.particles({ emitter: "fountain" | "swirl", particleCount: 1000 })`.
  Do not accept a visible emitter with zero live particles.
- Material lab prompts: use `prefabs.materialSwatches()` plus
  `material.metal()`, `material.glass()`, `material.rubber()`,
  `material.emissive()`, and `material.clearcoat()` so material classes are
  visible without reading labels.
- City prompts: use `prefabs.cityBlock(...)` before custom buildings. A city
  scene needs streets, lit windows, scale variation, fog or depth, and a camera
  angle that makes the block readable.
- Product prompts: use `prefabs.productStage()`, typed `model(assets.product)`,
  `interactions.orbit()`, and product camera framing. Do not implement the
  actual viewer in raw Three.js inside an Aura3D app.
- Physics prompts: use `prefabs.physicsRamp()` as the visible scene cue and
  import real physics APIs from `@aura3d/engine` or `@aura3d/physics` when
  simulating state. Do not claim physics from cosmetic floating boxes only.
- Animation prompts: prefer `.animate({ clip: "float" | "pulse", speed })` and
  `timeline.loop(...)`; agents must stop after build/test commands and not
  leave dev servers running.

Keep edits scoped to active product paths. Archived legacy runtime files are
historical reference only.
