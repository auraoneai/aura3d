# Physics

Version: `1.0.0`

Aura3D physics code lives in `packages/physics` and is used by routes and workflow examples.

## Code

- `packages/physics/src/PhysicsWorld.ts`
- `packages/physics/src/RigidBody.ts`
- `packages/physics/src/Collider.ts`
- `packages/physics/src/Constraints.ts`
- `packages/physics/src/CharacterController.ts`
- `packages/physics/src/Raycast.ts`
- `/apps/advanced-examples-gallery/#physics-playground`

## Current Areas

- Rigid bodies and colliders.
- Constraints.
- Raycasts.
- Broadphase helpers.
- Character-controller-facing helpers.
- Scene sync and debug route evidence.

## Boundary

The physics package is not documented as a full replacement for a mature dedicated physics engine. Claims should name the exact simulation feature, route, unit test, or report that backs them.

## Current Limits

Physics support is scoped to the implemented runtime primitives and route evidence. Complex solver behavior, large-world stability, and engine-replacement claims remain out of scope until covered by focused tests and reports.

## Current Limits

- Physics support is limited to the implemented runtime primitives and tested routes; advanced solver, vehicle, cloth, and large-scale simulation claims require separate evidence.
