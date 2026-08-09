# Physical simulation migration for the next major release

The next major Aura3D release makes `@aura3d/physics-rapier` the selected
optional physical-simulation owner. Authored-unit arcade motion remains in
`@aura3d/physics`, but it is not interchangeable with rigid-body simulation.

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

The Cannon-backed world migration is still in progress. This document must be
expanded with its body/collider/joint/query mapping before the major release is
published.
