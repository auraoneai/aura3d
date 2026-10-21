import { Vector2 } from "../Vector2.js";
import { Vector3 } from "../Vector3.js";
import { CurveBase } from "./CurveBase.js";
import { LineCurve } from "./LineCurve.js";
import { LineCurve3 } from "./LineCurve3.js";

/** Component equality across the Vector2 | Vector3 union. */
function vecEquals(a: Vector2 | Vector3, b: Vector2 | Vector3): boolean {
  if (a instanceof Vector2 && b instanceof Vector2) return a.equals(b);
  if (a instanceof Vector3 && b instanceof Vector3) return a.equals(b);
  return false;
}

/**
 * Concatenation of curves parameterized over the total arc length —
 * three.js `CurvePath` parity (per-curve length cache, `getCurveLengths`,
 * `autoClose`, `closePath`).
 */
export class CurvePath<V extends Vector2 | Vector3> extends CurveBase<V> {
  readonly curves: CurveBase<V>[] = [];

  /** When true, `getPoints`/`getSpacedPoints` append the first point. */
  autoClose = false;

  /** Per-subcurve cumulative length cache (three.js `cacheLengths`). */
  protected cacheLengths: number[] | null = null;

  add(curve: CurveBase<V>): void {
    this.curves.push(curve);
  }

  /**
   * Appends a `LineCurve`/`LineCurve3` from the last curve's end back to the
   * first curve's start when they differ.
   */
  closePath(): this {
    const startPoint = this.curves[0]!.getPoint(0);
    const endPoint = this.curves[this.curves.length - 1]!.getPoint(1);
    if (!vecEquals(startPoint, endPoint)) {
      if (startPoint instanceof Vector2) {
        this.curves.push(new LineCurve(endPoint as Vector2, startPoint) as unknown as CurveBase<V>);
      } else {
        this.curves.push(new LineCurve3(endPoint as Vector3, startPoint) as unknown as CurveBase<V>);
      }
    }
    return this;
  }

  getPoint(t: number): V {
    if (this.curves.length === 0) throw new RangeError("CurvePath is empty.");
    // locate the sub-curve covering arc-length distance d = t * total length
    const d = t * this.getLength();
    const curveLengths = this.getCurveLengths();
    let i = 0;
    while (i < curveLengths.length) {
      if (curveLengths[i]! >= d) {
        const diff = curveLengths[i]! - d;
        const curve = this.curves[i]!;
        const segmentLength = curve.getLength();
        const u = segmentLength === 0 ? 0 : 1 - diff / segmentLength;
        return curve.getPointAt(u);
      }
      i += 1;
    }
    // t beyond the end: return the last point (three returns null)
    return this.curves[this.curves.length - 1]!.getPoint(1);
  }

  /**
   * Total path length — overrides the base implementation because in a
   * CurvePath `getPoint` depends on `getLength` (three does the same).
   */
  getLength(): number {
    const lens = this.getCurveLengths();
    return lens[lens.length - 1] ?? 0;
  }

  override updateArcLengths(): void {
    this.needsUpdate = true;
    this.cacheLengths = null;
    this.getCurveLengths();
  }

  /** Cumulative sub-curve lengths (cached while `curves` is unchanged). */
  getCurveLengths(): number[] {
    if (this.cacheLengths && this.cacheLengths.length === this.curves.length) {
      return this.cacheLengths;
    }
    const lengths: number[] = [];
    let sums = 0;
    for (const curve of this.curves) {
      sums += curve.getLength();
      lengths.push(sums);
    }
    this.cacheLengths = lengths;
    return lengths;
  }

  getSpacedPoints(divisions = 40): V[] {
    const points: V[] = [];
    for (let i = 0; i <= divisions; i += 1) {
      points.push(this.getPoint(i / divisions));
    }
    if (this.autoClose) {
      points.push(points[0]!);
    }
    return points;
  }

  getPoints(divisions = 12): V[] {
    const points: V[] = [];
    let last: V | undefined;
    for (const curve of this.curves) {
      const c = curve as CurveBase<V> & { isEllipseCurve?: boolean; isLineCurve?: boolean; isLineCurve3?: boolean; isSplineCurve?: boolean; points?: readonly unknown[] };
      const resolution = c.isEllipseCurve
        ? divisions * 2
        : c.isLineCurve || c.isLineCurve3
          ? 1
          : c.isSplineCurve
            ? divisions * (c.points?.length ?? 1)
            : divisions;
      const pts = curve.getPoints(resolution);
      for (const point of pts) {
        if (last && vecEquals(last, point)) continue; // no consecutive duplicates
        points.push(point);
        last = point;
      }
    }
    if (this.autoClose && points.length > 1 && !vecEquals(points[points.length - 1]!, points[0]!)) {
      points.push(points[0]!);
    }
    return points;
  }

  clone(): this {
    const copy = new CurvePath<V>();
    for (const curve of this.curves) copy.add(curve.clone());
    copy.autoClose = this.autoClose;
    return copy as this;
  }
}
