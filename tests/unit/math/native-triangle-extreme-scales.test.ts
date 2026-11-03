import { describe, expect, it } from "vitest";
import { Triangle, Vector3 } from "@aura3d/math";

const v = (x: number, y: number, z = 0): Vector3 => new Vector3(x, y, z);

function expectPoint(actual: Vector3, expected: Vector3): void {
  expect(actual.toArray()).toEqual(expected.toArray());
}

function permutations(a: Vector3, b: Vector3, c: Vector3): [Vector3, Vector3, Vector3][] {
  return [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
}

describe("immutable triangle closest point across finite scales", () => {
  it.each([-1020, -600, -300, -1, 0, 100, 300, 600, 1020])(
    "finds face, edges, and vertices at scale 2^%s for every vertex order",
    (exponent) => {
      const s = 2 ** exponent;
      const a = v(0, 0), b = v(s, 0), c = v(0, s);
      const cases: [Vector3, Vector3][] = [
        [v(s / 4, s / 4, s / 8), v(s / 4, s / 4)],
        [v(s / 4, -s / 4, s / 8), v(s / 4, 0)],
        [v(-s / 4, s / 4, s / 8), v(0, s / 4)],
        [v(3 * (s / 4), 3 * (s / 4), s / 8), v(s / 2, s / 2)],
        [v(-s / 4, -s / 4, s / 8), a],
        [v(s + s / 4, -s / 4, s / 8), b],
        [v(-s / 4, s + s / 4, s / 8), c]
      ];
      for (const vertices of permutations(a, b, c)) {
        const triangle = new Triangle(...vertices);
        for (const [point, expected] of cases) expectPoint(triangle.closestPointToPoint(point), expected);
      }
    }
  );

  it("preserves small representable offsets after a large translation", () => {
    const base = 2 ** 700, side = 2 ** 650;
    const a = v(base, base, base), b = v(base + side, base, base), c = v(base, base + side, base);
    const point = v(base + side / 4, base + side / 4, base + side);
    const before = [a.toArray(), b.toArray(), c.toArray(), point.toArray()];
    for (const vertices of permutations(a, b, c)) {
      expectPoint(new Triangle(...vertices).closestPointToPoint(point), v(base + side / 4, base + side / 4, base));
    }
    expect([a.toArray(), b.toArray(), c.toArray(), point.toArray()]).toEqual(before);
  });

  it("handles finite endpoints whose differences overflow", () => {
    const max = Number.MAX_VALUE;
    const a = v(-max, 0), b = v(max, 0), c = v(-max, max);
    for (const vertices of permutations(a, b, c)) {
      expectPoint(new Triangle(...vertices).closestPointToPoint(v(0, max / 4, 1)), v(0, max / 4));
      expectPoint(new Triangle(...vertices).closestPointToPoint(v(max, -max, 1)), b);
    }
  });

  it("retains very small face and edge coordinates when their weights underflow", () => {
    const a = v(0, 0), b = v(1e308, 0), c = v(0, 1e308);
    for (const vertices of permutations(a, b, c)) {
      const triangle = new Triangle(...vertices);
      expectPoint(triangle.closestPointToPoint(v(1e-200, 1, 1)), v(1e-200, 1));
      expectPoint(triangle.closestPointToPoint(v(1e-200, -1, 1)), v(1e-200, 0));
    }
  });

  it("retains a tiny coordinate hidden by cancellation between large edges", () => {
    const large = 2 ** 900, tiny = 2 ** -500;
    const a = v(0, 0), b = v(large, large), c = v(-large, large);
    for (const vertices of permutations(a, b, c)) {
      expectPoint(new Triangle(...vertices).closestPointToPoint(v(tiny, large / 2, 1)), v(tiny, large / 2));
    }
  });

  it.each([-300, 0, 300])("projects onto an oblique face, edge, and vertex at 2^%s", (exponent) => {
    const s = 2 ** exponent;
    const a = v(s, 2 * s, 3 * s), b = v(5 * s, 4 * s, 3 * s), c = v(2 * s, 4 * s, 7 * s);
    // The face normal is (8, -16, 6). Adding half of it moves the first
    // query off the plane without changing its interior projection.
    const cases: [Vector3, Vector3][] = [
      [v(7.25 * s, -4.5 * s, 7 * s), v(3.25 * s, 3.5 * s, 4 * s)],
      [v(10 * s, -11 * s, -14 * s), v(3 * s, 3 * s, 3 * s)],
      [v(0, -10 * s, 2 * s), a]
    ];
    for (const vertices of permutations(a, b, c)) {
      const triangle = new Triangle(...vertices);
      for (const [point, expected] of cases) expectPoint(triangle.closestPointToPoint(point), expected);
    }
  });

  it("keeps a very thin nonzero face and an exactly collinear hull distinct", () => {
    const height = 2 ** -500;
    const triangle = new Triangle(v(0, 0), v(1, 0), v(1, height));
    expectPoint(triangle.closestPointToPoint(v(0.75, height / 4, 1)), v(0.75, height / 4));
    const line = new Triangle(v(-1e308, 0), v(0, 0), v(1e308, 0));
    expectPoint(line.closestPointToPoint(v(1e-200, 1)), v(1e-200, 0));
  });

  it("handles subnormal triangles and rounds halfway projections to even", () => {
    const min = Number.MIN_VALUE;
    expectPoint(
      new Triangle(v(0, 0), v(8 * min, 0), v(0, 8 * min)).closestPointToPoint(v(3 * min, 2 * min, 2 * min)),
      v(3 * min, 2 * min)
    );
    const triangle = new Triangle(v(0, 0), v(4 * min, 0, 4 * min), v(0, 4 * min));
    expectPoint(triangle.closestPointToPoint(v(min, min, 0)), v(0, min, 0));
    expectPoint(triangle.closestPointToPoint(v(3 * min, min, 0)), v(2 * min, min, 2 * min));
  });

  it("selects the correct edge even when all squared distances overflow", () => {
    const side = 2 ** -500;
    const triangle = new Triangle(v(0, 0), v(side, 0), v(0, side));
    expectPoint(triangle.closestPointToPoint(v(Number.MAX_VALUE, Number.MAX_VALUE)), v(side / 2, side / 2));
  });
});

describe("immutable triangle area and facing across finite scales", () => {
  it("keeps a representable area when an edge product overflows", () => {
    const side = 2 ** 512;
    const a = v(0, 0), b = v(side, 0), c = v(0, side);
    for (const vertices of permutations(a, b, c)) {
      expect(new Triangle(...vertices).getArea()).toBe(2 ** 1023);
    }
    expect(new Triangle(a, v(Number.MAX_VALUE, 0), v(0, 2)).getArea()).toBe(Number.MAX_VALUE);
    expect(new Triangle(a, v(side, 0, 0), v(0, side, side)).getArea()).toBe(Math.SQRT2 * (2 ** 1023));
  });

  it("resolves finite area after cancelling individually overflowing products", () => {
    const side = 2 ** 530, offset = 2 ** 479;
    const triangle = new Triangle(v(0, 0), v(side, side), v(2 * side, 2 * side + offset));
    expect(triangle.getArea()).toBe(2 ** 1008);
  });

  it("preserves area and facing after a large representable translation", () => {
    const base = 2 ** 500, side = 2 ** 450;
    const a = v(base, base, base), b = v(base + side, base, base), c = v(base, base + side, base);
    expect(new Triangle(a, b, c).getArea()).toBe(2 ** 899);
    expect(Triangle.isFrontFacing(a, b, c, v(0, 0, -1))).toBe(true);
    expect(Triangle.isFrontFacing(a, c, b, v(0, 0, -1))).toBe(false);
  });

  it("handles overflowing endpoint differences and exact degeneracy", () => {
    const max = Number.MAX_VALUE;
    const a = v(-max, 0), b = v(max, 0), c = v(-max, 0.5);
    for (const vertices of permutations(a, b, c)) expect(new Triangle(...vertices).getArea()).toBe(max / 2);
    expect(new Triangle(v(-max, -max), v(0, 0), v(max, max)).getArea()).toBe(0);
    expect(new Triangle(v(-max, 0), v(max, 0), v(0, max)).getArea()).toBe(Infinity);
  });

  it("rounds tiny areas only after combining the cross-product components", () => {
    const side = 2 ** -537, min = Number.MIN_VALUE;
    // The exact area is sqrt(2)/2 minimum-subnormal units, which rounds to one unit.
    expect(new Triangle(v(0, 0), v(side, 0, 0), v(0, side, side)).getArea()).toBe(min);
    expect(new Triangle(v(0, 0), v(min, 0), v(0, 1)).getArea()).toBe(0);
    expect(new Triangle(v(0, 0), v(3 * min, 0), v(0, 1)).getArea()).toBe(2 * min);
    expect(new Triangle(v(0, 0), v(side, 0, 0), v(0, 3 * side, 4 * side)).getArea()).toBe(2 * min);
  });

  it.each([-600, 600])("preserves facing for a tilted triangle at 2^%s", (exponent) => {
    const side = 2 ** exponent;
    const a = v(0, 0, 0), b = v(side, 0, side), c = v(0, side, side);
    expect(Triangle.isFrontFacing(a, b, c, v(1, 0, 0))).toBe(true);
    expect(Triangle.isFrontFacing(a, c, b, v(1, 0, 0))).toBe(false);
    expect(new Triangle(a, b, c).isFrontFacing(v(-1, 0, 0))).toBe(false);
    expect(new Triangle(a, b, c).isFrontFacing(v(1, -1, 0))).toBe(false);
  });

  it("preserves orientation when a direction component disappears under scaling", () => {
    const triangle = new Triangle(v(0, 0), v(1, 0), v(0, 1));
    expect(triangle.isFrontFacing(v(Number.MAX_VALUE, Number.MAX_VALUE, -Number.MIN_VALUE))).toBe(true);
    expect(triangle.isFrontFacing(v(Number.MAX_VALUE, Number.MAX_VALUE, Number.MIN_VALUE))).toBe(false);
  });

  it("resolves facing after overflowing differences and near-total cancellation", () => {
    const max = Number.MAX_VALUE;
    const wide = new Triangle(v(-max, 0), v(max, 0), v(-max, 0.5));
    expect(wide.isFrontFacing(v(0, 0, -1))).toBe(true);
    expect(wide.isFrontFacing(v(0, 0, 1))).toBe(false);
    expect(new Triangle(v(-max, -max), v(0, 0), v(max, max)).isFrontFacing(v(0, 0, -1))).toBe(false);

    const eps = Number.EPSILON;
    const thin = new Triangle(v(0, 0, 0), v(1, 1, 1), v(1, 1 + eps, 1));
    expect(thin.isFrontFacing(v(1, 0, 0))).toBe(true);
    expect(thin.isFrontFacing(v(1, 0, 1))).toBe(false);
    expect(thin.isFrontFacing(v(1, 0, 1 - eps))).toBe(true);
  });

  it("leaves nonfinite inputs on their existing area and facing paths", () => {
    const triangle = new Triangle(v(0, 0), v(1, 0), v(0, 1));
    expect(triangle.isFrontFacing(v(0, 0, -Infinity))).toBe(true);
    expect(triangle.isFrontFacing(v(Infinity, 0, -1))).toBe(false);
    expect(new Triangle(v(0, 0), v(Infinity, 0), v(0, 1)).getArea()).toBeNaN();
  });
});
