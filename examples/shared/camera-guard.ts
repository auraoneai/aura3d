/**
 * Pure camera-pose guards for the chase games. A pose with a NaN or Infinity component, an eye on top of its target, an
 * up vector parallel to the view direction or a runaway field of view makes the view matrix degenerate, and the canvas
 * shows only the clear colour until the next good pose. Turning hard drives every one of those inputs at once (yaw rate,
 * lagging look target, rolled up vector, FOV kick), so the games pass the final pose through `guardPose` and keep the
 * smoothed look target within `limitLookLag` of where it is heading. No DOM, no clock.
 */

export type Vec3 = readonly [number, number, number];

export interface GuardPose {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly up: Vec3;
  readonly fov: number;
}

export const MIN_EYE_TARGET_DISTANCE = 0.75;
export const MIN_FOV = 20;
export const MAX_FOV = 110;

const isFinite3 = (v: Vec3): boolean => Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

/** The look target pulled toward `wanted` so it never trails it by more than `maxLag` metres (a sharp turn swings `wanted` far from a slow-smoothed target). Non-finite input snaps to `wanted`. */
export function limitLookLag(look: Vec3, wanted: Vec3, maxLag: number): [number, number, number] {
  if (!isFinite3(look)) return [wanted[0], wanted[1], wanted[2]];
  const dx = look[0] - wanted[0], dy = look[1] - wanted[1], dz = look[2] - wanted[2];
  const d = Math.hypot(dx, dy, dz);
  if (!(d > maxLag) || d === 0) return [look[0], look[1], look[2]];
  const s = maxLag / d;
  return [wanted[0] + dx * s, wanted[1] + dy * s, wanted[2] + dz * s];
}

/**
 * A pose safe to hand to the camera. Non-finite position/target/fov fall back to `last` (or, with no last good pose, to
 * `fallback`); a target closer than MIN_EYE_TARGET_DISTANCE to the eye is pushed out along the previous view direction;
 * an up vector that is not finite, zero or within about 1 degree of the view direction becomes world up; fov is clamped.
 */
export function guardPose(pose: GuardPose, last: GuardPose | null, fallback: GuardPose): GuardPose {
  const base = last ?? fallback;
  const position = isFinite3(pose.position) ? pose.position : base.position;
  let target = isFinite3(pose.target) ? pose.target : base.target;
  const fov = Number.isFinite(pose.fov) ? Math.min(MAX_FOV, Math.max(MIN_FOV, pose.fov)) : base.fov;
  let dir: [number, number, number] = [target[0] - position[0], target[1] - position[1], target[2] - position[2]];
  let dist = len(dir);
  if (dist < MIN_EYE_TARGET_DISTANCE) {
    const prev: [number, number, number] = [base.target[0] - base.position[0], base.target[1] - base.position[1], base.target[2] - base.position[2]];
    const pl = len(prev);
    const unit: [number, number, number] = pl > 1e-6 ? [prev[0] / pl, prev[1] / pl, prev[2] / pl] : [0, 0, -1];
    target = [position[0] + unit[0] * MIN_EYE_TARGET_DISTANCE, position[1] + unit[1] * MIN_EYE_TARGET_DISTANCE, position[2] + unit[2] * MIN_EYE_TARGET_DISTANCE];
    dir = [unit[0] * MIN_EYE_TARGET_DISTANCE, unit[1] * MIN_EYE_TARGET_DISTANCE, unit[2] * MIN_EYE_TARGET_DISTANCE];
    dist = MIN_EYE_TARGET_DISTANCE;
  }
  const verticalFallbackUp: Vec3 = Math.abs(dir[1] / dist) > 0.98 ? [0, 0, 1] : [0, 1, 0];
  let up: Vec3 = pose.up;
  const ul = isFinite3(up) ? len(up) : 0;
  if (ul < 1e-6) up = verticalFallbackUp;
  else {
    const cosAngle = Math.abs((up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2]) / (ul * dist));
    if (cosAngle > 0.9998) up = verticalFallbackUp;
  }
  return { position, target, up, fov };
}
