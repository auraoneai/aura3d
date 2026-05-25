# V9 Math And Scene Foundation

G3D has first-party math and scene code. V9 does not depend on Three.js for the G3D-side transform hierarchy.

## Real Code

- `packages/math/src/*`: vector, matrix, quaternion, ray, bounds, color, curve, transform, and interpolation utilities.
- `packages/scene/src/*`: `Object3D`, `Scene`, `SceneNode`, `TransformNode`, cameras, lights, bounds, hierarchy, serialization, and scene queries.
- `packages/engine/src/advanced-runtime/G3DScene.ts`: public V9 scene wrapper with geometry/material libraries and `toRenderSource()`.
- `packages/rendering/src/advanced-runtime/RendererV9.ts` and `packages/engine/src/advanced-runtime/G3DRenderer.ts`: V9 render wrappers over the current renderer.

## What Is Supported

- Scene graph hierarchy with inherited transforms.
- Local/world matrix update before rendering/culling.
- Perspective and orthographic camera support.
- Renderable mesh handles through scene resources.
- Scene-owned disposal for geometry and material libraries.
- Auto-frame render source defaults through `G3DScene.toRenderSource()`.

## Evidence

- `tests/reports/v9/api-surface.json`
- `tests/reports/v9/same-scene-render.json`
- `apps/public-scene/`
- Existing math, scene, camera, hierarchy, and renderer unit tests referenced by the V9 inventory/status tools.

## Remaining Deltas

- Multiple DOM elements/views are still partial in the V9 inventory.
- WebXR camera/projection integration remains partial.
- V9 wrappers are still thin convenience APIs over the underlying packages, not a complete new scene API.
- Broad Three.js `Object3D` API compatibility remains owned by `packages/three-compat`, not by the core scene package alone.
