# G3D V4: Visual Quality, Real Assets, And Three.js-Level Product Depth

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V3 proved that G3D can wire together workflows, apps, examples, package smoke tests, and bounded Three.js comparisons.

That is not enough.

The screenshots still look like simple objects in test scenes. They do not prove high-end PBR, HDR, IBL, realistic materials, complex glTF scenes, production postprocess, or the visual quality people expect from serious Three.js work.

V4 exists to stop treating "objects render" as success.

V4 must turn G3D into a visually credible, production-shaped web 3D product that can compete with Three.js for quality across supported workflows.

## The Product We Are Actually Building In V4

Build:

**G3D Visual Engine V4: a high-quality browser 3D engine and workflow SDK for premium product visualization, asset review, material authoring, architecture/interior scenes, animated characters, and lightweight interactive scenes.**

This is not a wrapper around a few primitives.

This is not another test harness that draws spheres.

This is not a demo pack.

This is not an examples repo.

This is not "make prettier screenshots."

This is not a claim that G3D broadly replaces Three.js yet.

The V4 product must make a developer believe:

> "I can build serious browser 3D experiences with this without hand-writing the renderer stack that I usually assemble with Three.js."

## Real Product Contract

V4 must produce a developer-usable product.

That means the primary artifact is:

**A shipped SDK/runtime/toolchain that developers can install, import, learn, debug, and use to build production-shaped browser 3D applications.**

Apps, examples, screenshots, and benchmarks are proof artifacts. They are not the product.

The product must include:

- Stable public package exports from `@galileo3d/engine`.
- A high-level app runtime: `createG3DApp`.
- Workflow APIs for supported real use cases.
- Renderer quality presets that actually change rendering quality.
- Asset loading APIs that work outside the monorepo.
- A documented material and environment system.
- A real diagnostics surface for renderer, assets, materials, memory, and unsupported features.
- CLI or scaffold tooling so a developer can start a project without copying repo internals.
- Vite templates that build from a packed package.
- Versioned docs that explain supported workflows, limits, and upgrade path.
- External consumer tests that install the package into a fresh project and render flagship scenes.
- Same-scene Three.js comparisons that evaluate quality, setup complexity, and runtime behavior.

If a developer cannot install the package in a fresh app and build a premium product viewer without importing internal test code, V4 has failed.

## Demo Slice Is Not Completion

These do not count as product completion:

- A screenshot of a sphere grid.
- A single product viewer.
- A single app in `apps/`.
- A single example in `examples/`.
- A test-only browser harness.
- A JSON readiness file without a usable SDK path.
- A same-scene comparison that uses primitive approximations only.
- A local monorepo import that cannot work from a packed package.
- A UI shell around low-quality rendering.

Every V4 app and example must be backed by the installable SDK path. If the public package cannot reproduce the result, the app/example is invalid as product proof.

## Developer-Usable Product Requirements

V4 must make these developer workflows work end to end:

### Install And Start

A developer can run:

```sh
npm create g3d@latest my-product-viewer
cd my-product-viewer
npm install
npm run dev
```

Required files:

- `packages/create-g3d/package.json`
- `packages/create-g3d/src/index.ts`
- `templates/external-parity-product-viewer/`
- `templates/external-parity-material-studio/`
- `templates/external-parity-asset-gallery/`
- `templates/external-parity-interactive-scene/`
- `tools/external-parity-template-readiness/index.ts`

Acceptance:

- Templates install from the packed package.
- Templates do not use workspace aliases.
- Templates render real V4 flagship-quality scenes.
- Template screenshots are included in the V4 gallery.

### Build A Product Viewer

A developer can import:

```ts
import { createG3DApp, workflows } from "@galileo3d/engine";
```

Then load a GLB product, choose an HDR environment, enable contact shadows, expose variants, and export a screenshot with public APIs only.

Required public APIs:

- `createG3DApp`
- `workflows.productConfigurator`
- `loadAsset`
- `createEnvironment`
- `createMaterialVariantController`
- `captureScreenshot`
- `createDiagnosticsPanel`

### Debug A Real Asset

A developer can load a problematic glTF/GLB and see:

- unsupported extensions
- missing textures
- color-space warnings
- material fallback reasons
- decoder requirements
- memory usage
- draw-call count
- texture count
- animation/skin/morph support status

Required public APIs:

- `inspectAsset`
- `createAssetDiagnostics`
- `createRenderDiagnostics`
- `createCompatibilityReport`

### Ship The App

A developer can build with Vite and deploy static files.

Required proof:

- Fresh temp Vite app.
- Packed `@galileo3d/engine` install.
- Production build.
- Static preview smoke.
- Browser screenshot from the built app, not the dev server only.

Required files:

- `tools/external-parity-external-vite-build/index.ts`
- `tools/external-parity-static-preview-smoke/index.ts`

## Product Surface Areas

V4 must ship a coherent product surface, not only renderer internals.

Required packages:

- `packages/engine`: public app runtime and root API.
- `packages/rendering`: renderer, materials, lights, postprocess, diagnostics.
- `packages/assets`: loaders, corpus validation, diagnostics, asset compatibility.
- `packages/workflows`: product, material, asset, scene, character, interactive workflows.
- `packages/create-g3d`: project scaffolder.

Required apps:

- `apps/product-studio-pro`: product configurator for real product assets.
- `apps/material-studio-pro`: physical material authoring/review.
- `apps/asset-studio-pro`: glTF/GLB inspection and diagnostics.
- `apps/scene-studio-pro`: interior/architecture scene review.
- `apps/animation-studio-pro`: character/animation preview.
- `apps/interactive-showcase-pro`: interactive/realtime scene proof.

Required docs:

- API reference.
- Getting started.
- Product viewer guide.
- Material authoring guide.
- Asset pipeline guide.
- HDR/IBL guide.
- Three.js migration guide.
- Known gaps and unsupported features.
- Release notes.

Required developer tooling:

- create app command.
- template verification.
- package install smoke.
- static build smoke.
- visual gallery.
- diagnostics reports.

## Three.js Competitive Bar

Three.js is not just a renderer. Developers choose it because it has:

- stable APIs
- installable package
- extensive docs
- many examples
- loaders
- materials
- postprocessing
- controls
- ecosystem knowledge
- predictable deployment path

V4 must compete as a product by offering:

- fewer steps for supported high-value workflows
- better default product rendering
- built-in diagnostics
- built-in asset compatibility reporting
- built-in workflow presets
- built-in visual quality gates
- clear package/template path
- honest gaps

V4 does not win by copying every Three.js API. It wins only if supported workflows are easier, higher quality by default, and package-consumable.

## Why V4 Exists

V3 shipped the platform shape:

- Workflow package.
- App suite.
- V3 examples.
- External package consumer.
- Same-scene Three.js comparison.
- Release gate.

But the visual result is still not competitive enough.

Current visual failure modes:

- Scenes look procedural and simple.
- Materials do not read as physically premium.
- Lighting does not look like real HDR studio lighting.
- No convincing IBL/PMREM-quality environment pipeline is proven.
- No serious complex asset corpus is driving development.
- No product page, configurator, material studio, architecture scene, or character scene looks like a high-end Three.js showcase.
- Visual comparison reports prove setup ergonomics more than final quality.
- The app UI is more credible than the rendered content.

V4 must fix those exact issues.

## Non-Negotiable V4 Rule

V4 is not complete when a test passes.

V4 is complete only when:

1. G3D renders multiple complex, human-inspectable scenes that look premium.
2. Those scenes use real glTF/GLB assets, real texture maps, HDR/IBL lighting, shadows, and postprocess.
3. Same-scene Three.js comparisons exist for every flagship scene.
4. Visual quality audits compare screenshots, not just draw calls.
5. The public API lets a developer reproduce the result without internal test-only code.
6. `pnpm v4:release` passes.

Do not stop after one scene, one visual fix, one report, one app, one example, or one "looks better" screenshot.

## V4 Claim Boundary

Allowed target claim after V4 release gates pass:

**G3D is a high-quality Three.js competitor for supported product visualization, asset review, material authoring, architecture/interior, character preview, and lightweight interactive workflows.**

Blocked unless separately proven:

- Broad Three.js replacement.
- Full Three.js API replacement.
- Full Unity replacement.
- Full Unreal replacement.
- Full game engine replacement.
- Full glTF ecosystem parity.
- Full WebGPU parity.
- Broad performance superiority.
- Full commercial DCC pipeline parity.

V4 must be honest: compete where evidence exists, name gaps where evidence does not exist.

## What "Competitive With Three.js Quality" Means

V4 quality is not "has PBR class names."

V4 quality means these are visually true in screenshots:

- Metals reflect believable environments.
- Plastics, rubber, glass, fabric, brushed metal, ceramic, and emissive materials read differently.
- HDR environment lighting affects diffuse and specular response.
- Tone mapping and exposure make images look intentional, not washed out or dark.
- Shadows anchor objects with believable contact.
- Textures have visible detail, correct color-space handling, and correct roughness/normal behavior.
- Transparent/transmissive materials are handled honestly and documented.
- Complex glTF assets load with materials, textures, transforms, variants, cameras, lights, animations, and compressed resources where supported.
- Postprocess is tasteful and controlled, not decorative noise.
- App screenshots look like product screenshots, not renderer debug output.
- Three.js same-scene screenshots are close enough that the comparison is meaningful to a human.

## V4 Flagship Scenes

V4 must build these flagship scenes first. No release without them.

### 1. Premium Product Configurator

Scene target:

- A high-detail consumer product such as watch, headphones, camera, speaker, shoe, or furniture.
- Real glTF/GLB mesh hierarchy.
- Multiple material variants.
- Studio HDR environment.
- Contact shadows.
- Turntable camera.
- Configurator UI for color/material/lighting/camera.

Must prove:

- Asset-driven product, not procedural boxes.
- Product looks like a commercial catalog render.
- Same product rendered in G3D and Three.js.

Required files:

- `fixtures/v4/products/premium-product/`
- `apps/product-studio-pro/`
- `examples/external-product-configurator/`
- `benchmarks/external-parity/galileo/product-configurator.ts`
- `benchmarks/external-parity/threejs/product-configurator.ts`
- `tests/browser/external-parity-product-configurator.spec.ts`
- `tools/external-parity-product-readiness/index.ts`

### 2. Material Studio Pro

Scene target:

- A material ball/grid scene with high-quality samples:
  - chrome
  - brushed metal
  - gold
  - painted metal
  - matte plastic
  - glossy plastic
  - rubber
  - glass/transmission
  - clearcoat car paint
  - fabric/sheen
  - emissive material
  - textured ceramic/stone

Must prove:

- PBR response is visibly different by material.
- HDR/IBL affects specular and roughness correctly enough to be credible.
- Color management is consistent.
- Same material matrix exists in G3D and Three.js.

Required files:

- `fixtures/v4/materials/material-library.json`
- `fixtures/v4/materials/textures/`
- `apps/material-studio-pro/`
- `examples/external-material-studio/`
- `benchmarks/external-parity/galileo/material-studio.ts`
- `benchmarks/external-parity/threejs/material-studio.ts`
- `tests/browser/external-parity-material-studio.spec.ts`
- `tools/external-parity-material-readiness/index.ts`

### 3. HDR Interior / Architecture Scene

Scene target:

- Interior room, gallery, office, retail shelf, or architectural space.
- Multiple lights.
- Real texture maps.
- Global visual impression: spatial depth, believable exposure, shadows, surface variety.

Must prove:

- G3D can render more than isolated objects.
- Camera framing, tone mapping, shadows, and material response work in a multi-object environment.
- Same-scene comparison with Three.js exists.

Required files:

- `fixtures/v4/scenes/interior-gallery/`
- `apps/scene-studio-pro/`
- `examples/external-interior-scene/`
- `benchmarks/external-parity/galileo/interior-scene.ts`
- `benchmarks/external-parity/threejs/interior-scene.ts`
- `tests/browser/external-parity-interior-scene.spec.ts`
- `tools/external-parity-scene-readiness/index.ts`

### 4. Complex glTF Asset Review

Scene target:

- Multiple glTF/GLB assets from a licensed corpus.
- Must include:
  - embedded textures
  - external textures
  - GLB
  - Draco or Meshopt where available
  - KTX2/Basis where available
  - variants
  - animations
  - skinning/morph targets
  - alpha materials
  - normal/roughness/metallic/emissive maps

Must prove:

- Loader support is connected to renderer visual output.
- Asset diagnostics explain unsupported features.
- Screenshots show actual loaded assets, not fallback primitives.

Required files:

- `fixtures/v4/gltf-corpus/manifest.json`
- `apps/asset-studio-pro/`
- `examples/external-asset-gallery/`
- `tests/assets/external-parity-gltf-corpus.test.ts`
- `tests/browser/external-parity-gltf-visual-corpus.spec.ts`
- `tools/external-parity-gltf-corpus-readiness/index.ts`

### 5. Animated Character / Motion Preview

Scene target:

- Skinned or morph animated character/creature/avatar.
- Animation timeline.
- Lighting and material quality equivalent to asset viewer.
- Optional motion blur only if implemented honestly.

Must prove:

- Animation is not disconnected from visual quality.
- Skinned/morph assets render with correct transforms and materials.
- Timeline UI can scrub and play.

Required files:

- `fixtures/v4/characters/animated-character/`
- `apps/animation-studio-pro/`
- `examples/external-character-viewer/`
- `tests/browser/external-parity-character-viewer.spec.ts`
- `tools/external-parity-character-readiness/index.ts`

### 6. Lightweight Interactive Showcase

Scene target:

- A realtime interactive scene with camera controls, hover/select, object animation, and polished visuals.
- Must include one nontrivial interaction: selecting variants, dragging camera, triggering animation, or changing lighting.

Must prove:

- G3D can support interactive experiences, not only screenshots.
- The render loop remains stable under user interaction.
- Visual quality remains high while interactive.

Required files:

- `apps/interactive-showcase-pro/`
- `examples/external-interactive-showcase/`
- `tests/browser/external-parity-interactive-showcase.spec.ts`
- `tools/external-parity-interactive-readiness/index.ts`

## V4 Technical Pillars

### Pillar 1: Color Management And HDR Rendering

Build first. Do not build more scenes until this is credible.

Required capabilities:

- Explicit linear/sRGB texture policy.
- Linear lighting path.
- HDR render target path where supported.
- LDR fallback path with documented behavior.
- ACES or comparable filmic tone mapping.
- Exposure control.
- Output transform that is consistent across screenshots.
- Bloom that operates in the correct color space.
- Debug views:
  - base color
  - normal
  - roughness
  - metallic
  - emissive
  - lighting only
  - diffuse IBL
  - specular IBL
  - tone mapped output

Required files:

- `packages/rendering/src/ColorManagement.ts`
- `packages/rendering/src/HDRRenderPipeline.ts`
- `packages/rendering/src/ToneMapping.ts`
- `packages/rendering/src/Exposure.ts`
- `packages/rendering/src/RenderDebugViews.ts`
- `tests/unit/rendering/external-parity-color-management.test.ts`
- `tests/browser/external-parity-hdr-pipeline.spec.ts`
- `tools/external-parity-hdr-readiness/index.ts`

Acceptance:

- Screenshots prove dark, mid, and bright scenes are exposed correctly.
- HDR and LDR fallback are both documented.
- No material scene is accepted without color-space evidence.

### Pillar 2: Image-Based Lighting / Environment Pipeline

V4 cannot be visually credible without serious IBL.

Required capabilities:

- Load HDR/equirect environment images.
- Generate or load diffuse irradiance.
- Generate or load specular prefiltered environment mips.
- BRDF LUT integration.
- Environment rotation.
- Environment intensity.
- Background/environment separation.
- Studio environment presets:
  - softbox studio
  - warehouse
  - gallery
  - outdoor overcast
  - night neon

Required files:

- `packages/rendering/src/EnvironmentPipeline.ts`
- `packages/rendering/src/IBL.ts`
- `packages/rendering/src/PMREM.ts`
- `packages/rendering/src/BRDFLut.ts`
- `fixtures/v4/environments/manifest.json`
- `tests/unit/rendering/external-parity-ibl.test.ts`
- `tests/browser/external-parity-ibl-visual.spec.ts`
- `tools/external-parity-ibl-readiness/index.ts`

Acceptance:

- Rough metal sphere visibly changes with roughness under environment lighting.
- Chrome sphere reflects environment directionally.
- Matte object receives believable diffuse environment light.
- Same material under three environments produces distinct screenshots.

### Pillar 3: Production PBR Material System

Required material support:

- Metallic-roughness base.
- Normal maps with correct tangent space.
- Occlusion maps.
- Emissive maps and emissive strength.
- Alpha blend and alpha mask.
- Double-sided materials.
- Clearcoat.
- Sheen.
- Specular.
- Transmission.
- Volume/thickness where bounded.
- IOR.
- Anisotropy where bounded.
- Iridescence where bounded.
- Texture transforms.
- Multiple UV sets or a documented fallback.

Required files:

- `packages/rendering/src/materials/PhysicalMaterial.ts`
- `packages/rendering/src/materials/MaterialExtensions.ts`
- `packages/rendering/src/materials/AlphaSorting.ts`
- `packages/rendering/src/materials/TransmissionPass.ts`
- `tests/unit/rendering/external-parity-physical-material.test.ts`
- `tests/browser/external-parity-material-matrix.spec.ts`
- `tools/external-parity-pbr-readiness/index.ts`

Acceptance:

- Material matrix screenshot exists and passes quality thresholds.
- Same material matrix exists in Three.js and G3D.
- Unsupported material features produce explicit diagnostics, not silent wrong output.

### Pillar 4: Shadows And Scene Lighting

Required capabilities:

- Directional shadows.
- Spot shadows.
- Contact shadows.
- Cascaded shadow maps for larger scenes.
- Bias controls that are exposed but default sane.
- Soft shadow filtering.
- Shadow debug view.
- Lights imported from glTF where supported.

Required files:

- `packages/rendering/src/shadows/ContactShadows.ts`
- `packages/rendering/src/shadows/CascadedShadowPipeline.ts`
- `packages/rendering/src/shadows/ShadowDebugViews.ts`
- `tests/browser/external-parity-shadow-quality.spec.ts`
- `tools/external-parity-shadow-readiness/index.ts`

Acceptance:

- Product sits on a surface convincingly.
- Interior scene has believable object anchoring.
- Shadow acne/peter-panning is not obvious in release screenshots.

### Pillar 5: Postprocess Suite

Required effects:

- Tone mapping.
- Bloom.
- FXAA or SMAA.
- SSAO or GTAO.
- Depth of field for product hero shots.
- Vignette optional but not used to hide poor lighting.
- Color grading LUT or simple color grade controls.

Required files:

- `packages/rendering/src/postprocess/BloomPass.ts`
- `packages/rendering/src/postprocess/SSAOPass.ts`
- `packages/rendering/src/postprocess/DepthOfFieldPass.ts`
- `packages/rendering/src/postprocess/ColorGradingPass.ts`
- `tests/browser/external-parity-postprocess-suite.spec.ts`
- `tools/external-parity-postprocess-readiness/index.ts`

Acceptance:

- Postprocess improves scenes without hiding material failures.
- Every effect has off/on comparison screenshots.
- HDR pipeline works with postprocess.

### Pillar 6: glTF Production Corpus

Required asset support:

- GLTF and GLB.
- Embedded and external buffers.
- Embedded and external images.
- WebP texture extension where supported.
- KTX2/Basis texture path where supported.
- Draco decoder path.
- Meshopt decoder path.
- Material variants.
- Texture transforms.
- Node cameras.
- Punctual lights.
- Skins.
- Animations.
- Morph targets.
- Instancing where supported.
- Clear diagnostics for unsupported extensions.

Required files:

- `fixtures/v4/gltf-corpus/manifest.json`
- `fixtures/v4/gltf-corpus/licenses.md`
- `packages/assets/src/V4Corpus.ts`
- `tests/assets/external-parity-gltf-loader-corpus.test.ts`
- `tests/browser/external-parity-gltf-visual-corpus.spec.ts`
- `tools/external-parity-gltf-corpus-readiness/index.ts`

Acceptance:

- At least 25 assets in the V4 corpus.
- At least 12 assets have visual screenshot evidence.
- At least 5 assets include advanced material features.
- At least 3 assets include animation/skin/morph evidence.
- Every corpus asset has license/provenance metadata.

### Pillar 7: Renderer Performance And Complexity

Required capabilities:

- Frustum culling.
- Instancing.
- Texture/resource cache.
- Render-item sorting.
- Transparent sorting policy.
- Basic LOD support.
- Draw-call and GPU/CPU timing diagnostics where possible.
- Memory/texture budget diagnostics.

Required files:

- `packages/rendering/src/performance/RendererStats.ts`
- `packages/rendering/src/performance/ResourceBudget.ts`
- `packages/rendering/src/performance/RenderItemSorting.ts`
- `packages/rendering/src/performance/LOD.ts`
- `tests/browser/external-parity-large-scene.spec.ts`
- `tests/performance/external-parity-performance-baselines.ts`
- `tools/external-parity-performance-readiness/index.ts`

Acceptance:

- Large scene screenshot exists.
- Performance report includes object count, draw calls, frame time, texture memory estimate, and warnings.
- Three.js comparison exists for at least one large scene.

### Pillar 8: Public Product API

V4 must reduce setup complexity while preserving visual quality.

Target API:

```ts
import { createG3DApp, workflows } from "@galileo3d/engine";

const app = await createG3DApp({
  canvas,
  quality: "ultra",
  color: "managed",
  renderer: "webgl2",
  diagnostics: "developer"
});

const scene = await workflows.productConfigurator({
  asset: "/assets/watch.glb",
  environment: "studio-softbox",
  materials: "asset",
  shadows: "contact",
  postprocess: "catalog-hero"
});

app.setScene(scene);
app.start();
```

Required files:

- `packages/engine/src/G3DApp.ts`
- `packages/engine/src/G3DQualityPresets.ts`
- `packages/engine/src/index.ts`
- `packages/workflows/src/workflow-foundation/`
- `tests/unit/engine/external-parity-app-api.test.ts`
- `tests/browser/external-parity-public-api-app.spec.ts`
- `tools/external-parity-api-readiness/index.ts`

Acceptance:

- Public app API can render every flagship scene.
- Examples use public APIs only.
- No flagship app imports internal renderer test utilities.
- Public API has generated docs.
- Public API has stability labels: stable, experimental, internal.
- Public API has migration notes from V3 workflow APIs.
- Public API works from the packed package, not only TypeScript path aliases.

### Pillar 8A: Installable SDK, Scaffolder, Templates, And Static Deployment

V4 must behave like a product developers can start using.

Build:

- Root package exports for `@galileo3d/engine`.
- `packages/engine` as the primary public API surface.
- `packages/create-g3d` scaffolder.
- V4 templates for real app starts.
- Static production build smoke.
- External consumer smoke that renders a flagship scene from an installed tarball.

Required files:

- `packages/create-g3d/package.json`
- `packages/create-g3d/src/index.ts`
- `packages/create-g3d/templates/product-viewer/`
- `packages/create-g3d/templates/material-studio/`
- `packages/create-g3d/templates/asset-gallery/`
- `packages/create-g3d/templates/interactive-scene/`
- `templates/external-parity-product-viewer/`
- `templates/external-parity-material-studio/`
- `templates/external-parity-asset-gallery/`
- `templates/external-parity-interactive-scene/`
- `tools/external-parity-template-readiness/index.ts`
- `tools/external-parity-external-vite-build/index.ts`
- `tools/external-parity-static-preview-smoke/index.ts`

Acceptance:

- A fresh app installs the packed package.
- A fresh app imports `@galileo3d/engine`.
- A fresh app imports public subpaths only if they are documented.
- A fresh app builds with Vite.
- A fresh app renders a flagship scene after production build.
- A fresh app captures a screenshot from static preview.
- No template imports `packages/*/src`.
- No template imports test-only helpers.
- No template relies on monorepo fixtures unless copied into the template as public sample assets.

### Pillar 9: Pro Apps

V4 must ship apps that look like products.

Required apps:

- `apps/product-studio-pro`
- `apps/material-studio-pro`
- `apps/asset-studio-pro`
- `apps/scene-studio-pro`
- `apps/animation-studio-pro`
- `apps/interactive-showcase-pro`

Each app must include:

- Real canvas viewport.
- Asset/material/environment controls.
- Preset browser.
- Diagnostics panel.
- Screenshot/export action.
- Visual mode/debug mode switch.
- Responsive layout.
- Browser screenshot evidence.

Required tests:

- `tests/browser/external-parity-product-studio-pro.spec.ts`
- `tests/browser/external-parity-material-studio-pro.spec.ts`
- `tests/browser/external-parity-asset-studio-pro.spec.ts`
- `tests/browser/external-parity-scene-studio-pro.spec.ts`
- `tests/browser/external-parity-animation-studio-pro.spec.ts`
- `tests/browser/external-parity-interactive-showcase-pro.spec.ts`
- `tools/external-parity-app-suite-readiness/index.ts`

Acceptance:

- App screenshots are not just canvases. They must show a usable product UI.
- Every app renders a complex scene.
- Every app exposes runtime state for browser tests.

### Pillar 10: Examples And Tutorials That Teach Real Quality

Required examples:

- `examples/external-product-configurator`
- `examples/external-material-studio`
- `examples/external-asset-gallery`
- `examples/external-interior-scene`
- `examples/external-character-viewer`
- `examples/external-interactive-showcase`
- `examples/external-hdr-ibl`
- `examples/external-postprocess`

Required tutorials:

- `docs/project/tutorials-v4-hdr-ibl.md`
- `docs/project/tutorials-v4-product-configurator.md`
- `docs/project/tutorials-external-parity-material-studio.md`
- `docs/project/tutorials-external-parity-asset-gallery.md`
- `docs/project/tutorials-v4-interior-scene.md`
- `docs/project/tutorials-v4-character-viewer.md`
- `docs/project/tutorials-v4-performance.md`

Acceptance:

- Examples show premium scenes, not minimal smoke tests.
- Tutorials explain why color management, HDR, IBL, and PBR matter.
- Every example has a screenshot and readiness report.

### Pillar 11: Same-Scene Three.js Visual Parity

V4 must compare against real Three.js scenes honestly.

Required comparisons:

- Product configurator.
- Material studio.
- Interior scene.
- Asset gallery.
- Character viewer.
- Interactive showcase.
- Large scene/performance.

Required files:

- `benchmarks/external-parity/shared/`
- `benchmarks/external-parity/galileo/`
- `benchmarks/external-parity/threejs/`
- `tests/browser/external-parity-threejs-visual-parity.spec.ts`
- `tools/external-parity-threejs-visual-parity/index.ts`

Each comparison must report:

- G3D screenshot.
- Three.js screenshot.
- Diff image.
- Visual scoring metrics.
- Setup line count.
- Bundle estimate.
- Load time.
- Draw calls.
- Texture memory estimate.
- Feature coverage.
- Exact G3D wins.
- Exact Three.js wins.
- Exact G3D gaps.

Acceptance:

- At least 6 same-scene comparisons.
- G3D output is visually credible to a human.
- Any "G3D wins" claim names the exact dimension.
- No broad superiority wording.

### Pillar 12: Visual Quality Gates

V4 release requires visual gates, not just JSON gates.

Required files:

- `tools/external-parity-roadmap-visual-quality/index.ts`
- `tools/external-parity-screenshot-gallery/index.ts`
- `tests/reports/external-gallery/index.html`
- `tests/reports/external-parity-visual-quality.json`

Visual gate must check:

- Screenshot files exist.
- Screenshot file sizes exceed minimum thresholds.
- Non-dark pixel ratio.
- Color bucket count.
- Edge/detail density.
- Exposure histogram.
- No blank canvases.
- No single-object-only flagship scenes.
- Human-inspectable gallery exists.

Acceptance:

- The gallery is the first thing reviewers can open.
- The report says which screenshots are flagship proof and which are diagnostics.

## V4 Milestones

Execute milestones in order. Do not skip to app polish before visual foundations.

### Milestone 0: V4 Truth, Progress, And Failure Ledger

Create:

- `docs/project/v4-roadmap-status.md`
- `docs/project/v4-roadmap-progress.md`
- `docs/project/v4-roadmap-blocked-claims.md`
- `docs/project/v4-roadmap-visual-failures.md`
- `tools/external-parity-truth/index.ts`
- `tools/external-parity-progress/index.ts`

Acceptance:

- V4 states current V3 output is not visually competitive enough.
- Blocked claims remain blocked.
- Progress file names every milestone.
- Visual failures are tracked as first-class failures.

Exit:

```sh
pnpm v4:truth && pnpm v4:progress
```

### Milestone 1: Reference Assets, Environments, And Visual Targets

Create:

- `fixtures/v4/manifest.json`
- `fixtures/v4/environments/manifest.json`
- `fixtures/v4/products/manifest.json`
- `fixtures/v4/materials/manifest.json`
- `fixtures/v4/scenes/manifest.json`
- `fixtures/v4/characters/manifest.json`
- `docs/project/v4-roadmap-reference-visual-targets.md`
- `tools/external-parity-fixture-readiness/index.ts`

Requirements:

- Every asset has license/provenance metadata.
- Every flagship scene has a visual target description.
- No generated primitive-only scene can satisfy flagship proof.

Exit:

```sh
pnpm v4:fixtures
```

### Milestone 2: HDR, Color Management, And Tone Mapping

Build:

- Color management.
- HDR render pipeline.
- Tone mapping.
- Exposure.
- Debug views.

Tests:

- `tests/unit/rendering/external-parity-color-management.test.ts`
- `tests/browser/external-parity-hdr-pipeline.spec.ts`
- `tools/external-parity-hdr-readiness/index.ts`

Exit:

```sh
pnpm v4:hdr
```

### Milestone 3: IBL / Environment Pipeline

Build:

- HDR environment loading.
- Diffuse irradiance.
- Specular prefilter/PMREM path.
- BRDF LUT.
- Environment presets.

Tests:

- `tests/unit/rendering/external-parity-ibl.test.ts`
- `tests/browser/external-parity-ibl-visual.spec.ts`
- `tools/external-parity-ibl-readiness/index.ts`

Exit:

```sh
pnpm v4:ibl
```

### Milestone 4: Physical Material Matrix

Build:

- Physical material class.
- glTF material extension bindings.
- Material matrix scene.
- Same-scene Three.js material comparison.

Tests:

- `tests/unit/rendering/external-parity-physical-material.test.ts`
- `tests/browser/external-parity-material-matrix.spec.ts`
- `tools/external-parity-pbr-readiness/index.ts`

Exit:

```sh
pnpm v4:pbr
```

### Milestone 5: Shadows, AO, And Postprocess

Build:

- Contact shadows.
- Cascaded shadows where needed.
- SSAO/GTAO.
- Bloom.
- DOF.
- FXAA/SMAA.
- Color grading.

Tests:

- `tests/browser/external-parity-shadow-quality.spec.ts`
- `tests/browser/external-parity-postprocess-suite.spec.ts`
- `tools/external-parity-shadow-readiness/index.ts`
- `tools/external-parity-postprocess-readiness/index.ts`

Exit:

```sh
pnpm v4:lighting-post
```

### Milestone 6: Production glTF Corpus

Build:

- 25+ asset corpus.
- Visual corpus browser runner.
- Loader diagnostics.
- Compression and texture checks.

Tests:

- `tests/assets/external-parity-gltf-loader-corpus.test.ts`
- `tests/browser/external-parity-gltf-visual-corpus.spec.ts`
- `tools/external-parity-gltf-corpus-readiness/index.ts`

Exit:

```sh
pnpm v4:gltf
```

### Milestone 7: Flagship Product Configurator

Build:

- Premium product fixture.
- Product Studio Pro.
- Product Configurator V4 example.
- Three.js product comparison.

Tests:

- `tests/browser/external-parity-product-configurator.spec.ts`
- `tools/external-parity-product-readiness/index.ts`

Exit:

```sh
pnpm v4:product
```

### Milestone 8: Material Studio Pro

Build:

- Material Studio Pro.
- Material Studio V4 example.
- Material matrix visual comparison.

Tests:

- `tests/browser/external-parity-material-studio-pro.spec.ts`
- `tools/external-parity-material-studio-readiness/index.ts`

Exit:

```sh
pnpm v4:material-studio
```

### Milestone 9: Interior Scene / Scene Studio Pro

Build:

- Interior/gallery scene.
- Scene Studio Pro.
- Interior Scene V4 example.
- Three.js interior comparison.

Tests:

- `tests/browser/external-parity-interior-scene.spec.ts`
- `tools/external-parity-scene-readiness/index.ts`

Exit:

```sh
pnpm v4:scene
```

### Milestone 10: Asset Studio Pro

Build:

- Asset Studio Pro.
- Asset Gallery V4 example.
- Corpus browser UI.
- Asset diagnostics UI.

Tests:

- `tests/browser/external-parity-asset-studio-pro.spec.ts`
- `tools/external-parity-asset-studio-readiness/index.ts`

Exit:

```sh
pnpm v4:asset-studio
```

### Milestone 11: Character / Animation Studio Pro

Build:

- Character fixture.
- Animation Studio Pro.
- Timeline/scrub UI.
- Character Viewer V4 example.

Tests:

- `tests/browser/external-parity-character-viewer.spec.ts`
- `tools/external-parity-character-readiness/index.ts`

Exit:

```sh
pnpm v4:character
```

### Milestone 12: Interactive Showcase Pro

Build:

- Interactive showcase app.
- Interactive Showcase V4 example.
- Camera controls and selection/variant interaction.

Tests:

- `tests/browser/external-parity-interactive-showcase.spec.ts`
- `tools/external-parity-interactive-readiness/index.ts`

Exit:

```sh
pnpm v4:interactive
```

### Milestone 13: Public V4 App API

Build:

- `createG3DApp`.
- Quality presets.
- Workflow presets.
- Diagnostics.
- Public docs.

Tests:

- `tests/unit/engine/external-parity-app-api.test.ts`
- `tests/browser/external-parity-public-api-app.spec.ts`
- `tools/external-parity-api-readiness/index.ts`

Exit:

```sh
pnpm v4:api
```

### Milestone 14: Installable Product SDK And Templates

Build:

- `packages/engine` root product API.
- `packages/create-g3d` project scaffolder.
- V4 templates that render flagship-quality scenes.
- External Vite production build proof.
- Static preview proof.
- Template docs.

Tests:

- `tests/unit/engine/external-parity-public-api-stability.test.ts`
- `tests/integration/external-parity-create-g3d.test.ts`
- `tests/browser/external-parity-template-product-viewer.spec.ts`
- `tools/external-parity-template-readiness/index.ts`
- `tools/external-parity-external-vite-build/index.ts`
- `tools/external-parity-static-preview-smoke/index.ts`

Exit:

```sh
pnpm v4:templates
```

### Milestone 15: Same-Scene Three.js Visual Parity

Build:

- 6+ same-scene comparisons.
- Diff images.
- Visual scoring.
- Line counts.
- Runtime stats.
- Gap report.

Tests:

- `tests/browser/external-parity-threejs-visual-parity.spec.ts`
- `tools/external-parity-threejs-visual-parity/index.ts`

Exit:

```sh
pnpm v4:compare-threejs
```

### Milestone 16: Examples, Tutorials, And Gallery

Build:

- V4 examples.
- V4 tutorials.
- Screenshot gallery.
- Visual QA report.

Tests:

- `tests/browser/external-parity-examples.spec.ts`
- `tools/external-parity-examples-readiness/index.ts`
- `tools/external-parity-screenshot-gallery/index.ts`
- `tools/external-parity-roadmap-visual-quality/index.ts`

Exit:

```sh
pnpm v4:examples
```

### Milestone 17: Package And External Consumer Proof

Build:

- Package smoke.
- External Vite app.
- External app renders flagship scene.
- External app loads asset.
- External app captures screenshot.
- External app runs from production build/static preview.
- External app imports only public package APIs.

Tests:

- `tools/external-parity-package-smoke/index.ts`
- `tools/external-parity-external-consumer/index.ts`
- `tools/external-parity-external-vite-build/index.ts`
- `tools/external-parity-static-preview-smoke/index.ts`

Exit:

```sh
pnpm v4:package
```

### Milestone 18: Documentation And Claim Registry

Build:

- `docs/project/v4-roadmap-product-positioning.md`
- `docs/project/external-parity-roadmap-visual-quality-status.md`
- `docs/project/v4-roadmap-threejs-parity-status.md`
- `docs/project/v4-roadmap-supported-workflows.md`
- `docs/project/v4-roadmap-known-gaps.md`
- README update.

Tests:

- `tools/external-parity-docs-readiness/index.ts`

Exit:

```sh
pnpm v4:docs
```

### Milestone 19: Release Readiness

Build:

- `tools/external-parity-release-readiness/index.ts`
- `tools/external-parity-roadmap-completion-audit/index.ts`
- `v4:release`

Release command must run:

```sh
pnpm v4:truth &&
pnpm v4:progress &&
pnpm typecheck &&
pnpm v4:fixtures &&
pnpm v4:hdr &&
pnpm v4:ibl &&
pnpm v4:pbr &&
pnpm v4:lighting-post &&
pnpm v4:performance &&
pnpm v4:gltf &&
pnpm v4:product &&
pnpm v4:material-studio &&
pnpm v4:scene &&
pnpm v4:asset-studio &&
pnpm v4:character &&
pnpm v4:interactive &&
pnpm v4:app-suite &&
pnpm v4:api &&
pnpm v4:templates &&
pnpm v4:compare-threejs &&
pnpm v4:examples &&
pnpm v4:package &&
pnpm v4:docs &&
pnpm exec tsx --tsconfig tsconfig.base.json tools/external-parity-release-readiness/index.ts &&
pnpm exec tsx --tsconfig tsconfig.base.json tools/external-parity-roadmap-completion-audit/index.ts
```

V4 is not complete until this command passes.

## V4 Readiness Reports

Required reports:

- `tests/reports/external-parity-truth.json`
- `tests/reports/external-parity-progress.json`
- `tests/reports/external-parity-fixture-readiness.json`
- `tests/reports/external-parity-hdr-readiness.json`
- `tests/reports/external-parity-ibl-readiness.json`
- `tests/reports/external-parity-pbr-readiness.json`
- `tests/reports/external-parity-shadow-readiness.json`
- `tests/reports/external-parity-postprocess-readiness.json`
- `tests/reports/external-parity-performance-readiness.json`
- `tests/reports/external-parity-gltf-corpus-readiness.json`
- `tests/reports/external-parity-product-readiness.json`
- `tests/reports/external-parity-material-studio-readiness.json`
- `tests/reports/external-parity-scene-readiness.json`
- `tests/reports/external-parity-asset-studio-readiness.json`
- `tests/reports/external-parity-character-readiness.json`
- `tests/reports/external-parity-interactive-readiness.json`
- `tests/reports/external-parity-app-suite-readiness.json`
- `tests/reports/external-parity-api-readiness.json`
- `tests/reports/external-parity-template-readiness.json`
- `tests/reports/external-parity-external-vite-build.json`
- `tests/reports/external-parity-static-preview-smoke.json`
- `tests/reports/external-parity-threejs-visual-parity.json`
- `tests/reports/external-parity-examples-readiness.json`
- `tests/reports/external-parity-visual-quality.json`
- `tests/reports/external-parity-package-smoke.json`
- `tests/reports/external-parity-external-consumer.json`
- `tests/reports/external-parity-docs-readiness.json`
- `tests/reports/external-parity-release-readiness.json`
- `tests/reports/external-parity-completion-audit.json`

## V4 Screenshot Proof

Required screenshot groups:

- `tests/reports/external-gallery/product/`
- `tests/reports/external-gallery/materials/`
- `tests/reports/external-gallery/interior/`
- `tests/reports/external-gallery/assets/`
- `tests/reports/external-gallery/character/`
- `tests/reports/external-gallery/interactive/`
- `tests/reports/external-gallery/threejs-comparison/`
- `tests/reports/external-gallery/debug-views/`
- `tests/reports/external-gallery/postprocess/`

Every flagship screenshot must include:

- scene id
- app/example id
- renderer backend
- resolution
- environment preset
- material mode
- draw calls
- asset count
- warnings
- source file path

## V4 Human Review Requirement

Automated visual checks are not enough.

Before release, create:

- `docs/project/v4-roadmap-human-visual-review.md`

It must list every flagship screenshot and answer:

- Does this look like a premium browser 3D product?
- Is the lighting believable?
- Are materials distinguishable?
- Are shadows credible?
- Does it look competitive with the Three.js reference?
- What still looks bad?

If any flagship scene still looks like primitive test output, V4 is not complete.

## Immediate First Tasks For An Agent

Do this first, in order:

1. Create `docs/project/v4-roadmap-status.md`.
2. Create `docs/project/v4-roadmap-progress.md`.
3. Create `docs/project/v4-roadmap-visual-failures.md` with the current V3 screenshot failures explicitly named.
4. Create `docs/project/v4-roadmap-blocked-claims.md`.
5. Create `tools/external-parity-truth/index.ts`.
6. Create `tools/external-parity-progress/index.ts`.
7. Add `v4:truth` and `v4:progress` scripts.
8. Create fixture manifests for environments/products/materials/scenes/characters.
9. Choose real licensed reference assets.
10. Build HDR/color management before building more apps.

Do not start by making another simple app.

Do not start by adding another screenshot test around primitive shapes.

Do not claim progress until the visual foundation is materially better.

## Definition Of Done

V4 is done only when:

- All 19 milestones pass.
- `pnpm v4:release` passes.
- `npm create g3d@latest` or the repo-local equivalent creates a real V4 app.
- A fresh external app installs the packed package, builds for production, serves static output, renders a flagship scene, and captures a screenshot.
- Screenshot gallery exists and is human-inspectable.
- Product, material, interior, asset, character, and interactive scenes look visually credible.
- Same-scene Three.js comparisons exist and are honest.
- Docs claim only supported-workflow competitiveness.
- Known gaps remain visible.

Anything less is partial progress, not completion.
