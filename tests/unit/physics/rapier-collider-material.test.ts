import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

/**
 * Defect class: **engine**. Third member of the family recorded in `PhysicsWorld.ts` — the
 * joint no-op at `stepRapier`, the dropped `applyForce` in `syncRapierFromAura`, and the
 * three shapes that silently disabled the backend (WS-4.3 1/n).
 *
 * `ColliderDescriptor.material` was validated on creation, stored on the resolved collider,
 * and read by the `aura-js` resolver — but never handed to rapier. On the production backend
 * every contact therefore resolved through `world.defaultContactMaterial`
 * (friction 0.3, restitution 0), so `material: { restitution: 1 }` did not bounce and
 * `material: { friction: 0 }` did not slide freely. Tests missed it because the ones that
 * asserted material behaviour pinned `backend: "aura-js"` explicitly.
 *
 * These are behavioural contracts, not pinned constants: rapier's restitution is
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
  assert.equal(world.snapshot().backend.active, "rapier", "material test must measure the production backend");
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
  assert.equal(world.snapshot().backend.active, "rapier", "material test must measure the production backend");
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

test("collider coefficients and combine rules are delegated to Rapier", () => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const a = world.createRigidBody({ position: [0, 1, 0] });
  world.createCollider(a, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.4, restitution: 0.2 } });
  const b = world.createRigidBody({ position: [3, 1, 0] });
  world.createCollider(b, { shape: Shape.box(0.5, 0.5, 0.5), material: { friction: 0.4, restitution: 0.2 } });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(floor, { shape: Shape.box(20, 0.5, 20), material: { friction: 0.4, restitution: 0.2 } });

  for (let index = 0; index < 30; index += 1) world.step(1 / 60);

  const internal = world as unknown as {
    rapierCollidersByAuraId: Map<number, {
      unsafeRapierCollider(): {
        friction(): number;
        restitution(): number;
        frictionCombineRule(): number;
        restitutionCombineRule(): number;
      };
    }>;
  };
  const raw = [...internal.rapierCollidersByAuraId.values()].map((handle) => handle.unsafeRapierCollider());
  assert.equal(raw.length, 3);
  assert.ok(raw.every((collider) => Math.abs(collider.friction() - 0.4) < 1e-6));
  assert.ok(raw.every((collider) => Math.abs(collider.restitution() - 0.2) < 1e-6));
  assert.equal(new Set(raw.map((collider) => collider.frictionCombineRule())).size, 1);
  assert.equal(new Set(raw.map((collider) => collider.restitutionCombineRule())).size, 1);
  assert.equal(world.snapshot().backend.active, "rapier");
});

/**
 * Defect class: **engine**. Regression for the second half of the material defect, which the
 * three tests above could not see because each of them applies the *same* surface to both
 * colliders. Under a symmetric pair rapier's hidden `matA.x * matB.x` override and our
 * intended pairwise rule stay ordered together (`r*r` and `max(r,r)` are both monotonic in
 * `r`), so the monotonicity assertions passed while asymmetric pairs were still wrong.
 *
 * rapier documents `Material.friction`/`.restitution` as overriding any matching
 * ContactMaterial whenever they are non-negative, and applies that override in two places
 * that never consult `addContactMaterial`. Registering the pairings was therefore necessary
 * but not sufficient. The concrete symptom: a `restitution: 1` ball landing on a default
 * `restitution: 0` floor resolved to `1 * 0 = 0` and lay dead on the surface, even though
 * the aura-js resolver takes `Math.max` and bounces.
 *
 * Both assertions below fail before the `-1` sentinel fix and pass after it.
 */
const asymmetricDropApex = (ballRestitution: number, floorRestitution: number): number => {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const ball = world.createRigidBody({ position: [0, 2, 0], friction: 0, restitution: 0 });
  world.createCollider(ball, { shape: Shape.sphere(0.5), material: { restitution: ballRestitution, friction: 0 } });
  const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0], friction: 0, restitution: 0 });
  world.createCollider(floor, { shape: Shape.box(20, 0.5, 20), material: { restitution: floorRestitution, friction: 0 } });

  let bounced = false;
  let apex = -Infinity;
  for (let index = 0; index < 240; index += 1) {
    world.step(1 / 60);
    if (ball.velocity[1] > 0.05) bounced = true;
    if (bounced) apex = Math.max(apex, ball.position[1]);
  }
  assert.equal(world.snapshot().backend.active, "rapier", "material test must measure the production backend");
  return apex;
};

test("one elastic surface is enough to rebound off an inelastic one", () => {
  // max(1, 0) = 1 bounces; rapier's undocumented 1 * 0 = 0 does not. Resting centre is the
  // 0.5 radius, so an apex meaningfully above it is the signal.
  const elasticBall = asymmetricDropApex(1, 0);
  assert.ok(elasticBall > 0.6, `elastic ball on inelastic floor should rebound, apex was ${elasticBall}`);

  // The rule must be symmetric in the pair: an inelastic ball on a trampoline floor bounces.
  const elasticFloor = asymmetricDropApex(0, 1);
  assert.ok(elasticFloor > 0.6, `inelastic ball on elastic floor should rebound, apex was ${elasticFloor}`);
});

test("a frictionless surface stays frictionless against a high-friction one", () => {
  // Friction multiplies, so 0 * 1 = 0: an ice puck on grippy ground must not be slowed.
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], solverIterations: 10, enableSleeping: false });
  const puck = world.createRigidBody({ position: [0, 0, 0], velocity: [4, 0, 0], friction: 0, restitution: 0 });
  world.createCollider(puck, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 0 } });
  const ground = world.createRigidBody({ type: "static", position: [0, -1, 0], friction: 0, restitution: 0 });
  world.createCollider(ground, { shape: Shape.box(20, 0.5, 20), material: { friction: 1, restitution: 0 } });
  for (let index = 0; index < 60; index += 1) world.step(1 / 60);

  assert.equal(world.snapshot().backend.active, "rapier", "material test must measure the production backend");
  assert.ok(Math.abs(puck.velocity[0] - 4) < 1e-6, `frictionless puck should keep vx 4, got ${puck.velocity[0]}`);
  assert.ok(Math.abs(puck.angularVelocity[2]) < 1e-6, `frictionless puck should not spin, got ${puck.angularVelocity[2]}`);
});
