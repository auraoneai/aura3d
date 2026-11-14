// Pip's Big Leap — follow-camera framing per viewport aspect (pure).
//
// The desktop framing (52 deg vertical FOV, 4.5 m boom) is kept at aspect
// >= 1. Narrower viewports widen the vertical FOV and lengthen the boom so a
// 390x844 phone still sees the platform ahead: at aspect 0.46 the FOV is
// 68 deg (about 34 deg horizontal instead of 25) and the boom 5.6 m.

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

const LENS_RADIUS_MARGIN = 0.16;
const FOLLOW_LOOK_AHEAD = 3.2;

/**
 * Sweep Pip's upper torso -> desired lens against solid trunk/jamb cylinders
 * and return the furthest boom fraction `[CAM_MIN_CLEARANCE, 1]` that stays in
 * front of genuine blockers behind Pip.
 *
 * Obstacles in front of or beside Pip (`along <= 0`), or whose padded radius
 * Pip is already standing inside (`c <= 0`, where shortening the boom would
 * only crush the camera into Pip's back without clearing the prop), are ignored.
 */
export function computeCameraClearance(
  player: { readonly x: number; readonly y: number; readonly z: number },
  obstacles: readonly CameraObstacleCylinder[],
  camX: number,
  camZ: number,
  camY: number
): number {
  const sx = player.x;
  const sz = player.z;
  const sy = player.y + 1.05;
  const dx = camX - sx;
  const dz = camZ - sz;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 1;
  let best = 1;
  for (const o of obstacles) {
    const top = o.baseY + o.height;
    if (sy > top && camY > top) continue;
    const ox = sx - o.x;
    const oz = sz - o.z;
    // `ox * dx + oz * dz >= 0` means moving from Pip toward the camera moves
    // AWAY from the obstacle (obstacle is in front of or beside Pip, never blocking the lens).
    const b = 2 * (ox * dx + oz * dz);
    if (b >= 0) continue;
    const r = o.radius + LENS_RADIUS_MARGIN;
    const c = ox * ox + oz * oz - r * r;
    // When Pip himself stands within `r` of a nearby prop/NPC (`c <= 0`), pulling
    // the camera inward cannot place the lens on Pip's side of the boundary.
    if (c <= 0) continue;
    const disc = b * b - 4 * len2 * c;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc);
    const t0 = (-b - root) / (2 * len2);
    const t1 = (-b + root) / (2 * len2);
    if (t0 >= 1 || t1 <= 0) continue;
    const lo = Math.max(0, t0);
    const hi = Math.min(1, t1);
    if (lo > hi) continue;
    const yLo = sy + (camY - sy) * lo;
    const yHi = sy + (camY - sy) * hi;
    if (Math.min(yLo, yHi) > top) continue;
    best = Math.min(best, Math.max(CAM_MIN_CLEARANCE, lo - 0.04));
  }
  return best;
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
