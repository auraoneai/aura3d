import { describe, expect, it } from "vitest";
import { Triangle, Vector3 } from "@aura3d/math";
import { closestPointOnDegenerateTriangle } from "../../../packages/math/src/independent/TriangleDegenerate.js";

const v = (x: number, y: number, z = 0): Vector3 => new Vector3(x, y, z);

function expectPoint(actual: Vector3, x: number, y: number, z: number): void {
  expect(actual).toBeInstanceOf(Vector3);
  expect(actual.x).toBe(x);
  expect(actual.y).toBe(y);
  expect(actual.z).toBe(z);
}

function permutations(a: Vector3, b: Vector3, c: Vector3): [Vector3, Vector3, Vector3][] {
  return [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
}

describe("public immutable triangle closest point", () => {
  it("projects repeated vertices onto the segment in every position", () => {
    const start = v(0, 0), end = v(2, 0);
    for (const vertices of [[start, start, end], [start, end, start], [end, start, start]] as const) {
      const triangle = new Triangle(...vertices);
      expectPoint(triangle.closestPointToPoint(v(1, 1)), 1, 0, 0);
      expectPoint(triangle.closestPointToPoint(v(-1, 1)), 0, 0, 0);
      expectPoint(triangle.closestPointToPoint(v(3, 1)), 2, 0, 0);
    }
  });

  it("treats coincident vertices as a point without modifying any input", () => {
    const a = v(2, 3, 4), b = v(2, 3, 4), c = v(2, 3, 4), point = v(4, 4, 4);
    const before = [a.toArray(), b.toArray(), c.toArray(), point.toArray()];
    const triangle = new Triangle(a, b, c);
    expectPoint(triangle.closestPointToPoint(point), 2, 3, 4);
    expect([a.toArray(), b.toArray(), c.toArray(), point.toArray()]).toEqual(before);
  });

  it("uses the extreme endpoints for every ordering of an oblique collinear triple", () => {
    const a = v(-2, -4, -6), b = v(0, 0, 0), c = v(3, 6, 9);
    for (const vertices of permutations(a, b, c)) {
      const triangle = new Triangle(...vertices);
      expectPoint(triangle.closestPointToPoint(v(5, 0, 3)), 1, 2, 3);
      expectPoint(triangle.closestPointToPoint(v(0, -10, -12)), -2, -4, -6);
      expectPoint(triangle.closestPointToPoint(v(10, 10, 18)), 3, 6, 9);
    }
  });

  it.each([1e-200, 1e200])("projects correctly at scale %s", (scale) => {
    const a = v(0, 0), c = v(2 * scale, 0);
    const point = v(scale, scale);
    const triangle = new Triangle(a, a, c);
    expectPoint(triangle.closestPointToPoint(point), scale, 0, 0);
    expectPoint(a, 0, 0, 0);
    expectPoint(c, 2 * scale, 0, 0);
    expectPoint(point, scale, scale, 0);
  });

  it("handles subnormal edges and endpoint differences that exceed binary64 range", () => {
    const min = Number.MIN_VALUE;
    const origin = v(0, 0);
    expectPoint(new Triangle(origin, origin, v(2 * min, 0)).closestPointToPoint(v(min, min)), min, 0, 0);

    const lo = v(-Number.MAX_VALUE, 0), hi = v(Number.MAX_VALUE, 0);
    expectPoint(new Triangle(lo, hi, lo).closestPointToPoint(v(0, 1)), 0, 0, 0);
    expectPoint(new Triangle(v(-1e308, 0), origin, v(1e308, 0)).closestPointToPoint(v(5e307, 1)), 5e307, 0, 0);
  });

  it("retains a representable projection when its segment parameter underflows", () => {
    const origin = v(0, 0);
    const point = v(1e-200, 1);
    expectPoint(new Triangle(origin, origin, v(1e308, 0)).closestPointToPoint(point), 1e-200, 0, 0);
    expectPoint(new Triangle(origin, origin, v(1e308, 1e308)).closestPointToPoint(v(1e-200, 1e-200)), 1e-200, 1e-200, 0);
  });

  it("rounds halfway results to even at normal and subnormal boundaries", () => {
    const origin = v(0, 0), min = Number.MIN_VALUE;
    expectPoint(new Triangle(origin, origin, v(min, min)).closestPointToPoint(v(min, 0)), 0, 0, 0);
    expectPoint(new Triangle(origin, origin, v(3 * min, 3 * min)).closestPointToPoint(v(3 * min, 0)), 2 * min, 2 * min, 0);
    const negative = new Triangle(origin, origin, v(-min, -min)).closestPointToPoint(v(-min, 0));
    expect(Object.is(negative.x, -0)).toBe(true);
    expect(Object.is(negative.y, -0)).toBe(true);

    const step = Number.EPSILON;
    const lowEven = v(1, 0);
    const lowOdd = v(1 + step, 0);
    expectPoint(new Triangle(lowEven, lowEven, v(1 + step, step)).closestPointToPoint(v(1 + step, 0)), 1, step / 2, 0);
    expectPoint(new Triangle(lowOdd, lowOdd, v(1 + 2 * step, step)).closestPointToPoint(v(1 + 2 * step, 0)), 1 + 2 * step, step / 2, 0);
  });

  it("leaves ordinary face, edge, vertex, and thin nonzero triangles on their existing path", () => {
    const triangle = new Triangle(v(0, 0), v(4, 0), v(0, 4));
    expectPoint(triangle.closestPointToPoint(v(1, 1, 2)), 1, 1, 0);
    expectPoint(triangle.closestPointToPoint(v(3, 3, 2)), 2, 2, 0);
    expectPoint(triangle.closestPointToPoint(v(5, -1, 1)), 4, 0, 0);

    const thin = new Triangle(v(0, 0), v(1, 0), v(0, 2 ** -10));
    expectPoint(thin.closestPointToPoint(v(0.25, 2 ** -12, 2)), 0.25, 2 ** -12, 0);
  });

  it("does not dispatch exactly noncollinear or nonfinite inputs to the fallback", () => {
    const origin = v(0, 0), point = v(1, 1);
    expect(closestPointOnDegenerateTriangle(origin, v(1, 0), v(0, 1), point)).toBeUndefined();
    expect(closestPointOnDegenerateTriangle(origin, v(1, 1), v(2, 2 + 2 * Number.EPSILON), point)).toBeUndefined();
    expect(closestPointOnDegenerateTriangle(origin, v(Number.MIN_VALUE, 0), v(0, Number.MIN_VALUE), point)).toBeUndefined();
    expect(closestPointOnDegenerateTriangle(origin, v(1e308, 0), v(0, 1e308), point)).toBeUndefined();
    expect(closestPointOnDegenerateTriangle(origin, origin, v(2, 0), v(Number.NaN, 1))).toBeUndefined();
    expect(closestPointOnDegenerateTriangle(origin, origin, v(Number.POSITIVE_INFINITY, 0), point)).toBeUndefined();
  });
});
