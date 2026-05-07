# Physics Engine PRD

## Purpose
Physics provides deterministic fixed-step simulation for rigid bodies, colliders, constraints, raycasts, collision events, and scene/ECS synchronization. It must be testable in isolation and integrated with visible scene objects.

## Lessons From Failed Attempts
- The prompt objective explicitly states physics does not fully work.
- Current examples and docs include physics features, but E2E and example docs expose incomplete integration and stub raycasts.
- `G3D2025` had physics PRDs and integration tests, but broad implementation claims outpaced proof.
- `Old-G3D` had advanced GPU rigidbody and simulation claims, but many systems were not really activated.

Reuse conceptually:

- Fixed timestep simulation.
- Scene/ECS bridges.
- Debug draw.
- Constraint taxonomy.

Discard:

- Physics coupled directly to render state.
- Non-deterministic update order.
- Placeholder raycasts.
- Advanced fluids/cloth before rigidbody acceptance.

## Target Architecture
Phase 1 physics is deterministic rigidbody physics with optional backend abstraction. The rebuild may use a proven library such as Rapier for narrowphase/solver if wrapped behind Galileo3D contracts, but deterministic tests remain mandatory.

Public API:

```ts
const physics = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
const body = physics.createRigidBody({ type: "dynamic", position });
const collider = physics.createCollider(body, Shape.box(1, 1, 1));
physics.step(1 / 60);
```

## File-By-File Implementation Plan

### `packages/physics/src/PhysicsWorld.ts`
- Purpose: simulation owner.
- Contains: bodies, colliders, constraints, events, stepping.
- Edge cases: body removal during contact, sleeping bodies, zero gravity.
- Tests: falling body, static collision, deterministic replay.

### `packages/physics/src/PhysicsStepper.ts`
- Purpose: fixed-step integration boundary.
- Contains: accumulator bridge to core fixed step.
- Tests: identical steps produce identical results.

### `packages/physics/src/RigidBody.ts`
- Purpose: body state and API.
- Contains: type, mass, velocity, forces, damping, sleep state.
- Edge cases: kinematic body, infinite mass, force clear timing.
- Tests: force integration, impulse, damping.

### `packages/physics/src/Collider.ts`
- Purpose: collision shape attachment.
- Contains: shape, material, sensor flag, collision layers.
- Tests: overlap and collision filters.

### `packages/physics/src/Shape.ts`
- Purpose: box, sphere, capsule, plane, mesh shape descriptors.
- Edge cases: invalid dimensions, mesh without indices.
- Tests: validation and bounds.

### `packages/physics/src/CollisionEvents.ts`
- Purpose: begin/stay/end contact event stream.
- Edge cases: sensor events, body removal before end event.
- Tests: event ordering and payloads.

### `packages/physics/src/Constraint.ts`
- Purpose: fixed, hinge, slider, spring constraints.
- Edge cases: broken anchors, invalid connected bodies.
- Tests: fixed constraint and hinge basics.

### `packages/physics/src/Raycast.ts`
- Purpose: raycast and shape cast APIs.
- Edge cases: initial overlap, layer masks, backfaces for mesh.
- Tests: hit/miss, closest/all hits.

### `packages/physics/src/ScenePhysicsBridge.ts`
- Purpose: sync physics bodies with scene nodes.
- Contains: push transforms to bodies before step for kinematic objects; pull dynamic transforms after step; interpolation support.
- Edge cases: parented scene nodes, scale mismatch.
- Tests: dynamic cube visible movement, kinematic platform.

### `packages/physics/src/ECSPhysicsBridge.ts`
- Purpose: sync physics with ECS components.
- Edge cases: component removed during physics step.
- Tests: component-to-body and body-to-component sync.

### `packages/physics/src/PhysicsDebugDraw.ts`
- Purpose: generate lines/shapes for debug render pass.
- Tests: line count and transform correctness.

### `packages/physics/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Deterministic replay test passes for fixed input sequence.
- Dynamic body falls and collides with static ground at expected approximate time.
- Collision begin/end events fire exactly once per contact pair transition.
- Raycast hit/miss is real, not a stub.
- Scene bridge makes a rendered cube match simulated body state.
- ECS bridge updates transform components without ordering ambiguity.

## Testing Checklist
- Unit: shapes, body integration, collisions, raycast, constraints.
- Integration: physics fixed phase in engine loop, scene sync, ECS sync.
- Browser/runtime: visual falling cubes demo.
- Visual validation: physics debug draw overlay.
- Physics correctness: determinism, conservation sanity, stable stacking basics.

## Implementation Order
1. Shape and body descriptors.
2. Physics world with stepping.
3. Basic colliders and collision events.
4. Raycast.
5. Scene bridge.
6. ECS bridge.
7. Constraints.
8. Debug draw and demos.

