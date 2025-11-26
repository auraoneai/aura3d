/**
 * Sphere collision shape for round objects.
 *
 * @module Physics/Shapes/SphereShape
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { IShape, ShapeType, AABB } from '../Collider';

/**
 * Sphere collision shape defined by radius.
 *
 * Spheres are the simplest and fastest collision shape for round objects.
 * Perfect for balls, planets, explosions, and character controllers.
 *
 * @example
 * ```typescript
 * // Create a unit sphere
 * const sphere = new SphereShape(1.0);
 *
 * // Create a large planet
 * const planet = new SphereShape(100.0);
 *
 * // Create offset sphere
 * const offsetSphere = new SphereShape(0.5);
 * offsetSphere.offset = new Vector3(0, 1, 0);
 *
 * // Use with collider
 * const collider = new Collider({
 *   shape: new SphereShape(2.5)
 * });
 * ```
 */
export class SphereShape implements IShape {
  /**
   * Shape type identifier.
   */
  readonly type = ShapeType.Sphere;

  /**
   * Radius of the sphere.
   */
  radius: number;

  /**
   * Local offset from collider center.
   */
  offset: Vector3;

  /**
   * Creates a new sphere shape.
   *
   * @param radius - Radius of the sphere
   * @param offset - Local offset (default: zero vector)
   *
   * @example
   * ```typescript
   * // Unit sphere
   * const sphere = new SphereShape(1.0);
   *
   * // With offset
   * const sphere = new SphereShape(1.0, new Vector3(0, 1, 0));
   * ```
   */
  constructor(radius: number, offset: Vector3 = Vector3.zero()) {
    this.radius = radius;
    this.offset = offset;
  }

  /**
   * Computes axis-aligned bounding box in world space.
   *
   * For spheres, the AABB is simply the transformed center ± radius.
   * Note: Non-uniform scaling will create an ellipsoid, AABB uses max scale.
   *
   * @param transform - World transform matrix
   * @returns AABB in world space
   *
   * @example
   * ```typescript
   * const sphere = new SphereShape(2.0);
   * const transform = Matrix4.translation(10, 0, 0);
   * const aabb = sphere.computeAABB(transform);
   * // aabb.min = (8, -2, -2), aabb.max = (12, 2, 2)
   * ```
   */
  computeAABB(transform: Matrix4): AABB {
    // Get world position of sphere center
    const center = this.transformPoint(this.offset, transform);

    // Extract scale from transform matrix
    const scale = this.getScale(transform);
    const maxScale = Math.max(scale.x, scale.y, scale.z);
    const worldRadius = this.radius * maxScale;

    // Create AABB centered at world position
    const radiusVec = new Vector3(worldRadius, worldRadius, worldRadius);

    return {
      min: center.sub(radiusVec),
      max: center.add(radiusVec)
    };
  }

  /**
   * Computes inertia tensor for a solid sphere with given mass.
   * Uses the formula: I = (2/5) * m * r²
   *
   * @param mass - Mass of the sphere
   * @returns Inertia tensor as diagonal matrix
   *
   * @example
   * ```typescript
   * const sphere = new SphereShape(2.0);
   * const inertia = sphere.computeInertia(10.0);
   * ```
   */
  computeInertia(mass: number): Matrix4 {
    // Solid sphere: I = (2/5) * m * r²
    const I = (2.0 / 5.0) * mass * this.radius * this.radius;

    // Sphere has uniform inertia in all axes
    const inertia = Matrix4.identity();
    const e = inertia.elements;

    e[0] = I;
    e[5] = I;
    e[10] = I;

    return inertia;
  }

  /**
   * Gets the volume of the sphere.
   * Uses the formula: V = (4/3) * π * r³
   *
   * @returns Volume in cubic units
   *
   * @example
   * ```typescript
   * const sphere = new SphereShape(3.0);
   * const volume = sphere.getVolume(); // ~113.1
   * ```
   */
  getVolume(): number {
    return (4.0 / 3.0) * Math.PI * this.radius * this.radius * this.radius;
  }

  /**
   * Finds support point in given direction (for GJK algorithm).
   * For a sphere, the support point is center + radius * normalized direction.
   *
   * @param direction - Direction vector
   * @param transform - World transform matrix
   * @returns Support point in world space
   *
   * @example
   * ```typescript
   * const sphere = new SphereShape(1.0);
   * const direction = new Vector3(1, 0, 0);
   * const transform = Matrix4.identity();
   * const support = sphere.support(direction, transform);
   * console.log(support); // (1, 0, 0)
   * ```
   */
  support(direction: Vector3, transform: Matrix4): Vector3 {
    // Get world center
    const center = this.transformPoint(this.offset, transform);

    // Get world radius (use max scale for non-uniform scaling)
    const scale = this.getScale(transform);
    const maxScale = Math.max(scale.x, scale.y, scale.z);
    const worldRadius = this.radius * maxScale;

    // Support point is center + radius in direction
    const normalizedDir = direction.normalize();
    return center.add(normalizedDir.scale(worldRadius));
  }

  /**
   * Gets the diameter of the sphere.
   *
   * @returns Diameter (2 * radius)
   */
  getDiameter(): number {
    return this.radius * 2.0;
  }

  /**
   * Sets the diameter of the sphere.
   *
   * @param diameter - New diameter
   */
  setDiameter(diameter: number): void {
    this.radius = diameter * 0.5;
  }

  /**
   * Gets the surface area of the sphere.
   * Uses the formula: A = 4 * π * r²
   *
   * @returns Surface area
   */
  getSurfaceArea(): number {
    return 4.0 * Math.PI * this.radius * this.radius;
  }

  /**
   * Creates a copy of this shape.
   *
   * @returns New sphere shape with same properties
   */
  clone(): SphereShape {
    return new SphereShape(this.radius, this.offset.clone());
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
   * Extracts scale from a transform matrix.
   *
   * @param matrix - Transform matrix
   * @returns Scale vector
   */
  private getScale(matrix: Matrix4): Vector3 {
    const e = matrix.elements;

    // Extract scale from each axis
    const scaleX = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const scaleY = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const scaleZ = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);

    return new Vector3(scaleX, scaleY, scaleZ);
  }

  /**
   * Creates a sphere from diameter.
   *
   * @param diameter - Diameter of the sphere
   * @returns New sphere shape
   *
   * @example
   * ```typescript
   * const sphere = SphereShape.fromDiameter(4.0); // radius = 2.0
   * ```
   */
  static fromDiameter(diameter: number): SphereShape {
    return new SphereShape(diameter * 0.5);
  }

  /**
   * Creates a unit sphere (radius = 1).
   *
   * @returns New unit sphere
   *
   * @example
   * ```typescript
   * const unitSphere = SphereShape.unit();
   * ```
   */
  static unit(): SphereShape {
    return new SphereShape(1.0);
  }
}
