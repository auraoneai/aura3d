import { describe, expect, it, vi } from "vitest";
import { Matrix3 } from "../../../packages/math/src/independent/mutable/Matrix3";
import { Vector2 } from "../../../packages/math/src/independent/mutable/Vector2";
import { Vector2 as ImmutableVector2 } from "../../../packages/math/src/Vector2";

const coordinates = (v: { x: number; y: number }) => [v.x, v.y];

function expectPoint(v: { x: number; y: number }, x: number, y: number): void {
  expect(v.x).toBeCloseTo(x, 12);
  expect(v.y).toBeCloseTo(y, 12);
}

describe("independent mutable Vector2", () => {
  it("constructs, sets and accesses coordinates and size aliases", () => {
    const v = new Vector2();
    expect(coordinates(v)).toEqual([0, 0]);
    expect(v.isVector2).toBe(true);
    expect(v.set(2, 5)).toBe(v);
    expect([v.width, v.height]).toEqual([2, 5]);
    v.width = -7;
    v.height = 9;
    expect(coordinates(v)).toEqual([-7, 9]);
    expect(v.setScalar(4).setX(6).setY(8)).toBe(v);
    expect(v.setComponent(0, 1).setComponent(1, 2)).toBe(v);
    expect([v.getComponent(0), v.getComponent(1)]).toEqual([1, 2]);
    for (const index of [-1, 2, 0.5, NaN]) {
      expect(() => v.getComponent(index)).toThrow(RangeError);
      expect(() => v.setComponent(index, 3)).toThrow(RangeError);
    }
    expect(coordinates(v)).toEqual([1, 2]);
  });

  it("copies by value and retains subclass identity when cloned", () => {
    class Marked extends Vector2 {}
    const source = new Marked(3, -4);
    const clone = source.clone();
    expect(clone).toBeInstanceOf(Marked);
    expect(clone).not.toBe(source);
    expect(coordinates(clone)).toEqual([3, -4]);
    const target = new Vector2();
    expect(target.copy(source)).toBe(target);
    source.set(8, 9);
    expect(coordinates(target)).toEqual([3, -4]);
    expect(coordinates(clone)).toEqual([3, -4]);
  });

  it("converts to and from the declared immutable vector by value", () => {
    const immutable = new ImmutableVector2(1.5, -2.5);
    const v = new Vector2();
    expect(v.fromImmutable(immutable)).toBe(v);
    const converted = v.toImmutable();
    expect(converted).toBeInstanceOf(ImmutableVector2);
    expect(coordinates(converted)).toEqual([1.5, -2.5]);
    v.set(8, 9);
    expect(coordinates(converted)).toEqual([1.5, -2.5]);
    expect(coordinates(immutable)).toEqual([1.5, -2.5]);
  });

  it("does component-wise arithmetic, including scalar operations", () => {
    const v = new Vector2(2, -6);
    expect(v.add({ x: 3, y: 4 })).toBe(v);
    expect(coordinates(v)).toEqual([5, -2]);
    v.addScalar(2).sub({ x: 3, y: 1 }).subScalar(1);
    expect(coordinates(v)).toEqual([3, -2]);
    v.multiply({ x: 4, y: -3 }).multiplyScalar(0.5);
    expect(coordinates(v)).toEqual([6, 3]);
    v.divide({ x: 2, y: -3 }).divideScalar(3);
    expect(coordinates(v)).toEqual([1, -1 / 3]);
    expect(coordinates(new Vector2(1, -2).divideScalar(0))).toEqual([Infinity, -Infinity]);
  });

  it("allows either argument to alias the result of vector arithmetic", () => {
    const a = new Vector2(1, 3);
    const b = new Vector2(4, -2);
    expect(a.addVectors(a, b)).toBe(a);
    expect(coordinates(a)).toEqual([5, 1]);
    expect(b.subVectors(a, b)).toBe(b);
    expect(coordinates(b)).toEqual([1, 3]);
    b.addScaledVector(b, 2);
    expect(coordinates(b)).toEqual([3, 9]);
    a.lerpVectors(b, a, 0.25);
    expect(coordinates(a)).toEqual([3.5, 7]);
    b.lerp(b, 0.75);
    expect(coordinates(b)).toEqual([3, 9]);
  });

  it("applies column-major affine matrices and rotates around a point", () => {
    const matrix = { elements: new Float64Array([2, 3, 0, 4, 5, 0, 6, 7, 1]) };
    const v = new Vector2(8, 9);
    expect(v.applyMatrix3(matrix)).toBe(v);
    expect(coordinates(v)).toEqual([58, 76]);
    v.set(3, 2).rotateAround({ x: 1, y: 2 }, Math.PI / 2);
    expectPoint(v, 1, 4);
    const original = v.clone();
    v.rotateAround(v, Math.PI / 3);
    expectPoint(v, original.x, original.y);
  });

  it("accepts the independent Matrix3 as a 2D affine transform", () => {
    const transform = new Matrix3().makeScale(2, 3).translate(4, 5);
    expect(coordinates(new Vector2(6, -1).applyMatrix3(transform))).toEqual([16, 2]);
  });

  it("bounds coordinates and length independently", () => {
    const v = new Vector2(-3, 7);
    v.min({ x: -2, y: 2 });
    expect(coordinates(v)).toEqual([-3, 2]);
    v.max({ x: -1, y: 3 });
    expect(coordinates(v)).toEqual([-1, 3]);
    v.set(-10, 20).clamp({ x: -2, y: 1 }, { x: 4, y: 6 });
    expect(coordinates(v)).toEqual([-2, 6]);
    v.set(-10, 20).clampScalar(-3, 5);
    expect(coordinates(v)).toEqual([-3, 5]);
    v.set(3, 4).clampLength(1, 2);
    expectPoint(v, 1.2, 1.6);
    v.clampLength(3, 7);
    expectPoint(v, 1.8, 2.4);
    v.clampLength(1, 7);
    expectPoint(v, 1.8, 2.4);
    expect(coordinates(new Vector2().clampLength(3, 5))).toEqual([0, 0]);
  });

  it("rounds toward the requested direction and negates", () => {
    expect(coordinates(new Vector2(-1.3, 1.7).floor())).toEqual([-2, 1]);
    expect(coordinates(new Vector2(-1.3, 1.7).ceil())).toEqual([-1, 2]);
    expect(coordinates(new Vector2(-1.3, 1.7).round())).toEqual([-1, 2]);
    expect(coordinates(new Vector2(-1.7, 1.7).roundToZero())).toEqual([-1, 1]);
    expect(coordinates(new Vector2(-2, 3).negate())).toEqual([2, -3]);
  });

  it("reports dot, determinant, norms and distances", () => {
    const v = new Vector2(3, 4);
    const w = new Vector2(-2, 5);
    expect(v.dot(w)).toBe(14);
    expect(v.cross(w)).toBe(23);
    expect(w.cross(v)).toBe(-23);
    expect(v.lengthSq()).toBe(25);
    expect(v.length()).toBe(5);
    expect(v.manhattanLength()).toBe(7);
    expect(v.distanceToSquared(w)).toBe(26);
    expect(v.distanceTo(w)).toBeCloseTo(Math.sqrt(26));
    expect(v.manhattanDistanceTo(w)).toBe(6);
    expect(coordinates(v)).toEqual([3, 4]);
  });

  it("normalizes, sets length, and keeps zero vectors zero", () => {
    const v = new Vector2(3, 4);
    expect(v.normalize()).toBe(v);
    expectPoint(v, 0.6, 0.8);
    expect(v.setLength(10)).toBe(v);
    expectPoint(v, 6, 8);
    const zero = new Vector2();
    expect(zero.normalize().setLength(10)).toBe(zero);
    expect(coordinates(zero)).toEqual([0, 0]);
    expect(new Vector2(1e200, -1e200).normalize().length()).toBeCloseTo(1, 14);
    expectPoint(new Vector2(1e-320, 0).setLength(1), 1, 0);
    expectPoint(new Vector2(0, 1e-320).clampLength(1, 2), 0, 1);
  });

  it("uses counterclockwise radians and defines the zero-vector angle", () => {
    expect(new Vector2(1, 0).angle()).toBe(0);
    expect(new Vector2(0, 1).angle()).toBeCloseTo(Math.PI / 2);
    expect(new Vector2(-1, 0).angle()).toBeCloseTo(Math.PI);
    expect(new Vector2(0, -1).angle()).toBeCloseTo(3 * Math.PI / 2);
    expect(new Vector2(1, 0).angleTo(new Vector2(-1, 0))).toBeCloseTo(Math.PI);
    expect(new Vector2(1, 0).angleTo(new Vector2(0, 1))).toBeCloseTo(Math.PI / 2);
    expect(new Vector2().angleTo(new Vector2(1, 0))).toBe(Math.PI / 2);
    expect(new Vector2(1, 0).angleTo(new Vector2())).toBe(Math.PI / 2);
  });

  it("interpolates and extrapolates without changing the source", () => {
    const source = new Vector2(2, 6);
    const target = new Vector2(10, -2);
    const out = source.clone();
    expect(out.lerp(target, 0.25)).toBe(out);
    expect(coordinates(out)).toEqual([4, 4]);
    expect(out.lerpVectors(source, target, 1.5)).toBe(out);
    expect(coordinates(out)).toEqual([14, -6]);
    expect(coordinates(source)).toEqual([2, 6]);
    expect(coordinates(target)).toEqual([10, -2]);
    expect(out.equals({ x: 14, y: -6 })).toBe(true);
    expect(out.equals({ x: 14, y: -5 })).toBe(false);
  });

  it("reads and writes arrays at offsets and reads buffer attributes", () => {
    const v = new Vector2();
    expect(v.fromArray(new Float32Array([99, 2, 4, 88]), 1)).toBe(v);
    expect(coordinates(v)).toEqual([2, 4]);
    const array = [10, 11, 12, 13, 14];
    expect(v.toArray(array, 2)).toBe(array);
    expect(array).toEqual([10, 11, 2, 4, 14]);
    expect(v.toArray()).toEqual([2, 4]);
    const seen: string[] = [];
    const attribute = {
      getX(index: number) { seen.push(`x${index}`); return index * 2; },
      getY(index: number) { seen.push(`y${index}`); return index * 3; },
    };
    expect(v.fromBufferAttribute(attribute, 5)).toBe(v);
    expect(coordinates(v)).toEqual([10, 15]);
    expect(seen).toEqual(["x5", "y5"]);
  });

  it("draws one random sample per coordinate and iterates x then y", () => {
    const random = vi.spyOn(Math, "random").mockReturnValueOnce(0.125).mockReturnValueOnce(0.875);
    try {
      const v = new Vector2();
      expect(v.random()).toBe(v);
      expect([...v]).toEqual([0.125, 0.875]);
      expect(random).toHaveBeenCalledTimes(2);
    } finally {
      random.mockRestore();
    }
  });

  it("preserves algebraic invariants over a deterministic range of vectors", () => {
    for (let i = 1; i <= 100; i++) {
      const a = new Vector2(Math.sin(i) * 7, Math.cos(i * 2) * 5);
      const b = new Vector2(Math.cos(i * 3) * 4, Math.sin(i * 5) * 6);
      const sum = a.clone().add(b);
      expectPoint(sum.clone().sub(b), a.x, a.y);
      expect(a.dot(b)).toBeCloseTo(b.dot(a), 12);
      expect(a.cross(b)).toBeCloseTo(-b.cross(a), 12);
      expect(a.distanceTo(b)).toBeCloseTo(b.distanceTo(a), 12);
      const rotated = a.clone().rotateAround({ x: 0, y: 0 }, 0.73);
      expect(rotated.length()).toBeCloseTo(a.length(), 12);
      rotated.rotateAround({ x: 0, y: 0 }, -0.73);
      expectPoint(rotated, a.x, a.y);
    }
  });
});
