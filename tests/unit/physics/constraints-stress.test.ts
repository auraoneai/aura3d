import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld } from "../../../packages/physics/src/index.js";

test("fixed constraint chain remains bounded under repeated solver steps", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 8 });
  const anchor = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  let previous = anchor;
  const bodies = [];

  for (let index = 1; index <= 10; index += 1) {
    const body = world.createRigidBody({ position: [index, 0, 0], velocity: [0.1 * index, 0.03 * index, 0] });
    world.createConstraint({ type: "fixed", bodyA: previous, bodyB: body });
    bodies.push(body);
    previous = body;
  }

  bodies.at(-1)?.setPosition([14, 2, 0]);
  for (let step = 0; step < 120; step += 1) {
    world.step(1 / 60);
  }

  assert.equal(world.constraints().length, 10);
  assert.ok(Math.abs(anchor.position[0]) < 1e-9);
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]!;
    assert.ok(Number.isFinite(body.position[0]));
    assert.ok(Math.abs(body.position[1]) < 0.1);
    assert.ok(Math.abs(body.position[0] - (index + 1)) < 0.1);
  }
});

test("hinge, slider, and spring constraints stay finite and axis-bounded under stress", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], solverIterations: 6 });
  const hingeAnchor = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  const hingeBody = world.createRigidBody({ position: [2, 3, -1], velocity: [1, 8, -3] });
  world.createConstraint({
    type: "hinge",
    bodyA: hingeAnchor,
    bodyB: hingeBody,
    localAnchorA: [1, 0, 0],
    localAnchorB: [-1, 0, 0]
  });

  const sliderAnchor = world.createRigidBody({ type: "static", position: [0, 5, 0] });
  const sliders = Array.from({ length: 6 }, (_, index) => {
    const body = world.createRigidBody({ position: [index, 5 + (index % 2 === 0 ? 2 : -2), index - 3], velocity: [4, index, -index] });
    world.createConstraint({ type: "slider", bodyA: sliderAnchor, bodyB: body, axis: [1, 0, 0] });
    return body;
  });

  const springAnchor = world.createRigidBody({ type: "static", position: [0, -4, 0] });
  const springBody = world.createRigidBody({ position: [8, -4, 0], velocity: [-2, 0, 0] });
  world.createConstraint({ type: "spring", bodyA: springAnchor, bodyB: springBody, restLength: 2, stiffness: 0.35 });

  for (let step = 0; step < 180; step += 1) {
    world.step(1 / 60);
  }

  assert.ok(Math.abs(hingeBody.position[0] - 2) < 0.05);
  assert.ok(Math.abs(hingeBody.position[1]) < 0.05);
  assert.ok(Math.abs(hingeBody.position[2]) < 0.05);
  for (const slider of sliders) {
    assert.ok(Number.isFinite(slider.position[0]));
    assert.ok(Math.abs(slider.position[1] - 5) < 0.05);
    assert.ok(Math.abs(slider.position[2]) < 0.05);
    assert.ok(Math.abs(slider.velocity[1]) < 0.05);
    assert.ok(Math.abs(slider.velocity[2]) < 0.05);
  }
  assert.ok(Math.abs(Math.hypot(
    springBody.position[0] - springAnchor.position[0],
    springBody.position[1] - springAnchor.position[1],
    springBody.position[2] - springAnchor.position[2]
  ) - 2) < 0.2);
});
