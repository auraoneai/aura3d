/** The track centerline and its frames (pure maths, shared by the renderer and the game layer). */
export type V3 = readonly [number, number, number];

/** Original `Hf` for the `journey` kind: the track centerline at distance `s`. */
export function centerline(s: number): V3 {
  const x = 14 * Math.sin(s * 9e-3) + 5 * Math.sin(s * 0.026);
  const t = Math.min(s, 1880) + Math.max(0, s - 1880) * 0.15;
  return [x, 70 - t * 0.032 + 3 * Math.sin(t * 0.014), -s];
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface Frame { point: V3; forward: V3; right: V3; up: V3 }
/** Original `Gf`/`Kf` for the journey kind (no banking outside walls): frame at `s`, offset by `lane`. */
export function frameAt(s: number, lane = 0): Frame {
  const forward = norm(sub(centerline(s + 0.4), centerline(s - 0.4)));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = norm(cross(right, forward));
  const c = centerline(s);
  return { point: [c[0] + right[0] * lane, c[1] + right[1] * lane, c[2] + right[2] * lane], forward, right, up };
}
/** Point at `s`, lateral `lane`, lifted `lift` along the frame's up. */
export function at(s: number, lane: number, lift = 0): V3 {
  const f = frameAt(s, lane);
  return [f.point[0] + f.up[0] * lift, f.point[1] + f.up[1] * lift, f.point[2] + f.up[2] * lift];
}
export const add3 = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
