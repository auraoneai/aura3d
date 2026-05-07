import { Box3 } from "./Box3.js";
import { Matrix4 } from "./Matrix4.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

export class Frustum {
  constructor(readonly planes: readonly [Plane, Plane, Plane, Plane, Plane, Plane]) {}

  static fromMatrix(matrix: Matrix4): Frustum {
    const m = matrix.elements;
    const planes: [Plane, Plane, Plane, Plane, Plane, Plane] = [
      new Plane(new Vector3(m[3] + m[0], m[7] + m[4], m[11] + m[8]), m[15] + m[12]),
      new Plane(new Vector3(m[3] - m[0], m[7] - m[4], m[11] - m[8]), m[15] - m[12]),
      new Plane(new Vector3(m[3] + m[1], m[7] + m[5], m[11] + m[9]), m[15] + m[13]),
      new Plane(new Vector3(m[3] - m[1], m[7] - m[5], m[11] - m[9]), m[15] - m[13]),
      new Plane(new Vector3(m[3] + m[2], m[7] + m[6], m[11] + m[10]), m[15] + m[14]),
      new Plane(new Vector3(m[3] - m[2], m[7] - m[6], m[11] - m[10]), m[15] - m[14])
    ];
    return new Frustum(planes);
  }

  containsPoint(point: Vector3): boolean {
    return this.planes.every((plane) => plane.distanceToPoint(point) >= 0);
  }

  intersectsSphere(sphere: Sphere): boolean {
    return this.planes.every((plane) => plane.distanceToPoint(sphere.center) >= -sphere.radius);
  }

  intersectsBox(box: Box3): boolean {
    if (box.isEmpty()) return false;
    for (const plane of this.planes) {
      const p = new Vector3(
        plane.normal.x >= 0 ? box.max.x : box.min.x,
        plane.normal.y >= 0 ? box.max.y : box.min.y,
        plane.normal.z >= 0 ? box.max.z : box.min.z
      );
      if (plane.distanceToPoint(p) < 0) return false;
    }
    return true;
  }
}
