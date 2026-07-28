# Physics

Version: 1.4.5

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
- Conservative swept-bounds time-of-impact queries.
- Opt-in adaptive-substep continuous-collision protection on both physics backends.
- Broadphase helpers.
- Character-controller-facing helpers.
- Scene sync and debug route evidence.

## Aura3D advantage

The physics package is not documented as a full replacement for a mature dedicated physics engine. Claims should name the exact simulation feature, route, unit test, or report that backs them.

## Boundary

The physics boundary is `@aura3d/engine/physics`. Claims about collision, solver, or character-controller behavior must cite the specific package API and route evidence that backs them.

## Current Limits

- Physics support is limited to the implemented runtime primitives and tested routes; advanced solver, vehicle, cloth, and large-scale simulation claims require separate evidence.
- Native `aura-js` uses accumulated Coulomb friction and bounded adaptive CCD, but still lacks oriented box/convex/mesh/heightfield narrow-phase and angular contact impulses.
- Route claims must identify whether they use native `aura-js`, `cannon-es`, or a route-local kinematic/combat system.
