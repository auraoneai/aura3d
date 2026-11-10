/**
 * GD-17 / WP-08 camera feel & foreground lens clearance on the fixed scene camera:
 * - Speed FOV kick of 0–6 deg over the scene FOV of 56 deg and a 1.5 deg roll into lane changes (0 on reduced motion).
 * - Foreground lateral/scale clearance (`nearTrafficClearance`) when an adjacent passing car approaches within `3.2 m`
 *   of the camera lens so passing vehicles never slice across the bottom-right foreground viewport.
 */
import type { Vec3 } from "./rules";

export const FOV_KICK_MAX_DEG = 6;
export const LANE_ROLL_MAX_DEG = 1.5;
export const FOV_KICK_HALFLIFE_S = 0.18;
export const ROLL_HALFLIFE_S = 0.15;
export const NEAR_TRAFFIC_CLEAR_RADIUS_M = 3.6;

export interface CameraFeel {
  /** FOV offset in degrees, rounded to 0.1 so the kick is only re-set when it changes. */
  readonly fovKickDeg: number;
  /** Camera roll in radians (positive leans into a left steer). */
  readonly roll: number;
}

export function cameraFeel(o: { readonly speed: number; readonly maxSpeed: number; readonly steer: number; readonly motionOk: boolean }): CameraFeel {
  if (!o.motionOk) return { fovKickDeg: 0, roll: 0 };
  const t = Math.min(1, Math.max(0, o.speed / Math.max(1e-3, o.maxSpeed)));
  const fovKickDeg = Math.round(t * t * FOV_KICK_MAX_DEG * 10) / 10;
  const steer = Math.min(1, Math.max(-1, o.steer));
  const roll = Math.round(-steer * LANE_ROLL_MAX_DEG * (Math.PI / 180) * 1000) / 1000;
  return { fovKickDeg, roll };
}

/**
 * Presentation-only foreground lens clearance for passing traffic/rivals near `SCENE_CAM_POS`.
 * Cars inside `1.65 m` of the camera eye hide cleanly; cars between `1.65 m` and `3.6 m` glide slightly outward so their
 * rear quarter panel never clips the near plane or blocks the bottom-right speedometer/viewport.
 */
export function nearTrafficClearance(viewPos: Vec3, camPos: Vec3): { readonly x: number; readonly visible: boolean } {
  const dx = viewPos[0] - camPos[0];
  const dy = viewPos[1] + 0.9 - camPos[1];
  const dz = viewPos[2] - camPos[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1.65) return { x: viewPos[0], visible: false };
  if (dist >= NEAR_TRAFFIC_CLEAR_RADIUS_M) return { x: viewPos[0], visible: true };
  const t = 1 - (dist - 1.65) / (NEAR_TRAFFIC_CLEAR_RADIUS_M - 1.65);
  const push = t * t * 1.25 * (dx >= 0 ? 1 : -1);
  return { x: viewPos[0] + push, visible: true };
}
