import { describe, expect, it } from "vitest";
import { Constraint } from "../../../packages/physics/src/Constraint.js";
import { PhysicsWorld } from "../../../packages/physics/src/PhysicsWorld.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape } from "../../../packages/physics/src/Shape.js";
import { NativeSleepingController, type NativeSleepingContact } from "../../../packages/physics/src/native/NativeSleeping.js";

const policy = { linearSpeedThreshold: 0.05, angularSpeedThreshold: 0.1, quietDuration: 0.5 };

function controller(...bodies: RigidBody[]): NativeSleepingController {
  const result = new NativeSleepingController(policy);
  for (const body of bodies) result.add(body);
  return result;
}

function compareMotion(dt: number, radius: number, linear: number, angular: number, seconds: number) {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: dt });
  const publicBody = world.createRigidBody({ velocity: [linear, 0, 0], angularVelocity: [0, 0, angular] });
  world.createCollider(publicBody, { shape: Shape.sphere(radius) });
  const nativeBody = new RigidBody(1, { velocity: [linear, 0, 0], angularVelocity: [0, 0, angular] });
  const sleep = new NativeSleepingController({ linearSpeedThreshold: 0.1, angularSpeedThreshold: 0.2, quietDuration: 0.5 });
  sleep.add(nativeBody);
  let publicTime: number | undefined, nativeTime: number | undefined;
  for (let step = 1; step <= Math.ceil(seconds / dt); step++) {
    world.step(dt);
    sleep.finishStep(dt, [], []);
    if (publicTime === undefined && publicBody.sleeping) publicTime = step * dt;
    if (nativeTime === undefined && nativeBody.sleeping) nativeTime = step * dt;
    if (publicTime !== undefined && nativeTime !== undefined) break;
  }
  sleep.dispose();
  world.dispose();
  return { publicTime, nativeTime };
}

describe("direct public and experimental sleep comparisons", () => {
  it("has similar quiet-rest delay at several fixed step sizes", () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const result = compareMotion(dt, 0.5, 0, 0, 1);
      expect(result.publicTime).toBeDefined();
      expect(result.nativeTime).toBeDefined();
      expect(Math.abs(result.publicTime! - result.nativeTime!)).toBeLessThanOrEqual(dt + 1e-10);
    }
  });

  it("exposes timestep-sensitive behavior exactly at a marginal linear speed", () => {
    const coarse = compareMotion(1 / 30, 0.5, 0.1, 0, 2);
    const fine = compareMotion(1 / 60, 0.5, 0.1, 0, 2);
    expect(coarse.nativeTime).toBeCloseTo(0.5, 8);
    expect(fine.nativeTime).toBeCloseTo(0.5, 8);
    expect(coarse.publicTime).toBeGreaterThan(0.55);
    expect(coarse.publicTime).toBeLessThan(1.2);
    expect(fine.publicTime).toBeUndefined();
  });

  it("exposes shape-dependent coupling absent from separate explicit cutoffs", () => {
    const small = compareMotion(1 / 60, 0.05, 0.09, 0.09, 2);
    const large = compareMotion(1 / 60, 0.5, 0.09, 0.09, 2);
    expect(small.publicTime).toBeCloseTo(0.5, 8);
    expect(large.publicTime).toBeUndefined();
    expect(small.nativeTime).toBeCloseTo(0.5, 8);
    expect(large.nativeTime).toBeCloseTo(0.5, 8);
  });

  it("observes local hull offsets affecting automatic sleeping", () => {
    const sleeping: boolean[] = [];
    for (const offset of [0, 10]) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const body = world.createRigidBody({ angularVelocity: [0, 0, 0.01] });
      const vertices = [[0, 0, 0], [2, 0, 0], [0, 3, 0], [0, 0, 4]]
        .map((vertex) => [vertex[0]! + offset, vertex[1]! + offset, vertex[2]! + offset] as const);
      world.createCollider(body, { shape: Shape.convexHull(vertices, [0, 1, 2]) });
      for (let i = 0; i < 120; i++) world.step(1 / 60);
      sleeping.push(body.sleeping);
      world.dispose();
    }
    expect(sleeping).toEqual([true, false]);
  });

  it("distinguishes motion direction even when speed magnitudes and farthest hull radius match", () => {
    const radius = Math.sqrt(396), angular = 0.08 / radius, diagonal = angular / Math.sqrt(2);
    const shape = Shape.convexHull([[10, 10, 10], [12, 10, 10], [10, 13, 10], [10, 10, 14]], [0, 1, 2]);
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) for (const mass of [0.1, 1, 10]) {
      const outcomes: boolean[] = [];
      for (const [velocity, angularVelocity] of [
        [[0.06, 0, 0], [0, angular, 0]],
        [[0, 0.06, 0], [diagonal, diagonal, 0]]
      ] as const) {
        const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: dt });
        const body = world.createRigidBody({ velocity, angularVelocity, mass });
        world.createCollider(body, { shape });
        let minimum = Infinity, maximum = 0;
        for (let step = 0; step * dt < 1 && !body.sleeping; step++) {
          const score = Math.hypot(...body.velocity) + radius * Math.hypot(...body.angularVelocity);
          minimum = Math.min(minimum, score); maximum = Math.max(maximum, score);
          world.step(dt);
        }
        expect(minimum).toBeGreaterThan(0.13);
        expect(maximum).toBeLessThan(0.15);
        outcomes.push(body.sleeping);
        world.dispose();
      }
      expect(outcomes).toEqual([true, false]);
    }
  });

  it("keeps nonzero sustained force active when the host supplies activation", () => {
    for (const force of [0, 1e-6]) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const publicBody = world.createRigidBody();
      world.createCollider(publicBody, { shape: Shape.sphere(0.5) });
      const nativeBody = new RigidBody(1);
      const sleep = controller(nativeBody);
      let publicTime: number | undefined, nativeTime: number | undefined;
      for (let step = 1; step <= 120; step++) {
        if (publicTime === undefined) publicBody.applyForce([force, 0, 0]);
        if (nativeTime === undefined) {
          nativeBody.applyForce([force, 0, 0]);
          const activated = force === 0 ? [] : [nativeBody];
          sleep.wakeConnected([], [], activated);
          nativeBody.velocity[0] += force / 60;
          nativeBody.clearForces();
          sleep.finishStep(1 / 60, [], [], activated);
        }
        world.step(1 / 60);
        if (publicTime === undefined && publicBody.sleeping) publicTime = step / 60;
        if (nativeTime === undefined && nativeBody.sleeping) nativeTime = step / 60;
      }
      if (force === 0) {
        expect(publicTime).toBeCloseTo(0.5, 8);
        expect(nativeTime).toBeCloseTo(0.5, 8);
      } else {
        expect(publicTime).toBeUndefined();
        expect(nativeTime).toBeUndefined();
      }
      sleep.dispose(); world.dispose();
    }
  });

  it("matches wake propagation for sensors, physical contacts and enabled joints", () => {
    for (const mode of ["sensor", "contact", "joint", "motor"] as const) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const anchor = world.createRigidBody(mode === "motor" ? { type: "static" } : { position: [mode === "joint" ? -2 : -1.01, 0, 0], velocity: [3, 0, 0] });
      const sleeper = world.createRigidBody();
      if (mode !== "motor") world.createCollider(anchor, { shape: Shape.sphere(0.5), sensor: mode === "sensor" });
      world.createCollider(sleeper, { shape: Shape.sphere(0.5) });
      if (mode === "joint") world.createConstraint({ type: "fixed", bodyA: anchor, bodyB: sleeper });
      if (mode === "motor") world.createConstraint({ type: "motorised-hinge", bodyA: anchor, bodyB: sleeper, motorSpeed: 0, maxMotorTorque: 0 });
      sleeper.sleep();
      world.step(1 / 60);
      const nativeAnchor = new RigidBody(1, mode === "motor" ? { type: "static" } : {});
      const nativeSleeper = new RigidBody(2, { sleeping: true });
      const sleep = controller(nativeAnchor, nativeSleeper);
      const contacts = mode === "sensor" || mode === "contact" ? [{ bodyA: nativeAnchor, bodyB: nativeSleeper, sensor: mode === "sensor" }] : [];
      const joints = mode === "joint" ? [new Constraint({ type: "fixed", bodyA: nativeAnchor, bodyB: nativeSleeper })] :
        mode === "motor" ? [new Constraint({ type: "motorised-hinge", bodyA: nativeAnchor, bodyB: nativeSleeper, motorSpeed: 0, maxMotorTorque: 0 })] : [];
      sleep.wakeConnected(contacts, joints);
      expect(nativeSleeper.sleeping).toBe(sleeper.sleeping);
      expect(nativeSleeper.sleeping).toBe(mode === "sensor");
      sleep.dispose(); world.dispose();
    }
  });
});

describe("public sleep and wake observations", () => {
  it("sleeps idle bodies around half a second at multiple fixed steps", () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0], fixedDelta: dt });
      const body = world.createRigidBody();
      world.createCollider(body, { shape: Shape.sphere(0.5) });
      let elapsed = 0;
      while (!body.sleeping && elapsed < 0.75) { world.step(dt); elapsed += dt; }
      expect(body.sleeping).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(0.45);
      expect(elapsed).toBeLessThanOrEqual(0.55);
      world.dispose();
    }
  });

  it("disables automatic sleeping without overriding an explicit sleep", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const awake = world.createRigidBody();
    const asleep = world.createRigidBody({ position: [4, 0, 0], sleeping: true });
    world.createCollider(awake, { shape: Shape.sphere(0.5) });
    world.createCollider(asleep, { shape: Shape.sphere(0.5) });
    for (let i = 0; i < 120; i++) world.step(1 / 60);
    expect(awake.sleeping).toBe(false);
    expect(asleep.sleeping).toBe(true);
    asleep.applyForce([0, 0, 0]);
    expect(asleep.sleeping).toBe(false);
    world.step(1 / 60);
    expect(asleep.sleeping).toBe(false);
    world.dispose();
  });

  it("wakes through a solid contact or joint, but not a sensor", () => {
    for (const kind of ["contact", "sensor", "joint"] as const) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const moving = world.createRigidBody({ position: [-1.01, 0, 0], velocity: [3, 0, 0] });
      const sleeper = world.createRigidBody();
      world.createCollider(moving, { shape: Shape.sphere(0.5), sensor: kind === "sensor" });
      world.createCollider(sleeper, { shape: Shape.sphere(0.5) });
      if (kind === "joint") world.createConstraint({ type: "fixed", bodyA: moving, bodyB: sleeper });
      sleeper.sleep();
      world.step(1 / 60);
      expect(sleeper.sleeping).toBe(kind === "sensor");
      world.dispose();
    }
  });

  it("wakes immediately on force, torque, impulse, pose or explicit wake", () => {
    const actions: Array<(body: RigidBody) => void> = [
      (body) => body.wake(),
      (body) => body.applyForce([0, 0, 0]),
      (body) => body.applyTorque([0, 0, 0]),
      (body) => body.applyImpulse([0, 0, 0]),
      (body) => body.setPosition([0, 0, 0]),
      (body) => body.setVelocity([0, 0, 0])
    ];
    for (const action of actions) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const body = world.createRigidBody();
      world.createCollider(body, { shape: Shape.sphere(0.5) });
      body.sleep();
      action(body);
      expect(body.sleeping).toBe(false);
      world.step(1 / 60);
      expect(body.sleeping).toBe(false);
      world.dispose();
    }
  });

  it("keeps a settled body asleep when another body on the same fixed floor wakes", () => {
    const world = new PhysicsWorld({ gravity: [0, -9.81, 0] });
    const floor = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
    world.createCollider(floor, { shape: Shape.box(5, 0.5, 1) });
    const a = world.createRigidBody({ position: [-2, 0.5, 0] });
    const b = world.createRigidBody({ position: [2, 0.5, 0] });
    world.createCollider(a, { shape: Shape.sphere(0.5) });
    world.createCollider(b, { shape: Shape.sphere(0.5) });
    for (let i = 0; i < 180; i++) world.step(1 / 60);
    expect([a.sleeping, b.sleeping]).toEqual([true, true]);
    a.applyImpulse([0.1, 0, 0]);
    world.step(1 / 60);
    expect([a.sleeping, b.sleeping]).toEqual([false, true]);
    world.dispose();
  });

  it("keeps an enabled zero-speed motor awake", () => {
    for (const maxMotorTorque of [0, 2]) {
      const world = new PhysicsWorld({ gravity: [0, 0, 0] });
      const anchor = world.createRigidBody({ type: "static" });
      const body = world.createRigidBody();
      world.createCollider(body, { shape: Shape.sphere(0.5) });
      world.createConstraint({ type: "motorised-hinge", bodyA: anchor, bodyB: body, motorSpeed: 0, maxMotorTorque });
      body.sleep();
      for (let i = 0; i < 120; i++) world.step(1 / 60);
      expect(body.sleeping).toBe(false);
      world.dispose();
    }
  });
});

describe("isolated native sleeping controller", () => {
  it("sleeps a quiet body only after the configured interval", () => {
    const body = new RigidBody(1, { velocity: [0.01, 0, 0], angularVelocity: [0, 0.02, 0] });
    const sleep = controller(body);
    for (let i = 0; i < 4; i++) { sleep.finishStep(0.1, [], []); expect(body.sleeping).toBe(false); }
    sleep.finishStep(0.1, [], []);
    expect(body.sleeping).toBe(true);
    expect(body.velocity).toEqual([0, 0, 0]);
    expect(body.angularVelocity).toEqual([0, 0, 0]);
    sleep.dispose();
  });

  it("resets quiet time for either fast linear or angular motion", () => {
    const body = new RigidBody(1);
    const sleep = controller(body);
    sleep.finishStep(0.4, [], []);
    body.setVelocity([0.1, 0, 0]);
    sleep.finishStep(0.1, [], []);
    body.setVelocity([0, 0, 0]);
    body.setAngularVelocity([0, 0.2, 0]);
    sleep.finishStep(0.1, [], []);
    body.setAngularVelocity([0, 0, 0]);
    sleep.finishStep(0.4, [], []);
    expect(body.sleeping).toBe(false);
    sleep.finishStep(0.1, [], []);
    expect(body.sleeping).toBe(true);
    sleep.dispose();
  });

  it("preserves manual sleep when automatic sleeping is disabled", () => {
    const a = new RigidBody(1), b = new RigidBody(2, { sleeping: true });
    const sleep = new NativeSleepingController({ ...policy, enableSleeping: false });
    sleep.add(a); sleep.add(b);
    for (let i = 0; i < 20; i++) sleep.finishStep(0.1, [], []);
    expect(a.sleeping).toBe(false);
    expect(b.sleeping).toBe(true);
    b.applyForce([0, 0, 0]);
    sleep.wakeConnected([], []);
    sleep.finishStep(1, [], []);
    expect(b.sleeping).toBe(false);
    b.sleep();
    sleep.finishStep(1, [], []);
    expect(b.sleeping).toBe(true);
    sleep.dispose();
  });

  it("propagates across dynamic contacts and joints but not sensors or a shared static floor", () => {
    const a = new RigidBody(1), b = new RigidBody(2), c = new RigidBody(3), d = new RigidBody(4), e = new RigidBody(5);
    const floor = new RigidBody(6, { type: "static" });
    const joint = new Constraint({ type: "fixed", bodyA: b, bodyB: c });
    const contacts: NativeSleepingContact[] = [
      { bodyA: a, bodyB: b }, { bodyA: a, bodyB: floor }, { bodyA: d, bodyB: floor }, { bodyA: c, bodyB: e, sensor: true }
    ];
    const sleep = controller(a, b, c, d, e, floor);
    sleep.wakeConnected(contacts, [joint]);
    b.sleep(); c.sleep(); d.sleep(); e.sleep();
    sleep.wakeConnected(contacts, [joint]);
    expect([a.sleeping, b.sleeping, c.sleeping, d.sleeping, e.sleeping]).toEqual([false, false, false, true, true]);
    sleep.dispose();
  });

  it("sleeps an entire dynamic island together only when all bodies are quiet", () => {
    const a = new RigidBody(1), b = new RigidBody(2, { velocity: [1, 0, 0] });
    const sleep = controller(a, b);
    const link = [{ bodyA: a, bodyB: b }];
    for (let i = 0; i < 10; i++) sleep.finishStep(0.1, link, []);
    expect([a.sleeping, b.sleeping]).toEqual([false, false]);
    b.setVelocity([0, 0, 0]);
    sleep.finishStep(0.4, link, []);
    expect([a.sleeping, b.sleeping]).toEqual([false, false]);
    sleep.finishStep(0.1, link, []);
    expect([a.sleeping, b.sleeping]).toEqual([true, true]);
    sleep.dispose();
  });

  it("reacts to explicit activation and solid contact addition and removal", () => {
    const body = new RigidBody(1), floor = new RigidBody(2, { type: "static" });
    const sleep = controller(body, floor);
    body.sleep();
    sleep.wakeConnected([], [], [floor]);
    expect(body.sleeping).toBe(true);
    const link = [{ bodyA: body, bodyB: floor, key: "colliders:3:7" }];
    sleep.wakeConnected(link, []);
    expect(body.sleeping).toBe(false);
    body.sleep();
    sleep.wakeConnected(link, []);
    expect(body.sleeping).toBe(true);
    sleep.wakeConnected(link, [], [floor]);
    expect(body.sleeping).toBe(false);
    body.sleep();
    sleep.wakeConnected([], []);
    expect(body.sleeping).toBe(false);
    sleep.dispose();
  });

  it("wakes a registered neighbor when its touching body is removed", () => {
    const a = new RigidBody(1), b = new RigidBody(2);
    const sleep = controller(a, b);
    sleep.wakeConnected([{ bodyA: a, bodyB: b }], []);
    a.sleep(); b.sleep();
    sleep.remove(b);
    sleep.wakeConnected([], []);
    expect(a.sleeping).toBe(false);
    sleep.dispose();
  });

  it("does not let a sensor or disabled joint wake a body", () => {
    const a = new RigidBody(1), b = new RigidBody(2), c = new RigidBody(3);
    const joint = new Constraint({ type: "fixed", bodyA: a, bodyB: b });
    joint.setEnabled(false);
    const sleep = controller(a, b, c);
    b.sleep(); c.sleep();
    sleep.wakeConnected([{ bodyA: a, bodyB: c, sensor: true }], [joint]);
    expect([b.sleeping, c.sleeping]).toEqual([true, true]);
    joint.setEnabled(true);
    sleep.wakeConnected([{ bodyA: a, bodyB: c, sensor: true }], [joint]);
    expect([b.sleeping, c.sleeping]).toEqual([false, true]);
    sleep.dispose();
  });

  it("wakes a supported body for moving kinematics and an enabled zero-speed motor", () => {
    const kinematic = new RigidBody(1, { type: "kinematic", velocity: [1, 0, 0] });
    const body = new RigidBody(2, { sleeping: true }), anchor = new RigidBody(3, { type: "static" });
    const sleep = controller(kinematic, body, anchor);
    const contact = [{ bodyA: kinematic, bodyB: body }];
    sleep.wakeConnected(contact, []);
    expect(body.sleeping).toBe(false);
    for (let i = 0; i < 10; i++) sleep.finishStep(0.1, contact, []);
    expect(body.sleeping).toBe(false);
    kinematic.setVelocity([0, 0, 0]);
    kinematic.velocityOverridden = false;
    const motor = new Constraint({ type: "motorised-hinge", bodyA: anchor, bodyB: body, motorSpeed: 0, maxMotorTorque: 2 });
    sleep.wakeConnected([], [motor]);
    body.sleep();
    sleep.wakeConnected([], [motor]);
    expect(body.sleeping).toBe(false);
    for (let i = 0; i < 10; i++) sleep.finishStep(0.1, [], [motor]);
    expect(body.sleeping).toBe(false);
    sleep.dispose();
  });

  it("never consumes pending input when considering automatic sleep", () => {
    const body = new RigidBody(1);
    const sleep = controller(body);
    body.applyForce([1, 0, 0]);
    sleep.finishStep(2, [], []);
    expect(body.sleeping).toBe(false);
    expect(body.pendingForce()).toEqual([1, 0, 0]);
    body.clearForces();
    sleep.finishStep(0.5, [], []);
    expect(body.sleeping).toBe(true);
    sleep.dispose();
  });

  it("restores quiet time and graph bookkeeping after a rolled-back step", () => {
    const a = new RigidBody(1), b = new RigidBody(2, { sleeping: true });
    const sleep = controller(a, b);
    sleep.finishStep(0.4, [], []);
    const checkpoint = sleep.snapshotState();
    const before = { aSleeping: a.sleeping, bSleeping: b.sleeping };
    sleep.wakeConnected([{ bodyA: a, bodyB: b }], []);
    expect(b.sleeping).toBe(false);
    a.sleeping = before.aSleeping;
    b.sleeping = before.bSleeping;
    sleep.restoreState(checkpoint);
    sleep.wakeConnected([], []);
    expect(b.sleeping).toBe(true);
    sleep.finishStep(0.1, [], []);
    expect(a.sleeping).toBe(true);
    sleep.dispose();
  });

  it("rejects invalid configuration, foreign snapshots and changed registration", () => {
    expect(() => Reflect.construct(NativeSleepingController, [])).toThrow(/explicit thresholds/);
    expect(() => new NativeSleepingController({ ...policy, quietDuration: 0 })).toThrow(/quiet duration/);
    expect(() => new NativeSleepingController({ ...policy, linearSpeedThreshold: NaN })).toThrow(/threshold/);
    const a = new RigidBody(1), b = new RigidBody(2);
    const sleep = controller(a), other = controller(b);
    const checkpoint = sleep.snapshotState();
    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(Reflect.ownKeys(checkpoint)).toEqual([]);
    expect(() => other.restoreState(checkpoint)).toThrow(/snapshot.*controller/);
    expect(() => sleep.finishStep(0, [], [])).toThrow(/dt/);
    expect(() => sleep.wakeConnected([{ bodyA: a, bodyB: b }], [])).toThrow(/registered/);
    sleep.add(b);
    expect(() => sleep.restoreState(checkpoint)).toThrow(/body set changed/);
    sleep.dispose();
    expect(() => sleep.wakeConnected([], [])).toThrow(/disposed/);
    other.dispose();
  });
});

