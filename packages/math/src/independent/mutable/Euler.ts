import { Euler as ImmutableEuler } from "../../Euler.js";
import type { EulerLike, EulerOrder, QuaternionLike } from "./Quaternion.js";

// Diagnostics go through the host console; declared locally so the package needs no DOM or Node type libraries.
declare const console: { warn(...data: unknown[]): void };

interface ElementsLike {
  readonly elements: ArrayLike<number>;
}

/** Axis indices and parity for a supported order, or undefined for an unrecognized one. */
function axesOrUndefined(order: string): [number, number, number, number] | undefined {
  switch (order) {
    case "XYZ": return [0, 1, 2, 1];
    case "YZX": return [1, 2, 0, 1];
    case "ZXY": return [2, 0, 1, 1];
    case "XZY": return [0, 2, 1, -1];
    case "ZYX": return [2, 1, 0, -1];
    case "YXZ": return [1, 0, 2, -1];
    default: return undefined;
  }
}

/** Column-major 4x4 rotation matrix for a quaternion. */
function quaternionMatrix(q: QuaternionLike): number[] {
  const largest = Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z), Math.abs(q.w));
  const x = largest === 0 ? 0 : q.x / largest, y = largest === 0 ? 0 : q.y / largest;
  const z = largest === 0 ? 0 : q.z / largest, w = largest === 0 ? 0 : q.w / largest;
  const norm = x * x + y * y + z * z + w * w;
  const scale = norm === 0 ? 0 : 2 / norm;
  return [
    1 - scale * (y * y + z * z), scale * (x * y + z * w), scale * (x * z - y * w), 0,
    scale * (x * y - z * w), 1 - scale * (x * x + z * z), scale * (y * z + x * w), 0,
    scale * (x * z + y * w), scale * (y * z - x * w), 1 - scale * (x * x + y * y), 0,
    0, 0, 0, 1
  ];
}

/** Intrinsic axis rotations multiply on the right in the stated order. */
function eulerMatrix(x: number, y: number, z: number, order: EulerOrder): number[] {
  // An unrecognized order contributes no rotation (4.x: its quaternion stays at identity).
  if (!axesOrUndefined(order)) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  let current = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // row-major 3x3
  const values = { X: x, Y: y, Z: z };
  for (const axis of order) {
    const angle = values[axis as keyof typeof values];
    const c = Math.cos(angle), s = Math.sin(angle);
    const rotation = axis === "X" ? [1, 0, 0, 0, c, -s, 0, s, c]
      : axis === "Y" ? [c, 0, s, 0, 1, 0, -s, 0, c]
      : [c, -s, 0, s, c, 0, 0, 0, 1];
    const next = new Array<number>(9).fill(0);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        for (let k = 0; k < 3; k++) next[3 * row + column] += current[3 * row + k] * rotation[3 * k + column];
      }
    }
    current = next;
  }
  return [current[0], current[3], current[6], 0, current[1], current[4], current[7], 0,
    current[2], current[5], current[8], 0, 0, 0, 0, 1];
}

export class Euler implements EulerLike {
  static DEFAULT_ORDER: string = "XYZ";
  readonly isEuler = true;
  _x: number;
  _y: number;
  _z: number;
  _order: string;

  constructor(x = 0, y = 0, z = 0, order: EulerOrder = Euler.DEFAULT_ORDER as EulerOrder) {
    this._x = x; this._y = y; this._z = z; this._order = order;
  }

  get x(): number { return this._x; }
  set x(value: number) { this._x = value; this._onChangeCallback(); }
  get y(): number { return this._y; }
  set y(value: number) { this._y = value; this._onChangeCallback(); }
  get z(): number { return this._z; }
  set z(value: number) { this._z = value; this._onChangeCallback(); }
  get order(): EulerOrder { return this._order as EulerOrder; }
  set order(value: EulerOrder) { this._order = value; this._onChangeCallback(); }

  fromImmutable(euler: EulerLike): this { return this.copy(euler); }
  toImmutable(): ImmutableEuler { return new ImmutableEuler(this._x, this._y, this._z, this.order); }

  set(x: number, y: number, z: number, order: EulerOrder = this.order): this {
    this._x = x; this._y = y; this._z = z; this._order = order;
    this._onChangeCallback();
    return this;
  }

  clone(): this {
    const Constructor = this.constructor as new (x: number, y: number, z: number, order: EulerOrder) => this;
    return new Constructor(this._x, this._y, this._z, this.order);
  }

  copy(euler: EulerLike): this { return this.set(euler.x, euler.y, euler.z, euler.order as EulerOrder); }

  setFromRotationMatrix(m: ElementsLike, order: EulerOrder = this.order, update = true): this {
    const found = axesOrUndefined(order);
    if (!found) {
      // 4.x behavior: an unknown order is reported; the angles are kept and the order is stored.
      console.warn(`Euler.setFromRotationMatrix: unknown order: ${String(order)}`);
      this._order = order;
      if (update) this._onChangeCallback();
      return this;
    }
    const [i, j, k, parity] = found;
    const e = m.elements;
    const entry = (row: number, column: number): number => e[4 * column + row];
    const sinMiddle = Math.max(-1, Math.min(1, parity * entry(i, k)));
    const cosMiddle = Math.hypot(entry(i, i), entry(i, j));
    const angles = [0, 0, 0];
    angles[j] = Math.atan2(sinMiddle, cosMiddle);
    if (cosMiddle > 1e-14) {
      angles[k] = Math.atan2(-parity * entry(i, j), entry(i, i));
      if (cosMiddle < 0.25) {
        // Near gimbal lock the two matrix entries normally used for the
        // first angle both approach zero. Recover their combined angle from
        // entries that remain well-conditioned, then subtract the last turn.
        angles[i] = Math.atan2(parity * entry(k, j), entry(j, j)) -
          Math.atan2(parity * sinMiddle * Math.sin(angles[k]), Math.cos(angles[k]));
      } else {
        angles[i] = Math.atan2(-parity * entry(j, k), entry(k, k));
      }
    } else {
      // At gimbal lock, choose zero for the final axis and retain the represented rotation.
      angles[i] = Math.atan2(parity * entry(k, j), entry(j, j));
      angles[k] = 0;
    }
    this._x = angles[0]; this._y = angles[1]; this._z = angles[2]; this._order = order;
    if (update) this._onChangeCallback();
    return this;
  }

  setFromQuaternion(q: QuaternionLike, order: EulerOrder = this.order, update = true): this {
    return this.setFromRotationMatrix({ elements: quaternionMatrix(q) }, order, update);
  }

  setFromVector3(v: { readonly x: number; readonly y: number; readonly z: number }, order: EulerOrder = this.order): this {
    return this.set(v.x, v.y, v.z, order);
  }

  reorder(newOrder: EulerOrder): this {
    const matrix = eulerMatrix(this._x, this._y, this._z, this.order);
    return this.setFromRotationMatrix({ elements: matrix }, newOrder);
  }

  equals(euler: EulerLike): boolean {
    return this._x === euler.x && this._y === euler.y && this._z === euler.z && this._order === euler.order;
  }

  fromArray(array: ArrayLike<number | string | undefined>): this {
    const order = array[3] === undefined ? this.order : array[3] as EulerOrder;
    return this.set(array[0] as number, array[1] as number, array[2] as number, order);
  }

  toArray(array: Array<number | string> = [], offset = 0): Array<number | string> {
    array[offset] = this._x; array[offset + 1] = this._y; array[offset + 2] = this._z; array[offset + 3] = this.order;
    return array;
  }

  _onChange(callback: () => void): this { this._onChangeCallback = callback; return this; }
  _onChangeCallback(): void { /* An observer can be installed with _onChange. */ }
  *[Symbol.iterator](): Generator<number | string, void, undefined> { yield this._x; yield this._y; yield this._z; yield this.order; }
}
