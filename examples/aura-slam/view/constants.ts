import type { Vec3 } from "../contract/units";

/** Render-space scale (sim units to scene units) and court geometry, verbatim from the live renderer adapter. */
export const COURT_X = 5.5;
export const COURT_Z = 8.0;
export const COURT_Y = 2.177;
export const SINGLES_X = 0.82 * COURT_X;
export const DOUBLES_X = 1.08 * COURT_X;
export const BASELINE_Z = 1.0 * COURT_Z;
export const SERVICE_Z = 0.52 * COURT_Z;
export const NET_POST_X = 1.08 * COURT_X;
export const NET_POST_H = (1.07 / 2.177) * COURT_Y;
export const HIDDEN_SCALE: Vec3 = [0.0001, 0.0001, 0.0001];
export const TRAIL_COUNT = 8;
export const MARK_COUNT = 8;
export const SPECTATOR_COUNT = 24;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
