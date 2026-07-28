import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, RigidBody, Shape } from "../../../packages/physics/src/index.js";

test("a native box dropped on a corner tumbles from contact torque", () => {
  const initialRotation = zRotation(Math.PI / 6);
  const world = new PhysicsWorld({
    backend: "aura-js",
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 120,
    solverIterations: 10,
    enableSleeping: false
  });
  const ground = world.createRigidBody({ type: "static", position: [0, -0.25, 0] });
  world.createCollider(ground, { shape: Shape.box(5, 0.25, 5) });
  const box = world.createRigidBody({
    position: [0, 2, 0],
    rotation: initialRotation,
    inertia: [1 / 6, 1 / 6, 1 / 6],
    linearDamping: 0.01,
    angularDamping: 0.02,
    friction: 0.7
  });
  world.createCollider(box, {
    shape: Shape.box(0.5, 0.5, 0.5),
    material: { friction: 0.7, restitution: 0 }
  });
  let maxAngularSpeed = 0;
  let maxRotationDelta = 0;

  for (let index = 0; index < 480; index += 1) {
    world.step(1 / 120);
    maxAngularSpeed = Math.max(maxAngularSpeed, Math.hypot(...box.angularVelocity));
    const currentDot = box.rotation.reduce(
      (sum, component, componentIndex) => sum + component * initialRotation[componentIndex]!,
      0
    );
    maxRotationDelta = Math.max(maxRotationDelta, 1 - Math.abs(currentDot));
  }

  assert.equal(world.snapshot().backend.active, "aura-js");
  assert.ok(maxAngularSpeed > 0.2, `expected native angular response, got max omega=${maxAngularSpeed}`);
  assert.ok(maxRotationDelta > 0.015, `expected the native box to tumble away from its initial corner orientation; max delta=${maxRotationDelta}`);
  assert.ok(box.rotation.every(Number.isFinite));
  assert.ok(box.angularVelocity.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...box.rotation) - 1) < 1e-6);
});

test("centered native face contacts do not manufacture torque", () => {
  const world = new PhysicsWorld({
    backend: "aura-js",
    gravity: [0, -9.81, 0],
    fixedDelta: 1 / 120,
    solverIterations: 10,
    enableSleeping: true,
    sleepVelocityThreshold: 0.05,
    sleepDelay: 0.25
  });
  const ground = world.createRigidBody({ type: "static", position: [0, -0.25, 0] });
  world.createCollider(ground, { shape: Shape.box(5, 0.25, 5) });
  const box = world.createRigidBody({
    position: [0, 1.5, 0],
    inertia: [1 / 6, 1 / 6, 1 / 6],
    linearDamping: 0.08,
    angularDamping: 0.08,
    friction: 0.7
  });
  world.createCollider(box, { shape: Shape.box(0.5, 0.5, 0.5) });
  let maxAngularSpeed = 0;

  for (let index = 0; index < 600; index += 1) {
    world.step(1 / 120);
    maxAngularSpeed = Math.max(maxAngularSpeed, Math.hypot(...box.angularVelocity));
  }

  assert.ok(maxAngularSpeed < 1e-6, `expected centered support-face impulse, got max omega=${maxAngularSpeed}`);
  assert.deepEqual(box.velocity, [0, 0, 0]);
  assert.deepEqual(box.angularVelocity, [0, 0, 0]);
});

test("rotated principal inertia is transformed into world space", () => {
  const body = new RigidBody(1, {
    rotation: zRotation(Math.PI / 2),
    inertia: [1, 2, 4]
  });

  const response = body.multiplyInverseInertiaWorld([1, 0, 0]);

  assert.ok(Math.abs(response[0] - 0.5) < 1e-9);
  assert.ok(Math.abs(response[1]) < 1e-9);
  assert.ok(Math.abs(response[2]) < 1e-9);
});

function zRotation(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
