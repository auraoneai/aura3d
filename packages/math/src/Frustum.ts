import { Box3 } from "./Box3.js";
import { Matrix4 } from "./Matrix4.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

/** Clip-space depth convention for {@link Frustum.setFromProjectionMatrix}. */
export type FrustumCoordinateSystem = "webgl" | "webgpu";

/**
 * View frustum as six clipping planes — three.js `Frustum` parity.
 * Plane order matches three: `[right, left, bottom, top, far, near]`.
 */
export class Frustum {
  constructor(readonly planes: readonly [Plane, Plane, Plane, Plane, Plane, Plane]) {}

  static fromMatrix(matrix: Matrix4): Frustum {
    return Frustum.setFromProjectionMatrix(matrix);
  }

  /**
   * Extracts the six frustum planes from a projection matrix —
   * three.js `Frustum.setFromProjectionMatrix`. `coordinateSystem` selects
   * the near-plane convention (`"webgl"`: NDC z ∈ [−1,1], `"webgpu"`:
   * [0,1]); `reversedDepth` swaps near/far.
   */
  static setFromProjectionMatrix(
    matrix: Matrix4,
    coordinateSystem: FrustumCoordinateSystem = "webgl",
    reversedDepth = false
  ): Frustum {
    const me = matrix.elements;
    const me0 = me[0]!, me1 = me[1]!, me2 = me[2]!, me3 = me[3]!;
    const me4 = me[4]!, me5 = me[5]!, me6 = me[6]!, me7 = me[7]!;
    const me8 = me[8]!, me9 = me[9]!, me10 = me[10]!, me11 = me[11]!;
    const me12 = me[12]!, me13 = me[13]!, me14 = me[14]!, me15 = me[15]!;

    let far: Plane;
    let near: Plane;
    if (reversedDepth) {
      far = new Plane(new Vector3(me2, me6, me10), me14);
      near = new Plane(new Vector3(me3 - me2, me7 - me6, me11 - me10), me15 - me14);
    } else {
      far = new Plane(new Vector3(me3 - me2, me7 - me6, me11 - me10), me15 - me14);
      if (coordinateSystem === "webgl") {
        near = new Plane(new Vector3(me3 + me2, me7 + me6, me11 + me10), me15 + me14);
      } else if (coordinateSystem === "webgpu") {
        near = new Plane(new Vector3(me2, me6, me10), me14);
      } else {
        throw new RangeError(`Invalid coordinate system: ${coordinateSystem}`);
      }
    }

    return new Frustum([
      new Plane(new Vector3(me3 - me0, me7 - me4, me11 - me8), me15 - me12), // right
      new Plane(new Vector3(me3 + me0, me7 + me4, me11 + me8), me15 + me12), // left
      new Plane(new Vector3(me3 + me1, me7 + me5, me11 + me9), me15 + me13), // bottom
      new Plane(new Vector3(me3 - me1, me7 - me5, me11 - me9), me15 - me13), // top
      far,
      near
    ]);
  }

  set(p0: Plane, p1: Plane, p2: Plane, p3: Plane, p4: Plane, p5: Plane): Frustum {
    return new Frustum([p0, p1, p2, p3, p4, p5]);
  }

  clone(): Frustum {
    return new Frustum([...this.planes] as [Plane, Plane, Plane, Plane, Plane, Plane]);
  }

  copy(frustum: Frustum): Frustum {
    return frustum.clone();
  }

  containsPoint(point: Vector3): boolean {
    return this.planes.every((plane) => plane.distanceToPoint(point) >= 0);
  }

  intersectsSphere(sphere: Sphere): boolean {
    const negRadius = -sphere.radius;
    return this.planes.every((plane) => plane.distanceToPoint(sphere.center) >= negRadius);
  }

  intersectsBox(box: Box3): boolean {
    if (box.isEmpty()) return false;
    for (const plane of this.planes) {
      // corner at max distance along the plane normal
      const p = new Vector3(
        plane.normal.x > 0 ? box.max.x : box.min.x,
        plane.normal.y > 0 ? box.max.y : box.min.y,
        plane.normal.z > 0 ? box.max.z : box.min.z
      );
      if (plane.distanceToPoint(p) < 0) return false;
    }
    return true;
  }

  /** three.js `Frustum.intersectsObject`-equivalent over a bounds provider. */
  intersectsBoundingSphere(sphere: Sphere, worldMatrix?: Matrix4): boolean {
    const transformed = worldMatrix ? sphere.applyMatrix4(worldMatrix) : sphere;
    return this.intersectsSphere(transformed);
  }
}
