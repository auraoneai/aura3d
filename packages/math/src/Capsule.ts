import { Vector3 } from "./Vector3.js";
import { Line3 } from "./Line3.js";
import type { Box3 } from "./Box3.js";

function checkAABBAxis(
  p1x: number, p1y: number, p2x: number, p2y: number,
  minx: number, maxx: number, miny: number, maxy: number,
  radius: number
): boolean {
  return (
    (minx - p1x < radius || minx - p2x < radius) &&
    (p1x - maxx < radius || p2x - maxx < radius) &&
    (miny - p1y < radius || miny - p2y < radius) &&
    (p1y - maxy < radius || p2y - maxy < radius)
  );
}

/**
 * Capsule `(start, end, radius)` — three.js `examples/jsm/math/Capsule.js`
 * parity (immutable methods). `start`/`end` are the segment endpoints, not
 * the outer caps.
 */
export class Capsule {
  constructor(
    readonly start = new Vector3(0, 0, 0),
    readonly end = new Vector3(0, 1, 0),
    readonly radius = 1
  ) {}

  set(start: Vector3, end: Vector3, radius: number): Capsule {
    return new Capsule(start, end, radius);
  }

  clone(): Capsule {
    return new Capsule(this.start, this.end, this.radius);
  }

  copy(capsule: Capsule): Capsule {
    return new Capsule(capsule.start, capsule.end, capsule.radius);
  }

  getCenter(): Vector3 {
    return this.end.add(this.start).multiplyScalar(0.5);
  }

  /** Axis segment as a `Line3` (useful for `Line3.closestPointToPoint`). */
  toLine3(): Line3 {
    return new Line3(this.start, this.end);
  }

  translate(v: Vector3): Capsule {
    return new Capsule(this.start.add(v), this.end.add(v), this.radius);
  }

  /** three.js `Capsule.intersectsBox` — 2D AABB overlap on all 3 axes. */
  intersectsBox(box: Box3): boolean {
    return (
      checkAABBAxis(
        this.start.x, this.start.y, this.end.x, this.end.y,
        box.min.x, box.max.x, box.min.y, box.max.y,
        this.radius
      ) &&
      checkAABBAxis(
        this.start.x, this.start.z, this.end.x, this.end.z,
        box.min.x, box.max.x, box.min.z, box.max.z,
        this.radius
      ) &&
      checkAABBAxis(
        this.start.y, this.start.z, this.end.y, this.end.z,
        box.min.y, box.max.y, box.min.z, box.max.z,
        this.radius
      )
    );
  }

  equals(capsule: Capsule, epsilon = 1e-10): boolean {
    return (
      this.start.equals(capsule.start, epsilon) &&
      this.end.equals(capsule.end, epsilon) &&
      Math.abs(this.radius - capsule.radius) <= epsilon
    );
  }
}
