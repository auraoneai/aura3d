import { describe, expect, it } from "vitest";
import { Box3, Ray, Sphere, Vector3 } from "@aura3d/math";

const v = (x: number, y: number, z = 0): Vector3 => new Vector3(x, y, z);

describe("immutable ray box and sphere intersections", () => {
  it.each([1, -1])("hits a distant slab with a shallow nonzero direction (%s)", (sign) => {
    const ray = new Ray(v(0, 0), v(sign * 1e-13, 1));
    const box = sign > 0
      ? new Box3(v(1, 1e13, -1), v(2, 2e13, 1))
      : new Box3(v(-2, 1e13, -1), v(-1, 2e13, 1));

    const point = ray.intersectBox(box);
    expect(point).toBeDefined();
    expect(point!.x).toBeCloseTo(sign, 12);
    expect(point!.y).toBeCloseTo(1e13, 0);
    expect(point!.z).toBe(0);
    expect(ray.intersectsBox(box)).toBe(true);
  });

  it("keeps a subnormal nonzero direction and a zero slab offset finite", () => {
    const ray = new Ray(v(0, 0), v(Number.MIN_VALUE, 1));
    const box = new Box3(v(0, 1, -1), v(Number.MIN_VALUE, 2, 1));

    const point = ray.intersectBox(box);
    expect(point).toBeDefined();
    expect(point!.x).toBe(Number.MIN_VALUE);
    expect(point!.y).toBe(1);
    expect(point!.z).toBe(0);
    expect(ray.intersectsBox(box)).toBe(true);
  });

  it("does not treat a subnormal direction as parallel to a zero-width slab", () => {
    const ray = new Ray(v(0, 0), v(Number.MIN_VALUE, 1));
    const box = new Box3(v(0, 1, -1), v(0, 2, 1));
    expect(ray.intersectBox(box)).toBeUndefined();
    expect(ray.intersectsBox(box)).toBe(false);
  });

  it("preserves parallel misses, inside exits, surface contacts and behind-ray misses", () => {
    const box = new Box3(v(-1, -1, -1), v(1, 1, 1));
    expect(new Ray(v(2, 0), v(0, 1)).intersectBox(box)).toBeUndefined();
    expect(new Ray(v(0, 0), v(1, 0)).intersectBox(box)).toEqual(v(1, 0));
    expect(new Ray(v(-1, 0), v(-1, 0)).intersectBox(box)?.x).toBe(-1);
    expect(new Ray(v(2, 0), v(1, 0)).intersectBox(box)).toBeUndefined();
    expect(new Ray(v(0, 0), v(1, 0)).intersectBox(Box3.empty())).toBeUndefined();
  });

  it("treats an empty sphere as a miss while preserving zero-radius point hits", () => {
    const ray = new Ray(v(0, 0), v(1, 0));
    const empty = new Sphere(v(3, 0), -1);
    const point = new Sphere(v(3, 0), 0);
    const missedPoint = new Sphere(v(3, 1), 0);

    expect(ray.intersectSphere(empty)).toBeUndefined();
    expect(ray.intersectsSphere(empty)).toBe(false);
    expect(ray.intersectSphere(point)).toEqual(v(3, 0));
    expect(ray.intersectsSphere(point)).toBe(true);
    expect(ray.intersectSphere(missedPoint)).toBeUndefined();
    expect(ray.intersectsSphere(missedPoint)).toBe(false);
  });
});
