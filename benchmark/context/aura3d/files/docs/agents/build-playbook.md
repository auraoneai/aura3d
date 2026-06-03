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

`docs/agents/benchmark-recipes.md` first. Copy the smallest matching recipe,
run finite commands such as `npm install` and `npm run build`, and stop. Do not
run `npm run dev`, `npm run preview`, Playwright, browser screenshots, or
manual visual verification from inside the benchmark agent process. Return the
build command, the runner-owned run command, and assumptions; do not perform
runner-owned runtime capture.

`createAuraApp("#app", ...)` supplies viewport-safe layout defaults for a
direct empty app container. Do not add CSS merely to remove body margin or make
the canvas fill the screenshot; add CSS only for overlays and controls.

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
  Use high counts for fountains (`prefabs.particleFountain({ count: 2400 })`)
  when the screenshot must prove dense live particles. Do not accept a visible
  emitter, HUD counter, or single trail curve with no particle volume. For the
  fountain benchmark, add a real `ui.range`/`ui.onInput` emission-rate control
  and keep the prefab's nozzle, ground plane, splash ring, lifetime color
  swatches, and upward/falling arcs in frame. A label-only button does not
  satisfy the control requirement.
- Physics playground prompts: start with
  `prefabs.physicsPlayground({ cubes: 50 })` for renderable ramp/cube/contact
  evidence, then add real `@aura3d/engine/physics` state if needed. Do not
  build only a custom 2D canvas around the physics package.
- 3D data visualization prompts: start with `prefabs.dataBars3D({ grid: 6 })`.
  It already includes bars, top caps, base shadows, floor guides, axis rails,
  wall ticks, label chips, a grounded legend, a selected-metric callout, bloom,
  and hover metadata. Add DOM title, X/Z/height axis labels, numeric ticks, and
  hover/readout text around the single Aura app; these labels are mandatory for
  benchmark proof. Do not call `dispose()` and `createAuraApp()` in a frame loop
  to animate bar heights.
- Material lab prompts: use `prefabs.materialSwatches()` plus
  `material.metal()`, `material.glass()`, `material.rubber()`,
  `material.emissive()`, and `material.clearcoat()` so material classes are
  visible without reading labels. Keep the contrast wall, environment panels,
  refracted glass cards, softbox strips, and clearcoat highlights in frame;
  they are what make glass, chrome, and layered glossy paint read in screenshots.
- City prompts: use `prefabs.cityBlock({ blocks: 20, litWindows: true })`
  before custom buildings. A city scene needs streets, lit windows, scale
  variation, crosswalks, sidewalks, street lights, storefront/roof detail,
  fog or depth, and an obvious day/night state or toggle marker. A day/night
  toggle must change the 3D scene's sky/background, lighting, windows, street
  lights, and state marker; text-only toggles fail the prompt.
- Product prompts: use `prefabs.productViewer(assets.product)`,
  `interactions.orbit()`, and product camera framing. The helper keeps the
  typed asset, plinth, contact shadow, softboxes, clean turntable cue, and
  normalized placement together. Use `prefabs.productStage({ style:
  "inspection" })` only when the prompt asks for explicit fit brackets. Do not
  implement the actual viewer in low-level renderer code inside an Aura3D app.
- Small HUDs and controls: use `ui.html`, `ui.setText`, `ui.setPressed`,
  `ui.onClick`, `ui.range`, and `ui.onInput`. Avoid `HTMLStrongElement` and untyped `event.currentTarget`
  because those patterns caused Round 5 TypeScript compile failures. By
  default, `ui.html("#app", markup)` inserts markup inside `#app`, so nested
  scene containers remain visible within the viewport. If you query a canvas or
  container with `document.querySelector`, you may pass that nullable result to
  `createAuraApp`; missing targets throw a clear Aura runtime error instead of
  creating TypeScript friction around nested helper functions.
- Physics prompts: use `prefabs.physicsRamp()` as the visible scene cue and
  import real physics APIs from `@aura3d/engine` or `@aura3d/physics` when
  simulating state. For prompt-01-style playgrounds, use
  `prefabs.physicsPlayground({ cubes: 50 })` so falling cubes, settled cubes,
  physics from cosmetic floating boxes only.
- Mini-golf prompts: use `prefabs.miniGolfHole()`, `interactions.pointer()`,
  `camera.follow({ targetNode: "white physics golf ball" })`, and a visible
  score HUD. Keep the aim line, shot-power meter, ball ghosts, contact shadow,
  obstacle contact flash, cup, and follow-camera ball framing visible. Do not
  build gameplay only in a detached 2D overlay.
- Solar-system prompts: use
  `prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42 })`
  so the six readable planet labels are attached to their planets in the 3D
  scene. Do not ship a detached legend, a sun plus only three unlabeled
  planets, or a tilted floor-like plate in place of space.
- Animation prompts: prefer `.animate({ clip: "float" | "pulse" | "walk" | "turntable", speed })`
  and `timeline.loop(...)`; agents must stop after build/test commands and not
  leave dev servers running. For benchmark character prompts, start from
  `character.lowPolyHumanoid({ clip: "benchmark-pose", showJoints: false, motionTrail: false })`
  so the authored skinned neutral human, planted-foot phase, clean silhouette,
  path, contact shadow, face cues, stride, and walk-cycle animation are visible.
- Benchmark prompts: write the smallest complete scene first, run finite
  commands such as `npm run build`, and exit. Do not run dev servers,
  Playwright, browser screenshot capture, or manual visual verification from
  inside the agent process.
- Neon tunnel, mini-golf, and humanoid prompts: start from
  `prefabs.neonTunnel`, `prefabs.miniGolfHole`, and
  `character.lowPolyHumanoid` before custom primitive placement.
- Neon tunnel scenes should keep the prefab's octagonal rings, diagonal braces,
  perspective rails, floor reflections, fog, bloom, sparks, ambient particles,
  and dolly camera in frame. Do not replace it with a single portal, flat
  gradient, or CSS-only animation.

Keep edits scoped to active product paths. Archived legacy runtime files are
historical reference only.
