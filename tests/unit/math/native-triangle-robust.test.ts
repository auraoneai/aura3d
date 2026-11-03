import { describe, expect, it } from "vitest";
import { Triangle, Vector3 } from "@aura3d/math";
import { robustTriangleBarycoord, robustTriangleNormal } from "../../../packages/math/src/independent/TriangleRobust.js";

const v = (x: number, y: number, z = 0): Vector3 => new Vector3(x, y, z);

function expectVector(actual: Vector3 | null, x: number, y: number, z: number): void {
  expect(actual).not.toBeNull();
  expect(actual?.x).toBe(x);
  expect(actual?.y).toBe(y);
  expect(actual?.z).toBe(z);
}

describe("immutable triangle robust barycentrics and normals", () => {
  it("preserves barycentrics for a skinny nonzero triangle and its off-plane projection", () => {
    const height = 2 ** -30;
    const a = v(0, 0), b = v(1, 0), c = v(1, height), point = v(0.75, height / 4, 7);
    const before = [a.toArray(), b.toArray(), c.toArray(), point.toArray()];
    const triangle = new Triangle(a, b, c);
    expectVector(Triangle.getBarycoord(point, a, b, c), 0.25, 0.5, 0.25);
    expectVector(triangle.getBarycoord(point), 0.25, 0.5, 0.25);
    expectVector(triangle.getNormal(), 0, 0, 1);
    expectVector(triangle.getInterpolation(point, v(4, 0, 0), v(0, 8, 0), v(0, 0, 12)), 1, 4, 3);
    expect(triangle.containsPoint(v(0.75, height / 4))).toBe(true);
    expect(triangle.containsPoint(v(2, height / 4))).toBe(false);
    expect([a.toArray(), b.toArray(), c.toArray(), point.toArray()]).toEqual(before);
  });

  it.each([-600, 600])("handles triangle edges scaled by 2^%s", (power) => {
    const scale = 2 ** power;
    const triangle = new Triangle(v(0, 0), v(scale, 0), v(0, scale));
    const point = v(scale / 4, scale / 2, scale);
    expectVector(triangle.getBarycoord(point), 0.25, 0.25, 0.5);
    expectVector(triangle.getNormal(), 0, 0, 1);
  });

  it("handles finite coordinates whose edge subtraction overflows", () => {
    const max = Number.MAX_VALUE;
    const triangle = new Triangle(v(-max, 0), v(max, 0), v(-max, max));
    expectVector(triangle.getBarycoord(v(0, max / 2, 5)), 0, 0.5, 0.5);
    expectVector(triangle.getNormal(), 0, 0, 1);
    expect(Triangle.getNormal(triangle.a, triangle.c, triangle.b).z).toBe(-1);
  });

  it("recognizes a nonzero subnormal triangle without collapsing it to a point", () => {
    const min = Number.MIN_VALUE;
    const triangle = new Triangle(v(0, 0), v(min, 0), v(0, min));
    expectVector(triangle.getBarycoord(v(min, 0)), 0, 1, 0);
    expectVector(triangle.getNormal(), 0, 0, 1);
  });

  it("rounds exact rational weights even when the edge products underflow", () => {
    const scale = 2 ** -600;
    const triangle = new Triangle(v(0, 0), v(3 * scale, 0), v(0, scale));
    expectVector(triangle.getBarycoord(v(scale, 0)), 2 / 3, 1 / 3, 0);
  });

  it("returns zero area for an exactly collinear extreme-scale triangle", () => {
    const scale = 2 ** 400;
    const triangle = new Triangle(v(-scale, -2 * scale, -3 * scale), v(0, 0, 0), v(scale, 2 * scale, 3 * scale));
    expect(triangle.getBarycoord(v(1, 1, 1))).toBeNull();
    expectVector(triangle.getNormal(), 0, 0, 0);
  });

  it("normalizes an exact cross product after severe cancellation", () => {
    const triangle = new Triangle(v(0, 0, 0), v(1, 1, 1), v(1, 1 + Number.EPSILON, 1));
    const normal = triangle.getNormal();
    expect(normal.x).toBeCloseTo(-Math.SQRT1_2, 15);
    expect(normal.y).toBe(0);
    expect(normal.z).toBeCloseTo(Math.SQRT1_2, 15);
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 15);
  });

  it("represents weights beyond binary64 range as signed infinities", () => {
    const min = Number.MIN_VALUE;
    const triangle = new Triangle(v(0, 0), v(min, 0), v(0, min));
    expectVector(triangle.getBarycoord(v(Number.MAX_VALUE, 0)), -Infinity, Infinity, 0);
  });

  it("leaves ordinary and nonfinite inputs on the existing calculation path", () => {
    const a = v(0, 0), b = v(1, 0), c = v(0, 1), point = v(0.25, 0.5, 1);
    expect(robustTriangleBarycoord(point, a, b, c)).toBeUndefined();
    expect(robustTriangleNormal(a, b, c)).toBeUndefined();
    expectVector(new Triangle(a, b, c).getBarycoord(point), 0.25, 0.25, 0.5);
    expectVector(new Triangle(a, b, c).getNormal(), 0, 0, 1);
    expect(robustTriangleBarycoord(v(Number.NaN, 0), a, b, c)).toBeUndefined();
    expect(robustTriangleNormal(a, b, v(Infinity, 0))).toBeUndefined();
  });
});
