# Physics Runtime

Version: 1.4.5

`@aura3d/physics` is the first-party deterministic physics package created for rigid bodies, colliders, constraints, raycasts, scene sync, debug draw, and workflow evidence. The package is exported from `@aura3d/engine/physics`.

## Package Surface

| Capability | Source |
|---|---|
| Physics world ownership and stepping | `packages/physics/src/PhysicsWorld.ts`, `PhysicsStepper.ts` |
| Bodies and colliders | `RigidBody.ts`, `Collider.ts`, `Shape.ts` |
| Contacts and collision events | `CollisionEvents.ts` |
| Constraints | `Constraint.ts`, `Constraints.ts` |
| Queries | `Raycast.ts` |
| Continuous queries | `TimeOfImpact.ts` |
| Authored-unit character movement | `ArcadeCharacterController.ts`, `KinematicBody.ts`, `KinematicWorld.ts` |
| Physical character movement | `RapierCharacterControllerHandle` in optional `@aura3d/physics-rapier` |
| Scene/ECS bridges | `ScenePhysicsBridge.ts`, `ECSPhysicsBridge.ts` |
| Debug visualization | `PhysicsDebugDraw.ts`, `packages/debug/src/PhysicsDebugAdapter.ts` |
| Authored-unit arcade helpers | `ArcadeVehicleTelemetry.ts`; these sample telemetry and forces but do not integrate a physical vehicle |
| Optional ecosystem owners | Physical vehicles use `@aura3d/physics-rapier`; navigation/crowds use `@aura3d/navigation-recast` |
| Optional production solver | `@aura3d/physics-rapier` (explicit adapter over `@dimforge/rapier3d-compat`) |

## Runtime Model

Use `PhysicsWorld` as the owner of bodies, colliders, constraints, contacts, and deterministic stepping. Use `PhysicsStepper` when the app frame rate and simulation tick rate differ. Scene or ECS bridges should be the boundary between simulation state and renderable transforms.

The advanced gallery `physics-playground` route uses this model for deterministic rigid-body/contact movement and route-level manipulation evidence. It intentionally uses primitive/proxy colliders for a stable showcase route.

Aura3D does not currently claim first-party cloth, soft-body, fluid, fracture, or volumetric fire/smoke solvers. Earlier deterministic descriptor fixtures for those categories were removed because reporting a configuration and derived counters did not demonstrate a working simulation. Projects that need production rigid-body physics can opt into `@aura3d/physics-rapier`; advanced simulation categories remain integration opportunities until backed by executable runtime and browser evidence.

## Supported Evidence

The physics runtime supports evidence for:

- deterministic fixed-step simulation;
- box, sphere, capsule, plane, and indexed triangle-mesh shape descriptors;
- body snapshots, forces, impulses, filters, sensors, and material data;
- begin/stay/end contact events;
- fixed, hinge, slider, and spring-style constraints;
- raycasts and scene queries;
- conservative swept-bounds `timeOfImpact(...)` queries;
- opt-in adaptive-substep CCD on `aura-js` and `cannon-es`, with explicit substep-limit policy and snapshot diagnostics;
- broadphase profiling counters;
- debug-line extraction;
- scene/ECS synchronization.

## Fighting Movement And Combat Helpers

For 2.5D fighting routes, keep movement and combat deterministic and evidence
driven. A route should expose the tuning constants it uses for jump height,
fast-fall/down input, dash distance, guard state, hitstun, knockback, bounds,
and KO/reset behavior.

Minimum expected behavior:

| Input/state | Runtime expectation |
| --- | --- |
| Jump | Applies a vertical impulse high enough to read visually and emits a landing/recovery state when grounded again. |
| Down | While grounded, enters crouch or low-profile state; while airborne, increases downward velocity for fast-fall. |
| Dash | Applies bounded horizontal velocity with startup/recovery and cannot tunnel through arena bounds. |
| Guard | Marks the combatant as guarding; incoming hit resolution should reduce/block damage and apply blockstun instead of normal hitstun. |
| Hitstun | Temporarily disables new actions, applies knockback, and clears or delays recovery by move data. |
| KO | Locks combat, clears active hitboxes, and prevents further damage until reset/rematch. |

Source-level example:

```ts
const body = game.kinematicBody({
  id: "player",
  position: { x: -1.2, y: 0, z: 0 },
  bounds: { minX: -3, maxX: 3, minY: 0, maxY: 3 },
  gravity: -18
});

if (input.pressed("jump") && body.grounded) {
  body.velocity.y = 8.5;
}

if (input.held("down") && !body.grounded) {
  body.velocity.y -= 18 * dt;
}

if (input.pressed("dash")) {
  body.velocity.x = body.facing * 7;
}

const combat = game.combatWorld({
  actors: [
    { id: "player", health: 100 },
    { id: "rival", health: 100 }
  ],
  lockOnKnockout: true
});

if (input.held("guard")) {
  combat.setGuard("player", true);
}
```

Release proof should show every listed input changing state and should verify
that reset clears HP, velocity, guard, hitstun, active hitboxes, KO lock, and
recorded proof counters.

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

Useful commands:

```sh
pnpm exec vitest run tests/unit/physics tests/unit/workstream4.physics-animation.test.ts --reporter=dot
pnpm advanced-gallery:pipeline
```

## Current Limits

- The built-in broadphase is deterministic and inspectable.
- Continuous collision protection is opt-in and bounded. It uses adaptive substeps rather than a general exact swept-shape solver; `timeOfImpact(...)` conservatively sweeps finite world AABBs and excludes rotation, angular velocity, and infinite plane bounds.
- Native `aura-js` friction uses accumulated normal/tangent impulses and a Coulomb cone. Contacts with a proven world-space point use linear and angular relative velocity, world-space principal inverse inertia, and point-aware effective mass for both normal and friction impulses. Analytic pairs without a reliable point retain their established center-linear path.
- Native `aura-js` routes rotated box pairs through 15-axis OBB SAT, convex-hull pairs through GJK/EPA with a SAT degeneracy fallback, and box/convex/sphere/capsule contacts against indexed meshes and heightfields through triangle-backed narrow phase. Mesh↔mesh and other unsupported surface/surface pairs remain outside the accepted contract.
- `cannon-es@0.20.0` supplies the tested angular-contact backend for Turbo Drift Circuit and Blockfall Reactor. Aura3D's adaptive-substep wrapper supplies their fast-body protection.
- The advanced gallery does not claim mesh-derived colliders or full articulated robot dynamics.
- Vehicle, cloth, soft-body, fluid, fracture, fire/smoke, and crowd modules are fixture/evidence surfaces unless a specific test or route proves production behavior.
