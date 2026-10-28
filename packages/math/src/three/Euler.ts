import { clamp } from "../MathUtils.js";
import { Euler as ImmutableEuler } from "../Euler.js";
import { Matrix4 } from "./Matrix4.js";
import { Quaternion, type EulerLike, type EulerOrder, type QuaternionLike } from "./Quaternion.js";

export type { EulerOrder } from "./Quaternion.js";

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

/**
 * Mutable three.js-compatible Euler angles. Every modifier mutates `this` and
 * returns `this`, exactly like three r185 `Euler`, including the `_onChange`
 * callback that owners (rotation vs quaternion) use to stay in sync.
 */
export class Euler {
  static DEFAULT_ORDER: EulerOrder = "XYZ";

  declare readonly isEuler: true;

  _x: number;
  _y: number;
  _z: number;
  _order: EulerOrder;

  constructor(x = 0, y = 0, z = 0, order: EulerOrder = Euler.DEFAULT_ORDER) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
    this._onChangeCallback();
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
    this._onChangeCallback();
  }

  get z(): number {
    return this._z;
  }

  set z(value: number) {
    this._z = value;
    this._onChangeCallback();
  }

  get order(): EulerOrder {
    return this._order;
  }

  set order(value: EulerOrder) {
    this._order = value;
    this._onChangeCallback();
  }

  /** Copy an immutable `@aura3d/math` Euler (or any `{x, y, z, order}`) into this Euler. */
  fromImmutable(e: EulerLike): this {
    return this.copy(e);
  }

  /** Snapshot as an immutable `@aura3d/math` Euler (throws on non-finite angles or an unknown order). */
  toImmutable(): ImmutableEuler {
    return new ImmutableEuler(this._x, this._y, this._z, this._order);
  }

  set(x: number, y: number, z: number, order: EulerOrder = this._order): this {
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
    this._onChangeCallback();
    return this;
  }

  clone(): this {
    return new (this.constructor as new (x: number, y: number, z: number, order: EulerOrder) => this)(this._x, this._y, this._z, this._order);
  }

  copy(euler: EulerLike): this {
    this._x = euler.x;
    this._y = euler.y;
    this._z = euler.z;
    this._order = euler.order as EulerOrder;
    this._onChangeCallback();
    return this;
  }

  setFromRotationMatrix(m: ElementsLike, order: EulerOrder = this._order, update = true): this {
    // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
    const te = m.elements;
    const m11 = te[0]!;
    const m12 = te[4]!;
    const m13 = te[8]!;
    const m21 = te[1]!;
    const m22 = te[5]!;
    const m23 = te[9]!;
    const m31 = te[2]!;
    const m32 = te[6]!;
    const m33 = te[10]!;

    switch (order) {
      case "XYZ":
        this._y = Math.asin(clamp(m13, -1, 1));
        if (Math.abs(m13) < 0.9999999) {
          this._x = Math.atan2(-m23, m33);
          this._z = Math.atan2(-m12, m11);
        } else {
          this._x = Math.atan2(m32, m22);
          this._z = 0;
        }
        break;
      case "YXZ":
        this._x = Math.asin(-clamp(m23, -1, 1));
        if (Math.abs(m23) < 0.9999999) {
          this._y = Math.atan2(m13, m33);
          this._z = Math.atan2(m21, m22);
        } else {
          this._y = Math.atan2(-m31, m11);
          this._z = 0;
        }
        break;
      case "ZXY":
        this._x = Math.asin(clamp(m32, -1, 1));
        if (Math.abs(m32) < 0.9999999) {
          this._y = Math.atan2(-m31, m33);
          this._z = Math.atan2(-m12, m22);
        } else {
          this._y = 0;
          this._z = Math.atan2(m21, m11);
        }
        break;
      case "ZYX":
        this._y = Math.asin(-clamp(m31, -1, 1));
        if (Math.abs(m31) < 0.9999999) {
          this._x = Math.atan2(m32, m33);
          this._z = Math.atan2(m21, m11);
        } else {
          this._x = 0;
          this._z = Math.atan2(-m12, m22);
        }
        break;
      case "YZX":
        this._z = Math.asin(clamp(m21, -1, 1));
        if (Math.abs(m21) < 0.9999999) {
          this._x = Math.atan2(-m23, m22);
          this._y = Math.atan2(-m31, m11);
        } else {
          this._x = 0;
          this._y = Math.atan2(m13, m33);
        }
        break;
      case "XZY":
        this._z = Math.asin(-clamp(m12, -1, 1));
        if (Math.abs(m12) < 0.9999999) {
          this._x = Math.atan2(m32, m22);
          this._y = Math.atan2(m13, m11);
        } else {
          this._x = Math.atan2(-m23, m33);
          this._y = 0;
        }
        break;
      default:
        console.warn(`THREE.Euler: .setFromRotationMatrix() encountered an unknown order: ${String(order)}`);
    }

    this._order = order;
    if (update === true) this._onChangeCallback();
    return this;
  }

  setFromQuaternion(q: QuaternionLike, order?: EulerOrder, update?: boolean): this {
    _matrix.makeRotationFromQuaternion(q);
    return this.setFromRotationMatrix(_matrix, order, update);
  }

  setFromVector3(v: { readonly x: number; readonly y: number; readonly z: number }, order: EulerOrder = this._order): this {
    return this.set(v.x, v.y, v.z, order);
  }

  reorder(newOrder: EulerOrder): this {
    // WARNING: this discards revolution information -bhouston
    _quaternion.setFromEuler(this);
    return this.setFromQuaternion(_quaternion, newOrder);
  }

  equals(euler: EulerLike): boolean {
    return euler.x === this._x && euler.y === this._y && euler.z === this._z && euler.order === this._order;
  }

  fromArray(array: ArrayLike<number | string | undefined>): this {
    this._x = array[0] as number;
    this._y = array[1] as number;
    this._z = array[2] as number;
    if (array[3] !== undefined) this._order = array[3] as EulerOrder;
    this._onChangeCallback();
    return this;
  }

  toArray(array: Array<number | string> = [], offset = 0): Array<number | string> {
    array[offset] = this._x;
    array[offset + 1] = this._y;
    array[offset + 2] = this._z;
    array[offset + 3] = this._order;
    return array;
  }

  _onChange(callback: () => void): this {
    this._onChangeCallback = callback;
    return this;
  }

  _onChangeCallback(): void {}

  *[Symbol.iterator](): Generator<number | string, void, undefined> {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._order;
  }
}

(Euler.prototype as { isEuler: boolean }).isEuler = true;

const _matrix = new Matrix4();
const _quaternion = new Quaternion();
