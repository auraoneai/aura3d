import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

test("physics stress scene covers stacks, fast bodies, constraints, sensors, filters, raycasts, and shape casts", () => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 8 });
  const ground = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(ground, { shape: Shape.plane([0, 1, 0], 0), filter: { layer: 0b001, mask: 0b111 } });

  const stackBodies = [];
  for (let index = 0; index < 6; index += 1) {
    const body = world.createRigidBody({ position: [0, 0.45 + index * 0.38, 0], friction: 0.8, linearDamping: 0.03 });
    world.createCollider(body, { shape: Shape.box(0.18, 0.18, 0.18), filter: { layer: 0b001, mask: 0b111 } });
    stackBodies.push(body);
  }

  const fastBody = world.createRigidBody({ position: [-3, 1.1, 0], velocity: [14, 0, 0], restitution: 0.05 });
  world.createCollider(fastBody, { shape: Shape.box(0.12, 0.12, 0.12), filter: { layer: 0b001, mask: 0b111 } });

  const sensor = world.createRigidBody({ type: "static", position: [0.45, 1.1, 0] });
  const sensorCollider = world.createCollider(sensor, { shape: Shape.box(0.35, 0.35, 0.35), sensor: true, filter: { layer: 0b010, mask: 0b001 } });

  const filtered = world.createRigidBody({ position: [0, 4, 0] });
  world.createCollider(filtered, { shape: Shape.sphere(0.2), filter: { layer: 0b100, mask: 0b100 } });

  const anchor = world.createRigidBody({ type: "static", position: [-1.5, 2, 0] });
  let previous = anchor;
  for (let index = 0; index < 4; index += 1) {
    const body = world.createRigidBody({ position: [-1.2 + index * 0.32, 2, 0], velocity: [0.2, index * 0.1, 0] });
    world.createCollider(body, { shape: Shape.box(0.12, 0.12, 0.12), filter: { layer: 0b001, mask: 0b111 } });
    world.createConstraint({ type: index % 2 === 0 ? "fixed" : "spring", bodyA: previous, bodyB: body, restLength: 0.32, stiffness: 0.65 });
    previous = body;
  }

  const preflightHit = world.sphereCast([-3, 1.1, 0], 0.12, [1, 0, 0], { maxDistance: 4, mask: 0b010, includeSensors: true });
  assert.equal(preflightHit?.colliderId, sensorCollider.id);

  let sensorEvents = 0;
  for (let step = 0; step < 180; step += 1) {
    for (const event of world.step()) {
      if (event.contact.sensor) sensorEvents += 1;
    }
  }

  const snapshot = world.snapshot();
  assert.equal(snapshot.stats.bodies, 15);
  assert.equal(snapshot.stats.colliders, 14);
  assert.equal(snapshot.stats.constraints, 4);
  assert.ok(snapshot.stats.contacts > 0);
  assert.ok(snapshot.stats.broadphaseCandidateTests > 0);
  assert.ok(sensorEvents > 0);
  assert.ok(fastBody.position[0] > -3);
  assert.ok(stackBodies.every((body) => Number.isFinite(body.position[1]) && body.position[1] >= 0.15));

  const rayHit = world.raycast([0, 5, 0], [0, -1, 0], { mask: 0b001 });
  assert.ok(rayHit);
  assert.notEqual(rayHit.colliderId, sensorCollider.id);
  assert.equal(world.raycast([0, 5, 0], [0, -1, 0], { mask: 0b010 }), undefined);
  const shapeHit = world.sphereCast([0, 5, 0], 0.2, [0, -1, 0], { mask: 0b001 });
  assert.ok(shapeHit);
});
