import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../../packages/physics/src/PhysicsWorld.js";
import { RigidBody } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeApplyImpulseAtPoint, nativeCenterOfMass, nativeInertia, nativeInverseInertia, nativeMassProperties, setNativeMassProperties } from "../../../packages/physics/src/native/NativeMassProperties.js";
import { NativePhysicsWorld } from "../../../packages/physics/src/native/NativePhysicsWorld.js";

const tetrahedron = Shape.convexHull([
  [1, 2, 3], [3, 2, 3], [1, 5, 3], [1, 2, 7], [1.2, 2.2, 3.2]
], [0, 1, 2]);

function observedAngularVelocity(shapes: readonly PhysicsShape[], torque: Vec3, inertia?: Vec3, sensor = false): Vec3 {
  const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
  try {
    const body = world.createRigidBody({ mass: 2, ...(inertia ? { inertia } : {}) });
    for (const shape of shapes) world.createCollider(body, { shape, sensor });
    body.applyTorque(torque);
    world.step(1 / 60);
    return [...body.angularVelocity];
  } finally { world.dispose(); }
}

describe("isolated native mass properties", () => {
  it("derives analytical moments for centered primitives and capsule hemispheres", () => {
    const sphere = nativeMassProperties(2, [Shape.sphere(0.25)]);
    expect(sphere.inertia[0][0]).toBeCloseTo(0.05, 12);
    const box = nativeMassProperties(2, [Shape.box(0.5, 1, 2)]);
    expect(box.inertia[0][0]).toBeCloseTo(2 * (1 + 4) / 3, 12);
    expect(box.inertia[1][1]).toBeCloseTo(2 * (0.25 + 4) / 3, 12);
    expect(box.inertia[2][2]).toBeCloseTo(2 * (0.25 + 1) / 3, 12);
    const capsule = nativeMassProperties(3, [Shape.capsule(1, 1)]);
    // Cylinder mass = 1.8 and two hemispheres together = 1.2.
    expect(capsule.inertia[0][0]).toBeCloseTo(1.8 * (1 / 4 + 1 / 3) + 1.2 * (2 / 5 + 3 / 4 + 1), 12);
    expect(capsule.inertia[1][1]).toBeCloseTo(1.8 / 2 + 1.2 * 2 / 5, 12);
  });

  it("integrates an uncentered tetrahedral hull using all vertices rather than debug triangles", () => {
    const properties = nativeMassProperties(2, [tetrahedron]);
    expect(properties.volume).toBeCloseTo(4, 10);
    expect(properties.center[0]).toBeCloseTo(1.5, 10);
    expect(properties.center[1]).toBeCloseTo(2.75, 10);
    expect(properties.center[2]).toBeCloseTo(4, 10);
    // For a tetrahedron, Cov(x,y) = -a*b/80; inertia xy is -m*Cov(x,y).
    expect(properties.inertia[0][1]).toBeCloseTo(2 * 2 * 3 / 80, 10);
    expect(properties.inertia[0][2]).toBeCloseTo(2 * 2 * 4 / 80, 10);
    expect(properties.inertia[1][2]).toBeCloseTo(2 * 3 * 4 / 80, 10);
  });

  it("ignores interior and face-interior vertices when integrating a convex cube", () => {
    const points: Vec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([x, y, z]);
    points.push([0, 0, 0], [1, 0, 0], [1, 0.5, -0.5]);
    const cube = Shape.convexHull(points, [0, 1, 2]);
    const properties = nativeMassProperties(3, [cube]);
    expect(properties.volume).toBeCloseTo(8, 10);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(properties.center[axis]).toBeCloseTo(0, 10);
      expect(properties.inertia[axis]![axis]).toBeCloseTo(2, 10);
    }
    expect(properties.inertia[0][1]).toBeCloseTo(0, 10);
    expect(properties.inertia[0][2]).toBeCloseTo(0, 10);
    expect(properties.inertia[1][2]).toBeCloseTo(0, 10);
  });

  it("recovers a rotated, translated box tensor from its convex hull", () => {
    const points: Vec3[] = [];
    for (const x of [-1, 1]) for (const y of [-2, 2]) for (const z of [-3, 3]) {
      points.push([5 + (x - y) * Math.SQRT1_2, -4 + (x + y) * Math.SQRT1_2, 2 + z]);
    }
    const properties = nativeMassProperties(12, [Shape.convexHull(points, [0, 1, 2])]);
    expect(properties.volume).toBeCloseTo(48, 8);
    for (let axis = 0; axis < 3; axis += 1) expect(properties.center[axis]).toBeCloseTo([5, -4, 2][axis]!, 9);
    expect(properties.inertia[0][0]).toBeCloseTo(46, 8);
    expect(properties.inertia[1][1]).toBeCloseTo(46, 8);
    expect(properties.inertia[2][2]).toBeCloseTo(20, 8);
    expect(properties.inertia[0][1]).toBeCloseTo(6, 8);
    expect(properties.inertia[0][2]).toBeCloseTo(0, 8);
    expect(properties.inertia[1][2]).toBeCloseTo(0, 8);
  });

  it("derives mass from more than 64 convex vertices and matches current angular response", () => {
    const points: Vec3[] = [];
    for (let index = 0; index < 128; index += 1) {
      const y = 1 - 2 * (index + 0.5) / 128;
      const r = Math.sqrt(1 - y * y), angle = index * Math.PI * (3 - Math.sqrt(5));
      points.push([1 + 1.2 * r * Math.cos(angle), -0.5 + 0.8 * y, 2 + 1.5 * r * Math.sin(angle)]);
    }
    const shape = Shape.convexHull(points, [0, 1, 2]);
    const properties = nativeMassProperties(2, [shape]);
    expect(properties.volume).toBeGreaterThan(5);
    const reversed = nativeMassProperties(2, [Shape.convexHull([...points].reverse(), [0, 1, 2])]);
    expect(reversed.volume).toBeCloseTo(properties.volume, 8);
    for (let row = 0; row < 3; row += 1) {
      expect(reversed.center[row]).toBeCloseTo(properties.center[row]!, 8);
      for (let column = 0; column < 3; column += 1) expect(reversed.inertia[row]![column]).toBeCloseTo(properties.inertia[row]![column]!, 8);
    }
    for (let axis = 0; axis < 3; axis += 1) {
      const torque: [number, number, number] = [0, 0, 0];
      torque[axis] = 1;
      const observed = observedAngularVelocity([shape], torque);
      for (let row = 0; row < 3; row += 1) expect(observed[row]).toBeCloseTo(properties.inverseInertia[row]![axis]! / 60, 5);
    }
  });

  it("rejects an unresolved small convex feature instead of silently omitting it", () => {
    const points: Vec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) points.push([x, y, z]);
    points.push([1 + 5e-12, 0, 0]);
    expect(() => nativeMassProperties(2, [Shape.convexHull(points, [0, 1, 2])])).toThrow(/cannot certify/);
  });

  it("honors explicit inertia and represents the backend's no-collider rotation lock", () => {
    const empty = nativeMassProperties(2, []);
    expect(empty.inverseInertia).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
    expect(observedAngularVelocity([], [0, 0, 1])).toEqual([0, 0, 0]);
    const explicit = nativeMassProperties(2, [Shape.sphere(5)], [2, 4, 8]);
    expect(explicit.inverseInertia).toEqual([[0.5, 0, 0], [0, 0.25, 0], [0, 0, 0.125]]);
    expect(observedAngularVelocity([Shape.sphere(5)], [0, 0, 1], [2, 4, 8])[2]).toBeCloseTo(1 / (60 * 8), 8);
  });

  it("matches the backend after its last mass-bearing collider is removed", () => {
    const world = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const body = world.createRigidBody({ mass: 2 });
    const collider = world.createCollider(body, { shape: Shape.sphere(0.25) });
    body.applyTorque([0, 0, 1]);
    world.step(1 / 60);
    expect(body.angularVelocity[2]).toBeGreaterThan(0.3);
    world.removeCollider(collider.id);
    body.setAngularVelocity([0, 0, 0]);
    body.applyTorque([0, 0, 1]);
    world.step(1 / 60);
    expect(body.angularVelocity).toEqual([0, 0, 0]);
    world.dispose();
  });

  it("compares torque-free anisotropic rotation with the current backend", () => {
    const rapier = new PhysicsWorld({ gravity: [0, 0, 0], enableSleeping: false });
    const native = new NativePhysicsWorld({ gravity: [0, 0, 0] });
    const descriptor = { mass: 1, inertia: [1, 2, 4] as const, angularVelocity: [1, 2, 3] as const };
    const observed = rapier.createRigidBody(descriptor);
    const candidate = native.createRigidBody(descriptor);
    const initialMomentum = nativeInertia(candidate, candidate.angularVelocity);
    for (let i = 0; i < 60; i += 1) { rapier.step(1 / 60); native.step(1 / 60); }
    for (let i = 0; i < 3; i += 1) expect(Math.abs(candidate.angularVelocity[i]! - observed.angularVelocity[i]!)).toBeLessThan(0.05);
    const finalMomentum = nativeInertia(candidate, candidate.angularVelocity);
    expect(Math.hypot(...finalMomentum.map((value, i) => value - initialMomentum[i]!))).toBeLessThan(0.12);
    rapier.dispose(); native.dispose();
  });

  it("compares free-fall displacement and velocity with the current backend", () => {
    const rapier = new PhysicsWorld({ gravity: [0, -9.81, 0], enableSleeping: false });
    const native = new NativePhysicsWorld({ gravity: [0, -9.81, 0] });
    const observed = rapier.createRigidBody({ position: [0, 5, 0] });
    const candidate = native.createRigidBody({ position: [0, 5, 0] });
    for (let i = 0; i < 60; i += 1) { rapier.step(1 / 60); native.step(1 / 60); }
    expect(candidate.velocity[1]).toBeCloseTo(observed.velocity[1], 3);
    expect(candidate.position[1]).toBeCloseTo(observed.position[1], 3);
    rapier.dispose(); native.dispose();
  });

  it.each([
    ["small sphere", [Shape.sphere(0.25)]],
    ["large sphere", [Shape.sphere(2)]],
    ["asymmetric box", [Shape.box(0.5, 1, 2)]],
    ["capsule", [Shape.capsule(0.4, 1.2)]],
    ["compound", [Shape.sphere(0.25), Shape.box(0.5, 1, 2)]],
    ["uncentered hull", [tetrahedron]],
    ["off-center compound", [Shape.sphere(0.5), tetrahedron]]
  ] as Array<[string, PhysicsShape[]]>)("matches current backend torque response for %s", (_name, shapes) => {
    const properties = nativeMassProperties(2, shapes);
    for (let axis = 0; axis < 3; axis += 1) {
      const torque: [number, number, number] = [0, 0, 0];
      torque[axis] = 1;
      const observed = observedAngularVelocity(shapes, torque);
      for (let row = 0; row < 3; row += 1) expect(observed[row]).toBeCloseTo(properties.inverseInertia[row]![axis]! / 60, 5);
    }
  });

  it("counts sensor shapes and remains independent of collider order", () => {
    const shapes = [Shape.sphere(0.25), Shape.sphere(2)];
    const properties = nativeMassProperties(2, shapes);
    expect(nativeMassProperties(2, [...shapes].reverse())).toEqual(properties);
    const observed = observedAngularVelocity(shapes, [0, 0, 1], undefined, true);
    expect(observed[2]).toBeCloseTo(properties.inverseInertia[2][2] / 60, 7);
  });

  it("applies impulses about the rotated mass center using the full tensor", () => {
    const body = new RigidBody(1, { mass: 2, position: [10, -2, 1], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    setNativeMassProperties(body, nativeMassProperties(2, [tetrahedron]));
    const center = nativeCenterOfMass(body);
    expect(center[0]).toBeCloseTo(7.25, 10);
    expect(center[1]).toBeCloseTo(-0.5, 10);
    expect(center[2]).toBeCloseTo(5, 10);
    nativeApplyImpulseAtPoint(body, [2, 0, 0], center);
    expect(body.velocity).toEqual([1, 0, 0]);
    expect(body.angularVelocity.every((value) => Math.abs(value) < 1e-10)).toBe(true);
    const expected = nativeInverseInertia(body, [0, 0, -2]);
    nativeApplyImpulseAtPoint(body, [2, 0, 0], [center[0], center[1] + 1, center[2]]);
    for (let i = 0; i < 3; i += 1) expect(body.angularVelocity[i]).toBeCloseTo(expected[i]!, 9);
  });

  it("rejects non-finite or unsupported mass properties explicitly", () => {
    expect(() => nativeMassProperties(0, [])).toThrow(/mass/i);
    expect(() => nativeMassProperties(1, [Shape.plane()])).toThrow(/do not support/);
    expect(() => nativeMassProperties(1, [], [1, 0, 1])).toThrow(/inertia/i);
  });
});
