/**
 * GU47 SO47-W1 (lane g15): the jagged crater rim that rings the course at 600-900 m, and the instanced rocks and
 * spires between the track and the wall. Deterministic (seeded) and renderer-free, so unit tests can count it.
 * The wall is built in "rim units" (RIM_UNIT metres each) so the mineral shader's object-space strata read as
 * 30-40 m bands on the far wall instead of aliasing metre-scale stripes; the node is scaled by RIM_UNIT.
 */
import { lehmer } from "../obstacles";

export const RIM_UNIT = 20;
export const RIM = { innerRadius: 600, outerRadius: 900, baseY: -90, crestMin: 45, crestMax: 150, segments: 192 } as const;

export interface RimMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

/** Jagged crest height (metres) at angle `a`: layered sines plus seeded spikes, so the horizon is broken, not a band. */
export function crestHeight(a: number): number {
  const base = 0.5 + 0.22 * Math.sin(a * 3 + 0.7) + 0.14 * Math.sin(a * 7.3 + 2.1) + 0.08 * Math.sin(a * 17.9);
  const spike = Math.pow(Math.max(0, Math.sin(a * 29 + 1.3)), 6) * 0.35 + Math.pow(Math.max(0, Math.sin(a * 47 + 4.2)), 10) * 0.25;
  const t = Math.max(0, Math.min(1, base + spike));
  return RIM.crestMin + (RIM.crestMax - RIM.crestMin) * t;
}

/**
 * The wall: per angle a 4-point profile (inner foot, inner shoulder, crest, outer foot), stitched into quads.
 * One draw call.
 */
export function buildCraterRim(segments: number = RIM.segments): RimMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rand = lehmer(6021);
  const profile = 4;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const crest = crestHeight(a);
    const jitter = (rand() - 0.5) * 40;
    const rings: readonly (readonly [number, number])[] = [
      [RIM.innerRadius + jitter, RIM.baseY],
      [RIM.innerRadius + 60 + jitter * 0.5, RIM.baseY + (crest - RIM.baseY) * 0.62],
      [RIM.innerRadius + 120, crest],
      [RIM.outerRadius, RIM.baseY]
    ];
    rings.forEach(([r, y], k) => {
      positions.push((c * r) / RIM_UNIT, y / RIM_UNIT, (s * r) / RIM_UNIT);
      // Inward-facing normal tilted up by the local slope (the course sees the inner face).
      const next = rings[Math.min(k + 1, profile - 1)]!;
      const prev = rings[Math.max(k - 1, 0)]!;
      const dr = next[0] - prev[0], dy = next[1] - prev[1];
      const len = Math.hypot(dr, dy) || 1;
      const nr = -dy / len, ny = dr / len;
      const facing = k < 3 ? -1 : 1;
      normals.push(c * Math.abs(nr) * facing, Math.abs(ny), s * Math.abs(nr) * facing);
      uvs.push(i / segments, k / (profile - 1));
    });
  }
  for (let i = 0; i < segments; i++) {
    for (let k = 0; k < profile - 1; k++) {
      const a = i * profile + k, b = (i + 1) * profile + k;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, uvs, indices };
}

export interface RockTransform {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
}

/**
 * Exact crater-basin and stratified wall elevation (metres) at world `(x, z)`.
 * Matches `buildCraterRim`'s radial profile from the central basin floor up through the inner foot,
 * shoulder, jagged crest, and outer flank so instanced boulders and outcrops sit planted in terrain.
 */
export function rimHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const rawAngle = Math.atan2(z, x);
  const a = rawAngle < 0 ? rawAngle + Math.PI * 2 : rawAngle;
  const crest = crestHeight(a);
  const r0 = RIM.innerRadius;
  const r1 = RIM.innerRadius + 60;
  const r2 = RIM.innerRadius + 120;
  const r3 = RIM.outerRadius;
  const y0 = RIM.baseY;
  const y1 = RIM.baseY + (crest - RIM.baseY) * 0.62;
  const y2 = crest;
  const y3 = RIM.baseY;
  if (r < r0) {
    // Crater basin floor gently dishes from -72 m near the inner ring down to -90 m at the wall foot,
    // with subtle radial ejecta ridges so sea-stack outcrops sit rooted in the regolith basin.
    const t = Math.max(0, Math.min(1, (r - 320) / Math.max(1, r0 - 320)));
    const ridge = Math.sin(a * 5 + r * 0.018) * 3.5 + Math.cos(a * 11 - r * 0.011) * 2.0;
    return -72 + (y0 - -72) * t + ridge;
  }
  if (r < r1) {
    const t = (r - r0) / (r1 - r0);
    return y0 + (y1 - y0) * t;
  }
  if (r < r2) {
    const t = (r - r1) / (r2 - r1);
    return y1 + (y2 - y1) * t;
  }
  if (r < r3) {
    const t = (r - r2) / (r3 - r2);
    return y2 + (y3 - y2) * t;
  }
  return y3;
}

/**
 * Grounded lunar boulders on the rim's inner slope, jagged basalt sea-stacks rising out of the crater basin,
 * and scattered regolith apron moon-rocks — each planted 0.8 m below `rimHeight(x, z)` so zero boulders float.
 * High: 260 rim boulders + 80 basin outcrops + 120 moon-rock clusters; Low: half (one instanced draw per asset).
 */
export function rimScatter(high: boolean): {
  readonly rocks: readonly RockTransform[];
  readonly spires: readonly RockTransform[];
  readonly moonRocks: readonly RockTransform[];
} {
  const rand = lehmer(9173);
  const rocks: RockTransform[] = [];
  const spires: RockTransform[] = [];
  const moonRocks: RockTransform[] = [];
  const rockCount = high ? 260 : 130;
  const spireCount = high ? 80 : 40;
  const moonRockCount = high ? 120 : 60;
  for (let i = 0; i < rockCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = RIM.innerRadius + 16 + rand() * 102;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const size = 9 + rand() * 20;
    const y = rimHeight(x, z) - 0.8;
    rocks.push({
      position: [x, y, z],
      rotation: [(rand() - 0.5) * 0.36, rand() * Math.PI * 2, (rand() - 0.5) * 0.36],
      scale: [size * (0.9 + rand() * 0.45), size * (0.68 + rand() * 0.52), size * (0.85 + rand() * 0.45)]
    });
  }
  for (let i = 0; i < spireCount; i++) {
    const a = rand() * Math.PI * 2;
    // Keep clear of the course corridor (the ring sits near radius 225 +- 60 m; r > 300 m).
    const r = 335 + rand() * 235;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 28 + rand() * 68;
    const w = 10 + rand() * 16;
    const y = rimHeight(x, z) - 0.8;
    spires.push({
      position: [x, y, z],
      rotation: [(rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18],
      scale: [w, h, w * (0.82 + rand() * 0.36)]
    });
  }
  for (let i = 0; i < moonRockCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = 355 + rand() * 265;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 7 + rand() * 15;
    const y = rimHeight(x, z) - 0.8;
    moonRocks.push({
      position: [x, y, z],
      rotation: [(rand() - 0.5) * 0.28, rand() * Math.PI * 2, (rand() - 0.5) * 0.28],
      scale: [s * (0.95 + rand() * 0.4), s * (0.62 + rand() * 0.45), s * (0.9 + rand() * 0.4)]
    });
  }
  return { rocks, spires, moonRocks };
}
