import assert from "node:assert/strict";
import { test } from "vitest";
import { PhysicsWorld, Shape } from "../../../packages/physics/src/index.js";

test("physics broadphase exposes deterministic pruning profile", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const overlappingA = world.createRigidBody({ position: [0, 0, 0] });
  world.createCollider(overlappingA, { shape: Shape.box(1, 1, 1) });
  const overlappingB = world.createRigidBody({ position: [0.5, 0, 0] });
  world.createCollider(overlappingB, { shape: Shape.box(1, 1, 1) });

  for (let index = 0; index < 100; index += 1) {
    const body = world.createRigidBody({ position: [20 + index * 4, 0, 0] });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  }

  world.step(1 / 60);
  const stats = world.snapshot().stats;
  const naivePairCount = stats.colliders * (stats.colliders - 1) / 2;

  assert.equal(stats.broadphaseFiniteColliders, 102);
  assert.equal(stats.broadphaseInfiniteColliders, 0);
  assert.equal(stats.broadphasePairs, 1);
  assert.equal(stats.contacts, 1);
  assert.ok(stats.broadphaseCandidateTests < naivePairCount / 20);
  assert.ok(stats.broadphaseActiveMax <= 2);
  assert.equal(stats.broadphaseRejectedByBounds, 0);
});

test("physics broadphase profiles finite versus infinite collider pairing", () => {
  const world = new PhysicsWorld({ gravity: [0, 0, 0] });
  const plane = world.createRigidBody({ type: "static", position: [0, 0, 0] });
  world.createCollider(plane, { shape: Shape.plane([0, 1, 0], 0) });

  for (let index = 0; index < 5; index += 1) {
    const body = world.createRigidBody({ position: [index * 4, 0.25, 0] });
    world.createCollider(body, { shape: Shape.box(0.5, 0.5, 0.5) });
  }

  world.step(1 / 60);
  const stats = world.snapshot().stats;

  assert.equal(stats.broadphaseFiniteColliders, 5);
  assert.equal(stats.broadphaseInfiniteColliders, 1);
  assert.equal(stats.broadphaseCandidateTests, 5);
  assert.equal(stats.broadphasePairs, 5);
  assert.equal(stats.contacts, 5);
});
