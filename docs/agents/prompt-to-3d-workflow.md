# Prompt to 3D workflow

Turn a product or scene prompt into editable `@aura3d/engine` TypeScript that a team can read, build and ship. You write the source; there is no provider-backed scene generator and no hidden asset store. Start with `docs/agents/agent-quickstart.md` (zero to a rendering scene), then use this page for the policy and the prompt-specific recipes.

Read `docs/agents/claims-and-boundaries.md` before writing public examples, READMEs or release claims. Skill routing lives in `docs/agents/README.md`.

## Default workflow

1. Restate the requested experience as scene intent (subject, genre, camera, interaction, acceptance criteria).
2. Pick the look for the genre (`docs/agents/art-direction.md`): `looks.preset(id)` plus `...looks.appOptions(id)`.
3. Resolve the subject asset: `aura3d assets search "<intent>"`, then `assets resolve --name x`; or `assets add ./file.glb --name x` for a file you already have. Never invent a URL or fall back to a primitive for a named real object. Fighter or acted humanoids: add `--profile fighting-character`.
4. Import `assets` from `./aura-assets` (generated) and write the scene with `model(assets.x)`.
5. Start from the closest `sceneKits.<name>()`, `prefabs.<name>()` or template; add only prompt-required changes.
6. `npm run build`, then capture and look at the first frame (`agent-quickstart.md` section 4), then `check-deploy`.

## Typed asset rule

```ts
import { createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio")).add(model(assets.robot)),
  ...looks.appOptions("product-studio")
});
```

Never in release-facing code: `model("robot")`, `model("/assets/robot.glb")`, a raw `.glb` URL, `unsafeModelUrl(...)`, `three` imports, `GLTFLoader`. Entries need a `sha256-...` hash from the CLI; the production bridge draws nothing without it.

## Primitives and CSS

Primitives are for ground, set dressing, guides, HUD anchors and abstract visualization. They are never the primary character, vehicle, product, creature, weapon or hero environment. CSS, DOM and canvas overlays are UI only; they must not fake particles, bloom, trails, 3D labels or renderer output.

## Prompt plans

Use a prompt plan when you get intent rather than scene code. Both functions are live root exports:

```ts
import { createAuraApp, definePromptPlan, promptPlanToScene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.robot },
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  interaction: "orbit",
  acceptanceCriteria: ["product is centered", "studio lighting is visible"]
} as const);

createAuraApp("#app", { scene: promptPlanToScene(plan), diagnostics: { overlay: true } });
```

`compilePromptPlan` is deprecated with no replacement (removed in 5.0.0): do not use it in new code. A compiling app is not done; the screenshot must visibly satisfy the prompt. If it is weak, run the look-dev loop (`aura3d-art-direction`) and fix the single biggest issue.

## Scene kits

`sceneKits.*` return nodes, camera, lights, effects and `toAppOptions()`; customise instead of rebuilding.

| Prompt family | API |
| --- | --- |
| Physics playground | `sceneKits.physicsPlayground()` |
| Particle fountain | `sceneKits.particleFountain()` or `prefabs.particleFountain({ count })` |
| Solar system | `sceneKits.solarSystem()` |
| Neon tunnel | `sceneKits.neonTunnel()` |
| Data visualization | `sceneKits.dataViz()` |
| Mini-golf | `sceneKits.miniGolf()` |
| Material lab | `sceneKits.materialLab()` |
| City block | `sceneKits.cityBlock()` |
| Humanoid walk | `sceneKits.humanoidWalk()` |
| Product viewer | `sceneKits.productViewer(assets.x)` |

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", sceneKits.productViewer(assets.robot).toAppOptions());
```

`prefabs.*` helpers return node arrays: add them with `scene().addMany(prefabs.particleFountain({ count: 2400 }))`. Kits that use primitives, route-local logic or placeholders must be labelled that way; do not call them production game runtime, skinned animation, WebGPU or PBR parity without root-only pixel evidence.

## Prompt-family recipes

- **Particles:** dense counts (`count: 2400`), keep nozzle, ground and splash context in frame, and give the emission rate a real control (`ui.range` plus `ui.onInput`), not a label.
- **Physics:** `prefabs.physicsPlayground({ cubes: 50 })` for the visible scene; simulate through the root `physics` namespace (`physics.world`, `physics.box`, `physics.step`, `physics.worldFromScene`). Do not import `PhysicsWorld`, `Shape` or `PhysicsDebugAdapter`.
- **Data viz:** `prefabs.dataBars3D({ grid: 6 })` plus DOM title, axis labels, ticks and readout. Never dispose and recreate the app per frame to animate heights.
- **Materials:** `prefabs.materialSwatches()` with `material.metal`, `glass`, `rubber`, `emissive`, `clearcoat`; keep contrast wall and softboxes in frame.
- **City:** `prefabs.cityBlock({ blocks: 20, litWindows: true })`; a day/night toggle must change sky, lights, windows and street lights, not only text.
- **Product:** `prefabs.productViewer(assets.x)`, `interactions.orbit()`, `camera.product()`.
- **Mini-golf:** `prefabs.miniGolfHole()`, `interactions.pointer()`, `camera.miniGolf()`, `games.createMiniGolfState()`, visible score HUD.
- **Solar system:** `prefabs.solarSystem({ labels: "attached" })`.
- **Characters:** `character.lowPolyHumanoid({ clip: "walk" })` for stand-ins; real characters are rigged GLBs (`aura3d-character-animation`).
- **HUD and controls:** `ui.html`, `ui.setText`, `ui.onClick`, `ui.range`, `ui.slider`, `ui.powerMeter`, `ui.scoreCounter`, `ui.resetButton`. One Aura app per route; never recreate it in a frame loop.

`createAuraApp("#app", ...)` already sets viewport-safe layout; add CSS only for overlays and controls.

## Evidence

Use: route-health reports, a looked-at screenshot of the first frame, typed asset manifests, `npx @aura3d/cli@latest check-deploy`, and `collectAuraSceneEvidence` from `@aura3d/engine/devtools` for scene structure (the root export is deprecated).

Not proof: a non-blank screenshot, object counts, node names like `bloom`, self-scored QA, or diagnostics that show a requested effect without accepted pixels.

## Acceptance for a product app

- Public imports only; typed CLI-generated assets; primary subject is a GLB unless explicitly abstract.
- No raw model strings or URLs, `unsafeModelUrl`, `three` or `GLTFLoader`.
- Overlays are UI only; build and route-health pass; the screenshot shows the requested scene.
- Games prove keyboard input, reset, objective and score or fail or progression.
- WebGPU, postprocess, animation, morph or renderer-quality claims have matching browser evidence.
- Benchmark-facing claims also pass `docs/project/frozen-benchmark-release-gates.md`.

Benchmark mode (a runner owns the browser): copy the smallest recipe from `docs/agents/benchmark-recipes.md`, run `npm install && npm run build`, and stop; do not start a dev server, Playwright or screenshots inside the agent process.
