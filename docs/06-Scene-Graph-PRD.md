# Scene Graph PRD

## Purpose
The scene graph owns object hierarchy, transform propagation, bounds, cameras, lights, renderable attachments, and scene queries. It provides the author-facing object model and the renderer-facing traversal contract.

## Lessons From Failed Attempts
- Current G3D docs described transform hierarchy, but E2E reports said transform hierarchy was not fully implemented.
- `G3D2025` had scene graph and culling summaries, but data-flow docs still showed integration gaps.
- `Old-G3D` had `Object3D`, scene, camera, light, and renderer coupling spread across many files and migrations, making it hard to know what owned transforms.

Reuse conceptually:

- Object-style scene nodes for authoring.
- Dirty transform propagation.
- Bounds and scene queries.
- Cameras and lights as scene objects.

Discard:

- Multiple transform owners.
- Renderer-owned scene mutation.
- Scene graph hidden inside ECS only.

## Target Architecture
`scene` is a standalone package. ECS may reference scene nodes through bridges, but scene graph does not require ECS. Rendering reads scene graph snapshots and must not mutate simulation state.

Public API:

```ts
const scene = new Scene();
const node = scene.createNode("cube");
node.transform.position.set(0, 1, 0);
scene.root.addChild(node);
scene.updateWorldTransforms();
```

## File-By-File Implementation Plan

### `packages/scene/src/Scene.ts`
- Purpose: root container and scene update owner.
- Contains: `Scene`, root node, update methods, registry by ID/name.
- Edge cases: duplicate names, node removal during traversal.
- Tests: add/remove, traversal, dirty propagation.

### `packages/scene/src/SceneNode.ts`
- Purpose: base node with hierarchy and components/attachments.
- Contains: ID, name, parent, children, local/world transform, visibility.
- Edge cases: self-parenting, cycles, reparent preserving world transform.
- Tests: cycle rejection, reparenting, traversal order.

### `packages/scene/src/TransformNode.ts`
- Purpose: transform-specific helper and dirty flags.
- Contains: local TRS, world matrix, inverse world matrix.
- Tests: nested transforms, rotation/scale, dirty child updates.

### `packages/scene/src/Hierarchy.ts`
- Purpose: hierarchy operations isolated from node data.
- Tests: batch reparent, ancestor checks.

### `packages/scene/src/Bounds.ts`
- Purpose: local/world AABB and sphere update.
- Edge cases: empty bounds, negative scale, skinned bounds later.
- Tests: world bounds from child hierarchy.

### `packages/scene/src/Camera.ts`
- Purpose: abstract camera.
- Contains: view/projection matrices, viewport, layers.
- Tests: view matrix and frustum.

### `packages/scene/src/PerspectiveCamera.ts`
- Purpose: perspective projection.
- Edge cases: invalid fov, near/far.
- Tests: projection matrix reference values.

### `packages/scene/src/OrthographicCamera.ts`
- Purpose: orthographic projection.
- Tests: projection matrix and resizing.

### `packages/scene/src/Light.ts`
- Purpose: base light contract.
- Contains: color, intensity, shadows flag, layer mask.
- Tests: intensity validation.

### `packages/scene/src/DirectionalLight.ts`
- Purpose: sun/directional lights.
- Tests: direction from transform.

### `packages/scene/src/PointLight.ts`
- Purpose: point light with range.
- Tests: bounds/range.

### `packages/scene/src/SpotLight.ts`
- Purpose: spot light with angle and penumbra.
- Tests: cone validation.

### `packages/scene/src/Renderable.ts`
- Purpose: renderable attachment: geometry/material handles and render layer data.
- Edge cases: missing material, missing geometry.
- Tests: renderer consumes renderables without scene mutation.

### `packages/scene/src/SceneQuery.ts`
- Purpose: find nodes by name, type, bounds, layer.
- Tests: query correctness after reparent/remove.

### `packages/scene/src/SceneSerializer.ts`
- Purpose: serialize basic scene hierarchy.
- Edge cases: asset handles, stable IDs.
- Tests: roundtrip simple scene.

### `packages/scene/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Nested transform hierarchy works deterministically.
- Reparenting cannot create cycles.
- Cameras produce correct view/projection/frustum data.
- Renderables, cameras, and lights can be traversed without renderer mutation.
- Scene serialization roundtrips a simple scene.

## Testing Checklist
- Unit: hierarchy, transforms, bounds, cameras, lights.
- Integration: scene-to-renderer draw list.
- Browser/runtime: render nested cubes with inherited transforms.
- Visual: camera projection grid, light direction debug.
- Regression: no transform owner duplication between scene and ECS.

## Implementation Order
1. `SceneNode`, `Hierarchy`, transform propagation.
2. `Scene` traversal and queries.
3. Bounds.
4. Cameras.
5. Lights.
6. Renderable attachment.
7. Serialization.

