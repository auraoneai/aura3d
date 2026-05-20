# G3D V3: Build The Three.js Competitor

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


EngineReadiness and V2 produced bounded slices. That is not enough.

V3 is the master product plan for turning G3D into a credible **Three.js competitor for modern browser 3D applications**. It is not a screenshot prompt, not a one-off product studio task, not a readiness report, and not a claim that the current repo already competes with Three.js.

The objective is to build a complete web 3D SDK that a developer can choose instead of Three.js for supported workflows because G3D is easier to start, more opinionated where Three.js is low-level, and still flexible enough for real apps.

## The Product We Are Actually Building

Build:

**G3D Web: a TypeScript-first browser 3D SDK and toolchain for product visualization, asset viewers, configurators, interactive scenes, and lightweight web games.**

The product must include:

- A stable public API.
- A scene graph and component model.
- WebGL2 renderer that produces good default output.
- WebGPU path where useful, but WebGL2 remains the reliable baseline.
- glTF/GLB asset pipeline.
- Materials, lighting, shadows, postprocess, animation, input, audio, physics integration, editor/runtime helpers.
- Developer-first examples that are real apps, not proof panels.
- Package smoke tests from outside the monorepo.
- Documentation that teaches users to build with G3D.
- Same-scene comparisons against Three.js for supported workflows.

Do **not** call the project a Three.js replacement until the replacement gates in this file pass.

Do call the target:

**A Three.js competitor for supported web product, asset, scene, and lightweight interactive workflows.**

## Why V3 Exists

V1 proved the repo needed truthful constraints.

V2 built one coherent product slice: Product Studio.

V3 must turn the repo from isolated product slices into a reusable platform. The question is no longer:

> Can one demo render?

The question is:

> Can G3D support a developer building real browser 3D apps across multiple workflows with a stable API, package, docs, examples, and evidence?

## Non-Negotiable Rule: Do Not Stop After A Slice

An agent executing V3 must not stop after:

- One app.
- One screenshot.
- One passing browser test.
- One package smoke.
- One readiness JSON.
- One feature package.
- One comparison scene.
- One milestone unless explicitly told by the user to stop.

Completion means all V3 release gates pass.

If context compacts, continue from the latest completed checklist item. Do not restart from scratch. Do not mark complete because one milestone passed.

## Product Positioning

G3D is not trying to copy Three.js line-by-line.

Three.js is broad, flexible, and low-level. G3D should compete by being:

- TypeScript-first.
- Workflow-first.
- Asset-to-render by default.
- Opinionated about good lighting, camera framing, materials, shadows, and postprocess.
- Easier to package into real apps.
- Easier to validate with repo-local evidence.
- Better for controlled product, asset, catalog, configurator, and lightweight interactive workflows.

G3D loses if:

- Developers still need to hand-wire low-level renderer state for common scenes.
- Examples are mostly debug panels.
- Visuals look like primitive generated test scenes.
- Public APIs are unstable or undocumented.
- Package smoke only works inside the monorepo.
- Claims outrun evidence.

## High-End Product North Star

The target is not "a few Three.js-like wrappers."

The target is a high-end browser 3D platform that feels like a premium, batteries-included version of the workflows developers often build manually with Three.js.

Build toward this experience:

```ts
import { createG3DApp, loadAsset, workflows } from "@galileo3d/engine";

const app = await createG3DApp({
  canvas,
  renderer: "webgl2",
  quality: "high",
  resize: "container",
  diagnostics: "developer"
});

const asset = await loadAsset("/models/watch.glb");
const scene = await workflows.productConfigurator({
  asset,
  lighting: "premium-studio",
  camera: "hero",
  materials: "asset-with-inspection-modes",
  shadows: "contact-and-directional",
  postprocess: "catalog"
});

app.setScene(scene);
app.start();
```

The product should let a developer build:

- A premium ecommerce product viewer.
- A product configurator with material/color variants.
- A glTF asset inspection tool.
- A material design studio.
- A real-time scene showcase.
- A lightweight interactive game slice.
- A branded 3D web experience.
- A local editor-authored runtime.

The product must feel intentionally designed around these apps. It must not feel like unrelated tests and examples glued together.

## What "High-End Three.js Competitor" Means

V3 must aim above "it renders a cube."

A high-end Three.js competitor for supported workflows means:

- **Renderer:** PBR materials, environment lighting, shadows, HDR/tone mapping, postprocess, texture pipelines, frame capture, resize handling, and diagnostics are integrated.
- **Assets:** glTF/GLB loading returns render-ready resources, warnings, bounds, materials, textures, animations, and feature support details.
- **Workflows:** product viewer, configurator, asset viewer, material studio, scene showcase, and interactive scene creation are first-class SDK APIs.
- **Apps:** the repo ships real browser apps that dogfood the SDK and look like serious tools.
- **Examples:** examples teach public APIs and demonstrate polished output, not isolated internal renderer calls.
- **Package:** the published package works outside the monorepo with root and subpath imports.
- **Docs:** docs explain how to build actual apps with G3D, including limitations.
- **Comparison:** same-scene Three.js comparisons exist for supported workflows.

This is the bar. If the work being done does not improve one of these areas, it is probably not V3 work.

## Developer Experience Target

G3D should compete with Three.js by reducing the amount of manual setup needed for common app workflows.

The developer should not have to manually solve these every time:

- Canvas lifecycle.
- Device/backend selection.
- Resize and DPR.
- Camera framing.
- Scene bounds.
- Studio lighting.
- Renderable conversion from glTF.
- Texture decoding.
- Material fallback.
- Shadow setup.
- HDR/tone mapping setup.
- Screenshot/export capture.
- Diagnostics and warnings.
- Package import structure.

Required developer-facing APIs:

- `createG3DApp(options)`
- `createRenderer(options)`
- `loadAsset(url, options)`
- `createRenderableScene(asset, options)`
- `createAssetViewerWorkflow(options)`
- `createProductConfiguratorWorkflow(options)`
- `createMaterialStudioWorkflow(options)`
- `createSceneShowcaseWorkflow(options)`
- `createInteractiveSceneWorkflow(options)`
- `capturePng(sceneOrApp, options)`
- `inspectAsset(asset)`
- `validateScene(scene)`
- `createLightingPreset(name)`
- `createCameraFrame(target, preset, viewport)`

The final APIs can differ if the repo patterns demand it, but the repo must provide equivalent ergonomic entry points.

## App Quality Bar

V3 apps must look and behave like real tools.

Every app must have:

- A primary 3D viewport that dominates the screen.
- Real controls that change the render output.
- Multiple real content presets.
- Loading, ready, and error states.
- Diagnostics that are accessible but not the visual centerpiece.
- Export or capture behavior where relevant.
- Browser-state hooks for tests.
- Screenshot evidence for at least three meaningful states.
- Responsive layout for desktop and mobile widths.
- No proof panels.
- No placeholder hero copy.
- No giant decorative marketing card.
- No debug grid as the main visual.
- No "hello cube" acceptance.

The app suite must include:

- Product Studio: premium product render and export workflow.
- Asset Lab: inspect and render multiple glTF/GLB fixtures with warnings.
- Material Lab: create and compare high-end material presets.
- Scene Lab: compose a richer scene with lights, shadows, postprocess, and camera presets.
- Game Lab: demonstrate input, animation, physics or collision, audio hooks, and real-time update loop.

If any app looks like a throwaway example, it fails.

## Example Quality Bar

Examples are not allowed to be five-minute screenshots.

Every example must:

- Use public package APIs.
- Contain a real scene or workflow.
- Fit in a documented developer learning path.
- Have a README that explains what the developer learns.
- Have browser evidence.
- Avoid internal test-only helpers.
- Avoid proof panels and JSON dumps.
- Avoid primitive-only placeholder scenes unless the example is explicitly the first triangle/basic scene.

Current or future examples must graduate from:

- Basic scene.
- PBR materials.
- Asset viewer.
- Product configurator.
- Material studio.
- Interactive scene.
- Game slice.
- Editor-authored runtime.
- Performance/stress scene.

Each example should answer: "Why would someone choose G3D for this workflow instead of starting from raw Three.js?"

## Engine Architecture Target

V3 should converge the repo into a clear layered architecture.

Layer 1: Foundation packages

- `@galileo3d/math`
- `@galileo3d/core`
- `@galileo3d/scene`
- `@galileo3d/ecs`

Layer 2: Runtime subsystems

- `@galileo3d/rendering`
- `@galileo3d/assets`
- `@galileo3d/animation`
- `@galileo3d/input`
- `@galileo3d/audio`
- `@galileo3d/physics`
- `@galileo3d/debug`

Layer 3: Workflow SDKs

- `@galileo3d/product-studio`
- `@galileo3d/workflows`

Layer 4: Apps and examples

- `apps/product-studio`
- `apps/asset-lab`
- `apps/material-lab`
- `apps/scene-lab`
- `apps/game-lab`
- `examples/*-v3`

Layer 5: Evidence

- `tests/unit`
- `tests/assets`
- `tests/browser`
- `tools/v3-*`
- `benchmarks/v3`
- `tests/reports/v3-*`

Rules:

- Apps can depend on workflow SDKs and public packages.
- Workflow SDKs can depend on runtime subsystems.
- Runtime subsystems cannot depend on apps.
- Tests can depend on apps and public packages.
- Tools can inspect all layers.
- Public docs must show public APIs, not internal construction shortcuts.

## Feature Depth Requirements

V3 cannot pass by adding shallow names without depth.

### Rendering Depth

Renderer work must include:

- Stable render loop.
- Explicit render-on-demand path.
- Resize-to-display path.
- WebGL2 backend baseline.
- WebGPU path documented as supported, partial, or experimental.
- Render target lifecycle.
- Depth handling.
- Shadow map lifecycle.
- Postprocess pass lifecycle.
- PBR material correctness tests.
- Texture binding tests.
- Renderer diagnostics.
- Device/context loss diagnostics.
- Frame capture.
- Visual evidence.

### Asset Depth

Asset work must include:

- Valid glTF/GLB parsing.
- Render-resource creation.
- Bounds calculation.
- Texture/image decoding.
- Material summaries.
- Mesh summaries.
- Animation summaries.
- Warnings for unsupported features.
- Fallback behavior.
- Corpus-style fixtures.
- Asset inspection report.
- Browser render proof.

### Workflow Depth

Workflow work must include:

- Typed options.
- Typed result object.
- Scene creation.
- Camera creation.
- Lighting creation.
- Material handling.
- Diagnostics.
- Disposal/lifecycle.
- Browser render proof.
- Package consumer proof.

### App Depth

App work must include:

- State model.
- Viewport module.
- Controls module.
- Export/capture module where relevant.
- Runtime diagnostics.
- Error handling.
- Responsive CSS.
- Browser test.
- Screenshots for meaningful states.

### Package Depth

Package work must include:

- Root export.
- Subpath export.
- Type declarations.
- Dist build.
- Tarball install.
- Temp app import.
- Temp app render/capture.
- No monorepo alias dependency.

## Anti-Half-Ass Rules

These are automatic failure conditions:

- A milestone adds only docs and no product code, unless the milestone is explicitly documentation-only.
- A workflow returns static fake data.
- An app uses test fixtures without exposing a real user workflow.
- A screenshot is mostly UI text, metrics, or debug overlay.
- A renderer feature is only represented by a stub class.
- A package export exists but cannot be imported from `dist`.
- A browser test only checks that the page is nonblank.
- A readiness tool passes without verifying files and artifacts.
- A comparison tool compares unrelated scenes.
- A docs page makes a claim that no test/report/artifact backs up.
- A task stops after making one small example and says V3 is complete.

If any of these happen, the agent must fix the product implementation, not weaken the plan.

## Product Pillars

### Pillar 1: Core Runtime

The runtime must give developers an ergonomic app foundation.

Build and harden:

- `packages/core/src/index.ts`
- `packages/math/src/index.ts`
- `packages/scene/src/index.ts`
- `packages/ecs/src/index.ts`
- `packages/rendering/src/index.ts`
- `packages/assets/src/index.ts`
- `packages/input/src/index.ts`
- `packages/animation/src/index.ts`
- `packages/audio/src/index.ts`
- `packages/physics/src/index.ts`
- `packages/editor-runtime/src/index.ts`
- `packages/debug/src/index.ts`

Required public capabilities:

- Scene creation.
- Entity/component lifecycle.
- Transform hierarchy.
- Cameras.
- Lights.
- Mesh/renderable components.
- Materials.
- Asset loading.
- Animation playback.
- Input controls.
- Physics body attachment.
- Audio listener/source attachment.
- Renderer lifecycle.
- Resize handling.
- Error diagnostics.

### Pillar 2: Renderer Quality

Renderer quality must be product-facing, not metrics-only.

Build and harden:

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/RenderGraph.ts`
- `packages/rendering/src/RenderPipeline.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/NormalMappedPBRMaterial.ts`
- `packages/rendering/src/MaterialPresets.ts`
- `packages/rendering/src/LightingDefaults.ts`
- `packages/rendering/src/PBRLightingDefaults.ts`
- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/ShadowMap.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/CameraFraming.ts`
- `packages/rendering/src/FrameVisualMetrics.ts`
- `packages/rendering/src/RendererFeatureGates.ts`
- `packages/rendering/src/RendererDebugOverlay.ts`

Required rendering features:

- WebGL2 baseline renderer.
- Reliable canvas-backed rendering.
- Renderer-owned resize path.
- PBR material response.
- Textured PBR.
- Normal maps.
- Alpha/blend handling.
- Emissive materials.
- Environment lighting.
- Directional, point, and spot light support.
- Renderer-owned shadows.
- HDR render target support where available.
- Tone mapping.
- Color grading.
- Bloom and FXAA.
- Basic frustum culling.
- Render diagnostics.
- Frame capture and pixel analysis.

### Pillar 3: Asset Pipeline

The asset pipeline must make real glTF files usable without a user manually reconstructing the render scene.

Build and harden:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/loadRenderableAsset.ts`
- `packages/assets/src/createRenderableScene.ts`
- `packages/assets/src/AssetRenderDefaults.ts`
- `packages/assets/src/AssetInspection.ts`
- `packages/assets/src/AssetImportPreflight.ts`
- `packages/assets/src/AssetCompatibility.ts`
- `packages/assets/src/AssetCorpus.ts`
- `packages/assets/src/TextureLoader.ts`
- `packages/assets/src/TexturePipeline.ts`
- `packages/assets/src/KTX2BasisTextureTranscoder.ts`
- `packages/assets/src/GLTFCompressionDecoders.ts`

Required asset features:

- Local `.gltf` and `.glb` loading.
- Data URI and external buffer/image loading.
- Named nodes, meshes, materials, textures.
- Mesh primitives.
- Indexed and non-indexed geometry.
- Multiple materials.
- Base color, metallic-roughness, normal, emissive, occlusion texture slots.
- Alpha modes.
- Texture transforms where supported.
- Material variants where supported.
- Cameras and lights where supported.
- Skins and morphs where supported.
- Animations where supported.
- Draco and meshopt decode path where dependencies exist.
- KTX2/Basis path where dependencies exist.
- Warnings for unsupported features.
- No blank output on partial support unless the asset is genuinely invalid.

### Pillar 4: Workflow SDKs

G3D competes by shipping workflow-level SDKs above raw rendering.

Build and harden:

- `packages/product-studio/src/index.ts`
- `packages/product-studio/src/ProductStudio.ts`
- `packages/product-studio/src/ProductAssetLoader.ts`
- `packages/product-studio/src/ProductRenderScene.ts`
- `packages/product-studio/src/ProductLighting.ts`
- `packages/product-studio/src/ProductCamera.ts`
- `packages/product-studio/src/ProductMaterials.ts`
- `packages/product-studio/src/ProductExport.ts`
- `packages/product-studio/src/ProductDiagnostics.ts`

Add:

- `packages/workflows/package.json`
- `packages/workflows/src/index.ts`
- `packages/workflows/src/AssetViewerWorkflow.ts`
- `packages/workflows/src/ProductConfiguratorWorkflow.ts`
- `packages/workflows/src/SceneShowcaseWorkflow.ts`
- `packages/workflows/src/MaterialStudioWorkflow.ts`
- `packages/workflows/src/InteractiveSceneWorkflow.ts`
- `packages/workflows/src/WorkflowTypes.ts`
- `packages/workflows/src/WorkflowDiagnostics.ts`

Required workflow APIs:

- `createAssetViewerWorkflow`
- `createProductConfiguratorWorkflow`
- `createSceneShowcaseWorkflow`
- `createMaterialStudioWorkflow`
- `createInteractiveSceneWorkflow`

Each workflow must:

- Load or create scene content.
- Create camera defaults.
- Create lighting defaults.
- Create material defaults.
- Create renderer input.
- Expose diagnostics.
- Expose export/capture hooks where relevant.
- Work in package smoke tests outside the monorepo.

### Pillar 5: Real Apps, Not Demo Fragments

V3 must build actual apps that dogfood the SDK.

Keep and harden:

- `apps/product-studio/index.html`
- `apps/product-studio/src/main.ts`
- `apps/product-studio/src/ProductStudioApp.ts`

Add:

- `apps/asset-lab/index.html`
- `apps/asset-lab/src/main.ts`
- `apps/asset-lab/src/AssetLabApp.ts`
- `apps/asset-lab/src/AssetLabState.ts`
- `apps/asset-lab/src/AssetLabViewport.ts`
- `apps/asset-lab/src/AssetLabControls.ts`
- `apps/material-lab/index.html`
- `apps/material-lab/src/main.ts`
- `apps/material-lab/src/MaterialLabApp.ts`
- `apps/material-lab/src/MaterialLabState.ts`
- `apps/material-lab/src/MaterialLabViewport.ts`
- `apps/material-lab/src/MaterialLabControls.ts`
- `apps/scene-lab/index.html`
- `apps/scene-lab/src/main.ts`
- `apps/scene-lab/src/SceneLabApp.ts`
- `apps/scene-lab/src/SceneLabState.ts`
- `apps/scene-lab/src/SceneLabViewport.ts`
- `apps/scene-lab/src/SceneLabControls.ts`
- `apps/game-lab/index.html`
- `apps/game-lab/src/main.ts`
- `apps/game-lab/src/GameLabApp.ts`
- `apps/game-lab/src/GameLabState.ts`
- `apps/game-lab/src/GameLabViewport.ts`
- `apps/game-lab/src/GameLabControls.ts`

App requirements:

- The first screen is the usable app, not a landing page.
- The canvas or 3D viewport is the primary surface.
- Controls are compact and real.
- No proof panels.
- No JSON dumps as visual proof.
- No giant marketing hero.
- No decorative cards around the main viewport.
- Each app must expose a stable `window.__G3D_*__` state object for browser evidence.
- Each app must produce at least three meaningful screenshot variants.

### Pillar 6: Examples And Tutorials

Examples must teach the public API and look credible.

Create or harden:

- `examples/index.html`
- `examples/00-basic-triangle/`
- `examples/01-basic-scene/`
- `examples/02-materials-pbr/`
- `examples/asset-viewer-v3/`
- `examples/material-studio-v3/`
- `examples/product-configurator-v3/`
- `examples/interactive-scene-v3/`
- `examples/game-slice-v3/`
- `examples/gltf-corpus-gallery/`

Each example must include:

- `index.html`
- `main.ts`
- `README.md`
- Browser test.
- Screenshot evidence.
- No hidden internal test-only APIs.

Do not keep shipping `*-v1` as the current product examples once V3 apps exist.

### Pillar 7: Package And External Consumer Proof

The package must work outside the monorepo.

Build and harden:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.build.json`
- `tools/finalize-dist/index.ts`
- `tools/package-install-smoke/index.ts`
- `tools/v3-package-smoke/index.ts`
- `tools/v3-external-consumer/index.ts`

Required package smoke cases:

- Fresh temp app imports `@galileo3d/engine`.
- Fresh temp app imports `@galileo3d/engine/rendering`.
- Fresh temp app imports `@galileo3d/engine/assets`.
- Fresh temp app imports `@galileo3d/engine/product-studio`.
- Fresh temp app imports `@galileo3d/engine/workflows`.
- Fresh temp app renders a canvas scene.
- Fresh temp app loads a product fixture.
- Fresh temp app captures a PNG.

### Pillar 8: Three.js Same-Scene Comparisons

Comparison must be local, reproducible, and honest.

Add:

- `benchmarks/v3/galileo/`
- `benchmarks/v3/threejs/`
- `benchmarks/v3/shared/`
- `benchmarks/v3/shared/scenes/product-scene.ts`
- `benchmarks/v3/shared/scenes/material-scene.ts`
- `benchmarks/v3/shared/scenes/asset-scene.ts`
- `benchmarks/v3/shared/scenes/interactive-scene.ts`
- `tools/v3-threejs-comparison/index.ts`
- `tests/browser/v3-threejs-comparison.spec.ts`

Required comparisons:

- Product scene.
- Material scene.
- glTF asset scene.
- Interactive scene.

Comparison report must include:

- G3D screenshot.
- Three.js screenshot.
- Diff image.
- Setup code line counts.
- Bundle size estimate.
- Runtime diagnostics.
- Feature comparison.
- Honest gap list.

The comparison must never say G3D is broadly superior unless the evidence proves it.

## V3 Milestones

V3 must be executed in order. Every milestone has build tasks first and tests second.

## Long-Running Execution Contract

V3 is a multi-pass platform build. It is expected to take many implementation turns.

The executor must work like this:

1. Read `docs/project/v3-roadmap-product-workflow-plan.md`.
2. Read `docs/project/v3-roadmap-progress.md` if it exists.
3. Find the first incomplete milestone.
4. Build the product files for that milestone.
5. Add tests only after product files exist.
6. Run the milestone exit command.
7. Fix product code until the command passes.
8. Update `docs/project/v3-roadmap-progress.md`.
9. Continue to the next milestone.
10. Do not stop unless blocked by a real missing decision or the user explicitly pauses.

When context is compacted, resume from `docs/project/v3-roadmap-progress.md` and the existing files. Do not infer that the work is complete because a previous assistant said one command passed.

Every progress update must distinguish:

- **Progress:** a milestone or subset passed.
- **Blocked:** a concrete dependency or decision prevents continuing.
- **Complete:** `pnpm v3:release` passed.

Do not use the word "complete" for anything except the final release gate.

## Required Progress File Format

Create and maintain `docs/project/v3-roadmap-progress.md` with this shape:

```md
# V3 Progress

Historical status: superseded by V9.
Current milestone: Milestone N - Name
Last verified command: `<command>`
Last verified at: `<ISO timestamp>`

## Completed Milestones

- [x] Milestone 0 - ...

## Active Milestone

- [ ] File/task
- [ ] File/task

## Next Milestone

- Milestone N+1 - ...

## Known Gaps

- Gap with file/report reference.

## Blocked Claims

- Unity replacement.
- Unreal replacement.
- Full Three.js replacement.
- Full glTF parity.
- Full WebGPU parity.
```

The progress file is not optional. It is how the next agent avoids restarting or pretending a slice is the whole product.

## Required Script Semantics

Every `v3:*` script must have a clear semantic purpose:

- `v3:truth`: claim guard and repo honesty.
- `v3:progress`: progress report freshness and milestone tracking.
- `v3:renderer`: renderer product capability.
- `v3:assets`: asset pipeline capability.
- `v3:workflows`: workflow SDK capability.
- `v3:apps`: real app suite capability.
- `v3:examples`: public example/tutorial capability.
- `v3:package`: external package consumer capability.
- `v3:compare-threejs`: same-scene comparison capability.
- `v3:docs`: public narrative and docs honesty.
- `v3:release`: all of the above.

No script may pass by only checking that files exist if the milestone requires behavior. File existence checks are allowed only as one part of a broader readiness tool.

## Minimum Artifact Matrix

V3 release must produce this artifact matrix:

| Area | Code | Test | Report | Screenshot/Artifact |
| --- | --- | --- | --- | --- |
| Renderer | `packages/rendering` | `tests/unit/rendering`, `tests/browser/v3-renderer-foundation.spec.ts` | `tests/reports/v3-renderer-readiness.json` | `tests/reports/v3-renderer-foundation/*.png` |
| Assets | `packages/assets` | `tests/assets`, `tests/browser/v3-asset-rendering.spec.ts` | `tests/reports/v3-assets-readiness.json` | `tests/reports/v3-assets/*.png` |
| Workflows | `packages/workflows` | `tests/unit/workflows` | `tests/reports/v3-workflows-readiness.json` | Workflow manifests |
| Apps | `apps/*-lab`, `apps/product-studio` | `tests/browser/v3-*.spec.ts` | `tests/reports/v3-app-suite.json` | App screenshots |
| Examples | `examples/*-v3` | `tests/browser/v3-examples.spec.ts` | `tests/reports/v3-examples-readiness.json` | Example screenshots |
| Package | `dist`, packed tarball | package smoke tools | `tests/reports/v3-package-smoke.json` | Temp app PNG |
| Three.js comparison | `benchmarks/v3` | `tests/browser/v3-threejs-comparison.spec.ts` | `tests/reports/v3-threejs-comparison.json` | G3D, Three.js, diff PNGs |
| Docs | `docs/project/v3-*-roadmap`, tutorials | docs readiness tool | `tests/reports/v3-docs-readiness.json` | Public docs |

If any row is missing, V3 is not done.

### Milestone 0: V3 Contract And Progress Tracking

Goal: create the long-running execution structure.

Create:

- [ ] `docs/project/v3-roadmap-product-workflow-plan.md`
- [ ] `docs/project/v3-roadmap-status.md`
- [ ] `docs/project/v3-roadmap-progress.md`
- [ ] `docs/project/v3-roadmap-blocked-claims.md`
- [ ] `tools/v3-truth/index.ts`
- [ ] `tools/v3-progress/index.ts`

Update:

- [ ] `package.json` scripts.

Add scripts:

- [ ] `v3:truth`
- [ ] `v3:progress`

Acceptance:

- [ ] The docs explicitly say G3D is not yet a Three.js replacement.
- [ ] The docs explicitly say V3 is not complete until all release gates pass.
- [ ] `tools/v3-truth/index.ts` fails if docs claim Unity/Unreal replacement or broad Three.js replacement before release gates.
- [ ] `tools/v3-progress/index.ts` writes `tests/reports/v3-progress.json`.

Exit command:

```sh
pnpm v3:truth && pnpm v3:progress
```

Do not stop after Milestone 0.

### Milestone 1: Public API Audit And Stabilization

Goal: identify the API surface that must be stable enough for a competitor SDK.

Create:

- [ ] `docs/project/v3-roadmap-public-api-map.md`
- [ ] `docs/project/v3-roadmap-api-stability.md`
- [ ] `tools/v3-api-audit/index.ts`
- [ ] `tests/unit/tools/v3-api-audit.test.ts`

Update:

- [ ] `packages/*/src/index.ts`
- [ ] `docs/api/public-api.md`

Acceptance:

- [ ] Every exported package has an intentional public API list.
- [ ] Internal-only exports are identified and either removed or documented as unstable.
- [ ] Import paths are consistent.
- [ ] Typecheck passes.
- [ ] API audit report exists.

Exit command:

```sh
pnpm typecheck && pnpm exec vitest run tests/unit/tools/v3-api-audit.test.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-api-audit/index.ts
```

Do not stop after Milestone 1.

### Milestone 2: Renderer Foundation

Goal: make the renderer reliable enough for multiple apps.

Build:

- [ ] `packages/rendering/src/Renderer.ts`
- [ ] `packages/rendering/src/RenderPipeline.ts`
- [ ] `packages/rendering/src/ForwardPass.ts`
- [ ] `packages/rendering/src/RenderGraph.ts`
- [ ] `packages/rendering/src/WebGL2Device.ts`
- [ ] `packages/rendering/src/Material.ts`
- [ ] `packages/rendering/src/PBRMaterial.ts`
- [ ] `packages/rendering/src/TexturedPBRMaterial.ts`
- [ ] `packages/rendering/src/NormalMappedPBRMaterial.ts`
- [ ] `packages/rendering/src/LightingDefaults.ts`
- [ ] `packages/rendering/src/ShadowMap.ts`
- [ ] `packages/rendering/src/PostProcessPass.ts`
- [ ] `packages/rendering/src/CameraFraming.ts`

Add tests:

- [ ] `tests/unit/rendering/v3-renderer-contract.test.ts`
- [ ] `tests/browser/v3-renderer-foundation.spec.ts`
- [ ] `tools/v3-renderer-readiness/index.ts`

Acceptance:

- [ ] WebGL2 render path works across resizing.
- [ ] PBR, textured PBR, normal mapped PBR, emissive, alpha, shadows, environment, and postprocess can coexist in one scene.
- [ ] Renderer diagnostics expose draw calls, buffers, shaders, render targets, textures, and last error.
- [ ] Browser test captures at least four renderer states.
- [ ] No debug panel screenshots count as renderer proof.

Exit command:

```sh
pnpm typecheck && pnpm exec vitest run tests/unit/rendering/v3-renderer-contract.test.ts && pnpm exec playwright test tests/browser/v3-renderer-foundation.spec.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-renderer-readiness/index.ts
```

Do not stop after Milestone 2.

### Milestone 3: Asset Pipeline Foundation

Goal: make asset loading a first-class product capability.

Build:

- [ ] `packages/assets/src/GLTFLoader.ts`
- [ ] `packages/assets/src/GLTFRenderResources.ts`
- [ ] `packages/assets/src/loadRenderableAsset.ts`
- [ ] `packages/assets/src/createRenderableScene.ts`
- [ ] `packages/assets/src/AssetRenderDefaults.ts`
- [ ] `packages/assets/src/AssetInspection.ts`
- [ ] `packages/assets/src/AssetCompatibility.ts`
- [ ] `packages/assets/src/AssetImportPreflight.ts`

Add fixtures:

- [ ] `fixtures/v3/assets/product-camera/`
- [ ] `fixtures/v3/assets/material-spheres/`
- [ ] `fixtures/v3/assets/animated-character/`
- [ ] `fixtures/v3/assets/variant-product/`
- [ ] `fixtures/v3/assets/compressed-product/`

Add tests:

- [ ] `tests/assets/v3-gltf-loader.test.ts`
- [ ] `tests/assets/v3-render-resources.test.ts`
- [ ] `tests/browser/v3-asset-rendering.spec.ts`
- [ ] `tools/v3-assets-readiness/index.ts`

Acceptance:

- [ ] Assets load from `.gltf`, `.glb`, data URI, and external buffer/image fixtures.
- [ ] Supported materials render without blank fallbacks.
- [ ] Unsupported features create warnings.
- [ ] Browser screenshots show actual assets.
- [ ] Report lists supported, partial, and blocked glTF features.

Exit command:

```sh
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/v3-gltf-loader.test.ts tests/assets/v3-render-resources.test.ts && pnpm exec playwright test tests/browser/v3-asset-rendering.spec.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-assets-readiness/index.ts
```

Do not stop after Milestone 3.

### Milestone 4: Workflow SDK Package

Goal: build high-level workflows that make G3D easier than raw Three.js for supported use cases.

Create:

- [ ] `packages/workflows/package.json`
- [ ] `packages/workflows/src/index.ts`
- [ ] `packages/workflows/src/WorkflowTypes.ts`
- [ ] `packages/workflows/src/WorkflowDiagnostics.ts`
- [ ] `packages/workflows/src/AssetViewerWorkflow.ts`
- [ ] `packages/workflows/src/ProductConfiguratorWorkflow.ts`
- [ ] `packages/workflows/src/MaterialStudioWorkflow.ts`
- [ ] `packages/workflows/src/SceneShowcaseWorkflow.ts`
- [ ] `packages/workflows/src/InteractiveSceneWorkflow.ts`

Update:

- [ ] `package.json` exports.
- [ ] `package.json` files list.
- [ ] `package.json` devDependencies.
- [ ] `tsconfig.base.json` paths.
- [ ] `tests/browser/example-dev-server.ts` package mapping.
- [ ] `vitest.config.ts` alias.
- [ ] `tests/assets/vitest.config.ts` alias.

Add tests:

- [ ] `tests/unit/workflows/asset-viewer-workflow.test.ts`
- [ ] `tests/unit/workflows/product-configurator-workflow.test.ts`
- [ ] `tests/unit/workflows/material-studio-workflow.test.ts`
- [ ] `tests/unit/workflows/scene-showcase-workflow.test.ts`
- [ ] `tests/unit/workflows/interactive-scene-workflow.test.ts`
- [ ] `tools/v3-workflows-readiness/index.ts`

Acceptance:

- [ ] Each workflow creates renderable output using public packages.
- [ ] Each workflow returns diagnostics.
- [ ] Each workflow has clear TypeScript types.
- [ ] No workflow imports app-only code.
- [ ] No workflow depends on tests.

Exit command:

```sh
pnpm typecheck && pnpm exec vitest run tests/unit/workflows && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-workflows-readiness/index.ts
```

Do not stop after Milestone 4.

### Milestone 5: Real App Suite

Goal: ship multiple app workflows that prove platform reuse.

Keep and improve:

- [ ] `apps/product-studio/index.html`
- [ ] `apps/product-studio/src/ProductStudioApp.ts`

Create:

- [ ] `apps/asset-lab/index.html`
- [ ] `apps/asset-lab/src/main.ts`
- [ ] `apps/asset-lab/src/AssetLabApp.ts`
- [ ] `apps/asset-lab/src/AssetLabState.ts`
- [ ] `apps/asset-lab/src/AssetLabViewport.ts`
- [ ] `apps/asset-lab/src/AssetLabControls.ts`
- [ ] `apps/material-lab/index.html`
- [ ] `apps/material-lab/src/main.ts`
- [ ] `apps/material-lab/src/MaterialLabApp.ts`
- [ ] `apps/material-lab/src/MaterialLabState.ts`
- [ ] `apps/material-lab/src/MaterialLabViewport.ts`
- [ ] `apps/material-lab/src/MaterialLabControls.ts`
- [ ] `apps/scene-lab/index.html`
- [ ] `apps/scene-lab/src/main.ts`
- [ ] `apps/scene-lab/src/SceneLabApp.ts`
- [ ] `apps/scene-lab/src/SceneLabState.ts`
- [ ] `apps/scene-lab/src/SceneLabViewport.ts`
- [ ] `apps/scene-lab/src/SceneLabControls.ts`
- [ ] `apps/game-lab/index.html`
- [ ] `apps/game-lab/src/main.ts`
- [ ] `apps/game-lab/src/GameLabApp.ts`
- [ ] `apps/game-lab/src/GameLabState.ts`
- [ ] `apps/game-lab/src/GameLabViewport.ts`
- [ ] `apps/game-lab/src/GameLabControls.ts`

Add browser tests:

- [ ] `tests/browser/v3-product-studio.spec.ts`
- [ ] `tests/browser/v3-asset-lab.spec.ts`
- [ ] `tests/browser/v3-material-lab.spec.ts`
- [ ] `tests/browser/v3-scene-lab.spec.ts`
- [ ] `tests/browser/v3-game-lab.spec.ts`
- [ ] `tools/v3-app-suite/index.ts`

Acceptance:

- [ ] Every app renders real 3D content.
- [ ] Every app has compact controls.
- [ ] Every app exposes stable browser state.
- [ ] Every app captures at least three meaningful PNGs.
- [ ] Every app uses public SDK/workflow APIs instead of private test-only construction.
- [ ] Product Studio remains compatible with V2 evidence.

Exit command:

```sh
pnpm exec playwright test tests/browser/v3-product-studio.spec.ts tests/browser/v3-asset-lab.spec.ts tests/browser/v3-material-lab.spec.ts tests/browser/v3-scene-lab.spec.ts tests/browser/v3-game-lab.spec.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-app-suite/index.ts
```

Do not stop after Milestone 5.

### Milestone 6: Example And Tutorial System

Goal: public examples become a real developer onboarding path.

Build:

- [ ] `examples/asset-viewer-v3/index.html`
- [ ] `examples/asset-viewer-v3/main.ts`
- [ ] `examples/asset-viewer-v3/README.md`
- [ ] `examples/material-studio-v3/index.html`
- [ ] `examples/material-studio-v3/main.ts`
- [ ] `examples/material-studio-v3/README.md`
- [ ] `examples/product-configurator-v3/index.html`
- [ ] `examples/product-configurator-v3/main.ts`
- [ ] `examples/product-configurator-v3/README.md`
- [ ] `examples/interactive-scene-v3/index.html`
- [ ] `examples/interactive-scene-v3/main.ts`
- [ ] `examples/interactive-scene-v3/README.md`
- [ ] `examples/game-slice-v3/index.html`
- [ ] `examples/game-slice-v3/main.ts`
- [ ] `examples/game-slice-v3/README.md`

Update:

- [ ] `examples/index.html`
- [ ] `docs/project/tutorials-basic-app.md`
- [ ] `docs/project/tutorials-asset-viewer.md`
- [ ] `docs/project/tutorials-product-configurator.md`
- [ ] `docs/project/tutorials-material-studio.md`
- [ ] `docs/project/tutorials-interactive-scene.md`

Add tests:

- [ ] `tests/browser/v3-examples.spec.ts`
- [ ] `tools/v3-examples-readiness/index.ts`

Acceptance:

- [ ] Examples use package/public APIs.
- [ ] Examples are visually credible.
- [ ] Examples have concise README usage.
- [ ] Example index only promotes current examples.
- [ ] Old failed V1 screenshots are not used as proof.

Exit command:

```sh
pnpm exec playwright test tests/browser/v3-examples.spec.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-examples-readiness/index.ts
```

Do not stop after Milestone 6.

### Milestone 7: External Package Consumer Proof

Goal: prove a developer can install and use G3D outside the monorepo.

Create:

- [ ] `tools/v3-package-smoke/index.ts`
- [ ] `tools/v3-external-consumer/index.ts`
- [ ] `tests/reports/v3-package-smoke.json`
- [ ] `tests/reports/v3-external-consumer.json`

Acceptance:

- [ ] `pnpm build` succeeds.
- [ ] A packed tarball installs into a temp app.
- [ ] Temp app imports root and subpath exports.
- [ ] Temp app renders one scene.
- [ ] Temp app loads one product/asset.
- [ ] Temp app captures one PNG.
- [ ] Temp app writes a manifest proving package import paths.

Exit command:

```sh
pnpm build && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-package-smoke/index.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-external-consumer/index.ts
```

Do not stop after Milestone 7.

### Milestone 8: Same-Scene Three.js Comparison

Goal: produce honest local evidence that G3D competes with Three.js for supported workflows.

Create:

- [ ] `benchmarks/v3/shared/scenes/product-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/material-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/asset-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/interactive-scene.ts`
- [ ] `benchmarks/v3/galileo/product-scene.ts`
- [ ] `benchmarks/v3/galileo/material-scene.ts`
- [ ] `benchmarks/v3/galileo/asset-scene.ts`
- [ ] `benchmarks/v3/galileo/interactive-scene.ts`
- [ ] `benchmarks/v3/threejs/product-scene.ts`
- [ ] `benchmarks/v3/threejs/material-scene.ts`
- [ ] `benchmarks/v3/threejs/asset-scene.ts`
- [ ] `benchmarks/v3/threejs/interactive-scene.ts`
- [ ] `tests/browser/v3-threejs-comparison.spec.ts`
- [ ] `tools/v3-threejs-comparison/index.ts`

Evidence outputs:

- [ ] `tests/reports/v3-threejs-comparison/product-g3d.png`
- [ ] `tests/reports/v3-threejs-comparison/product-threejs.png`
- [ ] `tests/reports/v3-threejs-comparison/product-diff.png`
- [ ] `tests/reports/v3-threejs-comparison/material-g3d.png`
- [ ] `tests/reports/v3-threejs-comparison/material-threejs.png`
- [ ] `tests/reports/v3-threejs-comparison/material-diff.png`
- [ ] `tests/reports/v3-threejs-comparison/asset-g3d.png`
- [ ] `tests/reports/v3-threejs-comparison/asset-threejs.png`
- [ ] `tests/reports/v3-threejs-comparison/asset-diff.png`
- [ ] `tests/reports/v3-threejs-comparison/interactive-g3d.png`
- [ ] `tests/reports/v3-threejs-comparison/interactive-threejs.png`
- [ ] `tests/reports/v3-threejs-comparison/interactive-diff.png`
- [ ] `tests/reports/v3-threejs-comparison.json`

Acceptance:

- [ ] Same scene intent is implemented in G3D and Three.js.
- [ ] G3D setup code is shorter or materially more ergonomic for at least three of four workflows.
- [ ] Visual output is comparable enough to be credible to a human.
- [ ] G3D report lists exact wins and exact gaps.
- [ ] No broad replacement claim is made unless Release Gate 2 passes.

Exit command:

```sh
pnpm exec playwright test tests/browser/v3-threejs-comparison.spec.ts && pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-threejs-comparison/index.ts
```

Do not stop after Milestone 8.

### Milestone 9: Documentation And Public Narrative

Goal: make the product understandable without inflated claims.

Create or update:

- [ ] `README.md`
- [ ] `docs/project/v3-roadmap-product-positioning.md`
- [ ] `docs/project/v3-roadmap-threejs-competitor-status.md`
- [ ] `docs/project/v3-roadmap-supported-workflows.md`
- [ ] `docs/project/v3-roadmap-known-gaps.md`
- [ ] `docs/api/public-api.md`
- [ ] `docs/project/tutorials-basic-app.md`
- [ ] `docs/project/tutorials-asset-viewer.md`
- [ ] `docs/project/tutorials-product-configurator.md`
- [ ] `docs/project/tutorials-material-studio.md`
- [ ] `docs/project/tutorials-interactive-scene.md`

Acceptance:

- [ ] Docs say G3D is a Three.js competitor for supported workflows only if comparison evidence exists.
- [ ] Docs do not claim Unity or Unreal replacement.
- [ ] Docs do not claim broad Three.js replacement unless release gates pass.
- [ ] Docs link to actual examples and apps.
- [ ] Docs include honest known gaps.

Exit command:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-docs-readiness/index.ts
```

Do not stop after Milestone 9.

### Milestone 10: Release Gates

Goal: decide whether the repo can honestly present G3D as a Three.js competitor.

Create:

- [ ] `tools/v3-release-readiness/index.ts`
- [ ] `tools/v3-completion-audit/index.ts`
- [ ] `tests/reports/v3-release-readiness.json`
- [ ] `tests/reports/v3-completion-audit.json`

Add scripts:

- [ ] `v3:renderer`
- [ ] `v3:assets`
- [ ] `v3:workflows`
- [ ] `v3:apps`
- [ ] `v3:examples`
- [ ] `v3:package`
- [ ] `v3:compare-threejs`
- [ ] `v3:docs`
- [ ] `v3:release`

`v3:release` must run:

```sh
pnpm v3:truth &&
pnpm v3:progress &&
pnpm typecheck &&
pnpm v3:renderer &&
pnpm v3:assets &&
pnpm v3:workflows &&
pnpm v3:apps &&
pnpm v3:examples &&
pnpm v3:package &&
pnpm v3:compare-threejs &&
pnpm v3:docs &&
pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-release-readiness/index.ts &&
pnpm exec tsx --tsconfig tsconfig.base.json tools/v3-completion-audit/index.ts
```

V3 is not complete until this command passes.

## Release Gate 1: Three.js Competitor Claim

Allowed claim:

**G3D is a Three.js competitor for supported web product, asset-viewer, material, scene, and lightweight interactive workflows.**

Required evidence:

- [ ] Renderer readiness passes.
- [ ] Asset readiness passes.
- [ ] Workflow SDK readiness passes.
- [ ] App suite readiness passes.
- [ ] Example readiness passes.
- [ ] Package smoke passes outside monorepo.
- [ ] Same-scene Three.js comparison exists.
- [ ] Docs list supported workflows and gaps.
- [ ] Human-inspectable screenshots exist for every workflow.

## Release Gate 2: Limited Three.js Replacement Claim

Allowed claim:

**G3D can replace Three.js for the supported workflows listed in `docs/project/v3-roadmap-supported-workflows.md`.**

Required evidence:

- [ ] All Release Gate 1 requirements pass.
- [ ] G3D setup code is shorter or more ergonomic in at least four same-scene comparisons.
- [ ] Package consumer app succeeds without monorepo aliases.
- [ ] Visual output is credible in product, asset, material, scene, and interactive workflows.
- [ ] Known gaps are explicit and do not invalidate the supported workflow claim.

Disallowed even after Release Gate 2:

- Unity replacement.
- Unreal replacement.
- Full game engine replacement.
- Full Three.js API replacement.
- Broad performance superiority.
- Full glTF parity.
- Full WebGPU parity.

## Filename Checklist By Area

This section exists so implementation cannot drift into vague work.

### New Docs

- [ ] `docs/project/v3-roadmap-product-workflow-plan.md`
- [ ] `docs/project/v3-roadmap-status.md`
- [ ] `docs/project/v3-roadmap-progress.md`
- [ ] `docs/project/v3-roadmap-blocked-claims.md`
- [ ] `docs/project/v3-roadmap-public-api-map.md`
- [ ] `docs/project/v3-roadmap-api-stability.md`
- [ ] `docs/project/v3-roadmap-product-positioning.md`
- [ ] `docs/project/v3-roadmap-threejs-competitor-status.md`
- [ ] `docs/project/v3-roadmap-supported-workflows.md`
- [ ] `docs/project/v3-roadmap-known-gaps.md`

### New Package

- [ ] `packages/workflows/package.json`
- [ ] `packages/workflows/src/index.ts`
- [ ] `packages/workflows/src/WorkflowTypes.ts`
- [ ] `packages/workflows/src/WorkflowDiagnostics.ts`
- [ ] `packages/workflows/src/AssetViewerWorkflow.ts`
- [ ] `packages/workflows/src/ProductConfiguratorWorkflow.ts`
- [ ] `packages/workflows/src/MaterialStudioWorkflow.ts`
- [ ] `packages/workflows/src/SceneShowcaseWorkflow.ts`
- [ ] `packages/workflows/src/InteractiveSceneWorkflow.ts`

### New Apps

- [ ] `apps/asset-lab/index.html`
- [ ] `apps/asset-lab/src/main.ts`
- [ ] `apps/asset-lab/src/AssetLabApp.ts`
- [ ] `apps/asset-lab/src/AssetLabState.ts`
- [ ] `apps/asset-lab/src/AssetLabViewport.ts`
- [ ] `apps/asset-lab/src/AssetLabControls.ts`
- [ ] `apps/material-lab/index.html`
- [ ] `apps/material-lab/src/main.ts`
- [ ] `apps/material-lab/src/MaterialLabApp.ts`
- [ ] `apps/material-lab/src/MaterialLabState.ts`
- [ ] `apps/material-lab/src/MaterialLabViewport.ts`
- [ ] `apps/material-lab/src/MaterialLabControls.ts`
- [ ] `apps/scene-lab/index.html`
- [ ] `apps/scene-lab/src/main.ts`
- [ ] `apps/scene-lab/src/SceneLabApp.ts`
- [ ] `apps/scene-lab/src/SceneLabState.ts`
- [ ] `apps/scene-lab/src/SceneLabViewport.ts`
- [ ] `apps/scene-lab/src/SceneLabControls.ts`
- [ ] `apps/game-lab/index.html`
- [ ] `apps/game-lab/src/main.ts`
- [ ] `apps/game-lab/src/GameLabApp.ts`
- [ ] `apps/game-lab/src/GameLabState.ts`
- [ ] `apps/game-lab/src/GameLabViewport.ts`
- [ ] `apps/game-lab/src/GameLabControls.ts`

### New Examples

- [ ] `examples/asset-viewer-v3/index.html`
- [ ] `examples/asset-viewer-v3/main.ts`
- [ ] `examples/asset-viewer-v3/README.md`
- [ ] `examples/material-studio-v3/index.html`
- [ ] `examples/material-studio-v3/main.ts`
- [ ] `examples/material-studio-v3/README.md`
- [ ] `examples/product-configurator-v3/index.html`
- [ ] `examples/product-configurator-v3/main.ts`
- [ ] `examples/product-configurator-v3/README.md`
- [ ] `examples/interactive-scene-v3/index.html`
- [ ] `examples/interactive-scene-v3/main.ts`
- [ ] `examples/interactive-scene-v3/README.md`
- [ ] `examples/game-slice-v3/index.html`
- [ ] `examples/game-slice-v3/main.ts`
- [ ] `examples/game-slice-v3/README.md`

### New Tools

- [ ] `tools/v3-truth/index.ts`
- [ ] `tools/v3-progress/index.ts`
- [ ] `tools/v3-api-audit/index.ts`
- [ ] `tools/v3-renderer-readiness/index.ts`
- [ ] `tools/v3-assets-readiness/index.ts`
- [ ] `tools/v3-workflows-readiness/index.ts`
- [ ] `tools/v3-app-suite/index.ts`
- [ ] `tools/v3-examples-readiness/index.ts`
- [ ] `tools/v3-package-smoke/index.ts`
- [ ] `tools/v3-external-consumer/index.ts`
- [ ] `tools/v3-threejs-comparison/index.ts`
- [ ] `tools/v3-docs-readiness/index.ts`
- [ ] `tools/v3-release-readiness/index.ts`
- [ ] `tools/v3-completion-audit/index.ts`

### New Browser Tests

- [ ] `tests/browser/v3-renderer-foundation.spec.ts`
- [ ] `tests/browser/v3-asset-rendering.spec.ts`
- [ ] `tests/browser/v3-product-studio.spec.ts`
- [ ] `tests/browser/v3-asset-lab.spec.ts`
- [ ] `tests/browser/v3-material-lab.spec.ts`
- [ ] `tests/browser/v3-scene-lab.spec.ts`
- [ ] `tests/browser/v3-game-lab.spec.ts`
- [ ] `tests/browser/v3-examples.spec.ts`
- [ ] `tests/browser/v3-threejs-comparison.spec.ts`

### New Unit And Asset Tests

- [ ] `tests/unit/tools/v3-api-audit.test.ts`
- [ ] `tests/unit/rendering/v3-renderer-contract.test.ts`
- [ ] `tests/assets/v3-gltf-loader.test.ts`
- [ ] `tests/assets/v3-render-resources.test.ts`
- [ ] `tests/unit/workflows/asset-viewer-workflow.test.ts`
- [ ] `tests/unit/workflows/product-configurator-workflow.test.ts`
- [ ] `tests/unit/workflows/material-studio-workflow.test.ts`
- [ ] `tests/unit/workflows/scene-showcase-workflow.test.ts`
- [ ] `tests/unit/workflows/interactive-scene-workflow.test.ts`

### New Benchmarks

- [ ] `benchmarks/v3/shared/scenes/product-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/material-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/asset-scene.ts`
- [ ] `benchmarks/v3/shared/scenes/interactive-scene.ts`
- [ ] `benchmarks/v3/galileo/product-scene.ts`
- [ ] `benchmarks/v3/galileo/material-scene.ts`
- [ ] `benchmarks/v3/galileo/asset-scene.ts`
- [ ] `benchmarks/v3/galileo/interactive-scene.ts`
- [ ] `benchmarks/v3/threejs/product-scene.ts`
- [ ] `benchmarks/v3/threejs/material-scene.ts`
- [ ] `benchmarks/v3/threejs/asset-scene.ts`
- [ ] `benchmarks/v3/threejs/interactive-scene.ts`

## Execution Rules For Agents

1. Start at the first unchecked milestone.
2. Build product code before tests and reports.
3. Do not delete unrelated dirty work.
4. Do not revert user changes.
5. Do not use old failed V1 screenshots as evidence.
6. Do not create proof panels as product screenshots.
7. Do not claim completion after a subcommand passes.
8. After a milestone passes, update `docs/project/v3-roadmap-progress.md`, then continue to the next milestone.
9. If a task fails because product code is weak, fix product code before loosening tests.
10. If a visual artifact looks bad to a human, treat it as failed even if metrics pass.
11. If an API cannot be used from a clean temp app, it is not public-product-ready.
12. If a claim is not backed by a report and a human-inspectable artifact, remove the claim.

## What Done Means

V3 is done only when:

- [ ] `pnpm v3:release` passes.
- [ ] Product apps exist and render credible outputs.
- [ ] Workflow SDK exists and is exported.
- [ ] Package consumer proof passes outside the monorepo.
- [ ] Same-scene Three.js comparisons exist.
- [ ] Docs honestly position G3D as a competitor for supported workflows.
- [ ] Release readiness report passes.
- [ ] Completion audit passes.

Anything less is progress, not completion.
