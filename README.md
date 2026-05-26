# Aura3D

Aura3D, or A3D, is a production browser 3D engine and workflow SDK with first-party rendering, asset, animation, physics, controls, workflow, diagnostics, and Three.js migration packages. Current generated reports show passing measured Three.js parity and superiority slices for the categories covered by the local superiority audit.

A3D is not a runtime wrapper around Three.js. The renderer, scene graph, math, animation, asset pipeline, controls, physics, postprocess, WebGPU/WebGL2 backends, diagnostics, and workflow APIs live in first-party A3D packages. Three.js is used only as a reference implementation for tests, benchmark baselines, migration analysis, and compatibility checks.

## Where A3D Is Measured Against Three.js

A3D compares against Three.js through measured workflow categories that matter for browser 3D product delivery:

- Workflow speed: product viewers, material studios, animation viewers, physics sandboxes, asset inspectors, screenshots, and diagnostics are first-party workflows instead of hand-assembled demo code.
- Diagnostics: renderer state, route health, asset import, animation motion quality, material extension handling, resource lifecycle, and benchmark evidence are generated into auditable reports.
- Memory safety: explicit dispose paths and reload checks cover WebGL/WebGPU buffers, textures, programs, render targets, VAOs, samplers, and renderer-owned resources.
- Migration confidence: `@aura3d/three-compat`, parity routes, same-scene comparisons, and migration audits document where Three.js workflows map to A3D APIs.
- Performance evidence: current reports show equivalent benchmark scaffolds tying frame-time and draw-call outcomes, smaller generated benchmark bundles than Three.js, instancing one-draw parity, accelerated raycast/culling baselines, and a passing 100-reload resource lifecycle gate.
- Product rendering quality: PBR/HDR/IBL, material-extension routes, shadow routes, postprocess routes, visual review, and same-scene render reports are part of the release gate.

The current claim is evidence-bound: A3D matches or exceeds Three.js only in the measured categories covered by `tests/reports/superiority/superiority-audit.json`, `tests/reports/superiority/claim-defense.json`, and [docs/project/threejs-superiority-status.md](docs/project/threejs-superiority-status.md).

## Advanced Gallery Boundary

The Three.js parity advanced examples gallery is a separate heavyweight showcase evidence lane. The source metadata currently defines ten accepted gallery routes, but accepted-gallery wording is valid only after regenerating the ignored local evidence files under `tests/reports/advanced-examples-gallery/` and confirming `pnpm advanced-gallery:review` and `pnpm advanced-gallery:audit` pass for that same report set.

The claim remains evidence-bound: if source changes invalidate screenshots, route JSON, hashes, review output, or audit output, rerun `pnpm advanced-gallery`, `pnpm advanced-gallery:review`, and `pnpm advanced-gallery:audit` before reusing the gallery as accepted evidence.

The full advanced-gallery capture is intentionally not part of aggregate `pnpm threejs-parity`; it is a heavyweight visual acceptance lane that must be run explicitly through `pnpm advanced-gallery:pipeline` when gallery source, route composition, renderer output, or evidence files change. `pnpm test:visual` remains the generic visual baseline command for nonblank/pixel smoke coverage and is not an advanced-gallery acceptance gate.

## Package Surface

The publish surface is the root `@aura3d/engine` package plus public subpaths such as `@aura3d/engine/rendering`, `@aura3d/engine/assets`, and `@aura3d/engine/production-runtime`. The monorepo also contains first-party workspace packages with matching standalone names for package-level development and API docs.

The repo builds these first-party package surfaces:

- `@aura3d/engine` root package, app lifecycle, Three.js parity renderer/scene wrappers, and public SDK exports.
- `@aura3d/math` vectors, matrices, quaternions, colors, rays, bounds, planes, and frustums.
- `@aura3d/scene` Object3D-style hierarchy, transforms, cameras, renderables, lights, serialization, and renderable scene integration.
- `@aura3d/rendering` WebGL2/WebGPU devices, renderer facade, materials, shaders, textures, render targets, postprocess, shadows, queues, culling, instancing, diagnostics, and resource lifecycle.
- `@aura3d/assets` glTF/GLB, Draco, Meshopt, KTX2/Basis, HDR/EXR, OBJ/MTL, render-resource conversion, extension support, asset caches, and diagnostics.
- `@aura3d/animation` clips, tracks, mixer actions, layers, skeletons, GPU skinning, morphs, IK, root motion, clone sampling, and motion-quality diagnostics.
- `@aura3d/physics` rigid bodies, colliders, raycasts, constraints, character controller helpers, scene sync, and debug route evidence.
- `@aura3d/controls` orbit, trackball, transform, drag, map, fly, first-person, pointer-lock, touch-ready camera adapters, and route evidence.
- `@aura3d/input` WebXR session/controller sampling, target-ray and grip poses, haptics, AR hit-test sampling, and browser route integration.
- `@aura3d/materials`, `@aura3d/environments`, `@aura3d/product-studio`, `@aura3d/editor-runtime`, `@aura3d/workflows`, `@aura3d/three-compat`, and `@aura3d/debug`.

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

The root page is the allowlisted local route registry. It links only:

- ten advanced gallery deep links under `/apps/advanced-examples-gallery/#...`;
- four focused Aura3D library examples under `/apps/wow-*`;
- twelve authored showcase apps under `/apps/wow-*`;
- shared runtime code under `/apps/wow-common/` that is not a standalone route.

The legacy `examples/` tree and older app route folders have been pruned from the checkout. Do not document, test, or link local examples outside the root registry unless they are intentionally restored and added to the allowlist.

## Basic SDK Shape

```ts
import { Renderer } from "@aura3d/engine/rendering";
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";

const renderer = await Renderer.create({ canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.glb");
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

renderer.render(scene.source);
scene.dispose();
renderer.dispose();
```

## Verification

Run the current superiority gates:

```sh
pnpm superiority
```

Run the current parity and evidence suite:

```sh
pnpm threejs-parity
```

`pnpm threejs-parity` keeps the broad Three.js parity/readiness suite fast enough for aggregate verification. Run the heavyweight advanced-gallery evidence lane explicitly after gallery-visible changes:

```sh
pnpm advanced-gallery:pipeline
```

Run the generic visual baseline smoke separately when needed:

```sh
pnpm test:visual
```

Useful focused commands:

```sh
pnpm threejs-parity:inventory
pnpm threejs-parity:same-scene-render
pnpm threejs-parity:visual-review
pnpm advanced-gallery
pnpm threejs-parity:performance
pnpm superiority:feature-parity
pnpm superiority:visual-quality
pnpm superiority:performance
pnpm superiority:animation-fidelity
pnpm superiority:physics-fidelity
pnpm superiority:memory-lifecycle
pnpm superiority:developer-workflow
pnpm superiority:claim-defense
pnpm superiority:audit
```

Primary evidence:

- `tests/reports/threejs-parity/threejs-inventory.json`
- `tests/reports/threejs-parity/visual-review.json`
- `tests/reports/threejs-parity/same-scene-render.json`
- `tests/reports/advanced-examples-gallery/` (ignored generated advanced-gallery evidence; rerun capture, review, and audit after visual/source changes)
- `tests/reports/threejs-parity/performance.json`
- `tests/reports/superiority/feature-parity.json`
- `tests/reports/superiority/visual-quality.json`
- `tests/reports/superiority/performance.json`
- `tests/reports/superiority/animation-fidelity.json`
- `tests/reports/superiority/physics-fidelity.json`
- `tests/reports/superiority/memory-lifecycle.json`
- `tests/reports/superiority/developer-workflow.json`
- `tests/reports/superiority/claim-defense.json`
- `tests/reports/superiority/superiority-audit.json`
- `docs/project/threejs-superiority-status.md`

## Benchmarks And Comparisons

A3D compares against Three.js and Babylon.js through checked-in benchmark scenes, browser tests, and reports. Current comparison artifacts live under:

- `benchmarks/threejs/`
- `benchmarks/babylon/`
- `benchmarks/aura3d/`
- `tests/reports/comparison-threejs.json`
- `tests/reports/comparison-babylon.json`
- `tests/reports/threejs-parity/`
- `tests/reports/superiority/`
- `docs/benchmarks/`
- `docs/comparisons/`
- `docs/project/threejs-superiority-status.md`

The defensible claim is not slogan-based. It is tied to report files, route screenshots, unit/browser tests, same-scene captures, benchmark outputs, and resource-lifecycle checks.

## Documentation Map

Current high-signal docs:

- [docs/agents/README.md](docs/agents/README.md)
- [docs/project/current-state.md](docs/project/current-state.md)
- [docs/project/getting-started.md](docs/project/getting-started.md)
- [docs/project/documentation-index.md](docs/project/documentation-index.md)
- [docs/project/competitive-positioning.md](docs/project/competitive-positioning.md)
- [docs/project/go-to-market-strategy.md](docs/project/go-to-market-strategy.md)
- [docs/project/threejs-superiority-status.md](docs/project/threejs-superiority-status.md)
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
- Migration from selected Three.js patterns into package-owned A3D workflows.
- Internal browser 3D tools where reliability, diagnostics, and repeatable evidence matter.

A3D should lead with proof: route health, same-scene comparison, benchmark reports, API docs, migration examples, and resource-lifecycle evidence.
