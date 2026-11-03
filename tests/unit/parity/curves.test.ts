/**
 * Independent numerical fixtures for Aura3D's curve family. References use
 * de Casteljau interpolation, knot-space interpolation and polygon geometry;
 * they do not import another rendering engine or depend on its output.
 */
import { describe, expect, it } from "vitest";
import {
  ArcCurve,
  CatmullRomCurve3,
  ClampedCatmullRomCurve3,
  catmullRomSegment,
  catmullRomSegmentDerivative,
  CubicBezierCurve,
  CubicBezierCurve3,
  CurvePath,
  EllipseCurve,
  LineCurve,
  LineCurve3,
  Path,
  QuadraticBezierCurve,
  QuadraticBezierCurve3,
  Shape,
  ShapeUtils,
  SplineCurve,
  Vector2,
  Vector3,
  type CatmullRomCurveType
} from "@aura3d/math";

type XY = readonly [number, number];
type XYZ = readonly [number, number, number];
type Point = readonly number[];
const NUMERICAL_TIMEOUT_MS = 30_000;

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
function coordinate(rand: () => number): number { return 20 * rand() - 10; }
function point2(rand: () => number): XY { return [coordinate(rand), coordinate(rand)]; }
function point3(rand: () => number): XYZ { return [coordinate(rand), coordinate(rand), coordinate(rand)]; }
function vec2(p: XY): Vector2 { return new Vector2(...p); }
function vec3(p: XYZ): Vector3 { return new Vector3(...p); }
function expect2(actual: { x: number; y: number }, expected: Point, tolerance = 1e-7): void {
  expect(Math.hypot(actual.x - expected[0]!, actual.y - expected[1]!)).toBeLessThanOrEqual(tolerance);
}
function expect3(actual: { x: number; y: number; z: number }, expected: Point, tolerance = 1e-7): void {
  expect(Math.hypot(actual.x - expected[0]!, actual.y - expected[1]!, actual.z - expected[2]!)).toBeLessThanOrEqual(tolerance);
}
function mix(a: Point, b: Point, t: number): number[] {
  return a.map((value, axis) => value * (1 - t) + b[axis]! * t);
}
function distance(a: Point, b: Point): number {
  return Math.hypot(...a.map((value, axis) => value - b[axis]!));
}
function normalize(a: Point): number[] {
  const length = Math.hypot(...a);
  return a.map((value) => length ? value / length : 0);
}
/** Repeated linear interpolation yields the Bézier point without polynomial coefficients. */
function bezier(controls: readonly Point[], t: number): number[] {
  let layer = controls.map((p) => [...p]);
  while (layer.length > 1) {
    layer = layer.slice(1).map((p, i) => mix(layer[i]!, p, t));
  }
  return layer[0]!;
}
function bezierDirection(controls: readonly Point[], t: number): number[] {
  const deltas = controls.slice(1).map((p, i) => p.map((value, axis) => value - controls[i]![axis]!));
  return normalize(bezier(deltas, t));
}
function uniformSpline2(points: readonly XY[], t: number): number[] {
  const scaled = t * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled)), s = scaled - index;
  const p0 = points[Math.max(0, index - 1)]!, p1 = points[index]!, p2 = points[index + 1]!, p3 = points[Math.min(points.length - 1, index + 2)]!;
  const m1 = p2.map((v, axis) => (v - p0[axis]!) / 2), m2 = p3.map((v, axis) => (v - p1[axis]!) / 2);
  return hermite(p1, p2, m1, m2, s);
}
/** Hermite basis values with endpoint positions and endpoint derivatives. */
function hermite(p1: Point, p2: Point, m1: Point, m2: Point, s: number): number[] {
  const h00 = (1 + 2 * s) * (1 - s) ** 2;
  const h10 = s * (1 - s) ** 2;
  const h01 = s * s * (3 - 2 * s);
  const h11 = s * s * (s - 1);
  return p1.map((value, axis) => h00 * value + h10 * m1[axis]! + h01 * p2[axis]! + h11 * m2[axis]!);
}
/** Evaluate one nonuniform segment by knot-space linear interpolation (Barry-Goldman form). */
function knotSegment(p0: Point, p1: Point, p2: Point, p3: Point, s: number, alpha: number): number[] {
  const k0 = 0;
  const k1 = k0 + distance(p0, p1) ** alpha;
  const k2 = k1 + distance(p1, p2) ** alpha;
  const k3 = k2 + distance(p2, p3) ** alpha;
  const k = k1 + s * (k2 - k1);
  const a = mix(p0, p1, (k - k0) / (k1 - k0));
  const b = mix(p1, p2, (k - k1) / (k2 - k1));
  const c = mix(p2, p3, (k - k2) / (k3 - k2));
  return mix(mix(a, b, (k - k0) / (k2 - k0)), mix(b, c, (k - k1) / (k3 - k1)), s);
}
function splineReference(
  points: readonly Point[], t: number, closed: boolean,
  mode: CatmullRomCurveType | "clamped", tension = 0.5, alpha = 0.5
): number[] {
  const spans = closed ? points.length : points.length - 1;
  const scaled = Math.max(0, Math.min(1, t)) * spans;
  const i = Math.min(spans - 1, Math.floor(scaled));
  const s = scaled - i;
  const pointAt = (index: number): Point => {
    if (closed) return points[(index + points.length) % points.length]!;
    if (index < 0) return mode === "clamped" ? points[0]! : mix(points[1]!, points[0]!, 2);
    if (index >= points.length) return mode === "clamped" ? points[points.length - 1]! : mix(points[points.length - 2]!, points[points.length - 1]!, 2);
    return points[index]!;
  };
  const p0 = pointAt(i - 1), p1 = pointAt(i), p2 = pointAt(i + 1), p3 = pointAt(i + 2);
  if (mode === "catmullrom") {
    return hermite(p1, p2, p2.map((v, j) => (v - p0[j]!) * tension), p3.map((v, j) => (v - p1[j]!) * tension), s);
  }
  return knotSegment(p0, p1, p2, p3, s, mode === "clamped" ? alpha : mode === "chordal" ? 1 : 0.5);
}
function numericalLengths(point: (t: number) => Point, divisions: number): { lengths: number[]; points: Point[] } {
  const points = Array.from({ length: divisions + 1 }, (_, i) => point(i / divisions));
  const lengths = [0];
  for (let i = 1; i <= divisions; i += 1) lengths.push(lengths[i - 1]! + distance(points[i - 1]!, points[i]!));
  return { lengths, points };
}
function atDistance(reference: { lengths: number[]; points: Point[] }, fraction: number): number[] {
  const target = reference.lengths[reference.lengths.length - 1]! * fraction;
  let low = 0, high = reference.lengths.length - 1;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    if (reference.lengths[mid]! < target) low = mid;
    else high = mid;
  }
  const span = reference.lengths[high]! - reference.lengths[low]!;
  return mix(reference.points[low]!, reference.points[high]!, span ? (target - reference.lengths[low]!) / span : 0);
}

describe("Catmull–Rom curves", () => {
  const types: readonly CatmullRomCurveType[] = ["centripetal", "chordal", "catmullrom"];
  it("matches knot-space references for all modes, open and closed", () => {
    const rand = random(0x842ad3);
    for (let i = 0; i < 180; i += 1) {
      const points = Array.from({ length: 4 + Math.floor(rand() * 4) }, () => point3(rand));
      const closed = i % 2 === 0, mode = types[i % types.length]!, tension = 0.2 + rand() * 0.6;
      const curve = new CatmullRomCurve3(points.map(vec3), closed, mode, tension);
      for (let j = 0; j <= 8; j += 1) {
        const t = j / 8;
        expect3(curve.getPoint(t), splineReference(points, t, closed, mode, tension), 1e-6);
      }
      const spans = closed ? points.length : points.length - 1;
      for (let j = 0; j < points.length; j += 1) expect3(curve.getPoint(j / spans), points[j]!, 1e-7);
      if (closed) expect3(curve.getPoint(1), points[0]!);
    }
  });

  it("retains finite points for repeated control points", () => {
    for (const mode of types) {
      const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(1, 1, 0), new Vector3(1, 1, 0), new Vector3(2, 0, 0)], false, mode);
      for (let i = 0; i <= 20; i += 1) expect(curve.getPoint(i / 20).toArray().every(Number.isFinite)).toBe(true);
    }
  });

  it("approximates independent dense arc lengths and inverse arc mapping", () => {
    const rand = random(0x51f9ab);
    for (let i = 0; i < 35; i += 1) {
      const points = Array.from({ length: 5 }, () => point3(rand));
      const closed = i % 2 === 0, mode = types[i % types.length]!;
      const curve = new CatmullRomCurve3(points.map(vec3), closed, mode);
      curve.arcLengthDivisions = 400;
      const reference = numericalLengths((t) => splineReference(points, t, closed, mode), 4000);
      const length = reference.lengths.at(-1)!;
      expect(Math.abs(curve.getLength() - length) / length).toBeLessThan(0.0015);
      for (let j = 0; j <= 12; j += 1) expect3(curve.getPointAt(j / 12), atDistance(reference, j / 12), length * 0.002);
      const lengths = curve.getLengths();
      expect(lengths[0]).toBe(0);
      expect(lengths.every((value, j) => j === 0 || value >= lengths[j - 1]!)).toBe(true);
      expect(curve.getPoints(12)).toHaveLength(13);
      expect(curve.getSpacedPoints(12)).toHaveLength(13);
    }
  }, NUMERICAL_TIMEOUT_MS);

  it("returns tangents consistent with independent numerical derivatives", () => {
    const rand = random(0x974123);
    for (let i = 0; i < 100; i += 1) {
      const points = Array.from({ length: 5 }, () => point3(rand));
      const closed = i % 2 === 0, mode = types[i % 3]!;
      const curve = new CatmullRomCurve3(points.map(vec3), closed, mode);
      const t = 0.05 + rand() * 0.9, h = 1e-6;
      const before = splineReference(points, t - h, closed, mode), after = splineReference(points, t + h, closed, mode);
      const derivative = normalize(after.map((v, axis) => v - before[axis]!));
      expect3(curve.getTangent(t), derivative, 0.001);
      const sample = curve.sample(t);
      expect3(sample.point, splineReference(points, t, closed, mode), 1e-6);
      expect3(sample.tangent, derivative, 0.001);
      expect(curve.getTangentAt(rand()).length()).toBeCloseTo(1, 6);
    }
  });

  it("generates orthonormal, right-handed frames and closes loop frames", () => {
    const rand = random(0x92ab21);
    for (let i = 0; i < 40; i += 1) {
      const points = Array.from({ length: 5 }, () => vec3(point3(rand)));
      const closed = i % 2 === 0, segments = 24;
      const frame = new CatmullRomCurve3(points, closed).computeFrenetFrames(segments, closed)!;
      expect(frame.tangents).toHaveLength(segments + 1);
      expect(frame.normals).toHaveLength(segments + 1);
      expect(frame.binormals).toHaveLength(segments + 1);
      for (let j = 0; j <= segments; j += 1) {
        const t = frame.tangents[j]!, n = frame.normals[j]!, b = frame.binormals[j]!;
        for (const vector of [t, n, b]) expect(vector.length()).toBeCloseTo(1, 6);
        expect(Math.abs(t.dot(n))).toBeLessThan(1e-6);
        expect(Math.abs(t.dot(b))).toBeLessThan(1e-6);
        expect(Math.abs(n.dot(b))).toBeLessThan(1e-6);
        expect3(t.cross(n), b.toArray(), 1e-6);
      }
    }
    // A regular closed loop has a well-conditioned seam. Tangents in the
    // implementation are one-sided finite differences at the two endpoints.
    const loop = new CatmullRomCurve3([
      new Vector3(1, 0, 0), new Vector3(0, 1, 0),
      new Vector3(-1, 0, 0), new Vector3(0, -1, 0)
    ], true);
    const frame = loop.computeFrenetFrames(24, true)!;
    expect3(frame.tangents[24]!, frame.tangents[0]!.toArray(), 0.002);
    expect3(frame.normals[24]!, frame.normals[0]!.toArray(), 0.002);
  }, NUMERICAL_TIMEOUT_MS);

  it("uses one periodic tangent at both ends of irregular closed curves", () => {
    const points = [new Vector3(0, 0, 0), new Vector3(2, 0.5, 1), new Vector3(3, 3, 0),
      new Vector3(-1, 4, 2), new Vector3(-2, 1, -1)];
    for (const curve of [new CatmullRomCurve3(points, true), new ClampedCatmullRomCurve3(points, true)]) {
      const start = curve.getTangent(0), end = curve.getTangent(1);
      expect(start.distanceTo(end)).toBeLessThan(1e-12);
      const frame = curve.computeFrenetFrames(32, true)!;
      expect(frame.tangents[0]!.distanceTo(frame.tangents[32]!)).toBeLessThan(1e-12);
      expect(frame.normals[0]!.distanceTo(frame.normals[32]!)).toBeLessThan(1e-6);
      expect(frame.binormals[0]!.distanceTo(frame.binormals[32]!)).toBeLessThan(1e-6);
    }
  });
});

describe("lines and Bézier curves", () => {
  it("interpolates lines, uniform distance and tangents in two and three dimensions", () => {
    const rand = random(0x1293aa);
    for (let i = 0; i < 500; i += 1) {
      const a = point2(rand), b = point2(rand), a3 = point3(rand), b3 = point3(rand), t = rand();
      const line = new LineCurve(vec2(a), vec2(b)), line3 = new LineCurve3(vec3(a3), vec3(b3));
      expect2(line.getPoint(t), mix(a, b, t));
      expect2(line.getPointAt(t), mix(a, b, t));
      expect2(line.getTangent(t), normalize(b.map((v, j) => v - a[j]!)));
      expect3(line3.getPoint(t), mix(a3, b3, t));
      expect3(line3.getPointAt(t), mix(a3, b3, t));
      expect3(line3.getTangentAt(t), normalize(b3.map((v, j) => v - a3[j]!)));
      expect(line.getLength()).toBeCloseTo(distance(a, b), 8);
      expect(line3.getLength()).toBeCloseTo(distance(a3, b3), 8);
    }
    expect2(new LineCurve(new Vector2(1, 2), new Vector2(1, 2)).getTangent(0.5), [0, 0]);
  });

  it("matches de Casteljau positions and derivative directions for quadratic and cubic curves", () => {
    const rand = random(0x1392bd);
    for (let i = 0; i < 500; i += 1) {
      const p = Array.from({ length: 4 }, () => point2(rand));
      const q = Array.from({ length: 4 }, () => point3(rand));
      const t = 0.02 + 0.96 * rand();
      const quadratic = new QuadraticBezierCurve(vec2(p[0]!), vec2(p[1]!), vec2(p[2]!));
      const quadratic3 = new QuadraticBezierCurve3(vec3(q[0]!), vec3(q[1]!), vec3(q[2]!));
      const cubic = new CubicBezierCurve(vec2(p[0]!), vec2(p[1]!), vec2(p[2]!), vec2(p[3]!));
      const cubic3 = new CubicBezierCurve3(vec3(q[0]!), vec3(q[1]!), vec3(q[2]!), vec3(q[3]!));
      expect2(quadratic.getPoint(t), bezier(p.slice(0, 3), t));
      expect3(quadratic3.getPoint(t), bezier(q.slice(0, 3), t));
      expect2(cubic.getPoint(t), bezier(p, t));
      expect3(cubic3.getPoint(t), bezier(q, t));
      expect2(quadratic.getTangent(t), bezierDirection(p.slice(0, 3), t), 0.001);
      expect3(quadratic3.getTangent(t), bezierDirection(q.slice(0, 3), t), 0.001);
      expect2(cubic.getTangent(t), bezierDirection(p, t), 0.001);
      expect3(cubic3.getTangent(t), bezierDirection(q, t), 0.001);
    }
  });

  it("evaluates 2D uniform spline segments with endpoint clamping", () => {
    const rand = random(0x66241);
    for (let i = 0; i < 150; i += 1) {
      const points = Array.from({ length: 5 }, () => point2(rand));
      const curve = new SplineCurve(points.map(vec2));
      for (let j = 0; j <= 10; j += 1) {
        const t = j / 10;
        expect2(curve.getPoint(t), uniformSpline2(points, t));
      }
    }
  });
});

describe("ellipses and circular arcs", () => {
  it("evaluates rotation, both directions, wrapped angles and coincident endpoints", () => {
    const rand = random(0xa71dc9), turn = 2 * Math.PI;
    for (let i = 0; i < 400; i += 1) {
      const center = point2(rand), rx = 0.2 + rand() * 5, ry = 0.2 + rand() * 5;
      const start = (rand() - 0.5) * 8 * Math.PI, end = i % 23 === 0 ? start : start + (rand() - 0.5) * 8 * Math.PI;
      const clockwise = i % 2 === 0, rotation = (rand() - 0.5) * 2 * Math.PI, t = rand();
      const raw = end - start;
      let span = Math.abs(raw) < Number.EPSILON ? 0 : ((raw % turn) + turn) % turn || turn;
      if (clockwise && span) span -= turn === span ? 2 * turn : turn;
      const angle = start + t * span;
      const x = rx * Math.cos(angle), y = ry * Math.sin(angle);
      expect2(new EllipseCurve(center[0], center[1], rx, ry, start, end, clockwise, rotation).getPoint(t), [
        center[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
        center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)
      ], 1e-5);
      expect2(new ArcCurve(center[0], center[1], rx, start, end, clockwise).getPoint(t), [center[0] + rx * Math.cos(angle), center[1] + rx * Math.sin(angle)], 1e-5);
    }
    const circle = new ArcCurve(2, -1, 3, 0, turn);
    // The cached length is a 200-edge inscribed polygon, rather than an
    // analytic integral. Its chord sum has this independent closed form.
    expect(circle.getLength()).toBeCloseTo(2 * 200 * 3 * Math.sin(Math.PI / 200), 8);
    expect(Math.abs(circle.getLength() - 6 * Math.PI)).toBeLessThan(0.001);
    for (let i = 0; i <= 8; i += 1) {
      const angle = turn * i / 8;
      expect2(circle.getPointAt(i / 8), [2 + 3 * Math.cos(angle), -1 + 3 * Math.sin(angle)], 1e-5);
    }
    expect(new ArcCurve().computeFrenetFrames(4)).toBeNull();
  });
});

describe("curve paths and shape contours", () => {
  it("parameterizes connected segments by length and closes paths", () => {
    const path = new CurvePath<Vector2>();
    path.add(new LineCurve(new Vector2(0, 0), new Vector2(3, 0)));
    path.add(new LineCurve(new Vector2(3, 0), new Vector2(3, 4)));
    expect(path.getCurveLengths()).toEqual([3, 7]);
    expect2(path.getPoint(0.5), [3, 0.5]);
    path.closePath();
    const lengths = path.getCurveLengths();
    expect(lengths).toHaveLength(3);
    expect(lengths[0]).toBeCloseTo(3, 10);
    expect(lengths[1]).toBeCloseTo(7, 10);
    expect(lengths[2]).toBeCloseTo(12, 10);
    expect2(path.getPoint(0.75), [1.8, 2.4]);
    path.closePath();
    expect(path.curves).toHaveLength(3);
    expect(path.getLength()).toBeCloseTo(12, 8);
    expect(path.getPoints(4).map((p) => p.toArray())).toEqual([[0, 0], [3, 0], [3, 4], [0, 0]]);
    path.autoClose = true;
    const spaced = path.getSpacedPoints(4);
    expect(spaced).toHaveLength(6);
    expect2(spaced[0]!, [0, 0]);
    expect2(spaced.at(-1)!, [0, 0]);
    expect(() => new CurvePath<Vector2>().getPoint(0.5)).toThrow(/empty/);
  });

  it("chains line, quadratic, cubic, spline and absolute/relative arcs with continuous endpoints", () => {
    const path = new Path();
    expect(path.moveTo(0, 0)).toBe(path);
    path.lineTo(2, 0).quadraticCurveTo(3, 1, 4, 0).bezierCurveTo(5, -1, 6, 1, 7, 0)
      .splineThru([new Vector2(8, 1), new Vector2(9, 0)]).absarc(9, 1, 1, -Math.PI / 2, 0)
      .absellipse(10, 2, 1, 2, -Math.PI / 2, 0, false, Math.PI / 2)
      .arc(2, 0, 1, Math.PI, Math.PI / 2, true)
      .ellipse(0, 1, 1, 2, -Math.PI / 2, 0);
    expect(path.curves.length).toBeGreaterThanOrEqual(8);
    expect2(path.curves[0]!.getPoint(0.5), [1, 0]);
    expect2(path.curves[1]!.getPoint(0.5), [3, 0.5]);
    expect2(path.curves[2]!.getPoint(0.5), [5.5, 0]);
    expect2(path.curves[3]!.getPoint(1), [9, 0]);
    for (let i = 1; i < path.curves.length; i += 1) {
      expect2(path.curves[i]!.getPoint(0), path.curves[i - 1]!.getPoint(1).toArray(), 1e-7);
    }
    expect2(path.currentPoint, path.curves.at(-1)!.getPoint(1).toArray());
    const sampled = path.getPoints(8);
    expect(sampled.length).toBeGreaterThan(40);
    expect2(sampled[0]!, [0, 0]);
    expect2(sampled.at(-1)!, path.currentPoint.toArray());
    expect(path.getLength()).toBeGreaterThan(10);
  });

  it("matches independent arc-length references for varied chained curves", () => {
    const rand = random(0x4dced);
    for (let trial = 0; trial < 40; trial += 1) {
      const a = point2(rand), b = point2(rand), q = point2(rand), c = point2(rand);
      const h1 = point2(rand), h2 = point2(rand), d = point2(rand);
      const s1 = point2(rand), s2 = point2(rand), s3 = point2(rand);
      const radius = 0.5 + 3 * rand(), rx = 0.5 + 3 * rand(), ry = 0.5 + 3 * rand(), rotation = rand() * Math.PI;
      const arcEnd: XY = [s3[0] + radius, s3[1] + radius];
      const ellipseCenter: XY = [arcEnd[0] - rx * Math.cos(rotation), arcEnd[1] - rx * Math.sin(rotation)];
      const path = new Path();
      path.moveTo(...a).lineTo(...b).quadraticCurveTo(...q, ...c).bezierCurveTo(...h1, ...h2, ...d)
        .splineThru([vec2(s1), vec2(s2), vec2(s3)])
        .absarc(s3[0], s3[1] + radius, radius, -Math.PI / 2, 0)
        .absellipse(ellipseCenter[0], ellipseCenter[1], rx, ry, 0, Math.PI / 2, false, rotation);
      expect(path.curves).toHaveLength(6);
      for (const curve of path.curves) curve.arcLengthDivisions = 400;
      const references: ((t: number) => Point)[] = [
        (t) => mix(a, b, t),
        (t) => bezier([b, q, c], t),
        (t) => bezier([c, h1, h2, d], t),
        (t) => uniformSpline2([d, s1, s2, s3], t),
        (t) => [s3[0] + radius * Math.cos((t - 1) * Math.PI / 2), s3[1] + radius + radius * Math.sin((t - 1) * Math.PI / 2)],
        (t) => {
          const x = rx * Math.cos(t * Math.PI / 2), y = ry * Math.sin(t * Math.PI / 2);
          return [ellipseCenter[0] + x * Math.cos(rotation) - y * Math.sin(rotation), ellipseCenter[1] + x * Math.sin(rotation) + y * Math.cos(rotation)];
        }
      ];
      const dense = references.map((fn) => numericalLengths(fn, 2000));
      const lengths = dense.map((r) => r.lengths.at(-1)!);
      const total = lengths.reduce((sum, length) => sum + length, 0);
      expect(Math.abs(path.getLength() - total) / total).toBeLessThan(0.001);
      for (let i = 0; i <= 12; i += 1) {
        let remaining = total * i / 12, segment = 0;
        while (segment < lengths.length - 1 && remaining > lengths[segment]!) remaining -= lengths[segment++]!;
        expect2(path.getPoint(i / 12), atDistance(dense[segment]!, remaining / lengths[segment]!), total * 0.0015);
      }
      const sampled = path.getPoints(4);
      expect(sampled).toHaveLength(42);
      expect2(sampled[0]!, a);
      expect2(sampled.at(-1)!, references.at(-1)!(1));
      for (let i = 1; i < sampled.length; i += 1) expect(sampled[i]!.distanceTo(sampled[i - 1]!)).toBeGreaterThan(1e-10);
    }
  }, NUMERICAL_TIMEOUT_MS);

  it("extracts and triangulates a contour with a hole without filling the hole", () => {
    const outer: XY[] = [[0, 0], [8, 0], [8, 8], [0, 8]];
    const hole: XY[] = [[2, 2], [2, 6], [6, 6], [6, 2]];
    const shape = new Shape(outer.map(vec2));
    const holePath = new Path(hole.map(vec2));
    shape.closePath();
    holePath.closePath();
    shape.holes.push(holePath);
    const extracted = shape.extractPoints(8);
    expect(extracted.shape.map((p) => p.toArray())).toEqual([...outer, outer[0]]);
    expect(extracted.holes[0]!.map((p) => p.toArray())).toEqual([...hole, hole[0]]);
    expect(ShapeUtils.area(extracted.shape)).toBe(64);
    expect(ShapeUtils.area(extracted.holes[0]!)).toBe(-16);
    expect(ShapeUtils.isClockWise(extracted.shape)).toBe(false);
    expect(ShapeUtils.isClockWise(extracted.holes[0]!)).toBe(true);
    const triangles = ShapeUtils.triangulateShape(extracted.shape, extracted.holes);
    expect(triangles).toHaveLength(8);
    const vertices = [...outer, ...hole];
    let area = 0;
    for (const indices of triangles) {
      expect(new Set(indices).size).toBe(3);
      expect(indices.every((i) => i >= 0 && i < vertices.length)).toBe(true);
      const points = indices.map((i) => vertices[i]!) as [XY, XY, XY];
      const [a, b, c] = points;
      const triangleArea = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
      expect(triangleArea).toBeGreaterThan(0);
      area += triangleArea;
      expect(clippedRectangleArea(points, 2, 2, 6, 6)).toBeCloseTo(0, 9);
    }
    expect(area).toBeCloseTo(48, 9);
    expect(extracted.shape).toHaveLength(5); // triangulation does not mutate inputs
    expect(extracted.holes[0]).toHaveLength(5);
  });

  it("preserves polygon area and excludes jittered holes without overlapping triangles", () => {
    const rand = random(0xd881);
    const jitter = () => (rand() - 0.5) * 0.2;
    for (let i = 0; i < 100; i += 1) {
      const outer: XY[] = [[jitter(), jitter()], [8 + jitter(), jitter()], [8 + jitter(), 8 + jitter()], [jitter(), 8 + jitter()]];
      const hole: XY[] = [[2 + jitter(), 2 + jitter()], [2 + jitter(), 6 + jitter()], [6 + jitter(), 6 + jitter()], [6 + jitter(), 2 + jitter()]];
      const shape = new Shape(outer.map(vec2));
      shape.holes.push(new Path(hole.map(vec2)));
      const extracted = shape.extractPoints(8);
      expect(extracted.shape.map((p) => p.toArray())).toEqual(outer);
      expect(extracted.holes[0]!.map((p) => p.toArray())).toEqual(hole);
      const faces = ShapeUtils.triangulateShape(extracted.shape, extracted.holes);
      expect(faces).toHaveLength(8);
      const vertices = [...outer, ...hole];
      const triangles = faces.map((face) => face.map((index) => vertices[index]!) as [XY, XY, XY]);
      const area = triangles.reduce((sum, triangle) => sum + Math.abs(polygonArea(triangle)), 0);
      expect(area).toBeCloseTo(Math.abs(polygonArea(outer)) - Math.abs(polygonArea(hole)), 8);
      for (let j = 0; j < triangles.length; j += 1) {
        expect(clippedConvexArea(triangles[j]!, hole)).toBeLessThan(1e-8);
        for (let k = 0; k < j; k += 1) expect(clippedConvexArea(triangles[j]!, triangles[k]!)).toBeLessThan(1e-8);
      }
    }
  });
});

function polygonArea(points: readonly XY[]): number {
  return points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0) / 2;
}

/** Independent convex-polygon intersection for detecting hole fill and overlapping faces. */
function clippedConvexArea(polygon: readonly XY[], clip: readonly XY[]): number {
  let vertices = [...polygon];
  const orientation = Math.sign(polygonArea(clip));
  for (let edge = 0; edge < clip.length && vertices.length; edge += 1) {
    const a = clip[edge]!, b = clip[(edge + 1) % clip.length]!;
    const side = (p: XY) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const output: XY[] = [];
    for (let i = 0; i < vertices.length; i += 1) {
      const start = vertices[i]!, end = vertices[(i + 1) % vertices.length]!;
      const startSide = side(start), endSide = side(end);
      if (startSide >= 0) output.push(start);
      if ((startSide < 0 && endSide > 0) || (startSide > 0 && endSide < 0)) {
        const t = startSide / (startSide - endSide);
        output.push([start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
      }
    }
    vertices = output;
  }
  return Math.abs(polygonArea(vertices));
}

/** Clip a convex polygon against four rectangle half-planes, then use shoelace area. */
function clippedRectangleArea(polygon: readonly XY[], left: number, bottom: number, right: number, top: number): number {
  let vertices = [...polygon];
  for (const [axis, value, keepGreater] of [[0, left, true], [0, right, false], [1, bottom, true], [1, top, false]] as const) {
    const output: XY[] = [];
    for (let i = 0; i < vertices.length; i += 1) {
      const a = vertices[i]!, b = vertices[(i + 1) % vertices.length]!;
      const insideA = keepGreater ? a[axis] >= value : a[axis] <= value;
      const insideB = keepGreater ? b[axis] >= value : b[axis] <= value;
      if (insideA) output.push(a);
      if (insideA !== insideB) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    vertices = output;
  }
  return Math.abs(vertices.reduce((sum, a, i) => {
    const b = vertices[(i + 1) % vertices.length]!;
    return sum + a[0] * b[1] - a[1] * b[0];
  }, 0)) / 2;
}

describe("clamped Catmull–Rom and segment derivatives", () => {
  it("matches independent knot interpolation for closed splines and arbitrary knot exponents", () => {
    const rand = random(0x9ee23);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      for (let i = 0; i < 35; i += 1) {
        const points = Array.from({ length: 6 }, () => point3(rand));
        const curve = new ClampedCatmullRomCurve3(points.map(vec3), true, alpha);
        expect(curve.segments).toBe(6);
        for (let j = 0; j <= 12; j += 1) expect3(curve.getPoint(j / 12), splineReference(points, j / 12, true, "clamped", 0.5, alpha), 1e-6);
        expect3(curve.getPoint(-1), points[0]!);
        expect3(curve.getPoint(2), points[0]!);
      }
    }
  });

  it("clamps open spline endpoints and interpolates every knot", () => {
    const rand = random(0x781ac);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      const points = Array.from({ length: 5 }, () => point3(rand));
      const curve = new ClampedCatmullRomCurve3(points.map(vec3), false, alpha);
      expect(curve.segments).toBe(4);
      for (let i = 0; i < points.length; i += 1) expect3(curve.getPoint(i / 4), points[i]!, 1e-8);
      expect3(curve.getPoint(-1), points[0]!);
      expect3(curve.getPoint(2), points.at(-1)!);
      expect3(new ClampedCatmullRomCurve3([vec3(points[0]!)]).getPoint(0.5), points[0]!);
    }
  });

  it("differentiates a segment against finite differences of the independent knot reference", () => {
    const rand = random(0xff1cc);
    for (let i = 0; i < 500; i += 1) {
      const points = Array.from({ length: 4 }, () => point3(rand));
      const alpha = [0, 0.25, 0.5, 0.75, 1][i % 5]!, s = 0.05 + 0.9 * rand(), h = 1e-6;
      const expected = knotSegment(points[0]!, points[1]!, points[2]!, points[3]!, s, alpha);
      expect3(catmullRomSegment(vec3(points[0]!), vec3(points[1]!), vec3(points[2]!), vec3(points[3]!), s, alpha), expected, 1e-6);
      const before = knotSegment(points[0]!, points[1]!, points[2]!, points[3]!, s - h, alpha);
      const after = knotSegment(points[0]!, points[1]!, points[2]!, points[3]!, s + h, alpha);
      const derivative = after.map((value, axis) => (value - before[axis]!) / (2 * h));
      const actual = catmullRomSegmentDerivative(vec3(points[0]!), vec3(points[1]!), vec3(points[2]!), vec3(points[3]!), s, alpha);
      expect3(actual, derivative, Math.max(1, Math.hypot(...derivative)) * 1e-6);
    }
  });

  it("samples the open curve approximately uniformly in arc length", () => {
    const points: XYZ[] = [[0, 0, 0], [2, 1, 0], [5, 1, 3], [8, 0, 3]];
    const curve = new ClampedCatmullRomCurve3(points.map(vec3), false, 0.5);
    curve.arcLengthDivisions = 256;
    const total = curve.getLength();
    for (let i = 0; i < 6; i += 1) {
      let arc = 0, previous = curve.getPointAt(i / 6);
      for (let j = 1; j <= 32; j += 1) {
        const point = curve.getPointAt((i + j / 32) / 6);
        arc += point.distanceTo(previous);
        previous = point;
      }
      expect(Math.abs(arc - total / 6) / (total / 6)).toBeLessThan(0.02);
    }
  });
});
