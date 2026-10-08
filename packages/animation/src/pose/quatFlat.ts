/**
 * Internal flat-array quaternion/vec3 math for the pose pipeline — mirrors
 * three r185 `Quaternion.slerpFlat` / `multiplyQuaternionsFlat` so the
 * incremental blend order in PoseMixer stays within the 1e-4 parity bar.
 * All functions write into a caller-supplied flat array + offset: no
 * allocation in the hot path.
 */

/** three r185 `Quaternion.slerpFlat` — spherical (or near-linear) blend on flat arrays. */
export function slerpQuatFlat(
  dst: Float32Array | number[], dstOffset: number,
  a: Float32Array | number[] | readonly number[], aOffset: number,
  b: Float32Array | number[] | readonly number[], bOffset: number,
  t: number
): void {
  let ax = a[aOffset]!;
  let ay = a[aOffset + 1]!;
  let az = a[aOffset + 2]!;
  let aw = a[aOffset + 3]!;
  let bx = b[bOffset]!;
  let by = b[bOffset + 1]!;
  let bz = b[bOffset + 2]!;
  let bw = b[bOffset + 3]!;

  if (ax === bx && ay === by && az === bz && aw === bw) {
    dst[dstOffset] = ax; dst[dstOffset + 1] = ay; dst[dstOffset + 2] = az; dst[dstOffset + 3] = aw;
    return;
  }
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) {
    bx = -bx; by = -by; bz = -bz; bw = -bw;
    dot = -dot;
  }
  let s = 1 - t;
  if (dot < 0.9995) {
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    s = Math.sin(s * theta) / sin;
    t = Math.sin(t * theta) / sin;
    dst[dstOffset] = ax * s + bx * t;
    dst[dstOffset + 1] = ay * s + by * t;
    dst[dstOffset + 2] = az * s + bz * t;
    dst[dstOffset + 3] = aw * s + bw * t;
    return;
  }
  dst[dstOffset] = ax * s + bx * t;
  dst[dstOffset + 1] = ay * s + by * t;
  dst[dstOffset + 2] = az * s + bz * t;
  dst[dstOffset + 3] = aw * s + bw * t;
  normalizeQuatFlat(dst, dstOffset);
}

export function normalizeQuatFlat(q: Float32Array | number[], offset: number): void {
  const x = q[offset]!, y = q[offset + 1]!, z = q[offset + 2]!, w = q[offset + 3]!;
  const length = Math.sqrt(x * x + y * y + z * z + w * w);
  if (length <= 1e-9) {
    q[offset] = 0; q[offset + 1] = 0; q[offset + 2] = 0; q[offset + 3] = 1;
    return;
  }
  const inv = 1 / length;
  q[offset] = x * inv; q[offset + 1] = y * inv; q[offset + 2] = z * inv; q[offset + 3] = w * inv;
}

/** `dst = a * b` on flat quaternions (three r185 `multiplyQuaternionsFlat`). */
export function multiplyQuatFlat(
  dst: Float32Array, dstOffset: number,
  a: Float32Array | readonly number[], aOffset: number,
  b: Float32Array | readonly number[], bOffset: number
): void {
  const ax = a[aOffset]!, ay = a[aOffset + 1]!, az = a[aOffset + 2]!, aw = a[aOffset + 3]!;
  const bx = b[bOffset]!, by = b[bOffset + 1]!, bz = b[bOffset + 2]!, bw = b[bOffset + 3]!;
  dst[dstOffset] = ax * bw + aw * bx + ay * bz - az * by;
  dst[dstOffset + 1] = ay * bw + aw * by + az * bx - ax * bz;
  dst[dstOffset + 2] = az * bw + aw * bz + ax * by - ay * bx;
  dst[dstOffset + 3] = aw * bw - ax * bx - ay * by - az * bz;
}

/** Quaternion conjugate (inverse for unit quaternions) into a flat array. */
export function conjugateQuatFlat(
  dst: Float32Array, dstOffset: number,
  q: Float32Array | readonly number[], qOffset: number
): void {
  dst[dstOffset] = -q[qOffset]!;
  dst[dstOffset + 1] = -q[qOffset + 1]!;
  dst[dstOffset + 2] = -q[qOffset + 2]!;
  dst[dstOffset + 3] = q[qOffset + 3]!;
}

export function lerpVec3Flat(
  dst: Float32Array, dstOffset: number,
  a: Float32Array | readonly number[], aOffset: number,
  b: Float32Array | readonly number[], bOffset: number,
  t: number
): void {
  dst[dstOffset] = a[aOffset]! + (b[bOffset]! - a[aOffset]!) * t;
  dst[dstOffset + 1] = a[aOffset + 1]! + (b[bOffset + 1]! - a[aOffset + 1]!) * t;
  dst[dstOffset + 2] = a[aOffset + 2]! + (b[bOffset + 2]! - a[aOffset + 2]!) * t;
}
