/**
 * GD-17 camera feel on the fixed scene camera (the roadster-rush pattern: `app.camera.fovKick` and `setRoll`):
 * a speed FOV kick of 0-6 deg over the scene FOV of 56 deg and a 1.5 deg roll into lane changes. Reduced motion: both 0
 * (PRD 6.3, presented FOV stays 56). Pure, so tests/unit/teleoperator/cameraFeel.test.ts reads it.
 */
export const FOV_KICK_MAX_DEG = 6;
export const LANE_ROLL_MAX_DEG = 1.5;
export const FOV_KICK_HALFLIFE_S = 0.18;
export const ROLL_HALFLIFE_S = 0.15;

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
