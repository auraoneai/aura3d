import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

test("fast bodies use discrete fixed-step collision rather than continuous collision detection", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: 1 / 60, solverIterations: 4, enableSleeping: false });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(wall, { shape: Shape.box(0.05, 1, 1), filter: { layer: 0b001, mask: 0b001 } });
  const fastBody = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0] });
  world.createCollider(fastBody, { shape: Shape.box(0.05, 0.05, 0.05), filter: { layer: 0b001, mask: 0b001 } });

  world.step(1 / 60);

  const snapshot = world.snapshot();
  assert.equal(snapshot.stats.contacts, 0);
  assert.ok(fastBody.position[0] > 1.5);
});

test("sphereCast provides an explicit preflight for fast-body impact checks", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const wallCollider = world.createCollider(wall, { shape: Shape.box(0.05, 1, 1), filter: { layer: 0b010, mask: 0b010 } });

  const hit = world.sphereCast([-2, 0, 0], 0.05, [1, 0, 0], { maxDistance: 4, mask: 0b010 });

  assert.equal(hit?.colliderId, wallCollider.id);
  assert.equal(hit?.bodyId, wall.id);
  assert.ok(hit.distance > 1.8);
  assert.ok(hit.distance < 2.1);
  assert.deepEqual(hit.normal, [-1, 0, 0]);
});
