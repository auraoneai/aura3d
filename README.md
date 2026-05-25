# Galileo3D

Galileo3D, or G3D, is a production browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, memory, and developer-workflow categories documented by the V10 superiority audit.

G3D is not a runtime wrapper around Three.js. The renderer, scene graph, math, animation, asset pipeline, controls, physics, postprocess, WebGPU/WebGL2 backends, diagnostics, and workflow APIs live in first-party G3D packages. Three.js is used only as a reference implementation for tests, benchmark baselines, migration analysis, and compatibility checks.

## Why G3D Beats Three.js

G3D beats Three.js in the measured workflow categories that matter for browser 3D product delivery:

- Workflow speed: product viewers, material studios, animation viewers, physics sandboxes, asset inspectors, screenshots, and diagnostics are first-party workflows instead of hand-assembled demo code.
- Diagnostics: renderer state, route health, asset import, animation motion quality, material extension handling, resource lifecycle, and benchmark evidence are generated into auditable reports.
- Memory safety: explicit dispose paths and reload checks cover WebGL/WebGPU buffers, textures, programs, render targets, VAOs, samplers, and renderer-owned resources.
- Migration confidence: `@galileo3d/three-compat`, parity routes, same-scene comparisons, and migration audits document where Three.js workflows map to G3D APIs.
- Performance evidence: current reports show equivalent benchmark scaffolds tying frame-time and draw-call outcomes, smaller generated benchmark bundles than Three.js, instancing one-draw parity, accelerated raycast/culling baselines, and a passing 100-reload resource lifecycle gate.
- Product rendering quality: PBR/HDR/IBL, material-extension routes, shadow routes, postprocess routes, visual review, and same-scene render reports are part of the release gate.

The current claim is evidence-bound: G3D matches or exceeds Three.js in the measured categories covered by `tests/reports/v10/superiority-audit.json`, `tests/reports/v10/claim-defense.json`, and [docs/project/v10-superiority-status.md](/Users/gurbakshchahal/G3D/docs/project/v10-superiority-status.md).

## Advanced Gallery Boundary

The V9 advanced examples gallery is current accepted showcase evidence as of the latest report set. `pnpm advanced-gallery:review` reports `Release gate: accepted (10/10 accepted)`, and `pnpm advanced-gallery:audit` verifies ten current route reports, screenshot hashes, runtime JSON, reusable-system disclosures, unsupported disclosures, measured performance evidence, and image-quality evidence with zero blockers.

The claim remains evidence-bound: if source changes invalidate screenshots, route JSON, hashes, review output, or audit output, rerun `pnpm advanced-gallery`, `pnpm advanced-gallery:review`, and `pnpm advanced-gallery:audit` before reusing the gallery as accepted evidence.

The full advanced-gallery capture is intentionally not part of aggregate `pnpm v9`; it is a heavyweight visual acceptance lane that must be run explicitly through `pnpm advanced-gallery:pipeline` when gallery source, route composition, renderer output, or evidence files change. `pnpm test:visual` remains the generic visual baseline command for nonblank/pixel smoke coverage and is not an advanced-gallery acceptance gate.

## Package Surface

The repo builds these first-party package surfaces:

- `@galileo3d/engine` root package, app lifecycle, V9 renderer/scene wrappers, and public SDK exports.
- `@galileo3d/math` vectors, matrices, quaternions, colors, rays, bounds, planes, and frustums.
- `@galileo3d/scene` Object3D-style hierarchy, transforms, cameras, renderables, lights, serialization, and renderable scene integration.
- `@galileo3d/rendering` WebGL2/WebGPU devices, renderer facade, materials, shaders, textures, render targets, postprocess, shadows, queues, culling, instancing, diagnostics, and resource lifecycle.
- `@galileo3d/assets` glTF/GLB, Draco, Meshopt, KTX2/Basis, HDR/EXR, OBJ/MTL, render-resource conversion, extension support, asset caches, and diagnostics.
- `@galileo3d/animation` clips, tracks, mixer actions, layers, skeletons, GPU skinning, morphs, IK, root motion, clone sampling, and motion-quality diagnostics.
- `@galileo3d/physics` rigid bodies, colliders, raycasts, constraints, character controller helpers, scene sync, and debug route evidence.
- `@galileo3d/controls` orbit, trackball, transform, drag, map, fly, first-person, pointer-lock, touch-ready camera adapters, and route evidence.
- `@galileo3d/input` WebXR session/controller sampling, target-ray and grip poses, haptics, AR hit-test sampling, and browser route integration.
- `@galileo3d/materials`, `@galileo3d/environments`, `@galileo3d/product-studio`, `@galileo3d/editor-runtime`, `@galileo3d/workflows`, `@galileo3d/three-compat`, and `@galileo3d/debug`.

## What Exists Now

Current implementation includes:

- First-party math engine: Vector/Matrix/Quaternion transform math, projection, rays, bounds, frustums, and camera helpers.
- Scene graph: Object3D-style parent/child transforms, matrix auto-update, cameras, lights, renderables, instancing, serialization, and renderer traversal.
- WebGL2 renderer: shader/material binding, state caching, render queues, opaque/transparent sorting, culling, draw ranges, instanced rendering, render targets, postprocess, shadows, and disposal.
- WebGPU backend: render-target workflows, compute particles, PBR material rendering, instanced uniform submission, texture/readback paths, and real `navigator.gpu` hardware evidence.
- Asset pipeline: glTF/GLB, skins, morphs, animations, variants, material extensions, compressed mesh paths, KTX2/Basis hooks, HDR/EXR, OBJ/MTL, render-resource conversion, and diagnostics.
- Animation: imported GLB clips, mixer actions, skinning palettes, shader skinning, additive layers, blending, IK, morph targets, root motion, clone sampling, and motion-quality reports.
- Physics and interaction: rigid bodies, colliders, constraints, raycast queries, character controller helpers, debug route evidence, scene picking, decals, WebXR controller/AR hit-test paths, and controls.
- Visual effects: PBR/HDR/IBL, transmission, clearcoat, sheen, shadows, bloom, outline, depth of field, SSAO, stereo, anaglyph, parallax barrier, sprites, points, helpers, and line geometry.

## Install And Run

Install dependencies:

```sh
pnpm install
```

Start the local app registry and routes:

```sh
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open:

```text
http://127.0.0.1:5180/
```

Useful routes include:

- `/apps/flagship-viewer/`
- `/apps/animation-keyframes/`
- `/apps/animation-multiple/`
- `/apps/animation-walk/`
- `/apps/skinning-blending/`
- `/apps/skinning-additive/`
- `/apps/skinning-ik/`
- `/apps/skinning-morph/`
- `/apps/decals/`
- `/apps/postprocessing-bloom/`
- `/apps/postprocessing-depth-outline/`
- `/apps/instancing-performance/`
- `/apps/loader-compression/`
- `/apps/loader-material-extensions/`
- `/apps/loader-gltf-variants/`
- `/apps/webgpu-rtt/`
- `/apps/webgpu-compute/`
- `/apps/webgpu-materials/`
- `/apps/webgpu-instance-uniform/`
- `/apps/webxr-interactions/`
- `/apps/public-scene/`

## Basic SDK Shape

```ts
import { Renderer } from "@galileo3d/rendering";
import { createRenderableScene, loadRenderableAsset } from "@galileo3d/assets";

const renderer = await Renderer.create({ canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.glb");
const scene = createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

await renderer.renderScene(scene);
```

## Verification

Run the current superiority gates:

```sh
pnpm v10
```

Run the current parity and evidence suite:

```sh
pnpm v9
```

`pnpm v9` keeps the broad V9 parity/readiness suite fast enough for aggregate verification. Run the heavyweight advanced-gallery evidence lane explicitly after gallery-visible changes:

```sh
pnpm advanced-gallery:pipeline
```

Run the generic visual baseline smoke separately when needed:

```sh
pnpm test:visual
```

Useful focused commands:

```sh
pnpm v9:inventory
pnpm v9:same-scene-render
pnpm v9:visual-review
pnpm advanced-gallery
pnpm v9:performance
pnpm v10:feature-parity
pnpm v10:visual-quality
pnpm v10:performance
pnpm v10:animation-fidelity
pnpm v10:physics-fidelity
pnpm v10:memory-lifecycle
pnpm v10:developer-workflow
pnpm v10:claim-defense
pnpm v10:superiority-audit
```

Primary evidence:

- `tests/reports/v9/threejs-inventory.json`
- `tests/reports/v9/visual-review.json`
- `tests/reports/v9/same-scene-render.json`
- `tests/reports/advanced-examples-gallery/` (current accepted advanced-gallery evidence; rerun capture, review, and audit after visual/source changes)
- `tests/reports/v9/performance.json`
- `tests/reports/v10/feature-parity.json`
- `tests/reports/v10/visual-quality.json`
- `tests/reports/v10/performance.json`
- `tests/reports/v10/animation-fidelity.json`
- `tests/reports/v10/physics-fidelity.json`
- `tests/reports/v10/memory-lifecycle.json`
- `tests/reports/v10/developer-workflow.json`
- `tests/reports/v10/claim-defense.json`
- `tests/reports/v10/superiority-audit.json`
- `docs/project/v10-superiority-status.md`

## Benchmarks And Comparisons

G3D compares against Three.js and Babylon.js through checked-in benchmark scenes, browser tests, and reports. Current comparison artifacts live under:

- `benchmarks/threejs/`
- `benchmarks/babylon/`
- `benchmarks/galileo/`
- `tests/reports/comparison-threejs.json`
- `tests/reports/comparison-babylon.json`
- `tests/reports/v9/`
- `tests/reports/v10/`
- `docs/benchmarks/`
- `docs/comparisons/`
- `docs/project/v10-superiority-status.md`

The defensible claim is not slogan-based. It is tied to report files, route screenshots, unit/browser tests, same-scene captures, benchmark outputs, and resource-lifecycle checks.

## Documentation Map

Current high-signal docs:

- [docs/project/current-state.md](/Users/gurbakshchahal/G3D/docs/project/current-state.md)
- [docs/project/getting-started.md](/Users/gurbakshchahal/G3D/docs/project/getting-started.md)
- [docs/project/documentation-index.md](/Users/gurbakshchahal/G3D/docs/project/documentation-index.md)
- [docs/project/competitive-positioning.md](/Users/gurbakshchahal/G3D/docs/project/competitive-positioning.md)
- [docs/project/go-to-market-strategy.md](/Users/gurbakshchahal/G3D/docs/project/go-to-market-strategy.md)
- [docs/project/v10-superiority-status.md](/Users/gurbakshchahal/G3D/docs/project/v10-superiority-status.md)
- `docs/api/`
- `docs/concepts/`
- `docs/rendering/`
- `docs/assets/`
- `docs/animation/`
- `docs/benchmarks/`
- `docs/comparisons/`

## Go-To-Market Direction

The GTM wedge is workflow-first browser 3D:

- Product viewers and configurators with asset diagnostics and reliable screenshots.
- Material/HDR/PBR review with reportable renderer state.
- Animation, skinning, morph, and IK inspection for GLB character assets.
- Migration from selected Three.js patterns into package-owned G3D workflows.
- Internal browser 3D tools where reliability, diagnostics, and repeatable evidence matter.

G3D should lead with proof: route health, same-scene comparison, benchmark reports, API docs, migration examples, and resource-lifecycle evidence.
