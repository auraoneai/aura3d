import { Box3 } from "./Box3.js";
import { Matrix3 } from "./Matrix3.js";
import { Matrix4 } from "./Matrix4.js";
import { Ray } from "./Ray.js";
import { Vector3 } from "./Vector3.js";
import type { Plane } from "./Plane.js";
import type { Sphere } from "./Sphere.js";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Oriented bounding box `(center, halfSize, rotation)` —
 * three.js `examples/jsm/math/OBB.js` parity (immutable methods;
 * `rotation` is a `Matrix3` whose columns are the OBB axes).
 */
export class OBB {
  constructor(
    readonly center = new Vector3(0, 0, 0),
    readonly halfSize = new Vector3(0, 0, 0),
    readonly rotation: Matrix3 = new Matrix3()
  ) {}

  set(center: Vector3, halfSize: Vector3, rotation: Matrix3): OBB {
    return new OBB(center, halfSize, rotation);
  }

  clone(): OBB {
    return new OBB(this.center, this.halfSize, this.rotation);
  }

  copy(obb: OBB): OBB {
    return new OBB(obb.center, obb.halfSize, obb.rotation);
  }

  getSize(): Vector3 {
    return this.halfSize.multiplyScalar(2);
  }

  /** Axis-aligned equivalent (identity rotation) — three `OBB.fromBox3`. */
  static fromBox3(box3: Box3): OBB {
    return new OBB(box3.getCenter(), box3.getSize().multiplyScalar(0.5), new Matrix3());
  }

  /** Closest point on the OBB to `point` — Ericson RTCD 5.1.4. */
  clampPoint(point: Vector3): Vector3 {
    const halfSize = this.halfSize;
    const v1 = point.subtract(this.center);
    const [xAxis, yAxis, zAxis] = this.rotation.extractBasis();
    // start at the center position of the OBB
    let target = this.center;
    // project the target onto the OBB axes and walk towards that point
    const x = clamp(v1.dot(xAxis), -halfSize.x, halfSize.x);
    target = target.add(xAxis.multiplyScalar(x));
    const y = clamp(v1.dot(yAxis), -halfSize.y, halfSize.y);
    target = target.add(yAxis.multiplyScalar(y));
    const z = clamp(v1.dot(zAxis), -halfSize.z, halfSize.z);
    return target.add(zAxis.multiplyScalar(z));
  }

  containsPoint(point: Vector3): boolean {
    const v1 = point.subtract(this.center);
    const [xAxis, yAxis, zAxis] = this.rotation.extractBasis();
    return (
      Math.abs(v1.dot(xAxis)) <= this.halfSize.x &&
      Math.abs(v1.dot(yAxis)) <= this.halfSize.y &&
      Math.abs(v1.dot(zAxis)) <= this.halfSize.z
    );
  }

  intersectsBox3(box3: Box3): boolean {
    return this.intersectsOBB(OBB.fromBox3(box3));
  }

  intersectsSphere(sphere: Sphere): boolean {
    const closestPoint = this.clampPoint(sphere.center);
    return closestPoint.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
  }

  /** OBB–OBB SAT test — Ericson RTCD 4.4.1 (verbatim three port). */
  intersectsOBB(obb: OBB, epsilon = Number.EPSILON): boolean {
    const a = { c: this.center, e: [this.halfSize.x, this.halfSize.y, this.halfSize.z], u: this.rotation.extractBasis() };
    const b = { c: obb.center, e: [obb.halfSize.x, obb.halfSize.y, obb.halfSize.z], u: obb.rotation.extractBasis() };

    // rotation matrix expressing b in a's coordinate frame
    const R: number[][] = [[], [], []];
    const AbsR: number[][] = [[], [], []];
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        R[i]![j] = a.u[i]!.dot(b.u[j]!);
      }
    }

    // translation vector, in a's coordinate frame
    const v1 = b.c.subtract(a.c);
    const t = [v1.dot(a.u[0]!), v1.dot(a.u[1]!), v1.dot(a.u[2]!)];

    // common subexpressions + epsilon term
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        AbsR[i]![j] = Math.abs(R[i]![j]!) + epsilon;
      }
    }

    let ra: number;
    let rb: number;

    // test axes L = A0, L = A1, L = A2
    for (let i = 0; i < 3; i += 1) {
      ra = a.e[i]!;
      rb = b.e[0]! * AbsR[i]![0]! + b.e[1]! * AbsR[i]![1]! + b.e[2]! * AbsR[i]![2]!;
      if (Math.abs(t[i]!) > ra + rb) return false;
    }

    // test axes L = B0, L = B1, L = B2
    for (let i = 0; i < 3; i += 1) {
      ra = a.e[0]! * AbsR[0]![i]! + a.e[1]! * AbsR[1]![i]! + a.e[2]! * AbsR[2]![i]!;
      rb = b.e[i]!;
      if (Math.abs(t[0]! * R[0]![i]! + t[1]! * R[1]![i]! + t[2]! * R[2]![i]!) > ra + rb) return false;
    }

    // test axis L = A0 x B0
    ra = a.e[1]! * AbsR[2]![0]! + a.e[2]! * AbsR[1]![0]!;
    rb = b.e[1]! * AbsR[0]![2]! + b.e[2]! * AbsR[0]![1]!;
    if (Math.abs(t[2]! * R[1]![0]! - t[1]! * R[2]![0]!) > ra + rb) return false;

    // test axis L = A0 x B1
    ra = a.e[1]! * AbsR[2]![1]! + a.e[2]! * AbsR[1]![1]!;
    rb = b.e[0]! * AbsR[0]![2]! + b.e[2]! * AbsR[0]![0]!;
    if (Math.abs(t[2]! * R[1]![1]! - t[1]! * R[2]![1]!) > ra + rb) return false;

    // test axis L = A0 x B2
    ra = a.e[1]! * AbsR[2]![2]! + a.e[2]! * AbsR[1]![2]!;
    rb = b.e[0]! * AbsR[0]![1]! + b.e[1]! * AbsR[0]![0]!;
    if (Math.abs(t[2]! * R[1]![2]! - t[1]! * R[2]![2]!) > ra + rb) return false;

    // test axis L = A1 x B0
    ra = a.e[0]! * AbsR[2]![0]! + a.e[2]! * AbsR[0]![0]!;
    rb = b.e[1]! * AbsR[1]![2]! + b.e[2]! * AbsR[1]![1]!;
    if (Math.abs(t[0]! * R[2]![0]! - t[2]! * R[0]![0]!) > ra + rb) return false;

    // test axis L = A1 x B1
    ra = a.e[0]! * AbsR[2]![1]! + a.e[2]! * AbsR[0]![1]!;
    rb = b.e[0]! * AbsR[1]![2]! + b.e[2]! * AbsR[1]![0]!;
    if (Math.abs(t[0]! * R[2]![1]! - t[2]! * R[0]![1]!) > ra + rb) return false;

    // test axis L = A1 x B2
    ra = a.e[0]! * AbsR[2]![2]! + a.e[2]! * AbsR[0]![2]!;
    rb = b.e[0]! * AbsR[1]![1]! + b.e[1]! * AbsR[1]![0]!;
    if (Math.abs(t[0]! * R[2]![2]! - t[2]! * R[0]![2]!) > ra + rb) return false;

    // test axis L = A2 x B0
    ra = a.e[0]! * AbsR[1]![0]! + a.e[1]! * AbsR[0]![0]!;
    rb = b.e[1]! * AbsR[2]![2]! + b.e[2]! * AbsR[2]![1]!;
    if (Math.abs(t[1]! * R[0]![0]! - t[0]! * R[1]![0]!) > ra + rb) return false;

    // test axis L = A2 x B1
    ra = a.e[0]! * AbsR[1]![1]! + a.e[1]! * AbsR[0]![1]!;
    rb = b.e[0]! * AbsR[2]![2]! + b.e[2]! * AbsR[2]![0]!;
    if (Math.abs(t[1]! * R[0]![1]! - t[0]! * R[1]![1]!) > ra + rb) return false;

    // test axis L = A2 x B2
    ra = a.e[0]! * AbsR[1]![2]! + a.e[1]! * AbsR[0]![2]!;
    rb = b.e[0]! * AbsR[2]![1]! + b.e[1]! * AbsR[2]![0]!;
    if (Math.abs(t[1]! * R[0]![2]! - t[0]! * R[1]![2]!) > ra + rb) return false;

    return true;
  }

  /**
   * OBB–plane test — Ericson RTCD 5.2.3.
   * NOTE: ports three's `n·center − constant` distance expression verbatim
   * (differs in constant sign from `Plane.distanceToPoint`; kept for parity).
   */
  intersectsPlane(plane: Plane): boolean {
    const [xAxis, yAxis, zAxis] = this.rotation.extractBasis();
    const r =
      this.halfSize.x * Math.abs(plane.normal.dot(xAxis)) +
      this.halfSize.y * Math.abs(plane.normal.dot(yAxis)) +
      this.halfSize.z * Math.abs(plane.normal.dot(zAxis));
    const d = plane.normal.dot(this.center) - plane.constant;
    return Math.abs(d) <= r;
  }

  /** Ray–OBB hit via local-space AABB test (three `OBB.intersectRay`). */
  intersectRay(ray: Ray): Vector3 | undefined {
    const size = this.getSize();
    const aabb = Box3.setFromCenterAndSize(new Vector3(0, 0, 0), size);

    // local OBB frame matrix: basis columns + center
    const re = this.rotation.elements;
    const matrix = new Matrix4([
      re[0], re[1], re[2], 0,
      re[3], re[4], re[5], 0,
      re[6], re[7], re[8], 0,
      this.center.x, this.center.y, this.center.z, 1
    ]);
    const inverse = matrix.inverse();
    const localRay = ray.applyMatrix4(inverse);
    const hit = localRay.intersectBox(aabb);
    if (hit === undefined) return undefined;
    return hit.transformMatrix4(matrix);
  }

  intersectsRay(ray: Ray): boolean {
    return this.intersectRay(ray) !== undefined;
  }

  equals(obb: OBB, epsilon = 1e-10): boolean {
    return (
      obb.center.equals(this.center, epsilon) &&
      obb.halfSize.equals(this.halfSize, epsilon) &&
      obb.rotation.equals(this.rotation)
    );
  }

  /** three.js `OBB.applyMatrix4` — decomposes scale, composes rotation. */
  applyMatrix4(matrix: Matrix4): OBB {
    const e = matrix.elements;
    let sx = new Vector3(e[0]!, e[1]!, e[2]!).length();
    const sy = new Vector3(e[4]!, e[5]!, e[6]!).length();
    const sz = new Vector3(e[8]!, e[9]!, e[10]!).length();

    const det = matrix.determinant();
    if (det < 0) sx = -sx;

    const invSX = 1 / sx;
    const invSY = 1 / sy;
    const invSZ = 1 / sz;
    const rm = Matrix3.fromMatrix4(matrix);
    const me = rm.elements;
    const rotationMatrix = new Matrix3([
      me[0] * invSX, me[1] * invSX, me[2] * invSX,
      me[3] * invSY, me[4] * invSY, me[5] * invSY,
      me[6] * invSZ, me[7] * invSZ, me[8] * invSZ
    ]);

    return new OBB(
      this.center.add(matrix.getTranslation()),
      new Vector3(this.halfSize.x * sx, this.halfSize.y * sy, this.halfSize.z * sz),
      this.rotation.multiply(rotationMatrix)
    );
  }
}
