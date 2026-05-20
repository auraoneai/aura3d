import { Quaternion, type EulerOrder } from "./Quaternion.js";

export class Euler {
  constructor(
    readonly x = 0,
    readonly y = 0,
    readonly z = 0,
    readonly order: EulerOrder = "XYZ"
  ) {
    if (![x, y, z].every(Number.isFinite)) throw new RangeError("Euler angles must be finite.");
    if (order !== "XYZ") throw new RangeError(`Unsupported Euler order: ${order}`);
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
}
