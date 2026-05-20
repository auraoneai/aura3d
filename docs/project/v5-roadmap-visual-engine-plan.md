# G3D V5: Visually Undeniable Three.js Competitor And Broad Replacement Track

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 produced a bounded V4 SDK/product suite:

- installable `@galileo3d/engine`
- public `createG3DApp`
- workflow APIs
- four V4 templates
- six Pro app surfaces
- HDR/IBL/PBR/shadow/postprocess proof
- glTF corpus proof
- performance proof
- same-scene Three.js comparisons
- external consumer/package proof

That is not enough for V5.

V5 exists to turn G3D from a bounded workflow SDK into a visually undeniable, developer-credible, broad Three.js replacement track.

This must not become another short loop of demos, screenshots, and readiness files. V5 must build real engine surface area, real assets, real docs, real compatibility, real visual depth, and real developer ergonomics.

## Product We Are Actually Building In V5

Build:

**G3D Visual Engine V5: a high-end browser 3D engine, workflow SDK, and Three.js-compatible migration platform for product visualization, architecture/interiors, asset inspection, character/animation, interactive scenes, large scenes, postprocessing, particles, controls, loaders, and developer-authored custom scenes.**

The V5 product must make a serious Three.js developer believe:

> "I can build most production browser 3D work here, get better batteries-included workflows, and migrate meaningful Three.js projects without losing visual quality or control."

V5 is not complete until both are true:

1. It is visually strong enough that flagship screenshots do not look like test output.
2. It is broad enough that a developer can replace a meaningful set of Three.js APIs, loaders, materials, controls, examples, and workflows without falling back to internal repo code.

## Hard Claim Boundary

V5 is allowed to claim:

> "G3D V5 is a broad Three.js replacement for the documented compatibility surface and supported production workflows."

V5 is not allowed to claim:

- full Three.js API parity
- full ecosystem replacement
- full WebGPU parity
- Unity replacement
- Unreal replacement
- every loader/format replacement
- every shader/material/plugin replacement
- every Three.js example replacement

The broad replacement claim must be backed by a generated compatibility matrix, migration guide, example parity suite, visual parity suite, package proof, docs, and external consumer proof.

If a feature is not implemented and verified, it must remain listed in V5 known gaps. Do not hide gaps to make the release pass.

## Non-Negotiable Completion Rules

V5 must not stop at a demo slice.

These do not count as completion:

- one new good screenshot
- one prettier product viewer
- a single new loader
- a material grid with procedural placeholders only
- a few static examples
- a wrapper that only re-exports old V4 APIs
- a fake Three.js compatibility namespace
- generated reports without real browser/package/external proof
- tests that only check files exist
- examples that import monorepo internals
- any claim that says "broad Three.js replacement" without a measured API/example/migration compatibility matrix

Every milestone must have:

- exact implementation files
- browser proof where visual or interaction behavior matters
- external packed-package proof where developer use matters
- screenshot or video artifact where visual quality matters
- documentation explaining developer use and limits
- readiness tool that fails on missing behavior, not just missing files

## Legacy Prune Contract

V5 must also prove that obsolete legacy files removed during the EngineReadiness, V2, V3, and V4 cleanup stay deleted.

The goal is not to preserve old demo clutter. The goal is to keep only product-grade V5 surfaces, supported V4 evidence that is still intentionally referenced, and current compatibility artifacts.

If a legacy path was pruned because it was a weak demo, duplicate shell, obsolete example, stale screenshot, or pre-product artifact, V5 must keep it deleted unless there is an explicit migration entry that replaces it with a V5 product-grade equivalent.

Required files:

- `docs/project/v5-roadmap-legacy-prune-ledger.md`
- `tools/v5-legacy-prune-readiness/index.ts`
- `tests/reports/v5-legacy-prune-readiness.json`

Required package script:

- `v5:legacy-prune`

Required ledger sections:

- `docs/project/v4-engine-readiness-plan.md legacy deletions`
- `docs/project/v2-roadmap-product-asset-pipeline-plan.md legacy deletions`
- `docs/project/v3-roadmap-product-workflow-plan.md legacy deletions`
- `docs/project/v4-roadmap-visual-engine-plan.md legacy deletions`
- `V5 replacement path`
- `Deletion reason`
- `Allowed to return: yes/no`
- `Replacement evidence`

Current known pruned legacy paths that must stay deleted unless the ledger explicitly approves a V5 replacement:

- `examples/architecture-viewer/`
- `examples/game-slice/`
- `examples/portfolio/`
- `examples/postprocess-lab/`
- `examples/product-configurator/`
- `examples/shadow-lab/`
- `examples/portfolio/screenshots/animation-state-machine.png`
- `examples/portfolio/screenshots/architecture-viewer.png`
- `examples/portfolio/screenshots/asset-viewer.png`
- `examples/portfolio/screenshots/editor-authored-project.png`
- `examples/portfolio/screenshots/game-slice.png`
- `examples/portfolio/screenshots/pbr-camera-comparison.png`
- `examples/portfolio/screenshots/pbr-material-lab.png`
- `examples/portfolio/screenshots/physics-sandbox.png`
- `examples/portfolio/screenshots/postprocess-lab.png`
- `examples/portfolio/screenshots/product-configurator.png`
- `examples/portfolio/screenshots/rendering-large-scene.png`
- `examples/portfolio/screenshots/shadow-lab.png`
- `examples/portfolio/screenshots/showcase-world.png`

V5 may keep current V4 artifacts only when they are explicitly used as:

- baseline evidence
- comparison evidence
- migration inputs
- regression fixtures
- proof that V5 improved over V4

V5 must not keep obsolete files just because tests still point at them. If a deleted legacy file is needed by a test, update the test to use a V5 replacement or record the reason in the legacy prune ledger.

Acceptance:

- `tools/v5-legacy-prune-readiness/index.ts` fails if any path listed as `Allowed to return: no` exists.
- The readiness report lists every pruned path, existence state, deletion reason, and V5 replacement if one exists.
- The tool fails if a legacy directory returns with only an `index.html`, `main.ts`, or screenshot and no product-grade V5 replacement evidence.
- The tool fails if `examples/portfolio/` or old one-off demo folders are recreated as release proof.
- The tool allows V4 evidence paths only when the ledger says they are retained for comparison or migration.
- Release readiness includes the legacy prune report.
- Completion audit fails if the legacy prune report is missing or failing.

Exit command:

```sh
pnpm v5:legacy-prune
```

## Three.js Baseline

V5 targets the repo's installed Three.js compatibility baseline:

- package baseline: `three` from root `package.json`
- current local baseline at plan creation: `^0.165.0`

If the implementer updates Three.js, they must regenerate the inventory and compatibility reports before doing implementation work.

Required files:

- `docs/project/v5-roadmap-threejs-baseline.md`
- `tools/v5-threejs-inventory/index.ts`
- `tests/reports/v5-threejs-inventory.json`
- `tests/reports/v5-threejs-compatibility-matrix.json`

Acceptance:

- Inventory reads installed Three.js package metadata.
- Inventory lists Three.js public export categories: core, math, cameras, lights, materials, geometries, textures, loaders, controls, postprocessing, animation, helpers, renderers, WebXR, examples.
- Compatibility matrix marks every entry as `supported`, `partial`, `planned`, `blocked`, or `out-of-scope`.
- No broad replacement claim can pass unless supported + partial coverage meets the release threshold defined in Milestone 20.

## V5 Product Pillars

V5 must build all of these, not one or two:

- high-end visuals
- real asset library
- real HDR environment library
- real PBR material library
- renderer feature breadth
- Three.js API compatibility layer
- loader ecosystem
- controls/interactions
- animation/skinning/morphs
- postprocess/composer/shader workflows
- scene graph/object model breadth
- performance and large-scene scale
- developer docs/examples/tutorials
- migration tooling
- external package and deployment proof

## Required Package Surface

Required packages:

- `packages/engine`: public root SDK and app runtime.
- `packages/rendering`: renderer, render targets, materials, lighting, shadows, postprocess, shader authoring, diagnostics.
- `packages/assets`: loaders, decoders, asset pipeline, compatibility reports.
- `packages/workflows`: high-level production workflows.
- `packages/three-compat`: Three.js compatibility layer and migration adapters.
- `packages/materials`: V5 PBR material library and material authoring APIs.
- `packages/environments`: HDR environment registry, PMREM/IBL presets, provenance metadata.
- `packages/controls`: camera, pointer, transform, drag, orbit, fly, first-person, trackball, map controls.
- `packages/create-g3d`: project scaffolder.

Required root exports:

- `@galileo3d/engine`
- `@galileo3d/engine/rendering`
- `@galileo3d/engine/assets`
- `@galileo3d/engine/workflows`
- `@galileo3d/engine/materials`
- `@galileo3d/engine/environments`
- `@galileo3d/engine/controls`
- `@galileo3d/engine/three-compat`

Required package files:

- `packages/three-compat/package.json`
- `packages/three-compat/src/index.ts`
- `packages/materials/package.json`
- `packages/materials/src/index.ts`
- `packages/environments/package.json`
- `packages/environments/src/index.ts`
- `packages/controls/package.json`
- `packages/controls/src/index.ts`
- `tools/v5-package-surface-readiness/index.ts`

Acceptance:

- All packages build.
- Root package exports all V5 public subpaths.
- Public API docs include every V5 package.
- External packed-package smoke imports every V5 subpath.
- No V5 example imports internal package source paths.

## Required Apps

V5 must ship product-grade app surfaces, not test harnesses:

- `apps/v5-product-studio-pro`
- `apps/v5-material-studio-pro`
- `apps/v5-asset-studio-pro`
- `apps/v5-scene-studio-pro`
- `apps/v5-animation-studio-pro`
- `apps/v5-postprocess-studio-pro`
- `apps/v5-shader-lab-pro`
- `apps/v5-threejs-migration-lab`
- `apps/v5-large-scene-lab`
- `apps/v5-controls-lab`

Required app readiness:

- `tests/browser/v5-product-studio-pro.spec.ts`
- `tests/browser/v5-material-studio-pro.spec.ts`
- `tests/browser/v5-asset-studio-pro.spec.ts`
- `tests/browser/v5-scene-studio-pro.spec.ts`
- `tests/browser/v5-animation-studio-pro.spec.ts`
- `tests/browser/v5-postprocess-studio-pro.spec.ts`
- `tests/browser/v5-shader-lab-pro.spec.ts`
- `tests/browser/v5-threejs-migration-lab.spec.ts`
- `tests/browser/v5-large-scene-lab.spec.ts`
- `tests/browser/v5-controls-lab.spec.ts`
- `tools/v5-app-suite-readiness/index.ts`

Acceptance:

- Every app renders from public V5 APIs.
- Every app has a browser screenshot.
- Every app has runtime state JSON with app id, scene id, renderer backend, asset count, draw calls, frame time, warnings, source file path.
- Every app has at least one real user workflow interaction tested in browser.
- No app is a static screenshot shell.

## Required Templates

V5 must let developers start real projects:

- `templates/v5-premium-product-viewer/`
- `templates/v5-architecture-interior/`
- `templates/v5-material-authoring/`
- `templates/v5-asset-inspector/`
- `templates/v5-character-viewer/`
- `templates/v5-postprocess-scene/`
- `templates/v5-custom-threejs-migration/`
- `templates/v5-large-scene/`

Create-g3d template mirrors:

- `packages/create-g3d/templates/v5-premium-product-viewer/`
- `packages/create-g3d/templates/v5-architecture-interior/`
- `packages/create-g3d/templates/v5-material-authoring/`
- `packages/create-g3d/templates/v5-asset-inspector/`
- `packages/create-g3d/templates/v5-character-viewer/`
- `packages/create-g3d/templates/v5-postprocess-scene/`
- `packages/create-g3d/templates/v5-custom-threejs-migration/`
- `packages/create-g3d/templates/v5-large-scene/`

Required tests/tools:

- `tests/integration/v5-create-g3d.test.ts`
- `tests/browser/v5-templates.spec.ts`
- `tools/v5-template-readiness/index.ts`
- `tools/v5-external-vite-build/index.ts`
- `tools/v5-static-preview-smoke/index.ts`

Acceptance:

- Every template installs from a packed package.
- Every template builds with Vite in a temp app.
- Every template static preview serves a non-empty browser screenshot.
- Every template includes real assets or copied public sample assets.
- No template imports monorepo-only fixtures.
- No template uses `workspace:*`.

## Required Docs

Required docs:

- `docs/project/v5-roadmap-status.md`
- `docs/project/v5-roadmap-progress.md`
- `docs/project/v5-roadmap-visual-targets.md`
- `docs/project/v5-roadmap-asset-library.md`
- `docs/project/v5-roadmap-environment-library.md`
- `docs/project/v5-roadmap-materials-guide.md`
- `docs/project/v5-roadmap-threejs-baseline.md`
- `docs/project/v5-roadmap-threejs-compatibility-matrix.md`
- `docs/project/v5-roadmap-threejs-migration-guide.md`
- `docs/project/v5-roadmap-api-reference.md`
- `docs/project/v5-roadmap-getting-started.md`
- `docs/project/v5-roadmap-product-viewer-guide.md`
- `docs/project/v5-roadmap-architecture-guide.md`
- `docs/project/v5-roadmap-material-authoring-guide.md`
- `docs/project/v5-roadmap-asset-pipeline-guide.md`
- `docs/project/v5-roadmap-animation-guide.md`
- `docs/project/v5-roadmap-postprocess-guide.md`
- `docs/project/v5-roadmap-shader-authoring-guide.md`
- `docs/project/v5-roadmap-controls-guide.md`
- `docs/project/v5-roadmap-performance-guide.md`
- `docs/project/v5-roadmap-known-gaps.md`
- `docs/project/v5-roadmap-blocked-claims.md`
- `docs/project/v5-roadmap-release-notes.md`
- `docs/project/v5-roadmap-human-visual-review.md`

Required tools:

- `tools/v5-docs-readiness/index.ts`
- `tools/v5-claim-registry/index.ts`

Acceptance:

- Docs explain how to build real apps, not just how tests work.
- Every guide contains runnable code using public package imports.
- Migration guide maps Three.js APIs to G3D APIs.
- Known gaps and blocked claims stay visible.
- Docs cite current report paths and screenshots.

## V5 Flagship Visual Bar

V5 visual quality must exceed V4 by a clear margin.

Required flagship scenes:

1. Premium watch/product configurator.
2. Automotive configurator with paint, glass, metal, emissive details.
3. Architecture/interior daylight scene.
4. Architecture/interior night/emissive scene.
5. Material studio with scanned material maps.
6. Asset inspector with complex glTF samples.
7. Character/animation scene with skinning, morphs, and shadows.
8. Postprocess cinematic scene.
9. Particle/VFX scene.
10. Large instanced city/product-catalog scene.
11. Shader/material authoring scene.
12. Three.js migrated custom scene.

Required screenshot groups:

- `tests/reports/v5-gallery/product/`
- `tests/reports/v5-gallery/automotive/`
- `tests/reports/v5-gallery/architecture-day/`
- `tests/reports/v5-gallery/architecture-night/`
- `tests/reports/v5-gallery/materials/`
- `tests/reports/v5-gallery/assets/`
- `tests/reports/v5-gallery/character/`
- `tests/reports/v5-gallery/postprocess/`
- `tests/reports/v5-gallery/vfx/`
- `tests/reports/v5-gallery/large-scene/`
- `tests/reports/v5-gallery/shader-lab/`
- `tests/reports/v5-gallery/threejs-migration/`
- `tests/reports/v5-gallery/threejs-comparison/`
- `tests/reports/v5-gallery/debug-views/`

Every screenshot manifest entry must include:

- scene id
- app/example id
- renderer backend
- resolution
- environment preset
- material mode
- draw calls
- triangle count
- texture count
- texture memory estimate
- asset count
- light count
- postprocess chain
- frame time
- warnings
- source file path
- Three.js reference path where applicable

Required tools:

- `tools/v5-screenshot-gallery/index.ts`
- `tools/v5-visual-quality/index.ts`
- `tools/v5-human-review-readiness/index.ts`

Acceptance:

- Every flagship screenshot is at least 1280x720.
- At least 8 flagship screenshots are 1920x1080 or higher.
- Every flagship screenshot is non-placeholder by dimensions, entropy, color diversity, and file-size gates.
- Human review explicitly approves or rejects every flagship screenshot.
- If any flagship scene looks like primitive test output, V5 is not complete.

## Milestone 0: Truth, Progress, And Claim Ledger

Purpose: prevent circular work and fake completion.

Required files:

- `docs/project/v5-roadmap-visual-engine-plan.md`
- `docs/project/v5-roadmap-status.md`
- `docs/project/v5-roadmap-progress.md`
- `docs/project/v5-roadmap-known-gaps.md`
- `docs/project/v5-roadmap-blocked-claims.md`
- `docs/project/v5-roadmap-visual-failures.md`
- `tools/v5-truth/index.ts`
- `tools/v5-progress/index.ts`
- `tools/v5-claim-registry/index.ts`

Required package scripts:

- `v5:truth`
- `v5:progress`

Acceptance:

- `progress.md` lists Milestones 0-20.
- `status.md` states V5 is not complete at start.
- `visual-failures.md` names the weak V4 screenshots and why they are not enough.
- `blocked-claims.md` keeps full Three.js API replacement, Unity replacement, Unreal replacement, and unsupported ecosystem claims blocked.
- Truth gate fails if progress says complete before release readiness passes.

Exit command:

```sh
pnpm v5:truth && pnpm v5:progress
```

## Milestone 1: Three.js Inventory And Compatibility Target

Purpose: define what broad replacement means in measurable terms.

Required files:

- `packages/three-compat/src/ThreeCompatibilityMatrix.ts`
- `packages/three-compat/src/ThreeApiInventory.ts`
- `docs/project/v5-roadmap-threejs-baseline.md`
- `docs/project/v5-roadmap-threejs-compatibility-matrix.md`
- `tools/v5-threejs-inventory/index.ts`
- `tools/v5-compatibility-matrix/index.ts`
- `tests/unit/three-compat/v5-threejs-inventory.test.ts`

Required package script:

- `v5:threejs-inventory`

Acceptance:

- Inventory lists Three.js categories from installed package and examples imports.
- Compatibility matrix has at least 250 tracked API/example entries.
- Matrix includes minimum coverage thresholds:
  - core/math/cameras/lights/materials/geometries/textures: 80% supported or partial
  - controls/loaders/postprocess/animation/helpers: 60% supported or partial
  - examples parity: at least 50 migrated or equivalent examples
- Matrix blocks unsupported categories honestly.

Exit command:

```sh
pnpm v5:threejs-inventory
```

## Milestone 2: High-End Asset Library

Purpose: stop using primitive scenes as flagship proof.

Required files:

- `fixtures/v5/assets/manifest.json`
- `fixtures/v5/assets/licenses.md`
- `fixtures/v5/products/manifest.json`
- `fixtures/v5/automotive/manifest.json`
- `fixtures/v5/architecture/manifest.json`
- `fixtures/v5/characters/manifest.json`
- `fixtures/v5/vfx/manifest.json`
- `packages/assets/src/v5/V5AssetRegistry.ts`
- `packages/assets/src/v5/V5AssetProvenance.ts`
- `tools/v5-asset-readiness/index.ts`
- `tests/assets/v5-asset-library.test.ts`

Required package script:

- `v5:assets`

Acceptance:

- At least 40 real sample assets are tracked.
- At least 12 complex visual assets are used in browser screenshots.
- Every asset has license, source URI, revision or version, SHA-256, local path, provenance, and usage boundary.
- No generated placeholder object can count as a flagship asset.
- Asset manifest includes PBR texture sets, animated assets, transparent assets, emissive assets, high-poly assets, compressed assets, and failure-case assets.

Exit command:

```sh
pnpm v5:assets
```

## Milestone 3: HDR Environment Library

Purpose: make lighting credible.

Required files:

- `fixtures/v5/environments/manifest.json`
- `fixtures/v5/environments/licenses.md`
- `packages/environments/src/EnvironmentRegistry.ts`
- `packages/environments/src/HDRIEnvironment.ts`
- `packages/environments/src/PMREMPreset.ts`
- `packages/environments/src/EnvironmentPreview.ts`
- `tests/unit/environments/v5-environments.test.ts`
- `tests/browser/v5-environment-gallery.spec.ts`
- `tools/v5-environment-readiness/index.ts`

Required package script:

- `v5:environments`

Acceptance:

- At least 12 HDR environment presets exist.
- At least 6 are high-quality licensed real HDRI sources or checked-in public sample assets with provenance.
- Every flagship visual chooses a named environment preset.
- Environment gallery renders reflective, rough, transmissive, and emissive material probes under every environment.
- PMREM/IBL output is cached and diagnostics expose environment resolution, format, memory, and warnings.

Exit command:

```sh
pnpm v5:environments
```

## Milestone 4: Real PBR Material Library

Purpose: make materials look real, not procedural-only.

Required files:

- `fixtures/v5/materials/manifest.json`
- `fixtures/v5/materials/licenses.md`
- `packages/materials/src/PBRMaterialLibrary.ts`
- `packages/materials/src/MaterialPreset.ts`
- `packages/materials/src/TextureSet.ts`
- `packages/materials/src/MaterialValidation.ts`
- `packages/materials/src/MaterialPreviewScene.ts`
- `tests/unit/materials/v5-material-library.test.ts`
- `tests/browser/v5-material-library.spec.ts`
- `tools/v5-material-readiness/index.ts`

Required package script:

- `v5:materials`

Acceptance:

- At least 50 material presets.
- At least 25 use real texture maps or checked-in public sample texture sets.
- Required material classes:
  - brushed metal
  - polished metal
  - clearcoat automotive paint
  - glass
  - tinted glass
  - plastic
  - rubber
  - leather
  - fabric
  - ceramic
  - stone
  - wood
  - emissive panel
  - translucent material
  - alpha-cutout foliage/card material
  - anisotropic material
  - sheen material
  - transmission material
  - normal-mapped material
  - ORM-packed material
- Material browser screenshots prove roughness, metalness, normal, AO, emissive, transmission, clearcoat, alpha, and color-space handling.

Exit command:

```sh
pnpm v5:materials
```

## Milestone 5: Renderer Breadth For Broad Replacement

Purpose: implement the renderer features developers expect from Three.js-class work.

Required files:

- `packages/rendering/src/v5/RendererV5.ts`
- `packages/rendering/src/v5/SceneRenderer.ts`
- `packages/rendering/src/v5/RenderTargetSystem.ts`
- `packages/rendering/src/v5/TextureSystem.ts`
- `packages/rendering/src/v5/MaterialSystem.ts`
- `packages/rendering/src/v5/LightingSystem.ts`
- `packages/rendering/src/v5/ShadowSystem.ts`
- `packages/rendering/src/v5/TransparencySystem.ts`
- `packages/rendering/src/v5/InstancingSystem.ts`
- `packages/rendering/src/v5/RendererDiagnostics.ts`
- `tests/unit/rendering/v5-renderer-v5.test.ts`
- `tests/browser/v5-renderer-v5.spec.ts`
- `tools/v5-renderer-readiness/index.ts`

Required package script:

- `v5:renderer`

Acceptance:

- Renderer supports:
  - perspective and orthographic cameras
  - cube cameras or equivalent environment capture
  - directional, point, spot, hemisphere, ambient, rect-area approximation
  - opaque, alpha-test, alpha-blend, transmissive, double-sided materials
  - multiple render targets or documented fallback
  - depth textures
  - HDR render targets
  - WebGL2 backend
  - WebGPU status report, even if partial
  - render target resize
  - screenshot capture
  - GPU/CPU timing diagnostics where available
  - device loss / context loss handling
- Browser proof renders a complex scene using every required category.

Exit command:

```sh
pnpm v5:renderer
```

## Milestone 6: Scene Graph, Math, Cameras, Lights, And Helpers

Purpose: give Three.js developers familiar building blocks.

Required files:

- `packages/three-compat/src/core/Object3DCompat.ts`
- `packages/three-compat/src/core/SceneCompat.ts`
- `packages/three-compat/src/core/RaycasterCompat.ts`
- `packages/three-compat/src/math/index.ts`
- `packages/three-compat/src/cameras/index.ts`
- `packages/three-compat/src/lights/index.ts`
- `packages/three-compat/src/helpers/index.ts`
- `tests/unit/three-compat/v5-core-compat.test.ts`
- `tests/browser/v5-core-compat.spec.ts`
- `tools/v5-core-compat-readiness/index.ts`

Required package script:

- `v5:core-compat`

Acceptance:

- Compatibility layer covers common Three.js concepts:
  - `Object3D`
  - `Scene`
  - `Group`
  - `Mesh`
  - `Camera`
  - `PerspectiveCamera`
  - `OrthographicCamera`
  - common vector/quaternion/matrix/color APIs
  - `Raycaster`
  - common lights
  - helpers enough for developer debugging
- API docs show equivalent imports and migration notes.
- Browser proof migrates a custom Three.js-style scene through compat APIs.

Exit command:

```sh
pnpm v5:core-compat`
```

## Milestone 7: Geometry, Textures, Render Targets, And Materials Compatibility

Purpose: support common custom scene authoring.

Required files:

- `packages/three-compat/src/geometries/index.ts`
- `packages/three-compat/src/textures/index.ts`
- `packages/three-compat/src/materials/index.ts`
- `packages/three-compat/src/render-targets/index.ts`
- `tests/unit/three-compat/v5-material-geometry-compat.test.ts`
- `tests/browser/v5-material-geometry-compat.spec.ts`
- `tools/v5-material-geometry-compat-readiness/index.ts`

Required package script:

- `v5:material-geometry-compat`

Acceptance:

- Covers common geometry builders:
  - box
  - sphere
  - plane
  - cylinder
  - torus
  - cone
  - circle
  - buffer geometry
  - instanced buffer geometry or equivalent
- Covers common material types:
  - basic
  - lambert or documented approximation
  - phong or documented approximation
  - standard
  - physical
  - shader material
  - points material
  - line material
  - sprite material or documented approximation
- Covers texture loading and sampler/wrap/filter settings.
- Browser proof renders a migrated material/geometry showcase.

Exit command:

```sh
pnpm v5:material-geometry-compat
```

## Milestone 8: Loader Ecosystem

Purpose: make asset loading credible beyond one GLB path.

Required files:

- `packages/assets/src/loaders/GLTFLoaderV5.ts`
- `packages/assets/src/loaders/OBJLoader.ts`
- `packages/assets/src/loaders/MTLLoader.ts`
- `packages/assets/src/loaders/HDRLoader.ts`
- `packages/assets/src/loaders/EXRLoader.ts`
- `packages/assets/src/loaders/KTX2Loader.ts`
- `packages/assets/src/loaders/TextureLoader.ts`
- `packages/assets/src/loaders/CubeTextureLoader.ts`
- `packages/assets/src/loaders/LoaderDiagnostics.ts`
- `packages/three-compat/src/loaders/index.ts`
- `tests/assets/v5-loader-corpus.test.ts`
- `tests/browser/v5-loader-corpus.spec.ts`
- `tools/v5-loader-readiness/index.ts`

Required package script:

- `v5:loaders`

Acceptance:

- glTF/GLB loader supports common PBR, animation, skin, morph, image, texture, extension diagnostics.
- DRACO, Meshopt, and KTX2 support must be either implemented or explicitly blocked with runtime diagnostics.
- OBJ + MTL loads a real sample.
- HDR or EXR environment loading is proven.
- Texture loader supports PNG, JPG, WebP where browser-supported.
- Loader diagnostics expose missing textures, unsupported extensions, decoder needs, texture color-space warnings, memory estimates.
- Three.js compatibility loader imports work from packed package.

Exit command:

```sh
pnpm v5:loaders
```

## Milestone 9: Controls, Interaction, Picking, And Transform Tools

Purpose: match common Three.js developer expectations for interaction.

Required files:

- `packages/controls/src/OrbitControls.ts`
- `packages/controls/src/TrackballControls.ts`
- `packages/controls/src/FlyControls.ts`
- `packages/controls/src/FirstPersonControls.ts`
- `packages/controls/src/MapControls.ts`
- `packages/controls/src/PointerLockControls.ts`
- `packages/controls/src/DragControls.ts`
- `packages/controls/src/TransformControls.ts`
- `packages/controls/src/SelectionManager.ts`
- `packages/controls/src/Picking.ts`
- `packages/three-compat/src/controls/index.ts`
- `tests/unit/controls/v5-controls.test.ts`
- `tests/browser/v5-controls.spec.ts`
- `tools/v5-controls-readiness/index.ts`

Required package script:

- `v5:controls`

Acceptance:

- Browser tests prove orbit, pan, zoom, fly, first-person, drag, transform translate/rotate/scale, pointer picking, and selection.
- Controls work with public app runtime.
- Controls work from packed package.
- Docs include controls guide with code.
- Controls lab app exposes all modes.

Exit command:

```sh
pnpm v5:controls
```

## Milestone 10: Animation, Skinning, Morph Targets, And Timeline

Purpose: make character and animated asset workflows credible.

Required files:

- `packages/animation/src/v5/AnimationMixer.ts`
- `packages/animation/src/v5/AnimationClip.ts`
- `packages/animation/src/v5/AnimationAction.ts`
- `packages/animation/src/v5/Skeleton.ts`
- `packages/animation/src/v5/SkinnedMesh.ts`
- `packages/animation/src/v5/MorphTargetMixer.ts`
- `packages/animation/src/v5/AnimationDiagnostics.ts`
- `packages/three-compat/src/animation/index.ts`
- `tests/unit/animation/v5-animation.test.ts`
- `tests/browser/v5-animation.spec.ts`
- `tools/v5-animation-readiness/index.ts`

Required package script:

- `v5:animation`

Acceptance:

- Loads at least 5 animated glTF assets.
- Proves skinning, morph targets, crossfade, loop modes, pause/play/scrub, animation diagnostics.
- Character flagship screenshot includes skinned/morphed state, not static placeholder.
- Three.js migration examples cover `AnimationMixer`-style code or documented equivalent.

Exit command:

```sh
pnpm v5:animation
```

## Milestone 11: Postprocess, Composer, And Cinematic Pipeline

Purpose: match the postprocessing workflows Three.js developers expect.

Required files:

- `packages/rendering/src/v5/postprocess/EffectComposer.ts`
- `packages/rendering/src/v5/postprocess/RenderPass.ts`
- `packages/rendering/src/v5/postprocess/ShaderPass.ts`
- `packages/rendering/src/v5/postprocess/BloomPass.ts`
- `packages/rendering/src/v5/postprocess/SSAOPass.ts`
- `packages/rendering/src/v5/postprocess/TAAPass.ts`
- `packages/rendering/src/v5/postprocess/FXAAPass.ts`
- `packages/rendering/src/v5/postprocess/SMAAPass.ts`
- `packages/rendering/src/v5/postprocess/DepthOfFieldPass.ts`
- `packages/rendering/src/v5/postprocess/MotionBlurPass.ts`
- `packages/rendering/src/v5/postprocess/ColorGradingPass.ts`
- `packages/rendering/src/v5/postprocess/VignettePass.ts`
- `packages/rendering/src/v5/postprocess/OutlinePass.ts`
- `packages/three-compat/src/postprocessing/index.ts`
- `tests/unit/rendering/v5-postprocess.test.ts`
- `tests/browser/v5-postprocess.spec.ts`
- `tools/v5-postprocess-readiness/index.ts`

Required package script:

- `v5:postprocess`

Acceptance:

- Composer chain runs in browser.
- Before/after screenshots exist for each major effect.
- Cinematic flagship scene uses a real chain with bloom, AO, DOF, color grading, antialiasing, vignette, and optional motion blur.
- Three.js `EffectComposer` migration path or adapter is documented.

Exit command:

```sh
pnpm v5:postprocess
```

## Milestone 12: Shader Authoring, Custom Materials, And Nodes

Purpose: support developers who write custom Three.js materials.

Required files:

- `packages/rendering/src/v5/shaders/ShaderMaterial.ts`
- `packages/rendering/src/v5/shaders/RawShaderMaterial.ts`
- `packages/rendering/src/v5/shaders/Uniforms.ts`
- `packages/rendering/src/v5/shaders/ShaderChunksV5.ts`
- `packages/rendering/src/v5/shaders/NodeMaterial.ts`
- `packages/rendering/src/v5/shaders/ShaderDiagnostics.ts`
- `packages/three-compat/src/shaders/index.ts`
- `apps/v5-shader-lab-pro/index.html`
- `apps/v5-shader-lab-pro/src/main.ts`
- `tests/unit/rendering/v5-shaders.test.ts`
- `tests/browser/v5-shader-lab.spec.ts`
- `tools/v5-shader-readiness/index.ts`

Required package script:

- `v5:shaders`

Acceptance:

- Custom shader material renders in browser.
- Uniform updates work.
- Shader compile errors surface useful diagnostics.
- Shader lab app allows editing or selecting shader presets.
- Docs map common Three.js `ShaderMaterial` patterns to G3D.

Exit command:

```sh
pnpm v5:shaders
```

## Milestone 13: Particles, VFX, Sprites, Lines, And Points

Purpose: cover visual categories beyond mesh rendering.

Required files:

- `packages/rendering/src/v5/vfx/ParticleSystem.ts`
- `packages/rendering/src/v5/vfx/GPUPointCloud.ts`
- `packages/rendering/src/v5/vfx/SpriteSystem.ts`
- `packages/rendering/src/v5/vfx/LineRenderer.ts`
- `packages/rendering/src/v5/vfx/TrailRenderer.ts`
- `packages/rendering/src/v5/vfx/VFXDiagnostics.ts`
- `tests/unit/rendering/v5-vfx.test.ts`
- `tests/browser/v5-vfx.spec.ts`
- `tools/v5-vfx-readiness/index.ts`

Required package script:

- `v5:vfx`

Acceptance:

- Browser proof renders particles, sprites, lines, trails, and point cloud.
- VFX flagship screenshot is not a primitive placeholder.
- Diagnostics include particle count, point count, draw calls, frame time, warnings.

Exit command:

```sh
pnpm v5:vfx
```

## Milestone 14: Performance, Large Scenes, Instancing, And BVH

Purpose: prove broad replacement does not collapse at scale.

Required files:

- `packages/rendering/src/v5/performance/Instancing.ts`
- `packages/rendering/src/v5/performance/FrustumCulling.ts`
- `packages/rendering/src/v5/performance/OcclusionCulling.ts`
- `packages/rendering/src/v5/performance/BVH.ts`
- `packages/rendering/src/v5/performance/RaycastAcceleration.ts`
- `packages/rendering/src/v5/performance/LODSystem.ts`
- `packages/rendering/src/v5/performance/TextureStreaming.ts`
- `packages/rendering/src/v5/performance/RendererProfiler.ts`
- `tests/performance/v5-performance-baselines.ts`
- `tests/browser/v5-large-scene.spec.ts`
- `tests/browser/v5-raycast-bvh.spec.ts`
- `tools/v5-performance-readiness/index.ts`

Required package script:

- `v5:performance`

Acceptance:

- Large scene contains at least 10,000 visible or culled objects.
- Instanced scene contains at least 50,000 instances.
- Raycast BVH test proves accelerated picking over large geometry.
- Frame budget, draw calls, triangles, texture memory, CPU frame time, warnings are reported.
- Same-scene Three.js performance comparison exists.
- Broad performance superiority cannot be claimed unless external evidence supports it.

Exit command:

```sh
pnpm v5:performance
```

## Milestone 15: Three.js Migration Layer And Codemods

Purpose: make broad replacement usable, not theoretical.

Required files:

- `packages/three-compat/src/index.ts`
- `packages/three-compat/src/migration/ImportMap.ts`
- `packages/three-compat/src/migration/ThreeToG3DAdapter.ts`
- `packages/three-compat/src/migration/CompatibilityWarnings.ts`
- `tools/v5-migrate-three/index.ts`
- `tools/v5-threejs-example-migrator/index.ts`
- `tests/unit/three-compat/v5-migration.test.ts`
- `tests/integration/v5-threejs-migration.test.ts`
- `tests/browser/v5-threejs-migration.spec.ts`
- `tools/v5-migration-readiness/index.ts`

Required package script:

- `v5:migration`

Acceptance:

- Migration tool rewrites at least:
  - imports from `three`
  - common examples imports for controls/loaders/postprocessing
  - renderer setup boilerplate
  - loader setup boilerplate
  - controls setup boilerplate
- Migrated examples compile.
- Migrated examples run in browser.
- Compatibility warnings clearly name unsupported or partial APIs.
- Migration lab app displays source, converted code, runtime result, warnings, and screenshot.

Exit command:

```sh
pnpm v5:migration
```

## Milestone 16: Example Parity Suite

Purpose: compete with Three.js where developers actually evaluate engines: examples.

Required directories:

- `examples/v5/`
- `examples/v5/basic-scene/`
- `examples/v5/materials-physical/`
- `examples/v5/gltf-loader/`
- `examples/v5/obj-loader/`
- `examples/v5/hdr-environment/`
- `examples/v5/postprocess-bloom/`
- `examples/v5/postprocess-dof/`
- `examples/v5/controls-orbit/`
- `examples/v5/controls-transform/`
- `examples/v5/animation-skinning/`
- `examples/v5/morph-targets/`
- `examples/v5/particles/`
- `examples/v5/sprites/`
- `examples/v5/lines/`
- `examples/v5/instancing/`
- `examples/v5/raycasting/`
- `examples/v5/shader-material/`
- `examples/v5/render-targets/`
- `examples/v5/large-scene/`
- `examples/v5/product-configurator/`
- `examples/v5/architecture-interior/`
- `examples/v5/automotive-configurator/`
- `examples/v5/threejs-migrated-custom-scene/`

Required tools/tests:

- `tests/browser/v5-examples.spec.ts`
- `tools/v5-examples-readiness/index.ts`
- `tools/v5-example-parity/index.ts`

Required package script:

- `v5:examples`

Acceptance:

- At least 50 V5 examples exist.
- At least 30 examples run in browser tests.
- At least 20 examples have a mapped Three.js reference example or documented equivalent.
- Gallery page lists examples by category and includes screenshot thumbnails.
- Examples use public package imports only.

Exit command:

```sh
pnpm v5:examples
```

## Milestone 17: Same-Scene Three.js Visual And Runtime Parity

Purpose: prove the competitor claim with direct comparisons.

Required files:

- `benchmarks/v5/shared/`
- `benchmarks/v5/galileo/`
- `benchmarks/v5/threejs/`
- `tests/browser/v5-threejs-visual-parity.spec.ts`
- `tests/browser/v5-threejs-runtime-parity.spec.ts`
- `tools/v5-threejs-visual-parity/index.ts`
- `tools/v5-threejs-runtime-parity/index.ts`

Required package script:

- `v5:compare-threejs`

Required comparison scenes:

- product configurator
- automotive configurator
- material library
- architecture daylight
- architecture night
- glTF asset inspection
- character animation
- postprocess cinematic
- particles/VFX
- shader material
- controls/interaction
- large scene instancing
- Three.js migrated custom scene

Acceptance:

- At least 13 same-scene comparisons.
- Every comparison includes G3D screenshot, Three.js screenshot, diff screenshot, setup line counts, draw calls, frame time, warnings.
- At least 10 comparisons meet visual score threshold.
- At least 8 comparisons show lower setup complexity than direct Three.js.
- Large-scene comparison includes object count, instances, triangles, frame time, texture memory.
- Gap report preserves unsupported claims.

Exit command:

```sh
pnpm v5:compare-threejs
```

## Milestone 18: Developer Ergonomics And Documentation Depth

Purpose: make it a product developers can learn and use.

Required files:

- `docs/project/v5-roadmap-getting-started.md`
- `docs/project/v5-roadmap-api-reference.md`
- `docs/project/v5-roadmap-threejs-migration-guide.md`
- `docs/project/v5-roadmap-examples-index.md`
- `docs/project/v5-roadmap-templates-index.md`
- `docs/project/v5-roadmap-troubleshooting.md`
- `docs/project/v5-roadmap-performance-guide.md`
- `docs/project/v5-roadmap-asset-pipeline-guide.md`
- `docs/project/v5-roadmap-controls-guide.md`
- `docs/project/v5-roadmap-shader-authoring-guide.md`
- `docs/project/v5-roadmap-release-notes.md`
- `tools/v5-docs-readiness/index.ts`
- `tests/unit/tools/v5-docs.test.ts`

Required package script:

- `v5:docs`

Acceptance:

- At least 20 tutorials or guide pages.
- At least 50 runnable code snippets are validated or linked to examples.
- API reference documents public stable/experimental/internal labels.
- Docs include "Three.js developer quick map" table.
- Docs include "What still requires raw Three.js or another engine" section.
- Docs include install, scaffold, build, deploy, debug, migrate.

Exit command:

```sh
pnpm v5:docs
```

## Milestone 19: External Consumer, Package, Deployment, And Starter Proof

Purpose: ensure V5 works outside the repo.

Required files:

- `tools/v5-package-smoke/index.ts`
- `tools/v5-external-consumer/index.ts`
- `tools/v5-external-vite-build/index.ts`
- `tools/v5-static-preview-smoke/index.ts`
- `tests/browser/v5-external-consumer-static.spec.ts`
- `tests/reports/v5-external-consumer/`

Required package script:

- `v5:package`

Acceptance:

- Packed root package installs in a temp app.
- Every V5 public subpath imports from packed package.
- At least three templates build from packed package.
- At least one migrated Three.js example builds from packed package.
- Static preview browser screenshot proves built output, not dev server only.
- External consumer imports no monorepo internals.

Exit command:

```sh
pnpm v5:package
```

## Milestone 20: Release Readiness, Broad Replacement Claim Gate, And Completion Audit

Purpose: only mark complete after the product is actually broad and visually strong.

Required files:

- `tools/v5-release-readiness/index.ts`
- `tools/v5-broad-replacement-readiness/index.ts`
- `tools/v5-completion-audit/index.ts`
- `tests/reports/v5-release-readiness.json`
- `tests/reports/v5-broad-replacement-readiness.json`
- `tests/reports/v5-completion-audit.json`

Required package script:

- `v5:release`

Release command must include:

```sh
pnpm v5:truth \
  && pnpm v5:progress \
  && pnpm v5:legacy-prune \
  && pnpm typecheck \
  && pnpm v5:threejs-inventory \
  && pnpm v5:assets \
  && pnpm v5:environments \
  && pnpm v5:materials \
  && pnpm v5:renderer \
  && pnpm v5:core-compat \
  && pnpm v5:material-geometry-compat \
  && pnpm v5:loaders \
  && pnpm v5:controls \
  && pnpm v5:animation \
  && pnpm v5:postprocess \
  && pnpm v5:shaders \
  && pnpm v5:vfx \
  && pnpm v5:performance \
  && pnpm v5:migration \
  && pnpm v5:app-suite \
  && pnpm v5:templates \
  && pnpm v5:examples \
  && pnpm v5:compare-threejs \
  && pnpm v5:package \
  && pnpm v5:docs \
  && pnpm exec tsx --tsconfig tsconfig.base.json tools/v5-release-readiness/index.ts \
  && pnpm exec tsx --tsconfig tsconfig.base.json tools/v5-broad-replacement-readiness/index.ts \
  && pnpm exec tsx --tsconfig tsconfig.base.json tools/v5-completion-audit/index.ts
```

Broad replacement gate must require:

- compatibility matrix exists and passes
- at least 250 tracked Three.js API/example entries
- at least 60% overall supported or partial coverage
- at least 80% supported or partial coverage for core/math/cameras/lights/materials/geometries/textures
- at least 50 V5 examples
- at least 30 browser-tested examples
- at least 13 same-scene Three.js comparisons
- visual quality gate passes
- human visual review approves all flagship screenshots
- migration tool passes on example corpus
- package/external consumer proof passes
- docs readiness passes
- blocked claims remain visible

Completion audit must fail if:

- any milestone report is missing
- any milestone report has `pass: false`
- any V5 app imports internal renderer test utilities
- any V5 template uses workspace aliases
- any flagship screenshot is below threshold
- human review says any flagship scene looks like primitive test output
- broad replacement readiness is missing
- compatibility matrix coverage is below threshold
- known blocked claims were deleted to pass release
- progress says complete before release gate passes

Exit command:

```sh
pnpm v5:release
```

## Required Final Reports

V5 release must generate:

- `tests/reports/v5-truth.json`
- `tests/reports/v5-progress.json`
- `tests/reports/v5-legacy-prune-readiness.json`
- `tests/reports/v5-threejs-inventory.json`
- `tests/reports/v5-threejs-compatibility-matrix.json`
- `tests/reports/v5-asset-readiness.json`
- `tests/reports/v5-environment-readiness.json`
- `tests/reports/v5-material-readiness.json`
- `tests/reports/v5-renderer-readiness.json`
- `tests/reports/v5-core-compat-readiness.json`
- `tests/reports/v5-material-geometry-compat-readiness.json`
- `tests/reports/v5-loader-readiness.json`
- `tests/reports/v5-controls-readiness.json`
- `tests/reports/v5-animation-readiness.json`
- `tests/reports/v5-postprocess-readiness.json`
- `tests/reports/v5-shader-readiness.json`
- `tests/reports/v5-vfx-readiness.json`
- `tests/reports/v5-performance-readiness.json`
- `tests/reports/v5-migration-readiness.json`
- `tests/reports/v5-app-suite-readiness.json`
- `tests/reports/v5-template-readiness.json`
- `tests/reports/v5-examples-readiness.json`
- `tests/reports/v5-threejs-visual-parity.json`
- `tests/reports/v5-threejs-runtime-parity.json`
- `tests/reports/v5-package-smoke.json`
- `tests/reports/v5-external-consumer.json`
- `tests/reports/v5-docs-readiness.json`
- `tests/reports/v5-claim-registry.json`
- `tests/reports/v5-release-readiness.json`
- `tests/reports/v5-broad-replacement-readiness.json`
- `tests/reports/v5-completion-audit.json`

## Required Final Screenshots

V5 release must generate:

- `tests/reports/v5-gallery/product/premium-product-viewer.png`
- `tests/reports/v5-gallery/automotive/automotive-configurator.png`
- `tests/reports/v5-gallery/architecture-day/interior-daylight.png`
- `tests/reports/v5-gallery/architecture-night/interior-night.png`
- `tests/reports/v5-gallery/materials/material-library.png`
- `tests/reports/v5-gallery/assets/asset-inspector.png`
- `tests/reports/v5-gallery/character/character-animation.png`
- `tests/reports/v5-gallery/postprocess/cinematic-postprocess.png`
- `tests/reports/v5-gallery/vfx/particle-vfx.png`
- `tests/reports/v5-gallery/large-scene/large-instanced-scene.png`
- `tests/reports/v5-gallery/shader-lab/shader-lab.png`
- `tests/reports/v5-gallery/threejs-migration/migrated-threejs-scene.png`
- `tests/reports/v5-gallery/threejs-comparison/product-comparison-g3d.png`
- `tests/reports/v5-gallery/threejs-comparison/product-comparison-threejs.png`
- `tests/reports/v5-gallery/threejs-comparison/product-comparison-diff.png`
- `tests/reports/v5-gallery/threejs-comparison/large-scene-g3d.png`
- `tests/reports/v5-gallery/threejs-comparison/large-scene-threejs.png`
- `tests/reports/v5-gallery/threejs-comparison/large-scene-diff.png`
- `tests/reports/v5-external-consumer/external-consumer-static.png`

## Human Visual Review Requirement

Before release, create:

- `docs/project/v5-roadmap-human-visual-review.md`

It must list every flagship screenshot and answer:

- Does this look like a premium browser 3D product?
- Is lighting believable?
- Are HDR/IBL reflections credible?
- Are materials distinguishable and physically plausible?
- Are shadows credible?
- Is postprocess improving the image without hiding weak lighting?
- Does the scene have enough complexity to compete with serious Three.js examples?
- Does the G3D version compare credibly against the Three.js reference?
- What still looks bad?
- Would this screenshot be acceptable on a public product page?

If any flagship screenshot fails human review, V5 is not complete.

## Immediate First Tasks For The Next Agent

Do this first, in order:

1. Create `docs/project/v5-roadmap-status.md`.
2. Create `docs/project/v5-roadmap-progress.md`.
3. Create `docs/project/v5-roadmap-visual-failures.md` naming the weak V4 screenshots and exactly why they are not enough.
4. Create `docs/project/v5-roadmap-blocked-claims.md`.
5. Create `docs/project/v5-roadmap-legacy-prune-ledger.md`.
6. Create `tools/v5-truth/index.ts`.
7. Create `tools/v5-progress/index.ts`.
8. Create `tools/v5-legacy-prune-readiness/index.ts`.
9. Add `v5:truth`, `v5:progress`, and `v5:legacy-prune` scripts.
10. Run `pnpm v5:truth && pnpm v5:progress && pnpm v5:legacy-prune`.
11. Start Milestone 1 inventory before building new visuals.

Do not start with new screenshots.

Do not start with another demo.

Start by defining the replacement target and the release gates that will prevent fake completion.
