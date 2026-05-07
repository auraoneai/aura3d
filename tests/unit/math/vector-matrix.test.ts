import { describe, expect, it } from "vitest";
import { Box3, Matrix3, Matrix4, Quaternion, Transform, Vector3 } from "@galileo3d/math";

describe("math vectors and matrices", () => {
  it("normalizes a zero vector without NaN", () => {
    expect(Vector3.zero.normalize().toArray()).toEqual([0, 0, 0]);
  });

  it("computes dot and cross products", () => {
    expect(Vector3.right.dot(Vector3.up)).toBe(0);
    expect(Vector3.right.cross(Vector3.up).equals(new Vector3(0, 0, 1))).toBe(true);
  });

  it("rejects singular Matrix3 inverses", () => {
    const singular = new Matrix3([1, 0, 0, 2, 0, 0, 3, 0, 0]);
    expect(() => singular.inverse()).toThrow(/singular/i);
  });

  it("composes and inverts Matrix4 transforms", () => {
    const transform = Matrix4.compose(new Vector3(3, 4, 5), Quaternion.fromAxisAngle(Vector3.up, Math.PI / 2), new Vector3(2, 2, 2));
    const point = new Vector3(1, 2, 3);
    const roundTrip = transform.inverse().transformPoint(transform.transformPoint(point));
    expect(roundTrip.equals(point, 1e-9)).toBe(true);
  });

  it("rejects non-finite projection parameters before they can produce NaN matrices", () => {
    expect(() => Matrix4.perspective(Number.NaN, 1, 0.1, 10)).toThrow(/perspective/i);
    expect(() => Matrix4.perspective(Math.PI / 2, Number.POSITIVE_INFINITY, 0.1, 10)).toThrow(/perspective/i);
    expect(() => Matrix4.perspective(Math.PI / 2, 1, 10, 0.1)).toThrow(/perspective/i);
    expect(() => Matrix4.orthographic(-1, 1, -1, Number.NaN, 0.1, 10)).toThrow(/orthographic/i);
    expect(() => Matrix4.orthographic(-1, -1, -1, 1, 0.1, 10)).toThrow(/orthographic/i);
  });

  it("handles quaternion opposite vector conversion", () => {
    const rotation = Quaternion.fromUnitVectors(Vector3.forward, Vector3.forward.multiplyScalar(-1));
    expect(rotation.rotateVector(Vector3.forward).equals(Vector3.forward.multiplyScalar(-1), 1e-9)).toBe(true);
  });

  it("transforms AABBs through all corners", () => {
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const transformed = box.transform(Matrix4.translation(new Vector3(10, 0, 0)));
    expect(transformed.min.equals(new Vector3(9, -1, -1))).toBe(true);
    expect(transformed.max.equals(new Vector3(11, 1, 1))).toBe(true);
  });

  it("combines parent and child transforms", () => {
    const parent = new Transform(new Vector3(10, 0, 0), Quaternion.identity.clone(), new Vector3(2, 2, 2));
    const child = new Transform(new Vector3(1, 0, 0));
    expect(parent.combine(child).position.equals(new Vector3(12, 0, 0))).toBe(true);
  });

  it("keeps transform composition deterministic with non-uniform scale and rotation", () => {
    const run = () => {
      const parent = new Transform(
        new Vector3(2, 3, 4),
        Quaternion.fromAxisAngle(Vector3.up, Math.PI / 2),
        new Vector3(2, 3, 4)
      );
      const child = new Transform(
        new Vector3(1, 2, -1),
        Quaternion.fromAxisAngle(Vector3.right, Math.PI / 4),
        new Vector3(0.5, 2, 1)
      );
      const combined = parent.combine(child);
      return {
        position: combined.position.toArray().map((value) => Number(value.toFixed(8))),
        scale: combined.scale.toArray().map((value) => Number(value.toFixed(8))),
        point: combined.transformPoint(new Vector3(1, 0, 0)).toArray().map((value) => Number(value.toFixed(8)))
      };
    };

    expect(run()).toEqual(run());
  });
});
