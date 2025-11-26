/**
 * Capsule collision shape for pill-shaped objects.
 *
 * @module Physics/Shapes/CapsuleShape
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { IShape, ShapeType, AABB } from '../Collider';

/**
 * Axis alignment for capsule orientation.
 */
export enum CapsuleAxis {
  /** Capsule aligned along X-axis */
  X = 0,

  /** Capsule aligned along Y-axis (default, standing upright) */
  Y = 1,

  /** Capsule aligned along Z-axis */
  Z = 2
}

/**
 * Capsule collision shape defined by height and radius.
 *
 * A capsule is a cylinder with hemispherical caps. Perfect for character
 * controllers as it slides smoothly over edges and steps.
 *
 * @example
 * ```typescript
 * // Create a standing character capsule (height 2, radius 0.5)
 * const character = new CapsuleShape(2.0, 0.5, CapsuleAxis.Y);
 *
 * // Create a lying capsule
 * const lying = new CapsuleShape(3.0, 0.3, CapsuleAxis.X);
 *
 * // Use with collider
 * const collider = new Collider({
 *   shape: new CapsuleShape(1.8, 0.4) // Standing human
 * });
 * ```
 */
export class CapsuleShape implements IShape {
  /**
   * Shape type identifier.
   */
  readonly type = ShapeType.Capsule;

  /**
   * Total height of the capsule (including hemispherical caps).
   */
  height: number;

  /**
   * Radius of the capsule (cylinder and hemisphere radius).
   */
  radius: number;

  /**
   * Axis along which the capsule is oriented.
   */
  axis: CapsuleAxis;

  /**
   * Local offset from collider center.
   */
  offset: Vector3;

  /**
   * Creates a new capsule shape.
   *
   * @param height - Total height including caps
   * @param radius - Radius of cylinder and caps
   * @param axis - Orientation axis (default: Y)
   * @param offset - Local offset (default: zero vector)
   *
   * @example
   * ```typescript
   * // Standing capsule
   * const capsule = new CapsuleShape(2.0, 0.5);
   *
   * // Horizontal capsule
   * const horizontal = new CapsuleShape(3.0, 0.4, CapsuleAxis.X);
   * ```
   */
  constructor(
    height: number,
    radius: number,
    axis: CapsuleAxis = CapsuleAxis.Y,
    offset: Vector3 = Vector3.zero()
  ) {
    this.height = height;
    this.radius = radius;
    this.axis = axis;
    this.offset = offset;
  }

  /**
   * Gets the height of the cylindrical section (height - 2*radius).
   *
   * @returns Cylinder height
   */
  getCylinderHeight(): number {
    return Math.max(0, this.height - 2 * this.radius);
  }

  /**
   * Gets the positions of the two hemisphere centers (line segment endpoints).
   *
   * @returns Tuple of [point1, point2] in local space
   */
  getSegmentEndpoints(): [Vector3, Vector3] {
    const halfCylinderHeight = this.getCylinderHeight() * 0.5;

    switch (this.axis) {
      case CapsuleAxis.X:
        return [
          new Vector3(-halfCylinderHeight, 0, 0),
          new Vector3(halfCylinderHeight, 0, 0)
        ];
      case CapsuleAxis.Y:
        return [
          new Vector3(0, -halfCylinderHeight, 0),
          new Vector3(0, halfCylinderHeight, 0)
        ];
      case CapsuleAxis.Z:
        return [
          new Vector3(0, 0, -halfCylinderHeight),
          new Vector3(0, 0, halfCylinderHeight)
        ];
    }
  }

  /**
   * Computes axis-aligned bounding box in world space.
   *
   * @param transform - World transform matrix
   * @returns AABB in world space
   *
   * @example
   * ```typescript
   * const capsule = new CapsuleShape(2.0, 0.5);
   * const transform = Matrix4.translation(0, 5, 0);
   * const aabb = capsule.computeAABB(transform);
   * ```
   */
  computeAABB(transform: Matrix4): AABB {
    // Get world positions of segment endpoints
    const [p1Local, p2Local] = this.getSegmentEndpoints();
    const p1 = this.transformPoint(p1Local.add(this.offset), transform);
    const p2 = this.transformPoint(p2Local.add(this.offset), transform);

    // Get world radius
    const scale = this.getScale(transform);
    let radiusScale: number;
    switch (this.axis) {
      case CapsuleAxis.X:
        radiusScale = Math.max(scale.y, scale.z);
        break;
      case CapsuleAxis.Y:
        radiusScale = Math.max(scale.x, scale.z);
        break;
      case CapsuleAxis.Z:
        radiusScale = Math.max(scale.x, scale.y);
        break;
    }
    const worldRadius = this.radius * radiusScale;

    // Create AABB encompassing both spheres
    const radiusVec = new Vector3(worldRadius, worldRadius, worldRadius);

    const min1 = p1.sub(radiusVec);
    const max1 = p1.add(radiusVec);
    const min2 = p2.sub(radiusVec);
    const max2 = p2.add(radiusVec);

    return {
      min: Vector3.min(min1, min2),
      max: Vector3.max(max1, max2)
    };
  }

  /**
   * Computes inertia tensor for a capsule with given mass.
   * Approximates capsule as cylinder + two hemispheres.
   *
   * @param mass - Mass of the capsule
   * @returns Inertia tensor as diagonal matrix
   *
   * @example
   * ```typescript
   * const capsule = new CapsuleShape(2.0, 0.5);
   * const inertia = capsule.computeInertia(75.0); // Human mass
   * ```
   */
  computeInertia(mass: number): Matrix4 {
    const r = this.radius;
    const h = this.getCylinderHeight();

    // Volume calculations
    const cylinderVolume = Math.PI * r * r * h;
    const sphereVolume = (4.0 / 3.0) * Math.PI * r * r * r;
    const totalVolume = cylinderVolume + sphereVolume;

    // Mass distribution
    const cylinderMass = mass * (cylinderVolume / totalVolume);
    const sphereMass = mass * (sphereVolume / totalVolume);

    // Cylinder inertia
    const cylinderIxx = (1.0 / 12.0) * cylinderMass * (3 * r * r + h * h);
    const cylinderIyy = (1.0 / 2.0) * cylinderMass * r * r;

    // Hemisphere inertia (two hemispheres = one sphere)
    const sphereI = (2.0 / 5.0) * sphereMass * r * r;

    // Parallel axis theorem for hemispheres
    const d = h * 0.5; // Distance from center
    const sphereIxx = sphereI + sphereMass * d * d;

    // Combined inertia
    let Ixx = cylinderIxx + sphereIxx;
    let Iyy = cylinderIyy + sphereI;
    let Izz = Ixx;

    // Adjust based on axis orientation
    let I1: number, I2: number, I3: number;
    switch (this.axis) {
      case CapsuleAxis.X:
        I1 = Iyy;
        I2 = Ixx;
        I3 = Izz;
        break;
      case CapsuleAxis.Y:
        I1 = Ixx;
        I2 = Iyy;
        I3 = Izz;
        break;
      case CapsuleAxis.Z:
        I1 = Ixx;
        I2 = Izz;
        I3 = Iyy;
        break;
    }

    const inertia = Matrix4.identity();
    const e = inertia.elements;

    e[0] = I1;
    e[5] = I2;
    e[10] = I3;

    return inertia;
  }

  /**
   * Gets the volume of the capsule.
   * Volume = cylinder volume + sphere volume
   *
   * @returns Volume in cubic units
   *
   * @example
   * ```typescript
   * const capsule = new CapsuleShape(2.0, 0.5);
   * const volume = capsule.getVolume();
   * ```
   */
  getVolume(): number {
    const r = this.radius;
    const h = this.getCylinderHeight();

    const cylinderVolume = Math.PI * r * r * h;
    const sphereVolume = (4.0 / 3.0) * Math.PI * r * r * r;

    return cylinderVolume + sphereVolume;
  }

  /**
   * Finds support point in given direction (for GJK algorithm).
   *
   * @param direction - Direction vector
   * @param transform - World transform matrix
   * @returns Support point in world space
   */
  support(direction: Vector3, transform: Matrix4): Vector3 {
    // Transform direction to local space
    const invTransform = transform.invert();
    if (!invTransform) {
      return this.transformPoint(this.offset, transform);
    }

    const localDir = this.transformDirection(direction, invTransform).normalize();

    // Get segment endpoints in local space
    const [p1, p2] = this.getSegmentEndpoints();

    // Choose endpoint in direction
    const dot1 = p1.dot(localDir);
    const dot2 = p2.dot(localDir);
    const endpoint = dot1 > dot2 ? p1 : p2;

    // Support point is endpoint + radius in direction
    const support = endpoint.add(localDir.scale(this.radius));

    // Apply offset and transform to world space
    const offsetSupport = support.add(this.offset);
    return this.transformPoint(offsetSupport, transform);
  }

  /**
   * Creates a copy of this shape.
   *
   * @returns New capsule shape with same properties
   */
  clone(): CapsuleShape {
    return new CapsuleShape(this.height, this.radius, this.axis, this.offset.clone());
  }

  /**
   * Transforms a point by a matrix.
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
   */
  private transformDirection(direction: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = direction.x * e[0] + direction.y * e[4] + direction.z * e[8];
    const y = direction.x * e[1] + direction.y * e[5] + direction.z * e[9];
    const z = direction.x * e[2] + direction.y * e[6] + direction.z * e[10];
    return new Vector3(x, y, z);
  }

  /**
   * Extracts scale from a transform matrix.
   */
  private getScale(matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const scaleX = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    const scaleY = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
    const scaleZ = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
    return new Vector3(scaleX, scaleY, scaleZ);
  }

  /**
   * Creates a character controller capsule.
   * Standard proportions for humanoid characters.
   *
   * @param height - Character height
   * @returns New capsule shape
   *
   * @example
   * ```typescript
   * const character = CapsuleShape.character(1.8); // 1.8m tall human
   * ```
   */
  static character(height: number): CapsuleShape {
    const radius = height * 0.25; // 25% of height
    return new CapsuleShape(height, radius, CapsuleAxis.Y);
  }
}
