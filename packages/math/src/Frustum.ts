import { Box3 } from "./Box3.js";
import { Matrix4 } from "./Matrix4.js";
import { Plane } from "./Plane.js";
import { Sphere } from "./Sphere.js";
import { Vector3 } from "./Vector3.js";

/** Clip-space depth convention for {@link Frustum.setFromProjectionMatrix}. */
export type FrustumCoordinateSystem = "webgl" | "webgpu";

/** View frustum, ordered `[right, left, bottom, top, far, near]`. */
export class Frustum {
  readonly activePlanes: readonly Plane[];

  /** The far slot remains present for API compatibility when it is unbounded. */
  constructor(readonly planes: readonly [Plane, Plane, Plane, Plane, Plane, Plane], readonly infiniteFar = false) {
    this.activePlanes = infiniteFar ? planes.filter((_, index) => index !== 4) : planes;
  }

  static fromMatrix(matrix: Matrix4, coordinateSystem: FrustumCoordinateSystem = "webgl", reversedDepth = false, infiniteFar = false): Frustum {
    return Frustum.setFromProjectionMatrix(matrix, coordinateSystem, reversedDepth, infiniteFar);
  }

  /**
   * Extracts inward-facing planes from a view-projection matrix.
   * `coordinateSystem` selects NDC z ∈ [−1, 1] or [0, 1], and
   * `reversedDepth` identifies which of the two z boundaries is near.
   * Infinite far projections have no finite far plane; its tuple slot is an
   * inactive sentinel and `activePlanes` omits it.
   */
  static setFromProjectionMatrix(
    matrix: Matrix4,
    coordinateSystem: FrustumCoordinateSystem = "webgl",
    reversedDepth = false,
    infiniteFar = false
  ): Frustum {
    if (coordinateSystem !== "webgl" && coordinateSystem !== "webgpu") {
      throw new RangeError(`Invalid coordinate system: ${coordinateSystem}`);
    }
    const me = matrix.elements;
    const me0 = me[0]!, me1 = me[1]!, me2 = me[2]!, me3 = me[3]!;
    const me4 = me[4]!, me5 = me[5]!, me6 = me[6]!, me7 = me[7]!;
    const me8 = me[8]!, me9 = me[9]!, me10 = me[10]!, me11 = me[11]!;
    const me12 = me[12]!, me13 = me[13]!, me14 = me[14]!, me15 = me[15]!;

    const lower = coordinateSystem === "webgl"
      ? [me3 + me2, me7 + me6, me11 + me10, me15 + me14] as const
      : [me2, me6, me10, me14] as const;
    const upper = [me3 - me2, me7 - me6, me11 - me10, me15 - me14] as const;
    const nearCoefficients = reversedDepth ? upper : lower;
    const farCoefficients = reversedDepth ? lower : upper;
    const near = new Plane(new Vector3(nearCoefficients[0], nearCoefficients[1], nearCoefficients[2]), nearCoefficients[3]);
    const farNormalLength = Math.hypot(farCoefficients[0], farCoefficients[1], farCoefficients[2]);
    // A zero normal with a positive constant is an always-true half-space,
    // including when floating-point precision rounds a very distant far bound
    // to infinity. Other degenerate clip planes describe an invalid matrix.
    const unbounded = infiniteFar || (farNormalLength === 0 && farCoefficients[3] > 0);
    const far = unbounded
      ? new Plane(new Vector3(0, 0, 1), Infinity)
      : new Plane(new Vector3(farCoefficients[0], farCoefficients[1], farCoefficients[2]), farCoefficients[3]);

    return new Frustum([
      new Plane(new Vector3(me3 - me0, me7 - me4, me11 - me8), me15 - me12), // right
      new Plane(new Vector3(me3 + me0, me7 + me4, me11 + me8), me15 + me12), // left
      new Plane(new Vector3(me3 + me1, me7 + me5, me11 + me9), me15 + me13), // bottom
      new Plane(new Vector3(me3 - me1, me7 - me5, me11 - me9), me15 - me13), // top
      far,
      near
    ], unbounded);
  }

  set(p0: Plane, p1: Plane, p2: Plane, p3: Plane, p4: Plane, p5: Plane): Frustum {
    return new Frustum([p0, p1, p2, p3, p4, p5]);
  }

  clone(): Frustum {
    return new Frustum([...this.planes] as [Plane, Plane, Plane, Plane, Plane, Plane], this.infiniteFar);
  }

  copy(frustum: Frustum): Frustum {
    return frustum.clone();
  }

  containsPoint(point: Vector3): boolean {
    return this.activePlanes.every((plane) => plane.distanceToPoint(point) >= 0);
  }

  intersectsSphere(sphere: Sphere): boolean {
    const negRadius = -sphere.radius;
    return this.activePlanes.every((plane) => plane.distanceToPoint(sphere.center) >= negRadius);
  }

  intersectsBox(box: Box3): boolean {
    if (box.isEmpty()) return false;
    for (const plane of this.activePlanes) {
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
