# Migration From Three.js

Version: 1.0.0

Claim wording in this migration guide is bounded by `docs/project/v2-claim-registry.md`.

Aura3D includes migration helpers and a partial Three.js compatibility layer, but the current project is not a drop-in replacement for Three.js. Treat migration as an incremental rewrite toward A3D package APIs.

## Current Migration Status

The repo contains:

- `@aura3d/engine/three-compat` for partial Three.js-compatible classes and adapters;
- `migrateThreeToA3D(...)` for source-level import guidance;
- compatibility inventory and matrix helpers;
- V5/V6/V8/V9 route and report evidence for selected equivalent scenes;
- app templates and workflows that show A3D-native patterns.

The migration target is not "run every Three.js app unchanged." The target is "move supported scene, asset, material, control, animation, and postprocess workflows onto explicit A3D APIs."

## Recommended Migration Path

1. Inventory the current Three.js app.
2. Identify the real workflow: product viewer, asset viewer, material review, configurator, interactive scene, or custom renderer.
3. Replace private Three.js scene setup with a A3D-native route or template.
4. Use `@aura3d/engine/three-compat` only as a bridge for supported classes.
5. Move rendering to `A3DRenderer` or `createA3DApp`.
6. Move asset loading to `loadRenderableAsset`, `GLTFLoader`, or `createRenderableScene`.
7. Compare one scene at a time with screenshots, diagnostics, and route reports.

## Import Mapping

Three.js style:

```ts
import * as THREE from "three";
```

Bridge layer for supported symbols:

```ts
import {
  MeshCompat,
  Object3DCompat,
  PerspectiveCameraCompat,
  Vector3Compat
} from "@aura3d/engine/three-compat";
```

A3D-native runtime:

```ts
import { A3DRenderer, A3DScene } from "@aura3d/engine/v9";
import { Geometry, PBRMaterial } from "@aura3d/engine/rendering";
```

High-level app runtime:

```ts
import { createA3DApp, workflows } from "@aura3d/engine";
```

## Compatibility Layer Coverage

The compatibility package currently includes partial surfaces for:

- core object classes: Object3D, Group, Mesh, Scene, Raycaster;
- math: Color, Vector3, Matrix4, Quaternion;
- cameras: perspective and orthographic;
- common geometries and buffer geometry;
- common materials, shader material variants, textures, render targets;
- loaders: GLTF, OBJ, MTL, HDR, EXR, KTX2, cube and texture loaders;
- controls: orbit, trackball, transform, drag, map, fly, first-person, pointer-lock;
- animation: clips, actions, mixer, skeleton, skinned mesh, morph targets;
- postprocess: composer and common pass adapters;
- lights and helpers;
- inventory, matrix, warning, and migration utilities.

Coverage is partial. Unsupported APIs should be treated as migration work, not hidden behind permissive shims.

## Practical Replacement Patterns

### Renderer

```ts
const renderer = await A3DRenderer.create({
  backend: "webgl2",
  canvas,
  width,
  height,
  antialias: true
});
```

### Scene

```ts
const scene = new A3DScene();
scene.addGeometry("box", Geometry.box());
scene.addMaterial("mat", new PBRMaterial({ baseColor: [1, 1, 1, 1] }));
scene.createRenderableMesh({ geometry: "box", material: "mat" });
```

### Assets

```ts
const asset = await loadRenderableAsset("/model.glb", { type: "gltf" });
const renderable = await createRenderableScene(asset, { camera: "auto-frame" });
renderer.render(renderable.source, renderable.camera);
```

### Product Workflow

```ts
const app = await createA3DApp({ canvas, quality: "balanced" });
await app.renderWorkflow("product-configurator", { productId: "demo-product" });
```

## Benchmarks And Evidence

Migration claims should cite current reports, for example:

- `tests/reports/three-compat-threejs-compatibility-matrix.json`;
- `tests/reports/three-compat-threejs-runtime-parity.json`;
- `tests/reports/three-compat-threejs-visual-parity.json`;
- `tests/reports/production-runtime-threejs-parity-readiness.json`;
- `tests/reports/current-routes-threejs-parity.json`;
- `tests/reports/v9/threejs-inventory.json`;
- `docs/project/v9-roadmap-parity-matrix.md`.

These reports are scoped evidence. They do not prove broad superiority or complete official example parity.

## What Not To Migrate Yet

Delay migration or keep Three.js in place when the app depends on:

- unsupported official examples;
- advanced custom shader chunks or node-material graphs not represented in A3D;
- broad loader/plugin ecosystem integrations;
- production-proven WebXR;
- mature postprocessing stacks beyond current A3D passes;
- large public asset corpora that have not been validated in A3D;
- production support guarantees.

## Policy

- Public API renames, removed exports, constructor changes, and behavior changes must be listed in `CHANGELOG.md`.
- Public docs must use package exports, not private source paths.
- Migration docs must not claim production stability or full Three.js replacement.
- Re-run `pnpm verify:exports`, `pnpm verify:imports`, `pnpm verify:claims`, and the relevant V8/V9 route checks after migration-related API changes.
