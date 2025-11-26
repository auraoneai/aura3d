/**
 * Spline curves for animation paths and procedural geometry.
 * Supports multiple spline types with arc-length parameterization and Frenet frames.
 * @module Spline
 */

import { Vector3 } from './Vector3';
import { clamp } from './MathConstants';

/**
 * Enumeration of supported spline interpolation types.
 */
export enum SplineType {
  /** Linear interpolation between points */
  LINEAR = 'linear',
  /** Catmull-Rom spline with configurable tension */
  CATMULL_ROM = 'catmull-rom',
  /** Cubic Bezier spline with explicit control points */
  BEZIER = 'bezier',
  /** B-spline for smooth approximation */
  B_SPLINE = 'b-spline',
  /** Hermite spline with tangent control */
  HERMITE = 'hermite'
}

/**
 * Represents a Frenet frame at a point on the spline.
 */
interface FrenetFrame {
  /** Tangent vector (direction of the curve) */
  tangent: Vector3;
  /** Normal vector (perpendicular to tangent) */
  normal: Vector3;
  /** Binormal vector (cross product of tangent and normal) */
  binormal: Vector3;
}

/**
 * Spline class for creating smooth curves through control points.
 * Supports multiple interpolation types, arc-length parameterization, and Frenet frame calculation.
 * Performance: Point evaluation < 0.01ms
 *
 * @example
 * ```typescript
 * // Create a Catmull-Rom spline for smooth animation paths
 * const points = [
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 2, 0),
 *   new Vector3(3, 2, 0),
 *   new Vector3(4, 0, 0)
 * ];
 * const spline = Spline.fromCatmullRom(points, 0.5);
 *
 * // Sample points along the curve
 * const position = spline.getPoint(0.5);           // Get point at t=0.5
 * const tangent = spline.getTangent(0.5);          // Get tangent direction
 * const spacedPoints = spline.getSpacedPoints(10); // Get 10 evenly spaced points
 *
 * // Arc-length parameterization
 * const length = spline.getLength();               // Total curve length
 * const t = spline.getTAtLength(length * 0.5);     // t value at midpoint by arc length
 *
 * // Frenet frame for extrusion
 * const frame = spline.getFrenetFrame(0.5);
 * ```
 *
 * @example
 * ```typescript
 * // Create a closed loop for particle trails
 * const loop = new Spline([
 *   new Vector3(1, 0, 0),
 *   new Vector3(0, 1, 0),
 *   new Vector3(-1, 0, 0),
 *   new Vector3(0, -1, 0)
 * ], SplineType.CATMULL_ROM);
 * loop.closed = true;
 * loop.tension = 0.5;
 *
 * // Sample the loop
 * const loopPoints = loop.getSpacedPoints(100);
 * ```
 *
 * @example
 * ```typescript
 * // Create a Bezier curve for procedural geometry
 * const bezier = Spline.fromBezier([
 *   new Vector3(0, 0, 0),
 *   new Vector3(1, 3, 0),
 *   new Vector3(2, 3, 0),
 *   new Vector3(3, 0, 0)
 * ]);
 *
 * // Get Frenet frame for mesh extrusion
 * const divisions = 20;
 * for (let i = 0; i <= divisions; i++) {
 *   const t = i / divisions;
 *   const frame = bezier.getFrenetFrame(t);
 *   // Use frame.tangent, frame.normal, frame.binormal for extrusion
 * }
 * ```
 */
export class Spline {
  /** Control points defining the spline curve */
  points: Vector3[];

  /** Interpolation type for the spline */
  type: SplineType;

  /** Whether the spline forms a closed loop */
  closed: boolean;

  /** Tension parameter for Catmull-Rom (0 = uniform, 0.5 = centripetal, 1 = chordal) */
  tension: number;

  /** Cached arc-length lookup table for fast arc-length parameterization */
  private arcLengthCache: number[] | null = null;

  /** Number of divisions used for arc-length cache */
  private arcLengthDivisions: number = 200;

  /**
   * Creates a new Spline instance.
   *
   * @param points - Control points for the spline (default: empty array)
   * @param type - Spline interpolation type (default: CATMULL_ROM)
   *
   * @example
   * ```typescript
   * const spline = new Spline(
   *   [new Vector3(0, 0, 0), new Vector3(1, 1, 0)],
   *   SplineType.LINEAR
   * );
   * ```
   */
  constructor(points: Vector3[] = [], type: SplineType = SplineType.CATMULL_ROM) {
    this.points = points;
    this.type = type;
    this.closed = false;
    this.tension = 0.5;
  }

  /**
   * Evaluates the spline at parameter t.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Point on the spline at parameter t
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 0, 0)
   * ]);
   * const midpoint = spline.getPoint(0.5);
   * ```
   */
  getPoint(t: number): Vector3 {
    t = clamp(t, 0, 1);

    if (this.points.length === 0) {
      return new Vector3();
    }

    if (this.points.length === 1) {
      return this.points[0].clone();
    }

    switch (this.type) {
      case SplineType.LINEAR:
        return this.getPointLinear(t);
      case SplineType.CATMULL_ROM:
        return this.getPointCatmullRom(t);
      case SplineType.BEZIER:
        return this.getPointBezier(t);
      case SplineType.B_SPLINE:
        return this.getPointBSpline(t);
      case SplineType.HERMITE:
        return this.getPointHermite(t);
      default:
        return this.getPointCatmullRom(t);
    }
  }

  /**
   * Gets the tangent (first derivative) at parameter t.
   * The tangent is normalized to unit length.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Normalized tangent vector at parameter t
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const tangent = spline.getTangent(0.5);
   * ```
   */
  getTangent(t: number): Vector3 {
    const delta = 0.0001;
    const t1 = Math.max(t - delta, 0);
    const t2 = Math.min(t + delta, 1);

    const p1 = this.getPoint(t1);
    const p2 = this.getPoint(t2);

    return p2.sub(p1).normalize();
  }

  /**
   * Gets the normal vector at parameter t.
   * The normal is perpendicular to the tangent and lies in the osculating plane.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Normalized normal vector at parameter t
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const normal = spline.getNormal(0.5);
   * ```
   */
  getNormal(t: number): Vector3 {
    const delta = 0.0001;
    const t1 = Math.max(t - delta, 0);
    const t2 = Math.min(t + delta, 1);

    const tangent1 = this.getTangent(t1);
    const tangent2 = this.getTangent(t2);

    const dTangent = tangent2.sub(tangent1);

    if (dTangent.lengthSquared() < 1e-10) {
      const tangent = this.getTangent(t);
      const arbitrary = Math.abs(tangent.y) < 0.99
        ? new Vector3(0, 1, 0)
        : new Vector3(1, 0, 0);
      return tangent.cross(arbitrary).normalize();
    }

    return dTangent.normalize();
  }

  /**
   * Gets the binormal vector at parameter t.
   * The binormal is perpendicular to both the tangent and normal.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Normalized binormal vector at parameter t
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const binormal = spline.getBinormal(0.5);
   * ```
   */
  getBinormal(t: number): Vector3 {
    const tangent = this.getTangent(t);
    const normal = this.getNormal(t);
    return tangent.cross(normal).normalize();
  }

  /**
   * Gets the curvature at parameter t.
   * Curvature measures how quickly the curve changes direction.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Curvature value (higher = sharper turn)
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const curvature = spline.getCurvature(0.5);
   * ```
   */
  getCurvature(t: number): number {
    const delta = 0.0001;
    const t1 = Math.max(t - delta, 0);
    const t2 = Math.min(t + delta, 1);

    const tangent1 = this.getTangent(t1);
    const tangent2 = this.getTangent(t2);

    // Curvature is the rate of change of tangent direction
    const dTangent = tangent2.sub(tangent1);
    const curvature = dTangent.length() / (2 * delta);

    return curvature;
  }

  /**
   * Gets the Frenet frame (tangent, normal, binormal) at parameter t.
   * The Frenet frame forms an orthonormal basis useful for extrusion and mesh generation.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Frenet frame containing tangent, normal, and binormal vectors
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const frame = spline.getFrenetFrame(0.5);
   * console.log(frame.tangent, frame.normal, frame.binormal);
   * ```
   */
  getFrenetFrame(t: number): FrenetFrame {
    const tangent = this.getTangent(t);
    const normal = this.getNormal(t);
    const binormal = tangent.cross(normal).normalize();
    const correctedNormal = binormal.cross(tangent).normalize();

    return {
      tangent,
      normal: correctedNormal,
      binormal
    };
  }

  /**
   * Computes the total arc length of the spline.
   * Uses cached value if available.
   *
   * @returns Total length of the spline curve
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 0, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const length = spline.getLength();
   * ```
   */
  getLength(): number {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1];
  }

  /**
   * Computes arc lengths at regular parameter intervals.
   * Results are cached for performance.
   *
   * @param divisions - Number of divisions for length calculation (default: 200)
   * @returns Array of cumulative arc lengths
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0)
   * ]);
   * const lengths = spline.getLengths(100);
   * ```
   */
  getLengths(divisions?: number): number[] {
    if (divisions !== undefined) {
      this.arcLengthDivisions = divisions;
      this.arcLengthCache = null;
    }

    if (this.arcLengthCache !== null && this.arcLengthDivisions === (divisions ?? this.arcLengthDivisions)) {
      return this.arcLengthCache;
    }

    const cache: number[] = [];
    cache.push(0);

    let last = this.getPoint(0);
    let sum = 0;

    for (let i = 1; i <= this.arcLengthDivisions; i++) {
      const t = i / this.arcLengthDivisions;
      const current = this.getPoint(t);
      sum += Vector3.distance(last, current);
      cache.push(sum);
      last = current;
    }

    this.arcLengthCache = cache;
    return cache;
  }

  /**
   * Gets the arc length from the start of the spline to parameter t.
   *
   * @param t - Parameter in range [0, 1]
   * @returns Arc length from start to parameter t
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0)
   * ]);
   * const lengthAtHalf = spline.getLengthAtT(0.5);
   * ```
   */
  getLengthAtT(t: number): number {
    t = clamp(t, 0, 1);
    const lengths = this.getLengths();
    const targetIndex = t * this.arcLengthDivisions;
    const index = Math.floor(targetIndex);

    if (index >= lengths.length - 1) {
      return lengths[lengths.length - 1];
    }

    const lengthBefore = lengths[index];
    const lengthAfter = lengths[index + 1];
    const segmentLength = lengthAfter - lengthBefore;
    const segmentT = targetIndex - index;

    return lengthBefore + segmentLength * segmentT;
  }

  /**
   * Gets the parameter t corresponding to a given arc length.
   * Enables arc-length parameterization for uniform sampling.
   *
   * @param length - Arc length from the start of the spline
   * @returns Parameter t corresponding to the arc length
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const totalLength = spline.getLength();
   * const t = spline.getTAtLength(totalLength * 0.5); // t at midpoint by arc length
   * ```
   */
  getTAtLength(length: number): number {
    const lengths = this.getLengths();
    const targetLength = clamp(length, 0, lengths[lengths.length - 1]);

    let low = 0;
    let high = lengths.length - 1;
    let index = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lengths[mid] < targetLength) {
        low = mid + 1;
        index = mid;
      } else if (lengths[mid] > targetLength) {
        high = mid - 1;
      } else {
        index = mid;
        break;
      }
    }

    if (index >= lengths.length - 1) {
      return 1;
    }

    const lengthBefore = lengths[index];
    const lengthAfter = lengths[index + 1];
    const segmentLength = lengthAfter - lengthBefore;

    const segmentT = segmentLength === 0 ? 0 : (targetLength - lengthBefore) / segmentLength;

    return (index + segmentT) / this.arcLengthDivisions;
  }

  /**
   * Samples points along the spline at regular parameter intervals.
   *
   * @param divisions - Number of divisions (returns divisions + 1 points)
   * @returns Array of points sampled at regular parameter intervals
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const points = spline.getPoints(10); // Returns 11 points
   * ```
   */
  getPoints(divisions: number): Vector3[] {
    const points: Vector3[] = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      points.push(this.getPoint(t));
    }

    return points;
  }

  /**
   * Samples points evenly spaced by arc length along the spline.
   * Provides uniform spacing regardless of parameter distribution.
   *
   * @param count - Number of points to sample
   * @returns Array of evenly spaced points by arc length
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * const spacedPoints = spline.getSpacedPoints(20); // 20 evenly spaced points
   * ```
   */
  getSpacedPoints(count: number): Vector3[] {
    const points: Vector3[] = [];
    const totalLength = this.getLength();

    for (let i = 0; i < count; i++) {
      const targetLength = (i / (count - 1)) * totalLength;
      const t = this.getTAtLength(targetLength);
      points.push(this.getPoint(t));
    }

    return points;
  }

  /**
   * Adds a control point to the end of the spline.
   * Invalidates arc-length cache.
   *
   * @param point - Point to add
   *
   * @example
   * ```typescript
   * const spline = new Spline();
   * spline.addPoint(new Vector3(0, 0, 0));
   * spline.addPoint(new Vector3(1, 1, 0));
   * ```
   */
  addPoint(point: Vector3): void {
    this.points.push(point);
    this.invalidateCache();
  }

  /**
   * Removes a control point at the specified index.
   * Invalidates arc-length cache.
   *
   * @param index - Index of the point to remove
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * spline.removePoint(1); // Removes middle point
   * ```
   */
  removePoint(index: number): void {
    if (index >= 0 && index < this.points.length) {
      this.points.splice(index, 1);
      this.invalidateCache();
    }
  }

  /**
   * Updates a control point at the specified index.
   * Invalidates arc-length cache.
   *
   * @param index - Index of the point to update
   * @param point - New point value
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0)
   * ]);
   * spline.updatePoint(1, new Vector3(2, 2, 0));
   * ```
   */
  updatePoint(index: number, point: Vector3): void {
    if (index >= 0 && index < this.points.length) {
      this.points[index] = point;
      this.invalidateCache();
    }
  }

  /**
   * Reverses the order of control points.
   * Invalidates arc-length cache.
   *
   * @example
   * ```typescript
   * const spline = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0),
   *   new Vector3(2, 0, 0)
   * ]);
   * spline.reverse();
   * ```
   */
  reverse(): void {
    this.points.reverse();
    this.invalidateCache();
  }

  /**
   * Creates a deep copy of this spline.
   *
   * @returns New spline instance with copied data
   *
   * @example
   * ```typescript
   * const spline1 = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0)
   * ]);
   * const spline2 = spline1.clone();
   * ```
   */
  clone(): Spline {
    const cloned = new Spline(
      this.points.map(p => p.clone()),
      this.type
    );
    cloned.closed = this.closed;
    cloned.tension = this.tension;
    return cloned;
  }

  /**
   * Copies data from another spline to this spline.
   *
   * @param s - Spline to copy from
   * @returns This spline for chaining
   *
   * @example
   * ```typescript
   * const spline1 = Spline.fromCatmullRom([
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 1, 0)
   * ]);
   * const spline2 = new Spline();
   * spline2.copy(spline1);
   * ```
   */
  copy(s: Spline): this {
    this.points = s.points.map(p => p.clone());
    this.type = s.type;
    this.closed = s.closed;
    this.tension = s.tension;
    this.invalidateCache();
    return this;
  }

  /**
   * Creates a Catmull-Rom spline with the specified points and tension.
   *
   * @param points - Control points for the spline
   * @param tension - Tension parameter (0 = uniform, 0.5 = centripetal, 1 = chordal)
   * @param closed - Whether the spline forms a closed loop
   * @returns New Catmull-Rom spline
   *
   * @example
   * ```typescript
   * const points = [
   *   new Vector3(0, 0, 0),
   *   new Vector3(1, 2, 0),
   *   new Vector3(3, 2, 0),
   *   new Vector3(4, 0, 0)
   * ];
   * const spline = Spline.fromCatmullRom(points, 0.5, false);
   * ```
   */
  static fromCatmullRom(points: Vector3[], tension: number = 0.5, closed: boolean = false): Spline {
    const spline = new Spline(points, SplineType.CATMULL_ROM);
    spline.tension = tension;
    spline.closed = closed;
    return spline;
  }

  /**
   * Creates a cubic Bezier spline with explicit control points.
   * Requires exactly 4 control points or multiples of 4 for multiple segments.
   *
   * @param controlPoints - Control points for the Bezier curve (must be multiple of 4)
   * @returns New Bezier spline
   *
   * @example
   * ```typescript
   * const bezier = Spline.fromBezier([
   *   new Vector3(0, 0, 0),    // Start point
   *   new Vector3(1, 3, 0),    // Control point 1
   *   new Vector3(2, 3, 0),    // Control point 2
   *   new Vector3(3, 0, 0)     // End point
   * ]);
   * ```
   */
  static fromBezier(controlPoints: Vector3[]): Spline {
    const spline = new Spline(controlPoints, SplineType.BEZIER);
    return spline;
  }

  /**
   * Invalidates the arc-length cache.
   * Called automatically when control points are modified.
   */
  private invalidateCache(): void {
    this.arcLengthCache = null;
  }

  /**
   * Gets a point on a linear spline at parameter t.
   */
  private getPointLinear(t: number): Vector3 {
    const p = (this.points.length - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    const weight = p - intPoint;

    if (this.closed) {
      intPoint = intPoint % this.points.length;
    } else {
      if (weight === 0 && intPoint === this.points.length - 1) {
        intPoint = this.points.length - 2;
      }
    }

    const p0 = this.points[intPoint];
    const p1 = this.points[this.closed ? (intPoint + 1) % this.points.length : Math.min(intPoint + 1, this.points.length - 1)];

    return p0.lerp(p1, weight);
  }

  /**
   * Gets a point on a Catmull-Rom spline at parameter t.
   */
  private getPointCatmullRom(t: number): Vector3 {
    const points = this.points;
    const l = points.length;

    if (l < 2) {
      return points[0]?.clone() ?? new Vector3();
    }

    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    let weight = p - intPoint;

    if (this.closed) {
      intPoint = intPoint % l;
    } else {
      if (weight === 0 && intPoint === l - 1) {
        intPoint = l - 2;
        weight = 1;
      }
    }

    let p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3;

    if (this.closed || intPoint > 0) {
      p0 = points[(intPoint - 1 + l) % l];
    } else {
      p0 = points[0].scale(2).sub(points[1]);
    }

    p1 = points[intPoint % l];
    p2 = points[(intPoint + 1) % l];

    if (this.closed || intPoint + 2 < l) {
      p3 = points[(intPoint + 2) % l];
    } else {
      p3 = points[l - 1].scale(2).sub(points[l - 2]);
    }

    const tension = this.tension;

    if (tension === 0.5) {
      return this.catmullRomCentripetal(p0, p1, p2, p3, weight);
    } else if (tension === 0) {
      return this.catmullRomUniform(p0, p1, p2, p3, weight);
    } else {
      return this.catmullRomChordal(p0, p1, p2, p3, weight, tension);
    }
  }

  /**
   * Uniform Catmull-Rom interpolation.
   */
  private catmullRomUniform(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;

    const v0 = p1;
    const v1 = p2.sub(p0).scale(0.5);
    const v2 = p0.scale(1).sub(p1.scale(2.5)).add(p2.scale(2)).sub(p3.scale(0.5));
    const v3 = p1.scale(1.5).sub(p2.scale(1.5)).add(p3.sub(p0).scale(0.5));

    return v0.add(v1.scale(t)).add(v2.scale(t2)).add(v3.scale(t3));
  }

  /**
   * Centripetal Catmull-Rom interpolation.
   */
  private catmullRomCentripetal(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
    const pow = 0.5;
    let dt0 = Math.pow(Vector3.distanceSquared(p0, p1), pow);
    let dt1 = Math.pow(Vector3.distanceSquared(p1, p2), pow);
    let dt2 = Math.pow(Vector3.distanceSquared(p2, p3), pow);

    if (dt1 < 1e-10) dt1 = 1.0;
    if (dt0 < 1e-10) dt0 = dt1;
    if (dt2 < 1e-10) dt2 = dt1;

    const t1 = p1.sub(p0).scale(1 / dt0).sub(p2.sub(p0).scale(1 / (dt0 + dt1))).add(p2.sub(p1).scale(1 / dt1)).scale(dt1);
    const t2 = p2.sub(p1).scale(1 / dt1).sub(p3.sub(p1).scale(1 / (dt1 + dt2))).add(p3.sub(p2).scale(1 / dt2)).scale(dt1);

    const c0 = p1;
    const c1 = t1;
    const c2 = p1.scale(-3).add(p2.scale(3)).sub(t1.scale(2)).sub(t2);
    const c3 = p1.scale(2).sub(p2.scale(2)).add(t1).add(t2);

    const tSquared = t * t;
    const tCubed = tSquared * t;

    return c0.add(c1.scale(t)).add(c2.scale(tSquared)).add(c3.scale(tCubed));
  }

  /**
   * Chordal Catmull-Rom interpolation with custom tension.
   */
  private catmullRomChordal(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number, tension: number): Vector3 {
    const pow = tension;
    let dt0 = Math.pow(Vector3.distanceSquared(p0, p1), pow);
    let dt1 = Math.pow(Vector3.distanceSquared(p1, p2), pow);
    let dt2 = Math.pow(Vector3.distanceSquared(p2, p3), pow);

    if (dt1 < 1e-10) dt1 = 1.0;
    if (dt0 < 1e-10) dt0 = dt1;
    if (dt2 < 1e-10) dt2 = dt1;

    const t1 = p1.sub(p0).scale(1 / dt0).sub(p2.sub(p0).scale(1 / (dt0 + dt1))).add(p2.sub(p1).scale(1 / dt1)).scale(dt1);
    const t2 = p2.sub(p1).scale(1 / dt1).sub(p3.sub(p1).scale(1 / (dt1 + dt2))).add(p3.sub(p2).scale(1 / dt2)).scale(dt1);

    const c0 = p1;
    const c1 = t1;
    const c2 = p1.scale(-3).add(p2.scale(3)).sub(t1.scale(2)).sub(t2);
    const c3 = p1.scale(2).sub(p2.scale(2)).add(t1).add(t2);

    const tSquared = t * t;
    const tCubed = tSquared * t;

    return c0.add(c1.scale(t)).add(c2.scale(tSquared)).add(c3.scale(tCubed));
  }

  /**
   * Gets a point on a cubic Bezier spline at parameter t.
   */
  private getPointBezier(t: number): Vector3 {
    const points = this.points;
    const numSegments = Math.floor((points.length - 1) / 3);

    if (numSegments === 0) {
      return points[0]?.clone() ?? new Vector3();
    }

    const segment = Math.min(Math.floor(t * numSegments), numSegments - 1);
    const localT = (t * numSegments) - segment;

    const i = segment * 3;
    const p0 = points[i];
    const p1 = points[i + 1];
    const p2 = points[i + 2];
    const p3 = points[i + 3];

    const mt = 1 - localT;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = localT * localT;
    const t3 = t2 * localT;

    return p0.scale(mt3)
      .add(p1.scale(3 * mt2 * localT))
      .add(p2.scale(3 * mt * t2))
      .add(p3.scale(t3));
  }

  /**
   * Gets a point on a B-spline at parameter t.
   */
  private getPointBSpline(t: number): Vector3 {
    const points = this.points;
    const l = points.length;

    if (l < 4) {
      return this.getPointLinear(t);
    }

    const p = (l - 3) * t;
    let intPoint = Math.floor(p);
    const weight = p - intPoint;

    if (this.closed) {
      intPoint = intPoint % l;
    } else {
      intPoint = Math.min(intPoint, l - 4);
    }

    const p0 = points[intPoint % l];
    const p1 = points[(intPoint + 1) % l];
    const p2 = points[(intPoint + 2) % l];
    const p3 = points[(intPoint + 3) % l];

    const t2 = weight * weight;
    const t3 = t2 * weight;

    const w0 = (1 - weight) * (1 - weight) * (1 - weight) / 6;
    const w1 = (3 * t3 - 6 * t2 + 4) / 6;
    const w2 = (-3 * t3 + 3 * t2 + 3 * weight + 1) / 6;
    const w3 = t3 / 6;

    return p0.scale(w0)
      .add(p1.scale(w1))
      .add(p2.scale(w2))
      .add(p3.scale(w3));
  }

  /**
   * Gets a point on a Hermite spline at parameter t.
   * Uses automatic tangent calculation based on neighboring points.
   */
  private getPointHermite(t: number): Vector3 {
    const points = this.points;
    const l = points.length;

    if (l < 2) {
      return points[0]?.clone() ?? new Vector3();
    }

    const p = (l - (this.closed ? 0 : 1)) * t;
    let intPoint = Math.floor(p);
    const weight = p - intPoint;

    if (this.closed) {
      intPoint = intPoint % l;
    } else {
      if (weight === 0 && intPoint === l - 1) {
        intPoint = l - 2;
      }
    }

    const p0 = points[intPoint % l];
    const p1 = points[(intPoint + 1) % l];

    let m0: Vector3, m1: Vector3;

    if (this.closed || intPoint > 0) {
      const pPrev = points[(intPoint - 1 + l) % l];
      m0 = p1.sub(pPrev).scale(0.5 * this.tension);
    } else {
      m0 = p1.sub(p0).scale(this.tension);
    }

    if (this.closed || intPoint + 2 < l) {
      const pNext = points[(intPoint + 2) % l];
      m1 = pNext.sub(p0).scale(0.5 * this.tension);
    } else {
      m1 = p1.sub(p0).scale(this.tension);
    }

    const t2 = weight * weight;
    const t3 = t2 * weight;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + weight;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return p0.scale(h00)
      .add(m0.scale(h10))
      .add(p1.scale(h01))
      .add(m1.scale(h11));
  }
}
