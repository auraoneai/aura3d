import { Vector3 } from "./Vector3.js";

/**
 * Cylindrical coordinates `(radius, theta, y)` — three.js `Cylindrical`.
 * `theta` = azimuth around +Y measured from +Z.
 */
export class Cylindrical {
  constructor(
    readonly radius = 1,
    readonly theta = 0,
    readonly y = 0
  ) {}

  set(radius: number, theta: number, y: number): Cylindrical {
    return new Cylindrical(radius, theta, y);
  }

  clone(): Cylindrical {
    return new Cylindrical(this.radius, this.theta, this.y);
  }

  copy(other: Cylindrical): Cylindrical {
    return new Cylindrical(other.radius, other.theta, other.y);
  }

  setFromVector3(v: Vector3): Cylindrical {
    return this.setFromCartesianCoords(v.x, v.y, v.z);
  }

  setFromCartesianCoords(x: number, y: number, z: number): Cylindrical {
    const radius = Math.sqrt(x * x + z * z);
    return new Cylindrical(radius, Math.atan2(x, z), y);
  }

  toVector3(): Vector3 {
    return new Vector3(
      this.radius * Math.sin(this.theta),
      this.y,
      this.radius * Math.cos(this.theta)
    );
  }

  equals(other: Cylindrical, epsilon = 1e-10): boolean {
    return (
      Math.abs(this.radius - other.radius) <= epsilon &&
      Math.abs(this.theta - other.theta) <= epsilon &&
      Math.abs(this.y - other.y) <= epsilon
    );
  }
}
