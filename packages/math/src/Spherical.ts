import { Vector3 } from "./Vector3.js";
import { clamp, euclideanModulo } from "./MathUtils.js";

/**
 * Spherical coordinates `(radius, phi, theta)` — three.js `Spherical` parity.
 * `phi` = polar angle from +Y, `theta` = azimuth around +Y from +Z.
 */
export class Spherical {
  constructor(
    readonly radius = 1,
    readonly phi = 0,
    readonly theta = 0
  ) {}

  set(radius: number, phi: number, theta: number): Spherical {
    return new Spherical(radius, phi, theta);
  }

  clone(): Spherical {
    return new Spherical(this.radius, this.phi, this.theta);
  }

  copy(other: Spherical): Spherical {
    return new Spherical(other.radius, other.phi, other.theta);
  }

  /** Clamps phi into [EPS, π−EPS], wraps theta into [−π, π] (three `makeSafe`). */
  makeSafe(): Spherical {
    const EPS = 0.000001;
    return new Spherical(
      this.radius,
      clamp(this.phi, EPS, Math.PI - EPS),
      euclideanModulo(this.theta + Math.PI, Math.PI * 2) - Math.PI
    );
  }

  setFromVector3(v: Vector3): Spherical {
    return this.setFromCartesianCoords(v.x, v.y, v.z);
  }

  setFromCartesianCoords(x: number, y: number, z: number): Spherical {
    const radius = Math.sqrt(x * x + y * y + z * z);
    if (radius === 0) {
      return new Spherical(0, 0, 0);
    }
    return new Spherical(radius, Math.acos(clamp(y / radius, -1, 1)), Math.atan2(x, z));
  }

  toVector3(): Vector3 {
    const sinPhiRadius = Math.sin(this.phi) * this.radius;
    return new Vector3(
      sinPhiRadius * Math.sin(this.theta),
      Math.cos(this.phi) * this.radius,
      sinPhiRadius * Math.cos(this.theta)
    );
  }

  equals(other: Spherical, epsilon = 1e-10): boolean {
    return (
      Math.abs(this.radius - other.radius) <= epsilon &&
      Math.abs(this.phi - other.phi) <= epsilon &&
      Math.abs(this.theta - other.theta) <= epsilon
    );
  }
}
