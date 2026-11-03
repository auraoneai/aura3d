import { describe, expect, it } from "vitest";
import { Constraint } from "../../../packages/physics/src/Constraint.js";
import { RigidBody, type Quat } from "../../../packages/physics/src/RigidBody.js";
import { NativeJointSolver } from "../../../packages/physics/src/native/NativeJoints.js";
import { nativeMassProperties, setNativeMassProperties } from "../../../packages/physics/src/native/NativeMassProperties.js";
import { Shape, rotateVec3ByQuat, type Vec3 } from "../../../packages/physics/src/Shape.js";

// Uniform tetrahedron, local center [0, 1, 0], mass 2, and tensor
// [[15/8, 3/20, 1/5], [3/20, 3/2, 3/10], [1/5, 3/10, 39/40]].
const translatedTetrahedron = Shape.convexHull([
  [-0.5, 0.25, -1], [1.5, 0.25, -1], [-0.5, 3.25, -1], [-0.5, 0.25, 3]
], [0, 1, 2]);

function rotation(axis: Vec3, radians: number): Quat {
  const length = Math.hypot(...axis);
  const scale = Math.sin(radians / 2) / length;
  return [axis[0] * scale, axis[1] * scale, axis[2] * scale, Math.cos(radians / 2)];
}

function multiply(a: Quat, b: Quat): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

function integrate(body: RigidBody, dt: number): void {
  if (body.type !== "dynamic") return;
  body.position = [body.position[0] + body.velocity[0] * dt, body.position[1] + body.velocity[1] * dt, body.position[2] + body.velocity[2] * dt];
  const angularSpeed = Math.hypot(...body.angularVelocity);
  if (angularSpeed > 1e-12) body.rotation = multiply(rotation(body.angularVelocity, angularSpeed * dt), body.rotation);
}

function step(solver: NativeJointSolver, bodies: readonly RigidBody[], dt = 1 / 120, iterations = 8, gravity: Vec3 = [0, 0, 0]): void {
  for (const body of bodies) if (body.type === "dynamic") {
    body.applyImpulse([gravity[0] * body.mass * dt, gravity[1] * body.mass * dt, gravity[2] * body.mass * dt]);
  }
  solver.beginStep(dt);
  for (let i = 0; i < iterations; i++) solver.solve(dt);
  for (const body of bodies) integrate(body, dt);
}

function near(actual: readonly number[], expected: readonly number[], digits = 6): void {
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBeCloseTo(expected[i]!, digits);
}

describe("independent native joint solver", () => {
  it("treats a static body's authored velocities as stationary", () => {
    const a = new RigidBody(1, { type: "static", velocity: [30, -10, 4], angularVelocity: [3, 5, 1] });
    const b = new RigidBody(2);
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: b }));
    step(solver, [a, b]);
    near(b.velocity, [0, 0, 0]);
    near(b.angularVelocity, [0, 0, 0]);
    solver.dispose();
  });

  it("transfers authored kinematic velocity to a constrained dynamic body", () => {
    const a = new RigidBody(1, { type: "kinematic", velocity: [2, 0, 0], angularVelocity: [0, 3, 0] });
    const b = new RigidBody(2);
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: b }));
    solver.beginStep(1 / 60);
    for (let i = 0; i < 8; i++) solver.solve(1 / 60);
    near(b.velocity, [2, 0, 0]);
    near(b.angularVelocity, [0, 3, 0]);
    solver.dispose();
  });

  it("uses the rotated center of mass for an anchor already moving with its body", () => {
    const b = new RigidBody(2, { mass: 2, position: [3, 4, 0], rotation: rotation([0, 0, 1], Math.PI / 2), angularVelocity: [0, 0, 1] });
    setNativeMassProperties(b, nativeMassProperties(2, [translatedTetrahedron]));
    const a = new RigidBody(1, { type: "static", position: [2, 4, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "ball-socket", bodyA: a, bodyB: b, localAnchorB: [0, 1, 0] }));
    solver.beginStep(0.1);
    for (let i = 0; i < 8; i++) solver.solve(0.1);
    near(b.velocity, [0, 0, 0], 9);
    near(b.angularVelocity, [0, 0, 1], 9);
    solver.dispose();
  });

  it("uses center-of-mass lever arms and the full tensor in a spring impulse", () => {
    const a = new RigidBody(1, { type: "static", position: [-1, 0, 0] });
    const b = new RigidBody(2, { mass: 2, velocity: [1, 0, 0] });
    setNativeMassProperties(b, nativeMassProperties(2, [translatedTetrahedron]));
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "spring", bodyA: a, bodyB: b, restLength: 1, stiffness: 0.5, damping: 0.8 }));
    solver.beginStep(0.1);
    solver.solve(0.1);
    // I^-1 * z = [-170, -355, 1860] / 1673. The spring gamma is 10/13.
    const impulse = -1 / (0.5 + 1860 / 1673 + 10 / 13);
    near(b.velocity, [1 + impulse / 2, 0, 0], 9);
    near(b.angularVelocity, [-170 * impulse / 1673, -355 * impulse / 1673, 1860 * impulse / 1673], 9);
    solver.dispose();
  });

  it("applies a bounded motor impulse through a rotated full inertia tensor", () => {
    const b = new RigidBody(2, { mass: 2, rotation: rotation([0, 0, 1], Math.PI / 2) });
    setNativeMassProperties(b, nativeMassProperties(2, [translatedTetrahedron]));
    const a = new RigidBody(1, { type: "static", position: [-1, 0, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "motorised-hinge", bodyA: a, bodyB: b, localAnchorB: [0, 1, 0], axis: [0, 0, 1], motorSpeed: 10, maxMotorTorque: 2 }));
    solver.beginStep(0.1);
    solver.solve(0.1);
    // A 0.2 z angular impulse, transformed through the tetrahedron tensor and 90° pose.
    near(b.angularVelocity, [71 / 1673, -34 / 1673, 372 / 1673], 9);
    near(b.velocity, [0, 0, 0], 9);
    solver.dispose();
  });

  it("conserves linear and angular momentum about the world origin for offset centers", () => {
    const a = new RigidBody(1, { mass: 2 });
    const b = new RigidBody(2, { mass: 2, velocity: [1, 0, 0] });
    setNativeMassProperties(a, nativeMassProperties(2, [translatedTetrahedron]));
    setNativeMassProperties(b, nativeMassProperties(2, [translatedTetrahedron]));
    const momentum = (body: RigidBody): Vec3 => {
      const [x, y, z] = body.angularVelocity;
      // Tensor times angular velocity, plus center [0, 1, 0] cross linear momentum.
      return [15 / 8 * x + 3 / 20 * y + z / 5 + 2 * body.velocity[2],
        3 / 20 * x + 3 / 2 * y + 3 / 10 * z,
        x / 5 + 3 / 10 * y + 39 / 40 * z - 2 * body.velocity[0]];
    };
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "ball-socket", bodyA: a, bodyB: b }));
    solver.beginStep(0.1);
    for (let i = 0; i < 12; i++) solver.solve(0.1);
    near(a.velocity.map((value, axis) => 2 * (value + b.velocity[axis]!)), [2, 0, 0], 9);
    const one = momentum(a), two = momentum(b);
    near(one.map((value, axis) => value + two[axis]!), [0, 0, -2], 9);
    solver.dispose();
  });

  it("returns a displaced fixed joint to its original relative orientation", () => {
    const a = new RigidBody(1, { type: "static", rotation: rotation([0, 0, 1], Math.PI / 3) });
    const original = rotation([0, 1, 0], Math.PI / 4);
    const b = new RigidBody(2, { rotation: original });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: b }));
    b.setRotation(multiply(rotation([1, 0, 0], 0.5), original));
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    near(b.rotation, original, 5);
    expect(Math.hypot(...b.angularVelocity)).toBeLessThan(1e-4);
    solver.dispose();
  });
  it("preserves a fixed joint's initial offset and relative pose", () => {
    const a = new RigidBody(1, { type: "static", position: [1, 2, 0], rotation: rotation([0, 0, 1], Math.PI / 2) });
    const b = new RigidBody(2, { position: [2, 1, 0], rotation: rotation([1, 0, 0], Math.PI / 3) });
    const originalRotation = [...b.rotation];
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: b }));
    for (let i = 0; i < 240; i++) step(solver, [a, b], 1 / 120, 10, [0, -9.81, 0]);
    near(b.position, [2, 1, 0], 4);
    near(b.rotation, originalRotation, 4);
    solver.dispose();
  });

  it("distinguishes omitted fixed anchors from explicitly coincident local origins", () => {
    const a = new RigidBody(1, { type: "static" });
    const preserved = new RigidBody(2, { position: [2, 0, 0] });
    const pulled = new RigidBody(3, { position: [2, 2, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: preserved }));
    solver.add(new Constraint({ type: "fixed", bodyA: a, bodyB: pulled, localAnchorA: [0, 0, 0], localAnchorB: [0, 0, 0] }), { preserveOffset: false });
    for (let i = 0; i < 90; i++) step(solver, [a, preserved, pulled]);
    near(preserved.position, [2, 0, 0], 5);
    expect(Math.hypot(...pulled.position)).toBeLessThan(1e-5);
    solver.dispose();
  });

  it("holds ball-socket anchors while allowing free angular motion", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { angularVelocity: [0, 3, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "ball-socket", bodyA: a, bodyB: b }));
    for (let i = 0; i < 120; i++) step(solver, [a, b], 1 / 120, 8, [0, -9.81, 0]);
    near(b.position, [0, 0, 0], 5);
    near(b.angularVelocity, [0, 3, 0], 5);
    solver.dispose();
  });

  it("uses the authored world hinge axis for differently rotated bodies", () => {
    const a = new RigidBody(1, { type: "static", rotation: rotation([0, 0, 1], Math.PI / 2) });
    const b = new RigidBody(2, { rotation: rotation([1, 0, 0], Math.PI / 2), angularVelocity: [2, 3, -1] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0] }));
    step(solver, [a, b]);
    near(b.angularVelocity, [0, 3, 0], 6);
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    const initialAxisB = rotateVec3ByQuat([0, 0, -1], b.rotation);
    near(initialAxisB, [0, 1, 0], 4);
    expect(b.angularVelocity[1]).toBeCloseTo(3, 5);
    solver.dispose();
  });

  it("recovers when a hinge's local axes become antiparallel", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2);
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0] }));
    b.setRotation(rotation([0, 0, 1], Math.PI));
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    near(rotateVec3ByQuat([0, 1, 0], b.rotation), [0, 1, 0], 5);
    solver.dispose();
  });

  it("keeps rotated off-center hinge anchors coincident during motion", () => {
    const a = new RigidBody(1, { type: "static", position: [1, 0, 0], rotation: rotation([0, 0, 1], Math.PI / 2) });
    const b = new RigidBody(2, { position: [1, 1, 0], rotation: rotation([0, 0, 1], Math.PI / 2), angularVelocity: [0, 0, 2] });
    const localA: Vec3 = [0.5, 0, 0];
    const localB: Vec3 = [-0.5, 0, 0];
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 0, 1], localAnchorA: localA, localAnchorB: localB }));
    let maxSeparation = 0;
    for (let i = 0; i < 240; i++) {
      step(solver, [a, b], 1 / 120, 12, [0, -9.81, 0]);
      const ra = rotateVec3ByQuat(localA, a.rotation);
      const rb = rotateVec3ByQuat(localB, b.rotation);
      maxSeparation = Math.max(maxSeparation, Math.hypot(
        b.position[0] + rb[0] - a.position[0] - ra[0],
        b.position[1] + rb[1] - a.position[1] - ra[1],
        b.position[2] + rb[2] - a.position[2] - ra[2]
      ));
    }
    expect(maxSeparation).toBeLessThan(0.01);
    expect(Math.abs(b.position[0] - 1)).toBeGreaterThan(0.05);
    solver.dispose();
  });

  it("keeps a hinge inside its angular limits while allowing motion between them", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { angularVelocity: [0, 3, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], limits: [-0.2, 0.4] }));
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    let angle = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
    expect(angle).toBeGreaterThan(0.35);
    expect(angle).toBeLessThanOrEqual(0.401);
    b.setAngularVelocity([0, -3, 0]);
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    angle = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
    expect(angle).toBeGreaterThanOrEqual(-0.201);
    expect(angle).toBeLessThan(-0.15);
    solver.dispose();
  });

  it("tracks hinge limits across a full quaternion revolution", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { angularVelocity: [0, 3, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], limits: [-1, 7] }));
    let previous = 0;
    let traveled = 0;
    for (let i = 0; i < 480; i++) {
      step(solver, [a, b]);
      let angle = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
      while (angle > Math.PI) angle -= 2 * Math.PI;
      while (angle < -Math.PI) angle += 2 * Math.PI;
      let difference = angle - previous;
      if (difference > Math.PI) difference -= 2 * Math.PI;
      if (difference < -Math.PI) difference += 2 * Math.PI;
      traveled += difference;
      previous = angle;
    }
    expect(traveled).toBeGreaterThan(6.9);
    expect(traveled).toBeLessThanOrEqual(7.001);
    solver.dispose();
  });

  it("constrains slider translation to its axis and locks relative rotation", () => {
    const a = new RigidBody(1, { type: "static", rotation: rotation([0, 0, 1], Math.PI / 2) });
    const b = new RigidBody(2, { velocity: [2, 3, -1], angularVelocity: [1, 1, 1] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "slider", bodyA: a, bodyB: b, axis: [1, 0, 0] }));
    for (let i = 0; i < 120; i++) step(solver, [a, b]);
    expect(b.position[0]).toBeCloseTo(2, 4);
    expect(Math.hypot(b.position[1], b.position[2])).toBeLessThan(1e-6);
    expect(Math.hypot(...b.angularVelocity)).toBeLessThan(1e-6);
    solver.dispose();
  });

  it("applies a motor's torque budget once per substep regardless of iteration count", () => {
    for (const iterations of [1, 5, 30]) {
      const a = new RigidBody(1, { type: "static" });
      const b = new RigidBody(2, { inertia: [1, 1, 1] });
      const solver = new NativeJointSolver();
      const joint = new Constraint({ type: "motorised-hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], motorSpeed: 10, maxMotorTorque: 2 });
      solver.add(joint);
      step(solver, [a, b], 0.1, iterations);
      expect(b.angularVelocity[1]).toBeCloseTo(0.2, 8);
      step(solver, [a, b], 0.1, iterations);
      expect(b.angularVelocity[1]).toBeCloseTo(0.4, 8);
      joint.setMotorSpeed(-10);
      step(solver, [a, b], 0.1, iterations);
      expect(b.angularVelocity[1]).toBeCloseTo(0.2, 8);
      solver.dispose();
    }
  });

  it("restores the prior substep and motor impulse budget after a failed solve", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { inertia: [1, 1, 1] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "motorised-hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], motorSpeed: 10, maxMotorTorque: 2 }));
    const beforeStep = solver.snapshotState();
    solver.beginStep(0.1);
    solver.solve(0.1);
    expect(b.angularVelocity[1]).toBeCloseTo(0.2, 8);
    const checkpoint = solver.snapshotState();
    const velocity = [...b.angularVelocity] as [number, number, number];
    solver.beginStep(0.2);
    solver.solve(0.2);
    expect(b.angularVelocity[1]).toBeGreaterThan(0.2);
    b.setAngularVelocity(velocity);
    solver.restoreState(checkpoint);
    solver.solve(0.1);
    expect(b.angularVelocity[1]).toBeCloseTo(0.2, 8);
    solver.beginStep(0.1);
    solver.solve(0.1);
    expect(b.angularVelocity[1]).toBeCloseTo(0.4, 8);
    solver.restoreState(beforeStep);
    expect(() => solver.solve(0.1)).toThrow(/beginStep/);
    solver.dispose();
  });

  it("restores the accumulated spring impulse when retrying a solver iteration", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { position: [2, 0, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "spring", bodyA: a, bodyB: b, restLength: 1, stiffness: 0.5, damping: 0.8 }));
    solver.beginStep(0.1);
    solver.solve(0.1);
    const checkpoint = solver.snapshotState();
    const velocity = [...b.velocity] as [number, number, number];
    solver.beginStep(0.2);
    solver.solve(0.2);
    b.setVelocity(velocity);
    solver.restoreState(checkpoint);
    solver.solve(0.1);
    near(b.velocity, velocity, 9);
    solver.dispose();
  });

  it("restores unwrapped hinge history after a failed step crosses a revolution", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { angularVelocity: [0, 3, 0] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], limits: [-1, 14] }));
    for (let i = 0; i < 280; i++) step(solver, [a, b]);
    const checkpoint = solver.snapshotState();
    const savedRotation = [...b.rotation] as [number, number, number, number];
    const savedVelocity = [...b.angularVelocity] as [number, number, number];
    for (let i = 0; i < 270; i++) step(solver, [a, b]);
    b.setRotation(savedRotation);
    b.setAngularVelocity(savedVelocity);
    solver.restoreState(checkpoint);
    let previous = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
    let traveled = 0;
    for (let i = 0; i < 320; i++) {
      step(solver, [a, b]);
      const angle = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
      let delta = angle - previous;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      traveled += delta;
      previous = angle;
    }
    expect(traveled).toBeGreaterThan(6.9);
    expect(traveled).toBeLessThanOrEqual(7.03);
    solver.dispose();
  });

  it("rejects foreign and stale snapshots without exposing their contents", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2);
    const joint = new Constraint({ type: "fixed", bodyA: a, bodyB: b });
    const solver = new NativeJointSolver();
    const other = new NativeJointSolver();
    solver.add(joint);
    solver.beginStep(0.1);
    const checkpoint = solver.snapshotState();
    expect(Reflect.ownKeys(checkpoint)).toEqual([]);
    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(() => other.restoreState(checkpoint)).toThrow(/snapshot.*solver/);
    solver.remove(joint);
    solver.add(joint);
    expect(() => solver.restoreState(checkpoint)).toThrow(/joint set changed/);
    solver.dispose();
    expect(() => solver.restoreState(checkpoint)).toThrow(/disposed/);
    other.dispose();
  });

  it("applies equal and opposite inertia-weighted motor impulses", () => {
    const a = new RigidBody(1, { inertia: [1, 2, 1] });
    const b = new RigidBody(2, { inertia: [1, 4, 1] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "motorised-hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], motorSpeed: 5, maxMotorTorque: 3 }));
    step(solver, [a, b], 0.1, 10);
    expect(a.angularVelocity[1]).toBeCloseTo(-0.15, 8);
    expect(b.angularVelocity[1]).toBeCloseTo(0.075, 8);
    expect(2 * a.angularVelocity[1] + 4 * b.angularVelocity[1]).toBeCloseTo(0, 8);
    solver.dispose();
  });

  it("conserves world angular momentum with rotated anisotropic inertias", () => {
    const inertiaA: Vec3 = [1, 2, 5];
    const inertiaB: Vec3 = [3, 4, 1];
    const a = new RigidBody(1, { rotation: rotation([1, 0, 0], Math.PI / 4), angularVelocity: [2, -1, 0.2], inertia: inertiaA });
    const b = new RigidBody(2, { rotation: rotation([0, 0, 1], Math.PI / 3), angularVelocity: [-0.3, 1, 2], inertia: inertiaB });
    const momentum = (body: RigidBody, inertia: Vec3): Vec3 => {
      const q = body.rotation;
      const local = rotateVec3ByQuat(body.angularVelocity, [-q[0], -q[1], -q[2], q[3]]);
      return rotateVec3ByQuat([local[0] * inertia[0], local[1] * inertia[1], local[2] * inertia[2]], q);
    };
    const sumMomentum = (): Vec3 => {
      const left = momentum(a, inertiaA), right = momentum(b, inertiaB);
      return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
    };
    const before = sumMomentum();
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "hinge", bodyA: a, bodyB: b, axis: [0, 1, 0] }));
    solver.beginStep(1 / 60);
    for (let i = 0; i < 30; i++) solver.solve(1 / 60);
    near(sumMomentum(), before, 8);
    expect(b.angularVelocity[0] - a.angularVelocity[0]).toBeCloseTo(0, 7);
    expect(b.angularVelocity[2] - a.angularVelocity[2]).toBeCloseTo(0, 7);
    solver.dispose();
  });

  it("does not let a motor drive through a hinge's angular limit", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { inertia: [1, 1, 1] });
    const solver = new NativeJointSolver();
    solver.add(new Constraint({ type: "motorised-hinge", bodyA: a, bodyB: b, axis: [0, 1, 0], motorSpeed: 10, maxMotorTorque: 100, limits: [-0.1, 0.2] }));
    for (let i = 0; i < 240; i++) step(solver, [a, b]);
    const angle = 2 * Math.atan2(b.rotation[1], b.rotation[3]);
    expect(angle).toBeGreaterThan(0.19);
    expect(angle).toBeLessThanOrEqual(0.201);
    solver.dispose();
  });

  it("applies a damped spring consistently across solver iteration counts", () => {
    const run = (iterations: number) => {
      const a = new RigidBody(1, { type: "static" });
      const b = new RigidBody(2, { position: [1, 0, 0] });
      const solver = new NativeJointSolver();
      solver.add(new Constraint({ type: "spring", bodyA: a, bodyB: b, restLength: 1, stiffness: 0.5, damping: 0.8 }));
      b.setPosition([2, 0, 0]);
      step(solver, [a, b], 1 / 120, iterations);
      const firstSpeed = b.velocity[0];
      for (let i = 0; i < 600; i++) step(solver, [a, b], 1 / 120, iterations);
      const final = b.position[0];
      solver.dispose();
      return { firstSpeed, final };
    };
    const once = run(1);
    const many = run(10);
    expect(once.firstSpeed).toBeLessThan(0);
    expect(many.firstSpeed).toBeCloseTo(once.firstSpeed, 10);
    expect(once.final).toBeCloseTo(1, 3);
    expect(many.final).toBeCloseTo(1, 3);
  });

  it("handles disabled, removed, cleared and disposed joints without hidden effects", () => {
    const a = new RigidBody(1, { type: "static" });
    const b = new RigidBody(2, { velocity: [1, 0, 0] });
    const solver = new NativeJointSolver();
    const joint = new Constraint({ type: "fixed", bodyA: a, bodyB: b });
    solver.add(joint);
    expect(() => solver.add(joint)).toThrow(/already registered/);
    expect(() => solver.solve(1 / 60)).toThrow(/beginStep/);
    expect(() => solver.beginStep(0)).toThrow(/finite and positive/);
    joint.setEnabled(false);
    step(solver, [a, b]);
    expect(b.velocity[0]).toBe(1);
    joint.setEnabled(true);
    solver.remove(joint);
    solver.remove(joint);
    step(solver, [a, b]);
    expect(b.velocity[0]).toBe(1);
    solver.add(joint);
    solver.clear();
    step(solver, [a, b]);
    expect(b.velocity[0]).toBe(1);
    solver.dispose();
    solver.dispose();
    expect(() => solver.beginStep(1 / 60)).toThrow(/disposed/);
  });
});
