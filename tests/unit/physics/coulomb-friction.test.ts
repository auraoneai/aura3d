import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

function slideAfterContact(penetration: number, solverIterations: number): number {
  const world = new PhysicsWorld({
    backend: "aura-js",
    gravity: [0, 0, 0],
    solverIterations,
    enableSleeping: false
  });
  const floorTop = -0.25;
  const box = world.createRigidBody({
    position: [0, floorTop + 0.5 - penetration, 0],
    velocity: [4, -2, 0]
  });
  world.createCollider(box, {
    shape: Shape.box(0.5, 0.5, 0.5),
    material: { friction: 0.5, restitution: 0 }
  });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.75, 0] });
  world.createCollider(floor, {
    shape: Shape.box(10, 0.5, 10),
    material: { friction: 0.5, restitution: 0 }
  });

  world.step(1 / 60);
  return box.velocity[0];
}

test("Coulomb friction is bounded by accumulated normal impulse, not penetration depth", () => {
  const shallowContact = slideAfterContact(0.01, 1);
  const deepContact = slideAfterContact(0.45, 1);

  assert.ok(Math.abs(shallowContact - 3) < 1e-9);
  assert.ok(Math.abs(deepContact - shallowContact) < 1e-9);
});

test("accumulated Coulomb friction does not grow with solver iteration count", () => {
  const oneIteration = slideAfterContact(0.2, 1);
  const eightIterations = slideAfterContact(0.2, 8);

  assert.ok(Math.abs(eightIterations - oneIteration) < 1e-9);
});
