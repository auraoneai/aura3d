import { Quaternion, type EulerOrder } from "./Quaternion.js";
import { Matrix4 } from "./Matrix4.js";
import type { Vector3 } from "./Vector3.js";

const EULER_ORDERS: readonly EulerOrder[] = ["XYZ", "YXZ", "ZXY", "ZYX", "YZX", "XZY"];

function assertOrder(order: string): asserts order is EulerOrder {
  if (!EULER_ORDERS.includes(order as EulerOrder)) {
    throw new RangeError(`Unsupported Euler order: ${order}`);
  }
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

/**
 * Intrinsic Euler angles (radians) with a named application order — three.js
 * `Euler` parity: all six orders, `setFromRotationMatrix`,
 * `setFromQuaternion`, `reorder`. Instances are immutable; "setters" return
 * new `Euler` values.
 */
export class Euler {
  static readonly DEFAULT_ORDER: EulerOrder = "XYZ";

  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly z = 0,
    readonly order: EulerOrder = "XYZ"
  ) {
    if (![x, y, z].every(Number.isFinite)) throw new RangeError("Euler angles must be finite.");
    assertOrder(order);
  }

  /** three.js `Euler.set` — returns a new Euler (order defaults to current). */
  set(x: number, y: number, z: number, order: EulerOrder = this.order): Euler {
    return new Euler(x, y, z, order);
  }

  clone(): Euler {
    return new Euler(this.x, this.y, this.z, this.order);
  }

  /** three.js `Euler.setFromRotationMatrix` — rotation part of m, no scaling. */
  setFromRotationMatrix(m: Matrix4, order: EulerOrder = this.order): Euler {
    assertOrder(order);
    const te = m.elements;
    const m11 = te[0]!, m12 = te[4]!, m13 = te[8]!;
    const m21 = te[1]!, m22 = te[5]!, m23 = te[9]!;
    const m31 = te[2]!, m32 = te[6]!, m33 = te[10]!;
    let x = 0, y = 0, z = 0;
    switch (order) {
      case "XYZ":
        y = Math.asin(clampUnit(m13));
        if (Math.abs(m13) < 0.9999999) {
          x = Math.atan2(-m23, m33);
          z = Math.atan2(-m12, m11);
        } else {
          x = Math.atan2(m32, m22);
          z = 0;
        }
        break;
      case "YXZ":
        x = Math.asin(-clampUnit(m23));
        if (Math.abs(m23) < 0.9999999) {
          y = Math.atan2(m13, m33);
          z = Math.atan2(m21, m22);
        } else {
          y = Math.atan2(-m31, m11);
          z = 0;
        }
        break;
      case "ZXY":
        x = Math.asin(clampUnit(m32));
        if (Math.abs(m32) < 0.9999999) {
          y = Math.atan2(-m31, m33);
          z = Math.atan2(-m12, m22);
        } else {
          y = 0;
          z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        y = Math.asin(-clampUnit(m31));
        if (Math.abs(m31) < 0.9999999) {
          x = Math.atan2(m32, m33);
          z = Math.atan2(m21, m11);
        } else {
          x = 0;
          z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        z = Math.asin(clampUnit(m21));
        if (Math.abs(m21) < 0.9999999) {
          x = Math.atan2(-m23, m22);
          y = Math.atan2(-m31, m11);
        } else {
          x = 0;
          y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        z = Math.asin(-clampUnit(m12));
        if (Math.abs(m12) < 0.9999999) {
          x = Math.atan2(m32, m22);
          y = Math.atan2(m13, m11);
        } else {
          x = Math.atan2(-m23, m33);
          y = 0;
        }
        break;
    }
    return new Euler(x, y, z, order);
  }

  /** three.js `Euler.setFromQuaternion`. */
  setFromQuaternion(q: Quaternion, order: EulerOrder = this.order): Euler {
    return this.setFromRotationMatrix(Matrix4.rotation(q), order);
  }

  /** three.js `Euler.setFromVector3` — angles from a vector, order kept. */
  setFromVector3(v: Vector3, order: EulerOrder = this.order): Euler {
    return new Euler(v.x, v.y, v.z, order);
  }

  /** three.js `Euler.reorder` — same rotation expressed in `newOrder`. */
  reorder(newOrder: EulerOrder): Euler {
    assertOrder(newOrder);
    return new Euler(0, 0, 0, newOrder).setFromQuaternion(this.toQuaternion(), newOrder);
  }

  static fromRotationMatrix(m: Matrix4, order: EulerOrder = "XYZ"): Euler {
    return new Euler(0, 0, 0, order).setFromRotationMatrix(m, order);
  }

  static fromQuaternion(q: Quaternion, order: EulerOrder = "XYZ"): Euler {
    return new Euler(0, 0, 0, order).setFromQuaternion(q, order);
  }

  toQuaternion(): Quaternion {
    return Quaternion.fromEuler(this.x, this.y, this.z, this.order);
  }

  equals(euler: Euler, epsilon = 1e-10): boolean {
    return (
      Math.abs(this.x - euler.x) <= epsilon &&
      Math.abs(this.y - euler.y) <= epsilon &&
      Math.abs(this.z - euler.z) <= epsilon &&
      this.order === euler.order
    );
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /** three.js `Euler.toArray` — `[x, y, z, order]`. */
  toArrayWithOrder(): [number, number, number, EulerOrder] {
    return [this.x, this.y, this.z, this.order];
  }
}
