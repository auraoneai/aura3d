# @galileo3d/scene

`@galileo3d/scene` owns transform hierarchy, scene nodes, bounds, traversal, queries, cameras, lights, renderable descriptors, scene registry, and serialization.

## Public API

- `TransformNode`, `SceneNode`, `Hierarchy`: parent/child ownership, local/world transforms, dirty propagation, traversal, and mutation safety.
- `Bounds`: bounds construction and transformed bounds helpers.
- `SceneQuery`: name, ID, type, and subtree query helpers.
- `Camera`, `PerspectiveCamera`, `OrthographicCamera`: stable camera IDs, projection parameters, viewport data, frustum contracts, and validation.
- `Light`, `DirectionalLight`, `PointLight`, `SpotLight`: stable light IDs and lighting parameters.
- `Renderable`: geometry/material renderable descriptors.
- `Scene`, `SceneSerializer`: scene root, node registry, renderables, cameras, lights, subtree registration, and deterministic serialization/deserialization.

## Verification

Hierarchy mutation, cycle rejection, traversal removal, dirty propagation, serialization roundtrips, node registry, renderables, cameras, lights, bounds, frustum validation, browser scene pixels, and scene/ECS integration are covered by `tests/unit/scene/hierarchy-serialization.test.ts`, `tests/unit/scene/camera-frustum.test.ts`, `tests/browser/scene-browser.spec.ts`, and `tests/integration/scene-ecs-contracts.test.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
