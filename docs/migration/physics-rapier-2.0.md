# Physical simulation migration for the next major release

The next major Aura3D release makes `@aura3d/physics-rapier` the selected
optional physical-simulation owner. Authored-unit arcade motion remains in
`@aura3d/physics`, but it is not interchangeable with rigid-body simulation.

This is a major-version migration. The 1.5.2 package exposed implementation,
navigation, simulated-capability, and controller modules from its root barrel;
removing those exports while changing the physical solver and initialization
semantics cannot honestly ship as a 1.6-compatible minor.

## Removed 1.5.2 root modules

| Removed module | Replacement or disposition |
| --- | --- |
| `CharacterController` | Use the physical Rapier controller or an explicitly authored-unit controller, as described below. |
| `Navigation`, `Steering`, `Crowd` | Use `@aura3d/navigation-recast`; static navmeshes should be generated offline and linked as typed navigation assets. |
| `VehicleDynamics` | Use the Rapier dynamic raycast vehicle for physical simulation, or `ArcadeVehicleTelemetry`/the public racing kit for authored-unit arcade motion. |
| `NarrowPhase` | No public replacement. Contact generation belongs to the sole selected Rapier physical owner. |
| `PlatformerFixtures`, `PhysicsSandboxFixtures` | No runtime replacement. These deterministic descriptor fixtures did not establish mounted behavior. Use real route/runtime evidence. |
| `ClothFixtures`, `SoftBodyFixtures`, `FractureFixtures`, `FluidFixtures`, `FireSmokeFixtures` | No runtime replacement. Aura3D does not claim these simulations until an executable selected owner and mounted browser evidence exist. |

`PhysicsWorld` remains the compatibility-shaped Aura3D contract for bodies,
colliders, constraints, queries, fixed stepping, scene bridges, and debug draw,
but now delegates physical behavior to Rapier. `backend: "auto"` and
`backend: "rapier"` are valid. The old `"aura-js"` and `"cannon-es"` values
throw with migration guidance instead of silently selecting a different solver.

## Character movement

The former rigid-body `CharacterController` export has been removed. Choose the
replacement by semantics:

- Physical, collision-constrained world movement: lazily create
  `RapierPhysicsWorld`, create a `kinematic-position` capsule body, then use
  `RapierCharacterControllerHandle.move()`. The returned movement reports the
  requested/applied translation, grounding, collision count, and scheduled next
  position.
- Deterministic authored-unit game movement: use `ArcadeCharacterController`,
  `FightingCharacterController`, or `KinematicBody`. These APIs deliberately do
  not claim physical slopes, contact impulses, or depenetration.

```ts
import { createRapierPhysics } from "@aura3d/physics-rapier";

const world = await createRapierPhysics();
world.createBody({
  type: "fixed",
  position: [0, -0.5, 0],
  shape: { kind: "box", halfExtents: [20, 0.5, 20] }
});
const body = world.createBody({
  type: "kinematic-position",
  position: [0, 1, 0],
  shape: { kind: "capsule", halfHeight: 0.5, radius: 0.25 }
});
const controller = world.createCharacterController()
  .enableAutostep(0.4, 0.2)
  .enableSnapToGround(0.2)
  .setMaxSlopeClimbAngle(Math.PI / 4);

const movement = controller.move(body, [0.1, -0.05, 0]);
world.step(1 / 60);
```

The adapter owns the native controller and world. Dispose the controller before
the world, or dispose the world to release all remaining adapter-owned native
objects.

## Evidence

- Selection: `docs/architecture/adr/0004-physical-simulation-is-optional-rapier.md`
- Functional adapter: `packages/physics-rapier/src/index.ts`
- Native movement proof: `tests/unit/physics-rapier/rapier-adapter.test.ts`
- Arcade browser proof: `tests/browser/runtime-character-controller.spec.ts`
- R8 deletion proof: `tests/reports/physical-character-controller-delete-final.json`

The clean-package migration gate packs `@aura3d/physics` and
`@aura3d/physics-rapier`, installs both tarballs into an empty npm consumer,
proves the removed backend value fails loudly, steps and disposes the
compatibility-shaped world on Rapier, and independently creates, steps, and
disposes the native optional adapter. The coordinated package version must be
`2.0.0` before publication.
