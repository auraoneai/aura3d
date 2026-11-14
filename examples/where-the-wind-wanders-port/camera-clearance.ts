/**
 * Follow-camera clearance (presentation only; the sim and its input axes never read it).
 *
 * The follow camera sits about 21 m south of the traveller at a fixed offset. When the traveller walks round the back of
 * the cottage or the windmill, the building ends up between the traveller and the lens and hides them. This sweeps the
 * traveller's chest -> lens segment against the solid structure footprints (yaw-rotated boxes with a top) with the engine's
 * `computeCameraClearance` and returns the furthest boom fraction that keeps the lens on the traveller's side of every
 * blocker. The easing and the follow-target hand-off below stay game-local tuning.
 */
import { computeCameraClearance, type AuraCameraClearanceBox, type AuraCameraClearanceResult } from "@aura3d/engine";
import { STRUCTURES } from "./sim";
import { terrainHeight } from "./terrain";

/**
 * A structure footprint. The engine's box yaw is the scenery convention (`rotate(lx, lz, yaw)` in scenery.ts maps local
 * to world); only the top bounds it, so a lens that sweeps over the roof is never pulled in.
 */
export type CameraObstacleBox = AuraCameraClearanceBox;

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
