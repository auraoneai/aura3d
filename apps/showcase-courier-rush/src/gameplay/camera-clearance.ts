/**
 * Chase-camera clearance (flash fix). The flicker probe caught two kinds of
 * black frames on the chase lens:
 *  - a 2-frame blackout when the eye (≈3.2 m up) passed straight through the
 *    pressure-gate crossbar (y 3.11-3.33) over the main road at z = 10.6;
 *  - a slow fade to black when the van drove into a kit tower block (only lamp
 *    poles collide) and the trailing eye followed it inside the box.
 * The fix keeps the eye out of every solid box the route places: when the
 * sight line from the van back to the eye enters a tower footprint the camera
 * pulls in (never closer than CHASE_MIN_DISTANCE) and rises; near an overhead
 * span it lifts above the span; if the van itself is inside a block the eye
 * goes above that roof. Gameplay and the van are untouched.
 */
import { CITY_SCALE, SKYLINE_TOWER_FOOTPRINTS } from "../legacy/city";

/** Closest the eye may get to the van (metres, horizontal). */
export const CHASE_MIN_DISTANCE = 2.6;
/** Padding kept between the eye and a tower face. */
const TOWER_PADDING = 0.8;
/** Height of the follow target above the road (camera target node y). */
const TARGET_Y = 0.2;
const SAMPLES = 16;

interface SolidBox {
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
  readonly bottom: number; readonly top: number;
}

function kitTowerBoxes(): SolidBox[] {
  // Mirrors prefabs/cityBlock.ts slots (blocks: 20) scaled by CITY_SCALE.
  const xSlots = [-4.25, -2.58, -0.95, 1.45, 3.3];
  const zSlots = [-4, -1.45, 1.3, 3.65];
  const boxes: SolidBox[] = [];
  for (let index = 0; index < 20; index += 1) {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const height = 1.15 + ((index * 7) % 6) * 0.45 + (col === 0 || col === 4 ? 0.25 : 0);
    const x = xSlots[col]! * CITY_SCALE;
    const z = zSlots[row]! * CITY_SCALE;
    const half = (1.08 * CITY_SCALE) / 2;
    boxes.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half, bottom: 0, top: height * CITY_SCALE });
  }
  return boxes;
}

/** Every solid volume the chase eye must stay out of (world space). */
export const CAMERA_SOLIDS: readonly SolidBox[] = [
  ...kitTowerBoxes(),
  ...SKYLINE_TOWER_FOOTPRINTS.map((t) => ({
    minX: t.x - t.width / 2, maxX: t.x + t.width / 2,
    minZ: t.z - t.depth / 2, maxZ: t.z + t.depth / 2,
    bottom: 0, top: 9
  })),
  // Pressure-gate crossbar over the main road (city.ts pressureMomentNodes,
  // origin x 0, z 10.6): 4.6 x 0.22 x 0.22 at y 3.22.
  { minX: -2.3, maxX: 2.3, minZ: 10.49, maxZ: 10.71, bottom: 3.11, top: 3.33 }
];

const inside = (box: SolidBox, x: number, z: number, pad: number): boolean =>
  x >= box.minX - pad && x <= box.maxX + pad && z >= box.minZ - pad && z <= box.maxZ + pad;

/** True when an eye at (x, eyeY, z) is outside every padded solid. */
export function cameraPointClear(x: number, z: number, eyeY = TARGET_Y + 3): boolean {
  for (const box of CAMERA_SOLIDS) {
    const vPad = box.top - box.bottom < 1 ? 0.7 : 0;
    if (eyeY < box.bottom - vPad || eyeY > box.top + vPad) continue;
    if (inside(box, x, z, box.top - box.bottom < 1 ? 1.4 : TOWER_PADDING)) return false;
  }
  return true;
}

export interface ChaseClearance {
  /** Trailing distance actually used (<= desired). */
  readonly distance: number;
  /** Minimum offset height above the target node for the eye. */
  readonly minOffsetY: number;
}

/** Resolve the final eye, including the lift applied by both camera callers. */
function clearFinalEye(
  vanX: number, vanZ: number, dirX: number, dirZ: number,
  desired: number, offsetY: number, clearance: ChaseClearance
): ChaseClearance {
  const length = Math.hypot(dirX, dirZ) || 1;
  const eyeX = vanX + dirX / length * clearance.distance;
  const eyeZ = vanZ + dirZ / length * clearance.distance;
  let minOffsetY = clearance.minOffsetY;
  let eyeY = TARGET_Y + Math.max(offsetY + clearanceLift(desired, clearance.distance), minOffsetY);
  // Pulling in cannot stop before a blocker closer than CHASE_MIN_DISTANCE.
  // Lift above it instead. Repeat because a lift can enter another solid that
  // was above the eye earlier in this pass (for example an overhead span).
  for (let pass = 0; pass < CAMERA_SOLIDS.length; pass += 1) {
    let lifted = false;
    for (const box of CAMERA_SOLIDS) {
      const thin = box.top - box.bottom < 1;
      const vPad = thin ? 0.7 : 0;
      if (!inside(box, eyeX, eyeZ, thin ? 1.4 : TOWER_PADDING)
        || eyeY < box.bottom - vPad || eyeY > box.top + vPad) continue;
      eyeY = box.top + vPad + 0.05;
      minOffsetY = Math.max(minOffsetY, eyeY - TARGET_Y);
      lifted = true;
    }
    if (!lifted) break;
  }
  return { distance: clearance.distance, minOffsetY };
}

/**
 * Clearance for a chase eye trailing `desired` metres from the van along the
 * unit direction (dirX, dirZ), at offset height `offsetY` above the target.
 */
export function chaseClearance(
  vanX: number, vanZ: number, dirX: number, dirZ: number, desired: number, offsetY: number
): ChaseClearance {
  const length = Math.hypot(dirX, dirZ) || 1;
  const ux = dirX / length;
  const uz = dirZ / length;
  let minOffsetY = 0;
  // Van inside a block (it can drive through kit towers): look down from
  // above that roof instead of from inside the box.
  for (const box of CAMERA_SOLIDS) {
    if (box.top - box.bottom >= 1 && inside(box, vanX, vanZ, 0.2)) {
      minOffsetY = Math.max(minOffsetY, box.top + 1.6 - TARGET_Y);
    }
  }
  if (minOffsetY > 0) {
    return clearFinalEye(vanX, vanZ, dirX, dirZ, desired, offsetY, { distance: CHASE_MIN_DISTANCE, minOffsetY });
  }
  let distance = desired;
  for (let i = 1; i <= SAMPLES; i += 1) {
    const d = (desired * i) / SAMPLES;
    if (d < CHASE_MIN_DISTANCE) continue;
    const y = TARGET_Y + offsetY * (d / desired);
    if (!cameraPointClear(vanX + ux * d, vanZ + uz * d, y)) {
      distance = Math.max(CHASE_MIN_DISTANCE, (desired * (i - 1)) / SAMPLES);
      break;
    }
  }
  // Overhead spans: lift the eye over a span it would otherwise cross.
  const eyeX = vanX + ux * distance;
  const eyeZ = vanZ + uz * distance;
  for (const box of CAMERA_SOLIDS) {
    if (box.top - box.bottom >= 1) continue;
    if (inside(box, eyeX, eyeZ, 2.2) || inside(box, vanX, vanZ, 1.2)) {
      minOffsetY = Math.max(minOffsetY, box.top + 0.75 - TARGET_Y);
    }
  }
  return clearFinalEye(vanX, vanZ, dirX, dirZ, desired, offsetY, { distance, minOffsetY });
}

/**
 * Stateful filter: pulls in / rises immediately when blocked (a late reaction
 * is the black frame), eases back out slowly so the lens does not pump.
 */
export function createChaseClearance(): {
  update(vanX: number, vanZ: number, dirX: number, dirZ: number, desired: number, offsetY: number, dt: number): ChaseClearance;
  reset(): void;
} {
  let distance: number | null = null;
  let minY = 0;
  return {
    update(vanX, vanZ, dirX, dirZ, desired, offsetY, dt) {
      const target = chaseClearance(vanX, vanZ, dirX, dirZ, desired, offsetY);
      const step = Math.max(0, dt);
      if (distance === null || target.distance < distance) distance = target.distance;
      else distance = Math.min(target.distance, distance + step * 2.4);
      if (target.minOffsetY > minY) minY = target.minOffsetY;
      else minY = Math.max(target.minOffsetY, minY - step * 3);
      // The eased distance differs from the stateless target; validate that
      // actual eye too, especially while turning next to a tower.
      const clear = clearFinalEye(vanX, vanZ, dirX, dirZ, desired, offsetY, { distance, minOffsetY: minY });
      minY = clear.minOffsetY;
      return clear;
    },
    reset() {
      distance = null;
      minY = 0;
    }
  };
}

/** Extra eye height for a pulled-in eye: the closer the camera, the higher. */
export function clearanceLift(desired: number, actual: number): number {
  return Math.max(0, desired - actual) * 0.55;
}
