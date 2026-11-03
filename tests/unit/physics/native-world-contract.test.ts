import { describe, expect, it } from "vitest";
import { Shape } from "../../../packages/physics/src/Shape.js";
import { NativePhysicsWorld, type NativePhysicsWorldOptions } from "../../../packages/physics/src/native/NativePhysicsWorld.js";

describe("experimental native world contract", () => {
  it("updates gravity in place and uses the configured fixed step in independent worlds", () => {
    const authoredGravity: [number, number, number] = [0, 0, 0];
    const world = new NativePhysicsWorld({ gravity: authoredGravity, fixedDelta: 0.2, seed: 42, backend: "native-experimental", enableSleeping: false });
    const other = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const body = world.createRigidBody();
      const otherBody = other.createRigidBody();
      const gravityReference = world.gravity;
      authoredGravity[0] = 100;
      expect(world.gravity).toEqual([0, 0, 0]);
      world.setGravity([2, 0, 0]);
      expect(world.gravity).toBe(gravityReference);
      expect(() => world.setGravity([1, Number.NaN, 3])).toThrow(/gravity/);
      expect(world.gravity).toEqual([2, 0, 0]);
      world.step();
      other.step();
      expect(body.velocity[0]).toBeCloseTo(0.4, 10);
      expect(otherBody.velocity).toEqual([0, 0, 0]);
      expect(world.snapshot().backend).toMatchObject({ requested: "native-experimental", active: "native-experimental", deterministic: true, seed: 42 });
      expect(other.snapshot().backend).toMatchObject({ requested: "auto", active: "native-experimental" });
    } finally {
      world.dispose();
      other.dispose();
    }
    expect(() => world.setGravity([0, 0, 0])).toThrow(/disposed/);
  });

  it("validates legacy descriptor fields and rejects unsupported requested policies", () => {
    const invalid: Array<[NativePhysicsWorldOptions, RegExp]> = [
      [{ backend: "rapier" }, /cannot select backend/],
      [{ seed: 1.5 }, /seed/],
      [{ sleepVelocityThreshold: -1 }, /sleepVelocityThreshold/],
      [{ sleepDelay: Number.NaN }, /sleepDelay/],
      [{ enableSleeping: "yes" as unknown as boolean }, /enableSleeping/],
      [{ enableSleeping: true }, /explicit sleeping policy/],
      [{ enableSleeping: true, sleeping: { enableSleeping: false, linearSpeedThreshold: 0.1, angularSpeedThreshold: 0.1, quietDuration: 1 } }, /conflicts/],
      [{ continuousCollision: { mode: "adaptive-substeps" } }, /does not support.*adaptive-substeps/],
      [{ continuousCollision: { mode: "linear", maxImpacts: 4097 } }, /impact limit/]
    ];
    for (const [descriptor, message] of invalid) expect(() => new NativePhysicsWorld(descriptor)).toThrow(message);
  });

  it("uses changed gravity in the explicit analytic continuous step", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    try {
      const body = world.createRigidBody();
      world.step(0.5);
      world.setGravity([0, 4, 0]);
      world.step(0.5);
      expect(body.velocity[1]).toBeCloseTo(2, 10);
      expect(body.position[1]).toBeCloseTo(0.5, 10);
      expect(world.snapshot().backend.continuousCollision).toMatchObject({ maxImpacts: 256, lastImpactBatches: 0, lastTrajectory: "constant-acceleration" });
    } finally { world.dispose(); }
  });

  it("re-evaluates continuous support when gravity reverses", () => {
    const world = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    try {
      const floor = world.createRigidBody({ type: "static" });
      world.createCollider(floor, { shape: Shape.plane(), material: { friction: 0 } });
      const ball = world.createRigidBody({ position: [0, 0.5, 0] });
      world.createCollider(ball, { shape: Shape.sphere(0.5), material: { friction: 0 } });
      expect(world.step(0.1).map((event) => event.type)).toEqual(["begin"]);
      world.setGravity([0, 10, 0]);
      expect(world.step(0.1).map((event) => event.type)).toEqual(["end"]);
      expect(ball.position[1]).toBeCloseTo(0.55, 9);
      expect(ball.velocity[1]).toBeCloseTo(1, 9);
      expect(world.snapshot().contacts).toEqual([]);
    } finally { world.dispose(); }
  });

  it("reports explicit native sleep and linear CCD policies without claiming legacy parity", () => {
    const policy = { linearSpeedThreshold: 0.01, angularSpeedThreshold: 0.01, quietDuration: 0.05 };
    const sleeping = new NativePhysicsWorld({ gravity: [0, 0, 0], enableSleeping: true, sleeping: policy });
    const manual = new NativePhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false, sleeping: policy });
    const continuous = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear", maxImpacts: 3 } });
    try {
      const sleeper = sleeping.createRigidBody();
      const awake = manual.createRigidBody();
      for (let i = 0; i < 3; i += 1) { sleeping.step(1 / 60); manual.step(1 / 60); }
      expect(sleeper.sleeping).toBe(true);
      expect(awake.sleeping).toBe(false);
      expect(sleeping.snapshot().backend.sleeping).toEqual({ active: true, provider: "native-explicit" });
      expect(manual.snapshot().backend.sleeping).toEqual({ active: false, provider: "manual-only" });
      expect(continuous.snapshot().backend.continuousCollision).toEqual({ active: true, mode: "linear", provider: "native-linear", lastSubSteps: 0, maxImpacts: 3, lastImpactBatches: 0 });
    } finally {
      sleeping.dispose();
      manual.dispose();
      continuous.dispose();
    }
  });

  it("publishes measured final-pose diagnostics and updates contact/event lifecycle", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const floor = world.createRigidBody({ type: "static" });
      world.createCollider(floor, { shape: Shape.plane(), sensor: true });
      const moving = world.createRigidBody({ type: "kinematic", position: [0, 0.25, 0] });
      const collider = world.createCollider(moving, { shape: Shape.sphere(0.5) });
      expect(world.step().map((event) => event.type)).toEqual(["begin"]);
      const snapshot = world.snapshot();
      expect(snapshot.backend.continuousCollision).toEqual({ active: false, mode: "disabled", provider: "none", lastSubSteps: 1 });
      expect(snapshot.stats).toMatchObject({
        steps: 1, bodies: 2, colliders: 2, constraints: 0, subSteps: 1,
        broadphasePairs: 1, broadphaseFiniteColliders: 1, broadphaseInfiniteColliders: 1,
        broadphaseCandidateTests: 1, broadphaseActiveMax: 1, broadphaseRejectedByBounds: 0,
        contacts: 1, events: 1, sleepingBodies: 0, kineticEnergy: 0, maxContactPenetration: 0
      });
      expect(world.drainEvents().map((event) => event.type)).toEqual(["begin"]);
      expect(world.snapshot().stats.events).toBe(0);
      world.removeCollider(collider.id);
      expect(world.snapshot().stats).toMatchObject({ colliders: 1, contacts: 0, events: 1 });
      expect(world.drainEvents().map((event) => event.type)).toEqual(["end"]);
      world.step();
      expect(world.snapshot().stats).toMatchObject({ steps: 2, broadphasePairs: 0, broadphaseFiniteColliders: 0, broadphaseInfiniteColliders: 1, contacts: 0, events: 0 });
    } finally { world.dispose(); }
  });

  it("computes kinetic energy from the native world-space inertia tensor", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const halfTurn = Math.SQRT1_2;
      world.createRigidBody({ mass: 2, inertia: [1, 2, 3], rotation: [0, 0, halfTurn, halfTurn], velocity: [3, 4, 0], angularVelocity: [1, 0, 0] });
      world.createRigidBody({ type: "static", velocity: [100, 0, 0] });
      expect(world.snapshot().stats.kineticEnergy).toBeCloseTo(26, 10);
    } finally { world.dispose(); }
  });

  it("counts a broadphase candidate rejected by separated bounds", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const a = world.createRigidBody({ type: "static" });
      world.createCollider(a, { shape: Shape.sphere(1), sensor: true });
      const b = world.createRigidBody({ type: "kinematic", position: [0, 3, 0] });
      world.createCollider(b, { shape: Shape.sphere(1) });
      world.step();
      expect(world.snapshot().stats).toMatchObject({
        broadphasePairs: 0, broadphaseFiniteColliders: 2, broadphaseInfiniteColliders: 0,
        broadphaseCandidateTests: 1, broadphaseActiveMax: 2, broadphaseRejectedByBounds: 1, contacts: 0
      });
    } finally { world.dispose(); }
  });

  it("does not expose live body or contact vectors through snapshots", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    try {
      const floor = world.createRigidBody({ type: "static" });
      world.createCollider(floor, { shape: Shape.plane(), sensor: true });
      const body = world.createRigidBody({ type: "kinematic", position: [0, 0.25, 0] });
      world.createCollider(body, { shape: Shape.sphere(0.5) });
      world.step();
      const copy = world.snapshot();
      const expected = world.snapshot();
      (copy.bodies[1]!.position as unknown as number[])[0] = 100;
      (copy.contacts[0]!.normal as unknown as number[])[0] = 100;
      if (copy.contacts[0]!.point) (copy.contacts[0]!.point as unknown as number[])[0] = 100;
      expect(world.snapshot()).toEqual(expected);
    } finally { world.dispose(); }
  });

  it("keeps diagnostic state transactional when a step exceeds its motion budget", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], maxSubSteps: 1 });
    try {
      const body = world.createRigidBody();
      world.createCollider(body, { shape: Shape.sphere(0.1) });
      world.step();
      body.setVelocity([100, 0, 0]);
      body.applyForce([1, 0, 0]);
      const before = world.snapshot();
      expect(() => world.step(1)).toThrow(/exceeding maxSubSteps/);
      expect(world.snapshot()).toEqual(before);
      expect(body.pendingForce()).toEqual([1, 0, 0]);
    } finally { world.dispose(); }
  });

  it("retains a manually sleeping body in continuous mode until a solid impact wakes it", () => {
    const quiet = new NativePhysicsWorld({ gravity: [0, -10, 0], continuousCollision: { mode: "linear" } });
    const impact = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear" } });
    try {
      const resting = quiet.createRigidBody({ sleeping: true });
      quiet.createCollider(resting, { shape: Shape.sphere(0.5) });
      quiet.step(0.5);
      expect(resting.sleeping).toBe(true);
      expect(resting.position).toEqual([0, 0, 0]);

      const sleeper = impact.createRigidBody({ sleeping: true });
      impact.createCollider(sleeper, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
      const incoming = impact.createRigidBody({ position: [-3, 0, 0], velocity: [8, 0, 0] });
      impact.createCollider(incoming, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
      impact.step(0.5);
      expect(sleeper.sleeping).toBe(false);
      expect(sleeper.velocity[0]).toBeCloseTo(8, 8);
      expect(sleeper.position[0]).toBeCloseTo(2, 8);
      expect(impact.snapshot().stats.sleepingBodies).toBe(0);
      expect(impact.snapshot().backend.continuousCollision).toMatchObject({ lastImpactBatches: 1, lastTrajectory: "constant-acceleration" });
    } finally { quiet.dispose(); impact.dispose(); }
  });

  it("rolls back a continuous impact and sleep transition if a later impact exceeds the limit", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0], continuousCollision: { mode: "linear", maxImpacts: 1 } });
    try {
      const sleeper = world.createRigidBody({ sleeping: true });
      world.createCollider(sleeper, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
      const incoming = world.createRigidBody({ position: [-3, 0, 0], velocity: [8, 0, 0] });
      world.createCollider(incoming, { shape: Shape.sphere(0.5), material: { friction: 0, restitution: 1 } });
      const wall = world.createRigidBody({ type: "static", position: [2, 0, 0] });
      world.createCollider(wall, { shape: Shape.plane([-1, 0, 0]), material: { friction: 0, restitution: 1 } });
      const before = world.snapshot();
      expect(() => world.step(0.5)).toThrow(/impact/i);
      expect(world.snapshot()).toEqual(before);
      expect(sleeper.sleeping).toBe(true);
    } finally { world.dispose(); }
  });

  it("invalidates world-owned controllers on removal and makes disposal idempotent", () => {
    const world = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const characterBody = world.createRigidBody({ type: "kinematic" });
    const characterCollider = world.createCollider(characterBody, { shape: Shape.sphere(0.5) });
    const character = world.createCharacterController(characterBody);
    const chassis = world.createRigidBody();
    const vehicle = world.createVehicleController(chassis);
    world.removeCollider(characterCollider.id);
    expect(() => character.position()).toThrow(/disposed/);
    world.removeRigidBody(chassis.id);
    expect(() => vehicle.currentSpeed()).toThrow(/disposed/);
    world.dispose();
    world.dispose();
    expect(() => world.snapshot()).toThrow(/disposed/);
    expect(() => world.step()).toThrow(/disposed/);
  });
});
