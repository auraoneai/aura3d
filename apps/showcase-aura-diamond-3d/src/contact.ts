export type V3 = readonly [number, number, number];

const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: V3): V3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

export interface BatContactInput {
  /** Bat long axis (unit, knob toward barrel). */
  readonly axis: V3;
  /** World velocity of the sweet spot in m/s (finite difference of the live bat). */
  readonly sweetVelocity: V3;
  /** World velocity of the incoming ball in m/s. */
  readonly ballVelocity: V3;
  /** Coefficient of restitution of the bat-ball collision. */
  readonly restitution?: number;
}

export interface BatContactResult {
  /** Face normal of the bat at contact (unit), pointing from the bat toward the ball's side. */
  readonly normal: V3;
  /** Outgoing ball velocity from a bat-plane reflection, m/s. */
  readonly velocity: V3;
  /** Speed of the bat's sweet spot along the face normal, m/s (0 when the bat is not moving). */
  readonly normalBatSpeed: number;
  /** Horizontal spray angle in degrees (0 = straight at the pitcher, positive toward +x). */
  readonly sprayDeg: number;
  /** Launch angle in degrees above horizontal. */
  readonly launchDeg: number;
}

/**
 * Where the ball goes when the moving bat meets it. The face normal is perpendicular to the bat axis inside the swing plane
 * (the plane spanned by the axis and the sweet-spot velocity); the ball reflects about that plane relative to the bat.
 * Returns null when the bat is not moving (no swing plane) or the geometry is degenerate.
 */
export function batContact(input: BatContactInput): BatContactResult | null {
  const e = input.restitution ?? 0.5;
  const axis = unit(input.axis);
  const v = input.sweetVelocity;
  if (len(v) < 0.5 || len(axis) < 0.5) return null;
  const planeNormal = unit(cross(axis, v));
  if (len(planeNormal) < 1e-6) return null;
  let normal = unit(cross(planeNormal, axis));
  if (dot(normal, v) < 0) normal = scale(normal, -1);
  const rel = sub(input.ballVelocity, v);
  const vn = dot(rel, normal);
  if (vn >= 0) return null;
  const out = sub(rel, scale(normal, (1 + e) * vn));
  const velocity: V3 = [out[0] + v[0], out[1] + v[1], out[2] + v[2]];
  const horizontal = Math.hypot(velocity[0], velocity[2]);
  return {
    normal,
    velocity,
    normalBatSpeed: dot(v, normal),
    sprayDeg: (Math.atan2(velocity[0], -velocity[2]) * 180) / Math.PI,
    launchDeg: (Math.atan2(velocity[1], horizontal) * 180) / Math.PI
  };
}

/** Blend a physical bat-derived angle into the game's timing-model angle (weight 0 keeps the model, 1 takes the bat). */
export function blendAngle(model: number, physical: number, weight: number): number {
  return model + (physical - model) * Math.max(0, Math.min(1, weight));
}

/** `blendAngle` with the result held within `maxDelta` degrees of the model angle. */
export function boundedBlend(model: number, physical: number, weight: number, maxDelta: number): number {
  const blended = blendAngle(model, physical, weight);
  return Math.max(model - maxDelta, Math.min(model + maxDelta, blended));
}
