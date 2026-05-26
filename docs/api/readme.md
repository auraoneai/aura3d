# Aura3D API Overview

Version: `1.0.0`

This directory documents the public package surface exposed by the root `@aura3d/engine` package and the first-party workspace packages under `packages/`.

The root publish package is `@aura3d/engine`. The workspace package in `packages/engine` is named `@aura3d/engine-runtime` and provides the internal engine/runtime source that the root package re-exports through its aggregate subpaths.

## Source Of Truth

- Root export map: `package.json`
- Package entrypoints: `packages/*/src/index.ts`
- Generated export reference: `docs/api/public-api.md`
- Verification command: `pnpm verify:api-docs -- --write`

`docs/api/public-api.md` is generated from current package entrypoints. Regenerate it after changing exports.

## Install

For repository development:

```sh
pnpm install
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open:

```text
http://127.0.0.1:5180/
```

For package consumers, the intended dependency is:

```sh
pnpm add @aura3d/engine
```

## Root Package

Most application code starts with the root package:

```ts
import {
  A3DRenderer,
  A3DScene,
  createA3DApp,
  createEnvironment,
  loadAsset,
  workflows
} from "@aura3d/engine";
```

The root entrypoint re-exports the browser app API, direct advanced-runtime renderer helpers, asset helpers, workflow factories, diagnostics helpers, and selected environment/rendering utilities.

## Public Subpaths

The current root export map includes these package subpaths:

| Entrypoint | Primary use |
|---|---|
| `@aura3d/engine` | Root app/runtime helpers and selected public SDK exports. |
| `@aura3d/engine/core` | Engine lifecycle, events, scheduler, diagnostics, and disposal primitives. |
| `@aura3d/engine/math` | Vectors, matrices, quaternions, rays, bounds, planes, frustums, and projections. |
| `@aura3d/engine/scene` | Object3D-style hierarchy, cameras, lights, renderables, serialization, and instancing structures. |
| `@aura3d/engine/rendering` | Renderer, devices, geometry, textures, materials, postprocess, shadows, render targets, WebGL2/WebGPU helpers, and diagnostics. |
| `@aura3d/engine/assets` | glTF/GLB, OBJ/MTL, texture/HDR/EXR helpers, render-resource conversion, asset caches, and diagnostics. |
| `@aura3d/engine/animation` | Clips, tracks, mixers, layers, skeletons, skinning, IK, root motion, morphs, retargeting, and motion diagnostics. |
| `@aura3d/engine/controls` | Orbit, trackball, transform, drag, map, fly, first-person, pointer-lock, picking, and interaction controls. |
| `@aura3d/engine/physics` | Rigid bodies, colliders, constraints, raycasts, broadphase, character helpers, and scene sync. |
| `@aura3d/engine/input` | Browser input and WebXR session/controller helpers. |
| `@aura3d/engine/audio` | Audio clips, sources, listener, mixer, spatial audio, and effects. |
| `@aura3d/engine/apps` | `createA3DApp` and workflow preset runtime. |
| `@aura3d/engine/workflows` | Workflow factories for product, asset, material, scene, interaction, animation, and comparison surfaces. |
| `@aura3d/engine/workflows/production-runtime` | Production-runtime workflow helpers. |
| `@aura3d/engine/editor-runtime` | Editor state, selection, commands, prefab, gizmo, timeline, export, and diagnostics primitives. |
| `@aura3d/engine/three-compat` | Three.js compatibility and migration helpers. |
| `@aura3d/engine/create-aura3d` | Local project scaffolding API. |
| `@aura3d/engine/debug` | Debug overlays, scene helpers, GPU diagnostics, report helpers, and route health utilities. |
| `@aura3d/engine/production-runtime` | Production-runtime engine entrypoint. |
| `@aura3d/engine/advanced-runtime` | Advanced runtime engine entrypoint. |

Versioned aliases have been removed from the public export map. New imports should use contextual entrypoints such as `./production-runtime`, `./three-compat`, `./advanced-runtime`, `./rendering`, and `./assets`.

## Minimal App Runtime

```ts
import { createA3DApp } from "@aura3d/engine";

const canvas = document.querySelector("canvas");
if (!canvas) throw new Error("Missing canvas");

const app = await createA3DApp({
  canvas,
  quality: "balanced"
});

await app.renderWorkflow("scene-showcase", { preset: "gallery" });
console.log(app.diagnostics());

await app.dispose();
```

See `docs/api/app-api.md` for the app-level workflow API.

## Direct Rendering

```ts
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";
import { Geometry, PBRMaterial } from "@aura3d/engine/rendering";

const renderer = await A3DRenderer.create({
  backend: "webgl2",
  canvas,
  width: 1280,
  height: 720
});

const scene = new A3DScene();
scene.addGeometry("cube", Geometry.box());
scene.addMaterial("paint", new PBRMaterial({ baseColor: [0.8, 0.7, 0.55, 1] }));
scene.createRenderableMesh({ geometry: "cube", material: "paint" });

renderer.render(scene);
renderer.dispose();
```

## Asset Loading

```ts
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const asset = await loadRenderableAsset("/fixtures/asset-corpus/damaged-helmet.glb");
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

The asset path is strongest for the checked local fixtures and route evidence in this repository. Broader glTF ecosystem claims require generated reports and visual evidence.

## Claim Boundary

API docs describe importable package surfaces. They are not a blanket claim that every Three.js, Babylon.js, Unity, Unreal, WebGPU, or glTF ecosystem behavior is covered. Public claims should follow `docs/project/claim-guidelines.md` and the current status in `docs/project/threejs-superiority-status.md`.
