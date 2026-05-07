import { describe, expect, it } from "vitest";
import {
  Box3,
  Color,
  Matrix4,
  Plane,
  Quaternion,
  Ray,
  SeededRandom,
  Sphere,
  Vector3,
  inverseLerp
} from "@galileo3d/math";

describe("math edge cases", () => {
  it("keeps empty boxes inert across containment, union, and ray intersection", () => {
    const empty = new Box3();
    const occupied = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));

    expect(empty.isEmpty()).toBe(true);
    expect(empty.containsPoint(Vector3.zero.clone())).toBe(false);
    expect(empty.intersectsBox(occupied)).toBe(false);
    expect(empty.union(occupied)).toBe(occupied);
    expect(new Ray(Vector3.zero.clone(), Vector3.forward).intersectBox(empty)).toBeUndefined();
    expect(empty.getCenter().equals(Vector3.zero.clone())).toBe(true);
    expect(empty.getSize().equals(Vector3.zero.clone())).toBe(true);
  });

  it("returns undefined for geometric misses instead of fabricating intersections", () => {
    const unitBox = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const frontPlane = Plane.fromPointNormal(Vector3.zero.clone(), Vector3.forward);

    expect(new Ray(new Vector3(2, 0, 0), Vector3.forward).intersectBox(unitBox)).toBeUndefined();
    expect(new Ray(new Vector3(0, 0, 2), Vector3.forward.multiplyScalar(-1)).intersectPlane(frontPlane)).toBeUndefined();
    expect(new Ray(new Vector3(0, 0, 5), Vector3.up).intersectSphere(new Sphere(Vector3.zero.clone(), 1))).toBeUndefined();
    expect(frontPlane.intersectLine(new Vector3(0, 0, 1), new Vector3(1, 0, 1))).toBeUndefined();
    expect(frontPlane.intersectLine(new Vector3(0, 0, 1), new Vector3(0, 0, 2))).toBeUndefined();
  });

  it("rejects degenerate inputs for planes, projections, inverses, colors, quaternions, and ranges", () => {
    expect(() => new Plane(Vector3.zero.clone(), 0)).toThrow(/normal/i);
    expect(() => Matrix4.scaling(Vector3.zero.clone()).inverse()).toThrow(/singular/i);
    expect(() => Matrix4.perspective(Math.PI / 2, 1, 0, 10)).toThrow(/perspective/i);
    expect(() => Matrix4.orthographic(-1, 1, 1, 1, 0.1, 10)).toThrow(/orthographic/i);
    expect(() => new Color(Number.NaN, 0, 0)).toThrow(/finite/i);
    expect(() => Quaternion.fromAxisAngle(Vector3.zero.clone(), Math.PI)).toThrow(/axis/i);
    expect(() => inverseLerp(1, 1, 1)).toThrow(/distinct/i);
    expect(() => new SeededRandom(1.5)).toThrow(/integer/i);
    expect(() => new SeededRandom(1).range(2, 1)).toThrow(/min/i);
  });

  it("clones deterministic random state and keeps quaternion edge rotations normalized", () => {
    const random = new SeededRandom(42);
    random.nextUint32();
    const clone = random.clone();
    expect([random.nextUint32(), random.nextUint32()]).toEqual([clone.nextUint32(), clone.nextUint32()]);

    const identityFromZero = new Quaternion(0, 0, 0, 0).normalize();
    expect(identityFromZero.equals(Quaternion.identity)).toBe(true);

    const start = Quaternion.fromAxisAngle(Vector3.up, 0);
    const equivalentTarget = new Quaternion(-start.x, -start.y, -start.z, -start.w);
    expect(start.slerp(equivalentTarget, 0.5).equals(start)).toBe(true);
  });
});
