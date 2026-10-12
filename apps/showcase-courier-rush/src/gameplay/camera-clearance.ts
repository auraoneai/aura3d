/**
 * Chase-camera clearance (flash fix): the trailing eye used to swing through
 * tower blocks at corners, so the near plane sat inside a facade and the frame
 * went near-black for a couple of frames. The street graph is the free space:
 * the eye may only sit over a street (plus its sidewalk) and never inside a
 * skyline tower footprint. When the full trailing distance is blocked the
 * camera pulls in toward the van (never closer than MIN_DISTANCE) and rises,
 * so the van stays framed from above instead of from inside a wall.
 */
import { SKYLINE_TOWER_FOOTPRINTS, pointOnStreet } from "../legacy/city";

/** Closest the eye may get to the van (metres, horizontal). */
export const CHASE_MIN_DISTANCE = 2.6;
/** Sidewalk margin beyond the drivable half-width that still counts as open. */
const STREET_OPEN_MARGIN = 1.9;
/** Padding kept between the eye and a tower face. */
const TOWER_PADDING = 0.7;
const SAMPLES = 14;

/** True when a camera eye at (x, z) is in open street space. */
export function cameraPointClear(x: number, z: number): boolean {
  if (!pointOnStreet(x, z, STREET_OPEN_MARGIN)) return false;
  for (const tower of SKYLINE_TOWER_FOOTPRINTS) {
    if (
      Math.abs(x - tower.x) <= tower.width / 2 + TOWER_PADDING &&
      Math.abs(z - tower.z) <= tower.depth / 2 + TOWER_PADDING
    ) return false;
  }
  return true;
}

/**
 * Largest trailing distance <= `desired` whose whole sight line from the van
 * back to the eye stays in open space. `dirX/dirZ` is the unit direction from
 * the van toward the eye (usually -forward).
 */
export function clearTrailingDistance(
  vanX: number,
  vanZ: number,
  dirX: number,
  dirZ: number,
  desired: number
): number {
  const length = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / length;
  const uz = dirZ / length;
  let clear = desired;
  for (let i = 1; i <= SAMPLES; i += 1) {
    const d = (desired * i) / SAMPLES;
    if (d < CHASE_MIN_DISTANCE) continue;
    if (!cameraPointClear(vanX + ux * d, vanZ + uz * d)) {
      clear = Math.max(CHASE_MIN_DISTANCE, (desired * (i - 1)) / SAMPLES);
      break;
    }
  }
  return clear;
}

/**
 * Stateful filter: pulls in immediately when blocked (a late pull-in is the
 * black frame), eases back out slowly so the lens does not pump.
 */
export function createChaseClearance(): {
  update(vanX: number, vanZ: number, dirX: number, dirZ: number, desired: number, dt: number): number;
  reset(): void;
} {
  let current: number | null = null;
  return {
    update(vanX, vanZ, dirX, dirZ, desired, dt) {
      const target = clearTrailingDistance(vanX, vanZ, dirX, dirZ, desired);
      if (current === null || target < current) current = target;
      else current = Math.min(target, current + Math.max(0, dt) * 2.4);
      return current;
    },
    reset() {
      current = null;
    }
  };
}

/** Extra eye height for a pulled-in eye: the closer the camera, the higher. */
export function clearanceLift(desired: number, actual: number): number {
  return Math.max(0, desired - actual) * 0.55;
}
