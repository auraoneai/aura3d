import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape, timeOfImpact } from "../../../packages/physics/src/index.js";

test("a cannon-es box dropped on a corner tumbles from angular contact response", () => {
  const initialRotation = zRotation(Math.PI / 6);
  const world = new PhysicsWorld({
    backend: "cannon-es",
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
    linearDamping: 0.01,
    angularDamping: 0.01,
    friction: 0.7
  });
  world.createCollider(box, {
    shape: Shape.box(0.5, 0.5, 0.5),
    material: { friction: 0.7, restitution: 0 }
  });
  let maxAngularSpeed = 0;

  for (let index = 0; index < 480; index += 1) {
    world.step(1 / 120);
    maxAngularSpeed = Math.max(maxAngularSpeed, Math.hypot(...box.angularVelocity));
  }

  const backend = world.snapshot().backend;
  const quaternionDot = box.rotation.reduce(
    (sum, component, index) => sum + component * initialRotation[index]!,
    0
  );
  assert.equal(backend.active, "cannon-es");
  assert.ok(maxAngularSpeed > 0.25, `expected angular response, got max omega=${maxAngularSpeed}`);
  assert.ok(1 - Math.abs(quaternionDot) > 0.02, "expected the box to tumble away from its initial corner rotation");
  assert.ok(box.rotation.every(Number.isFinite));
  assert.ok(Math.abs(Math.hypot(...box.rotation) - 1) < 1e-6);
});

test("fast bodies use discrete fixed-step collision rather than continuous collision detection", () => {
  const world = new PhysicsWorld({
    backend: "cannon-es",
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 4,
    enableSleeping: false
  });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(wall, { shape: Shape.box(0.05, 1, 1), filter: { layer: 0b001, mask: 0b001 } });
  const fastBody = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0] });
  world.createCollider(fastBody, { shape: Shape.box(0.05, 0.05, 0.05), filter: { layer: 0b001, mask: 0b001 } });

  world.step(1 / 60);

  const snapshot = world.snapshot();
  assert.equal(snapshot.stats.contacts, 0);
  assert.ok(fastBody.position[0] > 1.5);
});

test("Aura adaptive-substep CCD prevents a cannon-es fast mover from tunneling", () => {
  const world = new PhysicsWorld({
    backend: "cannon-es",
    gravity: [0, 0, 0],
    fixedDelta: 1 / 60,
    solverIterations: 8,
    enableSleeping: false,
    continuousCollision: {
      mode: "adaptive-substeps",
      maxSubSteps: 256,
      motionThreshold: 0.5
    }
  });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(wall, { shape: Shape.box(0.05, 1, 1), filter: { layer: 0b001, mask: 0b001 } });
  const fastBody = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0] });
  world.createCollider(fastBody, { shape: Shape.box(0.05, 0.05, 0.05), filter: { layer: 0b001, mask: 0b001 } });

  world.step(1 / 60);

  const ccd = world.snapshot().backend.continuousCollision;
  assert.equal(world.snapshot().backend.active, "cannon-es");
  assert.equal(ccd.active, true);
  assert.equal(ccd.mode, "adaptive-substeps");
  assert.equal(ccd.provider, "aura3d-adaptive-substep-wrapper");
  assert.equal(ccd.lastRequiredSubSteps, 160);
  assert.equal(ccd.lastSubSteps, 160);
  assert.equal(ccd.limitExceeded, false);
  assert.ok(fastBody.position[0] < -0.1, `expected body to remain before wall, got x=${fastBody.position[0]}`);
  assert.ok(fastBody.velocity[0] <= 0, `expected impact response, got vx=${fastBody.velocity[0]}`);
});

test("Aura adaptive-substep CCD prevents a native fast mover from tunneling", () => {
  const world = new PhysicsWorld({
    backend: "aura-js",
    gravity: [0, 0, 0],
    solverIterations: 8,
    enableSleeping: false,
    continuousCollision: {
      mode: "adaptive-substeps",
      maxSubSteps: 256,
      motionThreshold: 0.5
    }
  });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(wall, { shape: Shape.box(0.05, 1, 1) });
  const fastBody = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0] });
  world.createCollider(fastBody, { shape: Shape.box(0.05, 0.05, 0.05) });

  world.step(1 / 60);

  const ccd = world.snapshot().backend.continuousCollision;
  assert.equal(ccd.active, true);
  assert.equal(ccd.lastRequiredSubSteps, 160);
  assert.equal(ccd.lastSubSteps, 160);
  assert.ok(Math.abs((ccd.lastTimeOfImpact ?? 0) - 1.9 / 240) < 1e-9);
  assert.ok(fastBody.position[0] <= -0.1, `expected body to remain before wall, got x=${fastBody.position[0]}`);
  assert.ok(fastBody.velocity[0] <= 0, `expected impact response, got vx=${fastBody.velocity[0]}`);
});

test("timeOfImpact returns the first swept-bounds contact and rejects misses", () => {
  const hit = timeOfImpact(
    Shape.box(0.5, 0.5, 0.5),
    [-2, 0, 0],
    [4, 0, 0],
    Shape.box(0.5, 0.5, 0.5),
    [0, 0, 0],
    [0, 0, 0],
    1
  );
  const miss = timeOfImpact(
    Shape.sphere(0.5),
    [-2, 2, 0],
    [4, 0, 0],
    Shape.box(0.5, 0.5, 0.5),
    [0, 0, 0],
    [0, 0, 0],
    1
  );

  assert.deepEqual(hit, { time: 0.25, normal: [1, 0, 0] });
  assert.equal(miss, undefined);
});

/*
 * Defect class: **engine**, and a test-pinned-to-the-fallback defect on top of it.
 *
 * This assertion is correct and has always passed — but it was pinned to
 * `backend: "aura-js"`, the branch WS-4.2 selected *against*. On the production
 * `cannon-es` backend the same scenario produced `vx = 60.25`, not 61: `cannon-es` zeroes
 * `body.force` at the end of every `World.step`, so forwarding the accumulator once before
 * a 4-substep frame applied the force for `dt/4` instead of `dt`. Forces were silently
 * scaled by `1/subSteps`, and `subSteps` is speed-dependent, so an identical `applyForce`
 * call accelerated a body differently depending on how fast it already was.
 *
 * Exactly the family of the joint no-op and the `applyForce` drop: green tests on a path
 * users never take. The `backend` parameter is now explicit in the test name and both
 * production and fallback are asserted to agree, so the production path can no longer
 * regress behind a passing fallback assertion.
 */
test("native CCD substeps preserve outer-step forces and interpolation history [production: cannon-es]", () => {
  const world = new PhysicsWorld({
    backend: "cannon-es",
    gravity: [0, 0, 0],
    continuousCollision: {
      mode: "adaptive-substeps",
      maxSubSteps: 16,
      motionThreshold: 0.5
    }
  });
  const body = world.createRigidBody({ position: [0, 0, 0], velocity: [60, 0, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  body.applyForce([60, 0, 0]);

  world.step(1 / 60);

  assert.equal(world.snapshot().backend.active, "cannon-es");
  assert.equal(world.snapshot().backend.continuousCollision.lastSubSteps, 4);
  assert.ok(
    Math.abs(body.velocity[0] - 61) < 1e-9,
    `a 60 N force on a 1 kg body over 1/60 s must add exactly 1 m/s regardless of substep count, got ${body.velocity[0]}`
  );
  assert.deepEqual(body.previousPosition, [0, 0, 0]);
});

test("force integration is substep-count independent on the production backend", () => {
  // The scaling bug was invisible at subSteps=1 and grew with speed. Asserting across a
  // range makes the invariant "dv depends on dt, not on how the frame was subdivided".
  const measured = [0.4, 20, 60, 120].map((speed) => {
    const world = new PhysicsWorld({
      backend: "cannon-es",
      gravity: [0, 0, 0],
      continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 32, motionThreshold: 0.5 }
    });
    const body = world.createRigidBody({ position: [0, 0, 0], velocity: [speed, 0, 0] });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
    body.applyForce([60, 0, 0]);
    world.step(1 / 60);
    return {
      speed,
      subSteps: world.snapshot().backend.continuousCollision.lastSubSteps,
      deltaV: body.velocity[0] - speed
    };
  });

  assert.ok(
    new Set(measured.map((entry) => entry.subSteps)).size > 1,
    `the scenario must actually vary substep count or it proves nothing: ${JSON.stringify(measured)}`
  );
  for (const entry of measured) {
    assert.ok(
      Math.abs(entry.deltaV - 1) < 1e-9,
      `dv must be 1 m/s at every substep count, got ${entry.deltaV} at ${entry.subSteps} substeps (speed ${entry.speed})`
    );
  }
});

test("a force applied once is applied for exactly one step, then stops", () => {
  const world = new PhysicsWorld({ backend: "cannon-es", gravity: [0, 0, 0] });
  const body = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });

  body.applyForce([60, 0, 0]);
  world.step(1 / 60);
  const afterFirst = body.velocity[0];
  world.step(1 / 60);
  const afterSecond = body.velocity[0];

  assert.ok(Math.abs(afterFirst - 1) < 1e-9, `expected dv=1, got ${afterFirst}`);
  assert.ok(
    Math.abs(afterSecond - afterFirst) < 1e-9,
    `a drained accumulator must not keep accelerating the body, got ${afterSecond}`
  );
});

test("continuous force application accumulates linearly across frames", () => {
  const world = new PhysicsWorld({
    backend: "cannon-es",
    gravity: [0, 0, 0],
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 32, motionThreshold: 0.5 }
  });
  const body = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });

  // The per-frame call every game loop makes. Under the 1/subSteps bug this curve bent
  // downward as the body sped up and crossed the CCD motion threshold.
  for (let frame = 0; frame < 60; frame += 1) {
    body.applyForce([60, 0, 0]);
    world.step(1 / 60);
  }

  assert.ok(
    Math.abs(body.velocity[0] - 60) < 1e-6,
    `60 N for 1 s on 1 kg must reach 60 m/s, got ${body.velocity[0]}`
  );
});

test("the fallback backend agrees with production on force integration", () => {
  // Retained cross-backend invariant: the original assertion, kept so the fallback cannot
  // drift from production while `aura-js` still exists.
  const world = new PhysicsWorld({
    backend: "aura-js",
    gravity: [0, 0, 0],
    continuousCollision: { mode: "adaptive-substeps", maxSubSteps: 16, motionThreshold: 0.5 }
  });
  const body = world.createRigidBody({ position: [0, 0, 0], velocity: [60, 0, 0] });
  world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  body.applyForce([60, 0, 0]);

  world.step(1 / 60);

  assert.equal(world.snapshot().backend.continuousCollision.lastSubSteps, 4);
  assert.ok(Math.abs(body.velocity[0] - 61) < 1e-9);
  assert.deepEqual(body.previousPosition, [0, 0, 0]);
});

test("adaptive-substep CCD rejects a step that exceeds its configured guarantee", () => {
  const world = new PhysicsWorld({
    backend: "cannon-es",
    gravity: [0, 0, 0],
    continuousCollision: {
      mode: "adaptive-substeps",
      maxSubSteps: 8,
      motionThreshold: 0.5
    }
  });
  const wall = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(wall, { shape: Shape.box(0.05, 1, 1) });
  const fastBody = world.createRigidBody({ position: [-2, 0, 0], velocity: [240, 0, 0] });
  world.createCollider(fastBody, { shape: Shape.box(0.05, 0.05, 0.05) });

  assert.throws(
    () => world.step(1 / 60),
    /requires 160 substeps, above maxSubSteps 8/
  );
  assert.equal(fastBody.position[0], -2);
  assert.equal(world.snapshot().backend.continuousCollision.limitExceeded, true);
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

function zRotation(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
