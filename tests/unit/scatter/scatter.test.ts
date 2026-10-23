import { describe, expect, it } from "vitest";
import {
  createScatterRandom,
  scatterAlongPath,
  scatterInArea,
  scatterTransforms,
  splitScatterByDistance,
  instances
} from "../../../packages/engine/src/index.js";

// Synthetic course: a gentle S-curve with rolling height, standing in for the Cloud Runner course frames.
const centre = (s: number): [number, number, number] => [Math.sin(s / 90) * 40, 10 + Math.sin(s / 60) * 6, s];
const at = (s: number, lateral: number): [number, number, number] => {
  const p = centre(s);
  const q = centre(s + 1);
  const fx = q[0] - p[0], fz = q[2] - p[2];
  const len = Math.hypot(fx, fz) || 1;
  return [p[0] + (fz / len) * lateral, p[1], p[2] - (fx / len) * lateral];
};

// Verbatim algorithm of examples/kid-goku-beyond-the-clouds-port/props.ts `buildMesas` placement loop
// (draw order and constants unchanged), with the course helpers swapped for the synthetic path above.
function legacyMesaPlacements(length: number, chunk: number) {
  const out: Array<{ pos: number[]; scale: number[]; yaw: number; idx: number }> = [];
  const rnd = createScatterRandom(555);
  const protoCount = 6;
  const heights = [100, 118, 136, 112, 126, 104];
  for (let c0 = -60; c0 < length + 160; c0 += chunk * 2) {
    for (let s = c0; s < c0 + chunk * 2; s += 52 + rnd() * 70) {
      for (const side of [-1, 1] as const) {
        if (rnd() < 0.18) continue;
        const f = { point: centre(s) };
        const lat = side * (62 + rnd() * 230);
        const p = at(s + (rnd() - 0.5) * 40, lat);
        const idx = Math.floor(rnd() * protoCount);
        const topY = f.point[1] + (rnd() * 54 - 18) + (Math.abs(lat) > 160 ? 14 : 0);
        const sx = 0.8 + rnd() * 0.9;
        const sz = sx * (0.85 + rnd() * 0.3);
        const yaw = rnd() * 6.28;
        out.push({ pos: [p[0], topY - (-120 + heights[idx]!), p[2]], scale: [sx, 1, sz], yaw, idx });
      }
    }
  }
  return out;
}

describe("scatterAlongPath", () => {
  it("reproduces the Cloud Runner mesa layout for a fixed seed (extracted-algorithm equivalence)", () => {
    const length = 1200, chunk = 64;
    const legacy = legacyMesaPlacements(length, chunk);
    const heights = [100, 118, 136, 112, 126, 104];
    const random = createScatterRandom(555);
    const fresh: ReturnType<typeof legacyMesaPlacements> = [];
    for (let c0 = -60; c0 < length + 160; c0 += chunk * 2) {
      const points = scatterAlongPath({
        random,
        start: c0,
        end: c0 + chunk * 2,
        path: at,
        step: [52, 122],
        lateral: [62, 292],
        skipChance: 0.18,
        alongJitter: 40,
        kinds: 6,
        yOffset: [-18, 36],
        scale: [0.8, 1.7],
        scaleDepth: [0.85, 1.15],
        yaw: [0, 6.28],
        baseHeight: (s) => centre(s)[1]
      });
      for (const p of points) {
        const topY = p.position[1] + (Math.abs(p.lateral) > 160 ? 14 : 0);
        fresh.push({ pos: [p.position[0], topY - (-120 + heights[p.kind]!), p.position[2]], scale: [p.scale, 1, p.scale * p.depthScale], yaw: p.yaw, idx: p.kind });
      }
    }
    expect(fresh.length).toBe(legacy.length);
    expect(fresh.length).toBeGreaterThan(20);
    fresh.forEach((entry, i) => {
      const old = legacy[i]!;
      expect(entry.idx).toBe(old.idx);
      expect(entry.yaw).toBeCloseTo(old.yaw, 9);
      old.pos.forEach((v, k) => expect(entry.pos[k]).toBeCloseTo(v, 6));
      old.scale.forEach((v, k) => expect(entry.scale[k]).toBeCloseTo(v, 9));
    });
  });

  it("is deterministic per seed and differs across seeds", () => {
    const run = (seed: number) => scatterAlongPath({ seed, start: 0, end: 500, path: at, step: [10, 20], lateral: [5, 30], kinds: 3 });
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it("filters never shift the random stream: surviving placements keep their exact positions", () => {
    const base = scatterAlongPath({ seed: 3, start: 0, end: 600, path: at, step: [8, 16], lateral: [10, 40], kinds: 4 });
    const filtered = scatterAlongPath({
      seed: 3, start: 0, end: 600, path: at, step: [8, 16], lateral: [10, 40], kinds: 4,
      exclude: [{ kind: "circle", center: [0, 300], radius: 60 }]
    });
    expect(filtered.length).toBeLessThan(base.length);
    for (const p of filtered) expect(base.some((b) => b.position[0] === p.position[0] && b.position[2] === p.position[2] && b.kind === p.kind)).toBe(true);
  });

  it("honours exclusion zones, minDistance, height range, slope and maxCount", () => {
    const zone = { kind: "box", min: [-100, 100], max: [100, 200] } as const;
    const pts = scatterAlongPath({ seed: 1, start: 0, end: 800, path: at, step: [4, 8], lateral: [2, 20], exclude: [zone], minDistance: 6 });
    for (const p of pts) expect(p.position[2] >= 100 && p.position[2] <= 200 && p.position[0] >= -100 && p.position[0] <= 100).toBe(false);
    for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) {
      expect(Math.hypot(pts[i]!.position[0] - pts[j]!.position[0], pts[i]!.position[2] - pts[j]!.position[2])).toBeGreaterThanOrEqual(6);
    }
    const high = scatterAlongPath({ seed: 1, start: 0, end: 800, path: at, step: [4, 8], lateral: [2, 20], heightRange: [14, 99] });
    for (const p of high) expect(p.position[1]).toBeGreaterThanOrEqual(14);
    const flat = scatterAlongPath({ seed: 1, start: 0, end: 400, path: at, step: [4, 8], lateral: [2, 20], ground: (x) => x * 0.5, maxSlope: 0.1 });
    expect(flat).toEqual([]);
    expect(scatterAlongPath({ seed: 1, start: 0, end: 800, path: at, step: [4, 8], lateral: [2, 20], maxCount: 5 })).toHaveLength(5);
  });

  it("returns an empty list (not an error) when nothing is placed and feeds instances.* safely", () => {
    const none = scatterAlongPath({ seed: 1, start: 0, end: 0, path: at, step: [4, 8], lateral: [2, 20] });
    expect(none).toEqual([]);
    expect(() => instances.box({ transforms: scatterTransforms(none) })).not.toThrow();
  });

  it("validates its inputs", () => {
    expect(() => scatterAlongPath({ start: 0, end: 10, path: at, step: [0, 0], lateral: [1, 2] })).toThrow(/step/);
    expect(() => scatterAlongPath({ start: 0, end: 10, path: at, step: [1, 2], lateral: [3, 1] })).toThrow(/lateral/);
    expect(() => scatterAlongPath({ start: 0, end: 10, path: at, step: [1, 2], lateral: [1, 2], kinds: 0 })).toThrow(/kinds/);
    expect(() => scatterAlongPath({ start: 0, end: 10, path: at, step: [1, 2], lateral: [1, 2], maxSlope: 1 })).toThrow(/ground/);
  });
});

describe("scatterInArea", () => {
  it("fills a rectangle deterministically with kind, scale and yaw", () => {
    const run = () => scatterInArea({ seed: 5, area: { kind: "rect", min: [-50, -50], max: [50, 50] }, count: 40, kinds: 3, scale: [0.8, 1.2] });
    const pts = run();
    expect(pts).toHaveLength(40);
    expect(run()).toEqual(pts);
    for (const p of pts) {
      expect(Math.abs(p.position[0])).toBeLessThanOrEqual(50);
      expect([0, 1, 2]).toContain(p.kind);
      expect(p.scale).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("keeps discs inside the radius and applies minDistance", () => {
    const pts = scatterInArea({ seed: 2, area: { kind: "disc", center: [10, 20], radius: 30 }, count: 30, minDistance: 8 });
    for (const p of pts) expect(Math.hypot(p.position[0] - 10, p.position[2] - 20)).toBeLessThanOrEqual(30.0001);
    for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) {
      expect(Math.hypot(pts[i]!.position[0] - pts[j]!.position[0], pts[i]!.position[2] - pts[j]!.position[2])).toBeGreaterThanOrEqual(8);
    }
  });

  it("gives up instead of hanging when the filters cannot be satisfied", () => {
    const pts = scatterInArea({ seed: 1, area: { kind: "rect", min: [0, 0], max: [1, 1] }, count: 50, minDistance: 10 });
    expect(pts.length).toBeLessThan(50);
    expect(pts.length).toBeGreaterThanOrEqual(1);
  });

  it("uses ground() for the base height", () => {
    const pts = scatterInArea({ seed: 1, area: { kind: "rect", min: [0, 0], max: [10, 10] }, count: 5, ground: (x, z) => x + z });
    for (const p of pts) expect(p.position[1]).toBeCloseTo(p.position[0] + p.position[2], 9);
  });
});

describe("splitScatterByDistance and scatterTransforms", () => {
  const pts = scatterInArea({ seed: 4, area: { kind: "rect", min: [-100, -100], max: [100, 100] }, count: 120, kinds: 2 });
  it("splits into radius bands without losing or duplicating points", () => {
    const bands = splitScatterByDistance(pts, [0, 0], [30, 70]);
    expect(bands).toHaveLength(3);
    expect(bands.flat()).toHaveLength(pts.length);
    for (const p of bands[0]!) expect(Math.hypot(p.position[0], p.position[2])).toBeLessThanOrEqual(30);
    for (const p of bands[2]!) expect(Math.hypot(p.position[0], p.position[2])).toBeGreaterThan(70);
  });

  it("rejects descending radii", () => {
    expect(() => splitScatterByDistance(pts, [0, 0], [50, 20])).toThrow(/ascending/);
  });

  it("builds instance transforms, optionally per kind, with depth scale on Z", () => {
    const all = scatterTransforms(pts);
    const kind0 = scatterTransforms(pts, { kind: 0 });
    expect(all).toHaveLength(pts.length);
    expect(kind0.length).toBe(pts.filter((p) => p.kind === 0).length);
    const one = scatterTransforms([{ position: [1, 2, 3], yaw: 0.5, scale: 2, depthScale: 1.5, kind: 0, along: 0, lateral: 0 }], { baseScale: 2 });
    expect(one[0]).toEqual({ position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [4, 4, 6] });
  });
});
