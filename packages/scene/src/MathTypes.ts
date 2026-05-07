import { Frustum, Matrix4, Quaternion, Vector3 } from "@galileo3d/math";

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];
export type PlaneTuple = [number, number, number, number];

export const EPSILON = 1e-8;

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return fromMathQuat(new Quaternion(x, y, z, w).normalize());
}

export function identityMat4(): Mat4 {
  return fromMathMat4(Matrix4.identity());
}

export function cloneMat4(value: Mat4): Mat4 {
  return [...value] as Mat4;
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return toMathVec3(a).add(toMathVec3(b)).toArray();
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return toMathVec3(a).subtract(toMathVec3(b)).toArray();
}

export function scaleVec3(a: Vec3, scalar: number): Vec3 {
  return toMathVec3(a).multiplyScalar(scalar).toArray();
}

export function lengthVec3(a: Vec3): number {
  return toMathVec3(a).length();
}

export function normalizeVec3(a: Vec3): Vec3 {
  return toMathVec3(a).normalize().toArray();
}

export function normalizeQuat(value: Quat): Quat {
  return fromMathQuat(toMathQuat(value).normalize());
}

export function quatFromEuler(x: number, y: number, z: number): Quat {
  const sx = Math.sin(x / 2);
  const cx = Math.cos(x / 2);
  const sy = Math.sin(y / 2);
  const cy = Math.cos(y / 2);
  const sz = Math.sin(z / 2);
  const cz = Math.cos(z / 2);
  return quat(
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  );
}

export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  return fromMathMat4(toMathMat4(a).multiply(toMathMat4(b)));
}

export function composeMat4(position: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  return fromMathMat4(Matrix4.compose(toMathVec3(position), toMathQuat(rotation), toMathVec3(scale)));
}

export function transformPoint(matrix: Mat4, point: Vec3): Vec3 {
  return toMathMat4(matrix).transformPoint(toMathVec3(point)).toArray();
}

export function invertMat4(matrix: Mat4): Mat4 {
  return fromMathMat4(toMathMat4(matrix).inverse());
}

export function perspectiveMat4(fovYRadians: number, aspect: number, near: number, far: number): Mat4 {
  return fromMathMat4(Matrix4.perspective(fovYRadians, aspect, near, far));
}

export function orthographicMat4(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
  return fromMathMat4(Matrix4.orthographic(left, right, bottom, top, near, far));
}

export function extractFrustumPlanes(viewProjection: Mat4): PlaneTuple[] {
  return Frustum.fromMatrix(toMathMat4(viewProjection)).planes.map((plane) => [
    plane.normal.x,
    plane.normal.y,
    plane.normal.z,
    plane.constant
  ]);
}

export function toMathVec3(value: Vec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

export function toMathQuat(value: Quat): Quaternion {
  return new Quaternion(value[0], value[1], value[2], value[3]);
}

export function toMathMat4(value: Mat4): Matrix4 {
  return new Matrix4(value);
}

export function fromMathMat4(value: Matrix4): Mat4 {
  return [...value.elements] as Mat4;
}

export function fromMathQuat(value: Quaternion): Quat {
  return [value.x, value.y, value.z, value.w];
}

export function decomposeMat4(matrix: Mat4): { position: Vec3; rotation: Quat; scale: Vec3 } {
  const position: Vec3 = [matrix[12], matrix[13], matrix[14]];
  const sx = Math.hypot(matrix[0], matrix[1], matrix[2]);
  const sy = Math.hypot(matrix[4], matrix[5], matrix[6]);
  const sz = Math.hypot(matrix[8], matrix[9], matrix[10]);
  if (sx <= EPSILON || sy <= EPSILON || sz <= EPSILON) throw new Error("Cannot decompose transform matrix with zero scale.");

  const m00 = matrix[0] / sx;
  const m01 = matrix[4] / sy;
  const m02 = matrix[8] / sz;
  const m10 = matrix[1] / sx;
  const m11 = matrix[5] / sy;
  const m12 = matrix[9] / sz;
  const m20 = matrix[2] / sx;
  const m21 = matrix[6] / sy;
  const m22 = matrix[10] / sz;
  const trace = m00 + m11 + m22;
  let rotation: Quat;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    rotation = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    rotation = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    rotation = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    rotation = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }

  return { position, rotation: normalizeQuat(rotation), scale: [sx, sy, sz] };
}
