import { describe, expect, it } from "vitest";
import { Box3, Matrix3, Matrix4, OBB, Plane, Ray, Sphere, Vector3 } from "../../../packages/math/src/index";
import { OBB as IndependentOBB } from "../../../packages/math/src/independent/OrientedBox";

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// These are compile-time checks on the public barrel, supplemented by the
// declaration-only inventory check in native-oriented-box.test.ts.
const publicTypes: [
  Assert<Same<ConstructorParameters<typeof OBB>, [center?: Vector3, halfSize?: Vector3, rotation?: Matrix3]>>,
  Assert<Same<Parameters<OBB["set"]>, [center: Vector3, halfSize: Vector3, rotation: Matrix3]>>,
  Assert<Same<ReturnType<OBB["clone"]>, OBB>>,
  Assert<Same<Parameters<OBB["intersectsOBB"]>, [obb: OBB, epsilon?: number]>>,
  Assert<Same<ReturnType<OBB["intersectRay"]>, Vector3 | undefined>>,
  Assert<Same<Parameters<typeof OBB.fromBox3>, [box3: Box3]>>,
] = [true, true, true, true, true, true];

function readonlyContract(box: OBB): void {
  // @ts-expect-error The public center is readonly.
  box.center = new Vector3();
  // @ts-expect-error The public half-size is readonly.
  box.halfSize = new Vector3();
  // @ts-expect-error The public rotation is readonly.
  box.rotation = new Matrix3();
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const expectPoint = (point: Vector3 | undefined, expected: Vector3) => {
  expect(point).toBeDefined();
  expect(point!.x).toBeCloseTo(expected.x, 12);
  expect(point!.y).toBeCloseTo(expected.y, 12);
  expect(point!.z).toBeCloseTo(expected.z, 12);
};

describe("public independently authored OBB", () => {
  it("exports the independently authored constructor and declared API through the math barrel", () => {
    expect(OBB).toBe(IndependentOBB);
    expect(publicTypes).toEqual([true, true, true, true, true, true]);
    expect(typeof readonlyContract).toBe("function");
    const center = v(3, 0, 0);
    const box = new OBB(center, v(1, 2, 0.5));
    expect(box.center).toBe(center);
    expect(box.clone()).toBeInstanceOf(OBB);
    expect(box.clone()).not.toBe(box);
    expect(box.getSize().toArray()).toEqual([2, 4, 1]);
    expect(OBB.fromBox3(new Box3(v(-1, -2, -3), v(1, 2, 3))).halfSize.toArray()).toEqual([1, 2, 3]);
  });

  it("uses the public rotated-box query and Aura plane signed-distance contract", () => {
    // Local x points along -z and local z points along +x.
    const frame = new Matrix3().set(0, 0, 1, 0, 1, 0, -1, 0, 0);
    const box = new OBB(v(3, 0, 0), v(1, 2, 0.5), frame);
    expect(box.containsPoint(v(3.5, 2, -1))).toBe(true);
    expect(box.containsPoint(v(3.51, 2, -1))).toBe(false);
    expectPoint(box.clampPoint(v(4, 3, -2)), v(3.5, 2, -1));
    expectPoint(box.intersectRay(new Ray(v(5, 0, 0), v(-1, 0, 0))), v(3.5, 0, 0));
    expect(box.intersectsSphere(new Sphere(v(4, 0, 0), 0.5))).toBe(true);
    expect(box.intersectsPlane(new Plane(v(1, 0, 0), -2.5))).toBe(true);
    expect(box.intersectsPlane(new Plane(v(1, 0, 0), -2.49))).toBe(false);
    const mirror = new OBB(v(-3, 0, 0), v(1, 2, 0.5), frame);
    expect(mirror.intersectsPlane(new Plane(v(1, 0, 0), 2.5))).toBe(true);
    expect(mirror.intersectsPlane(new Plane(v(1, 0, 0), 2.49))).toBe(false);
  });

  it("exposes the specified validation and tolerance behavior at the public entry", () => {
    const box = new OBB(v(0, 0, 0), v(1, 1, 1));
    const separated = new OBB(v(2 + 1e-7, 0, 0), v(1, 1, 1));
    expect(box.intersectsOBB(separated, 0)).toBe(false);
    expect(box.intersectsOBB(separated, 2e-7)).toBe(true);
    expect(() => new OBB(v(0, 0, 0), v(-1, 1, 1))).toThrow(RangeError);
    expect(() => OBB.fromBox3(Box3.empty())).toThrow(RangeError);
    const shear = new Matrix4([1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(() => box.applyMatrix4(shear)).toThrow(/shear/);
  });
});
