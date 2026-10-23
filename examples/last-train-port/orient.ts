/**
 * Orientation helpers. The engine composes a node's `rotation` as three.js "ZYX" Euler angles (R = Rz·Ry·Rx), so a
 * tram pose built as R = Ry(yaw)·Rx(-pitch)·Rz(roll) is converted to those angles per part.
 */
export type V3 = readonly [number, number, number];
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
  return out as unknown as Mat3;
}

export function axisRotation(axis: "x" | "y" | "z", angle: number): Mat3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  if (axis === "x") return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === "y") return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function applyMat3(m: Mat3, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

/** three.js `Euler.setFromRotationMatrix(m, "ZYX")`. */
export function matrixToEulerZYX(m: Mat3): V3 {
  const [m11, m12, , m21, m22, , m31, m32, m33] = m;
  const y = Math.asin(-Math.max(-1, Math.min(1, m31)));
  if (Math.abs(m31) < 0.9999999) return [Math.atan2(m32, m33), y, Math.atan2(m21, m11)];
  return [0, y, Math.atan2(-m12, m22)];
}

/** Tram pose matrix: local +Z forward, +Y up, +X side. */
export function tramRotation(forward: V3, rollAngle: number): Mat3 {
  const yaw = Math.atan2(forward[0], forward[2]);
  const pitch = Math.atan2(forward[1], Math.hypot(forward[0], forward[2]));
  return multiplyMat3(axisRotation("y", yaw), multiplyMat3(axisRotation("x", -pitch), axisRotation("z", rollAngle)));
}
