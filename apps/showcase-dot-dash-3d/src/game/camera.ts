// Glint Courier — aspect-aware camera fit. The rig keeps one viewing direction and pulls back along it until every
// outer wall corner of the 19x21 board projects inside the frame, so portrait phones see the whole maze too.
// Pure math (no engine imports) so the fit is unit-tested.

export type Vec3 = readonly [number, number, number];
export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
}

/** Board extent in world units: 19 x 21 tiles centred at the origin, wall tops at y = 0.65. */
export const BOARD_HALF_X = 9.5;
export const BOARD_HALF_Z = 10.5;
const WALL_TOP = 0.65;
/** Extra world units around the walls: the courier/sentry silhouettes and the follow offset. */
const BOARD_PAD = 0.6;

const BOARD_POINTS: readonly Vec3[] = (() => {
  const pts: Vec3[] = [];
  for (const x of [-BOARD_HALF_X - BOARD_PAD, BOARD_HALF_X + BOARD_PAD]) {
    for (const z of [-BOARD_HALF_Z - BOARD_PAD, BOARD_HALF_Z + BOARD_PAD]) {
      pts.push([x, 0, z], [x, WALL_TOP, z]);
    }
  }
  return pts;
})();

/** Normalised device coordinates of `p` for a camera at `pose` (y up), or null when `p` is behind the camera. */
export function projectNdc(pose: CameraPose, aspect: number, p: Vec3): readonly [number, number] | null {
  const [ex, ey, ez] = pose.position;
  const [tx, ty, tz] = pose.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward x up(0, 1, 0); up' = right x forward
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez;
  const depth = dx * fx + dy * fy + dz * fz;
  if (depth <= 1e-6) return null;
  const t = Math.tan((pose.fov * Math.PI) / 360);
  return [(dx * rx + dz * rz) / (depth * t * aspect), (dx * ux + dy * uy + dz * uz) / (depth * t)];
}

/** True when every board point projects within `margin` of the frame edge (|ndc| <= margin). */
export function boardFits(pose: CameraPose, aspect: number, margin = 0.96): boolean {
  for (const p of BOARD_POINTS) {
    const ndc = projectNdc(pose, aspect, p);
    if (!ndc || Math.abs(ndc[0]) > margin || Math.abs(ndc[1]) > margin) return false;
  }
  return true;
}

/** `base` pulled back along its own view direction by `k` (k = 1 is `base`). */
export function scalePose(base: CameraPose, k: number): CameraPose {
  const [px, py, pz] = base.position;
  const [tx, ty, tz] = base.target;
  return { position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k], target: base.target, fov: base.fov };
}

/**
 * Smallest pull-back factor k >= 1 at which the whole board fits the frame at `aspect`.
 * Desktop (16:9) needs about 1.1; a 390x844 phone (aspect 0.46) about 2.
 */
export function fitDistanceScale(base: CameraPose, aspect: number, margin = 0.96): number {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return 1;
  if (boardFits(base, aspect, margin)) return 1;
  let lo = 1, hi = 2;
  while (!boardFits(scalePose(base, hi), aspect, margin)) {
    hi *= 2;
    if (hi > 64) return hi;
  }
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (boardFits(scalePose(base, mid), aspect, margin)) hi = mid; else lo = mid;
  }
  return hi;
}
