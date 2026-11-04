import { describe, expect, it } from "vitest";
import { Ray } from "../../../packages/math/src/independent/mutable/Ray.js";
import { Frustum } from "../../../packages/math/src/independent/mutable/Frustum.js";
import { Triangle } from "../../../packages/math/src/independent/mutable/Triangle.js";
import { Vector2 } from "../../../packages/math/src/independent/mutable/Vector2.js";
import { Vector3 } from "../../../packages/math/src/independent/mutable/Vector3.js";
import { Vector4 } from "../../../packages/math/src/independent/mutable/Vector4.js";
import { Plane } from "../../../packages/math/src/independent/mutable/Plane.js";
import { Sphere } from "../../../packages/math/src/independent/mutable/Sphere.js";
import { Frustum as ImmutableFrustum } from "../../../packages/math/src/Frustum.js";
import { Vector3 as ImmutableVector3 } from "../../../packages/math/src/Vector3.js";

const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const expectVector = (actual: { x: number; y: number; z: number }, expected: readonly [number, number, number]): void => {
  expect(actual.x).toBeCloseTo(expected[0], 12);
  expect(actual.y).toBeCloseTo(expected[1], 12);
  expect(actual.z).toBeCloseTo(expected[2], 12);
};
const identity = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
const world = (x = 0, y = 0, z = 0, scale = 1) => ({
  elements: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, x, y, z, 1],
  getMaxScaleOnAxis: () => scale,
});

describe("independent mutable ray geometry", () => {
  it("handles unnormalized and zero direction for closest points and copying", () => {
    const ray = new Ray(v(1, 2, 3), v(2, 0, 0));
    const target = v(9, 9, 9);
    expect(ray.at(2, target)).toBe(target);
    expectVector(target, [5, 2, 3]);
    expectVector(ray.closestPointToPoint(v(4, 5, 3), target), [4, 2, 3]);
    expect(ray.distanceSqToPoint(v(4, 5, 3))).toBe(9);
    expectVector(ray.closestPointToPoint(v(-5, 2, 3), target), [1, 2, 3]);
    const saved = ray.clone();
    expect(saved).not.toBe(ray);
    ray.set(ray.direction, ray.origin);
    expectVector(ray.origin, [2, 0, 0]);
    expectVector(ray.direction, [1, 2, 3]);
    expect(saved.equals(ray)).toBe(false);
    saved.direction.set(0, 0, 0);
    expect(saved.distanceSqToPoint(v(2, 4, 5))).toBe(9);
    expectVector(saved.closestPointToPoint(v(2, 4, 5), target), [1, 2, 3]);
  });

  it("updates the ray and copies immutable representations without sharing vectors", () => {
    const ray = new Ray(v(1, 2, 3), v(1, 0, 0));
    ray.lookAt(v(1, 5, 3)).recast(2);
    expectVector(ray.origin, [1, 4, 3]);
    ray.applyMatrix4({ elements: [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 10, 20, 30, 1] });
    expectVector(ray.origin, [12, 32, 42]);
    expectVector(ray.direction, [0, 1, 0]);
    const immutable = ray.toImmutable();
    ray.origin.x = 99;
    expectVector(immutable.origin, [12, 32, 42]);
    expectVector(new Ray().fromImmutable(immutable).origin, [12, 32, 42]);
    const scaled = new Ray(v(0, 0, 0), v(2, 0, 0)).toImmutable();
    expectVector(scaled.direction, [1, 0, 0]);
    expect(() => new Ray(v(0, 0, 0), v(0, 0, 0)).toImmutable()).toThrow(RangeError);
  });

  it("minimizes distance over the half-line and finite segment, including degeneracies", () => {
    const ray = new Ray(v(0, 0, 0), v(2, 0, 0));
    const onRay = v(9, 9, 9), onSegment = v(9, 9, 9);
    expect(ray.distanceSqToSegment(v(3, -1, 2), v(3, 1, 2), onRay, onSegment)).toBeCloseTo(4);
    expectVector(onRay, [3, 0, 0]);
    expectVector(onSegment, [3, 0, 2]);
    expect(ray.distanceSqToSegment(v(-2, 1, 0), v(-2, 3, 0), onRay, onSegment)).toBeCloseTo(5);
    expectVector(onRay, [0, 0, 0]);
    expectVector(onSegment, [-2, 1, 0]);
    expect(ray.distanceSqToSegment(v(3, 2, 0), v(7, 2, 0), onRay, onSegment)).toBeCloseTo(4);
    expect(ray.distanceSqToSegment(v(3, 4, 0), v(3, 4, 0), onRay, onSegment)).toBeCloseTo(16);
    const stationary = new Ray(v(1, 1, 0), v(0, 0, 0));
    expect(stationary.distanceSqToSegment(v(0, 0, 0), v(2, 0, 0), onRay, onSegment)).toBeCloseTo(1);
    expectVector(onRay, [1, 1, 0]);
    expectVector(onSegment, [1, 0, 0]);
    // unified 4.x contract: a segment whose axis rounds to exactly parallel with the ray takes the parallel branch,
    // which reports the segment end lying farthest along the ray (here (3, -1e-8, 0), 1e-8 off the ray), not the
    // crossing.
    expect(ray.distanceSqToSegment(v(1, 1e-8, 0), v(3, -1e-8, 0), onRay, onSegment)).toBeCloseTo(1e-16, 20);
    expectVector(onRay, [3, 0, 0]);
    expectVector(onSegment, [3, -1e-8, 0]);
  });

  it("finds sphere tangencies and exits, preserving targets on misses", () => {
    const ray = new Ray(v(0, 0, 0), v(2, 0, 0)), target = v(7, 8, 9);
    const tangent = { center: v(4, 1, 0), radius: 1 };
    expect(ray.intersectsSphere(tangent)).toBe(true);
    expect(ray.intersectSphere(tangent, target)).toBe(target);
    expectVector(target, [4, 0, 0]);
    expectVector(ray.intersectSphere({ center: v(0, 0, 0), radius: 3 }, target)!, [3, 0, 0]);
    target.set(7, 8, 9);
    expect(ray.intersectSphere({ center: v(-4, 0, 0), radius: 1 }, target)).toBeNull();
    expectVector(target, [7, 8, 9]);
    expect(ray.intersectsSphere({ center: v(0, 0, 0), radius: -1 })).toBe(false);
    ray.direction.set(0, 0, 0);
    expectVector(ray.intersectSphere({ center: v(0, 0, 0), radius: 1 }, target)!, [0, 0, 0]);
    expect(ray.intersectSphere({ center: v(4, 0, 0), radius: 1 }, target)).toBeNull();
  });

  it("handles coplanar and parallel planes, slab boundaries, and miss preservation", () => {
    const ray = new Ray(v(0, 0, 0), v(2, 0, 0)), target = v(7, 8, 9);
    const plane = new Plane(v(1, 0, 0), -4);
    expect(ray.distanceToPlane(plane)).toBe(2);
    expectVector(ray.intersectPlane(plane, target)!, [4, 0, 0]);
    expect(ray.intersectsPlane(new Plane(v(0, 1, 0), 0))).toBe(true);
    expect(ray.distanceToPlane(new Plane(v(0, 1, 0), -1))).toBeNull();
    target.set(7, 8, 9);
    expect(ray.intersectPlane(new Plane(v(1, 0, 0), 1), target)).toBeNull();
    expectVector(target, [7, 8, 9]);
    const box = { min: v(1, -1, -1), max: v(3, 1, 1) };
    expectVector(ray.intersectBox(box, target)!, [1, 0, 0]);
    ray.origin.set(2, 0, 0);
    expectVector(ray.intersectBox(box, target)!, [3, 0, 0]);
    ray.direction.set(-0, 0, 0);
    expectVector(ray.intersectBox(box, target)!, [2, 0, 0]);
    ray.origin.y = 2;
    target.set(7, 8, 9);
    expect(ray.intersectBox(box, target)).toBeNull();
    expectVector(target, [7, 8, 9]);
    expect(ray.intersectsBox({ min: v(1, 1, 1), max: v(-1, -1, -1) })).toBe(false);
  });

  it("intersects equivalent finite plane equations across extreme coefficient scales", () => {
    const target = v(7, 8, 9);
    for (const magnitude of [Number.MIN_VALUE, 1e-308, 1e-150, 1, 1e150, 1e308]) {
      for (const sign of [-1, 1]) {
        const coefficient = sign * magnitude;
        const plane = new Plane(v(coefficient, 0, 0), -coefficient);
        const ray = new Ray(v(2, 0, 0), v(-2, 0, 0));
        expect(ray.distanceToPlane(plane)).toBeCloseTo(0.5, 12);
        expect(ray.intersectPlane(plane, target)).toBe(target);
        expectVector(target, [1, 0, 0]);
        expect(ray.intersectsPlane(plane)).toBe(true);
        target.set(7, 8, 9);
        expect(new Ray(v(2, 0, 0), v(1, 0, 0)).intersectPlane(plane, target)).toBeNull();
        expectVector(target, [7, 8, 9]);
      }
    }
    const oblique = new Plane(v(1e308, 1e308, 0), -1e308);
    expectVector(new Ray(v(2, -0.5, 0), v(-1, 0, 0)).intersectPlane(oblique, target)!, [1.5, -0.5, 0]);
    expect(new Ray(v(2, -1, 0), v(0, 0, 1)).distanceToPlane(oblique)).toBe(0);
    const distant = new Ray(v(5e307, 0, 0), v(1e308, 0, 0));
    const distantPlane = new Plane(v(1e-308, 0, 0), -1);
    expect(distant.distanceToPlane(distantPlane)).toBeCloseTo(0.5, 12);
    expect(distant.intersectPlane(distantPlane, target)!.x / 1e308).toBeCloseTo(1, 12);
    const tinyOffset = new Ray(v(0, 1e308, 0), v(1, 0, 0));
    const tinyPlane = new Plane(v(1, 0, 0), -Number.MIN_VALUE);
    expect(tinyOffset.distanceToPlane(tinyPlane)).toBe(Number.MIN_VALUE);
    expect(tinyOffset.intersectPlane(tinyPlane, target)!.x).toBe(Number.MIN_VALUE);
    const cancellation = new Ray(v(1e308, 1e308, 1e308), v(-1, 0, 0));
    const cancellationPlane = new Plane(v(1, 1, -1), 0);
    expect(cancellation.distanceToPlane(cancellationPlane)! / 1e308).toBeCloseTo(1, 12);
    expect(cancellation.intersectPlane(cancellationPlane, target)!.x).toBe(0);
    expect(target.y).toBe(1e308);
    expect(target.z).toBe(1e308);
  });

  it("respects winding, edges and forward direction in triangle intersections", () => {
    const a = v(0, 0, 0), b = v(2, 0, 0), c = v(0, 2, 0), target = v(9, 9, 9);
    const front = new Ray(v(1, 1, 2), v(0, 0, -2));
    expectVector(front.intersectTriangle(a, b, c, true, target)!, [1, 1, 0]);
    const back = new Ray(v(0.5, 0.5, -1), v(0, 0, 1));
    target.set(9, 9, 9);
    expect(back.intersectTriangle(a, b, c, true, target)).toBeNull();
    expectVector(target, [9, 9, 9]);
    expectVector(back.intersectTriangle(a, b, c, false, target)!, [0.5, 0.5, 0]);
    expect(new Ray(v(0.5, 0.5, 1), v(0, 0, 1)).intersectTriangle(a, b, c, false, target)).toBeNull();
    expect(front.intersectTriangle(a, b, b, false, target)).toBeNull();
  });

  it("keeps segment minima invariant when ray direction is rescaled", () => {
    const a = v(3, -2, 5), b = v(-4, 6, 1);
    const first = new Ray(v(1, 2, 3), v(2, -1, 3));
    const second = new Ray(v(1, 2, 3), v(20, -10, 30));
    const x = v(0, 0, 0), y = v(0, 0, 0), p = v(0, 0, 0), q = v(0, 0, 0);
    expect(first.distanceSqToSegment(a, b, x, y)).toBeCloseTo(second.distanceSqToSegment(a, b, p, q), 12);
    expectVector(x, [p.x, p.y, p.z]);
    expectVector(y, [q.x, q.y, q.z]);
  });

  it("keeps distant sphere hits and intersections stable for extreme direction magnitudes", () => {
    const target = v(0, 0, 0);
    for (const magnitude of [1e-250, 1, 1e250]) {
      const ray = new Ray(v(0, 0, 0), v(magnitude, 0, 0));
      expectVector(ray.closestPointToPoint(v(3, 4, 0), target), [3, 0, 0]);
      expect(ray.distanceSqToPoint(v(3, 4, 0))).toBe(16);
      expectVector(ray.intersectSphere({ center: v(100_000_000, 0, 0), radius: 1 }, target)!, [99_999_999, 0, 0]);
      const plane = new Plane(v(1, 0, 0), -2);
      expectVector(ray.intersectPlane(plane, target)!, [2, 0, 0]);
      expect(ray.distanceToPlane(plane)! * magnitude).toBeCloseTo(2, 12);
      expectVector(ray.intersectBox({ min: v(2, -1, -1), max: v(3, 1, 1) }, target)!, [2, 0, 0]);
      expectVector(ray.intersectTriangle(v(2, -1, -1), v(2, 1, -1), v(2, 0, 1), false, target)!, [2, 0, 0]);
    }
  });

  it("produces segment distances no greater than sampled feasible point pairs", () => {
    let state = 72381;
    const random = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000 * 10 - 5; };
    for (let i = 0; i < 60; i++) {
      const origin = v(random(), random(), random()), direction = v(random(), random(), random());
      const a = v(random(), random(), random()), b = v(random(), random(), random());
      const onRay = v(0, 0, 0), onSegment = v(0, 0, 0);
      const ray = new Ray(origin, direction);
      const actual = ray.distanceSqToSegment(a, b, onRay, onSegment);
      const dx = onRay.x - onSegment.x, dy = onRay.y - onSegment.y, dz = onRay.z - onSegment.z;
      expect(actual).toBeCloseTo(dx * dx + dy * dy + dz * dz, 10);
      for (let s = 0; s <= 10; s++) for (let t = 0; t <= 10; t++) {
        const x = origin.x + s * direction.x - (a.x + t / 10 * (b.x - a.x));
        const y = origin.y + s * direction.y - (a.y + t / 10 * (b.y - a.y));
        const z = origin.z + s * direction.z - (a.z + t / 10 * (b.z - a.z));
        expect(actual).toBeLessThanOrEqual(x * x + y * y + z * z + 1e-10);
      }
    }
  });
});

describe("independent mutable triangle geometry", () => {
  it("computes normal, plane, barycentrics, area and the closest point", () => {
    const t = new Triangle(v(0, 0, 0), v(4, 0, 0), v(0, 2, 0)), out = v(0, 0, 0);
    expect(t.getArea()).toBe(4);
    expectVector(t.getMidpoint(out), [4 / 3, 2 / 3, 0]);
    expectVector(t.getNormal(out), [0, 0, 1]);
    expectVector(t.getBarycoord(v(1, 0.5, 7), out)!, [0.5, 0.25, 0.25]);
    expect(t.containsPoint(v(2, 1, 0))).toBe(true);
    expect(t.containsPoint(v(3, 1, 0))).toBe(false);
    expect(t.isFrontFacing(v(0, 0, -1))).toBe(true);
    expect(t.isFrontFacing(v(0, 0, 1))).toBe(false);
    const plane = t.getPlane(new Plane());
    expect(plane.distanceToPoint(v(0, 0, 3))).toBeCloseTo(3);
    expectVector(t.closestPointToPoint(v(1, 0.5, 5), out), [1, 0.5, 0]);
    expectVector(t.closestPointToPoint(v(5, 0, 2), out), [4, 0, 0]);
    expectVector(t.closestPointToPoint(v(3, 2, 0), out), [2.4, 0.8, 0]);
  });

  it("returns null and zeroes the target for degenerate barycentrics and finds closest segments", () => {
    const t = new Triangle(v(0, 0, 0), v(2, 0, 0), v(5, 0, 0)), out = v(7, 8, 9);
    expect(t.getArea()).toBe(0);
    expect(t.getBarycoord(v(1, 1, 0), out)).toBeNull();
    expectVector(out, [0, 0, 0]); // unified 4.x contract: a degenerate triangle zeroes the target
    expect(t.containsPoint(v(1, 0, 0))).toBe(false);
    expectVector(t.closestPointToPoint(v(4, 3, 0), out), [4, 0, 0]);
    expectVector(t.getNormal(out), [0, 0, 0]);
    const point = new Triangle(v(2, 3, 4), v(2, 3, 4), v(2, 3, 4));
    expectVector(point.closestPointToPoint(v(4, 4, 4), out), [2, 3, 4]);
  });

  it("interpolates attributes and permits an input to be the output", () => {
    const t = new Triangle(v(0, 0, 0), v(4, 0, 0), v(0, 2, 0));
    const first = v(4, 0, 0), second = v(0, 8, 0), third = v(0, 0, 12);
    expect(t.getInterpolation(v(1, 0.5, 0), first, second, third, first)).toBe(first);
    expectVector(first, [2, 2, 3]);
    const data = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]];
    const attr = { getX: (i: number) => data[i]![0]!, getY: (i: number) => data[i]![1]!, getZ: (i: number) => data[i]![2]!, getW: (i: number) => data[i]![3]! };
    const weights = v(0.5, 0.25, 0.25), out3 = v(0, 0, 0), out4 = new Vector4();
    expect(Triangle.getInterpolatedAttribute(attr, 0, 1, 2, weights, out3)).toBe(out3);
    expectVector(out3, [4, 5, 6]);
    expect(Triangle.getInterpolatedAttribute(attr, 0, 1, 2, weights, out4)).toBe(out4);
    expect(out4.w).toBe(7);
    expectVector(out4, [4, 5, 6]);
    const degenerate = new Triangle();
    out3.set(7, 8, 9);
    expect(degenerate.getInterpolation(v(0, 0, 0), first, second, third, out3)).toBeNull();
    expectVector(out3, [0, 0, 0]); // unified 4.x contract: the target is cleared when there are no weights
  });

  it("loads indexed vertices, clones, and delegates box intersection", () => {
    const points = [v(1, 2, 3), v(4, 5, 6), v(7, 8, 9)];
    const t = new Triangle().setFromPointsAndIndices(points, 2, 0, 1);
    expectVector(t.a, [7, 8, 9]);
    const attr = { getX: (i: number) => points[i]!.x, getY: (i: number) => points[i]!.y, getZ: (i: number) => points[i]!.z };
    t.setFromAttributeAndIndices(attr, 1, 2, 0);
    const copy = t.clone();
    expect(copy.equals(t)).toBe(true);
    t.a.x = 99;
    expect(copy.a.x).toBe(4);
    let passed: Triangle | undefined;
    expect(t.intersectsBox({ intersectsTriangle(triangle) { passed = triangle; return true; } })).toBe(true);
    expect(passed).toBe(t);
  });

  it("preserves barycentric weights under uniform scaling and translation", () => {
    for (const scale of [1e-100, 1, 1e100]) {
      const a = v(0, 0, 0), b = v(4 * scale, 0, 0), c = v(0, 2 * scale, 0);
      const p = v(scale, scale / 2, 0), weights = v(0, 0, 0);
      expectVector(Triangle.getBarycoord(p, a, b, c, weights)!, [0.5, 0.25, 0.25]);
    }
    const skinny = new Triangle(v(0, 0, 0), v(2, 0, 0), v(2, 2e-8, 0));
    expectVector(skinny.getBarycoord(v(1.5, 0.5e-8, 0), v(0, 0, 0))!, [0.25, 0.5, 0.25]);
    const t = new Triangle(v(1, 0, 0), v(0, 1, 0), v(0, 0, 1));
    t.set(t.b, t.c, t.a);
    expectVector(t.a, [0, 1, 0]); expectVector(t.b, [0, 0, 1]); expectVector(t.c, [1, 0, 0]);
  });
});

describe("independent mutable frustum geometry", () => {
  it("extracts inclusive clip-space volumes for both depth ranges", () => {
    const gl = new Frustum().setFromProjectionMatrixDepthRange(identity, "minus-one-to-one");
    const gpu = new Frustum().setFromProjectionMatrixDepthRange(identity, "zero-to-one");
    expect(gl.containsPoint(v(1, 1, -1))).toBe(true);
    expect(gl.containsPoint(v(0, 0, -1.001))).toBe(false);
    expect(gpu.containsPoint(v(0, 0, 0))).toBe(true);
    expect(gpu.containsPoint(v(0, 0, -0.001))).toBe(false);
    expect(gpu.containsPoint(v(0, 0, 1.001))).toBe(false);
    expect(gl.intersectsSphere({ center: v(2, 0, 0), radius: 1 })).toBe(true);
    expect(gl.intersectsSphere({ center: v(2.001, 0, 0), radius: 1 })).toBe(false);
    expect(gl.intersectsSphere({ center: v(0, 0, 0), radius: -1 })).toBe(false);
    expect(gl.intersectsBox({ min: v(1, -0.5, -0.5), max: v(2, 0.5, 0.5) })).toBe(true);
    expect(gl.intersectsBox({ min: v(1.001, -0.5, -0.5), max: v(2, 0.5, 0.5) })).toBe(false);
    expect(gl.intersectsBox({ min: v(1, 1, 1), max: v(-1, -1, -1) })).toBe(false);
  });

  it("extracts perspective near/far planes with standard and reversed depth", () => {
    for (const [range, reversed, z, w] of [
      ["minus-one-to-one", false, -11 / 9, -20 / 9],
      ["minus-one-to-one", true, 11 / 9, 20 / 9],
      ["zero-to-one", false, -10 / 9, -10 / 9],
      ["zero-to-one", true, 1 / 9, 10 / 9],
    ] as const) {
      const projection = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, z, -1, 0, 0, w, 0] };
      const f = new Frustum().setFromProjectionMatrixDepthRange(projection, range, reversed);
      expect(f.containsPoint(v(0, 0, -2))).toBe(true);
      expect(f.containsPoint(v(0, 0, -0.5))).toBe(false);
      expect(f.containsPoint(v(0, 0, -11))).toBe(false);
      expect(f.planes[4].distanceToPoint(v(0, 0, -10))).toBeCloseTo(0, 12);
      expect(f.planes[5].distanceToPoint(v(0, 0, -1))).toBeCloseTo(0, 12);
    }
  });

  it("retains infinite far planes and independent immutable copies", () => {
    const infinite = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -2, 0] };
    const f = new Frustum().setFromProjectionMatrixDepthRange(infinite, "minus-one-to-one");
    expect(f.containsPoint(v(0, 0, -1_000_000))).toBe(true);
    expect(f.containsPoint(v(0, 0, -0.5))).toBe(false);
    const immutable = f.toImmutable();
    const copy = new Frustum().fromImmutable(immutable);
    f.planes[5].constant = 500;
    expect(copy.containsPoint(v(0, 0, -0.5))).toBe(false);
    expect(immutable.planes[5].constant).not.toBe(500);
  });

  it("preserves infinite-far metadata across both depth ranges and directions", () => {
    for (const [range, reversed, z, w] of [
      ["minus-one-to-one", false, -1, -2],
      ["minus-one-to-one", true, 1, 2],
      ["zero-to-one", false, -1, -1],
      ["zero-to-one", true, 0, 1],
    ] as const) {
      const coefficients = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, z, -1, 0, 0, w, 0];
      for (const scale of [1e-200, 1, 1e200]) {
        const f = new Frustum().setFromProjectionMatrixDepthRange({ elements: coefficients.map(value => value * scale) }, range, reversed);
        const immutable = f.toImmutable();
        expect(immutable.infiniteFar).toBe(true);
        expect(immutable.activePlanes).toHaveLength(5);
        expect(immutable.activePlanes).not.toContain(immutable.planes[4]);
        expect(immutable.activePlanes).toContain(immutable.planes[5]);
        expect(immutable.containsPoint(new ImmutableVector3(0, 0, -1e9))).toBe(true);
        expect(immutable.containsPoint(new ImmutableVector3(0, 0, -0.5))).toBe(false);
        const roundTrip = new Frustum().fromImmutable(immutable);
        expect(roundTrip.containsPoint(v(0, 0, -1e9))).toBe(true);
        expect(roundTrip.containsPoint(v(0, 0, -0.5))).toBe(false);
        expect(roundTrip.toImmutable().infiniteFar).toBe(true);
      }
    }
  });

  it("keeps finite and empty far planes active in immutable conversions", () => {
    for (const [range, reversed, z, w] of [
      ["minus-one-to-one", false, -11 / 9, -20 / 9],
      ["minus-one-to-one", true, 11 / 9, 20 / 9],
      ["zero-to-one", false, -10 / 9, -10 / 9],
      ["zero-to-one", true, 1 / 9, 10 / 9],
    ] as const) {
      const projection = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, z, -1, 0, 0, w, 0] };
      const immutable = new Frustum().setFromProjectionMatrixDepthRange(projection, range, reversed).toImmutable();
      expect(immutable.infiniteFar).toBe(false);
      expect(immutable.activePlanes).toHaveLength(6);
      expect(immutable.containsPoint(new ImmutableVector3(0, 0, -2))).toBe(true);
      expect(immutable.containsPoint(new ImmutableVector3(0, 0, -11))).toBe(false);
    }
    const empty = new Frustum();
    for (const plane of empty.planes) plane.setComponents(0, 0, 0, 1);
    empty.planes[4].setComponents(0, 0, 0, -1);
    const farExcludesAll = empty.toImmutable();
    expect(farExcludesAll.infiniteFar).toBe(false);
    expect(farExcludesAll.activePlanes).toHaveLength(6);
    expect(farExcludesAll.containsPoint(new ImmutableVector3())).toBe(false);
    empty.planes[4].setComponents(0, 0, 0, 1);
    empty.planes[0].setComponents(0, 0, 0, -1);
    const otherPlaneExcludesAll = empty.toImmutable();
    expect(otherPlaneExcludesAll.infiniteFar).toBe(true);
    expect(otherPlaneExcludesAll.activePlanes).toHaveLength(5);
    expect(otherPlaneExcludesAll.containsPoint(new ImmutableVector3())).toBe(false);
    // A nonzero far normal with an infinite constant is not enough to infer
    // the caller's far metadata; retain its active slot on conversion.
    empty.planes[0].setComponents(0, 0, 0, 1);
    empty.planes[4].setComponents(1, 0, 0, Infinity);
    const finiteMetadata = empty.toImmutable();
    expect(finiteMetadata.infiniteFar).toBe(false);
    expect(new Frustum().fromImmutable(finiteMetadata).toImmutable().infiniteFar).toBe(false);
  });

  it("honors inactive far-plane metadata from an immutable source", () => {
    const finite = new Frustum().setFromProjectionMatrixDepthRange(identity, "minus-one-to-one").toImmutable();
    const infinite = new ImmutableFrustum(finite.planes, true);
    expect(infinite.containsPoint(new ImmutableVector3(0, 0, 2))).toBe(true);
    const converted = new Frustum().fromImmutable(infinite);
    expect(converted.containsPoint(v(0, 0, 2))).toBe(true);
    expect(converted.toImmutable().infiniteFar).toBe(true);
    const copied = new Frustum().copy(infinite);
    expect(copied.containsPoint(v(0, 0, 2))).toBe(true);
    expect(copied.toImmutable().activePlanes).toHaveLength(5);
    expect(finite.containsPoint(new ImmutableVector3(0, 0, 2))).toBe(false);
  });

  it("converts very small and large finite plane normals", () => {
    for (const magnitude of [Number.MIN_VALUE, 1e-300, 1e300, 1e308]) {
      const f = new Frustum();
      for (const plane of f.planes) plane.setComponents(0, 0, 0, 1);
      f.planes[0].setComponents(magnitude, 0, 0, -magnitude);
      const immutable = f.toImmutable();
      expect(immutable.containsPoint(new ImmutableVector3(2, 0, 0))).toBe(true);
      expect(immutable.containsPoint(new ImmutableVector3(0, 0, 0))).toBe(false);
    }
    const largeConstant = new Frustum();
    for (const plane of largeConstant.planes) plane.setComponents(0, 0, 0, 1);
    largeConstant.planes[0].setComponents(0.75, 0.75, 0.75, 1.7e308);
    const converted = largeConstant.toImmutable();
    expect(Number.isFinite(converted.planes[0].constant)).toBe(true);
    expect(converted.planes[0].constant / 1e308).toBeCloseTo(1.7 / (0.75 * Math.sqrt(3)), 12);
    const unrepresentable = new Frustum();
    for (const plane of unrepresentable.planes) plane.setComponents(0, 0, 0, 1);
    unrepresentable.planes[0].setComponents(1e-308, 1e-308, 1e-308, -4);
    expect(unrepresentable.containsPoint(v(1.5e308, 1.5e308, 1.5e308))).toBe(true);
    expect(unrepresentable.containsPoint(v(0, 0, 0))).toBe(false);
    expect(() => unrepresentable.toImmutable()).toThrow(/cannot be represented/i);
  });

  it("keeps clipping unchanged under extreme positive matrix rescaling", () => {
    const matrix = [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const f = new Frustum().setFromProjectionMatrixDepthRange({ elements: matrix }, "minus-one-to-one");
    for (const scale of [1e-300, 1e308]) {
      const scaled = new Frustum().setFromProjectionMatrixDepthRange({ elements: matrix.map(x => x * scale) }, "minus-one-to-one");
      for (const point of [v(-0.25, 0, 0), v(-1, 0, 0), v(1, 1, 1), v(0, 0, -2)]) {
        expect(scaled.containsPoint(point)).toBe(f.containsPoint(point));
      }
    }
  });

  it("culls transformed bounds conservatively and accounts for sprite anchors", () => {
    const f = new Frustum().setFromProjectionMatrixDepthRange(identity, "minus-one-to-one");
    let computations = 0;
    const geometry = { boundingSphere: null as Sphere | null, computeBoundingSphere() { computations++; this.boundingSphere = new Sphere(v(0, 0, 0), 0.5); } };
    expect(f.intersectsObject({ matrixWorld: world(2, 0, 0), geometry })).toBe(false);
    expect(computations).toBe(1);
    expect(f.intersectsObject({ matrixWorld: world(1.5, 0, 0), geometry })).toBe(true);
    expect(f.intersectsObject({ matrixWorld: world(50, 0, 0) })).toBe(true);
    const shear = { elements: [1, 0, 0, 0, 1, 0.01, 0, 0, 0, 0, 1, 0, 2.2, 0, 0, 1], getMaxScaleOnAxis: () => Math.hypot(1, 0.01) };
    expect(f.intersectsObject({ matrixWorld: shear, boundingSphere: new Sphere(v(0, 0, 0), 1) })).toBe(true);
    expect(f.intersectsSprite({ matrixWorld: world(1.6, 0, 0), center: new Vector2(0.5, 0.5) })).toBe(true);
    expect(f.intersectsSprite({ matrixWorld: world(2.3, 0, 0), center: new Vector2(1, 0.5) })).toBe(false);
    expect(f.intersectsSprite({ matrixWorld: world(2.3, 0, 0), center: new Vector2(1.5, 0.5) })).toBe(true);
  });

  it("scales custom plane distances and preserves planes when swapping them", () => {
    const f = new Frustum().setFromProjectionMatrixDepthRange(identity, "minus-one-to-one");
    f.planes[0].setComponents(-4, 0, 0, 4);
    expect(f.intersectsSphere({ center: v(2, 0, 0), radius: 1 })).toBe(true);
    const planes = [...f.planes] as const;
    f.set(planes[1], planes[0], planes[2], planes[3], planes[4], planes[5]);
    expectVector(f.planes[0].normal, [1, 0, 0]);
    expectVector(f.planes[1].normal, [-4, 0, 0]);
    const cloned = f.clone();
    f.planes[0].constant = 10;
    expect(cloned.planes[0].constant).toBe(1);
    expect(() => f.setFromProjectionMatrix(identity, 0)).toThrow(RangeError);
  });

  it("classifies points, spheres and boxes independently of finite plane scaling", () => {
    for (const magnitude of [Number.MIN_VALUE, 1e-308, 1, 1e308]) {
      const f = new Frustum();
      for (const plane of f.planes) plane.setComponents(magnitude, magnitude, 0, 0);
      expect(f.containsPoint(v(2.5, -2.4, 0))).toBe(true);
      expect(f.containsPoint(v(-2.5, 2.4, 0))).toBe(false);
      expect(f.intersectsSphere({ center: v(-2.5, 2.4, 0), radius: 0.01 })).toBe(false);
      expect(f.intersectsSphere({ center: v(-1, 0, 0), radius: 1 / Math.sqrt(2) })).toBe(true);
      expect(f.intersectsBox({ min: v(2, -4, -0.1), max: v(2.5, -3, 0.1) })).toBe(false);
      expect(f.intersectsBox({ min: v(2, -3, -0.1), max: v(3, -2, 0.1) })).toBe(true);
    }
  });

  it("handles overflow in accumulated half-space dot products and constant planes", () => {
    const f = new Frustum();
    for (const plane of f.planes) plane.setComponents(1, 1, -1, 0);
    expect(f.containsPoint(v(1e308, 1e308, 1e308))).toBe(true);
    expect(f.containsPoint(v(-1e308, -1e308, -1e308))).toBe(false);
    expect(f.intersectsSphere({ center: v(-1e308, -1e308, -1e308), radius: 1 })).toBe(false);
    expect(f.intersectsBox({ min: v(-1e308, -1e308, -1e308), max: v(-1e308, -1e308, -1e308) })).toBe(false);
    for (const plane of f.planes) plane.setComponents(0, 0, 0, 1);
    expect(f.containsPoint(v(0, 0, 0))).toBe(true);
    expect(f.intersectsSphere({ center: v(0, 0, 0), radius: 0 })).toBe(true);
    f.planes[0].setComponents(0, 0, 0, -1);
    expect(f.containsPoint(v(0, 0, 0))).toBe(false);
    expect(f.intersectsSphere({ center: v(0, 0, 0), radius: 1 })).toBe(false);
  });
});
