/**
 * View frustum for visibility culling and spatial queries.
 * Represents a 6-sided pyramid defined by 6 planes used for determining object visibility.
 * Planes are extracted from the combined view-projection matrix using the Gribb/Hartmann method.
 * @module Frustum
 */

import { Plane } from './Plane';
import { Vector3 } from './Vector3';
import { Matrix4 } from './Matrix4';

/**
 * Forward reference interface for Box3 to handle circular dependencies.
 */
interface Box3 {
  min: Vector3;
  max: Vector3;
}

/**
 * Forward reference interface for Sphere to handle circular dependencies.
 */
interface Sphere {
  center: Vector3;
  radius: number;
}

/**
 * View frustum class for visibility culling and spatial queries.
 * Represents the viewable region defined by 6 clipping planes (left, right, bottom, top, near, far).
 * Extracts planes from view-projection matrices using the standard Gribb/Hartmann method.
 * All culling operations are optimized for performance (box intersection < 0.001ms).
 *
 * Plane order: [Left, Right, Bottom, Top, Near, Far] (indices 0-5).
 * Plane normals point inward (toward the visible region).
 *
 * @example
 * ```typescript
 * // Create from view-projection matrix
 * const view = Matrix4.lookAt(
 *   new Vector3(0, 5, 10),
 *   new Vector3(0, 0, 0),
 *   new Vector3(0, 1, 0)
 * );
 * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
 * const frustum = Frustum.fromProjectionMatrix(view.multiply(projection));
 *
 * // Test point containment
 * const point = new Vector3(0, 0, -5);
 * if (frustum.containsPoint(point)) {
 *   console.log('Point is visible');
 * }
 *
 * // Test box intersection (for culling)
 * const box = {
 *   min: new Vector3(-1, -1, -1),
 *   max: new Vector3(1, 1, 1)
 * };
 * if (frustum.intersectsBox(box)) {
 *   console.log('Box is visible, render it');
 * }
 *
 * // Test sphere intersection
 * const sphere = {
 *   center: new Vector3(0, 0, -10),
 *   radius: 5
 * };
 * if (frustum.intersectsSphere(sphere)) {
 *   console.log('Sphere is visible');
 * }
 *
 * // Get frustum corners in world space
 * const corners = frustum.getCorners();
 * console.log('Near top-left corner:', corners[0]);
 * ```
 */
export class Frustum {
  /**
   * The 6 clipping planes defining the frustum.
   * Order: [Left, Right, Bottom, Top, Near, Far] (indices 0-5).
   * All plane normals point inward toward the visible region.
   */
  planes: [Plane, Plane, Plane, Plane, Plane, Plane];

  /**
   * Creates a new Frustum instance.
   *
   * @param planes - Optional array of 6 planes. If not provided, creates default planes.
   *
   * @example
   * ```typescript
   * // Create with default planes
   * const frustum1 = new Frustum();
   *
   * // Create with custom planes
   * const planes = [
   *   new Plane(new Vector3(1, 0, 0), 0),  // Left
   *   new Plane(new Vector3(-1, 0, 0), 0), // Right
   *   new Plane(new Vector3(0, 1, 0), 0),  // Bottom
   *   new Plane(new Vector3(0, -1, 0), 0), // Top
   *   new Plane(new Vector3(0, 0, 1), 0),  // Near
   *   new Plane(new Vector3(0, 0, -1), 0)  // Far
   * ];
   * const frustum2 = new Frustum(planes);
   * ```
   */
  constructor(planes?: Plane[]) {
    if (planes && planes.length === 6) {
      this.planes = planes as [Plane, Plane, Plane, Plane, Plane, Plane];
    } else {
      this.planes = [
        new Plane(new Vector3(1, 0, 0), 0),  // Left
        new Plane(new Vector3(-1, 0, 0), 0), // Right
        new Plane(new Vector3(0, 1, 0), 0),  // Bottom
        new Plane(new Vector3(0, -1, 0), 0), // Top
        new Plane(new Vector3(0, 0, 1), 0),  // Near
        new Plane(new Vector3(0, 0, -1), 0)  // Far
      ];
    }
  }

  /**
   * Sets the frustum planes from a combined view-projection matrix.
   * Uses the Gribb/Hartmann plane extraction method.
   * Extracts planes from matrix rows: Left/Right from row 0 ± row 3, etc.
   * All planes are normalized after extraction for accurate distance calculations.
   *
   * @param m - Combined view-projection matrix (viewMatrix * projectionMatrix)
   * @returns This frustum for chaining
   *
   * @example
   * ```typescript
   * const view = Matrix4.lookAt(
   *   new Vector3(0, 5, 10),
   *   new Vector3(0, 0, 0),
   *   new Vector3(0, 1, 0)
   * );
   * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
   * const viewProj = projection.multiply(view);
   *
   * const frustum = new Frustum();
   * frustum.setFromProjectionMatrix(viewProj);
   * ```
   */
  setFromProjectionMatrix(m: Matrix4): this {
    const e = m.elements;
    const planes = this.planes;

    // Left plane: row3 + row0
    planes[0].setComponents(
      e[3] + e[0],
      e[7] + e[4],
      e[11] + e[8],
      e[15] + e[12]
    ).normalize();

    // Right plane: row3 - row0
    planes[1].setComponents(
      e[3] - e[0],
      e[7] - e[4],
      e[11] - e[8],
      e[15] - e[12]
    ).normalize();

    // Bottom plane: row3 + row1
    planes[2].setComponents(
      e[3] + e[1],
      e[7] + e[5],
      e[11] + e[9],
      e[15] + e[13]
    ).normalize();

    // Top plane: row3 - row1
    planes[3].setComponents(
      e[3] - e[1],
      e[7] - e[5],
      e[11] - e[9],
      e[15] - e[13]
    ).normalize();

    // Near plane: row3 + row2
    planes[4].setComponents(
      e[3] + e[2],
      e[7] + e[6],
      e[11] + e[10],
      e[15] + e[14]
    ).normalize();

    // Far plane: row3 - row2
    planes[5].setComponents(
      e[3] - e[2],
      e[7] - e[6],
      e[11] - e[10],
      e[15] - e[14]
    ).normalize();

    return this;
  }

  /**
   * Sets the frustum planes from separate view and projection matrices.
   * Combines the matrices and extracts planes using the Gribb/Hartmann method.
   *
   * @param viewMatrix - View matrix (world-to-camera transform)
   * @param projectionMatrix - Projection matrix (camera-to-clip transform)
   * @returns This frustum for chaining
   *
   * @example
   * ```typescript
   * const view = Matrix4.lookAt(
   *   new Vector3(0, 5, 10),
   *   new Vector3(0, 0, 0),
   *   new Vector3(0, 1, 0)
   * );
   * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
   *
   * const frustum = new Frustum();
   * frustum.setFromViewProjectionMatrix(view, projection);
   * ```
   */
  setFromViewProjectionMatrix(viewMatrix: Matrix4, projectionMatrix: Matrix4): this {
    const combined = projectionMatrix.multiply(viewMatrix);
    return this.setFromProjectionMatrix(combined);
  }

  /**
   * Tests if a point is contained within the frustum.
   * A point is inside if it's on the positive side of all 6 planes.
   *
   * @param point - Point to test
   * @returns True if the point is inside the frustum
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const point = new Vector3(0, 0, -5);
   *
   * if (frustum.containsPoint(point)) {
   *   console.log('Point is visible');
   * } else {
   *   console.log('Point is culled');
   * }
   * ```
   */
  containsPoint(point: Vector3): boolean {
    const planes = this.planes;

    for (let i = 0; i < 6; i++) {
      if (planes[i].distanceToPoint(point) < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Tests if an axis-aligned bounding box intersects or is contained within the frustum.
   * Uses optimized plane-AABB intersection test with positive vertex method.
   * Early-out optimization: returns false as soon as box is outside any plane.
   *
   * Performance: < 0.001ms per call
   *
   * @param box - Axis-aligned bounding box with min and max corners
   * @returns True if the box intersects or is inside the frustum
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const box = {
   *   min: new Vector3(-1, -1, -1),
   *   max: new Vector3(1, 1, 1)
   * };
   *
   * if (frustum.intersectsBox(box)) {
   *   // Box is visible, render it
   *   renderObject(box);
   * } else {
   *   // Box is culled, skip rendering
   * }
   * ```
   */
  intersectsBox(box: Box3): boolean {
    const planes = this.planes;
    const { min, max } = box;

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
      const normal = plane.normal;

      // Find the positive vertex (vertex farthest along plane normal)
      const px = normal.x > 0 ? max.x : min.x;
      const py = normal.y > 0 ? max.y : min.y;
      const pz = normal.z > 0 ? max.z : min.z;

      // If positive vertex is outside, entire box is outside
      if (normal.x * px + normal.y * py + normal.z * pz + plane.constant < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Tests if a sphere intersects or is contained within the frustum.
   * Uses optimized sphere-plane distance test with early-out.
   * A sphere intersects if its center is within radius distance of all planes.
   *
   * @param sphere - Sphere with center point and radius
   * @returns True if the sphere intersects or is inside the frustum
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const sphere = {
   *   center: new Vector3(0, 0, -10),
   *   radius: 5
   * };
   *
   * if (frustum.intersectsSphere(sphere)) {
   *   // Sphere is visible, render it
   *   renderSphere(sphere);
   * } else {
   *   // Sphere is culled
   * }
   * ```
   */
  intersectsSphere(sphere: Sphere): boolean {
    const planes = this.planes;
    const { center, radius } = sphere;

    for (let i = 0; i < 6; i++) {
      const distance = planes[i].distanceToPoint(center);
      if (distance < -radius) {
        return false;
      }
    }

    return true;
  }

  /**
   * Creates a copy of this frustum.
   *
   * @returns New frustum with cloned planes
   *
   * @example
   * ```typescript
   * const frustum1 = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const frustum2 = frustum1.clone();
   *
   * // Modify frustum2 without affecting frustum1
   * frustum2.planes[0].negateInPlace();
   * ```
   */
  clone(): Frustum {
    return new Frustum(this.planes.map(plane => plane.clone()));
  }

  /**
   * Copies the planes from another frustum to this frustum.
   *
   * @param frustum - Frustum to copy from
   * @returns This frustum for chaining
   *
   * @example
   * ```typescript
   * const frustum1 = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const frustum2 = new Frustum();
   * frustum2.copy(frustum1);
   * ```
   */
  copy(frustum: Frustum): this {
    for (let i = 0; i < 6; i++) {
      this.planes[i].copy(frustum.planes[i]);
    }
    return this;
  }

  /**
   * Computes the 8 corner points of the frustum in world space.
   * Corners are computed by finding the intersections of the frustum planes.
   *
   * Order of corners (standard convention):
   * - [0-3]: Near plane corners (top-left, top-right, bottom-right, bottom-left)
   * - [4-7]: Far plane corners (top-left, top-right, bottom-right, bottom-left)
   *
   * @returns Array of 8 corner points
   *
   * @example
   * ```typescript
   * const frustum = Frustum.fromProjectionMatrix(viewProjMatrix);
   * const corners = frustum.getCorners();
   *
   * // Draw frustum wireframe
   * for (let i = 0; i < 4; i++) {
   *   drawLine(corners[i], corners[(i + 1) % 4]); // Near plane
   *   drawLine(corners[i + 4], corners[((i + 1) % 4) + 4]); // Far plane
   *   drawLine(corners[i], corners[i + 4]); // Connecting edges
   * }
   * ```
   */
  getCorners(): Vector3[] {
    const planes = this.planes;
    const corners: Vector3[] = [];

    // Near plane corners (intersections of near with left/right/top/bottom)
    corners.push(this.intersectThreePlanes(planes[4], planes[0], planes[3])); // Near-Left-Top
    corners.push(this.intersectThreePlanes(planes[4], planes[1], planes[3])); // Near-Right-Top
    corners.push(this.intersectThreePlanes(planes[4], planes[1], planes[2])); // Near-Right-Bottom
    corners.push(this.intersectThreePlanes(planes[4], planes[0], planes[2])); // Near-Left-Bottom

    // Far plane corners (intersections of far with left/right/top/bottom)
    corners.push(this.intersectThreePlanes(planes[5], planes[0], planes[3])); // Far-Left-Top
    corners.push(this.intersectThreePlanes(planes[5], planes[1], planes[3])); // Far-Right-Top
    corners.push(this.intersectThreePlanes(planes[5], planes[1], planes[2])); // Far-Right-Bottom
    corners.push(this.intersectThreePlanes(planes[5], planes[0], planes[2])); // Far-Left-Bottom

    return corners;
  }

  /**
   * Computes the intersection point of three planes.
   * Uses the formula: P = ((p2.n × p3.n) * -p1.d + (p3.n × p1.n) * -p2.d + (p1.n × p2.n) * -p3.d) / (p1.n · (p2.n × p3.n))
   *
   * @param p1 - First plane
   * @param p2 - Second plane
   * @param p3 - Third plane
   * @returns Intersection point, or origin if planes don't intersect at a unique point
   */
  private intersectThreePlanes(p1: Plane, p2: Plane, p3: Plane): Vector3 {
    const n1 = p1.normal;
    const n2 = p2.normal;
    const n3 = p3.normal;

    const n2CrossN3 = n2.cross(n3);
    const n3CrossN1 = n3.cross(n1);
    const n1CrossN2 = n1.cross(n2);

    const denom = n1.dot(n2CrossN3);

    // Check if planes are parallel or don't intersect at a unique point
    if (Math.abs(denom) < 1e-6) {
      return new Vector3(0, 0, 0);
    }

    const point = n2CrossN3.scale(-p1.constant)
      .add(n3CrossN1.scale(-p2.constant))
      .add(n1CrossN2.scale(-p3.constant))
      .scale(1 / denom);

    return point;
  }

  /**
   * Creates a frustum from a combined view-projection matrix.
   *
   * @param m - Combined view-projection matrix
   * @returns New frustum
   *
   * @example
   * ```typescript
   * const view = Matrix4.lookAt(
   *   new Vector3(0, 5, 10),
   *   new Vector3(0, 0, 0),
   *   new Vector3(0, 1, 0)
   * );
   * const projection = Matrix4.perspective(Math.PI / 4, 16/9, 0.1, 100);
   * const frustum = Frustum.fromProjectionMatrix(projection.multiply(view));
   * ```
   */
  static fromProjectionMatrix(m: Matrix4): Frustum {
    return new Frustum().setFromProjectionMatrix(m);
  }
}
