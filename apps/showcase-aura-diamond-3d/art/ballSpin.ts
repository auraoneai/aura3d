/**
 * Aura Diamond 3D: visible ball spin. The ball turns about the axis perpendicular to its travel (backspin-style for a fly
 * ball, topspin for a grounder rolling along the turf), at a rate from its speed capped to what reads on screen
 * (`MAX_REV_PER_S`); a ball at rest or held in a glove keeps its last orientation. Returns ZYX Euler angles for the ball node.
 * Pure (no engine imports): presentation only, the sim never reads it.
 */
type V3 = readonly [number, number, number];
type Q = [number, number, number, number];

export const BALL_RADIUS = 0.075;
export const MAX_REV_PER_S = 7;

const qMul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];

/** ZYX Euler (x, y, z radians) of a unit quaternion — the node's rotation order. */
export function quatToEulerZYX(q: Q): [number, number, number] {
  const [x, y, z, w] = q;
  const sinp = 2 * (w * y - z * x);
  return [
    Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
    Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp),
    Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
  ];
}

export class BallSpin {
  private q: Q = [0, 0, 0, 1];
  private prev: V3 | null = null;
  /** total angle turned (radians), for tests and QA */
  angle = 0;
  step(pos: V3, dt: number, held = false): [number, number, number] {
    const prev = this.prev;
    this.prev = [pos[0], pos[1], pos[2]];
    if (!prev || held || dt <= 0) return quatToEulerZYX(this.q);
    const d: V3 = [pos[0] - prev[0], pos[1] - prev[1], pos[2] - prev[2]];
    const dist = Math.hypot(d[0], d[1], d[2]);
    // teleports (a new pitch, a reset) are not travel
    if (dist < 1e-5 || dist > 8) return quatToEulerZYX(this.q);
    // roll axis: horizontal, perpendicular to the travel (a vertical drop spins about the last axis)
    let ax: V3 = [d[2], 0, -d[0]];
    const al = Math.hypot(ax[0], ax[2]);
    if (al < 1e-6) ax = [1, 0, 0];
    else ax = [ax[0] / al, 0, ax[2] / al];
    const turn = Math.min(dist / BALL_RADIUS, MAX_REV_PER_S * 2 * Math.PI * dt);
    const h = turn / 2, s = Math.sin(h);
    this.q = qMul([ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(h)], this.q);
    const l = Math.hypot(...this.q);
    this.q = [this.q[0] / l, this.q[1] / l, this.q[2] / l, this.q[3] / l];
    this.angle += turn;
    return quatToEulerZYX(this.q);
  }
}
