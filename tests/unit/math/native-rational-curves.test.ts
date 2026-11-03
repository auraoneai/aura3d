import { describe, expect, it } from "vitest";
import { NURBSCurve, NURBSSurface, NURBSVolume, Vector3 } from "@aura3d/math";

function point(x: number, y: number, z: number, w = 1) { return { x, y, z, w }; }
function expectVector(value: Vector3, expected: readonly [number, number, number], tolerance = 1e-10) {
  expect(value.x).toBeCloseTo(expected[0], Math.max(0, Math.ceil(-Math.log10(tolerance)) - 1));
  expect(value.y).toBeCloseTo(expected[1], Math.max(0, Math.ceil(-Math.log10(tolerance)) - 1));
  expect(value.z).toBeCloseTo(expected[2], Math.max(0, Math.ceil(-Math.log10(tolerance)) - 1));
}

const linear = [0, 0, 1, 1];

describe("native rational splines", () => {
  it("evaluates a rational quarter circle from its exact conic equation", () => {
    const curve = new NURBSCurve(2, [0, 0, 0, 1, 1, 1], [
      point(1, 0, 0), point(1, 1, 0, Math.SQRT1_2), point(0, 1, 0)
    ]);
    for (const t of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const denominator = (1 - t) ** 2 + 2 * Math.SQRT1_2 * t * (1 - t) + t ** 2;
      const x = ((1 - t) ** 2 + 2 * Math.SQRT1_2 * t * (1 - t)) / denominator;
      const y = (2 * Math.SQRT1_2 * t * (1 - t) + t ** 2) / denominator;
      const value = curve.getPoint(t);
      expectVector(value, [x, y, 0]);
      expect(value.length()).toBeCloseTo(1, 12);
      expect(value.dot(curve.getDerivative(t))).toBeCloseTo(0, 10);
    }
    expectVector(curve.getPoint(0.5), [Math.SQRT1_2, Math.SQRT1_2, 0]);
    expectVector(curve.getTangent(0.5), [-Math.SQRT1_2, Math.SQRT1_2, 0]);
    expect(curve.getLength()).toBeCloseTo(Math.PI / 2, 4);
  });

  it("returns arbitrary quotient derivatives, clamped samples and exact clipping scale", () => {
    // x(t) = 6t / (1 + 2t); derivatives are 6/(1+2t)^2,
    // -24/(1+2t)^3 and 144/(1+2t)^4.
    const curve = new NURBSCurve(1, linear, [point(0, 0, 0), point(2, 0, 0, 3)]);
    for (const t of [0, 0.2, 0.5, 1]) {
      const d = 1 + 2 * t;
      const derivatives = curve.getDerivatives(t, 3);
      expectVector(derivatives[0]!, [6 * t / d, 0, 0]);
      expectVector(derivatives[1]!, [6 / d ** 2, 0, 0]);
      expectVector(derivatives[2]!, [-24 / d ** 3, 0, 0]);
      expectVector(derivatives[3]!, [144 / d ** 4, 0, 0]);
    }
    expectVector(curve.getPoint(-3), [0, 0, 0]);
    expectVector(curve.getPoint(5), [2, 0, 0]);
    const clipped = new NURBSCurve(1, [2, 2, 6, 6], [point(0, 0, 0), point(4, 0, 0)], { range: [3, 5] });
    expect(clipped.domain).toEqual([2, 6]);
    expect(clipped.range).toEqual([3, 5]);
    expectVector(clipped.getPoint(0.5), [2, 0, 0]);
    expectVector(clipped.getDerivative(0.5), [2, 0, 0]);
    expectVector(clipped.clone().getPoint(1), [3, 0, 0]);
  });

  it("is invariant to common, extreme finite weight scales and retains endpoint support", () => {
    // Scaling every homogeneous weight leaves the same Cartesian spline.
    // Closed-form expectations below are independent of the implementation.
    for (const weight of [1, 1e308, 1e-320]) {
      const curve = new NURBSCurve(1, linear, [point(0.00001, 0, 0, weight), point(0.00003, 0, 0, weight)]);
      expectVector(curve.getPoint(0.5), [0.00002, 0, 0], 1e-12);
      expectVector(curve.getDerivative(0.5), [0.00002, 0, 0], 1e-12);
      const largeCoordinates = new NURBSCurve(1, linear, [point(0, 0, 0, weight), point(2, 0, 0, weight)]);
      expectVector(largeCoordinates.getPoint(1), [2, 0, 0]);
    }
    const contrast = new NURBSCurve(1, linear, [point(1, 0, 0, 1e308), point(2, 0, 0, 1e-308)]);
    expectVector(contrast.getPoint(0), [1, 0, 0]);
    expectVector(contrast.getPoint(1), [2, 0, 0]);
    const tinyPosition = new NURBSCurve(1, linear, [point(1e-50, 0, 0, 1e-308), point(1e-50, 0, 0, 1e308)]);
    expect(tinyPosition.getPoint(1e-300).x / 1e-50).toBeCloseTo(1, 12);
  });

  it("differentiates in normalized coordinates for very large and very small knot domains", () => {
    // The quadratic polynomial x = 2t(1 - t) is independent of the units
    // chosen for its knots, as are derivatives with respect to normalized t.
    for (const end of [1e-200, 1, 1e200]) {
      const curve = new NURBSCurve(2, [0, 0, 0, end, end, end], [point(0, 0, 0), point(1, 0, 0), point(0, 0, 0)]);
      const derivatives = curve.getDerivatives(0.4, 3);
      expectVector(derivatives[0]!, [0.48, 0, 0]);
      expectVector(derivatives[1]!, [0.4, 0, 0]);
      expectVector(derivatives[2]!, [-4, 0, 0]);
      expectVector(derivatives[3]!, [0, 0, 0]);
    }
  });

  it("uses nonuniform knots, with right-sided derivatives at internal seams", () => {
    const curve = new NURBSCurve(1, [0, 0, 2, 5, 5], [point(0, 0, 0), point(2, 0, 0), point(6, 0, 0)]);
    expectVector(curve.getPoint(0.2), [1, 0, 0]);
    expectVector(curve.getPoint(0.4), [2, 0, 0]);
    expectVector(curve.getPoint(1), [6, 0, 0]);
    expectVector(curve.getDerivative(0.2), [5, 0, 0]);
    expectVector(curve.getDerivative(0.4), [20 / 3, 0, 0]);
    expectVector(curve.getDerivative(1), [20 / 3, 0, 0]);
    const beforeSeam = new NURBSCurve(1, [0, 0, 2, 5, 5], [point(0, 0, 0), point(2, 0, 0), point(6, 0, 0)], { range: [0, 2] });
    expectVector(beforeSeam.getPoint(1), [2, 0, 0]);
    expectVector(beforeSeam.getDerivative(1), [2, 0, 0]);
    const brokenKnots = [0, 0, 1, 1, 2, 2];
    const brokenPoints = [point(0, 0, 0), point(2, 0, 0), point(5, 0, 0), point(6, 0, 0)];
    const full = new NURBSCurve(1, brokenKnots, brokenPoints);
    const first = new NURBSCurve(1, brokenKnots, brokenPoints, { range: [0, 1] });
    const second = new NURBSCurve(1, brokenKnots, brokenPoints, { range: [1, 2] });
    expectVector(full.getPoint(0.5), [5, 0, 0]);
    expectVector(first.getPoint(1), [2, 0, 0]);
    expectVector(second.getPoint(0), [5, 0, 0]);
  });

  it("evaluates unclamped endpoints and degree-zero spans", () => {
    // On the active interval, this uniform quadratic has x(t) = (1 + t)^2.
    const unclamped = new NURBSCurve(2, [0, 1, 2, 3, 4, 5], [point(0, 0, 0), point(2, 0, 0), point(6, 0, 0)]);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expectVector(unclamped.getPoint(t), [(1 + t) ** 2, 0, 0]);
      expectVector(unclamped.getDerivative(t), [2 + 2 * t, 0, 0]);
    }
    const piecewiseConstant = new NURBSCurve(0, [0, 1, 3], [point(1, 2, 3), point(4, 5, 6)]);
    expectVector(piecewiseConstant.getPoint(0), [1, 2, 3]);
    expectVector(piecewiseConstant.getPoint(1 / 3), [4, 5, 6]);
    expectVector(piecewiseConstant.getPoint(1), [4, 5, 6]);
    expectVector(piecewiseConstant.getDerivative(0.5), [0, 0, 0]);
  });

  it("joins rational quadratic circle segments at the closed seam", () => {
    const w = Math.SQRT1_2;
    const curve = new NURBSCurve(2, [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [
      point(1, 0, 0), point(1, 1, 0, w), point(0, 1, 0), point(-1, 1, 0, w),
      point(-1, 0, 0), point(-1, -1, 0, w), point(0, -1, 0), point(1, -1, 0, w), point(1, 0, 0)
    ]);
    expectVector(curve.getPoint(0), [1, 0, 0]);
    expectVector(curve.getPoint(1), [1, 0, 0]);
    expectVector(curve.getTangent(0), [0, 1, 0]);
    expectVector(curve.getTangent(1), [0, 1, 0]);
    for (const t of [0.25, 0.5, 0.75]) expect(curve.getPoint(t).length()).toBeCloseTo(1, 12);
    const frames = curve.computeFrenetFrames(32, true)!;
    for (let i = 0; i <= 32; i += 1) {
      expect(frames.tangents[i]!.length()).toBeCloseTo(1, 10);
      expect(frames.normals[i]!.length()).toBeCloseTo(1, 10);
      expect(frames.tangents[i]!.dot(frames.normals[i]!)).toBeCloseTo(0, 10);
    }
    expectVector(frames.normals[0]!.subtract(frames.normals[32]!), [0, 0, 0], 1e-6);
    const spaced = curve.getSpacedPoints(8);
    const chord = Math.sqrt(2 - Math.SQRT2);
    for (let i = 1; i < spaced.length; i += 1) expect(spaced[i]!.distanceTo(spaced[i - 1]!)).toBeCloseTo(chord, 3);
  });

  it("evaluates weighted surfaces and their mixed partials", () => {
    // A product of two weighted linear interpolants, with z = x*y.
    const surface = new NURBSSurface(1, 1, linear, linear, [
      [point(0, 0, 0), point(0, 3, 0, 2)],
      [point(2, 0, 0, 3), point(2, 3, 6, 6)]
    ]);
    const u = 0.3, v = 0.4;
    const x = 6 * u / (1 + 2 * u), y = 6 * v / (1 + v);
    const dx = 6 / (1 + 2 * u) ** 2, dy = 6 / (1 + v) ** 2;
    const d = surface.getDerivatives(u, v);
    expectVector(d[0]![0]!, [x, y, x * y]);
    expectVector(d[1]![0]!, [dx, 0, dx * y]);
    expectVector(d[0]![1]!, [0, dy, x * dy]);
    expectVector(d[1]![1]!, [0, 0, dx * dy]);
    expect(surface.getNormal(u, v).length()).toBeCloseTo(1, 12);
    expect(surface.getNormal(u, v).dot(d[1]![0]!)).toBeCloseTo(0, 10);
    expectVector(surface.clone().getPoint(u, v), [x, y, x * y]);
  });

  it("computes surface normals when tangent magnitudes would overflow or underflow their cross product", () => {
    for (const size of [1e-200, 1e200]) {
      const surface = new NURBSSurface(1, 1, linear, linear, [
        [point(0, 0, 0), point(0, size, 0)],
        [point(size, 0, 0), point(size, size, 0)]
      ]);
      expectVector(surface.getNormal(0.5, 0.5), [0, 0, 1]);
    }
  });

  it("evaluates a trilinear volume, its boundaries and partial derivatives", () => {
    const net = Array.from({ length: 2 }, (_, u) => Array.from({ length: 2 }, (_, v) =>
      Array.from({ length: 2 }, (_, w) => point(2 * u, 3 * v, 4 * w))));
    const volume = new NURBSVolume(1, 1, 1, linear, linear, linear, net, { rangeU: [0.25, 0.75] });
    expectVector(volume.getPoint(0, 0, 0), [0.5, 0, 0]);
    expectVector(volume.getPoint(1, 1, 1), [1.5, 3, 4]);
    expectVector(volume.getPoint(0.5, 0.2, 0.7), [1, 0.6, 2.8]);
    const d = volume.getDerivatives(0.5, 0.2, 0.7);
    expectVector(d[1]![0]![0]!, [1, 0, 0]);
    expectVector(d[0]![1]![0]!, [0, 3, 0]);
    expectVector(d[0]![0]![1]!, [0, 0, 4]);
    expectVector(d[1]![1]![1]!, [0, 0, 0]);
    expectVector(volume.clone().getPoint(0.5, 0.2, 0.7), [1, 0.6, 2.8]);
  });

  it("keeps surface and volume tensor products stable across weight and knot scales", () => {
    const large = [0, 0, 1e200, 1e200];
    const small = [0, 0, 1e-200, 1e-200];
    for (const weight of [1e308, 1e-320]) {
      const surface = new NURBSSurface(1, 1, large, small, [
        [point(0, 0, 0, weight), point(0, 3, 0, weight)],
        [point(2, 0, 0, weight), point(2, 3, 0, weight)]
      ]);
      const sd = surface.getDerivatives(0.25, 0.4, 2, 2);
      expectVector(sd[0]![0]!, [0.5, 1.2, 0]);
      expectVector(sd[1]![0]!, [2, 0, 0]);
      expectVector(sd[0]![1]!, [0, 3, 0]);
      expectVector(sd[2]![2]!, [0, 0, 0]);

      const net = Array.from({ length: 2 }, (_, u) => Array.from({ length: 2 }, (_, v) =>
        Array.from({ length: 2 }, (_, w) => point(2 * u, 3 * v, 4 * w, weight))));
      const volume = new NURBSVolume(1, 1, 1, large, small, linear, net);
      const vd = volume.getDerivatives(0.25, 0.4, 0.75);
      expectVector(vd[0]![0]![0]!, [0.5, 1.2, 3]);
      expectVector(vd[1]![0]![0]!, [2, 0, 0]);
      expectVector(vd[0]![1]![0]!, [0, 3, 0]);
      expectVector(vd[0]![0]![1]!, [0, 0, 4]);
      expectVector(vd[1]![1]![1]!, [0, 0, 0]);
    }
  });

  it("evaluates mixed derivatives of a weighted volume", () => {
    // Separable projective coordinates with z = x*y*w and nonuniform weights.
    const net = Array.from({ length: 2 }, (_, i) => Array.from({ length: 2 }, (_, j) =>
      Array.from({ length: 2 }, (_, k) => point(i, j, i * j * k, (i ? 3 : 1) * (j ? 2 : 1) * (k ? 4 : 1)))));
    const volume = new NURBSVolume(1, 1, 1, linear, linear, linear, net);
    const u = 0.3, v = 0.4, w = 0.2;
    const x = 3 * u / (1 + 2 * u), y = 2 * v / (1 + v), z = 4 * w / (1 + 3 * w);
    const dx = 3 / (1 + 2 * u) ** 2, dy = 2 / (1 + v) ** 2, dz = 4 / (1 + 3 * w) ** 2;
    const d = volume.getDerivatives(u, v, w);
    expectVector(d[0]![0]![0]!, [x, y, x * y * z]);
    expectVector(d[1]![1]![1]!, [0, 0, dx * dy * dz]);
    expectVector(d[1]![0]![1]!, [0, 0, dx * y * dz]);
  });

  it("agrees with finite differences on nonseparable control-net weights", () => {
    const surface = new NURBSSurface(2, 1, [0, 0, 0, 1, 1, 1], linear, [
      [point(0, 1, 0, 1), point(0, 2, 1, 2)],
      [point(1, 0, 2, 3), point(2, 2, 1, 0.5)],
      [point(2, 1, -1, 2), point(3, 3, 2, 4)]
    ]);
    const net = Array.from({ length: 2 }, (_, i) => Array.from({ length: 2 }, (_, j) =>
      Array.from({ length: 2 }, (_, k) => point(i + j * k, j - i * k, k + i * j, 1 + 2 * i + j * (1 + k)))));
    const volume = new NURBSVolume(1, 1, 1, linear, linear, linear, net);
    const u = 0.37, v = 0.42, w = 0.23, h = 1e-4;
    const surfaceD = surface.getDerivatives(u, v);
    const surfaceDU = surface.getPoint(u + h, v).subtract(surface.getPoint(u - h, v)).divideScalar(2 * h);
    const surfaceDUV = surface.getPoint(u + h, v + h).subtract(surface.getPoint(u + h, v - h))
      .subtract(surface.getPoint(u - h, v + h)).add(surface.getPoint(u - h, v - h)).divideScalar(4 * h * h);
    expect(surfaceD[1]![0]!.distanceTo(surfaceDU)).toBeLessThan(1e-6);
    expect(surfaceD[1]![1]!.distanceTo(surfaceDUV)).toBeLessThan(1e-6);
    const volumeD = volume.getDerivatives(u, v, w);
    const volumeDW = volume.getPoint(u, v, w + h).subtract(volume.getPoint(u, v, w - h)).divideScalar(2 * h);
    const volumeDUV = volume.getPoint(u + h, v + h, w).subtract(volume.getPoint(u + h, v - h, w))
      .subtract(volume.getPoint(u - h, v + h, w)).add(volume.getPoint(u - h, v - h, w)).divideScalar(4 * h * h);
    expect(volumeD[0]![0]![1]!.distanceTo(volumeDW)).toBeLessThan(1e-6);
    expect(volumeD[1]![1]![0]!.distanceTo(volumeDUV)).toBeLessThan(1e-6);
  });

  it("preserves input snapshots and reports invalid or singular data", () => {
    const knots = [0, 0, 1, 1];
    const controls = [point(0, 0, 0), point(1, 0, 0)];
    const curve = new NURBSCurve(1, knots, controls);
    knots[2] = 0.5;
    controls[1]!.x = 99;
    expectVector(curve.getPoint(1), [1, 0, 0]);
    expect(() => new NURBSCurve(1, [0, 0, 1], controls)).toThrow(/knot vector/i);
    expect(() => new NURBSCurve(2, linear, controls)).toThrow(/degree/i);
    expect(() => new NURBSCurve(1, [0, 0, 2, 1], controls)).toThrow(/nondecreasing/i);
    expect(() => new NURBSCurve(1, [0, 0, 0, 1, 1], [point(0, 0, 0), point(1, 0, 0), point(2, 0, 0)])).toThrow(/degree \+ 1/i);
    expect(() => new NURBSCurve(1, linear, controls, { range: [-1, 1] })).toThrow(/clipping range/i);
    expect(() => new NURBSCurve(1, linear, controls, { range: [0.5, 0.5] })).toThrow(/clipping range/i);
    expect(() => new NURBSCurve(1, linear, [point(0, 0, 0), point(1, Number.NaN, 0)])).toThrow(/finite/i);
    expect(() => new NURBSCurve(1, linear, [point(0, 0, 0, 0), point(1, 0, 0, 0)]).getPoint(0.5)).toThrow(/denominator/i);
    expect(() => new NURBSCurve(1, linear, [point(0, 0, 0, 1), point(1, 0, 0, -1)]).getPoint(0.5)).toThrow(/denominator/i);
    const tiny = new NURBSCurve(1, linear, [point(0, 0, 0, 1e-100), point(2, 0, 0, 3e-100)]);
    expectVector(tiny.getPoint(0.5), [1.5, 0, 0]);
    const scaledNegative = new NURBSCurve(1, linear, [point(0, 0, 0, -1), point(2, 0, 0, -3)]);
    expectVector(scaledNegative.getPoint(0.5), [1.5, 0, 0]);
    const zeroWeight = new NURBSCurve(1, linear, [point(10, 0, 0, 0), point(2, 0, 0, 1)]);
    expectVector(zeroWeight.getPoint(0.5), [2, 0, 0]);
    expect(() => zeroWeight.getPoint(0)).toThrow(/denominator/i);
    expect(() => curve.getPoint(Number.NaN)).toThrow(/finite/i);
    expect(() => curve.getDerivatives(0.5, 17)).toThrow(/orders/i);
    expect(() => new NURBSSurface(1, 1, linear, linear, [[point(0, 0, 0)], [point(0, 0, 0), point(0, 0, 0)]])).toThrow(/rectangular/i);
    expect(() => new NURBSVolume(1, 1, 1, linear, linear, linear, [[[point(0, 0, 0)]], []])).toThrow(/rectangular/i);
    const flat = new NURBSSurface(1, 1, linear, linear, [[point(1, 1, 1), point(1, 1, 1)], [point(1, 1, 1), point(1, 1, 1)]]);
    expectVector(flat.getNormal(0.5, 0.5), [0, 0, 0]);
  });
});
