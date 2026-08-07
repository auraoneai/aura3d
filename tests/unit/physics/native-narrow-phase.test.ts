import assert from "node:assert/strict";
import { test } from "vitest";
import {
  Collider,
  PhysicsWorld,
  RigidBody,
  Shape,
  buildNativeNarrowPhaseContact
} from "../../../packages/physics/src/index.js";

test("native OBB SAT rejects rotated AABB false positives and accepts real overlap", () => {
  const rotation = zRotation(Math.PI / 4);
  const bodyA = new RigidBody(1, { type: "static", rotation });
  const colliderA = new Collider(1, bodyA.id, { shape: Shape.box(1, 0.1, 0.4) });
  const separatedBody = new RigidBody(2, { position: [-0.283, 0.283, 0], rotation });
  const overlappingBody = new RigidBody(3, { position: [-0.085, 0.085, 0], rotation });
  const separatedCollider = new Collider(2, separatedBody.id, { shape: Shape.box(1, 0.1, 0.4) });
  const overlappingCollider = new Collider(3, overlappingBody.id, { shape: Shape.box(1, 0.1, 0.4) });

  assert.equal(buildNativeNarrowPhaseContact(colliderA, bodyA, separatedCollider, separatedBody), undefined);
  const contact = buildNativeNarrowPhaseContact(colliderA, bodyA, overlappingCollider, overlappingBody);
  assert.equal(contact?.algorithm, "obb-sat");
  assert.ok((contact?.penetration ?? 0) > 0.05);
  assert.ok(Math.abs(Math.hypot(...(contact?.normal ?? [0, 0, 0])) - 1) < 1e-9);
  assert.ok(contact?.point.every(Number.isFinite));
});

/**
 * WS-4.3 disposition: classified `characterization` only because of the
 * `backend.active === "aura-js"` assertion below — a statement about *which solver ran*,
 * not about physics. Measured: with the pin rewritten to the production backend, the three
 * physical assertions (one broadphase pair, one contact, a finite contact point) pass
 * unchanged. `PhysicsWorld.detectContacts()` is called from `stepCannon` as well, so the
 * oriented-bounds broadphase and the OBB-SAT narrow phase are Aura3D's on *every* backend;
 * they are not a fallback feature. The pin and the backend assertion are therefore dropped
 * and the contract is asserted on the shipped default.
 */
test("broadphase uses oriented bounds and routes box pairs through SAT", () => {
  const world = new PhysicsWorld({
    gravity: [0, 0, 0],
    solverIterations: 1,
    enableSleeping: false
  });
  const rotation = zRotation(Math.PI / 4);
  const fixed = world.createRigidBody({ type: "static", rotation });
  world.createCollider(fixed, { shape: Shape.box(1, 0.1, 0.4), sensor: true });
  const moving = world.createRigidBody({ position: [-0.085, 0.085, 0], rotation });
  world.createCollider(moving, { shape: Shape.box(1, 0.1, 0.4), sensor: true });

  world.step(1 / 120);

  const snapshot = world.snapshot();
  assert.equal(snapshot.backend.active, "cannon-es", "the shared narrow phase must be proven on the production backend");
  assert.equal(snapshot.stats.broadphasePairs, 1);
  assert.equal(snapshot.stats.contacts, 1);
  assert.ok(snapshot.contacts[0]?.point?.every(Number.isFinite));
});

test("native convex hull pairs use GJK/EPA penetration", () => {
  const tetra = Shape.convexHull(
    [[0.8, 0.8, 0.8], [-0.8, -0.8, 0.8], [-0.8, 0.8, -0.8], [0.8, -0.8, -0.8]],
    [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
  );
  const bodyA = new RigidBody(1, { type: "static" });
  const bodyB = new RigidBody(2, { position: [0.35, 0.1, 0] });
  const colliderA = new Collider(1, bodyA.id, { shape: tetra });
  const colliderB = new Collider(2, bodyB.id, { shape: tetra });

  const contact = buildNativeNarrowPhaseContact(colliderA, bodyA, colliderB, bodyB);

  assert.equal(contact?.algorithm, "gjk-epa");
  assert.ok((contact?.penetration ?? 0) > 0);
  assert.ok(contact?.point.every(Number.isFinite));
});

test("native triangle meshes generate box contacts instead of AABB fallback contacts", () => {
  const floor = Shape.mesh(
    [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]],
    [0, 2, 1, 1, 2, 3]
  );
  const floorBody = new RigidBody(1, { type: "static" });
  const boxBody = new RigidBody(2, { position: [0, 0.25, 0], rotation: zRotation(0.2) });
  const floorCollider = new Collider(1, floorBody.id, { shape: floor });
  const boxCollider = new Collider(2, boxBody.id, { shape: Shape.box(0.5, 0.5, 0.5) });

  const contact = buildNativeNarrowPhaseContact(boxCollider, boxBody, floorCollider, floorBody);

  assert.equal(contact?.algorithm, "triangle-mesh");
  assert.ok((contact?.penetration ?? 0) > 0.15);
  assert.ok((contact?.normal[1] ?? 0) < -0.9);
});

test("native heightfields generate sphere contacts from cell triangles", () => {
  const terrain = Shape.heightfield([
    [0, 0.1, 0],
    [0.05, 0.2, 0.05],
    [0, 0.1, 0]
  ], 1);
  const terrainBody = new RigidBody(1, { type: "static" });
  const sphereBody = new RigidBody(2, { position: [0, 0.45, 0] });
  const terrainCollider = new Collider(1, terrainBody.id, { shape: terrain });
  const sphereCollider = new Collider(2, sphereBody.id, { shape: Shape.sphere(0.5) });

  const contact = buildNativeNarrowPhaseContact(sphereCollider, sphereBody, terrainCollider, terrainBody);

  assert.equal(contact?.algorithm, "heightfield-triangles");
  assert.ok((contact?.penetration ?? 0) > 0.1);
  assert.ok((contact?.normal[1] ?? 0) < -0.8);
});

test("native triangle surfaces accept rotated capsule contacts", () => {
  const floor = Shape.mesh(
    [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]],
    [0, 2, 1, 1, 2, 3]
  );
  const floorBody = new RigidBody(1, { type: "static" });
  const capsuleBody = new RigidBody(2, {
    position: [0, 0.35, 0],
    rotation: zRotation(Math.PI / 2)
  });
  const floorCollider = new Collider(1, floorBody.id, { shape: floor });
  const capsuleCollider = new Collider(2, capsuleBody.id, { shape: Shape.capsule(0.4, 0.7) });

  const contact = buildNativeNarrowPhaseContact(capsuleCollider, capsuleBody, floorCollider, floorBody);

  assert.equal(contact?.algorithm, "triangle-mesh");
  assert.ok((contact?.penetration ?? 0) > 0.04);
  assert.ok((contact?.normal[1] ?? 0) < -0.9);
});

function zRotation(angle: number): readonly [number, number, number, number] {
  return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
}
