import { describe, expect, it } from "vitest";
import { Box3, Euler, Matrix3, Matrix4, Quaternion, Transform, Vector2, Vector3, Vector4 } from "@aura3d/math";

describe("math vectors and matrices", () => {
  it("normalizes a zero vector without NaN", () => {
    expect(Vector3.zero.normalize().toArray()).toEqual([0, 0, 0]);
  });

  it("computes dot and cross products", () => {
    expect(Vector3.right.dot(Vector3.up)).toBe(0);
    expect(Vector3.right.cross(Vector3.up).equals(new Vector3(0, 0, 1))).toBe(true);
  });

  it("divides vector components and scalars across vector dimensions", () => {
    expect(new Vector2(8, 12).divide(new Vector2(2, 3)).toArray()).toEqual([4, 4]);
    expect(new Vector2(8, 12).divideScalar(4).toArray()).toEqual([2, 3]);
    expect(new Vector3(8, 12, 16).divide(new Vector3(2, 3, 4)).toArray()).toEqual([4, 4, 4]);
    expect(new Vector3(8, 12, 16).divideScalar(4).toArray()).toEqual([2, 3, 4]);
    expect(new Vector4(8, 12, 16, 20).divide(new Vector4(2, 3, 4, 5)).toArray()).toEqual([4, 4, 4, 4]);
    expect(new Vector4(8, 12, 16, 20).divideScalar(4).toArray()).toEqual([2, 3, 4, 5]);
  });

  it("transposes Matrix3 and Matrix4 values in column-major storage", () => {
    expect(new Matrix3([1, 2, 3, 4, 5, 6, 7, 8, 9]).transpose().elements).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
    expect(new Matrix4([
      1, 2, 3, 4,
      5, 6, 7, 8,
      9, 10, 11, 12,
      13, 14, 15, 16
    ]).transpose().elements).toEqual([
      1, 5, 9, 13,
      2, 6, 10, 14,
      3, 7, 11, 15,
      4, 8, 12, 16
    ]);
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

  it("decomposes Matrix4 TRS transforms back into components", () => {
    const position = new Vector3(3, 4, 5);
    const rotation = Quaternion.fromEuler(Math.PI / 5, Math.PI / 4, -Math.PI / 7);
    const scale = new Vector3(2, 3, 4);
    const decomposed = Matrix4.compose(position, rotation, scale).decompose();

    expect(decomposed.position.equals(position, 1e-9)).toBe(true);
    expect(decomposed.scale.equals(scale, 1e-9)).toBe(true);
    expect(decomposed.rotation.rotateVector(Vector3.forward).equals(rotation.rotateVector(Vector3.forward), 1e-9)).toBe(true);
    expect(decomposed.rotation.rotateVector(Vector3.up).equals(rotation.rotateVector(Vector3.up), 1e-9)).toBe(true);
  });

  it("builds look-at view matrices", () => {
    const view = Matrix4.lookAt(new Vector3(0, 0, 5), Vector3.zero.clone(), Vector3.up);
    expect(view.transformPoint(Vector3.zero.clone()).equals(new Vector3(0, 0, -5), 1e-9)).toBe(true);
    expect(() => Matrix4.lookAt(Vector3.zero.clone(), Vector3.zero.clone(), Vector3.up)).toThrow(/look-at/i);
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

  it("converts quaternion rotations through euler angles, matrices, and inverses", () => {
    const rotation = Quaternion.fromAxisAngle(Vector3.up, Math.PI / 3);
    expect(rotation.multiply(rotation.inverse()).equals(Quaternion.identity, 1e-9)).toBe(true);

    const matrixRotation = Quaternion.fromRotationMatrix(Matrix4.rotation(rotation));
    expect(matrixRotation.rotateVector(Vector3.forward).equals(rotation.rotateVector(Vector3.forward), 1e-9)).toBe(true);

    const euler = new Euler(0, Math.PI / 3, 0);
    expect(euler.toQuaternion().rotateVector(Vector3.forward).equals(Quaternion.fromEuler(0, Math.PI / 3, 0).rotateVector(Vector3.forward), 1e-9)).toBe(true);
    expect(euler.equals(new Euler(0, Math.PI / 3, 0))).toBe(true);
    expect(() => new Euler(Number.NaN, 0, 0)).toThrow(/finite/i);
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
