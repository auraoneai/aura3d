# Physics

Version: `0.1.0-alpha.0`

The physics package provides deterministic browser rigid-body primitives, constraints, stepping helpers, scene/ECS bridges, debug draw data, and higher-level fixture systems. The public package is `@galileo3d/engine/physics`.

## Package Surface

Current exports include:

- shapes, rigid bodies, colliders, and collision events;
- constraints and raycasts;
- `PhysicsWorld` and fixed-step helpers;
- scene and ECS physics bridges;
- debug draw data;
- character controller, navigation, steering, crowd, and vehicle-dynamics APIs;
- fixture helpers for platformer, sandbox, cloth, soft-body, fracture, fluid, and fire/smoke demonstrations.

Some exported systems are fixture or evidence helpers. Treat them as alpha APIs unless a specific production gate says otherwise.

## Simulation Ownership

Application code owns the loop:

```ts
import { PhysicsWorld, Shape } from "@galileo3d/engine/physics";

const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
const body = world.createRigidBody({
  mass: 1,
  shape: Shape.sphere(0.5),
  position: [0, 4, 0]
});

world.step(1 / 60);
console.log(body.position);
```

Physics should not directly own DOM events, UI state, or renderer presentation. Copy simulation results into scene or renderer state explicitly.

## Strong Use Cases

- simple rigid-body browser demos;
- raycast picking and impulse routes;
- debug collision visualization;
- deterministic route evidence;
- product/editor tools that need bounded interaction physics.

## Boundaries

Do not claim:

- native physics-engine parity;
- production vehicle dynamics;
- production cloth, soft bodies, fluids, fracture, or fire/smoke simulation;
- continuous collision detection for fast-body gameplay;
- large-world physics streaming readiness.

Physics route screenshots and diagnostics prove the specific route, not a general-purpose game physics stack.

## Boundary

The physics boundary is deterministic simulation and query data; DOM events, UI state, and renderer presentation stay app-owned.

## Current Limits

Current limits include native physics-engine parity, production vehicles, cloth, fluids, fracture, continuous collision detection, and large-world physics streaming.
