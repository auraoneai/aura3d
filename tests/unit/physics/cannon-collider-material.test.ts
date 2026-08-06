import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

/**
 * Defect class: **engine**. Third member of the family recorded in `PhysicsWorld.ts` — the
 * joint no-op at `stepCannon`, the dropped `applyForce` in `syncCannonFromAura`, and the
 * three shapes that silently disabled the backend (WS-4.3 1/n).
 *
 * `ColliderDescriptor.material` was validated on creation, stored on the resolved collider,
 * and read by the `aura-js` resolver — but never handed to cannon. On the production backend
 * every contact therefore resolved through `world.defaultContactMaterial`
 * (friction 0.3, restitution 0), so `material: { restitution: 1 }` did not bounce and
 * `material: { friction: 0 }` did not slide freely. Tests missed it because the ones that
 * asserted material behaviour pinned `backend: "aura-js"` explicitly.
 *
 * These are behavioural contracts, not pinned constants: cannon's restitution is
 * relaxation-dependent, so an exact post-impact velocity is a solver artifact rather than a
 * public promise (measured: the same drop yields vy 1.69 / 1.20 / -0.86 at
 * contactEquationRelaxation 3 / 1 / 0.1). WS-4.3 classifies the exact-value assertion in
 * `workstream4.physics-animation.test.ts` as implementation-characterization for that reason.
 */

const dropApex = (restitution: number): number => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const ball = world.createRigidBody({ position: [0, 2, 0], friction: 0, restitution: 0 });
  world.createCollider(ball, { shape: Shape.sphere(0.5), material: { restitution, friction: 0 } });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0], friction: 0, restitution: 0 });
  world.createCollider(floor, { shape: Shape.box(20, 0.5, 20), material: { restitution, friction: 0 } });

  let bounced = false;
  let apex = -Infinity;
  for (let index = 0; index < 240; index += 1) {
    world.step(1 / 60);
    if (ball.velocity[1] > 0.05) bounced = true;
    if (bounced) apex = Math.max(apex, ball.position[1]);
  }
  assert.equal(world.snapshot().backend.active, "cannon-es", "material test must measure the production backend");
  return apex;
};

test("collider restitution drives rebound height on the production backend", () => {
  // Resting centre height is the 0.5 radius. An inelastic surface must not exceed it;
  // increasing restitution must monotonically increase the apex above it.
  const inelastic = dropApex(0);
  const half = dropApex(0.5);
  const elastic = dropApex(1);

  assert.ok(inelastic <= 0.51, `restitution 0 should not rebound, apex was ${inelastic}`);
  assert.ok(half > inelastic + 0.02, `restitution 0.5 (${half}) must rebound above restitution 0 (${inelastic})`);
  assert.ok(elastic > half + 0.02, `restitution 1 (${elastic}) must rebound above restitution 0.5 (${half})`);
});

const sphereRoll = (friction: number): { vx: number; wz: number } => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const ball = world.createRigidBody({ position: [0, 0, 0], velocity: [4, 0, 0], friction: 0, restitution: 0 });
  world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction, restitution: 0 } });
  const ground = world.createRigidBody({ type: "static", position: [0, -1, 0], friction: 0, restitution: 0 });
  world.createCollider(ground, { shape: Shape.box(20, 0.5, 20), material: { friction, restitution: 0 } });
  for (let index = 0; index < 60; index += 1) world.step(1 / 60);
  assert.equal(world.snapshot().backend.active, "cannon-es", "material test must measure the production backend");
  return { vx: ball.velocity[0], wz: ball.angularVelocity[2] };
};

test("collider friction converts sliding into rolling on the production backend", () => {
  // A sphere is used rather than a box: a sliding box tips, so its linear velocity is
  // confounded by tumbling. On a frictionless surface the sphere must neither slow nor spin.
  const frictionless = sphereRoll(0);
  assert.ok(Math.abs(frictionless.vx - 4) < 1e-6, `frictionless sphere should keep vx 4, got ${frictionless.vx}`);
  assert.ok(Math.abs(frictionless.wz) < 1e-6, `frictionless sphere should not spin, got wz ${frictionless.wz}`);

  const gripped = sphereRoll(1);
  assert.ok(gripped.vx < 3.5, `gripped sphere should shed linear speed, got ${gripped.vx}`);
  assert.ok(gripped.wz < -1, `gripped sphere should spin forward (negative wz), got ${gripped.wz}`);
  // Rolling without slipping: contact-point velocity vx + wz*r approaches zero.
  assert.ok(Math.abs(gripped.vx + gripped.wz * 0.5) < 0.5, `expected near rolling contact, got ${gripped.vx + gripped.wz * 0.5}`);
});

test("two colliders declaring the same surface share one interned cannon material", () => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const a = world.createRigidBody({ position: [0, 1, 0] });
  world.createCollider(a, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.4, restitution: 0.2 } });
  const b = world.createRigidBody({ position: [3, 1, 0] });
  world.createCollider(b, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.4, restitution: 0.2 } });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(floor, { shape: Shape.box(20, 0.5, 20), material: { friction: 0.4, restitution: 0.2 } });

  for (let index = 0; index < 30; index += 1) world.step(1 / 60);

  // One distinct surface across three colliders => one Material => one self-paired
  // ContactMaterial. Without interning this would be three materials and six pairs.
  const internal = world as unknown as {
    cannonMaterialsByKey: Map<string, unknown>;
    cannonContactMaterialPairs: Set<string>;
  };
  assert.equal(internal.cannonMaterialsByKey.size, 1);
  assert.equal(internal.cannonContactMaterialPairs.size, 1);
  assert.equal(world.snapshot().backend.active, "cannon-es");
});
