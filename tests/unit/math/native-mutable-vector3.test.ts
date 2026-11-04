import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "../../../packages/math/src/independent/mutable/Vector3.js";

const closeVector = (v: { x: number; y: number; z: number }, expected: readonly number[]) => {
  expect(v.x).toBeCloseTo(expected[0], 12);
  expect(v.y).toBeCloseTo(expected[1], 12);
  expect(v.z).toBeCloseTo(expected[2], 12);
};

const identity4 = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };

afterEach(() => vi.restoreAllMocks());

describe("independent mutable Vector3", () => {
  it("constructs, mutates components, copies, clones, and converts values", () => {
    const v = new Vector3();
    expect([...v]).toEqual([0, 0, 0]);
    expect(v.isVector3).toBe(true);
    expect(v.set(1, 2, 3)).toBe(v);
    expect(v.set(4, 5)).toBe(v);
    expect([...v]).toEqual([4, 5, 3]);
    expect(v.setScalar(2).setX(3).setY(4).setZ(5)).toBe(v);
    for (let i = 0; i < 3; i++) expect(v.getComponent(i)).toBe(i + 3);
    expect(v.setComponent(1, -7)).toBe(v);
    expect([...v]).toEqual([3, -7, 5]);
    for (const index of [-1, 3, 1.5, NaN]) {
      expect(() => v.getComponent(index)).toThrow(RangeError);
      expect(() => v.setComponent(index, 9)).toThrow(RangeError);
    }
    expect([...v]).toEqual([3, -7, 5]);
    const original = { x: 8, y: 9, z: 10 };
    expect(v.copy(original)).toBe(v);
    const copy = v.clone();
    expect(copy).not.toBe(v);
    expect(copy.equals(v)).toBe(true);
    v.fromImmutable({ x: -1, y: 2, z: -3 });
    expect([...copy]).toEqual([8, 9, 10]);
    const immutable = v.toImmutable();
    v.setScalar(4);
    expect([immutable.x, immutable.y, immutable.z]).toEqual([-1, 2, -3]);
    expect(immutable.toArray()).toEqual([-1, 2, -3]);
    class ExtendedVector extends Vector3 {}
    expect(new ExtendedVector(1, 2, 3).clone()).toBeInstanceOf(ExtendedVector);
  });

  it("supports arithmetic, scalar operations, and aliased operands", () => {
    const v = new Vector3(1, 2, 3);
    expect(v.add({ x: 2, y: 3, z: 4 }).addScalar(1).subScalar(2)).toBe(v);
    expect([...v]).toEqual([2, 4, 6]);
    expect(v.sub({ x: 1, y: 2, z: 3 }).multiply({ x: 2, y: 3, z: 4 })).toBe(v);
    expect([...v]).toEqual([2, 6, 12]);
    expect(v.divide({ x: 2, y: 3, z: 4 }).multiplyScalar(2).divideScalar(2)).toBe(v);
    expect([...v]).toEqual([1, 2, 3]);
    expect(v.addScaledVector({ x: 2, y: -1, z: 1 }, 3)).toBe(v);
    expect([...v]).toEqual([7, -1, 6]);
    expect(v.addVectors(v, { x: 1, y: 2, z: 3 })).toBe(v);
    expect([...v]).toEqual([8, 1, 9]);
    expect(v.subVectors({ x: 10, y: 11, z: 12 }, v)).toBe(v);
    expect([...v]).toEqual([2, 10, 3]);
    expect(v.multiplyVectors({ x: 3, y: 2, z: 4 }, v)).toBe(v);
    expect([...v]).toEqual([6, 20, 12]);
    expect(v.addScaledVector(v, 0.5)).toBe(v);
    expect([...v]).toEqual([9, 30, 18]);
    const ieee = new Vector3(1, 0, -1).divideScalar(0);
    expect(ieee.x).toBe(Infinity);
    expect(ieee.y).toBeNaN();
    expect(ieee.z).toBe(-Infinity);
  });

  it("clamps, rounds, negates, and handles zero lengths", () => {
    const v = new Vector3(-2.8, 0.5, 3.2);
    expect(v.clone().min({ x: 0, y: 0, z: 0 }).toArray()).toEqual([-2.8, 0, 0]);
    expect(v.clone().max({ x: 0, y: 0, z: 0 }).toArray()).toEqual([0, 0.5, 3.2]);
    expect(v.clone().clamp({ x: -2, y: -1, z: 0 }, { x: 2, y: 0, z: 3 }).toArray()).toEqual([-2, 0, 3]);
    expect(v.clone().clampScalar(-1, 1).toArray()).toEqual([-1, 0.5, 1]);
    expect(v.clone().floor().toArray()).toEqual([-3, 0, 3]);
    expect(v.clone().ceil().toArray()).toEqual([-2, 1, 4]);
    expect(v.clone().round().toArray()).toEqual([-3, 1, 3]);
    expect(v.clone().roundToZero().toArray()).toEqual([-2, 0, 3]);
    expect(v.clone().negate().toArray()).toEqual([2.8, -0.5, -3.2]);
    closeVector(new Vector3(3, 4, 0).clampLength(1, 2), [1.2, 1.6, 0]);
    closeVector(new Vector3(3, 4, 0).setLength(10), [6, 8, 0]);
    expect(new Vector3().normalize().clampLength(1, 2).setLength(5).toArray()).toEqual([0, 0, 0]);
  });

  it("measures distance, angle, dot product, and cross product analytically", () => {
    const a = new Vector3(1, 2, 3), b = new Vector3(4, -1, 2);
    expect(a.dot(b)).toBe(8);
    expect(a.lengthSq()).toBe(14);
    expect(a.length()).toBeCloseTo(Math.sqrt(14));
    expect(a.manhattanLength()).toBe(6);
    expect(a.distanceToSquared(b)).toBe(19);
    expect(a.distanceTo(b)).toBeCloseTo(Math.sqrt(19));
    expect(a.manhattanDistanceTo(b)).toBe(7);
    expect(new Vector3(1, 0, 0).angleTo(new Vector3(0, 1, 0))).toBeCloseTo(Math.PI / 2);
    expect(new Vector3(1, 0, 0).angleTo(new Vector3(-1, 0, 0))).toBeCloseTo(Math.PI);
    expect(new Vector3().angleTo(a)).toBe(Math.PI / 2);
    const result = a.clone();
    expect(result.crossVectors(result, b)).toBe(result);
    expect(result.toArray()).toEqual([7, 10, -9]);
    expect(result.dot(a)).toBe(0);
    expect(result.dot(b)).toBe(0);
    expect(result.cross(result).toArray()).toEqual([0, 0, 0]);
  });

  it("interpolates with aliased endpoints and preserves vector projection identities", () => {
    const v = new Vector3(2, 4, 6);
    expect(v.lerp({ x: 6, y: 0, z: 2 }, 0.25)).toBe(v);
    expect(v.toArray()).toEqual([3, 3, 5]);
    expect(v.lerpVectors({ x: 1, y: 1, z: 1 }, v, 0.5)).toBe(v);
    expect(v.toArray()).toEqual([2, 2, 3]);
    expect(v.lerpVectors(v, { x: 6, y: 8, z: 9 }, 0.5)).toBe(v);
    expect(v.toArray()).toEqual([4, 5, 6]);
    const axis = new Vector3(2, 0, 0);
    expect(v.clone().projectOnVector(axis).toArray()).toEqual([4, 0, 0]);
    expect(v.clone().projectOnPlane(axis).toArray()).toEqual([0, 5, 6]);
    expect(v.clone().reflect({ x: 0, y: 1, z: 0 }).toArray()).toEqual([4, -5, 6]);
    expect(v.clone().projectOnVector(new Vector3()).toArray()).toEqual([0, 0, 0]);
    expect(v.clone().projectOnPlane(new Vector3()).toArray()).toEqual([4, 5, 6]);
    const self = v.clone();
    closeVector(self.projectOnVector(self), [4, 5, 6]);
    closeVector(self.projectOnPlane(self), [0, 0, 0]);
  });

  it("retains directions for very large and very small finite vectors", () => {
    closeVector(new Vector3(1e300, 1e300, 0).normalize(), [Math.SQRT1_2, Math.SQRT1_2, 0]);
    closeVector(new Vector3(1e-300, 0, 0).normalize(), [1, 0, 0]);
    closeVector(new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, 0).clampLength(0, 2), [Math.SQRT2, Math.SQRT2, 0]);
    expect(new Vector3(1e-200, 0, 0).length()).toBe(1e-200);
    expect(new Vector3(1e200, 0, 0).distanceTo(new Vector3())).toBe(1e200);
    expect(new Vector3(1e200, 0, 0).angleTo(new Vector3(0, 1e-200, 0))).toBeCloseTo(Math.PI / 2);
    for (const scale of [1e-200, 1e200]) {
      const normal = new Vector3(scale, scale, 0);
      closeVector(new Vector3(3, 4, 5).projectOnVector(normal), [3.5, 3.5, 0]);
      closeVector(new Vector3(3, 4, 5).projectOnPlane(normal), [-0.5, 0.5, 5]);
    }
  });

  it("uses right-handed rotations and all Euler orders", () => {
    const ninety = Math.PI / 2;
    const vector = new Vector3(1, 0, 0);
    closeVector(vector.clone().applyAxisAngle({ x: 0, y: 0, z: 1 }, ninety), [0, 1, 0]);
    closeVector(vector.clone().applyQuaternion({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }), [0, 1, 0]);
    closeVector(vector.clone().applyEuler({ x: ninety, y: ninety, z: 0, order: "XYZ" }), [0, 1, 0]);
    closeVector(vector.clone().applyEuler({ x: ninety, y: ninety, z: 0, order: "YXZ" }), [0, 0, -1]);
    // Quarter-turns reduce to coordinate swaps and sign changes.
    const quarterTurns: Record<string, number[]> = {
      XYZ: [3, -2, 1], YXZ: [1, -3, 2], ZXY: [-1, 3, 2],
      ZYX: [3, 2, -1], YZX: [2, 1, -3], XZY: [-2, 1, 3],
    };
    for (const [order, expected] of Object.entries(quarterTurns)) {
      closeVector(new Vector3(1, 2, 3).applyEuler({ x: ninety, y: ninety, z: ninety, order }), expected);
    }
    const inverseOrder: Record<string, string> = { XYZ: "ZYX", YXZ: "ZXY", ZXY: "YXZ", ZYX: "XYZ", YZX: "XZY", XZY: "YZX" };
    for (const order of Object.keys(inverseOrder)) {
      const rotated = new Vector3(2, -3, 4).applyEuler({ x: 0.43, y: -0.72, z: 1.1, order });
      expect(rotated.length()).toBeCloseTo(Math.sqrt(29), 12);
      rotated.applyEuler({ x: -0.43, y: 0.72, z: -1.1, order: inverseOrder[order] });
      closeVector(rotated, [2, -3, 4]);
    }
    const unchanged = new Vector3(1, 2, 3);
    expect(() => unchanged.applyEuler({ x: 1, y: 2, z: 3, order: "BAD" })).toThrow(RangeError);
    expect(unchanged.toArray()).toEqual([1, 2, 3]);
  });

  it("applies column-major linear, homogeneous, normal, and directional transforms", () => {
    const v = new Vector3(1, 2, 3);
    const matrix3 = { elements: [1, 4, 7, 2, 5, 8, 3, 6, 9] };
    expect(v.clone().applyMatrix3(matrix3).toArray()).toEqual([14, 32, 50]);
    closeVector(v.clone().applyNormalMatrix({ elements: [2, 0, 0, 0, 3, 0, 0, 0, 4] }), [2 / Math.sqrt(184), 6 / Math.sqrt(184), 12 / Math.sqrt(184)]);
    const m = { elements: [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1] };
    expect(v.clone().applyMatrix4(m).toArray()).toEqual([-1, 8, 19]);
    const direction = new Vector3(1, 1, 1).transformDirection(m);
    closeVector(direction, [-3 / Math.sqrt(29), 2 / Math.sqrt(29), 4 / Math.sqrt(29)]);
    expect(new Vector3().transformDirection(m).toArray()).toEqual([0, 0, 0]);
    const projective = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1] };
    closeVector(new Vector3(2, 3, 1).applyMatrix4(projective), [1, 1.5, 0.5]);
    expect(new Vector3(2, 3, -1).applyMatrix4(projective).x).toBe(Infinity);
  });

  it("projects and unprojects through camera matrices in the correct order", () => {
    const camera = {
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, -1, 3, 1] },
      matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 1, -3, 1] },
      projectionMatrix: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1] },
      projectionMatrixInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1, 0, 0, 0, 1] },
    };
    const world = new Vector3(4, 2, 5);
    const projected = world.clone();
    expect(projected.project(camera)).toBe(projected);
    closeVector(projected, [2 / 3, 1, 2 / 3]);
    expect(projected.unproject(camera)).toBe(projected);
    closeVector(projected, world.toArray());
    closeVector(world.clone().project({ matrixWorld: identity4, matrixWorldInverse: identity4, projectionMatrix: identity4, projectionMatrixInverse: identity4 }), world.toArray());
  });

  it("extracts coordinates and matrix columns and preserves target arrays", () => {
    const v = new Vector3();
    closeVector(v.setFromSphericalCoords(2, Math.PI / 2, Math.PI / 2), [2, 0, 0]);
    closeVector(v.setFromSpherical({ radius: 3, phi: 0, theta: 1 }), [0, 3, 0]);
    closeVector(v.setFromCylindricalCoords(2, Math.PI / 2, 4), [2, 4, 0]);
    closeVector(v.setFromCylindrical({ radius: 3, theta: 0, y: -1 }), [0, -1, 3]);
    const matrix = { elements: [0, 2, 0, 0, -3, 0, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1] };
    expect(v.setFromMatrixPosition(matrix).toArray()).toEqual([5, 6, 7]);
    expect(v.setFromMatrixScale(matrix).toArray()).toEqual([2, 3, 4]);
    expect(v.setFromMatrixColumn(matrix, 1).toArray()).toEqual([-3, 0, 0]);
    expect(v.setFromMatrix3Column({ elements: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, 2).toArray()).toEqual([7, 8, 9]);
    expect(v.setFromEuler({ x: 1, y: 2, z: 3 }).toArray()).toEqual([1, 2, 3]);
    expect(v.setFromColor({ r: 0.1, g: 0.2, b: 0.3 }).toArray()).toEqual([0.1, 0.2, 0.3]);
    expect(v.fromArray(new Float64Array([99, 3, 4, 5]), 1).toArray()).toEqual([3, 4, 5]);
    const target = [10, 11, 12, 13, 14, 15];
    expect(v.toArray(target, 2)).toBe(target);
    expect(target).toEqual([10, 11, 3, 4, 5, 15]);
    expect(v.fromBufferAttribute({ getX: i => i + 1, getY: i => i + 2, getZ: i => i + 3 }, 7).toArray()).toEqual([8, 9, 10]);
  });

  it("draws random components and directions from the supplied random stream", () => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.2).mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0.5).mockReturnValueOnce(0.25).mockReturnValueOnce(1).mockReturnValueOnce(0);
    expect(new Vector3().random().toArray()).toEqual([0.1, 0.2, 0.3]);
    const equator = new Vector3().randomDirection();
    // unified 4.x contract: azimuth is drawn first, then height, and height is the y component.
    closeVector(equator, [-Math.sqrt(3) / 2, -0.5, 0]);
    expect(equator.length()).toBeCloseTo(1, 12);
    closeVector(new Vector3().randomDirection(), [0, -1, 0]);
    expect(random).toHaveBeenCalledTimes(7);
  });

  it("satisfies seeded vector identities for many nonsingular inputs", () => {
    let seed = 0x3f1ab089;
    const sample = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 * 20 - 10; };
    for (let i = 0; i < 200; i++) {
      const a = new Vector3(sample(), sample(), sample());
      const b = new Vector3(sample(), sample(), sample());
      const cross = a.clone().cross(b);
      expect(Math.abs(cross.dot(a))).toBeLessThan(1e-10);
      expect(Math.abs(cross.dot(b))).toBeLessThan(1e-10);
      const along = a.clone().projectOnVector(b);
      const plane = a.clone().projectOnPlane(b);
      expect(Math.abs(plane.dot(b))).toBeLessThan(1e-10);
      closeVector(along.add(plane), a.toArray());
      expect(a.clone().normalize().length()).toBeCloseTo(1, 12);
      closeVector(a.clone().add(b).sub(b), a.toArray());
    }
  });
});
