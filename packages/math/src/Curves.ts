import { Vector3 } from "./Vector3.js";

export interface CurveSample {
  readonly position: Vector3;
  readonly tangent: Vector3;
}

export class CatmullRomCurve3 {
  constructor(public readonly points: readonly Vector3[]) {
    if (points.length < 2) throw new Error("CatmullRomCurve3 requires at least two points.");
  }

  getPoint(t: number): Vector3 {
    const clamped = clamp01(t);
    const scaled = clamped * (this.points.length - 1);
    const index = Math.min(Math.floor(scaled), this.points.length - 2);
    const localT = scaled - index;
    const p0 = this.points[Math.max(0, index - 1)]!;
    const p1 = this.points[index]!;
    const p2 = this.points[index + 1]!;
    const p3 = this.points[Math.min(this.points.length - 1, index + 2)]!;
    return catmullRom(p0, p1, p2, p3, localT);
  }

  getTangent(t: number): Vector3 {
    const delta = 1e-4;
    const before = this.getPoint(Math.max(0, t - delta));
    const after = this.getPoint(Math.min(1, t + delta));
    return after.subtract(before).normalize();
  }

  sample(t: number): CurveSample {
    return { position: this.getPoint(t), tangent: this.getTangent(t) };
  }
}

export class CubicBezierCurve3 {
  constructor(
    public readonly p0: Vector3,
    public readonly p1: Vector3,
    public readonly p2: Vector3,
    public readonly p3: Vector3
  ) {}

  getPoint(t: number): Vector3 {
    const u = 1 - clamp01(t);
    const tt = clamp01(t) * clamp01(t);
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * clamp01(t);
    return this.p0.multiplyScalar(uuu)
      .add(this.p1.multiplyScalar(3 * uu * clamp01(t)))
      .add(this.p2.multiplyScalar(3 * u * tt))
      .add(this.p3.multiplyScalar(ttt));
  }

  getTangent(t: number): Vector3 {
    const u = 1 - clamp01(t);
    return this.p1.subtract(this.p0).multiplyScalar(3 * u * u)
      .add(this.p2.subtract(this.p1).multiplyScalar(6 * u * clamp01(t)))
      .add(this.p3.subtract(this.p2).multiplyScalar(3 * clamp01(t) * clamp01(t)))
      .normalize();
  }
}

function catmullRom(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return p1.multiplyScalar(2)
    .add(p2.subtract(p0).multiplyScalar(t))
    .add(p0.multiplyScalar(2).subtract(p1.multiplyScalar(5)).add(p2.multiplyScalar(4)).subtract(p3).multiplyScalar(t2))
    .add(p3.subtract(p0).add(p1.multiplyScalar(3).subtract(p2.multiplyScalar(3))).multiplyScalar(t3))
    .multiplyScalar(0.5);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Curve parameter must be finite.");
  return Math.min(1, Math.max(0, value));
}
