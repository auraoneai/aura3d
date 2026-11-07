import { describe, expect, it } from "vitest";
import {
  catmullRomCurve,
  composeGeometry,
  createFbm2D,
  createFbm3D,
  createSimplexNoise2D,
  createSimplexNoise3D,
  cubicBezierCurve,
  heightfieldGeometry,
  latheGeometry,
  parametricSurface,
  path2d,
  sampleCurve,
  seededRandom,
  sweepGeometry,
  type ProceduralGeometry
} from "@aura3d/engine/procedural";

const f32 = (v: unknown): Float32Array => v as Float32Array;
const idx = (g: ProceduralGeometry): Uint32Array => g.indices as Uint32Array;

/** Weld by quantised position, then report manifold/winding/volume facts. */
function analyse(g: ProceduralGeometry) {
  const pos = f32(g.positions), ind = idx(g);
  const key = (i: number) => `${Math.round(pos[i * 3]! * 1e4)},${Math.round(pos[i * 3 + 1]! * 1e4)},${Math.round(pos[i * 3 + 2]! * 1e4)}`;
  const ids = new Map<string, number>();
  const weld = (i: number) => { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k)!; };
  const directed = new Map<string, number>();
  let volume = 0, degenerate = 0, normalAgree = 0, triangles = 0;
  const nrm = f32(g.normals!);
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t]!, b = ind[t + 1]!, c = ind[t + 2]!;
    const [wa, wb, wc] = [weld(a), weld(b), weld(c)];
    if (wa === wb || wb === wc || wa === wc) { degenerate += 1; continue; }
    triangles += 1;
    for (const [p, q] of [[wa, wb], [wb, wc], [wc, wa]] as const) directed.set(`${p}>${q}`, (directed.get(`${p}>${q}`) ?? 0) + 1);
    const P = (i: number) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!] as const;
    const [A, B, C] = [P(a), P(b), P(c)];
    volume += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const sx = nrm[a * 3]! + nrm[b * 3]! + nrm[c * 3]!, sy = nrm[a * 3 + 1]! + nrm[b * 3 + 1]! + nrm[c * 3 + 1]!, sz = nrm[a * 3 + 2]! + nrm[b * 3 + 2]! + nrm[c * 3 + 2]!;
    if (n[0]! * sx + n[1]! * sy + n[2]! * sz > 0) normalAgree += 1;
  }
  let openEdges = 0, nonManifold = 0;
  for (const [k, count] of directed) {
    const [p, q] = k.split(">");
    if (count > 1) nonManifold += 1;
    if (!directed.has(`${q}>${p}`)) openEdges += 1;
  }
  return { triangles, degenerate, openEdges, nonManifold, volume, normalAgree };
}

const unitLength = (g: ProceduralGeometry): number => {
  const n = f32(g.normals!);
  let worst = 0;
  for (let i = 0; i < n.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) - 1));
  return worst;
};
const bytes = (g: ProceduralGeometry): string => JSON.stringify([Array.from(f32(g.positions)), Array.from(idx(g))]);

describe("noise", () => {
  it("is deterministic per seed, bounded and varies with seed", () => {
    const a = createSimplexNoise2D(7), b = createSimplexNoise2D(7), c = createSimplexNoise2D(8);
    let diff = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 2000; i += 1) {
      const x = i * 0.137, y = i * 0.071;
      expect(a(x, y)).toBe(b(x, y));
      diff += Math.abs(a(x, y) - c(x, y));
      lo = Math.min(lo, a(x, y)); hi = Math.max(hi, a(x, y));
    }
    expect(diff).toBeGreaterThan(10);
    expect(lo).toBeGreaterThanOrEqual(-1);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi - lo).toBeGreaterThan(1.2);
  });
  it("is continuous (no jumps between nearby samples) in 2D and 3D", () => {
    const n2 = createSimplexNoise2D(3), n3 = createSimplexNoise3D(3);
    for (let i = 0; i < 500; i += 1) {
      expect(Math.abs(n2(i * 0.31, i * 0.17) - n2(i * 0.31 + 1e-4, i * 0.17))).toBeLessThan(0.01);
      expect(Math.abs(n3(i * 0.31, i * 0.17, i * 0.05) - n3(i * 0.31, i * 0.17 + 1e-4, i * 0.05))).toBeLessThan(0.01);
    }
  });
  it("fbm stays in [-1, 1], ridged differs from plain, 3D works, bad octaves throw", () => {
    const plain = createFbm2D(1), ridged = createFbm2D(1, { ridged: true }), f3 = createFbm3D(1, { octaves: 3 });
    let differs = false;
    for (let i = 0; i < 500; i += 1) {
      const v = plain(i * 0.2, i * 0.13), r = ridged(i * 0.2, i * 0.13), w = f3(i * 0.2, i * 0.13, i * 0.05);
      for (const s of [v, r, w]) { expect(s).toBeGreaterThanOrEqual(-1); expect(s).toBeLessThanOrEqual(1); }
      if (Math.abs(v - r) > 0.05) differs = true;
    }
    expect(differs).toBe(true);
    expect(() => createFbm2D(1, { octaves: 0 })).toThrow(/octaves/);
  });
  it("seededRandom is repeatable", () => {
    const a = seededRandom(5), b = seededRandom(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("path2d and curves", () => {
  it("samples lines, beziers and arcs deterministically", () => {
    const pts = path2d().moveTo(0, 0).lineTo(1, 0).quadTo(2, 0, 2, 1).cubicTo(2, 2, 1, 3, 0, 3).points({ curveSegments: 8 });
    expect(pts.length).toBe(1 + 1 + 8 + 8);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([0, 3]);
    const arc = path2d().arc(0, 0, 2, 0, Math.PI / 2).points({ curveSegments: 4 });
    expect(arc[0]![0]).toBeCloseTo(2);
    expect(arc[arc.length - 1]![1]).toBeCloseTo(2);
    for (const p of arc) expect(Math.hypot(p[0], p[1])).toBeCloseTo(2, 6);
  });
  it("catmull-rom passes through its points; bezier hits endpoints; resampling is arc-length even", () => {
    const pts = [[0, 0, 0], [1, 2, 0], [3, 2, 1], [4, 0, 1]] as const;
    const c = catmullRomCurve(pts);
    expect(c.point(0)).toEqual([0, 0, 0]);
    for (let i = 1; i < 4; i += 1) {
      const p = c.point(i / 3);
      expect(Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1], p[2] - pts[i]![2])).toBeLessThan(1e-6);
    }
    expect(cubicBezierCurve([[0, 0, 0], [1, 1, 0], [2, 1, 0], [3, 0, 0]]).point(1)).toEqual([3, 0, 0]);
    const s = sampleCurve(c, 20);
    const gaps = s.points.slice(1).map((p, i) => Math.hypot(p[0] - s.points[i]![0], p[1] - s.points[i]![1], p[2] - s.points[i]![2]));
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.15);
    expect(() => cubicBezierCurve([[0, 0, 0], [1, 1, 0], [2, 1, 0]])).toThrow();
  });
});

describe("latheGeometry", () => {
  const profile = [[0, 0], [1, 0], [1, 2], [0.4, 3], [0, 3]] as const;
  it("builds a watertight, outward-facing, unit-normal solid with exact bounds", () => {
    const g = latheGeometry({ profile, segments: 24 });
    const a = analyse(g);
    expect(a.openEdges).toBe(0);
    expect(a.nonManifold).toBe(0);
    expect(a.volume).toBeGreaterThan(0);
    expect(a.normalAgree).toBe(a.triangles);
    expect(unitLength(g)).toBeLessThan(1e-5);
    expect(g.bounds!.max[1]).toBeCloseTo(3);
    expect(g.bounds!.min[1]).toBeCloseTo(0);
    expect(g.bounds!.max[0]).toBeCloseTo(1, 1);
    // cylinder volume approx: pi*1*2 + frustum
    expect(a.volume).toBeGreaterThan(6.2 + 1);
  });
  it("keeps hard edges at sharp turns and smooths gentle ones", () => {
    const sharp = latheGeometry({ profile: [[0, 0], [1, 0], [1, 1], [0, 1]], segments: 8 });
    const n = f32(sharp.normals!);
    // some normal is exactly axial (cap) and some exactly radial (wall): no blended 45-degree normals
    let blended = 0;
    for (let i = 0; i < n.length; i += 3) if (Math.abs(n[i + 1]!) > 0.2 && Math.abs(n[i + 1]!) < 0.98) blended += 1;
    expect(blended).toBe(0);
    const round = path2d().moveTo(0, 0).arc(0, 1, 1, -Math.PI / 2, Math.PI / 2).points({ curveSegments: 12 });
    const smooth = latheGeometry({ profile: round, segments: 24 });
    expect(analyse(smooth).openEdges).toBe(0);
    expect(analyse(smooth).volume).toBeCloseTo((4 / 3) * Math.PI, 0);
  });
  it("is deterministic, flip reverses profile order, partial sweep stays open, bad input throws", () => {
    expect(bytes(latheGeometry({ profile, segments: 12 }))).toBe(bytes(latheGeometry({ profile, segments: 12 })));
    expect(analyse(latheGeometry({ profile: [...profile].reverse(), flip: true, segments: 12 })).volume).toBeGreaterThan(0);
    expect(analyse(latheGeometry({ profile, segments: 12, phiLength: Math.PI })).openEdges).toBeGreaterThan(0);
    expect(() => latheGeometry({ profile: [[1, 0]] })).toThrow();
    expect(() => latheGeometry({ profile: [[-1, 0], [1, 1]] })).toThrow(/radius/);
    expect(() => latheGeometry({ profile: [[1, 0], [1, 0]] })).toThrow(/zero-length/);
  });
});

describe("sweepGeometry", () => {
  it("sweeps a capped tube watertight and outward with correct vertex counts", () => {
    const g = sweepGeometry({ path: [[0, 0, 0], [2, 1, 0], [4, 0, 1], [6, 1, 1]], steps: 30, radius: 0.3, radialSegments: 10 });
    const a = analyse(g);
    expect(a.openEdges).toBe(0);
    expect(a.nonManifold).toBe(0);
    expect(a.volume).toBeGreaterThan(0);
    expect(a.normalAgree).toBe(a.triangles);
    expect(unitLength(g)).toBeLessThan(1e-5);
    expect(f32(g.positions).length / 3).toBe(10 * 2 * 31 + 2 * 11);
    expect(a.triangles).toBe(10 * 30 * 2 + 2 * 10);
    // volume approx pi r^2 L
    const length = sampleCurve(catmullRomCurve([[0, 0, 0], [2, 1, 0], [4, 0, 1], [6, 1, 1]]), 30).totalLength;
    expect(a.volume / (Math.PI * 0.09 * length)).toBeGreaterThan(0.9);
    expect(a.volume / (Math.PI * 0.09 * length)).toBeLessThan(1.05);
  });
  it("closed loops wrap without open edges and need no caps", () => {
    const ring = [[2, 0, 0], [0, 0, 2], [-2, 0, 0], [0, 0, -2]] as const;
    const g = sweepGeometry({ path: catmullRomCurve(ring, { closed: true }), steps: 48, radius: 0.2, radialSegments: 8 });
    const a = analyse(g);
    expect(a.openEdges).toBe(0);
    expect(a.volume).toBeGreaterThan(0);
    expect(g.bounds!.max[0]).toBeGreaterThan(2.1);
  });
  it("supports a square profile with hard edges, variable radius and twist; rejects bad radius", () => {
    const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    const beam = sweepGeometry({ path: [[0, 0, 0], [4, 0, 0]], steps: 1, radius: 0.25, profile: square });
    const b = analyse(beam);
    expect(b.openEdges).toBe(0);
    expect(b.volume).toBeCloseTo(0.5 * 0.5 * 4, 2);
    expect(beam.bounds!.max[0]).toBeCloseTo(4);
    const cone = sweepGeometry({ path: [[0, 0, 0], [0, 3, 0]], steps: 16, radius: (t) => 1 - t * 0.8, radialSegments: 16 });
    expect(analyse(cone).volume).toBeGreaterThan(0);
    expect(unitLength(cone)).toBeLessThan(1e-5);
    expect(analyse(sweepGeometry({ path: [[0, 0, 0], [0, 3, 0]], steps: 8, twist: 1, profile: square })).openEdges).toBe(0);
    expect(() => sweepGeometry({ path: [[0, 0, 0], [1, 0, 0]], radius: -1 })).toThrow(/radius/);
    expect(() => sweepGeometry({ path: [[0, 0, 0]] })).toThrow();
  });
  it("is deterministic", () => {
    const o = { path: [[0, 0, 0], [1, 2, 0], [3, 2, 1]] as const, steps: 12 };
    expect(bytes(sweepGeometry(o))).toBe(bytes(sweepGeometry(o)));
  });
});

describe("parametricSurface", () => {
  const sphere = (u: number, v: number) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)] as const;
  };
  it("builds a sphere with outward analytic normals and volume close to 4/3 pi", () => {
    const g = parametricSurface({ fn: sphere, uSegments: 48, vSegments: 32, wrapU: true });
    const a = analyse(g);
    expect(a.openEdges).toBe(0);
    expect(a.volume).toBeGreaterThan(0);
    expect(a.volume / ((4 / 3) * Math.PI)).toBeGreaterThan(0.97);
    const n = f32(g.normals!), p = f32(g.positions);
    for (let i = 0; i < n.length; i += 3) expect(n[i]! * p[i]! + n[i + 1]! * p[i + 1]! + n[i + 2]! * p[i + 2]!).toBeGreaterThan(0.99);
    expect(unitLength(g)).toBeLessThan(1e-5);
  });
  it("noise-displaced rock stays deterministic and bounded; torus wraps both ways", () => {
    const noise = createFbm3D(11, { octaves: 3 });
    const rock = (u: number, v: number) => { const d = sphere(u, v); const r = 1 + 0.25 * noise(d[0] * 1.5, d[1] * 1.5, d[2] * 1.5); return [d[0] * r, d[1] * r, d[2] * r] as const; };
    const a = parametricSurface({ fn: rock, uSegments: 32, vSegments: 24, wrapU: true });
    expect(bytes(a)).toBe(bytes(parametricSurface({ fn: rock, uSegments: 32, vSegments: 24, wrapU: true })));
    expect(a.bounds!.max[1]).toBeLessThan(1.3);
    expect(a.bounds!.min[1]).toBeGreaterThan(-1.3);
    expect(analyse(a).openEdges).toBe(0);
    const torus = parametricSurface({
      fn: (u, v) => [(2 + 0.5 * Math.cos(v * Math.PI * 2)) * Math.cos(u * Math.PI * 2), 0.5 * Math.sin(v * Math.PI * 2), (2 + 0.5 * Math.cos(v * Math.PI * 2)) * Math.sin(u * Math.PI * 2)],
      uSegments: 32, vSegments: 16, wrapU: true, wrapV: true
    });
    expect(analyse(torus).openEdges).toBe(0);
    expect(() => parametricSurface({ fn: () => [NaN, 0, 0] })).toThrow(/non-finite/);
  });
});

describe("heightfieldGeometry", () => {
  const fbm = createFbm2D(5, { octaves: 4, frequency: 0.08 });
  const heightAt = (x: number, z: number) => 3 + fbm(x, z) * 2;
  it("has the expected counts, bounds and upward normals", () => {
    const g = heightfieldGeometry({ heightAt, size: [20, 10], segments: [20, 10] });
    expect(f32(g.positions).length / 3).toBe(21 * 11);
    expect(idx(g).length / 3).toBe(20 * 10 * 2);
    expect(g.bounds!.min[0]).toBeCloseTo(-10);
    expect(g.bounds!.max[2]).toBeCloseTo(5);
    expect(unitLength(g)).toBeLessThan(1e-5);
    const n = f32(g.normals!);
    for (let i = 1; i < n.length; i += 3) expect(n[i]).toBeGreaterThan(0);
    // all top triangles face up
    expect(analyse(g).normalAgree).toBe(analyse(g).triangles);
  });
  it("closes into a watertight slab when base is set, with colours on every vertex", () => {
    const g = heightfieldGeometry({ heightAt, size: 16, segments: 24, base: -1, colorAt: (_x, _z, h, slope) => [h / 6, 0.5, 0.3, 1 - slope] });
    const a = analyse(g);
    expect(a.openEdges).toBe(0);
    expect(a.nonManifold).toBe(0);
    expect(a.volume).toBeGreaterThan(16 * 16 * 3);
    expect(a.normalAgree).toBe(a.triangles);
    expect((g.colors as Float32Array).length).toBe((f32(g.positions).length / 3) * 4);
    expect(() => heightfieldGeometry({ heightAt, base: 4 })).toThrow(/below the lowest/);
  });
  it("is deterministic and validates input", () => {
    const o = { heightAt, size: 8, segments: 8 };
    expect(bytes(heightfieldGeometry(o))).toBe(bytes(heightfieldGeometry(o)));
    expect(() => heightfieldGeometry({ heightAt, size: 0 })).toThrow();
    expect(() => heightfieldGeometry({ heightAt: () => NaN, size: 4, segments: 2 })).toThrow();
  });
});

describe("composeGeometry", () => {
  it("merges transformed parts with per-part colours and keeps volume and winding", () => {
    const post = latheGeometry({ profile: [[0, 0], [0.5, 0], [0.5, 2], [0, 2]], segments: 16 });
    const solo = analyse(post).volume;
    const merged = composeGeometry([
      { geometry: post, position: [0, 0, 0], color: [1, 0, 0, 1] },
      { geometry: post, position: [3, 0, 0], rotation: [0, 0, Math.PI / 2], scale: 2, color: [0, 1, 0, 1] },
      { geometry: post, position: [-3, 0, 0], scale: [-1, 1, 1], color: [0, 0, 1, 1] }
    ]);
    const a = analyse(merged);
    expect(a.openEdges).toBe(0);
    expect(a.volume).toBeCloseTo(solo * (1 + 8 + 1), 1);
    expect(a.normalAgree).toBe(a.triangles);
    expect(f32(post.positions).length * 3).toBe(f32(merged.positions).length);
    expect(Array.from((merged.colors as Float32Array).slice(0, 4))).toEqual([1, 0, 0, 1]);
    expect(merged.bounds!.max[0]).toBeCloseTo(3, 1); // rotated 90 degrees: the scaled post lies along -x from x = 3
    expect(merged.bounds!.min[0]).toBeLessThan(-3.4);
    expect(() => composeGeometry([])).toThrow();
    expect(() => composeGeometry([{ geometry: post, scale: [0, 1, 1] }])).toThrow(/non-zero/);
  });
});
