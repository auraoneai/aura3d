/**
 * Orientation helpers. The engine composes a node's `rotation` as three.js
 * "ZYX" Euler angles (R = Rz·Ry·Rx), so placing an object on a track frame means
 * converting the frame's basis (local X forward, Y up, Z side, as the original's
 * `makeBasis(tangent, up, side)`) into those angles.
 */
import type { Vec3 } from "./vec3";

export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];
export type Euler3 = readonly [number, number, number];

/** Row-major 3×3 rotation whose columns are the basis vectors. */
export const basisMatrix = (x: Vec3, y: Vec3, z: Vec3): Mat3 => [
  x.x, y.x, z.x,
  x.y, y.y, z.y,
  x.z, y.z, z.z
];

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!;
    }
  }
  return out as unknown as Mat3;
}

/** Rotation by `angle` about the local X, Y or Z axis. */
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

export const basisToEulerZYX = (x: Vec3, y: Vec3, z: Vec3): Euler3 => matrixToEulerZYX(basisMatrix(x, y, z));

/** Rotation matrix the engine builds from a ZYX Euler triple (Rz·Ry·Rx). */
export function eulerZYXToMatrix([x, y, z]: Euler3): Mat3 {
  return multiplyMat3(axisRotation("z", z), multiplyMat3(axisRotation("y", y), axisRotation("x", x)));
}
