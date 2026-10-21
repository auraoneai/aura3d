import { Box3 } from "./Box3.js";
import { Vector3 } from "./Vector3.js";
import type { Matrix4 } from "./Matrix4.js";
import type { Plane } from "./Plane.js";

/**
 * Bounding sphere — three.js `Sphere` parity. A negative `radius` denotes an
 * "empty" sphere (three uses `radius = -1` as its empty sentinel).
 */
export class Sphere {
  constructor(
    readonly center = Vector3.zero.clone(),
    readonly radius = 0
  ) {
    if (!Number.isFinite(radius)) throw new RangeError("Sphere radius must be finite.");
  }

  set(center: Vector3, radius: number): Sphere {
    return new Sphere(center, radius);
  }

  clone(): Sphere {
    return new Sphere(this.center, this.radius);
  }

  /** three.js `Sphere.isEmpty` — `true` for negative radius. */
  isEmpty(): boolean {
    return this.radius < 0;
  }

  makeEmpty(): Sphere {
    return new Sphere(this.center, -1);
  }

  /** three.js `Sphere.setFromPoints` — box first, then tighten around center. */
  static setFromPoints(points: readonly Vector3[], optionalCenter?: Vector3): Sphere {
    let center: Vector3;
    if (optionalCenter !== undefined) {
      center = optionalCenter;
    } else {
      // avoid importing Box3 eagerly: compute the AABB inline
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.z < minZ) minZ = p.z;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.z > maxZ) maxZ = p.z;
      }
      center = new Vector3(minX, minY, minZ).add(new Vector3(maxX, maxY, maxZ)).multiplyScalar(0.5);
    }
    let maxRadiusSq = 0;
    for (const p of points) {
      maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(p));
    }
    return new Sphere(center, Math.sqrt(maxRadiusSq));
  }

  static setFromBox3(box: Box3): Sphere {
    return box.getBoundingSphere();
  }

  containsPoint(point: Vector3): boolean {
    return point.distanceToSquared(this.center) <= this.radius * this.radius;
  }

  distanceToPoint(point: Vector3): number {
    return point.distanceTo(this.center) - this.radius;
  }

  intersectsSphere(other: Sphere): boolean {
    const radiusSum = this.radius + other.radius;
    return other.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
  }

  intersectsBox(box: Box3): boolean {
    return box.intersectsSphere(this);
  }

  intersectsPlane(plane: Plane): boolean {
    return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
  }

  /**
   * Clamps `point` into the sphere (three.js `Sphere.clampPoint`) — inside
   * points are returned unchanged; outside points snap onto the surface.
   */
  clampPoint(point: Vector3): Vector3 {
    const deltaLengthSq = this.center.distanceToSquared(point);
    if (deltaLengthSq > this.radius * this.radius) {
      const delta = point.subtract(this.center).normalize();
      return this.center.addScaled(delta, this.radius);
    }
    return point;
  }

  /** three.js `Sphere.getBoundingBox` — empty sphere → empty box. */
  getBoundingBox(): Box3 {
    if (this.isEmpty()) return new Box3();
    const r = new Vector3(this.radius, this.radius, this.radius);
    return new Box3(this.center.subtract(r), this.center.add(r));
  }

  applyMatrix4(matrix: Matrix4): Sphere {
    return new Sphere(
      this.center.transformMatrix4(matrix),
      this.radius * matrix.maxScaleOnAxis()
    );
  }

  translate(offset: Vector3): Sphere {
    return new Sphere(this.center.add(offset), this.radius);
  }

  /** three.js `Sphere.expandByPoint` — grows the minimal enclosing sphere. */
  expandByPoint(point: Vector3): Sphere {
    if (this.isEmpty()) return new Sphere(point, 0);
    const v1 = point.subtract(this.center);
    const lengthSq = v1.lengthSquared();
    if (lengthSq > this.radius * this.radius) {
      const length = Math.sqrt(lengthSq);
      const delta = (length - this.radius) * 0.5;
      return new Sphere(this.center.addScaled(v1, delta / length), this.radius + delta);
    }
    return this;
  }

  /** three.js `Sphere.union`. */
  union(sphere: Sphere): Sphere {
    if (sphere.isEmpty()) return this;
    if (this.isEmpty()) return sphere;
    if (this.center.equals(sphere.center)) {
      return new Sphere(this.center, Math.max(this.radius, sphere.radius));
    }
    const v2 = sphere.center.subtract(this.center).normalize().multiplyScalar(sphere.radius);
    return this
      .expandByPoint(sphere.center.add(v2))
      .expandByPoint(sphere.center.subtract(v2));
  }

  equals(sphere: Sphere, epsilon = 0): boolean {
    return this.center.equals(sphere.center, epsilon) && Math.abs(this.radius - sphere.radius) <= epsilon;
  }
}
