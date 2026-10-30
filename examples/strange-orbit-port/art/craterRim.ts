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
 * Rocks on the rim's inner foot and spires rising out of the mist between the course and the wall.
 * High: 260 rocks + 80 spires; Low: 130 + 40 (still one draw each).
 */
export function rimScatter(high: boolean): { readonly rocks: readonly RockTransform[]; readonly spires: readonly RockTransform[] } {
  const rand = lehmer(9173);
  const rocks: RockTransform[] = [];
  const spires: RockTransform[] = [];
  const rockCount = high ? 260 : 130;
  const spireCount = high ? 80 : 40;
  for (let i = 0; i < rockCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = RIM.innerRadius - 30 + rand() * 110;
    const size = 6 + rand() * 18;
    const y = RIM.baseY + (r - RIM.innerRadius + 30) * 0.9 + rand() * 25;
    rocks.push({ position: [Math.cos(a) * r, y, Math.sin(a) * r], rotation: [rand() * 6.28, rand() * 6.28, rand() * 6.28], scale: [size, size * (0.6 + rand() * 0.5), size * (0.8 + rand() * 0.4)] });
  }
  for (let i = 0; i < spireCount; i++) {
    const a = rand() * Math.PI * 2;
    // Keep out of the course corridor (the ring sits near radius 225 +- 60 m).
    const r = 330 + rand() * 240;
    const h = 30 + rand() * 90;
    const w = 5 + rand() * 9;
    spires.push({ position: [Math.cos(a) * r, -70 + h * 0.5, Math.sin(a) * r], rotation: [(rand() - 0.5) * 0.25, rand() * 6.28, (rand() - 0.5) * 0.25], scale: [w, h, w] });
  }
  return { rocks, spires };
}
