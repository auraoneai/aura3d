/**
 * Orientation helpers. The engine composes a node's `rotation` as three.js "ZYX" Euler angles (R = Rz·Ry·Rx), so
 * placing an object on a track frame means converting the frame's basis (local X forward, Y up, Z side) into them.
 */
export type V3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Euler3 = readonly [number, number, number];

export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Row-major 3×3 rotation whose columns are the basis vectors. */
export const basisMatrix = (x: V3, y: V3, z: V3): Mat3 => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  }
  return out as unknown as Mat3;
}

export function axisRotation(axis: "x" | "y" | "z", angle: number): Mat3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** three.js `Euler.setFromRotationMatrix(m, "ZYX")`. */
export function matrixToEulerZYX(m: Mat3): Euler3 {
  const [m11, m12, , m21, m22, , m31, m32, m33] = m;
  const y = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), y, Math.atan2(m21, m11)];
  return [0, y, Math.atan2(-m12, m22)];
}

/**
 * Drone attitude: forward from heading `theta` off the track tangent, `pitch` climb angle, `roll` lean about the
 * forward axis. Mirrors the original's `jE()` (forward = normalize(tangent·cosθ + right·sinθ, tan(pitch)), side = forward × up).
 */
export function droneEuler(frame: { tx: number; tz: number; rx: number; rz: number }, theta: number, pitch: number, roll: number): Euler3 {
  const c = Math.cos(theta), s = Math.sin(theta);
  const f = normalize([frame.tx * c + frame.rx * s, Math.tan(pitch), frame.tz * c + frame.rz * s]);
  const side = normalize(cross(f, [0, 1, 0]));
  const up = normalize(cross(side, f));
  return matrixToEulerZYX(multiplyMat3(basisMatrix(f, up, side), axisRotation("x", roll)));
}
