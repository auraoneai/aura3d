// K-01/K-03: pure spatial indices (points + instances), tolerance math, and loose timing upper bounds.
import { describe, expect, it } from "vitest";
import { InstanceIndex, PointCloudIndex, pixelTolerance, type Vec3 } from "../../../packages/engine/src/agent-api/spatialIndex";

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cloud = (n: number, seed: number, extent = 10): Float32Array => {
  const r = rng(seed); const p = new Float32Array(n * 3);
  for (let i = 0; i < p.length; i += 1) p[i] = (r() - 0.5) * extent;
  return p;
};

function brute(p: Float32Array, o: Vec3, dir: Vec3, radius: number, slope: number, depth: boolean): number {
  const d = unit(dir); let best = -1, bs = Infinity;
  for (let i = 0; i < p.length / 3; i += 1) {
    const v = [p[i * 3]! - o[0], p[i * 3 + 1]! - o[1], p[i * 3 + 2]! - o[2]];
    const t = v[0]! * d[0] + v[1]! * d[1] + v[2]! * d[2];
    if (t < 0) continue;
    const perp = Math.hypot(v[0]! - t * d[0], v[1]! - t * d[1], v[2]! - t * d[2]);
    const allowed = radius + slope * t;
    if (!(perp <= allowed)) continue;
    const score = depth ? t : (allowed > 0 ? perp / allowed : perp);
    if (score < bs) { bs = score; best = i; }
  }
  return best;
}

describe("PointCloudIndex", () => {
  it("golden: picks the point nearest the ray within the world radius", () => {
    const p = new Float32Array([5, 0.3, 0, 8, 0.05, 0, 3, 2, 0, -4, 0, 0]);
    const index = new PointCloudIndex(p);
    const hit = index.pick({ origin: [0, 0, 0], direction: [1, 0, 0] }, { radius: 0.5 });
    expect(hit?.index).toBe(1);
    expect(hit?.distance).toBeCloseTo(8, 6);
    expect(hit?.rayDistance).toBeCloseTo(0.05, 6);
    expect(hit?.point[0]).toBe(8);
    expect(index.pick({ origin: [0, 0, 0], direction: [1, 0, 0] }, { radius: 0.01 })).toBeUndefined();
    expect(index.pick({ origin: [0, 0, 0], direction: [1, 0, 0] }, { radius: 0.5, near: 6 })?.index).toBe(1);
    expect(index.pick({ origin: [0, 0, 0], direction: [-1, 0, 0] }, { radius: 0.1 })?.index).toBe(3);
  });

  it("slope tolerance grows with distance and depth rank prefers the nearer point", () => {
    const p = new Float32Array([2, 0.09, 0, 20, 0.9, 0]);
    const index = new PointCloudIndex(p);
    const ray = { origin: [0, 0, 0] as Vec3, direction: [1, 0, 0] as Vec3 };
    expect(index.pick(ray, { slope: 0.05 })?.index).toBe(1);
    expect(index.pick(ray, { slope: 0.05, rank: "depth" })?.index).toBe(0);
    expect(index.pick(ray, { slope: 0.01 })).toBeUndefined();
  });

  it("matches a brute-force scan on random clouds, rays and tolerances", () => {
    const p = cloud(20000, 7);
    const index = new PointCloudIndex(p);
    const r = rng(99);
    let hits = 0;
    for (let k = 0; k < 150; k += 1) {
      const o: Vec3 = [(r() - 0.5) * 30, (r() - 0.5) * 30, (r() - 0.5) * 30];
      const target: Vec3 = [(r() - 0.5) * 8, (r() - 0.5) * 8, (r() - 0.5) * 8];
      const dir: Vec3 = [target[0] - o[0], target[1] - o[1], target[2] - o[2]];
      const radius = r() * 0.3, slope = r() * 0.02, depth = k % 3 === 0;
      const got = index.pick({ origin: o, direction: dir }, { radius, slope, rank: depth ? "depth" : "ray" });
      const want = brute(p, o, dir, radius, slope, depth);
      expect(got?.index ?? -1).toBe(want);
      if (want >= 0) hits += 1;
    }
    expect(hits).toBeGreaterThan(20);
  });

  it("falls back to a correct scan when the tolerance exceeds the neighbourhood ring", () => {
    const p = cloud(5000, 3);
    const index = new PointCloudIndex(p);
    const o: Vec3 = [-30, 0, 0], dir: Vec3 = [1, 0.01, 0];
    expect(index.pick({ origin: o, direction: dir }, { radius: 4 })?.index ?? -1).toBe(brute(p, o, dir, 4, 0, false));
  });

  it("builds lazily once, and rebuilds only after invalidate", () => {
    const p = cloud(1000, 5);
    const index = new PointCloudIndex(p);
    expect(index.buildCount).toBe(0);
    const ray = { origin: [-20, 0, 0] as Vec3, direction: [1, 0, 0] as Vec3 };
    index.pick(ray, { radius: 0.5 }); index.pick(ray, { radius: 0.5 });
    expect(index.buildCount).toBe(1);
    p[0] = 0; p[1] = 0; p[2] = 0;
    index.invalidate();
    expect(index.pick(ray, { radius: 1e-6 })?.index).toBe(0);
    expect(index.buildCount).toBe(2);
    index.update(p, 0);
    expect(index.pick(ray, { radius: 1 })).toBeUndefined();
  });

  it("handles degenerate clouds: empty, single, coplanar, coincident and non-finite", () => {
    const ray = { origin: [0, 0, -5] as Vec3, direction: [0, 0, 1] as Vec3 };
    expect(new PointCloudIndex(new Float32Array(0)).pick(ray, { radius: 1 })).toBeUndefined();
    expect(new PointCloudIndex(new Float32Array([0, 0, 0])).pick(ray, { radius: 0.1 })?.index).toBe(0);
    expect(new PointCloudIndex(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0])).pick(ray, { radius: 0.1 })?.index).toBe(0);
    const plane = new Float32Array([-1, -1, 0, 1, 1, 0, 0.001, 0, 0]);
    expect(new PointCloudIndex(plane).pick(ray, { radius: 0.01 })?.index).toBe(2);
    const nan = new Float32Array([NaN, 0, 0, 0, 0, 1]);
    expect(new PointCloudIndex(nan).pick(ray, { radius: 0.1 })?.index).toBe(1);
    expect(new PointCloudIndex(plane).pick({ origin: [0, 0, 0], direction: [0, 0, 0] }, { radius: 1 })).toBeUndefined();
  });

  it("100K points: build and pick stay under loose bounds and agree with brute force", () => {
    const p = cloud(100_000, 11, 20);
    const index = new PointCloudIndex(p);
    const ray = { origin: [-40, 1, 2] as Vec3, direction: unit([1, 0.02, -0.03]) };
    const t0 = performance.now();
    index.ensureBuilt();
    const build = performance.now() - t0;
    const t1 = performance.now();
    let last: ReturnType<typeof index.pick>;
    for (let i = 0; i < 100; i += 1) last = index.pick(ray, { radius: 0.05, slope: 0.001 });
    const per = (performance.now() - t1) / 100;
    expect(last?.index ?? -1).toBe(brute(p, ray.origin, ray.direction, 0.05, 0.001, false));
    expect(build).toBeLessThan(5000);
    expect(per).toBeLessThan(25);
  });

  it("1M points: lazy build and pick finish within loose bounds", () => {
    const p = cloud(1_000_000, 13, 40);
    const index = new PointCloudIndex(p);
    const ray = { origin: [-80, 0, 0] as Vec3, direction: [1, 0.001, 0.002] as Vec3 };
    const t0 = performance.now();
    index.ensureBuilt();
    const build = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20; i += 1) index.pick(ray, { radius: 0.02, slope: 0.0005 });
    const per = (performance.now() - t1) / 20;
    expect(index.buildCount).toBe(1);
    expect(build).toBeLessThan(15000);
    expect(per).toBeLessThan(100);
  });
});

const matrix = (pos: Vec3, scale: Vec3 = [1, 1, 1], rotZ = 0): Float32Array => {
  const c = Math.cos(rotZ), s = Math.sin(rotZ);
  return Float32Array.from([c * scale[0], s * scale[0], 0, 0, -s * scale[1], c * scale[1], 0, 0, 0, 0, scale[2], 0, pos[0], pos[1], pos[2], 1]);
};

describe("InstanceIndex", () => {
  const box = { min: [-0.5, -0.5, -0.5] as Vec3, max: [0.5, 0.5, 0.5] as Vec3 };

  it("golden: nearest of two boxes on the ray, with point, normal and instance id", () => {
    const m = new Float32Array(32); m.set(matrix([10, 0, 0]), 0); m.set(matrix([4, 0, 0]), 16);
    const hit = new InstanceIndex(m, 2, box).pick({ origin: [0, 0, 0], direction: [1, 0, 0] });
    expect(hit?.instanceId).toBe(1);
    expect(hit?.distance).toBeCloseTo(3.5, 6);
    expect(hit?.point[0]).toBeCloseTo(3.5, 6);
    expect(hit?.normal[0]).toBeCloseTo(-1, 6);
    expect(new InstanceIndex(m, 2, box).pick({ origin: [0, 3, 0], direction: [1, 0, 0] })).toBeUndefined();
    expect(new InstanceIndex(m, 2, box).pick({ origin: [0, 0, 0], direction: [1, 0, 0] }, { far: 3 })).toBeUndefined();
  });

  it("rotated and scaled boxes use the transformed box, spheres the bound", () => {
    // 4x1 slab rotated 90 degrees about Z becomes 1 wide, 4 tall.
    const m = matrix([0, 0, 0], [4, 1, 1], Math.PI / 2);
    const index = new InstanceIndex(m, 1, box);
    expect(index.pick({ origin: [-5, 2.5, 0], direction: [1, 0, 0] })).toBeUndefined();
    expect(index.pick({ origin: [-5, 2.5, 0], direction: [1, 0, 0] }, { shape: "sphere" })?.instanceId).toBe(0);
    const hit = index.pick({ origin: [0, 5, 0], direction: [0, -1, 0] });
    expect(hit?.distance).toBeCloseTo(3, 5);
    expect(hit?.normal[1]).toBeCloseTo(1, 5);
  });

  it("matches a brute-force AABB scan on 5K random instances", () => {
    const n = 5000, r = rng(21), m = new Float32Array(n * 16);
    const centres: Vec3[] = [], half: Vec3[] = [];
    for (let i = 0; i < n; i += 1) {
      const c: Vec3 = [(r() - 0.5) * 100, (r() - 0.5) * 100, (r() - 0.5) * 100], s: Vec3 = [0.3 + r(), 0.3 + r(), 0.3 + r()];
      m.set(matrix(c, s), i * 16); centres.push(c); half.push([s[0] * 0.5, s[1] * 0.5, s[2] * 0.5]);
    }
    const index = new InstanceIndex(m, n, box);
    let hits = 0;
    for (let k = 0; k < 200; k += 1) {
      const o: Vec3 = [(r() - 0.5) * 200, (r() - 0.5) * 200, 150], tgt = centres[Math.floor(r() * n)]!;
      const d = unit([tgt[0] - o[0] + (r() - 0.5), tgt[1] - o[1] + (r() - 0.5), tgt[2] - o[2]]);
      let bt = Infinity, bi = -1;
      for (let i = 0; i < n; i += 1) {
        let t0 = 0, t1 = Infinity, ok = true;
        for (let a = 0; a < 3 && ok; a += 1) {
          const lo = centres[i]![a]! - half[i]![a]!, hi = centres[i]![a]! + half[i]![a]!;
          if (Math.abs(d[a]!) < 1e-12) { if (o[a]! < lo || o[a]! > hi) ok = false; continue; }
          let ta = (lo - o[a]!) / d[a]!, tb = (hi - o[a]!) / d[a]!;
          if (ta > tb) [ta, tb] = [tb, ta];
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
        }
        if (ok && t0 < bt) { bt = t0; bi = i; }
      }
      const got = index.pick({ origin: o, direction: d });
      expect(got?.instanceId ?? -1).toBe(bi);
      if (bi >= 0) { hits += 1; expect(got!.distance).toBeCloseTo(bt, 3); }
    }
    expect(hits).toBeGreaterThan(30);
  });

  it("rebuilds lazily after invalidate and tracks moved instances; 5K picks are fast", () => {
    const n = 5000, m = new Float32Array(n * 16), r = rng(2);
    for (let i = 0; i < n; i += 1) m.set(matrix([(r() - 0.5) * 80, (r() - 0.5) * 80, (r() - 0.5) * 80]), i * 16);
    const index = new InstanceIndex(m, n, box);
    const ray = { origin: [0, 0, 100] as Vec3, direction: [0, 0, -1] as Vec3 };
    const t = performance.now();
    for (let i = 0; i < 200; i += 1) index.pick(ray);
    expect((performance.now() - t) / 200).toBeLessThan(10);
    expect(index.buildCount).toBe(1);
    m.set(matrix([0, 0, 50]), 0);
    index.invalidate();
    expect(index.pick(ray)?.instanceId).toBe(0);
    expect(index.buildCount).toBe(2);
  });
});

describe("pixelTolerance", () => {
  it("perspective: slope is the angular size of the pixel radius", () => {
    const a = { origin: [0, 0, 0] as Vec3, direction: unit([0, 0, -1]) };
    const b = { origin: [0, 0, 0] as Vec3, direction: unit([0, 0.001, -1]) };
    const t = pixelTolerance(a, b, 8);
    expect(t.slope).toBeCloseTo(0.008, 5);
    expect(t.radius).toBe(0);
  });
  it("orthographic: constant world radius", () => {
    const a = { origin: [0, 0, 5] as Vec3, direction: [0, 0, -1] as Vec3 };
    const b = { origin: [0, 0.01, 5] as Vec3, direction: [0, 0, -1] as Vec3 };
    const t = pixelTolerance(a, b, 10);
    expect(t.radius).toBeCloseTo(0.1, 6);
    expect(t.slope).toBe(0);
  });
});
