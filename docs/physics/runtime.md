# Physics Runtime

Version: 1.0.0

`@aura3d/physics` is the first-party deterministic physics package created for rigid bodies, colliders, constraints, raycasts, scene sync, debug draw, and workflow evidence. The package is exported from `@aura3d/engine/physics`.

## Package Surface

| Capability | Source |
|---|---|
| Physics world ownership and stepping | `packages/physics/src/PhysicsWorld.ts`, `PhysicsStepper.ts` |
| Bodies and colliders | `RigidBody.ts`, `Collider.ts`, `Shape.ts` |
| Contacts and collision events | `CollisionEvents.ts` |
| Constraints | `Constraint.ts`, `Constraints.ts` |
| Queries | `Raycast.ts` |
| Character and movement helpers | `CharacterController.ts`, `Navigation.ts`, `Steering.ts` |
| Scene/ECS bridges | `ScenePhysicsBridge.ts`, `ECSPhysicsBridge.ts` |
| Debug visualization | `PhysicsDebugDraw.ts`, `packages/debug/src/PhysicsDebugAdapter.ts` |
| Fixture systems | `PhysicsSandboxFixtures.ts`, `PlatformerFixtures.ts`, `VehicleDynamics.ts`, `ClothFixtures.ts`, `SoftBodyFixtures.ts`, `FluidFixtures.ts`, `FractureFixtures.ts`, `FireSmokeFixtures.ts`, `Crowd.ts` |

## Runtime Model

Use `PhysicsWorld` as the owner of bodies, colliders, constraints, contacts, and deterministic stepping. Use `PhysicsStepper` when the app frame rate and simulation tick rate differ. Scene or ECS bridges should be the boundary between simulation state and renderable transforms.

The advanced gallery `physics-playground` route uses this model for deterministic rigid-body/contact movement and route-level manipulation evidence. It intentionally uses primitive/proxy colliders for a stable showcase route.

## Supported Evidence

The physics runtime supports evidence for:

- deterministic fixed-step simulation;
- box, sphere, capsule, plane, and indexed triangle-mesh shape descriptors;
- body snapshots, forces, impulses, filters, sensors, and material data;
- begin/stay/end contact events;
- fixed, hinge, slider, and spring-style constraints;
- raycasts and scene queries;
- broadphase profiling counters;
- debug-line extraction;
- scene/ECS synchronization.

## Verification

Focused coverage lives in:

- `tests/unit/workstream4.physics-animation.test.ts`
- `tests/unit/physics/broadphase.test.ts`
- `tests/unit/physics/ccd-or-fast-body.test.ts`
- `tests/unit/physics/constraints-stress.test.ts`
- `tests/unit/physics/crowd.test.ts`
- `tests/unit/physics/navigation.test.ts`
- `tests/unit/physics/steering.test.ts`
- `tests/unit/physics/stress-scenes.test.ts`
- `tests/browser/physics-browser.spec.ts`
- `tests/browser/advanced-examples-gallery.spec.ts`
- `tools/superiority-physics-fidelity/index.ts`

Useful commands:

```sh
pnpm exec vitest run tests/unit/physics tests/unit/workstream4.physics-animation.test.ts --reporter=dot
pnpm superiority:physics-fidelity
pnpm advanced-gallery:pipeline
```

## Current Limits

- The built-in broadphase is deterministic and inspectable, not a mature native physics backend replacement.
- Continuous collision detection is bounded; fast bodies use fixed-step discrete checks where the current tests cover them.
- The advanced gallery does not claim mesh-derived colliders or full articulated robot dynamics.
- Vehicle, cloth, soft-body, fluid, fracture, fire/smoke, and crowd modules are fixture/evidence surfaces unless a specific test or route proves production behavior.
- Physics superiority language must point to `tests/reports/superiority/physics-fidelity.json` and the route/test evidence that generated it.
