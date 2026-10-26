// Ball orientation as a quaternion integrated from the angular velocity, exported as the engine's ZYX Euler (R = Rz·Ry·Rx).
// Separately accumulated rotX/rotZ drift apart once the ball changes direction; a quaternion keeps rolling consistent.

export type Quat = [number, number, number, number]; // x, y, z, w

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

/** q ← exp(ω·dt/2)·q with ω in world axes (rad/s). */
export function integrateQuat(q: Quat, wx: number, wy: number, wz: number, dt: number): Quat {
  const mag = Math.hypot(wx, wy, wz);
  const ang = mag * dt;
  if (ang < 1e-9) return q;
  const s = Math.sin(ang / 2) / mag, c = Math.cos(ang / 2);
  const dx = wx * s, dy = wy * s, dz = wz * s, dw = c;
  const [x, y, z, w] = q;
  const nx = dw * x + dx * w + dy * z - dz * y;
  const ny = dw * y - dx * z + dy * w + dz * x;
  const nz = dw * z + dx * y - dy * x + dz * w;
  const nw = dw * w - dx * x - dy * y - dz * z;
  const n = Math.hypot(nx, ny, nz, nw) || 1;
  return [nx / n, ny / n, nz / n, nw / n];
}

/** ZYX Euler [x, y, z] (matching Rz·Ry·Rx) for a unit quaternion. */
export function quatToEulerZYX(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z), m21 = 2 * (x * y + z * w);
  const m31 = 2 * (x * z - y * w), m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
  const m12 = 2 * (x * y - z * w), m22 = 1 - 2 * (x * x + z * z);
  const ey = Math.asin(Math.max(-1, Math.min(1, -m31)));
  if (Math.abs(m31) < 0.999999) return [Math.atan2(m32, m33), ey, Math.atan2(m21, m11)];
  return [0, ey, Math.atan2(-m12, m22)];
}

/** Rotation matrix Rz(z)·Ry(y)·Rx(x), row-major — the engine's "ZYX" node rotation. */
export function eulerZYXMatrix(x: number, y: number, z: number): number[] {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx
  ];
}

export function quatMatrix(q: Quat): number[] {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
  ];
}
