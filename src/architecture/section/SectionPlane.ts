/**
 * SectionPlane.ts
 * Section plane definition and operations
 * Part of G3D 5.0 Architecture/BIM Module
 */

import { Vector3, Matrix4, Ray } from '../../math';
import { ISectionPlane, PointClassification, ISectionIntersection } from './SectionTypes';
import { SECTION_TOLERANCE } from './SectionConfig';

/**
 * Section plane for architectural cutting and clipping
 *
 * @example
 * ```typescript
 * // Create a horizontal section plane at Z=10
 * const section = new SectionPlane({
 *   normal: new Vector3(0, 0, 1),
 *   distance: 10
 * });
 *
 * // Test point classification
 * const point = new Vector3(5, 5, 15);
 * const classification = section.classifyPoint(point);
 *
 * // Rotate the plane
 * section.rotateAroundAxis(new Vector3(1, 0, 0), Math.PI / 4);
 * ```
 */
export class SectionPlane implements ISectionPlane {
  /** Plane normal vector (automatically normalized) */
  public normal: Vector3;

  /** Signed distance from origin along normal */
  public distance: number;

  /** Is this section plane enabled */
  public enabled: boolean;

  /** Optional name for the section */
  public name?: string;

  /**
   * Create a new section plane
   * @param options - Section plane options
   */
  constructor(options: Partial<ISectionPlane> = {}) {
    this.normal = options.normal ? options.normal.clone().normalize() : new Vector3(0, 0, 1);
    this.distance = options.distance ?? 0;
    this.enabled = options.enabled ?? true;
    this.name = options.name;
  }

  /**
   * Clone this section plane
   * @returns New section plane instance
   */
  public clone(): SectionPlane {
    return new SectionPlane({
      normal: this.normal.clone(),
      distance: this.distance,
      enabled: this.enabled,
      name: this.name
    });
  }

  /**
   * Set plane from three points
   * @param p1 - First point
   * @param p2 - Second point
   * @param p3 - Third point
   */
  public setFromPoints(p1: Vector3, p2: Vector3, p3: Vector3): this {
    const v1 = p2.clone().subtract(p1);
    const v2 = p3.clone().subtract(p1);
    this.normal = v1.cross(v2).normalize();
    this.distance = this.normal.dot(p1);
    return this;
  }

  /**
   * Set plane from normal and point
   * @param normal - Plane normal
   * @param point - Point on plane
   */
  public setFromNormalAndPoint(normal: Vector3, point: Vector3): this {
    this.normal = normal.clone().normalize();
    this.distance = this.normal.dot(point);
    return this;
  }

  /**
   * Set plane from coefficients (Ax + By + Cz + D = 0)
   * @param a - X coefficient
   * @param b - Y coefficient
   * @param c - Z coefficient
   * @param d - Distance coefficient
   */
  public setFromCoefficients(a: number, b: number, c: number, d: number): this {
    const length = Math.sqrt(a * a + b * b + c * c);
    this.normal = new Vector3(a / length, b / length, c / length);
    this.distance = -d / length;
    return this;
  }

  /**
   * Get plane coefficients [A, B, C, D] where Ax + By + Cz + D = 0
   * @returns Plane coefficients
   */
  public getCoefficients(): Float32Array {
    return new Float32Array([
      this.normal.x,
      this.normal.y,
      this.normal.z,
      -this.distance
    ]);
  }

  /**
   * Get a point on the plane
   * @returns Point on plane
   */
  public getPoint(): Vector3 {
    return this.normal.clone().scale(this.distance);
  }

  /**
   * Calculate signed distance from point to plane
   * @param point - Point to test
   * @returns Signed distance (positive = front, negative = back)
   */
  public distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) - this.distance;
  }

  /**
   * Classify point relative to plane
   * @param point - Point to classify
   * @returns Point classification
   */
  public classifyPoint(point: Vector3): PointClassification {
    const dist = this.distanceToPoint(point);
    if (Math.abs(dist) < SECTION_TOLERANCE.planeTolerance) {
      return PointClassification.ON;
    }
    return dist > 0 ? PointClassification.FRONT : PointClassification.BACK;
  }

  /**
   * Project point onto plane
   * @param point - Point to project
   * @returns Projected point
   */
  public projectPoint(point: Vector3): Vector3 {
    const dist = this.distanceToPoint(point);
    return point.clone().subtract(this.normal.clone().scale(dist));
  }

  /**
   * Intersect ray with plane
   * @param ray - Ray to intersect
   * @returns Intersection result
   */
  public intersectRay(ray: Ray): ISectionIntersection {
    const denominator = this.normal.dot(ray.direction);

    // Ray parallel to plane
    if (Math.abs(denominator) < SECTION_TOLERANCE.intersectionTolerance) {
      return {
        point: new Vector3(),
        distance: 0,
        valid: false
      };
    }

    const t = (this.distance - this.normal.dot(ray.origin)) / denominator;

    // Intersection behind ray origin
    if (t < 0) {
      return {
        point: new Vector3(),
        distance: t,
        valid: false
      };
    }

    const point = ray.origin.clone().add(ray.direction.clone().scale(t));

    return {
      point,
      distance: t,
      valid: true
    };
  }

  /**
   * Intersect line segment with plane
   * @param p1 - Start point
   * @param p2 - End point
   * @returns Intersection point or null if no intersection
   */
  public intersectSegment(p1: Vector3, p2: Vector3): Vector3 | null {
    const d1 = this.distanceToPoint(p1);
    const d2 = this.distanceToPoint(p2);

    // Both points on same side
    if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) {
      return null;
    }

    // One point on plane
    if (Math.abs(d1) < SECTION_TOLERANCE.planeTolerance) {
      return p1.clone();
    }
    if (Math.abs(d2) < SECTION_TOLERANCE.planeTolerance) {
      return p2.clone();
    }

    // Interpolate intersection point
    const t = d1 / (d1 - d2);
    return p1.clone().lerp(p2, t);
  }

  /**
   * Translate plane along its normal
   * @param offset - Distance to translate
   */
  public translate(offset: number): this {
    this.distance += offset;
    return this;
  }

  /**
   * Translate plane by vector
   * @param vector - Translation vector
   */
  public translateByVector(vector: Vector3): this {
    this.distance += this.normal.dot(vector);
    return this;
  }

  /**
   * Rotate plane around arbitrary axis
   * @param axis - Rotation axis
   * @param angle - Rotation angle in radians
   */
  public rotateAroundAxis(axis: Vector3, angle: number): this {
    const rotation = Matrix4.createRotationAxis(axis.normalize(), angle);
    this.normal = rotation.transformVector(this.normal).normalize();
    return this;
  }

  /**
   * Rotate plane around point
   * @param point - Rotation center
   * @param axis - Rotation axis
   * @param angle - Rotation angle in radians
   */
  public rotateAroundPoint(point: Vector3, axis: Vector3, angle: number): this {
    // Get current plane point
    const planePoint = this.getPoint();

    // Rotate normal
    const rotation = Matrix4.createRotationAxis(axis.normalize(), angle);
    this.normal = rotation.transformVector(this.normal).normalize();

    // Rotate plane point around given point
    const relativePoint = planePoint.subtract(point);
    const rotatedPoint = rotation.transformPoint(relativePoint).add(point);

    // Update distance
    this.distance = this.normal.dot(rotatedPoint);

    return this;
  }

  /**
   * Transform plane by matrix
   * @param matrix - Transformation matrix
   */
  public transform(matrix: Matrix4): this {
    const planePoint = this.getPoint();
    const transformedPoint = matrix.transformPoint(planePoint);
    const transformedNormal = matrix.transformVector(this.normal).normalize();

    this.normal = transformedNormal;
    this.distance = this.normal.dot(transformedPoint);

    return this;
  }

  /**
   * Flip plane normal (reverse direction)
   */
  public flip(): this {
    this.normal.scale(-1);
    this.distance = -this.distance;
    return this;
  }

  /**
   * Check if this plane is equal to another
   * @param other - Other plane
   * @param tolerance - Comparison tolerance
   * @returns True if planes are equal
   */
  public equals(other: SectionPlane, tolerance: number = SECTION_TOLERANCE.planeTolerance): boolean {
    return (
      Math.abs(this.normal.x - other.normal.x) < tolerance &&
      Math.abs(this.normal.y - other.normal.y) < tolerance &&
      Math.abs(this.normal.z - other.normal.z) < tolerance &&
      Math.abs(this.distance - other.distance) < tolerance
    );
  }

  /**
   * Check if plane is parallel to another
   * @param other - Other plane
   * @param tolerance - Angular tolerance
   * @returns True if planes are parallel
   */
  public isParallel(other: SectionPlane, tolerance: number = 1e-4): boolean {
    const dot = Math.abs(this.normal.dot(other.normal));
    return Math.abs(dot - 1) < tolerance;
  }

  /**
   * Check if plane is perpendicular to another
   * @param other - Other plane
   * @param tolerance - Angular tolerance
   * @returns True if planes are perpendicular
   */
  public isPerpendicular(other: SectionPlane, tolerance: number = 1e-4): boolean {
    const dot = Math.abs(this.normal.dot(other.normal));
    return dot < tolerance;
  }

  /**
   * Get plane as string representation
   * @returns String representation
   */
  public toString(): string {
    return `SectionPlane(normal: ${this.normal.toString()}, distance: ${this.distance.toFixed(3)}, enabled: ${this.enabled})`;
  }

  /**
   * Convert to JSON
   * @returns JSON representation
   */
  public toJSON(): any {
    return {
      normal: this.normal.toArray(),
      distance: this.distance,
      enabled: this.enabled,
      name: this.name
    };
  }

  /**
   * Create from JSON
   * @param json - JSON data
   * @returns New section plane
   */
  public static fromJSON(json: any): SectionPlane {
    return new SectionPlane({
      normal: new Vector3(json.normal[0], json.normal[1], json.normal[2]),
      distance: json.distance,
      enabled: json.enabled,
      name: json.name
    });
  }

  /**
   * Create horizontal section plane
   * @param height - Z height
   * @param name - Optional name
   * @returns New section plane
   */
  public static createHorizontal(height: number, name?: string): SectionPlane {
    return new SectionPlane({
      normal: new Vector3(0, 0, 1),
      distance: height,
      name: name || `Horizontal Section @ ${height.toFixed(2)}`
    });
  }

  /**
   * Create vertical section plane
   * @param axis - Axis direction (X or Y)
   * @param position - Position along axis
   * @param name - Optional name
   * @returns New section plane
   */
  public static createVertical(axis: 'x' | 'y', position: number, name?: string): SectionPlane {
    const normal = axis === 'x' ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    return new SectionPlane({
      normal,
      distance: position,
      name: name || `Vertical Section (${axis.toUpperCase()}) @ ${position.toFixed(2)}`
    });
  }
}
