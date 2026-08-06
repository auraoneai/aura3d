import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape, type PhysicsShape } from "../../../packages/physics/src/index.js";

/**
 * Defect class: **engine**, same family as the joint no-op recorded in
 * `PhysicsWorld.stepCannon` and the `applyForce` drop recorded in `syncCannonFromAura`.
 *
 * `toCannonShape` handled only box / sphere / capsule / plane. The remaining three public
 * `Shape` factories — `Shape.mesh`, `Shape.convexHull`, `Shape.heightfield` — returned
 * `undefined`, which `addCannonCollider` turned into `disableCannonBackend(...)`. That call
 * does not throw and does not warn: it silently moved the **entire world** onto the
 * `aura-js` branch. A developer who added one terrain collider to an otherwise
 * cannon-backed scene had every body in that scene quietly change solver.
 *
 * WS-4.2 selected `cannon-es` as the single production backend and WS-4.3 removes the
 * second solver, so a shape the production backend cannot express is no longer a
 * degradation — it is a hole. These assertions are the contract: every shape the public
 * API can construct is expressible on the production backend, and the fallback never fires.
 */

const SHAPES: readonly (readonly [string, PhysicsShape])[] = [
  ["box", Shape.box(0.5, 0.5, 0.5)],
  ["sphere", Shape.sphere(0.5)],
  ["capsule", Shape.capsule(0.3, 0.6)],
  ["plane", Shape.plane([0, 1, 0], 0)],
  [
    "mesh",
    Shape.mesh(
      [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]],
      [0, 2, 1, 1, 2, 3]
    )
  ],
  [
    "convex-hull",
    Shape.convexHull(
      [[0.8, 0.8, 0.8], [-0.8, -0.8, 0.8], [-0.8, 0.8, -0.8], [0.8, -0.8, -0.8]],
      [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
    )
  ],
  [
    "heightfield",
    Shape.heightfield(
      [
        [0, 0.1, 0.2],
        [0.1, 0.2, 0.3],
        [0.2, 0.3, 0.4]
      ],
      1
    )
  ]
];

for (const [kind, shape] of SHAPES) {
  test(`production backend expresses the public '${kind}' shape without falling back`, () => {
    const world = new PhysicsWorld({ backend: "cannon-es", gravity: [0, -9.81, 0] });
    const body = world.createRigidBody({ type: "static", position: [0, 0, 0] });
    world.createCollider(body, { shape });

    world.step(1 / 60);

    const snapshot = world.snapshot();
    assert.equal(
      snapshot.backend.active,
      "cannon-es",
      `'${kind}' silently swapped the world onto ${snapshot.backend.active}: ${snapshot.backend.fallback ?? "no reason given"}`
    );
    assert.equal(snapshot.backend.fallback, undefined, `'${kind}' recorded a fallback reason`);
  });
}

test("a mesh collider added mid-scene does not change the solver under the other bodies", () => {
  // The real-world shape of the defect: a scene is running on cannon-es, one terrain
  // collider is added, and every unrelated body changes solver.
  const world = new PhysicsWorld({ backend: "cannon-es", gravity: [0, -9.81, 0] });
  const floor = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(floor, { shape: Shape.box(10, 0.5, 10) });
  const falling = world.createRigidBody({ position: [0, 4, 0], mass: 1 });
  world.createCollider(falling, { shape: Shape.sphere(0.5) });

  for (let index = 0; index < 10; index += 1) world.step(1 / 60);
  assert.equal(world.snapshot().backend.active, "cannon-es");

  const terrain = world.createRigidBody({ type: "static", position: [30, 0, 0] });
  world.createCollider(terrain, {
    shape: Shape.mesh(
      [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]],
      [0, 2, 1, 1, 2, 3]
    )
  });

  for (let index = 0; index < 10; index += 1) world.step(1 / 60);

  const snapshot = world.snapshot();
  assert.equal(snapshot.backend.active, "cannon-es");
  assert.equal(snapshot.backend.fallback, undefined);
  // And the unrelated body is still being simulated, not frozen by the swap.
  const fallingSnapshot = snapshot.bodies.find((entry) => entry.id === falling.id);
  assert.ok(fallingSnapshot !== undefined);
  assert.ok(
    fallingSnapshot.position[1] < 4,
    "the unrelated falling body stopped being simulated"
  );
});
