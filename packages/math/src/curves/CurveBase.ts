import { Quaternion } from "../Quaternion.js";
import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import type { Curve, FrenetFrame } from "../Curves.js";

function subVectors<V extends Vector2 | Vector3>(a: V, b: V): V {
  return (a as Vector3).subtract(b as Vector3) as V;
}

function distance(a: Vector2 | Vector3, b: Vector2 | Vector3): number {
  return (a as Vector3).distanceTo(b as Vector3);
}

function clamp01(v: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Abstract base implementing the frozen {@link Curve} contract with three.js
 * `Curve` semantics: cached arc-length table (rebuilt once unless
 * {@link updateArcLengths} is called), binary-search `getUtoTmapping`,
 * finite-difference tangents and rotation-minimizing Frenet frames.
 *
 * Aura3D curves keep their control data in readonly fields; `getPoint` is the
 * only abstract method — everything else derives from it exactly like three.
 */
export abstract class CurveBase<V extends Vector2 | Vector3> implements Curve<V> {
  /** Samples used for the arc-length table (three.js `arcLengthDivisions`). */
  arcLengthDivisions = 200;

  /** Set by {@link updateArcLengths}; invalidates the cached length table. */
  needsUpdate = true;

  protected cacheArcLengths: number[] | null = null;

  /** Parametric point at `t` ∈ [0,1] (implementations define clamping). */
  abstract getPoint(t: number): V;

  getPointAt(u: number): V {
    const t = this.getUtoTmapping(u);
    return this.getPoint(t);
  }

  getPoints(divisions = 5): V[] {
    const points: V[] = [];
    for (let d = 0; d <= divisions; d += 1) {
      points.push(this.getPoint(d / divisions));
    }
    return points;
  }

  getSpacedPoints(divisions = 5): V[] {
    const points: V[] = [];
    for (let d = 0; d <= divisions; d += 1) {
      points.push(this.getPointAt(d / divisions));
    }
    return points;
  }

  getLength(): number {
    const lengths = this.getLengths();
    return lengths[lengths.length - 1]!;
  }

  /**
   * Cumulative arc lengths sampled at `divisions` uniform `t` values. The
   * table is built once and cached until `divisions` changes or
   * {@link updateArcLengths} is invoked (three.js `Curve.getLengths`).
   */
  getLengths(divisions: number = this.arcLengthDivisions): number[] {
    if (
      this.cacheArcLengths !== null &&
      this.cacheArcLengths.length === divisions + 1 &&
      !this.needsUpdate
    ) {
      return this.cacheArcLengths;
    }

    this.needsUpdate = false;

    const cache: number[] = [0];
    let last = this.getPoint(0);
    let sum = 0;
    for (let p = 1; p <= divisions; p += 1) {
      const current = this.getPoint(p / divisions);
      sum += distance(current, last);
      cache.push(sum);
      last = current;
    }
    this.cacheArcLengths = cache;
    return cache;
  }

  updateArcLengths(): void {
    this.needsUpdate = true;
    this.getLengths();
  }

  /**
   * Binary search over the cached arc-length table + linear interpolation,
   * mapping normalized arc length `u` to curve parameter `t`
   * (three.js `Curve.getUtoTmapping`).
   */
  getUtoTmapping(u: number): number {
    const arcLengths = this.getLengths();
    let i = 0;
    const il = arcLengths.length;

    const targetArcLength = u * arcLengths[il - 1]!;

    // binary search
    let low = 0;
    let high = il - 1;
    let comparison: number;
    while (low <= high) {
      i = Math.floor(low + (high - low) / 2);
      comparison = arcLengths[i]! - targetArcLength;
      if (comparison < 0) {
        low = i + 1;
      } else if (comparison > 0) {
        high = i - 1;
      } else {
        high = i;
        break;
      }
    }
    i = high;

    if (arcLengths[i] === targetArcLength) {
      return i / (il - 1);
    }

    const lengthBefore = arcLengths[i]!;
    const lengthAfter = arcLengths[i + 1]!;
    const segmentLength = lengthAfter - lengthBefore;

    const segmentFraction = segmentLength === 0 ? 0 : (targetArcLength - lengthBefore) / segmentLength;

    return (i + segmentFraction) / (il - 1);
  }

  /** Finite-difference unit tangent at `t` (three.js `Curve.getTangent`). */
  getTangent(t: number): V {
    const delta = 0.0001;
    let t1 = t - delta;
    let t2 = t + delta;
    if (t1 < 0) t1 = 0;
    if (t2 > 1) t2 = 1;
    const pt1 = this.getPoint(t1);
    const pt2 = this.getPoint(t2);
    return (subVectors(pt2, pt1) as Vector3).normalize() as V;
  }

  getTangentAt(u: number): V {
    const t = this.getUtoTmapping(u);
    return this.getTangent(t);
  }

  /**
   * Rotation-minimizing tangent/normal/binormal frames — three.js
   * `Curve.computeFrenetFrames`. Only defined for `Vector3` curves; returns
   * `null` for `Vector2` curves.
   */
  computeFrenetFrames(segments: number, closed = false): FrenetFrame | null {
    if (!(this.getPoint(0) instanceof Vector3)) {
      return null;
    }

    const tangents: Vector3[] = [];
    const normals: Vector3[] = [];
    const binormals: Vector3[] = [];

    for (let i = 0; i <= segments; i += 1) {
      const u = i / segments;
      tangents[i] = this.getTangentAt(u) as Vector3;
    }

    // Initial normal: pick the smallest-magnitude tangent axis, orthogonalize.
    let normal = new Vector3(0, 0, 0);
    let min = Number.MAX_VALUE;
    const tx = Math.abs(tangents[0]!.x);
    const ty = Math.abs(tangents[0]!.y);
    const tz = Math.abs(tangents[0]!.z);
    if (tx <= min) {
      min = tx;
      normal = new Vector3(1, 0, 0);
    }
    if (ty <= min) {
      min = ty;
      normal = new Vector3(0, 1, 0);
    }
    if (tz <= min) {
      normal = new Vector3(0, 0, 1);
    }

    const vec0 = tangents[0]!.cross(normal).normalize();
    normals[0] = tangents[0]!.cross(vec0);
    binormals[0] = tangents[0]!.cross(normals[0]!);

    // Parallel transport the frame along the curve.
    for (let i = 1; i <= segments; i += 1) {
      let n = normals[i - 1]!;
      const vec = tangents[i - 1]!.cross(tangents[i]!);
      if (vec.length() > Number.EPSILON) {
        const axis = vec.normalize();
        const theta = Math.acos(clamp01(tangents[i - 1]!.dot(tangents[i]!)));
        n = n.rotateByQuaternion(Quaternion.fromAxisAngle(axis, theta));
      }
      normals[i] = n;
      binormals[i] = tangents[i]!.cross(n);
    }

    if (closed === true) {
      let theta = Math.acos(clamp01(normals[0]!.dot(normals[segments]!)));
      theta /= segments;
      if (tangents[0]!.dot(normals[0]!.cross(normals[segments]!)) > 0) {
        theta = -theta;
      }
      for (let i = 1; i <= segments; i += 1) {
        const n = normals[i]!.rotateByQuaternion(Quaternion.fromAxisAngle(tangents[i]!, theta * i));
        normals[i] = n;
        binormals[i] = tangents[i]!.cross(n);
      }
    }

    return { tangents, normals, binormals };
  }

  clone(): this {
    throw new Error("CurveBase.clone must be implemented by subclasses.");
  }
}
