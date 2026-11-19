/**
 * Duneglide soft play boundary (owner QA 2026-11-19: flying ~120 m off a chapter route showed bare flat sand and the
 * floating backdrop ribbons of the horizon rings and canal/road tails).
 *
 * Every chapter's dressed space is a band around its route: the spawn, then every objective point in order. Inside
 * `BOUNDARY_SOFT` metres of that polyline nothing changes (the original's flight model, so the reference replays,
 * autopilot and autoplay are untouched). Between `BOUNDARY_SOFT` and `BOUNDARY_HARD` a crosswind eases in: it adds a
 * steer toward the route (the skiff banks and turns back on its own, the player can still hold against it) and bleeds
 * off the outward part of the motion, so the rider slides along the edge instead of hitting a wall. Past `BOUNDARY_HARD`
 * no outward motion is left. Distances past either end of the route count from the end point, so the empty desert
 * behind the spawn and beyond the finish is fenced the same way.
 */
import { CHAPTERS } from "./chapters-data";

/** Where the crosswind starts (metres from the route). */
export const BOUNDARY_SOFT = 64;
/** Where no outward motion is left (metres from the route). */
export const BOUNDARY_HARD = 100;
/** Strongest added steer (the steer axis is -1..1; the sum is clamped). */
const ASSIST = 1.7;

export interface RouteLeash {
  /** Distance from the route and the unit vector pointing from the nearest route point to (x, z). */
  (x: number, z: number): { d: number; ux: number; uz: number };
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The route polyline of a chapter: the spawn 60 m behind the first point (as terrain.ts carves it), then every point. */
export function routePolyline(chapter: number): [number, number][] {
  const ch = CHAPTERS[chapter]!;
  const path: [number, number][] = [];
  for (const o of ch.objectives) for (const p of o.points) path.push([p.x, p.z]);
  path.unshift([path[0]![0], path[0]![1] + 60]);
  return path;
}

const leashCache = new Map<number, RouteLeash>();

export function routeLeash(chapter: number): RouteLeash {
  const cached = leashCache.get(chapter);
  if (cached) return cached;
  const path = routePolyline(chapter);
  const leash: RouteLeash = (x, z) => {
    let best = Infinity, px = x, pz = z;
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, az] = path[i]!, [bx, bz] = path[i + 1]!;
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      const cx = ax + dx * t, cz = az + dz * t;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best) { best = d; px = cx; pz = cz; }
    }
    return best > 1e-6 ? { d: best, ux: (x - px) / best, uz: (z - pz) / best } : { d: 0, ux: 0, uz: 0 };
  };
  leashCache.set(chapter, leash);
  return leash;
}

/** How strongly the boundary acts at distance `d` (0 inside the soft radius, 1 at the hard radius). */
export const boundaryWeight = (d: number): number => smoothstep(BOUNDARY_SOFT, BOUNDARY_HARD, d);

/**
 * The crosswind's added steer for a rider at (x, z) facing `yaw` (forward is (-sin yaw, -cos yaw)); positive steer
 * lowers yaw (turns right). Zero inside the soft radius and when the rider already heads back toward the route.
 */
export function boundarySteer(leash: RouteLeash, x: number, z: number, yaw: number, speed: number): number {
  const { d, ux, uz } = leash(x, z);
  const w = boundaryWeight(d);
  if (w <= 0) return 0;
  const sign = speed < -0.5 ? -1 : 1;
  const fx = -Math.sin(yaw) * sign, fz = -Math.cos(yaw) * sign;
  const outward = fx * ux + fz * uz;
  if (outward < -0.35) return 0;
  // turn the heading toward -u (back to the route): a positive cross product of heading x target means steer right
  const gx = -ux, gz = -uz;
  const cross = fx * gz - fz * gx;
  const side = Math.abs(cross) < 0.05 ? 1 : Math.sign(cross);
  const amount = Math.min(1, 0.35 + Math.abs(cross) + Math.max(0, outward) * 0.6);
  return side * amount * w * ASSIST * sign;
}

/**
 * Bleeds the outward part of a move from (px, pz) to (x, z) by the boundary weight at the destination, and never lets
 * the rider end further out than the hard radius (or than it already was). Returns the corrected position.
 */
export function boundaryMove(leash: RouteLeash, px: number, pz: number, x: number, z: number): [number, number] {
  const at = leash(x, z);
  const w = boundaryWeight(at.d);
  if (w <= 0) return [x, z];
  let mx = x - px, mz = z - pz;
  const out = mx * at.ux + mz * at.uz;
  if (out > 0) {
    mx -= at.ux * out * w;
    mz -= at.uz * out * w;
  }
  let nx = px + mx, nz = pz + mz;
  const after = leash(nx, nz);
  // a rider placed past the hard radius (a QA teleport) is never snapped in: it just cannot get any further out
  const limit = Math.max(BOUNDARY_HARD, leash(px, pz).d);
  if (after.d > limit) {
    nx -= after.ux * (after.d - limit);
    nz -= after.uz * (after.d - limit);
  }
  return [nx, nz];
}
