# Galileo3D API Overview

Version: `0.1.0-alpha.0`

This directory documents the developer-facing package surface for Galileo3D. The current package is an alpha TypeScript browser 3D engine and workflow SDK. It has real renderer, asset, animation, scene, controls, physics, editor-runtime, and Three.js migration code, but it is not a production-ready Three.js replacement yet.

Use these docs as a map to the public entrypoints. Use `docs/project/claim-guidelines.md`, `docs/project/known-limits.md`, and the V9 roadmap docs for claim boundaries.

## Install

For repo development:

```sh
pnpm install
pnpm dev
```

Open the local app registry:

```text
http://127.0.0.1:5180/
```

For package-consumer examples, the intended import target is:

```sh
pnpm add @galileo3d/engine
```

The package is still alpha. Prefer pinned versions and run local smoke tests before using it in a product branch.

## Primary Package

Most app code should start with the root package:

```ts
import {
  createG3DApp,
  createEnvironment,
  loadAsset,
  workflows
} from "@galileo3d/engine";
```

The root package re-exports the high-level app runtime, asset loading helpers, renderer entrypoints, workflow factories, diagnostics helpers, and the current V9 runtime namespace.

Use the root package when you are building:

- product viewers and configurators;
- asset inspection or GLB preview tools;
- material and environment review surfaces;
- migration experiments from a Three.js scene;
- internal browser tools that need diagnostics and repeatable rendering.

## Public Entrypoints

The current package export map includes these public subpaths:

| Entrypoint | Use it for |
|---|---|
| `@galileo3d/engine` | High-level app API, workflows, environment helpers, asset helpers, screenshot and diagnostics utilities. |
| `@galileo3d/engine/v9` | Current direct V9 runtime surface: `G3DRenderer`, `G3DScene`, and lifecycle helpers. |
| `@galileo3d/engine/rendering` | Lower-level renderer, geometry, materials, textures, render queues, state, postprocess, WebGL2/WebGPU proof APIs. |
| `@galileo3d/engine/rendering/v9` | V9 renderer wrapper API for direct render submissions. |
| `@galileo3d/engine/assets` | glTF/GLB, OBJ, texture, HDR/KTX2 hooks, inspection, render-resource conversion, asset diagnostics. |
| `@galileo3d/engine/assets/v9` | V9 asset convenience exports. |
| `@galileo3d/engine/animation` | Clips, tracks, mixers, skeletons, skinning, IK, root motion, animation diagnostics. |
| `@galileo3d/engine/scene` | Scene graph, cameras, lights, transforms, renderable scene structures. |
| `@galileo3d/engine/math` | Vector, matrix, quaternion, bounds, frustum, ray, and projection utilities. |
| `@galileo3d/engine/controls` | Orbit, trackball, transform, drag, map, fly, pointer-lock, and picking controls. |
| `@galileo3d/engine/materials` | Material descriptors, PBR helpers, presets, and validation utilities. |
| `@galileo3d/engine/environments` | Environment/HDRI registry and preview helpers. |
| `@galileo3d/engine/physics` | Deterministic browser rigid-body simulation helpers and debug data. |
| `@galileo3d/engine/editor-runtime` | Selection, command history, prefab, timeline, gizmo, static export, and editor state primitives. |
| `@galileo3d/engine/three-compat` | Partial Three.js-compatible classes, migration helpers, compatibility matrix, controls, loaders, materials, postprocess adapters. |
| `@galileo3d/engine/create-g3d` | Template scaffolding API used by the local starter generator. |

The generated export reference is [`public-api.md`](./public-api.md). Regenerate it with:

```sh
pnpm verify:api-docs -- --write
```

## Minimal App Runtime

```ts
import { createG3DApp } from "@galileo3d/engine";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Missing canvas");

const app = await createG3DApp({
  canvas,
  quality: "balanced"
});

await app.renderWorkflow("scene-showcase", { preset: "gallery" });
console.log(app.diagnostics());

await app.dispose();
```

`createG3DApp` is the highest-level browser runtime. It creates the core engine, optionally creates a WebGL2 renderer for the supplied canvas, runs workflow presets, reports diagnostics, and owns disposal.

See [`app-api.md`](./app-api.md) for details.

## Direct V9 Renderer

Use the V9 surface when you want direct control over scene construction:

```ts
import { G3DRenderer, G3DScene } from "@galileo3d/engine/v9";
import { Geometry, PBRMaterial } from "@galileo3d/engine/rendering";

const renderer = await G3DRenderer.create({
  backend: "webgl2",
  canvas,
  width: 1280,
  height: 720,
  antialias: true
});

const scene = new G3DScene();
scene.addGeometry("cube", Geometry.box());
scene.addMaterial("paint", new PBRMaterial({ baseColor: [0.8, 0.7, 0.55, 1], roughness: 0.45 }));
scene.createRenderableMesh({ geometry: "cube", material: "paint" });

renderer.render(scene);
renderer.dispose();
```

This is the more explicit path used by many current V8/V9 proof routes.

## Asset Loading Path

```ts
import { createRenderableScene, loadRenderableAsset } from "@galileo3d/engine/assets";
import { G3DRenderer } from "@galileo3d/engine/v9";

const renderer = await G3DRenderer.create({ backend: "webgl2", canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.json");
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

renderer.render(scene.source, scene.camera);
```

The asset path is strongest for checked glTF/GLB fixtures, product-scene JSON, render-resource conversion, diagnostics, and controlled route evidence. It does not imply broad glTF ecosystem parity.

## Claim Boundary

Allowed positioning:

> Galileo3D is an alpha TypeScript browser 3D engine and SDK building toward Three.js parity, with current evidence in product/asset workflows, renderer foundations, glTF loading, PBR/HDR material work, animation/skinning infrastructure, WebGL2 routes, and scoped WebGPU proofs.

Do not claim:

- full Three.js replacement;
- broad superiority over Three.js;
- Unity or Unreal replacement;
- production-ready renderer;
- complete WebGPU engine;
- complete glTF or official Three.js examples parity.

Every public claim should be tied to a package export, a route, a test, or a report.

