/**
 * three.js 0.185.1 curve parity (PRD SM-02) — seeded `getPoint` comparisons
 * within 1e-6, `getLength` within 0.1 %, `getPointAt` uniform in arc length,
 * Frenet frames orthonormal, plus the full 2D/3D curve family, CurvePath,
 * Path, Shape (+holes) and ShapeUtils triangulation.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
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

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CASES = 1000;

function fv(rand: () => number, scale = 10): number {
  return (rand() * 2 - 1) * scale;
}
function v3(rand: () => number): Vector3 {
  return new Vector3(fv(rand), fv(rand), fv(rand));
}
function v2(rand: () => number): Vector2 {
  return new Vector2(fv(rand), fv(rand));
}
function tv3(v: Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}
function tv2(v: Vector2): THREE.Vector2 {
  return new THREE.Vector2(v.x, v.y);
}
type Vec2Like = { x: number; y: number };
type Vec3Like = { x: number; y: number; z: number };
function dist3(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function dist2(a: Vec2Like, b: Vec2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function expectVec2(actual: Vec2Like, expected: Vec2Like, tol = 1e-6): void {
  expect(dist2(actual, expected)).toBeLessThanOrEqual(tol);
}
function expectVec3(actual: Vec3Like, expected: Vec3Like, tol = 1e-6): void {
  expect(dist3(actual, expected)).toBeLessThanOrEqual(tol);
}

describe("CatmullRomCurve3 parity", () => {
  it("getPoint matches three for centripetal/chordal/catmullrom, open+closed", () => {
    const rand = rng(0xc0ffee);
    const types: CatmullRomCurveType[] = ["centripetal", "chordal", "catmullrom"];
    let checked = 0;
    while (checked < CASES) {
      const n = 4 + Math.floor(rand() * 4);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const type = types[Math.floor(rand() * 3)]!;
      const tension = rand();
      const curve = new CatmullRomCurve3(pts, closed, type, tension);
      const tcurve = new THREE.CatmullRomCurve3(pts.map(tv3), closed, type, tension);
      for (let k = 0; k < 10 && checked < CASES; k += 1, checked += 1) {
        const t = rand();
        expectVec3(curve.getPoint(t), tcurve.getPoint(t));
      }
    }
  });

  it("interpolates control points exactly at knots (open + closed)", () => {
    const rand = rng(0x1eaf);
    for (let i = 0; i < 100; i += 1) {
      const n = 3 + Math.floor(rand() * 5);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const curve = new CatmullRomCurve3(pts, closed, "centripetal");
      const tcurve = new THREE.CatmullRomCurve3(pts.map(tv3), closed, "centripetal");
      const spans = closed ? n : n - 1;
      for (let s = 0; s < spans; s += 1) {
        expectVec3(curve.getPoint(s / spans), tcurve.getPoint(s / spans));
      }
    }
  });

  it("getLength within 0.1% of three", () => {
    const rand = rng(0x2babe);
    for (let i = 0; i < 200; i += 1) {
      const n = 3 + Math.floor(rand() * 6);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const type = (["centripetal", "chordal", "catmullrom"] as const)[i % 3]!;
      const curve = new CatmullRomCurve3(pts, closed, type);
      const tcurve = new THREE.CatmullRomCurve3(pts.map(tv3), closed, type);
      const a = curve.getLength();
      const b = tcurve.getLength();
      expect(Math.abs(a - b) / Math.max(b, 1e-9)).toBeLessThanOrEqual(0.001);
    }
  });

  it("getPointAt is uniform in arc length and matches three", () => {
    const rand = rng(0x3cafe);
    for (let i = 0; i < 100; i += 1) {
      const n = 4 + Math.floor(rand() * 4);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const curve = new CatmullRomCurve3(pts, closed, "centripetal");
      const tcurve = new THREE.CatmullRomCurve3(pts.map(tv3), closed, "centripetal");
      curve.arcLengthDivisions = tcurve.arcLengthDivisions;
      const length = curve.getLength();

      // uniformity: consecutive getSpacedPoints segments have near-equal
      // length. The LUT approach shares three's sampling error, so compare
      // Aura's worst deviation against three's on the same curve.
      const spaced = curve.getSpacedPoints(24);
      const tspaced = tcurve.getSpacedPoints(24);
      const dev = (pts: (Vector3 | THREE.Vector3)[]): number => {
        const lens: number[] = [];
        for (let k = 1; k < pts.length; k += 1) {
          const a = pts[k]!; const b = pts[k - 1]!;
          lens.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
        }
        const mean = lens.reduce((x, y) => x + y, 0) / lens.length;
        return Math.max(...lens.map((d) => Math.abs(d - mean)));
      };
      const devA = dev(spaced);
      const devT = dev(tspaced);
      expect(devA).toBeLessThanOrEqual(Math.max(devT * 1.1, length * 0.01) + 1e-6);

      // parity vs three at arc-length fractions
      for (let k = 0; k <= 10; k += 1) {
        const u = k / 10;
        const pa = curve.getPointAt(u);
        const pb = tcurve.getPointAt(u);
        expect(dist3(pa, pb)).toBeLessThanOrEqual(Math.max(length * 0.005, 1e-4));
      }
    }
  });

  it("getTangent / getTangentAt are unit and match three direction", () => {
    const rand = rng(0x4d00d);
    for (let i = 0; i < 500; i += 1) {
      const n = 4 + Math.floor(rand() * 4);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const curve = new CatmullRomCurve3(pts, closed, "centripetal");
      const tcurve = new THREE.CatmullRomCurve3(pts.map(tv3), closed, "centripetal");
      const t = 0.02 + rand() * 0.96;
      const tan = curve.getTangent(t);
      const ttan = tcurve.getTangent(t);
      expect(Math.abs(tan.length() - 1)).toBeLessThanOrEqual(1e-6);
      // tangents may differ where the secant straddles a knot — compare to 1e-3
      expect(dist3(tan, ttan)).toBeLessThanOrEqual(1e-3);
      const u = rand();
      const tanU = curve.getTangentAt(u);
      const ttanU = tcurve.getTangentAt(u);
      expect(Math.abs(tanU.length() - 1)).toBeLessThanOrEqual(1e-6);
      expect(dist3(tanU, ttanU)).toBeLessThanOrEqual(Math.max(curve.getLength() * 0.01, 1e-3));
    }
  });

  it("computeFrenetFrames returns orthonormal frames (incl. closed)", () => {
    const rand = rng(0x5f00d);
    for (let i = 0; i < 100; i += 1) {
      const n = 4 + Math.floor(rand() * 4);
      const pts = Array.from({ length: n }, () => v3(rand));
      const closed = rand() > 0.5;
      const curve = new CatmullRomCurve3(pts, closed, "centripetal");
      const segments = 16 + Math.floor(rand() * 16);
      const frames = curve.computeFrenetFrames(segments, closed);
      expect(frames).not.toBeNull();
      const { tangents, normals, binormals } = frames!;
      expect(tangents.length).toBe(segments + 1);
      expect(normals.length).toBe(segments + 1);
      expect(binormals.length).toBe(segments + 1);
      for (let k = 0; k <= segments; k += 1) {
        const t = tangents[k]!; const nn = normals[k]!; const b = binormals[k]!;
        expect(Math.abs(t.length() - 1)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(nn.length() - 1)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(b.length() - 1)).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(t.dot(nn))).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(t.dot(b))).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(nn.dot(b))).toBeLessThanOrEqual(1e-6);
      }
    }
  });
});

describe("Bezier + line curve parity", () => {
  it("LineCurve / LineCurve3 getPoint, getTangent match three", () => {
    const rand = rng(0x6a1a);
    for (let i = 0; i < CASES; i += 1) {
      const a = v2(rand); const b = v2(rand);
      const l = new LineCurve(a, b);
      const tl = new THREE.LineCurve(tv2(a), tv2(b));
      const t = rand();
      expectVec2(l.getPoint(t), tl.getPoint(t));
      expectVec2(l.getTangent(t), tl.getTangent(t));
      expectVec2(l.getPointAt(t), tl.getPointAt(t));
      const a3 = v3(rand); const b3 = v3(rand);
      const l3 = new LineCurve3(a3, b3);
      const tl3 = new THREE.LineCurve3(tv3(a3), tv3(b3));
      expectVec3(l3.getPoint(t), tl3.getPoint(t));
      expectVec3(l3.getTangent(t), tl3.getTangent(t));
      expectVec3(l3.getPointAt(t), tl3.getPointAt(t));
    }
  });

  it("QuadraticBezierCurve(3) getPoint/getTangent match three", () => {
    const rand = rng(0x7b2b);
    for (let i = 0; i < CASES; i += 1) {
      const a = v2(rand); const b = v2(rand); const c = v2(rand);
      const q = new QuadraticBezierCurve(a, b, c);
      const tq = new THREE.QuadraticBezierCurve(tv2(a), tv2(b), tv2(c));
      const t = rand();
      expectVec2(q.getPoint(t), tq.getPoint(t));
      const q3 = new QuadraticBezierCurve3(v3(rand), v3(rand), v3(rand));
      const tq3 = new THREE.QuadraticBezierCurve3(tv3(q3.v0), tv3(q3.v1), tv3(q3.v2));
      expectVec3(q3.getPoint(t), tq3.getPoint(t));
      // three's tangent: derivative normalized
      const tt = tq3.getTangent(t, new THREE.Vector3());
      expectVec3(q3.getTangent(t), tt, 1e-4);
    }
  });

  it("CubicBezierCurve(3) getPoint/getTangent match three", () => {
    const rand = rng(0x8c3c);
    for (let i = 0; i < CASES; i += 1) {
      const c2 = new CubicBezierCurve(v2(rand), v2(rand), v2(rand), v2(rand));
      const tc2 = new THREE.CubicBezierCurve(tv2(c2.v0), tv2(c2.v1), tv2(c2.v2), tv2(c2.v3));
      const c3 = new CubicBezierCurve3(v3(rand), v3(rand), v3(rand), v3(rand));
      const tc3 = new THREE.CubicBezierCurve3(tv3(c3.v0), tv3(c3.v1), tv3(c3.v2), tv3(c3.v3));
      const t = rand();
      expectVec2(c2.getPoint(t), tc2.getPoint(t));
      expectVec3(c3.getPoint(t), tc3.getPoint(t));
      expectVec2(c2.getTangent(t), tc2.getTangent(t, new THREE.Vector2()), 1e-4);
      expectVec3(c3.getTangent(t), tc3.getTangent(t, new THREE.Vector3()), 1e-4);
    }
  });

  it("SplineCurve getPoint matches three", () => {
    const rand = rng(0x9d4d);
    for (let i = 0; i < CASES; i += 1) {
      const n = 3 + Math.floor(rand() * 5);
      const pts = Array.from({ length: n }, () => v2(rand));
      const sc = new SplineCurve(pts);
      const tsc = new THREE.SplineCurve(pts.map(tv2));
      const t = rand();
      expectVec2(sc.getPoint(t), tsc.getPoint(t));
    }
  });
});

describe("EllipseCurve / ArcCurve parity", () => {
  it("getPoint matches three for all parameter combos", () => {
    const rand = rng(0xae5e);
    for (let i = 0; i < CASES; i += 1) {
      const aX = fv(rand); const aY = fv(rand);
      const xr = rand() * 5 + 0.01; const yr = rand() * 5 + 0.01;
      const a0 = fv(rand, Math.PI * 3); const a1 = a0 + fv(rand, Math.PI * 3);
      const cw = rand() > 0.5;
      const rot = fv(rand, Math.PI);
      const e = new EllipseCurve(aX, aY, xr, yr, a0, a1, cw, rot);
      const te = new THREE.EllipseCurve(aX, aY, xr, yr, a0, a1, cw, rot);
      const t = rand();
      expectVec2(e.getPoint(t), te.getPoint(t), 1e-5);
      const arc = new ArcCurve(aX, aY, xr, a0, a1, cw);
      const tarc = new THREE.ArcCurve(aX, aY, xr, a0, a1, cw);
      expectVec2(arc.getPoint(t), tarc.getPoint(t), 1e-5);
    }
  });
});

describe("CurvePath / Path / Shape parity", () => {
  it("Path chaining and getPoint/getLength match three", () => {
    const rand = rng(0xbf6f);
    for (let i = 0; i < 200; i += 1) {
      // Build identical paths on both sides with the same coordinates.
      const a = new Path();
      const t = new THREE.Path();
      const moves: [number, number][] = [[fv(rand), fv(rand)]];
      a.moveTo(moves[0]![0], moves[0]![1]);
      t.moveTo(moves[0]![0], moves[0]![1]);
      const l1: [number, number] = [fv(rand), fv(rand)];
      a.lineTo(l1[0], l1[1]); t.lineTo(l1[0], l1[1]);
      const q = [fv(rand), fv(rand), fv(rand), fv(rand)] as const;
      a.quadraticCurveTo(q[0], q[1], q[2], q[3]); t.quadraticCurveTo(q[0], q[1], q[2], q[3]);
      const c = [fv(rand), fv(rand), fv(rand), fv(rand), fv(rand), fv(rand)] as const;
      a.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]); t.bezierCurveTo(c[0], c[1], c[2], c[3], c[4], c[5]);
      const spts = Array.from({ length: 3 }, () => v2(rand));
      a.splineThru(spts); t.splineThru(spts.map(tv2));
      const arcCx = fv(rand); const arcCy = fv(rand); const arcR = 1 + rand() * 3;
      const arcA0 = fv(rand, Math.PI); const arcA1 = arcA0 + fv(rand, Math.PI * 2);
      const arcCw = rand() > 0.5;
      a.absarc(arcCx, arcCy, arcR, arcA0, arcA1, arcCw);
      t.absarc(arcCx, arcCy, arcR, arcA0, arcA1, arcCw);
      const el = [fv(rand), fv(rand), 1 + rand() * 3, 1 + rand() * 3, fv(rand, Math.PI), fv(rand, Math.PI * 2)] as const;
      const elCw = rand() > 0.5; const elRot = fv(rand, Math.PI);
      a.absellipse(el[0], el[1], el[2], el[3], el[4], el[5], elCw, elRot);
      t.absellipse(el[0], el[1], el[2], el[3], el[4], el[5], elCw, elRot);

      const lenA = a.getLength();
      const lenT = t.getLength();
      expect(Math.abs(lenA - lenT) / Math.max(lenT, 1e-9)).toBeLessThanOrEqual(0.001);
      for (let k = 0; k <= 8; k += 1) {
        const u = k / 8;
        const pa = a.getPoint(u);
        const pt = t.getPoint(u, new THREE.Vector2());
        expect(dist2(pa, pt)).toBeLessThanOrEqual(Math.max(lenT * 0.01, 1e-4));
      }
      const ptsA = a.getPoints(12);
      const ptsT = t.getPoints(12);
      expect(ptsA.length).toBe(ptsT.length);
      for (let k = 0; k < ptsA.length; k += 1) {
        expect(dist2(ptsA[k]!, ptsT[k]!)).toBeLessThanOrEqual(1e-4);
      }
    }
  });

  it("CurvePath closePath/autoClose and getCurveLengths match three", () => {
    const rand = rng(0xc770);
    for (let i = 0; i < 200; i += 1) {
      const a = new CurvePath<Vector2>();
      const t = new THREE.CurvePath<THREE.Vector2>();
      const segs = 2 + Math.floor(rand() * 3);
      let cur = v2(rand);
      for (let s = 0; s < segs; s += 1) {
        const nxt = v2(rand);
        a.add(new LineCurve(cur, nxt));
        t.add(new THREE.LineCurve(tv2(cur), tv2(nxt)));
        cur = nxt;
      }
      a.closePath();
      t.closePath();
      const lenA = a.getCurveLengths();
      const lenT = t.getCurveLengths();
      expect(lenA.length).toBe(lenT.length);
      for (let k = 0; k < lenA.length; k += 1) {
        expect(Math.abs(lenA[k]! - lenT[k]!)).toBeLessThanOrEqual(1e-6);
      }
      a.autoClose = true; t.autoClose = true;
      const spA = a.getSpacedPoints(10);
      const spT = t.getSpacedPoints(10);
      expect(spA.length).toBe(spT.length);
      for (let k = 0; k < spA.length; k += 1) {
        expect(dist2(spA[k]!, spT[k]!)).toBeLessThanOrEqual(1e-4);
      }
    }
  });

  it("Shape with holes: extractPoints + triangulateShape match three", () => {
    const rand = rng(0xd881);
    for (let i = 0; i < 100; i += 1) {
      // outer square + inner square hole, jittered
      const j = () => (rand() - 0.5) * 0.2;
      const a = new Shape();
      const t = new THREE.Shape();
      const outer: [number, number][] = [
        [j(), j()], [8 + j(), j()], [8 + j(), 8 + j()], [j(), 8 + j()]
      ];
      a.moveTo(outer[0]![0], outer[0]![1]);
      t.moveTo(outer[0]![0], outer[0]![1]);
      for (let k = 1; k < outer.length; k += 1) {
        a.lineTo(outer[k]![0], outer[k]![1]);
        t.lineTo(outer[k]![0], outer[k]![1]);
      }
      const holePts: [number, number][] = [
        [2 + j(), 2 + j()], [6 + j(), 2 + j()], [6 + j(), 6 + j()], [2 + j(), 6 + j()]
      ];
      const aHole = new Path();
      const tHole = new THREE.Path();
      aHole.moveTo(holePts[0]![0], holePts[0]![1]);
      tHole.moveTo(holePts[0]![0], holePts[0]![1]);
      for (let k = 1; k < holePts.length; k += 1) {
        aHole.lineTo(holePts[k]![0], holePts[k]![1]);
        tHole.lineTo(holePts[k]![0], holePts[k]![1]);
      }
      a.holes.push(aHole);
      t.holes.push(tHole);

      const exA = a.extractPoints(8);
      const exT = t.extractPoints(8);
      expect(exA.shape.length).toBe(exT.shape.length);
      expect(exA.holes.length).toBe(exT.holes.length);
      expect(exA.holes[0]!.length).toBe(exT.holes[0]!.length);
      for (let k = 0; k < exA.shape.length; k += 1) {
        expect(dist2(exA.shape[k]!, exT.shape[k]!)).toBeLessThanOrEqual(1e-6);
      }
      for (let k = 0; k < exA.holes[0]!.length; k += 1) {
        expect(dist2(exA.holes[0]![k]!, exT.holes[0]![k]!)).toBeLessThanOrEqual(1e-6);
      }

      // triangulateShape on the extracted contours — identical topology
      const trisA = ShapeUtils.triangulateShape(exA.shape, exA.holes);
      const trisT = THREE.ShapeUtils.triangulateShape(exT.shape, exT.holes);
      expect(trisA.length).toBe(trisT.length);
      const sortedA = trisA.map((x) => [...x].sort((p, q) => p - q).join(",")).sort();
      const sortedT = trisT.map((x) => [...x].sort((p, q) => p - q).join(",")).sort();
      expect(sortedA).toEqual(sortedT);

      // area / winding
      const areaA = ShapeUtils.area(exA.shape);
      const areaT = THREE.ShapeUtils.area(exT.shape);
      expect(Math.abs(areaA - areaT)).toBeLessThanOrEqual(1e-6);
      expect(ShapeUtils.isClockWise(exA.shape)).toBe(THREE.ShapeUtils.isClockWise(exT.shape));
    }
  });

  it("sample() returns {point, tangent} matching getPoint/getTangent", () => {
    const rand = rng(0xe992);
    const pts = Array.from({ length: 5 }, () => v3(rand));
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    for (let i = 0; i < 100; i += 1) {
      const t = rand();
      const s = curve.sample(t);
      expectVec3(s.point, curve.getPoint(t));
      expectVec3(s.tangent, curve.getTangent(t));
    }
  });
});

describe("ClampedCatmullRomCurve3 + catmullRomSegmentDerivative (R-14)", () => {
  it("segment derivative equals a central finite difference of catmullRomSegment, any alpha", () => {
    const rand = rng(0x14d3);
    for (let i = 0; i < CASES; i += 1) {
      const pts = Array.from({ length: 4 }, () => v3(rand));
      const alpha = [0, 0.25, 0.5, 0.75, 1][i % 5]!;
      const w = 0.05 + rand() * 0.9;
      const h = 1e-6;
      const d = catmullRomSegmentDerivative(pts[0]!, pts[1]!, pts[2]!, pts[3]!, w, alpha);
      const a = catmullRomSegment(pts[0]!, pts[1]!, pts[2]!, pts[3]!, w + h, alpha);
      const b = catmullRomSegment(pts[0]!, pts[1]!, pts[2]!, pts[3]!, w - h, alpha);
      const fd = a.subtract(b).multiplyScalar(1 / (2 * h));
      const scale = Math.max(1, d.length());
      expect(d.subtract(fd).length() / scale).toBeLessThanOrEqual(1e-5);
    }
  });

  it("matches three's centripetal/chordal CatmullRomCurve3 on closed splines (interior, non-degenerate)", () => {
    const rand = rng(0xc10ed);
    for (const [alpha, type] of [[0.5, "centripetal"], [1, "chordal"]] as const) {
      for (let i = 0; i < 100; i += 1) {
        const pts = Array.from({ length: 6 }, () => v3(rand));
        const ours = new ClampedCatmullRomCurve3(pts, true, alpha);
        const theirs = new THREE.CatmullRomCurve3(pts.map(tv3), true, type);
        for (let k = 0; k < 20; k += 1) {
          const t = rand();
          expectVec3(ours.getPoint(t), theirs.getPoint(t), 1e-6);
        }
      }
    }
  });

  it("open spline clamps ends: interpolates every control point at t = i/segments", () => {
    const rand = rng(0x0ae17);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
      const pts = Array.from({ length: 5 }, () => v3(rand));
      const curve = new ClampedCatmullRomCurve3(pts, false, alpha);
      expect(curve.segments).toBe(4);
      for (let i = 0; i < pts.length; i += 1) {
        expectVec3(curve.getPoint(i / 4), new THREE.Vector3(pts[i]!.x, pts[i]!.y, pts[i]!.z), 1e-9);
      }
    }
  });

  it("open-spline arc length is constant-speed under getPointAt (no end-span overshoot)", () => {
    const pts = [new Vector3(0, 0, 0), new Vector3(2, 1, 0), new Vector3(5, 1, 3), new Vector3(8, 0, 3)];
    const curve = new ClampedCatmullRomCurve3(pts, false, 0.5);
    curve.arcLengthDivisions = 256;
    const total = curve.getLength();
    const n = 6;
    const sub = 32;
    for (let i = 0; i < n; i += 1) {
      let arc = 0;
      let prev = curve.getPointAt(i / n);
      for (let k = 1; k <= sub; k += 1) {
        const p = curve.getPointAt((i + k / sub) / n);
        arc += p.distanceTo(prev);
        prev = p;
      }
      expect(Math.abs(arc - total / n) / (total / n)).toBeLessThan(0.02);
    }
  });
});
