/**
 * Follow-camera clearance (presentation only; the sim and its input axes never read it).
 *
 * The follow camera sits about 21 m south of the traveller at a fixed offset. When the traveller walks round the back of
 * the cottage or the windmill, the building ends up between the traveller and the lens and hides them. This sweeps the
 * traveller's chest -> lens segment against the solid structure footprints (yaw-rotated boxes with a top) with the engine's
 * `computeCameraClearance` and returns the furthest boom fraction that keeps the lens on the traveller's side of every
 * blocker. The easing and the follow-target hand-off below stay game-local tuning.
 */
import { computeCameraClearance, type AuraCameraClearanceObstacle, type AuraCameraClearanceResult } from "@aura3d/engine";
import { STRUCTURES } from "./sim";
import type { Scenery } from "./scenery";
import { terrainHeight } from "./terrain";

/**
 * A structure footprint. The engine's box yaw is the scenery convention (`rotate(lx, lz, yaw)` in scenery.ts maps local
 * to world); only the top bounds it, so a lens that sweeps over the roof is never pulled in.
 */
export type CameraObstacleBox = AuraCameraClearanceObstacle;

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
  return { shape: "box", x, z, yaw, halfX: 3.6 * s + pad, halfZ: 2.7 * s + pad, maxY: terrainHeight(x, z) - 0.15 + height };
}

/** The solid structures of the valley: the two cottages and the windmill tower (sails excluded). */
export function structureObstacles(): CameraObstacleBox[] {
  const c = STRUCTURES.cottage, d = STRUCTURES.distantCottage, m = STRUCTURES.windmill;
  return [
    cottageBox(c.x, c.z, 1.12, 0, c.height),
    cottageBox(d.x, d.z, 0.95, 0.5, d.height),
    { shape: "box", x: m.x, z: m.z, yaw: 0, halfX: m.r * 0.82, halfZ: m.r * 0.82, maxY: terrainHeight(m.x, m.z) - 0.2 + m.height }
  ];
}

const SWEEP_OPTIONS = { padding: 0, backoff: LENS_MARGIN };
const NO_OBSTACLES: readonly CameraObstacleBox[] = [];
const POSE_OPTIONS = { padding: 0, minDistance: CAM_MIN_DISTANCE, allowVerticalRise: true, riseMinHorizontal: CRANE_MIN_GAP, maxFraction: 1 };
const scratch: AuraCameraClearanceResult = { position: [0, 0, 0], fraction: 1, distance: 0, mode: "clear", clamped: false, occluder: -1 };

/**
 * Boom fraction in `[CAM_MIN_CLEARANCE, 1]` along subject -> lens (feed it to `clearedFollowPose`). Obstacles the subject stands inside, or that the
 * segment passes over, are ignored.
 */
export function followCameraClearance(
  subject: readonly [number, number, number],
  lens: readonly [number, number, number],
  obstacles: readonly CameraObstacleBox[]
): number {
  const r = computeCameraClearance(subject, lens, obstacles, SWEEP_OPTIONS, scratch);
  return r.fraction >= 1 ? 1 : Math.max(CAM_MIN_CLEARANCE, r.fraction);
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
  // engine placement at the eased fraction: slide in while >= CAM_MIN_DISTANCE, otherwise crane up at that distance
  POSE_OPTIONS.maxFraction = f;
  const p = computeCameraClearance(chest, lens, NO_OBSTACLES, POSE_OPTIONS, scratch).position;
  return { position: [p[0], p[1], p[2]], target: tgt };
}

/** Crowns are drawn wider and taller than the scatter numbers (Idol/GLB crowns spread): the lens keeps this far out. */
const CANOPY_SPREAD = 1.3, CANOPY_PAD = 0.35, CANOPY_TOP_PAD = 0.9;
/**
 * Tree crowns as camera occluders (owner GPU QA 2026-11-18: at the shore letter the lens sat in an oak crown and a flat
 * dark-green blob hid the keeper). Trunks below the crown are thin and stay see-through for the sweep.
 */
export function canopyObstacles(canopies: Scenery["canopies"]): CameraObstacleBox[] {
  return canopies.map((c): CameraObstacleBox => ({ shape: "circle", x: c.x, z: c.z, radius: c.r * CANOPY_SPREAD + CANOPY_PAD, minY: c.minY, maxY: c.maxY + CANOPY_TOP_PAD }));
}

/** Lens height kept above the ground under it, and the sight line's clearance over the ground between. */
export const LENS_GROUND_MARGIN = 1.2;
export const SIGHT_GROUND_MARGIN = 0.4;
/**
 * Raises the lens so it stays `LENS_GROUND_MARGIN` above the ground under it and the chest -> lens sight line stays
 * `SIGHT_GROUND_MARGIN` above every bank, hill or cliff lip between (sampled), so no terrain fills the frame.
 */
export function liftLensOverGround(
  chest: readonly [number, number, number],
  lens: readonly [number, number, number],
  ground: (x: number, z: number) => number
): [number, number, number] {
  let y = Math.max(lens[1], ground(lens[0], lens[2]) + LENS_GROUND_MARGIN);
  for (let i = 2; i <= 10; i++) {
    const t = i / 10;
    const g = ground(chest[0] + (lens[0] - chest[0]) * t, chest[2] + (lens[2] - chest[2]) * t) + SIGHT_GROUND_MARGIN;
    // the line chest.y + t (y - chest.y) must clear g at t
    if (chest[1] + t * (y - chest[1]) < g) y = chest[1] + (g - chest[1]) / t;
  }
  return [lens[0], Math.min(y, lens[1] + 8), lens[2]];
}

/** Sail sweep: the rotating sail disc (span 22 m) about the hub, facing +z; half depth covers the leaning cross + padding. */
export const SAIL_RADIUS = 11.0;
export const SAIL_SWEEP_HALF_DEPTH = 1.6;
const SAIL_PAD = 1.2;
/** Horizontal bands the sail disc is boxed in (each band as wide as the disc at its widest y). */
const SAIL_BANDS = 8;
/**
 * The windmill's sail sweep as camera occluders (owner GPU QA 2026-11-18: a sail lattice filled half the frame): the
 * turning disc, boxed in `SAIL_BANDS` horizontal slabs that follow its round outline (a single square box blocked the
 * open air past the disc's rim). `frontKeepOut` extends the slabs towards the lens side (+z) so a camera that would sit
 * right in front of the turning sails pulls in past them instead (the voyage camera).
 */
export function sailObstacles(hub: { readonly x: number; readonly y: number; readonly z: number }, frontKeepOut = 0): CameraObstacleBox[] {
  const back = SAIL_SWEEP_HALF_DEPTH + SAIL_PAD, front = SAIL_SWEEP_HALF_DEPTH + SAIL_PAD + frontKeepOut;
  const R = SAIL_RADIUS + SAIL_PAD;
  const out: CameraObstacleBox[] = [];
  for (let i = 0; i < SAIL_BANDS; i++) {
    const y0 = -R + (2 * R * i) / SAIL_BANDS, y1 = y0 + (2 * R) / SAIL_BANDS;
    const nearest = y0 <= 0 && y1 >= 0 ? 0 : Math.min(Math.abs(y0), Math.abs(y1));
    out.push({ shape: "box", x: hub.x, z: hub.z + (front - back) / 2, yaw: 0, halfX: Math.sqrt(Math.max(0, R * R - nearest * nearest)), halfZ: (front + back) / 2, minY: hub.y + y0, maxY: hub.y + y1 });
  }
  return out;
}
/** True when `p` is inside the sail-sweep cylinder (axis along z through the hub, radius SAIL_RADIUS + `pad`). */
export function insideSailSweep(p: readonly [number, number, number], hub: { readonly x: number; readonly y: number; readonly z: number }, pad = 0.5): boolean {
  return Math.abs(p[2] - hub.z) <= SAIL_SWEEP_HALF_DEPTH + pad && Math.hypot(p[0] - hub.x, p[1] - hub.y) <= SAIL_RADIUS + pad;
}

/** Metres in front of the sail plane the voyage camera keeps clear (beyond this the sails no longer fill the frame). */
export const VOYAGE_SAIL_KEEP_OUT = 6.5;
/** Closest the voyage camera comes to its look target when it pulls in. */
const VOYAGE_MIN_DISTANCE = 6;
/**
 * The voyage (epilogue) lens: the authored offset from the look target, pulled in towards the target past the sails and
 * any tree crown, then lifted over the ground. `look` is the eased voyage look target.
 */
export function voyageLens(
  look: readonly [number, number, number],
  lens: readonly [number, number, number],
  obstacles: readonly CameraObstacleBox[],
  ground: (x: number, z: number) => number
): [number, number, number] {
  const len = Math.hypot(lens[0] - look[0], lens[1] - look[1], lens[2] - look[2]);
  const f = computeCameraClearance(look, lens, obstacles, { padding: 0, backoff: LENS_MARGIN, minDistance: Math.min(len, VOYAGE_MIN_DISTANCE), allowVerticalRise: true, riseMinHorizontal: 2 }, scratch);
  const p: [number, number, number] = [f.position[0], f.position[1], f.position[2]];
  return liftLensOverGround(look, p, ground);
}

/** Most the lens rises to see over a crown (more would look steeply down on her and shrink her in frame). */
export const CROWN_MAX_LIFT = 2.5;
/**
 * Tree crowns on the follow camera's sight line (owner GPU QA 2026-11-18): at the shore letter the lens sat in an oak
 * crown. For each crown the chest -> lens line passes through (sampled from 30% of the way out):
 * - a lift of up to `CROWN_MAX_LIFT` that clears its padded top swings the lens up over it (`lift`);
 * - otherwise the boom slides in past it (`frac`), but never closer than `CAM_MIN_DISTANCE` (no crane over her);
 * - a crown that needs neither (right beside her) is left alone: it only brushes the edge of the frame.
 */
export function crownClearance(
  chest: readonly [number, number, number],
  lens: readonly [number, number, number],
  crowns: readonly CameraObstacleBox[]
): { lift: number; frac: number } {
  let lift = 0, frac = 1;
  const len = Math.hypot(lens[0] - chest[0], lens[1] - chest[1], lens[2] - chest[2]);
  const one: CameraObstacleBox[] = [];
  for (const c of crowns) {
    if (c.shape !== "circle") continue;
    const top = (c.maxY ?? Infinity) + 0.2, bottom = c.minY ?? -Infinity;
    let need = 0, hit = false;
    for (let i = 3; i <= 10; i++) {
      const t = i / 10;
      const px = chest[0] + (lens[0] - chest[0]) * t, pz = chest[2] + (lens[2] - chest[2]) * t;
      if (Math.hypot(px - c.x, pz - c.z) > c.radius) continue;
      const py = chest[1] + (lens[1] - chest[1]) * t;
      if (py < bottom || py > top) continue;
      hit = true;
      need = Math.max(need, chest[1] + (top - chest[1]) / t - lens[1]);
    }
    if (!hit) continue;
    if (need <= CROWN_MAX_LIFT) { lift = Math.max(lift, need); continue; }
    one.length = 0; one.push(c);
    const f = followCameraClearance(chest, lens, one);
    if (f * len >= CAM_MIN_DISTANCE) frac = Math.min(frac, f);
  }
  return { lift, frac };
}

/** Raises the lens by `lift` while keeping its distance from the chest (it swings up over the crown instead of backing off). */
export function raiseLensKeepingDistance(chest: readonly [number, number, number], lens: readonly [number, number, number], lift: number): [number, number, number] {
  if (lift <= 1e-6) return [lens[0], lens[1], lens[2]];
  const d = Math.hypot(lens[0] - chest[0], lens[1] - chest[1], lens[2] - chest[2]);
  const v: [number, number, number] = [lens[0] - chest[0], lens[1] + lift - chest[1], lens[2] - chest[2]];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [chest[0] + (v[0] / l) * d, chest[1] + (v[1] / l) * d, chest[2] + (v[2] / l) * d];
}

/** While the lens is swung up over a crown, the look target eases onto the keeper's mid-body so she stays in frame. */
export function aimForLift(target: readonly [number, number, number], chest: readonly [number, number, number], lift: number): [number, number, number] {
  const k = Math.min(1, Math.max(0, lift) / 2.5) * 0.7;
  return [target[0] + (chest[0] - target[0]) * k, target[1] + (chest[1] - 0.45 - target[1]) * k, target[2] + (chest[2] - target[2]) * k];
}
