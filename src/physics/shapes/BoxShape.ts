/**
 * Box collision shape for rectangular/cubic objects.
 *
 * @module Physics/Shapes/BoxShape
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { IShape, ShapeType, AABB } from '../Collider';

/**
 * Box collision shape defined by half-extents.
 *
 * Boxes are the most common and efficient collision shape for rectangular objects.
 * The box is centered at the origin and can be offset using the offset property.
 *
 * @example
 * ```typescript
 * // Create a 2x2x2 cube
 * const cube = new BoxShape(new Vector3(1, 1, 1));
 *
 * // Create a wall (10x3x0.5)
 * const wall = new BoxShape(new Vector3(5, 1.5, 0.25));
 *
 * // Create offset box
 * const offsetBox = new BoxShape(new Vector3(1, 1, 1));
 * offsetBox.offset = new Vector3(0, 1, 0); // 1 unit above origin
 *
 * // Use with collider
 * const collider = new Collider({
 *   shape: new BoxShape(new Vector3(2, 1, 3))
 * });
 * ```
 */
export class BoxShape implements IShape {
  /**
   * Shape type identifier.
   */
  readonly type = ShapeType.Box;

  /**
   * Half-extents of the box (half-width, half-height, half-depth).
   * Full dimensions are extents * 2.
   */
  extents: Vector3;

  /**
   * Local offset from collider center.
   */
  offset: Vector3;

  /**
   * Creates a new box shape.
   *
   * @param extents - Half-extents of the box
   * @param offset - Local offset (default: zero vector)
   *
   * @example
   * ```typescript
   * // 2x4x6 box
   * const box = new BoxShape(new Vector3(1, 2, 3));
   *
   * // With offset
   * const box = new BoxShape(
   *   new Vector3(1, 1, 1),
   *   new Vector3(0, 1, 0)
   * );
   * ```
   */
  constructor(extents: Vector3, offset: Vector3 = Vector3.zero()) {
    this.extents = extents;
    this.offset = offset;
  }

  /**
   * Computes axis-aligned bounding box in world space.
   *
   * @param transform - World transform matrix
   * @returns AABB in world space
   *
   * @example
   * ```typescript
   * const box = new BoxShape(new Vector3(1, 1, 1));
   * const transform = Matrix4.translation(5, 0, 0);
   * const aabb = box.computeAABB(transform);
   * console.log(aabb.min, aabb.max);
   * ```
   */
  computeAABB(transform: Matrix4): AABB {
    // Get the 8 corners of the box in local space
    const corners = this.getCorners();

    // Transform all corners to world space
    const worldCorners = corners.map(corner => {
      const offsetCorner = corner.add(this.offset);
      return this.transformPoint(offsetCorner, transform);
    });

    // Find min and max
    let min = worldCorners[0].clone();
    let max = worldCorners[0].clone();

    for (let i = 1; i < worldCorners.length; i++) {
      const corner = worldCorners[i];
      min = Vector3.min(min, corner);
      max = Vector3.max(max, corner);
    }

    return { min, max };
  }

  /**
   * Computes inertia tensor for a box with given mass.
   * Uses the formula: I = (m/12) * (h² + d², w² + d², w² + h²)
   * where w = width, h = height, d = depth
   *
   * @param mass - Mass of the box
   * @returns Inertia tensor as diagonal matrix
   *
   * @example
   * ```typescript
   * const box = new BoxShape(new Vector3(1, 2, 3));
   * const inertia = box.computeInertia(10.0);
   * ```
   */
  computeInertia(mass: number): Matrix4 {
    const w = this.extents.x * 2;
    const h = this.extents.y * 2;
    const d = this.extents.z * 2;

    const factor = mass / 12.0;

    // Diagonal inertia tensor
    const Ixx = factor * (h * h + d * d);
    const Iyy = factor * (w * w + d * d);
    const Izz = factor * (w * w + h * h);

    const inertia = Matrix4.identity();
    const e = inertia.elements;

    e[0] = Ixx;
    e[5] = Iyy;
    e[10] = Izz;

    return inertia;
  }

  /**
   * Gets the volume of the box.
   *
   * @returns Volume in cubic units
   *
   * @example
   * ```typescript
   * const box = new BoxShape(new Vector3(2, 3, 4));
   * const volume = box.getVolume(); // 8 * 6 * 4 = 192
   * ```
   */
  getVolume(): number {
    return 8.0 * this.extents.x * this.extents.y * this.extents.z;
  }

  /**
   * Finds support point in given direction (for GJK algorithm).
   * Returns the furthest point on the box in the specified direction.
   *
   * @param direction - Direction vector
   * @param transform - World transform matrix
   * @returns Support point in world space
   *
   * @example
   * ```typescript
   * const box = new BoxShape(new Vector3(1, 1, 1));
   * const direction = new Vector3(1, 0, 0);
   * const transform = Matrix4.identity();
   * const support = box.support(direction, transform);
   * console.log(support); // Furthest point in +X direction
   * ```
   */
  support(direction: Vector3, transform: Matrix4): Vector3 {
    // Transform direction to local space
    const localDir = this.transformDirection(direction, transform.invert()!);

    // Find the corner in the direction
    const support = new Vector3(
      localDir.x >= 0 ? this.extents.x : -this.extents.x,
      localDir.y >= 0 ? this.extents.y : -this.extents.y,
      localDir.z >= 0 ? this.extents.z : -this.extents.z
    );

    // Apply offset
    const offsetSupport = support.add(this.offset);

    // Transform back to world space
    return this.transformPoint(offsetSupport, transform);
  }

  /**
   * Gets all 8 corners of the box in local space.
   *
   * @returns Array of 8 corner points
   */
  getCorners(): Vector3[] {
    const ex = this.extents.x;
    const ey = this.extents.y;
    const ez = this.extents.z;

    return [
      new Vector3(-ex, -ey, -ez),
      new Vector3(ex, -ey, -ez),
      new Vector3(-ex, ey, -ez),
      new Vector3(ex, ey, -ez),
      new Vector3(-ex, -ey, ez),
      new Vector3(ex, -ey, ez),
      new Vector3(-ex, ey, ez),
      new Vector3(ex, ey, ez)
    ];
  }

  /**
   * Gets the dimensions of the box (full width, height, depth).
   *
   * @returns Full dimensions
   */
  getDimensions(): Vector3 {
    return this.extents.scale(2);
  }

  /**
   * Sets the dimensions of the box (full width, height, depth).
   *
   * @param dimensions - Full dimensions
   */
  setDimensions(dimensions: Vector3): void {
    this.extents = dimensions.scale(0.5);
  }

  /**
   * Creates a copy of this shape.
   *
   * @returns New box shape with same properties
   */
  clone(): BoxShape {
    return new BoxShape(this.extents.clone(), this.offset.clone());
  }

  /**
   * Transforms a point by a matrix.
   *
   * @param point - Point to transform
   * @param matrix - Transform matrix
   * @returns Transformed point
   */
  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = point.x * e[0] + point.y * e[4] + point.z * e[8] + e[12];
    const y = point.x * e[1] + point.y * e[5] + point.z * e[9] + e[13];
    const z = point.x * e[2] + point.y * e[6] + point.z * e[10] + e[14];
    return new Vector3(x, y, z);
  }

  /**
   * Transforms a direction by a matrix (ignores translation).
   *
   * @param direction - Direction to transform
   * @param matrix - Transform matrix
   * @returns Transformed direction
   */
  private transformDirection(direction: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = direction.x * e[0] + direction.y * e[4] + direction.z * e[8];
    const y = direction.x * e[1] + direction.y * e[5] + direction.z * e[9];
    const z = direction.x * e[2] + direction.y * e[6] + direction.z * e[10];
    return new Vector3(x, y, z);
  }

  /**
   * Creates a cube with uniform size.
   *
   * @param size - Side length of the cube
   * @returns New box shape
   *
   * @example
   * ```typescript
   * const cube = BoxShape.cube(2.0); // 2x2x2 cube
   * ```
   */
  static cube(size: number): BoxShape {
    const halfSize = size * 0.5;
    return new BoxShape(new Vector3(halfSize, halfSize, halfSize));
  }

  /**
   * Creates a box from full dimensions.
   *
   * @param width - Full width
   * @param height - Full height
   * @param depth - Full depth
   * @returns New box shape
   *
   * @example
   * ```typescript
   * const box = BoxShape.fromDimensions(4, 2, 6);
   * ```
   */
  static fromDimensions(width: number, height: number, depth: number): BoxShape {
    return new BoxShape(new Vector3(width * 0.5, height * 0.5, depth * 0.5));
  }
}
