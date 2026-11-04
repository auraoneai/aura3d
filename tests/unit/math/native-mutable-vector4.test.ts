import { describe, expect, it, vi } from "vitest";
import { Vector4 } from "../../../packages/math/src/independent/mutable/Vector4.js";
import { Vector4 as ImmutableVector4 } from "../../../packages/math/src/Vector4.js";

const vec = (v: Vector4) => [v.x, v.y, v.z, v.w];

function expectClose(actual: readonly number[], expected: readonly number[], precision = 11) {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i += 1) expect(actual[i]).toBeCloseTo(expected[i], precision);
}

// Rodrigues' formula gives an independent 3x3 rotation matrix, embedded in
// a column-major homogeneous matrix with a nontrivial translation.
function rotationMatrix(axis: readonly [number, number, number], angle: number) {
  const [x, y, z] = axis;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return { elements: [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0,
    4, -2, 7, 1
  ] };
}

describe("independent mutable Vector4", () => {
  it("initializes components and exposes width and height as aliases", () => {
    const v = new Vector4();
    expect(vec(v)).toEqual([0, 0, 0, 1]);
    expect(v.isVector4).toBe(true);
    expect(v.set(2, 3, 4, 5)).toBe(v);
    expect([v.width, v.height]).toEqual([4, 5]);
    v.width = -2; v.height = 7;
    expect(vec(v)).toEqual([2, 3, -2, 7]);
    expect(v.setScalar(8).setX(1).setY(2).setZ(3).setW(4)).toBe(v);
    expect(vec(v)).toEqual([1, 2, 3, 4]);
  });

  it("gets and sets all components and rejects invalid indices", () => {
    const v = new Vector4();
    for (let i = 0; i < 4; i += 1) expect(v.setComponent(i, 10 + i)).toBe(v);
    expect([0, 1, 2, 3].map(i => v.getComponent(i))).toEqual([10, 11, 12, 13]);
    for (const index of [-1, 4, 0.5, NaN]) {
      expect(() => v.setComponent(index, 1)).toThrow(RangeError);
      expect(() => v.getComponent(index)).toThrow(RangeError);
    }
    expect(vec(v)).toEqual([10, 11, 12, 13]);
  });

  it("copies structural values and converts without sharing mutable state", () => {
    const v = new Vector4().copy({ x: 2, y: 3, z: 4 });
    expect(vec(v)).toEqual([2, 3, 4, 1]);
    const original = { x: -1, y: 5, z: 2, w: 0 };
    expect(v.fromImmutable(original)).toBe(v);
    const immutable = v.toImmutable();
    expect(immutable).toBeInstanceOf(ImmutableVector4);
    expect([immutable.x, immutable.y, immutable.z, immutable.w]).toEqual([-1, 5, 2, 0]);
    v.setScalar(9);
    expect([immutable.x, immutable.y, immutable.z, immutable.w]).toEqual([-1, 5, 2, 0]);
    expect(original).toEqual({ x: -1, y: 5, z: 2, w: 0 });
  });

  it("clones independently and retains a derived constructor", () => {
    class ExtendedVector extends Vector4 {}
    const a = new ExtendedVector(1, 2, 3, 4);
    const b = a.clone();
    expect(b).toBeInstanceOf(ExtendedVector);
    expect(b).not.toBe(a);
    b.setX(9);
    expect(vec(a)).toEqual([1, 2, 3, 4]);
    expect(vec(b)).toEqual([9, 2, 3, 4]);
  });

  it("performs component arithmetic in place and permits either input to alias the target", () => {
    const a = new Vector4(1, -2, 3, -4), b = new Vector4(2, 4, -6, -8);
    expect(a.clone().add(b).toArray()).toEqual([3, 2, -3, -12]);
    expect(a.clone().addScalar(2).toArray()).toEqual([3, 0, 5, -2]);
    expect(a.clone().sub(b).toArray()).toEqual([-1, -6, 9, 4]);
    expect(a.clone().subScalar(2).toArray()).toEqual([-1, -4, 1, -6]);
    expect(a.clone().addScaledVector(b, 0.5).toArray()).toEqual([2, 0, 0, -8]);
    expect(a.clone().multiply(b).toArray()).toEqual([2, -8, -18, 32]);
    expect(b.clone().divide(a).toArray()).toEqual([2, -2, -2, 2]);
    expect(a.clone().multiplyScalar(-2).divideScalar(2).toArray()).toEqual([-1, 2, -3, 4]);
    expect(a.clone().add(a).toArray()).toEqual([2, -4, 6, -8]);
    const first = a.clone();
    expect(first.addVectors(first, b)).toBe(first);
    expect(first.toArray()).toEqual([3, 2, -3, -12]);
    const second = b.clone();
    expect(second.subVectors(a, second)).toBe(second);
    expect(second.toArray()).toEqual([-1, -6, 9, 4]);
    const same = a.clone();
    expect(same.addScaledVector(same, -1).toArray()).toEqual([0, 0, 0, 0]);
  });

  it("uses IEEE division for zero divisors", () => {
    const v = new Vector4(1, -1, 0, 2).divide(new Vector4(0, 0, 0, 2));
    expect(v.x).toBe(Infinity);
    expect(v.y).toBe(-Infinity);
    expect(v.z).toBeNaN();
    expect(v.w).toBe(1);
  });

  it("applies all four rows of a column-major homogeneous matrix", () => {
    // Multiplication by these explicit rows maps (1,2,3,4) to (30,70,110,150).
    const matrix = { elements: new Float64Array([
      1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16
    ]) };
    const v = new Vector4(1, 2, 3, 4);
    expect(v.applyMatrix4(matrix)).toBe(v);
    expect(v.toArray()).toEqual([30, 70, 110, 150]);
    expect(new Vector4().setFromMatrixPosition(matrix).toArray()).toEqual([4, 8, 12, 16]);
    const translated = rotationMatrix([0, 0, 1], 0);
    expect(new Vector4(1, 2, 3, 1).applyMatrix4(translated).toArray()).toEqual([5, 0, 10, 1]);
    expect(new Vector4(1, 2, 3, 0).applyMatrix4(translated).toArray()).toEqual([1, 2, 3, 0]);
  });

  it("extracts a quaternion axis and angle, including scaled and degenerate quaternions", () => {
    const v = new Vector4();
    expect(v.setAxisAngleFromQuaternion({ x: 0, y: 0, z: 0, w: 1 })).toBe(v);
    expect(v.toArray()).toEqual([1, 0, 0, 0]);
    expect(v.setAxisAngleFromQuaternion({ x: 0, y: 0, z: 0, w: 0 }).toArray()).toEqual([1, 0, 0, 0]);
    expectClose(v.setAxisAngleFromQuaternion({ x: 0, y: 0, z: 0, w: -1 }).toArray(), [1, 0, 0, 2 * Math.PI]);
    const halfAngle = Math.PI / 6;
    expectClose(v.setAxisAngleFromQuaternion({ x: 0, y: 2 * Math.sin(halfAngle), z: 0, w: 2 * Math.cos(halfAngle) }).toArray(), [0, 1, 0, Math.PI / 3]);
    expectClose(v.setAxisAngleFromQuaternion({ x: -1, y: -2, z: 2, w: 0 }).toArray(), [-1 / 3, -2 / 3, 2 / 3, Math.PI]);
    for (const scale of [1e-310, 1e308]) {
      expectClose(v.setAxisAngleFromQuaternion({ x: scale, y: -scale, z: scale, w: scale }).toArray(),
        [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3), 2 * Math.PI / 3]);
    }
  });

  it("extracts ordinary, identity and half-turn matrix rotations as equivalent matrices", () => {
    const axes: [number, number, number][] = [
      [1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, -2 / 3, 2 / 3], [-2 / 3, 1 / 3, 2 / 3]
    ];
    const angles = [0, 1e-8, 0.4, Math.PI / 2, Math.PI - 1e-7, Math.PI];
    for (const axis of axes) {
      for (const angle of angles) {
        const matrix = rotationMatrix(axis, angle);
        const v = new Vector4();
        expect(v.setAxisAngleFromRotationMatrix(matrix)).toBe(v);
        if (angle === 1e-8) {
          // unified 4.x contract: a matrix within 0.1 of the identity reports the +x axis and angle 0.
          expect(v.toArray()).toEqual([1, 0, 0, 0]);
          continue;
        }
        if (angle === Math.PI - 1e-7) {
          // unified 4.x contract: a near-symmetric matrix (within 0.01) is a half turn, angle exactly pi.
          expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 6);
          expect(v.w).toBeCloseTo(Math.PI, 10);
          continue;
        }
        expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 10);
        expect(v.w).toBeCloseTo(angle, 10);
        const rebuilt = rotationMatrix([v.x, v.y, v.z], v.w);
        for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
          expect(rebuilt.elements[index]).toBeCloseTo(matrix.elements[index], 9);
        }
      }
    }
  });

  it("clamps each coordinate and constrains vector length without inventing a direction", () => {
    const v = new Vector4(-2, 3, 5, -8);
    expect(v.clone().min(new Vector4(-3, 4, 2, -7)).toArray()).toEqual([-3, 3, 2, -8]);
    expect(v.clone().max(new Vector4(-3, 4, 2, -7)).toArray()).toEqual([-2, 4, 5, -7]);
    expect(v.clone().clamp(new Vector4(-1, -1, -1, -1), new Vector4(1, 2, 3, 4)).toArray()).toEqual([-1, 2, 3, -1]);
    expect(v.clone().clampScalar(-2, 2).toArray()).toEqual([-2, 2, 2, -2]);
    expectClose(new Vector4(3, 4, 0, 0).clampLength(0, 2).toArray(), [1.2, 1.6, 0, 0]);
    expectClose(new Vector4(3, 4, 0, 0).clampLength(10, 20).toArray(), [6, 8, 0, 0]);
    expect(new Vector4(0, 0, 0, 0).clampLength(1, 5).toArray()).toEqual([0, 0, 0, 0]);
  });

  it("applies rounding and negation to every component", () => {
    const v = new Vector4(1.8, -1.8, 2.2, -2.2);
    expect(v.clone().floor().toArray()).toEqual([1, -2, 2, -3]);
    expect(v.clone().ceil().toArray()).toEqual([2, -1, 3, -2]);
    expect(v.clone().round().toArray()).toEqual([2, -2, 2, -2]);
    expect(v.clone().roundToZero().toArray()).toEqual([1, -1, 2, -2]);
    expect(v.clone().negate().toArray()).toEqual([-1.8, 1.8, -2.2, 2.2]);
  });

  it("computes norms and dot products and handles normalization of zero", () => {
    const v = new Vector4(1, -2, 2, -4);
    expect(v.dot(new Vector4(2, 3, 4, 5))).toBe(-16);
    expect(v.lengthSq()).toBe(25);
    expect(v.length()).toBe(5);
    expect(v.manhattanLength()).toBe(9);
    expectClose(v.clone().normalize().toArray(), [0.2, -0.4, 0.4, -0.8]);
    expectClose(v.clone().setLength(10).toArray(), [2, -4, 4, -8]);
    expect(new Vector4(0, 0, 0, 0).normalize().setLength(4).toArray()).toEqual([0, 0, 0, 0]);
  });

  it("retains finite directions when squared norms or reciprocals overflow or underflow", () => {
    for (const scale of [1e-310, 1e200]) {
      const v = new Vector4(3 * scale, 4 * scale, 0, 0);
      expect(v.length() / scale).toBeCloseTo(5, 10);
      expectClose(v.clone().normalize().toArray(), [0.6, 0.8, 0, 0], 10);
      expectClose(v.clone().setLength(10).toArray(), [6, 8, 0, 0], 9);
    }
    expect(new Vector4(1e-310, -1e-310, 0, 0).divideScalar(1e-310).toArray()).toEqual([1, -1, 0, 0]);
    const huge = new Vector4(1e308, -1e308, 1e308, -1e308);
    expect(huge.length()).toBe(Infinity);
    expect(huge.clone().normalize().toArray()).toEqual([0.5, -0.5, 0.5, -0.5]);
    expect(huge.clampLength(0, 2).toArray()).toEqual([1, -1, 1, -1]);
  });

  it("interpolates for extrapolation and for either aliased input", () => {
    const a = new Vector4(0, 2, 4, 6), b = new Vector4(4, 6, 8, 10);
    expect(a.clone().lerp(b, 0.25).toArray()).toEqual([1, 3, 5, 7]);
    expect(a.clone().lerp(b, 1.5).toArray()).toEqual([6, 8, 10, 12]);
    const first = a.clone(), second = b.clone();
    expect(first.lerpVectors(first, b, 0.25).toArray()).toEqual([1, 3, 5, 7]);
    expect(second.lerpVectors(a, second, 0.25).toArray()).toEqual([1, 3, 5, 7]);
    expect(a.equals(a.clone())).toBe(true);
    expect(a.equals(b)).toBe(false);
  });

  it("reads and writes offset arrays, attributes, and iterator values", () => {
    const v = new Vector4().fromArray(new Float32Array([99, 1, 2, 3, 4, 88]), 1);
    expect([...v]).toEqual([1, 2, 3, 4]);
    const target = [9, 9, 9, 9, 9, 9];
    expect(v.toArray(target, 1)).toBe(target);
    expect(target).toEqual([9, 1, 2, 3, 4, 9]);
    expect(v.toArray()).toEqual([1, 2, 3, 4]);
    const calls: string[] = [];
    const attribute = {
      getX: (i: number) => { calls.push(`x${i}`); return 10 + i; },
      getY: (i: number) => { calls.push(`y${i}`); return 20 + i; },
      getZ: (i: number) => { calls.push(`z${i}`); return 30 + i; },
      getW: (i: number) => { calls.push(`w${i}`); return 40 + i; }
    };
    expect(v.fromBufferAttribute(attribute, 3)).toBe(v);
    expect(v.toArray()).toEqual([13, 23, 33, 43]);
    expect(calls).toEqual(["x3", "y3", "z3", "w3"]);
  });

  it("draws one random number per component", () => {
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.1).mockReturnValueOnce(0.3).mockReturnValueOnce(0.5).mockReturnValueOnce(0.7);
    try {
      const v = new Vector4();
      expect(v.random()).toBe(v);
      expect(v.toArray()).toEqual([0.1, 0.3, 0.5, 0.7]);
      expect(random).toHaveBeenCalledTimes(4);
    } finally {
      random.mockRestore();
    }
  });
});
