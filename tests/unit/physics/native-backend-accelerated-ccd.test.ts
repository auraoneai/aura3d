import { describe, expect, it } from "vitest";
import { Collider } from "../../../packages/physics/src/Collider.js";
import { RigidBody, type Quat } from "../../../packages/physics/src/RigidBody.js";
import { Shape, type PhysicsShape, type Vec3 } from "../../../packages/physics/src/Shape.js";
import { nativeCastAcceleratedPair, type NativeAcceleratedCCDMotion } from "../../../packages/physics/src/native/NativeAcceleratedCCD.js";

function motion(id: number, shape: PhysicsShape, position: Vec3, velocity: Vec3 = [0, 0, 0], acceleration: Vec3 = [0, 0, 0], rotation: Quat = [0, 0, 0, 1]): NativeAcceleratedCCDMotion {
  const body = new RigidBody(id, { position, rotation });
  return { body, collider: new Collider(id, id, { shape }), velocity, acceleration, angularVelocity: [0, 0, 0], angularAcceleration: [0, 0, 0] };
}

function contact(a: NativeAcceleratedCCDMotion, b: NativeAcceleratedCCDMotion, duration: number) {
  const result = nativeCastAcceleratedPair(a, b, duration);
  expect(result.kind).toBe("contact");
  if (result.kind !== "contact") throw new Error("Expected accelerated CCD contact.");
  return result;
}

function near(actual: Vec3, expected: Vec3, digits = 8): void {
  for (let axis = 0; axis < 3; axis++) expect(actual[axis]).toBeCloseTo(expected[axis]!, digits);
}

describe("isolated constant-acceleration CCD", () => {
  it("finds sphere-plane impact under two independent accelerations", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 2, 0], [0, 0, 0], [0, -1.5, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0], [0, 0, 0], [0, 0.5, 0]);
    const result = contact(sphere, plane, 2);
    const time = Math.sqrt(1.5), fraction = time / 2;
    expect(result.fraction).toBeCloseTo(fraction, 12);
    expect(result.entryBounds[0]).toBeLessThanOrEqual(fraction);
    expect(result.entryBounds[1]).toBeGreaterThanOrEqual(fraction);
    expect(result.motion).toBe("entering");
    expect(result.exitFraction).toBeUndefined();
    near(result.normal, [0, -1, 0]);
    near(result.point, [0, time * time * 0.25, 0]);
    const swapped = contact(plane, sphere, 2);
    expect(swapped.fraction).toBeCloseTo(result.fraction, 12);
    near(swapped.normal, [0, 1, 0]);
    near(swapped.point, result.point);
    expect(sphere.body.position).toEqual([0, 2, 0]);
    expect(plane.body.position).toEqual([0, 0, 0]);
  });

  it("reports both sensor boundaries for a parabola through a plane", () => {
    const sphere = motion(1, Shape.sphere(0.25), [1, 1, 0], [2, -4, 0], [0, 8, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const result = contact(sphere, plane, 1);
    expect(result.intervals).toHaveLength(1);
    expect(result.fraction).toBeCloseTo(0.25, 12);
    expect(result.exitFraction).toBeCloseTo(0.75, 12);
    near(result.point, [1.5, 0, 0]);
    near(result.exitNormal!, [0, -1, 0]);
    near(result.exitPoint!, [2.5, 0, 0]);
    expect(result.exitBounds![0]).toBeLessThanOrEqual(0.75);
    expect(result.exitBounds![1]).toBeGreaterThanOrEqual(0.75);
  });

  it("returns two disjoint intervals when a sphere exits and returns into a halfspace", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 0.34, 0], [0, 1, 0], [0, -2, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const result = contact(sphere, plane, 1);
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0]!.initial).toBe("penetrating");
    expect(result.intervals[0]!.fraction).toBe(0);
    expect(result.intervals[0]!.exitFraction).toBeCloseTo(0.2, 10);
    expect(result.intervals[0]!.motion).toBe("separating");
    expect(result.intervals[1]!.fraction).toBeCloseTo(0.8, 10);
    expect(result.intervals[1]!.exitFraction).toBeUndefined();
    expect(result.intervals[1]!.motion).toBe("entering");
    near(result.intervals[0]!.exitPoint!, [0, 0, 0]);
    near(result.intervals[1]!.point, [0, 0, 0]);
  });

  it("isolates four sphere-sphere roots and preserves each entry and exit witness", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [-3, 0, 0], [16, 0, 0], [-16, 0, 0]);
    const result = contact(a, b, 2), windows = result.intervals;
    expect(windows).toHaveLength(2);
    const expected = [(1 - Math.sqrt(3) / 2) / 2, (1 - Math.SQRT1_2) / 2,
      (1 + Math.SQRT1_2) / 2, (1 + Math.sqrt(3) / 2) / 2];
    expect(windows[0]!.fraction).toBeCloseTo(expected[0]!, 12);
    expect(windows[0]!.exitFraction).toBeCloseTo(expected[1]!, 12);
    expect(windows[1]!.fraction).toBeCloseTo(expected[2]!, 12);
    expect(windows[1]!.exitFraction).toBeCloseTo(expected[3]!, 12);
    near(windows[0]!.normal, [-1, 0, 0]);
    near(windows[0]!.point, [-0.5, 0, 0]);
    near(windows[0]!.exitNormal!, [1, 0, 0]);
    near(windows[0]!.exitPoint!, [0.5, 0, 0]);
    near(windows[1]!.normal, [1, 0, 0]);
    near(windows[1]!.exitNormal!, [-1, 0, 0]);
  });

  it("tracks sphere witnesses when both bodies have arbitrary common and relative motion", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0], [1, 2, 0], [2, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [-3, 0, 0], [17, 2, 0], [-14, 0, 0]);
    const result = contact(a, b, 2), firstTime = 1 - Math.sqrt(3) / 2;
    near(result.point, [firstTime + firstTime ** 2 - 0.5, 2 * firstTime, 0]);
    const swapped = contact(b, a, 2);
    expect(swapped.fraction).toBeCloseTo(result.fraction, 12);
    near(swapped.normal, [1, 0, 0]);
    near(swapped.point, result.point);
    expect(a.body.position).toEqual([0, 0, 0]);
    expect(b.body.position).toEqual([-3, 0, 0]);
  });

  it("isolates three-dimensional accelerated sphere roots rather than using endpoints", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [-3, 0.6, 0], [8, 0, 0], [-8, 0, 0]);
    const result = contact(a, b, 2);
    expect(result.intervals).toHaveLength(2);
    expect(result.intervals[0]!.fraction).toBeCloseTo((1 - Math.sqrt(0.45)) / 2, 11);
    expect(result.intervals[0]!.exitFraction).toBeCloseTo((1 - Math.sqrt(0.05)) / 2, 11);
    near(result.intervals[0]!.normal, [-0.8, 0.6, 0]);
    near(result.intervals[0]!.exitNormal!, [0.8, 0.6, 0]);
  });

  it("certifies exactly representable sphere and plane grazes", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [-2, 1, 0], [4, 0, 0]);
    const sphereGraze = contact(a, b, 1);
    expect(sphereGraze.fraction).toBe(0.5);
    expect(sphereGraze.exitFraction).toBe(0.5);
    expect(sphereGraze.motion).toBe("tangent");
    near(sphereGraze.normal, [0, 1, 0]);
    near(sphereGraze.exitPoint!, [0, 0.5, 0]);
    const sphere = motion(3, Shape.sphere(0.5), [0, 0.75, 0], [0, -1, 0], [0, 2, 0]);
    const plane = motion(4, Shape.plane(), [0, 0, 0]);
    const planeGraze = contact(sphere, plane, 1);
    expect(planeGraze.fraction).toBe(0.5);
    expect(planeGraze.exitFraction).toBe(0.5);
    expect(planeGraze.motion).toBe("tangent");
    near(planeGraze.exitNormal!, [0, -1, 0]);
  });

  it("distinguishes near-tangent misses from two real roots", () => {
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const miss = motion(1, Shape.sphere(0.5), [0, 0.750001, 0], [0, -1, 0], [0, 2, 0]);
    expect(nativeCastAcceleratedPair(miss, plane, 1)).toEqual({ kind: "separated" });
    const crossing = motion(1, Shape.sphere(0.5), [0, 0.749999, 0], [0, -1, 0], [0, 2, 0]);
    const result = contact(crossing, plane, 1);
    expect(result.fraction).toBeCloseTo(0.499, 8);
    expect(result.exitFraction).toBeCloseTo(0.501, 8);
  });

  it("isolates a family of independently chosen exact plane roots", () => {
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    for (const [enter, exit] of [[1 / 16, 15 / 16], [1 / 8, 1 / 2], [1 / 4, 3 / 4], [3 / 8, 7 / 8]] as const) {
      // Signed gap = (t-enter)(t-exit), so both boundaries are known exactly.
      const sphere = motion(1, Shape.sphere(0.5), [0, 0.5 + enter * exit, 0], [0, -enter - exit, 0], [0, 2, 0]);
      const result = contact(sphere, plane, 1);
      expect(result.fraction).toBe(enter);
      expect(result.exitFraction).toBe(exit);
      expect(result.entryBounds[0]).toBeLessThanOrEqual(enter);
      expect(result.entryBounds[1]).toBeGreaterThanOrEqual(enter);
      near(result.exitPoint!, [0, 0, 0]);
    }
  });

  it("certifies non-dyadic double roots using exact polynomial common factors", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 1.5, 0], [0, -6, 0], [0, 18, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const planeResult = contact(sphere, plane, 1);
    expect(planeResult.fraction).toBeCloseTo(1 / 3, 15);
    expect(planeResult.exitFraction).toBe(planeResult.fraction);
    expect(planeResult.motion).toBe("tangent");
    near(planeResult.exitPoint!, [0, 0, 0]);
    const a = motion(3, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(4, Shape.sphere(0.5), [2, 0, 0], [-6, 0, 0], [18, 0, 0]);
    const sphereResult = contact(a, b, 1);
    expect(sphereResult.fraction).toBeCloseTo(1 / 3, 15);
    expect(sphereResult.exitFraction).toBe(sphereResult.fraction);
    expect(sphereResult.motion).toBe("tangent");
    near(sphereResult.exitPoint!, [0.5, 0, 0]);
  });

  it("certifies an irrational quartic grazing time", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [-0.5, 1, 0], [0, 0, 0], [2, 0, 0]);
    // Squared separation minus radius squared is (t^2 - 1/2)^2.
    const result = contact(a, b, 1), expected = Math.SQRT1_2;
    expect(result.fraction).toBeCloseTo(expected, 15);
    expect(result.exitFraction).toBe(result.fraction);
    expect(result.entryBounds[0]).toBeLessThanOrEqual(expected);
    expect(result.entryBounds[1]).toBeGreaterThanOrEqual(expected);
    expect(result.motion).toBe("tangent");
    near(result.normal, [0, 1, 0]);
    near(result.exitPoint!, [0, 0.5, 0]);
  });

  it("rejects contact roots that cannot be separated by the certified time grid", () => {
    // gap = (t - 0.5)^2 - 2^-140: the two exact roots are 2^-70 apart from the minimum.
    const sphere = motion(1, Shape.sphere(2 ** -140), [0, 0.25, 0], [0, -1, 0], [0, 2, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    expect(() => nativeCastAcceleratedPair(sphere, plane, 1)).toThrow(/roots cannot be separated/);
  });

  it("reports zero-speed inward acceleration as entering", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 0.5, 0], [0, 0, 0], [0, -2, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const result = contact(sphere, plane, 1);
    expect(result.initial).toBe("touching");
    expect(result.fraction).toBe(0);
    expect(result.motion).toBe("entering");
    expect(result.exitFraction).toBeUndefined();
    expect(contact(sphere, plane, 0).motion).toBe("entering");
  });

  it("classifies a zero-duration touching query using instantaneous velocity", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 0.5, 0], [0, -1, 0]);
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const result = contact(sphere, plane, 0);
    expect(result.fraction).toBe(0);
    expect(result.motion).toBe("entering");
    expect(result.exitFraction).toBeUndefined();
  });

  it("classifies an initial sphere graze as tangential at zero and nonzero duration", () => {
    const a = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [1, 0, 0], [0, 1, 0]);
    const result = contact(a, b, 1);
    expect(result.fraction).toBe(0);
    expect(result.exitFraction).toBe(0);
    expect(result.motion).toBe("tangent");
    expect(contact(a, b, 0).motion).toBe("tangent");
    near(result.exitPoint!, [0.5, 0, 0]);
  });

  it("distinguishes entry, exit and grazing at the end of the interval", () => {
    const plane = motion(2, Shape.plane(), [0, 0, 0]);
    const entering = contact(motion(1, Shape.sphere(0.5), [0, 1.5, 0], [0, -1, 0]), plane, 1);
    expect(entering.fraction).toBe(1);
    expect(entering.exitFraction).toBeUndefined();
    expect(entering.motion).toBe("entering");
    const leaving = contact(motion(1, Shape.sphere(0.5), [0, 0, 0], [0, 0.5, 0]), plane, 1);
    expect(leaving.initial).toBe("penetrating");
    expect(leaving.exitFraction).toBe(1);
    near(leaving.exitPoint!, [0, 0, 0]);
    const graze = contact(motion(1, Shape.sphere(0.5), [0, 1.5, 0], [0, -2, 0], [0, 2, 0]), plane, 1);
    expect(graze.fraction).toBe(1);
    expect(graze.exitFraction).toBe(1);
    expect(graze.motion).toBe("tangent");
    const stillInside = contact(motion(1, Shape.sphere(0.5), [0, -0.5, 0], [0, 2, 0], [0, -2, 0]), plane, 1);
    expect(stillInside.initial).toBe("penetrating");
    expect(stillInside.exitFraction).toBeUndefined();
  });

  it("handles a fixed rotated plane and either collider order", () => {
    const rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2] as const;
    const plane = motion(1, Shape.plane(), [0, 0, 0], [0, 0, 0], [0, 0, 0], rotation);
    const sphere = motion(2, Shape.sphere(0.5), [-2, 0, 0], [2, 0, 0]);
    const result = contact(plane, sphere, 1);
    expect(result.fraction).toBeCloseTo(0.75, 10);
    near(result.normal, [-1, 0, 0]);
    near(result.point, [0, 0, 0]);
    near(contact(sphere, plane, 1).normal, [1, 0, 0]);
  });

  it("rejects unsupported shapes, angular motion, overflow and coincident witnesses", () => {
    const sphere = motion(1, Shape.sphere(0.5), [0, 0, 0]);
    const other = motion(2, Shape.sphere(0.5), [3, 0, 0]);
    const box = motion(2, Shape.box(0.5, 0.5, 0.5), [3, 0, 0]);
    expect(() => nativeCastAcceleratedPair(sphere, box, 1)).toThrow(/does not support/);
    expect(() => nativeCastAcceleratedPair({ ...sphere, angularVelocity: [0, 0.1, 0] }, other, 1)).toThrow(/angular motion/);
    expect(() => nativeCastAcceleratedPair({ ...sphere, angularAcceleration: [0, 0, 0.1] }, other, 1)).toThrow(/angular motion/);
    expect(() => nativeCastAcceleratedPair(sphere, other, 1e200)).toThrow(/numeric range/);
    expect(() => nativeCastAcceleratedPair({ ...sphere, acceleration: [1, 0, 0] }, other, 1e-200)).toThrow(/underflows/);
    expect(() => nativeCastAcceleratedPair(sphere, other, -1)).toThrow(/duration/);
    expect(() => nativeCastAcceleratedPair(sphere, motion(2, Shape.sphere(0.5), [0, 0, 0]), 1)).toThrow(/coincident/);
    expect(sphere.body.position).toEqual([0, 0, 0]);
    expect(other.body.position).toEqual([3, 0, 0]);
  });

  it("rejects a world witness whose coordinates cannot represent the contact", () => {
    const a = motion(1, Shape.sphere(0.5), [1e16, 0, 0]);
    const b = motion(2, Shape.sphere(0.5), [1e16 + 2, 0, 0], [-1, 0, 0]);
    expect(() => nativeCastAcceleratedPair(a, b, 2)).toThrow(/numeric precision/);
  });
});
