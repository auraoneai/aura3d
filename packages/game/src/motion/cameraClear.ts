export type CameraVec3 = readonly [number, number, number];

export interface ClearEyeOptions {
  /** What the camera looks at (the rider, ball or car), already above the ground. */
  readonly focus: CameraVec3;
  /** Where the chase rig wants the eye. */
  readonly eye: CameraVec3;
  /** True when a point is inside solid space (a collider with margin, or below the floor). */
  readonly blocked: (x: number, y: number, z: number) => boolean;
  /** Never pull closer than this to the focus unless the focus itself is blocked. Default 2. */
  readonly minDistance?: number;
  /** Samples along the focus-to-eye segment. Default 24. */
  readonly samples?: number;
}

export interface ClearEye {
  readonly eye: [number, number, number];
  /** 1 when the wanted eye is clear, lower when the eye was pulled toward the focus. */
  readonly t: number;
}

/** Pulls the camera eye along the focus-to-eye segment to just before the first solid sample, so a chase camera never sits inside scenery. */
export function clearCameraEye(options: ClearEyeOptions): ClearEye {
  const { focus, eye, blocked } = options;
  const samples = Math.max(2, Math.trunc(options.samples ?? 24));
  const dx = eye[0] - focus[0], dy = eye[1] - focus[1], dz = eye[2] - focus[2];
  const length = Math.hypot(dx, dy, dz);
  const point = (t: number): [number, number, number] => [focus[0] + dx * t, focus[1] + dy * t, focus[2] + dz * t];
  if (length < 1e-6) return { eye: point(1), t: 1 };
  const tMin = Math.min(1, (options.minDistance ?? 2) / length);
  let clear = 0;
  let hit = -1;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const p = point(t);
    if (blocked(p[0], p[1], p[2])) { hit = t; break; }
    clear = t;
  }
  if (hit < 0) return { eye: point(1), t: 1 };
  let lo = clear, hi = hit;
  for (let i = 0; i < 6; i += 1) {
    const mid = (lo + hi) / 2;
    const p = point(mid);
    if (blocked(p[0], p[1], p[2])) hi = mid; else lo = mid;
  }
  const t = Math.max(Math.min(lo, 1), Math.min(tMin, 1));
  return { eye: point(t), t };
}

export interface CameraClearanceOptions {
  /** Exponential rate (1/s) at which the eye moves in when something blocks it. Default 18. */
  readonly pullRate?: number;
  /** Exponential rate (1/s) at which it moves back out once clear. Default 2. */
  readonly releaseRate?: number;
}

export interface CameraClearance {
  /** Smoothed clearance factor in (0, 1]: 1 means the full chase distance. */
  readonly factor: number;
  update(dt: number, options: ClearEyeOptions): [number, number, number];
  reset(): void;
}

/** Stateful wrapper: snaps in fast when blocked and eases back out, so the camera does not pop at a doorway. */
export function createCameraClearance(options: CameraClearanceOptions = {}): CameraClearance {
  const pullRate = options.pullRate ?? 18;
  const releaseRate = options.releaseRate ?? 2;
  let factor = 1;
  return {
    get factor() { return factor; },
    update(dt, eyeOptions) {
      const { t } = clearCameraEye(eyeOptions);
      const rate = t < factor ? pullRate : releaseRate;
      const k = dt > 0 ? 1 - Math.exp(-dt * rate) : 1;
      factor += (t - factor) * k;
      if (t >= 1 && factor > 0.9995) factor = 1;
      const f = eyeOptions.focus, e = eyeOptions.eye;
      const wanted = Math.min(factor, 1);
      const out: [number, number, number] = [f[0] + (e[0] - f[0]) * wanted, f[1] + (e[1] - f[1]) * wanted, f[2] + (e[2] - f[2]) * wanted];
      // The smoothed eye can lag behind a hard wall on the pull-in frame: never return a blocked point when a clear one exists.
      if (eyeOptions.blocked(out[0], out[1], out[2])) {
        const clear = clearCameraEye(eyeOptions);
        factor = Math.min(factor, clear.t);
        return clear.eye;
      }
      return out;
    },
    reset() { factor = 1; }
  };
}
