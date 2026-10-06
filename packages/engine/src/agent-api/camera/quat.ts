/**
 * Minimal quaternion helpers for lane-08 camera/time modules (PRD-08).
 *
 * `packages/engine` does not depend on `@aura3d/math`, and importing the
 * `agent-api` barrel from submodules would create load-order cycles, so the
 * small amount of quaternion math needed by interpolation and rigs lives
 * here, engine-pure (no renderer, no DOM).
 */

import type { AuraVec3 } from "../index.js";

export type AuraQuat = readonly [number, number, number, number];

/** XYZ-intrinsic Euler → quaternion, matching `eulerToQuat` in `../index.ts`. */
export function quatFromEulerXYZ(rotation: AuraVec3): AuraQuat {
  const [x, y, z] = rotation;
  const cx = Math.cos(x / 2);
  const sx = Math.sin(x / 2);
  const cy = Math.cos(y / 2);
  const sy = Math.sin(y / 2);
  const cz = Math.cos(z / 2);
  const sz = Math.sin(z / 2);
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ];
}

/** Quaternion → XYZ-intrinsic Euler (radians). */
export function quatToEulerXYZ(q: AuraQuat): AuraVec3 {
  const [x, y, z, w] = q;
  // Rotation matrix elements needed for XYZ order.
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m23 = 2 * (y * z - x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const m32 = 2 * (y * z + x * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, m13)));
  // Near gimbal lock (|sin(y)| ≈ 1) use three.js's degenerate XYZ solution:
  // x = atan2(m32, m22), z = 0.
  if (Math.abs(m13) >= 0.9999999) {
    return [Math.atan2(m32, m22), pitch, 0];
  }
  return [Math.atan2(-m23, m33), pitch, Math.atan2(-m12, m11)];
}

/** Normalized quaternion slerp with the shortest-path sign fix. */
export function quatSlerp(a: AuraQuat, b: AuraQuat, t: number): AuraQuat {
  const clamped = Math.max(0, Math.min(1, t));
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    return quatNormalize([
      a[0] + (bx - a[0]) * clamped,
      a[1] + (by - a[1]) * clamped,
      a[2] + (bz - a[2]) * clamped,
      a[3] + (bw - a[3]) * clamped
    ]);
  }
  const theta = Math.acos(Math.min(1, dot));
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - clamped) * theta) / sinTheta;
  const wb = Math.sin(clamped * theta) / sinTheta;
  return [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb
  ];
}

export function quatNormalize(q: AuraQuat): AuraQuat {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len <= 0) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

/** Axis-angle quaternion; `axis` need not be normalized. */
export function quatFromAxisAngle(axis: AuraVec3, angle: number): AuraQuat {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len <= 0 || angle === 0) return [0, 0, 0, 1];
  const half = angle / 2;
  const s = Math.sin(half) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** q * p (apply p's rotation first, then q's). */
export function quatMultiply(q: AuraQuat, p: AuraQuat): AuraQuat {
  const [ax, ay, az, aw] = q;
  const [bx, by, bz, bw] = p;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}
