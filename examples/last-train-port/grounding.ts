/**
 * Ground under the Idol set pieces (grounding sweep). Each town stands on a flat island top (`s0.y - 0.3`, radius 75 m) paved
 * with a cobble disc (+0.04 m, radius 62 m), and the station platform box (top `s0.y + 0.75`, lateral 2.4-6.8 m, along
 * +/-15 m). Idol GLBs are grounded at their lowest vertex and their bases are often slightly uneven, so every Idol model is
 * set on the LOWEST ground under its footprint corners and sunk `IDOL_SINK` below it: nothing floats, nothing sinks visibly.
 */
import { sampleRoute, type SimData } from "./sim";

export const IDOL_SINK = 0.14;

interface TownGround { readonly x: number; readonly z: number; readonly top: number; readonly platform: number; readonly f: readonly [number, number]; readonly s: readonly [number, number] }

const cache = new WeakMap<SimData, TownGround[]>();
function towns(data: SimData): TownGround[] {
  let t = cache.get(data);
  if (!t) {
    t = data.tables.towns.map((_, i) => {
      const s0 = sampleRoute(data.route, i, 0), s1 = sampleRoute(data.route, i, 6);
      let fx = s1.x - s0.x, fz = s1.z - s0.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      return { x: s0.x, z: s0.z, top: s0.y - 0.3, platform: s0.y + 0.75, f: [fx, fz] as const, s: [fz, -fx] as const };
    });
    cache.set(data, t);
  }
  return t;
}

/** Walkable surface height at (x, z): platform top, cobbles, bare island top, or -Infinity off every island. */
export function groundAt(data: SimData, x: number, z: number): number {
  let best = -Infinity;
  for (const t of towns(data)) {
    const dx = x - t.x, dz = z - t.z, r = Math.hypot(dx, dz);
    if (r > 75) continue;
    const lateral = dx * t.s[0] + dz * t.s[1], along = dx * t.f[0] + dz * t.f[1];
    const h = lateral >= 2.4 && lateral <= 6.8 && Math.abs(along) <= 15 ? t.platform : r <= 62 ? t.top + 0.04 : t.top;
    best = Math.max(best, h);
  }
  return best;
}

/** Footprint corners (and centre) of a box `halfX` x `halfZ` at (x, z) turned by `yaw` (local +Z = (sin yaw, cos yaw)). */
export function footprint(x: number, z: number, halfX: number, halfZ: number, yaw: number): [number, number][] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const pts: [number, number][] = [[x, z]];
  for (const [lx, lz] of [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]] as const) pts.push([x + lx * c + lz * s, z - lx * s + lz * c]);
  return pts;
}

/** Base height for an Idol model: the lowest ground under its footprint, sunk `IDOL_SINK`. */
export function groundedBase(data: SimData, x: number, z: number, halfX: number, halfZ: number, yaw: number): number {
  const g = Math.min(...footprint(x, z, halfX, halfZ, yaw).map(([px, pz]) => groundAt(data, px, pz)).filter(Number.isFinite));
  return g - IDOL_SINK;
}
