// Pip's Big Leap — follow-camera framing per viewport aspect (pure).
//
// The desktop framing (52 deg vertical FOV, 4.5 m boom) is kept at aspect
// >= 1. Narrower viewports widen the vertical FOV and lengthen the boom so a
// 390x844 phone still sees the platform ahead: at aspect 0.46 the FOV is
// 68 deg (about 34 deg horizontal instead of 25) and the boom 5.6 m.

import { computeCameraClearance, type AuraCameraClearanceObstacle, type AuraCameraClearanceResult } from "@aura3d/engine";

export interface Framing {
  readonly fov: number;
  readonly boom: number;
}

const DESKTOP: Framing = { fov: 52, boom: 4.5 };
const PORTRAIT: Framing = { fov: 68, boom: 5.6 };
const PORTRAIT_ASPECT = 0.46;

export function framingFor(aspect: number): Framing {
  if (!(aspect > 0) || aspect >= 1) return DESKTOP;
  const k = Math.min(1, (1 - aspect) / (1 - PORTRAIT_ASPECT));
  return {
    fov: DESKTOP.fov + (PORTRAIT.fov - DESKTOP.fov) * k,
    boom: DESKTOP.boom + (PORTRAIT.boom - DESKTOP.boom) * k
  };
}

/** Horizontal FOV in degrees for a vertical FOV and aspect. */
export function horizontalFov(fovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;
}

export interface CameraObstacleCylinder {
  readonly x: number;
  readonly z: number;
  readonly baseY: number;
  readonly radius: number;
  readonly height: number;
}

/**
 * Shortest allowed boom fraction (`4.5 m * 0.65 ≈ 2.93 m` on desktop) so
 * nearby trunks, rocks, or side jambs never push the lens into Pip's acorn cap.
 */
export const CAM_MIN_CLEARANCE = 0.65;

/** Lens radius added to every trunk/jamb cylinder. */
const LENS_RADIUS_MARGIN = 0.16;
/** Boom fraction kept back from the blocker's face. */
const BOOM_BACKOFF_FRACTION = 0.04;
/** Pip's upper torso above his feet: the sweep origin. */
const SWEEP_ORIGIN_LIFT = 1.05;
const FOLLOW_LOOK_AHEAD = 3.2;

// Trunks only bound their top (the boom passes over short props); bottoms stay unbounded as before.
const engineObstacles = new WeakMap<readonly CameraObstacleCylinder[], AuraCameraClearanceObstacle[]>();
function toEngineObstacles(obstacles: readonly CameraObstacleCylinder[]): AuraCameraClearanceObstacle[] {
  let converted = engineObstacles.get(obstacles);
  if (!converted) {
    converted = obstacles.map((o) => ({ shape: "circle" as const, x: o.x, z: o.z, radius: o.radius, maxY: o.baseY + o.height }));
    engineObstacles.set(obstacles, converted);
  }
  return converted;
}

const sweepOrigin: [number, number, number] = [0, 0, 0];
const sweepLens: [number, number, number] = [0, 0, 0];
const sweepOptions = { padding: LENS_RADIUS_MARGIN, backoff: 0, minDistance: 0 };
const sweepResult: AuraCameraClearanceResult = { position: [0, 0, 0], fraction: 1, distance: 0, mode: "clear", clamped: false, occluder: -1 };

/**
 * Sweep Pip's upper torso -> desired lens against solid trunk/jamb cylinders
 * (engine `computeCameraClearance`) and return the furthest boom fraction
 * `[CAM_MIN_CLEARANCE, 1]` that stays in front of genuine blockers behind Pip.
 * Props Pip already stands inside (padded) are ignored by the engine.
 */
export function followCameraClearance(
  player: { readonly x: number; readonly y: number; readonly z: number },
  obstacles: readonly CameraObstacleCylinder[],
  camX: number,
  camZ: number,
  camY: number
): number {
  sweepOrigin[0] = player.x;
  sweepOrigin[1] = player.y + SWEEP_ORIGIN_LIFT;
  sweepOrigin[2] = player.z;
  sweepLens[0] = camX;
  sweepLens[1] = camY;
  sweepLens[2] = camZ;
  const len = Math.hypot(camX - sweepOrigin[0], camY - sweepOrigin[1], camZ - sweepOrigin[2]);
  sweepOptions.backoff = BOOM_BACKOFF_FRACTION * len;
  sweepOptions.minDistance = CAM_MIN_CLEARANCE * len;
  const r = computeCameraClearance(sweepOrigin, sweepLens, toEngineObstacles(obstacles), sweepOptions, sweepResult);
  return r.fraction >= 1 ? 1 : Math.max(CAM_MIN_CLEARANCE, r.fraction);
}

export interface FollowCameraPoseInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly camYaw: number;
  readonly baseBoom: number;
  readonly baseLift: number;
  readonly targetLift: number;
  readonly fov: number;
  readonly clearance: number;
  readonly shakeOffset?: readonly [number, number, number];
  readonly fovDeltaDeg?: number;
}

export interface FollowCameraPose {
  readonly position: [number, number, number];
  readonly target: [number, number, number];
  readonly up: [number, number, number];
  readonly fov: number;
}

/**
 * Computes the third-person follow pose behind Pip. When `clearance < 1`,
 * `boom`, `(baseLift - targetLift)`, and `lookAhead` scale proportionally
 * together so the camera pitch and Pip's vertical anchor in the viewport
 * remain invariant — keeping Pip's full body, feet, and platform surface in view.
 */
export function computeFollowCameraPose(input: FollowCameraPoseInput): FollowCameraPose {
  const c = Math.max(CAM_MIN_CLEARANCE, Math.min(1, input.clearance));
  const camFwdX = Math.sin(input.camYaw);
  const camFwdZ = Math.cos(input.camYaw);
  const boom = input.baseBoom * c;
  const lift = input.targetLift + (input.baseLift - input.targetLift) * c;
  const lookAhead = FOLLOW_LOOK_AHEAD * c;
  const [sx, sy, sz] = input.shakeOffset ?? [0, 0, 0];
  return {
    position: [input.x - camFwdX * boom + sx, input.y + lift + sy, input.z - camFwdZ * boom + sz],
    target: [input.x + camFwdX * lookAhead, input.y + input.targetLift, input.z + camFwdZ * lookAhead],
    up: [0, 1, 0],
    fov: Math.max(30, Math.min(82, input.fov + (input.fovDeltaDeg ?? 0)))
  };
}
