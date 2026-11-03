# @aura3d/scene

`@aura3d/scene` owns transform hierarchy, scene nodes, bounds, traversal, queries, cameras, lights, renderable descriptors, scene registry, and serialization.

## Public API

- `TransformNode`, `SceneNode`, `Hierarchy`: parent/child ownership, local/world transforms, dirty propagation, traversal, and mutation safety.
- `Bounds`: bounds construction and transformed bounds helpers.
- `SceneQuery`: name, ID, type, and subtree query helpers.
- `Camera`, `PerspectiveCamera`, `OrthographicCamera`: stable camera IDs, projection parameters, viewport data, frustum contracts, and validation.
- `Light`, `DirectionalLight`, `PointLight`, `SpotLight`: stable light IDs and lighting parameters.
- `Renderable`: geometry/material renderable descriptors.
- `Scene`, `SceneSerializer`: scene root, node registry, renderables, cameras, lights, subtree registration, and deterministic serialization/deserialization.

## Transform and reparenting behavior

A finite singular transform, such as a node with zero scale, can still update
its world matrix and be reparented under an invertible parent. A singular
world matrix has no inverse: reading `transform.inverseWorldMatrix` throws
until the world matrix becomes invertible again. Cameras require an inverse
for their view matrix. The inverse remains writable for compatibility; a
caller supplying one for an invertible world is responsible for its accuracy.
It is now an accessor on the prototype rather than an enumerable own field.

`addChild(child, { preserveWorldTransform: true })` validates the destination
and stages the new transform before changing the hierarchy. A preflight error
leaves the engine-managed transform and hierarchy unchanged. Ordinary
`addChild(child)` keeps the authored local transform. Both forms commit their
hierarchy change before dirty listeners observe the invalidated subtree.
If listeners throw, the operation remains committed and raises a
`ReparentNotificationError` whose `committed` property is `true` and whose
`errors` contain the listener failures. Structural changes to either affected
scene are rejected while these notifications are being delivered; unrelated
scenes remain usable. Listener side effects and direct writes to public fields
or arrays are outside this transaction. Listener timing and notification order
therefore differ from the earlier inline behavior.

`removeChild` invalidates the detached child and its descendants, so their
world matrices are recomputed on the next world update. Listener failures after
the unlink raise a `RemovalNotificationError` with `committed: true`;
`Scene.removeNode` finishes unregistering the removed subtree before
propagating that error. `batchReparent` processes its entries in order and is
fail-fast; it does not roll back earlier entries when a later entry fails.

Disposing a node with `{ recursive: false }` detaches and invalidates its
surviving child subtrees. The children recompute their world matrices on the
next update. If their dirty listeners fail after disposal commits, the method
raises a `DisposalNotificationError` with `committed: true` and the listener
errors. Repeating disposal after notification completes is a no-op. Directly
disposing a node does not by itself unregister it from an owning `Scene`;
use scene removal when registry cleanup is needed.

## Verification

Hierarchy mutation, cycle rejection, traversal removal, dirty propagation, serialization roundtrips, node registry, renderables, cameras, lights, bounds, frustum validation, browser scene pixels, and scene/ECS integration are covered by `tests/unit/scene/hierarchy-serialization.test.ts`, `tests/unit/scene/camera-frustum.test.ts`, `tests/browser/scene-browser.spec.ts`, and `tests/integration/scene-ecs-contracts.test.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
