# @aura3d/physics

`@aura3d/physics` owns deterministic rigid-body simulation, collision shapes, colliders, contacts, constraints, raycasts, fixed stepping, scene/ECS bridges, and debug draw extraction.

## Public API

- `Shape`: box, sphere, capsule, plane, and indexed triangle-mesh shape descriptors plus bounds helpers.
- `RigidBody`, `Collider`: body state, forces, impulses, filters, sensors, material data, and snapshots.
- `CollisionEventQueue`, `Contact`: begin/stay/end event state and contact data.
- `Constraint`: fixed, hinge, slider, and spring-style constraint contracts.
- `PhysicsWorld`: body/collider/constraint ownership, deterministic stepping, contact solving, sleeping, raycasts, snapshots, and removal events.
- `PhysicsStepper`: fixed-step accumulator for simulation ticks.
- `ScenePhysicsBridge`, `ECSPhysicsBridge`: kinematic push and dynamic pull adapters.
- `PhysicsDebugDraw`: stable debug line extraction.

## Verification

Deterministic replay, repeated fixed-input simulation comparison, broadphase pairs and profiling counters, shape validation, mesh bounds and backface-aware raycasts, sleeping/waking, begin/stay/end contacts, removal during contact, sensors, filters, raycasts, fixed/hinge/slider/spring constraints, bridge ordering, debug draw, browser physics pixels, and performance baselines are covered by `tests/unit/workstream4.physics-animation.test.ts`, `tests/unit/physics/broadphase.test.ts`, `tests/browser/physics-browser.spec.ts`, and `tests/performance/system-baselines.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.

## Current Limits

- Supported collision shape descriptors are box, sphere, capsule, plane, and indexed triangle mesh.
- Supported constraint contracts are fixed, hinge, slider, and spring-style constraints.
- Continuous collision detection is not currently supported; fast-moving bodies use discrete fixed-step collision checks.
- The built-in broadphase is deterministic sweep-and-prune with exposed profile counters, a faster browser-first workflow than a mature native physics backend.
- The package does not claim vehicle dynamics, cloth, soft bodies, fluids, destructible simulation, or large-world streaming physics.
