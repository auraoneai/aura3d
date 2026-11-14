/**
 * Follow-camera clearance (presentation only; the sim and its input axes never read it).
 *
 * The follow camera sits about 21 m south of the traveller at a fixed offset. When the traveller walks round the back of
 * the cottage or the windmill, the building ends up between the traveller and the lens and hides them. This sweeps the
 * traveller's chest -> lens segment against the solid structure footprints (oriented boxes with a height) and returns the
 * furthest boom fraction that keeps the lens on the traveller's side of every blocker, the same contract as
 * `computeCameraClearance` in `apps/showcase-pips-big-leap/src/game/framing.ts` (game-local copy: that one sweeps
 * vertical cylinders only, these structures are long boxes).
 */
import { STRUCTURES } from "./sim";
import { terrainHeight } from "./terrain";

export interface CameraObstacleBox {
  readonly x: number;
  readonly z: number;
  /** Yaw in the scenery convention (`rotate(lx, lz, yaw)` in scenery.ts maps local to world). */
  readonly yaw: number;
  readonly halfW: number;
  readonly halfD: number;
  readonly baseY: number;
  readonly height: number;
}

/** Lower bound on the returned fraction (0 would put the lens in the traveller's chest). */
export const CAM_MIN_CLEARANCE = 0.02;
/** Closest lens distance that still holds a full-body frame at the 40-50 degree lens. */
export const CAM_MIN_DISTANCE = 5.5;
/** Smallest horizontal lens offset kept when craning up, so the view never looks straight down (pitch <= ~80 degrees). */
const CRANE_MIN_GAP = 1.0;
/** Metres kept between the lens and the blocker's face. */
const LENS_MARGIN = 0.45;
/** Height of the traveller's chest above the ground (the sweep origin). */
export const CLEARANCE_CHEST = 1.4;

function cottageBox(x: number, z: number, s: number, yaw: number, height: number): CameraObstacleBox {
  // walls 7.2 x 5.4 (x s), padded for the plinth (0.17 s) and the roof overhang (0.55 s), as built in scenery.ts
  const pad = 0.72 * s;
  return { x, z, yaw, halfW: 3.6 * s + pad, halfD: 2.7 * s + pad, baseY: terrainHeight(x, z) - 0.15, height };
}

/** The solid structures of the valley: the two cottages and the windmill tower (sails excluded). */
export function structureObstacles(): CameraObstacleBox[] {
  const c = STRUCTURES.cottage, d = STRUCTURES.distantCottage, m = STRUCTURES.windmill;
  return [
    cottageBox(c.x, c.z, 1.12, 0, c.height),
    cottageBox(d.x, d.z, 0.95, 0.5, d.height),
    { x: m.x, z: m.z, yaw: 0, halfW: m.r * 0.82, halfD: m.r * 0.82, baseY: terrainHeight(m.x, m.z) - 0.2, height: m.height }
  ];
}

/**
 * Boom fraction in `[CAM_MIN_CLEARANCE, 1]` along subject -> lens (feed it to `clearedFollowPose`). Obstacles the subject stands inside, or that the
 * segment passes over, are ignored.
 */
export function computeCameraClearance(
  subject: readonly [number, number, number],
  lens: readonly [number, number, number],
  obstacles: readonly CameraObstacleBox[]
): number {
  const [sx, sy, sz] = subject;
  const dx = lens[0] - sx, dy = lens[1] - sy, dz = lens[2] - sz;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return 1;
  let best = 1;
  for (const o of obstacles) {
    const top = o.baseY + o.height;
    if (sy > top && lens[1] > top) continue;
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    // world -> box-local (inverse of scenery.ts `rotate`)
    const ox = sx - o.x, oz = sz - o.z;
    const lx0 = ox * c - oz * s, lz0 = ox * s + oz * c;
    const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
    if (Math.abs(lx0) < o.halfW && Math.abs(lz0) < o.halfD) continue;
    let t0 = 0, t1 = 1;
    const slab = (p: number, d: number, h: number): boolean => {
      if (Math.abs(d) < 1e-9) return Math.abs(p) < h;
      let a = (-h - p) / d, b = (h - p) / d;
      if (a > b) { const tmp = a; a = b; b = tmp; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!slab(lx0, ldx, o.halfW) || !slab(lz0, ldz, o.halfD)) continue;
    if (sy + dy * t0 > top) continue;
    best = Math.min(best, Math.max(CAM_MIN_CLEARANCE, t0 - LENS_MARGIN / len));
  }
  return best;
}

/** Pull in at once (no frame shows the wall), let the boom back out over about a second. */
export function easeBoom(current: number, target: number, dt: number): number {
  if (target <= current) return target;
  return current + (target - current) * (1 - Math.exp(-2.2 * Math.max(0, dt)));
}

/**
 * The follow pose with the boom shortened to `frac`. While the shortened lens is still `CAM_MIN_DISTANCE` away it slides
 * straight in along the same view line. Closer than that (the traveller hugging a back wall) the lens cranes up over the
 * gap instead, keeping the distance, and the look target moves onto the traveller so they stay centred in frame.
 */
export function clearedFollowPose(
  chest: readonly [number, number, number],
  lens: readonly [number, number, number],
  target: readonly [number, number, number],
  frac: number
): { position: [number, number, number]; target: [number, number, number] } {
  const dx = lens[0] - chest[0], dy = lens[1] - chest[1], dz = lens[2] - chest[2];
  const len = Math.hypot(dx, dy, dz);
  const f = Math.max(0, Math.min(1, frac));
  if (f >= 0.999 || len < 1e-4) return { position: [lens[0], lens[1], lens[2]], target: [target[0], target[1], target[2]] };
  // the target eases from the follow look point onto the traveller's mid-body as the boom closes
  const k = Math.min(1, (1 - f) / Math.max(1e-3, 1 - CAM_MIN_DISTANCE / len));
  const body: [number, number, number] = [chest[0], chest[1] - 0.45, chest[2]];
  const tgt: [number, number, number] = [target[0] + (body[0] - target[0]) * k, target[1] + (body[1] - target[1]) * k, target[2] + (body[2] - target[2]) * k];
  if (f * len >= CAM_MIN_DISTANCE) return { position: [chest[0] + dx * f, chest[1] + dy * f, chest[2] + dz * f], target: tgt };
  const h = Math.hypot(dx, dz);
  const gap = Math.max(CRANE_MIN_GAP, f * h);
  const rise = Math.sqrt(Math.max(0, CAM_MIN_DISTANCE * CAM_MIN_DISTANCE - gap * gap));
  const ux = h > 1e-4 ? dx / h : 0, uz = h > 1e-4 ? dz / h : 1;
  return { position: [chest[0] + ux * gap, chest[1] + rise, chest[2] + uz * gap], target: tgt };
}
